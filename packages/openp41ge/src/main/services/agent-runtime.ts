/**
 * AgentRuntime — the provider-agnostic agent loop.
 *
 * `send(chatId, winId, userText, cwd?)`:
 *   1. persist the user message,
 *   2. build the provider request (system prompt + history + tool defs),
 *   3. stream deltas from the provider, folding text into the assistant reply
 *      and accumulating tool calls,
 *   4. execute accumulated tool calls (looping back to the provider, guarded by
 *      a max-turns bound),
 *   5. persist + broadcast mutations and forward incremental deltas to the
 *      owning window.
 *
 * The runtime depends only on abstractions (ChatProviderRegistry, ToolRegistry,
 * ChatStoreService) and a small hooks object for IPC fan-out — it never touches
 * Electron directly (Dependency Inversion).
 */

import { createLogger } from "openp41ge-logger";
import type { ChatMessage, ChatRuntimeStatus } from "openp41ge-agents";
import type { AgentRuntimeHooks } from "./agent-runtime-hooks.js";
import type {
  ChatProvider,
  ChatProviderConfig,
  ProviderDelta,
} from "../interfaces/chat-provider.js";
import type { ChatStoreService } from "./chat-store-service.js";
import type { ChatProviderRegistry } from "./chat-provider-registry.js";
import type { ToolRegistry } from "./tool-registry.js";
import { AGENT_MAX_TURNS } from "openp41ge-constants";

const log = createLogger("openp41ge", "AgentRuntime");

const DEFAULT_SYSTEM_PROMPT =
  "You are a helpful coding agent inside Openp41ge. You can use tools to read files, " +
  "search, and run commands. When you use a tool, explain briefly what you found. " +
  "Be concise.";

export interface AgentRuntimeConfig {
  /** Resolve the persisted config for a provider id, or null when unconfigured. */
  getProviderConfig(providerId: string): ChatProviderConfig | null;
}

/** A tool call accumulated from streamed deltas, awaiting execution. */
interface PendingToolCall {
  id: string;
  name: string;
  arguments: string;
}

export class AgentRuntime {
  private readonly _active = new Map<string, AbortController>();
  private readonly _streaming = new Set<string>();

  constructor(
    private readonly _store: ChatStoreService,
    private readonly _providers: ChatProviderRegistry,
    private readonly _tools: ToolRegistry,
    private readonly _hooks: AgentRuntimeHooks,
    private readonly _config: AgentRuntimeConfig,
  ) {}

  isStreaming(chatId: string): boolean {
    return this._streaming.has(chatId);
  }

  async send(chatId: string, winId: string, userText: string, cwd?: string): Promise<void> {
    const text = userText.trim();
    if (!text) return;
    if (this._streaming.has(chatId)) return;

    const chat = this._store.get(chatId);
    if (!chat) return;

    this._streaming.add(chatId);
    const controller = new AbortController();
    this._active.set(chatId, controller);

    this._setStatus(winId, chatId, { streaming: true, providerOk: null });

    try {
      // 1. Persist the user message.
      this._store.appendMessage(chatId, {
        id: this._id("msg"),
        role: "user",
        content: text,
      });
      this._hooks.broadcast("chat:changed", {});

      // 2. Resolve the provider factory + config.
      const providerId = chat.providerId || this._providers.defaultId || "";
      const factory = this._providers.get(providerId);
      const providerConfig = this._config.getProviderConfig(providerId);

      if (!factory) {
        this._store.appendMessage(chatId, {
          id: this._id("msg"),
          role: "assistant",
          content: "[not configured] No agent provider configured.",
        });
        this._setStatus(winId, chatId, { streaming: false, providerOk: false });
        this._hooks.broadcast("chat:changed", {});
        return;
      }
      if (!providerConfig) {
        this._store.appendMessage(chatId, {
          id: this._id("msg"),
          role: "assistant",
          content: "[not configured] Agent provider not configured. Open ⚙ Agent to set it up.",
        });
        this._setStatus(winId, chatId, { streaming: false, providerOk: false });
        this._hooks.broadcast("chat:changed", {});
        return;
      }
      if (!providerConfig.model) {
        this._store.appendMessage(chatId, {
          id: this._id("msg"),
          role: "assistant",
          content:
            "[not configured] Agent provider has no model configured. Open ⚙ Agent to set one.",
        });
        this._setStatus(winId, chatId, { streaming: false, providerOk: false });
        this._hooks.broadcast("chat:changed", {});
        return;
      }

      const provider = factory.create(providerConfig);
      const ping = await provider.ping();
      this._setStatus(winId, chatId, { streaming: true, providerOk: ping });

      // 3. Agent loop.
      await this._runLoop(chatId, winId, provider, controller.signal, cwd);

      this._setStatus(winId, chatId, { streaming: false, providerOk: ping });
    } catch (err) {
      log.error("agent send error:", err);
      if (!controller.signal.aborted) {
        this._store.appendMessage(chatId, {
          id: this._id("msg"),
          role: "assistant",
          content: `[error] ${(err as Error).message}`,
        });
        this._setStatus(winId, chatId, { streaming: false, providerOk: false });
      }
    } finally {
      this._streaming.delete(chatId);
      this._active.delete(chatId);
      this._hooks.broadcast("chat:changed", {});
    }
  }

  async abort(chatId: string): Promise<void> {
    const controller = this._active.get(chatId);
    if (!controller) return;
    controller.abort();
    this._store.setLastToolCallStatus(chatId, "error", "interrupted");
    const winId = this._store.getOpenWin(chatId);
    if (winId) {
      this._setStatus(winId, chatId, { streaming: false, providerOk: null });
    }
    this._hooks.broadcast("chat:changed", {});
  }

  private async _runLoop(
    chatId: string,
    winId: string,
    provider: ChatProvider,
    signal: AbortSignal,
    cwd?: string,
  ): Promise<void> {
    let turns = 0;
    while (!signal.aborted && turns < AGENT_MAX_TURNS) {
      turns += 1;
      const chat = this._store.get(chatId);
      if (!chat) return;

      const system: ChatMessage = {
        id: this._id("sys"),
        role: "system",
        content: DEFAULT_SYSTEM_PROMPT,
        timestamp: Date.now(),
      };
      const requestMessages: ChatMessage[] = [system, ...chat.messages];

      let toolCalls: PendingToolCall[] = [];
      let currentAssistant: ChatMessage | null = null;

      for await (const delta of provider.streamChat({
        messages: requestMessages,
        tools: this._tools.definitions(),
        signal,
      })) {
        if (signal.aborted) break;
        if (delta.type === "text" && delta.text) {
          if (!currentAssistant) currentAssistant = this._beginAssistant(chatId);
          this._store.updateMessage(chatId, currentAssistant.id, (m) => {
            m.content = (m.content ?? "") + delta.text;
          });
          this._hooks.sendToWindow(winId, "chat:delta", { chatId, delta: delta.text });
        } else if (delta.type === "tool_call") {
          toolCalls = this._mergeTool(toolCalls, delta);
          if (!currentAssistant) currentAssistant = this._beginAssistant(chatId);
          this._upsertToolCall(chatId, winId, currentAssistant.id, delta);
        }
      }

      if (signal.aborted) return;

      if (toolCalls.length === 0) return;

      // Execute accumulated tool calls and feed results back to the provider.
      for (const tc of toolCalls) {
        if (signal.aborted) break;
        const result = await this._tools.execute(tc.name, parseArgs(tc.arguments), { cwd });
        const chatNow = this._store.get(chatId);
        if (!chatNow) break;
        const tool = chatNow.messages.flatMap((m) => m.toolCalls ?? []).find((t) => t.id === tc.id);
        if (!tool) break;
        this._store.updateToolCall(chatId, tc.id, (t) => {
          t.status = result.error ? "error" : "done";
          if (result.error) t.error = result.error;
        });
        this._store.appendMessage(chatId, {
          id: this._id("msg"),
          role: "tool",
          toolCallId: tc.id,
          content: result.error ? result.error : result.content,
        });
        const updated = this._store.get(chatId);
        const updatedTool = updated?.messages
          .flatMap((m) => m.toolCalls ?? [])
          .find((t) => t.id === tc.id);
        if (updatedTool)
          this._hooks.sendToWindow(winId, "chat:tool", { chatId, toolCall: updatedTool });
      }

      if (signal.aborted) return;
      this._hooks.broadcast("chat:changed", {});
    }
  }

  private _beginAssistant(chatId: string): ChatMessage {
    const assistant: ChatMessage = {
      id: this._id("msg"),
      role: "assistant",
      content: "",
      timestamp: Date.now(),
    };
    this._store.appendMessage(chatId, { id: assistant.id, role: "assistant", content: "" });
    return assistant;
  }

  private _mergeTool(
    pending: PendingToolCall[],
    delta: ProviderDelta & { type: "tool_call" },
  ): PendingToolCall[] {
    const existing = pending.find((t) => t.id === delta.id);
    if (existing) {
      if (delta.name) existing.name = delta.name;
      if (delta.arguments) existing.arguments = delta.arguments; // accumulated args
      return pending;
    }
    return [...pending, { id: delta.id, name: delta.name, arguments: delta.arguments }];
  }

  private _upsertToolCall(
    chatId: string,
    winId: string,
    assistantId: string,
    delta: { id: string; name: string; arguments: string },
  ): void {
    this._store.updateMessage(chatId, assistantId, (m) => {
      const existing = m.toolCalls?.find((t) => t.id === delta.id);
      if (existing) {
        existing.arguments = delta.arguments || existing.arguments;
        if (delta.name) existing.name = delta.name;
      } else {
        m.toolCalls = [
          ...(m.toolCalls ?? []),
          { id: delta.id, name: delta.name, arguments: delta.arguments, status: "running" },
        ];
      }
    });
    const chat = this._store.get(chatId);
    const tool = chat?.messages.flatMap((m) => m.toolCalls ?? []).find((t) => t.id === delta.id);
    if (tool) this._hooks.sendToWindow(winId, "chat:tool", { chatId, toolCall: tool });
  }

  private _setStatus(winId: string, chatId: string, status: ChatRuntimeStatus): void {
    this._hooks.sendToWindow(winId, "chat:status", { chatId, status });
  }

  private _id(prefix: string): string {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }
}

/** Parse a raw arguments string (JSON or plain text) into a record. */
function parseArgs(raw: string): Record<string, unknown> {
  const trimmed = raw.trim();
  if (!trimmed) return {};
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // not JSON — fall through
  }
  return { command: trimmed };
}
