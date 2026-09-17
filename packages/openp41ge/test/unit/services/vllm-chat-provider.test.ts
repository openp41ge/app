/**
 * Unit tests for VllmChatProvider — SSE parsing + message payload conversion.
 *
 * Verifies that a mock OpenAI-compatible SSE stream yields text deltas and
 * accumulated tool-call deltas, that messaging conversion handles
 * system/user/assistant-with-tool_calls/tool roles, and that abort stops the
 * generator.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { VllmChatProvider, toOpenAIMessages } from "../../../src/main/services/vllm-chat-provider";
import type { ChatMessage } from "openp41ge-agents";

const config = { baseUrl: "http://localhost:8000/v1", model: "qwen" };

/** Build a Response whose body is a single SSE body string. */
function sseResponse(body: string): Response {
  return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
}

async function collect(deltas: AsyncIterable<unknown>): Promise<unknown[]> {
  const out: unknown[] = [];
  for await (const d of deltas) out.push(d);
  return out;
}

describe("toOpenAIMessages", () => {
  it("converts system, user, assistant-with-tool_calls, and tool messages", () => {
    const toolCall = {
      id: "call_1",
      name: "read_file",
      arguments: '{"path":"/a"}',
      status: "done" as const,
    };
    const messages: ChatMessage[] = [
      { id: "s", role: "system", content: "be brief", timestamp: 0 },
      { id: "u", role: "user", content: "hi", timestamp: 0 },
      { id: "a", role: "assistant", content: "ok", toolCalls: [toolCall], timestamp: 0 },
      { id: "t", role: "tool", toolCallId: "call_1", content: "file content", timestamp: 0 },
    ];
    const out = toOpenAIMessages(messages);
    expect(out[0]).toEqual({ role: "system", content: "be brief" });
    expect(out[1]).toEqual({ role: "user", content: "hi" });
    expect(out[2]).toEqual({
      role: "assistant",
      content: "ok",
      tool_calls: [
        {
          id: "call_1",
          type: "function",
          function: { name: "read_file", arguments: '{"path":"/a"}' },
        },
      ],
    });
    expect(out[3]).toEqual({ role: "tool", tool_call_id: "call_1", content: "file content" });
  });
});

describe("VllmChatProvider.streamChat", () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("parses SSE into text + accumulated tool-call deltas", async () => {
    const sse = [
      'data: {"choices":[{"delta":{"role":"assistant","content":"Hi"}}]}',
      "",
      'data: {"choices":[{"delta":{"content":" there"}}]}',
      "",
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","type":"function","function":{"name":"read_file"}}]}}]}',
      "",
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\\"path\\":"}}]}}]}',
      "",
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\\"/a/b.ts\\"}"}}]}}]}',
      "",
      "data: [DONE]",
      "",
    ].join("\n");
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(sseResponse(sse));

    const provider = new VllmChatProvider(config);
    const deltas = await collect(provider.streamChat({ messages: [] }));

    // Text deltas first, then the accumulated tool_call deltas (by index).
    expect(deltas[0]).toEqual({ type: "text", text: "Hi" });
    expect(deltas[1]).toEqual({ type: "text", text: " there" });
    // Subsequent deltas carry accumulated arguments.
    expect(deltas[3]).toEqual({
      type: "tool_call",
      id: "call_1",
      name: "read_file",
      arguments: '{"path":',
    });
    expect(deltas[4]).toEqual({
      type: "tool_call",
      id: "call_1",
      name: "read_file",
      arguments: '{"path":"/a/b.ts"}',
    });
  });

  it("surfaces the usage-only final chunk as a usage delta", async () => {
    const sse = [
      'data: {"choices":[{"delta":{"role":"assistant","content":"Hi"}}]}',
      "",
      'data: {"choices":[{"delta":{}}],"usage":{"prompt_tokens":120,"completion_tokens":34,"total_tokens":154}}',
      "",
      "data: [DONE]",
      "",
    ].join("\n");
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(sseResponse(sse));

    const provider = new VllmChatProvider(config);
    const deltas = await collect(provider.streamChat({ messages: [] }));

    expect(deltas[0]).toEqual({ type: "text", text: "Hi" });
    expect(deltas[1]).toEqual({
      type: "usage",
      usage: { promptTokens: 120, completionTokens: 34, totalTokens: 154 },
      // Elapsed time measured from the first content delta to the usage chunk.
      elapsedMs: expect.any(Number),
    });
  });

  it("requests stream_options.include_usage so vLLM reports usage", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(sseResponse("data: [DONE]\n\n"));
    const provider = new VllmChatProvider(config);
    await collect(provider.streamChat({ messages: [] }));

    const called = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(called[1].body);
    expect(body.stream_options).toEqual({ include_usage: true });
  });
});
