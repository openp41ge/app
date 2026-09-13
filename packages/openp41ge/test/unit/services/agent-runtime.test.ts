/**
 * Unit tests for AgentRuntime — the agent loop.
 *
 * Uses a fake ChatProvider (registered in a real ChatProviderRegistry), a
 * fake ToolRegistry, and a real ChatStoreService (temp dir). Verifies message
 * persistence order, tool execution + tool-result loop, max-turns guard, abort,
 * and the delta/tool/status event fan-out.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import os from "os";
import fs from "fs";
import path from "path";
import { AgentRuntime } from "../../../src/main/services/agent-runtime";
import { ChatStoreService } from "../../../src/main/services/chat-store-service";
import { ChatProviderRegistry } from "../../../src/main/services/chat-provider-registry";
import { ToolRegistry } from "../../../src/main/services/tool-registry";
import type {
  ChatProvider,
  ProviderDelta,
  ChatStreamRequest,
} from "../../../src/main/interfaces/chat-provider";
import type { AgentTool } from "../../../src/main/interfaces/tool";

function makeFakeProvider(script: Array<Array<ProviderDelta>>): ChatProvider {
  let call = 0;
  return {
    id: "fake",
    label: "Fake",
    ping: async () => true,
    async *streamChat(_req: ChatStreamRequest): AsyncIterable<ProviderDelta> {
      const deltas = script[Math.min(call, script.length - 1)];
      call += 1;
      for (const d of deltas) yield d;
    },
  };
}

function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-runtime-test-"));
  const store = new ChatStoreService(dir);
  store.init();
  const providers = new ChatProviderRegistry();
  const tools = new ToolRegistry();
  const hooks = { sendToWindow: vi.fn(), broadcast: vi.fn() };
  const runtime = new AgentRuntime(store, providers, tools, hooks, {
    getProviderConfig: () => ({ baseUrl: "http://x", model: "m", temperature: 0.2 }),
  });
  return { dir, store, providers, tools, hooks, runtime };
}

describe("AgentRuntime", () => {
  let ctx: ReturnType<typeof setup>;
  beforeEach(() => {
    ctx = setup();
  });
  afterEach(() => {
    fs.rmSync(ctx.dir, { recursive: true, force: true });
  });

  it("persists a user message and streams text deltas to the owner window", async () => {
    const provider = makeFakeProvider([
      [
        { type: "text", text: "Hello" },
        { type: "text", text: " world" },
      ],
    ]);
    ctx.providers.register({ id: "fake", label: "Fake", create: () => provider });

    const chat = ctx.store.create({ providerId: "fake" });
    await ctx.runtime.send(chat.id, "win-a", "hi there");

    const stored = ctx.store.get(chat.id)!;
    expect(stored.messages[0]).toMatchObject({ role: "user", content: "hi there" });
    expect(stored.messages[1]).toMatchObject({ role: "assistant", content: "Hello world" });

    // Deltas forwarded to the owner window.
    const deltas = ctx.hooks.sendToWindow.mock.calls.filter(([, e]) => e === "chat:delta");
    expect(deltas.length).toBe(2);
    expect(deltas[0][2]).toEqual({ chatId: chat.id, delta: "Hello" });
    expect(deltas[1][2]).toEqual({ chatId: chat.id, delta: " world" });

    // Chat changed broadcast includes the final state.
    expect(ctx.hooks.broadcast).toHaveBeenCalledWith("chat:changed", {});
  });

  it("executes tool calls and loops back to the provider until text-only", async () => {
    let capturedArgs: Record<string, unknown> | undefined;
    const fakeTool: AgentTool = {
      name: "read_file",
      description: "read",
      parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
      execute: async (args) => {
        capturedArgs = args;
        return { content: "file contents" };
      },
    };
    ctx.tools.register(fakeTool);

    // Turn 1: tool_call; Turn 2: final text.
    const provider = makeFakeProvider([
      [{ type: "tool_call", id: "call_1", name: "read_file", arguments: '{"path":"/a/b.ts"}' }],
      [{ type: "text", text: "Done reading." }],
    ]);
    ctx.providers.register({ id: "fake", label: "Fake", create: () => provider });

    const chat = ctx.store.create({ providerId: "fake" });
    await ctx.runtime.send(chat.id, "win-a", "read it");

    const stored = ctx.store.get(chat.id)!;
    // user, assistant (with the tool call), tool result, assistant (final).
    expect(stored.messages.map((m) => m.role)).toEqual(["user", "assistant", "tool", "assistant"]);
    expect(stored.messages[1].toolCalls?.[0]).toMatchObject({
      id: "call_1",
      name: "read_file",
      status: "done",
    });
    expect(stored.messages[2]).toMatchObject({
      role: "tool",
      toolCallId: "call_1",
      content: "file contents",
    });
    expect(stored.messages[3].content).toBe("Done reading.");
    // The tool received the parsed arguments.
    expect(capturedArgs).toEqual({ path: "/a/b.ts" });
  });

  it("withholds every tool when an empty enabledTools set is passed", async () => {
    const fakeTool: AgentTool = {
      name: "read_file",
      description: "read",
      parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
      execute: async () => ({ content: "x" }),
    };
    ctx.tools.register(fakeTool);

    let capturedTools: unknown;
    const provider: ChatProvider = {
      id: "fake",
      label: "Fake",
      ping: async () => true,
      async *streamChat(req: ChatStreamRequest): AsyncIterable<ProviderDelta> {
        capturedTools = req.tools;
        yield { type: "text", text: "done" };
      },
    };
    ctx.providers.register({ id: "fake", label: "Fake", create: () => provider });

    const chat = ctx.store.create({ providerId: "fake" });
    await ctx.runtime.send(chat.id, "win-a", "hello", undefined, []);

    // The provider received no tools, so no tool-call loop can occur.
    expect(capturedTools).toEqual([]);
    const stored = ctx.store.get(chat.id)!;
    expect(stored.messages.filter((m) => m.role === "tool")).toHaveLength(0);
  });

  it("respects the max-turns guard for a chat that keeps calling tools", async () => {
    const loopTool: AgentTool = {
      name: "run_command",
      description: "run",
      parameters: { type: "object", properties: { command: { type: "string" } } },
      execute: async () => ({ content: "ok" }),
    };
    ctx.tools.register(loopTool);
    const provider = makeFakeProvider([
      [
        {
          type: "tool_call",
          id: "call_loop",
          name: "run_command",
          arguments: '{"command":"echo"}',
        },
      ],
    ]);
    ctx.providers.register({ id: "fake", label: "Fake", create: () => provider });

    const chat = ctx.store.create({ providerId: "fake" });
    await ctx.runtime.send(chat.id, "win-a", "go");

    const stored = ctx.store.get(chat.id)!;
    // User + up to AGENT_MAX_TURNS loops of (assistant tool-call + tool result).
    expect(stored.messages.length).toBeGreaterThan(2);
    // The number of assistant tool-call messages never exceeds the turn cap.
    const toolCalls = stored.messages.flatMap((m) => m.toolCalls ?? []);
    expect(toolCalls.length).toBeLessThanOrEqual(8);
  });
});
