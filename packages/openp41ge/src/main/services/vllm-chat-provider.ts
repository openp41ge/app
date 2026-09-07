/**
 * VllmChatProvider — OpenAI-compatible `/v1/chat/completions` SSE provider
 * for a local vLLM server.
 *
 * Reads the SSE stream line by line, parses `data:` JSON chunks, and yields:
 *   - `text` deltas for streaming assistant content,
 *   - `tool_call` deltas accumulated per tool-call index (arguments streamed
 *     as fragments are merged before being emitted).
 *
 * `ping()` probes `/v1/models` so the UI can show "connecting…" vs
 * "unreachable — configure in ⚙ Agent".
 */

import type {
  ChatProvider,
  ChatProviderConfig,
  ChatStreamRequest,
  ProviderDelta,
} from "../interfaces/chat-provider.js";
import type { ToolDefinition } from "../interfaces/tool.js";
import type { ChatMessage } from "openp41ge-agents";
import { createLogger } from "openp41ge-logger";

const log = createLogger("openp41ge", "VllmChatProvider");

/** Convert our chat messages to the OpenAI chat-completions wire format. */
export function toOpenAIMessages(messages: ChatMessage[]): Array<Record<string, unknown>> {
  return messages.map((m) => {
    if (m.role === "system") {
      return { role: "system", content: m.content ?? "" };
    }
    if (m.role === "user") {
      return { role: "user", content: m.content ?? "" };
    }
    if (m.role === "assistant") {
      const out: Record<string, unknown> = { role: "assistant", content: m.content ?? "" };
      if (m.toolCalls && m.toolCalls.length > 0) {
        out.tool_calls = m.toolCalls.map((tc) => ({
          id: tc.id,
          type: "function",
          function: {
            name: tc.name,
            arguments:
              typeof tc.arguments === "string" ? tc.arguments : JSON.stringify(tc.arguments),
          },
        }));
      }
      return out;
    }
    // role === "tool"
    return {
      role: "tool",
      tool_call_id: m.toolCallId,
      content: m.content ?? "",
    };
  });
}

function toOpenAITools(tools: ToolDefinition[]): Array<Record<string, unknown>> {
  return tools.map((t) => ({
    type: "function",
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }));
}

/** Accumulator for one in-progress streaming tool call (index-keyed). */
interface ToolAccumulator {
  id: string;
  name: string;
  arguments: string;
}

export class VllmChatProvider implements ChatProvider {
  readonly id = "vllm";
  readonly label = "vLLM";

  constructor(private _config: ChatProviderConfig) {}

  async ping(): Promise<boolean> {
    try {
      const res = await fetch(`${this._baseUrl()}/models`, {
        signal: AbortSignal.timeout(3000),
      });
      if (!res.ok) return false;
      const data = (await res.json()) as { data?: unknown[] };
      return Array.isArray(data.data);
    } catch (err) {
      log.warn("ping failed:", (err as Error).message);
      return false;
    }
  }

  async *streamChat(req: ChatStreamRequest): AsyncIterable<ProviderDelta> {
    const body: Record<string, unknown> = {
      model: this._config.model,
      messages: toOpenAIMessages(req.messages),
      stream: true,
    };
    if (this._config.temperature !== undefined) body.temperature = this._config.temperature;
    if (this._config.maxTokens !== undefined) body.max_tokens = this._config.maxTokens;
    if (req.tools && req.tools.length > 0) {
      body.tools = toOpenAITools(req.tools);
      body.tool_choice = "auto";
    }

    let res: Response;
    try {
      res = await fetch(`${this._baseUrl()}/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(this._config.apiKey ? { authorization: `Bearer ${this._config.apiKey}` } : {}),
        },
        body: JSON.stringify(body),
        signal: req.signal,
      });
    } catch (err) {
      const msg = (err as Error).message;
      if (req.signal?.aborted) return;
      log.error("stream request failed:", msg);
      yield { type: "text", text: `[provider error: ${msg}]` };
      return;
    }

    if (!res.ok || !res.body) {
      const text = await res.text().catch(() => "");
      const msg = `vLLM returned ${res.status}: ${text.slice(0, 200)}`;
      log.error(msg);
      yield { type: "text", text: `[provider error: ${msg}]` };
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    const toolAccumulators = new Map<number, ToolAccumulator>();
    let buffer = "";
    let done = false;

    try {
      while (!done) {
        const { value, done: readerDone } = await reader.read();
        if (readerDone) break;
        buffer += decoder.decode(value, { stream: true });

        // Split on newlines; keep the trailing partial line in buffer.
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;
          const data = trimmed.slice(5).trim();
          if (data === "[DONE]") {
            done = true;
            break;
          }
          let chunk: unknown;
          try {
            chunk = JSON.parse(data);
          } catch {
            continue;
          }
          yield* this._emitChunk(chunk, toolAccumulators);
        }
      }
    } catch (err) {
      if (!req.signal?.aborted) {
        log.error("stream read error:", (err as Error).message);
      }
    } finally {
      try {
        reader.releaseLock();
      } catch {
        // ignore
      }
    }
  }

  private _baseUrl(): string {
    return this._config.baseUrl.replace(/\/$/, "");
  }

  /** Parse one SSE chunk into deltas, mutating/reading the tool accumulator. */
  private *_emitChunk(
    chunk: unknown,
    toolAccumulators: Map<number, ToolAccumulator>,
  ): Generator<ProviderDelta> {
    const c = chunk as {
      choices?: Array<{
        delta?: { content?: string | null; tool_calls?: Array<Record<string, unknown>> };
      }>;
    };
    const choice = c.choices?.[0];
    if (!choice) return;
    const delta = choice.delta;
    if (!delta) return;

    if (typeof delta.content === "string" && delta.content.length > 0) {
      yield { type: "text", text: delta.content };
    }

    if (Array.isArray(delta.tool_calls)) {
      for (const tc of delta.tool_calls) {
        const index = typeof tc.index === "number" ? tc.index : 0;
        const fn = (tc.function ?? {}) as { name?: string; arguments?: string };
        let acc = toolAccumulators.get(index);
        if (!acc) {
          acc = { id: "", name: "", arguments: "" };
          toolAccumulators.set(index, acc);
        }
        if (typeof tc.id === "string") acc.id = tc.id;
        if (typeof fn.name === "string" && fn.name) acc.name = fn.name;
        if (typeof fn.arguments === "string" && fn.arguments) {
          acc.arguments += fn.arguments;
        }
        // Only emit once we have a name to reference (arguments may stream as
        // fragments; we emit the accumulated value so the runtime can update).
        if (acc.name) {
          yield { type: "tool_call", id: acc.id, name: acc.name, arguments: acc.arguments };
        }
      }
    }
  }
}
