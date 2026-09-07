/**
 * <openp41ge-agents> — Chat interface web component (Lit).
 *
 * Renders a full chat transcript (user / assistant / tool messages, tool-call
 * rows with running→done/error status), streams assistant text, and surfaces
 * provider connection status. It is UI-only: it never touches IPC or the chat
 * store — data flows through the platform controller's imperative API.
 *
 * Event contract (bubbles, composed):
 *   - `chat:send`   detail `{ text }` — user submitted a message.
 *   - `chat:abort`  — user clicked the abort button while streaming.
 */

import { LitElement, html, type TemplateResult } from "lit";
import { state, query } from "lit/decorators.js";
import type { Chat, ChatMessage, ChatRuntimeStatus, ToolCall } from "../types";

function deepCloneMessage(m: ChatMessage): ChatMessage {
  return {
    ...m,
    toolCalls: m.toolCalls?.map((t) => ({ ...t })),
  };
}

class Openp41geAgents extends LitElement {
  @state() private _messages: ChatMessage[] = [];
  @state() private _streaming = false;
  @state() private _status: ChatRuntimeStatus | null = null;
  @state() private _title = "";
  @query(".chat-input") private _inputEl!: HTMLTextAreaElement;

  get messages(): readonly ChatMessage[] {
    return this._messages;
  }

  get title(): string {
    return this._title;
  }

  // ─── Controller-facing imperative API ──────────────────────────────

  setChat(chat: Chat): void {
    this._title = chat.title;
    this._messages = chat.messages.map(deepCloneMessage);
    this._streaming = false;
  }

  appendDelta(text: string): void {
    if (!text) return;
    const messages = this._messages.map(deepCloneMessage);
    let last = messages[messages.length - 1];
    if (!last || last.role !== "assistant") {
      last = {
        id: `stream_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
        role: "assistant",
        content: "",
        timestamp: Date.now(),
      };
      messages.push(last);
    }
    last.content = (last.content ?? "") + text;
    this._messages = messages;
    this._streaming = true;
    this._scrollToBottom();
  }

  setToolCallState(tc: ToolCall): void {
    const messages = this._messages.map(deepCloneMessage);
    let last = messages[messages.length - 1];
    if (!last || last.role !== "assistant") {
      last = {
        id: `stream_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
        role: "assistant",
        content: "",
        timestamp: Date.now(),
      };
      messages.push(last);
    }
    const calls = last.toolCalls ?? [];
    const idx = calls.findIndex((c) => c.id === tc.id);
    if (idx >= 0) calls[idx] = { ...tc };
    else calls.push({ ...tc });
    last.toolCalls = calls;
    this._messages = messages;
    this._scrollToBottom();
  }

  setProviderStatus(status: ChatRuntimeStatus): void {
    this._status = status;
    this._streaming = status.streaming;
  }

  /** Set the chat title (e.g. when auto-titled from the first user message). */
  setTitle(title: string): void {
    this._title = title;
  }

  // ─── Back-compat API ────────────────────────────────────────────────

  addMessage(role: "user" | "assistant", content: string): void {
    const msg: ChatMessage = { id: this._id(), role, content, timestamp: Date.now() };
    this._messages = [...this._messages, msg];
    this._scrollToBottom();
  }

  clearMessages(): void {
    this._messages = [];
    this._streaming = false;
  }

  focusInput(): void {
    this._inputEl?.focus();
  }

  // ─── Send / abort ───────────────────────────────────────────────────

  private _sendMessage(): void {
    if (!this._inputEl || this._streaming) return;
    const text = this._inputEl.value.trim();
    if (!text) return;
    this._inputEl.value = "";
    this._inputEl.style.height = "auto";
    this.addMessage("user", text);
    this._streaming = true;
    this.dispatchEvent(
      new CustomEvent("chat:send", { bubbles: true, composed: true, detail: { text } }),
    );
    // Back-compat alias (older consumer tests listened for chat-message).
    this.dispatchEvent(
      new CustomEvent("chat-message", { bubbles: true, composed: true, detail: { text } }),
    );
  }

  private _abort(): void {
    this._streaming = false;
    this.dispatchEvent(new CustomEvent("chat:abort", { bubbles: true, composed: true }));
  }

  // ─── Rendering ──────────────────────────────────────────────────────

  private _toolResultFor(tc: ToolCall): string | undefined {
    const msg = this._messages.find((m) => m.role === "tool" && m.toolCallId === tc.id);
    return msg?.content;
  }

  private _statusText(): string | null {
    const s = this._status;
    if (!s) return null;
    if (s.providerOk === false) return "⚠ Provider unreachable — configure in ⚙ Agent.";
    if (s.streaming) return "● streaming…";
    return null;
  }

  render(): TemplateResult {
    const statusText = this._statusText();
    return html`
      <style>
        :host {
          display: flex;
          flex-direction: column;
          height: 100%;
          background: var(--bg-primary, #1e1e1e);
          color: var(--text-primary, #d4d4d4);
          font-family:
            -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          font-size: 13px;
          overflow: hidden;
        }
        .chat-bottombar {
          padding: 5px 12px;
          font-size: 11px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: var(--text-muted, #888);
          border-top: 1px solid var(--border-color, #2a2a2a);
          background: var(--bg-secondary, #181818);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          flex-shrink: 0;
        }
        .chat-status {
          padding: 4px 12px;
          font-size: 11px;
          color: var(--text-secondary, #aaa);
          background: var(--bg-tertiary, #222);
          border-bottom: 1px solid var(--border-color, #2a2a2a);
        }
        .chat-messages {
          flex: 1;
          overflow-y: auto;
          padding: 12px;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .chat-message {
          padding: 8px 12px;
          border-radius: 6px;
          max-width: 88%;
          word-wrap: break-word;
          white-space: pre-wrap;
          line-height: 1.4;
        }
        .chat-message.user {
          align-self: flex-end;
          background: var(--accent, #2b5a9c);
          color: #fff;
        }
        .chat-message.assistant {
          align-self: flex-start;
          background: var(--bg-secondary, #2d2d2d);
          color: var(--text-primary, #d4d4d4);
          border: 1px solid var(--border-color, #3a3a3a);
        }
        .msg-content {
          white-space: pre-wrap;
          word-wrap: break-word;
        }
        .caret {
          display: inline-block;
          width: 7px;
          height: 14px;
          vertical-align: text-bottom;
          background: var(--accent, #4a9eff);
          animation: blink 1s steps(2) infinite;
          margin-left: 2px;
        }
        @keyframes blink {
          0%,
          100% {
            opacity: 1;
          }
          50% {
            opacity: 0;
          }
        }
        .tool-calls {
          margin-top: 8px;
          border-top: 1px solid var(--border-color, #333);
          padding-top: 6px;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .tool-call-row {
          display: flex;
          align-items: center;
          gap: 6px;
          font-family: var(--font-mono, "JetBrains Mono", monospace);
          font-size: 11.5px;
          background: var(--bg-tertiary, #1c1c1c);
          border: 1px solid var(--border-color, #333);
          border-radius: 4px;
          padding: 4px 8px;
        }
        .tool-call-name {
          font-weight: 600;
          color: var(--text-secondary, #ccc);
          flex-shrink: 0;
        }
        .tool-call-args {
          color: var(--text-muted, #999);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .tool-status {
          flex-shrink: 0;
          font-weight: 700;
          margin-left: auto;
        }
        .tool-status.running {
          color: var(--accent, #4a9eff);
        }
        .tool-status.done {
          color: #4caf50;
        }
        .tool-status.error {
          color: #f44336;
        }
        .tool-result {
          margin-top: 2px;
          margin-left: 10px;
          font-family: var(--font-mono, "JetBrains Mono", monospace);
          font-size: 11px;
          color: var(--text-muted, #888);
          background: var(--bg-tertiary, #191919);
          border-left: 2px solid var(--border-color, #333);
          padding: 3px 6px;
          white-space: pre-wrap;
          word-break: break-word;
          max-height: 120px;
          overflow-y: auto;
        }
        .tool-empty {
          align-self: flex-start;
          color: var(--text-muted, #555);
          font-style: italic;
        }
        .chat-input-area {
          display: flex;
          align-items: flex-end;
          gap: 8px;
          padding: 8px 12px;
          border-top: 1px solid var(--border-color, #2a2a2a);
          background: var(--bg-primary, #1e1e1e);
        }
        .chat-input {
          flex: 1;
          resize: none;
          background: var(--bg-secondary, #252526);
          color: var(--text-primary, #d4d4d4);
          border: 1px solid var(--border-color, #3a3a3a);
          border-radius: 4px;
          padding: 8px 10px;
          font-family: inherit;
          font-size: 13px;
          min-height: 36px;
          max-height: 120px;
          outline: none;
        }
        .chat-input:focus {
          border-color: var(--accent, #2b5a9c);
        }
        .chat-input::placeholder {
          color: var(--text-muted, #666);
        }
        .icon-btn {
          flex-shrink: 0;
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--accent, #2b5a9c);
          border: none;
          border-radius: 4px;
          color: #fff;
          cursor: pointer;
          transition: background 0.1s;
          user-select: none;
        }
        .icon-btn:hover {
          background: #3a6cb5;
        }
        .icon-btn:active {
          background: #1f4a80;
        }
        .icon-btn.abort {
          background: #c0392b;
        }
        .icon-btn.abort:hover {
          background: #e74c3c;
        }
        .icon-btn svg {
          width: 16px;
          height: 16px;
          fill: none;
          stroke: currentColor;
          stroke-width: 2;
          stroke-linecap: round;
          stroke-linejoin: round;
        }
      </style>

      ${statusText ? html`<div class="chat-status">${statusText}</div>` : html``}

      <div class="chat-messages">
        ${
          this._messages.length === 0
            ? html`<div class="tool-empty">Start a conversation by typing a message below.</div>`
            : this._messages.map((msg) => this._renderMessage(msg))
        }
      </div>

      <div class="chat-input-area">
        <textarea
          class="chat-input"
          rows="1"
          placeholder=${this._streaming ? "Agent is responding…" : "Type a message..."}
          @keydown=${(e: KeyboardEvent) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              this._sendMessage();
            }
          }}
        ></textarea>
        ${
          this._streaming
            ? html`<div class="icon-btn abort" title="Stop" @click=${() => this._abort()}>
                <svg viewBox="0 0 24 24">
                  <rect
                    x="6"
                    y="6"
                    width="12"
                    height="12"
                    rx="1"
                    fill="currentColor"
                    stroke="none"
                  />
                </svg>
              </div>`
            : html`<div class="icon-btn" title="Send message" @click=${() => this._sendMessage()}>
                <svg viewBox="0 0 24 24">
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
              </div>`
        }
      </div>

      <div class="chat-bottombar">${this._title || "Agent chat"}</div>
    `;
  }

  private _renderMessage(msg: ChatMessage): TemplateResult {
    if (msg.role === "user") {
      return html`<div class="chat-message user">
        <div class="msg-content">${msg.content}</div>
      </div>`;
    }
    if (msg.role === "tool") {
      // Standalone tool-result message (rare): render as a mono result block.
      return html`<div class="tool-result">${msg.content}</div>`;
    }
    // assistant
    const toolCalls = msg.toolCalls ?? [];
    return html`
      <div class="chat-message assistant">
        <div class="msg-content">
          ${msg.content || ""}${this._streaming ? html`<span class="caret"></span>` : ""}
        </div>
        ${
          toolCalls.length > 0
            ? html`<div class="tool-calls">${toolCalls.map((tc) => this._renderToolCall(tc))}</div>`
            : ""
        }
      </div>
    `;
  }

  private _renderToolCall(tc: ToolCall): TemplateResult {
    const status = tc.status ?? "running";
    const result = this._toolResultFor(tc);
    return html`
      <div class="tool-call-row" data-tool-call-id=${tc.id}>
        <span class="tool-call-name">${tc.name}</span>
        <span class="tool-call-args">${this._argsText(tc.arguments)}</span>
        <span class="tool-status ${status}">
          ${status === "running" ? "…" : status === "done" ? "✓" : "✗"}
        </span>
      </div>
      ${status !== "running" && result ? html`<div class="tool-result">${result}</div>` : ""}
    `;
  }

  private _argsText(args: ToolCall["arguments"]): string {
    if (typeof args === "string") return args;
    try {
      return JSON.stringify(args);
    } catch {
      return String(args);
    }
  }

  private _scrollToBottom(): void {
    requestAnimationFrame(() => {
      const el = this.renderRoot.querySelector(".chat-messages");
      if (el) el.scrollTop = el.scrollHeight;
    });
  }

  private _id(): string {
    return `msg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  }
}

export function registerOpenp41geAgents(): void {
  if (!customElements.get("openp41ge-agents")) {
    customElements.define("openp41ge-agents", Openp41geAgents);
  }
}

registerOpenp41geAgents();

export { Openp41geAgents };
