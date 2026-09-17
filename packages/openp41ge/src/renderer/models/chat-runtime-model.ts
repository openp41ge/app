/**
 * ChatRuntimeModel — the DI seam for the agent runtime (send/abort + stream).
 *
 * The chat pane controller depends on this interface (public settable
 * property), so unit tests can inject TestChatRuntimeModel without any
 * Electron/IPC. The Ipc implementation delegates to window.openp41ge.chat.*.
 */

/* eslint-disable max-classes-per-file */

import type {
  ChatDeltaPayload,
  ChatLiveRatePayload,
  ChatStatusPayload,
  ChatToolPayload,
  ChatUsagePayload,
} from "openp41ge-agents";

/** Narrow send/abort + subscribe contract for the agent runtime. */
export interface ChatRuntimeModel {
  send(
    id: string,
    text: string,
    cwd?: string,
    tools?: string[],
    thinkingLevel?: string,
  ): Promise<void>;
  abort(id: string): Promise<void>;
  onDelta(cb: (payload: ChatDeltaPayload) => void): () => void;
  onTool(cb: (payload: ChatToolPayload) => void): () => void;
  onStatus(cb: (payload: ChatStatusPayload) => void): () => void;
  onUsage(cb: (payload: ChatUsagePayload) => void): () => void;
  onLiveRate(cb: (payload: ChatLiveRatePayload) => void): () => void;
}

// ─── Production: IPC-backed ───────────────────────────────────────────────

export class IpcChatRuntimeModel implements ChatRuntimeModel {
  send(
    id: string,
    text: string,
    cwd?: string,
    tools?: string[],
    thinkingLevel?: string,
  ): Promise<void> {
    return window.openp41ge.chat.send(id, text, cwd, tools, thinkingLevel);
  }
  abort(id: string): Promise<void> {
    return window.openp41ge.chat.abort(id);
  }
  onDelta(cb: (payload: ChatDeltaPayload) => void): () => void {
    return window.openp41ge.chat.onDelta(cb);
  }
  onTool(cb: (payload: ChatToolPayload) => void): () => void {
    return window.openp41ge.chat.onTool(cb);
  }
  onStatus(cb: (payload: ChatStatusPayload) => void): () => void {
    return window.openp41ge.chat.onStatus(cb);
  }
  onUsage(cb: (payload: ChatUsagePayload) => void): () => void {
    return window.openp41ge.chat.onUsage(cb);
  }
  onLiveRate(cb: (payload: ChatLiveRatePayload) => void): () => void {
    return window.openp41ge.chat.onLiveRate(cb);
  }
}

// ─── Test: in-memory fixture runtime ──────────────────────────────────────

/**
 * In-memory ChatRuntimeModel for tests. Stores a configurable reply + tool
 * sequence, and emits delta/tool/status events so controllers can be exercised
 * without Electron.
 */
export class TestChatRuntimeModel implements ChatRuntimeModel {
  /** Queued deltas to stream for the next send (text + tool calls). */
  deltaScript: Array<
    | { type: "text"; text: string }
    | { type: "tool_call"; id: string; name: string; arguments: string }
  > = [];
  /** When true, send() immediately aborts (for abort tests). */
  failOnSend = false;
  calls: Array<{ op: string; args: unknown[] }> = [];

  private readonly _delta = new Set<(p: ChatDeltaPayload) => void>();
  private readonly _tool = new Set<(p: ChatToolPayload) => void>();
  private readonly _status = new Set<(p: ChatStatusPayload) => void>();
  private readonly _usage = new Set<(p: ChatUsagePayload) => void>();
  private readonly _liveRate = new Set<(p: ChatLiveRatePayload) => void>();

  send(id: string, text: string, cwd?: string): Promise<void> {
    this.calls.push({ op: "send", args: [id, text, cwd] });
    if (this.failOnSend) return Promise.reject(new Error("send failed"));
    // Replay the script synchronously as a simple stream.
    for (const d of this.deltaScript) {
      if (d.type === "text") {
        for (const cb of this._delta) cb({ chatId: id, delta: d.text });
      } else {
        const toolCall = {
          id: d.id,
          name: d.name,
          arguments: d.arguments,
          status: "running" as const,
        };
        for (const cb of this._tool) cb({ chatId: id, toolCall });
      }
    }
    return Promise.resolve();
  }

  abort(id: string): Promise<void> {
    this.calls.push({ op: "abort", args: [id] });
    for (const cb of this._status)
      cb({ chatId: id, status: { streaming: false, providerOk: null } });
    return Promise.resolve();
  }

  onDelta(cb: (p: ChatDeltaPayload) => void): () => void {
    this._delta.add(cb);
    return () => this._delta.delete(cb);
  }
  onTool(cb: (p: ChatToolPayload) => void): () => void {
    this._tool.add(cb);
    return () => this._tool.delete(cb);
  }
  onStatus(cb: (p: ChatStatusPayload) => void): () => void {
    this._status.add(cb);
    return () => this._status.delete(cb);
  }
  onUsage(cb: (p: ChatUsagePayload) => void): () => void {
    this._usage.add(cb);
    return () => this._usage.delete(cb);
  }
  onLiveRate(cb: (p: ChatLiveRatePayload) => void): () => void {
    this._liveRate.add(cb);
    return () => this._liveRate.delete(cb);
  }

  /** Emit externally (used to simulate a streamed delta arriving). */
  emitDelta(id: string, delta: string): void {
    for (const cb of this._delta) cb({ chatId: id, delta });
  }
  emitStatus(id: string, status: ChatStatusPayload["status"]): void {
    for (const cb of this._status) cb({ chatId: id, status });
  }
  emitUsage(id: string, usage: ChatUsagePayload["usage"]): void {
    for (const cb of this._usage) cb({ chatId: id, usage });
  }
  emitLiveRate(id: string, tps: number): void {
    for (const cb of this._liveRate) cb({ chatId: id, tps });
  }
}
