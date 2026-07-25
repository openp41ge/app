/**
 * <openp41ge-agent-chat> — Chat interface web component (Lit).
 *
 * Provides a basic chat UI with a message list and a prompt input area.
 */

import { LitElement, html, type TemplateResult } from "lit";
import { state, query } from "lit/decorators.js";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

class Openp41geAgentChat extends LitElement {
  @state() private _messages: ChatMessage[] = [];
  @query(".chat-input") private _inputEl!: HTMLTextAreaElement;

  get messages(): readonly ChatMessage[] {
    return this._messages;
  }

  addMessage(role: "user" | "assistant", content: string): void {
    const msg: ChatMessage = { role, content, timestamp: Date.now() };
    this._messages = [...this._messages, msg];
    // Scroll after render
    requestAnimationFrame(() => {
      const el = this.renderRoot.querySelector(".chat-messages");
      if (el) el.scrollTop = el.scrollHeight;
    });
  }

  clearMessages(): void {
    this._messages = [];
  }
  focusInput(): void {
    this._inputEl?.focus();
  }

  connectedCallback(): void {
    super.connectedCallback();
  }

  private _sendMessage(): void {
    if (!this._inputEl) return;
    const text = this._inputEl.value.trim();
    if (!text) return;
    this.addMessage("user", text);
    this._inputEl.value = "";
    this._inputEl.style.height = "auto";
    this.dispatchEvent(
      new CustomEvent("chat-message", { bubbles: true, composed: true, detail: { text } }),
    );
  }

  render(): TemplateResult {
    return html`
      <style>
        :host {
          display: flex;
          flex-direction: column;
          height: 100%;
          background: #1e1e1e;
          color: #d4d4d4;
          font-family:
            -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          font-size: 13px;
          overflow: hidden;
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
          max-width: 80%;
          word-wrap: break-word;
          white-space: pre-wrap;
          line-height: 1.4;
        }
        .chat-message.user {
          align-self: flex-end;
          background: #2b5a9c;
          color: #fff;
        }
        .chat-message.assistant {
          align-self: flex-start;
          background: #2d2d2d;
          color: #d4d4d4;
          border: 1px solid #3a3a3a;
        }
        .chat-input-area {
          display: flex;
          align-items: flex-end;
          gap: 8px;
          padding: 8px 12px;
          border-top: 1px solid #2a2a2a;
          background: #1e1e1e;
        }
        .chat-input {
          flex: 1;
          resize: none;
          background: #252526;
          color: #d4d4d4;
          border: 1px solid #3a3a3a;
          border-radius: 4px;
          padding: 8px 10px;
          font-family: inherit;
          font-size: 13px;
          min-height: 36px;
          max-height: 120px;
          outline: none;
        }
        .chat-input:focus {
          border-color: #2b5a9c;
        }
        .chat-input::placeholder {
          color: #666;
        }
        .chat-send-btn {
          flex-shrink: 0;
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #2b5a9c;
          border: none;
          border-radius: 4px;
          color: #fff;
          cursor: pointer;
          transition: background 0.1s;
          user-select: none;
        }
        .chat-send-btn:hover {
          background: #3a6cb5;
        }
        .chat-send-btn:active {
          background: #1f4a80;
        }
        .chat-send-btn svg {
          width: 16px;
          height: 16px;
          fill: none;
          stroke: currentColor;
          stroke-width: 2;
          stroke-linecap: round;
          stroke-linejoin: round;
        }
        .chat-empty {
          display: flex;
          flex: 1;
          align-items: center;
          justify-content: center;
          color: #555;
          font-size: 14px;
          font-style: italic;
        }
      </style>
      <div class="chat-messages">
        ${
          this._messages.length === 0
            ? html`<div class="chat-empty">Start a conversation by typing a message below.</div>`
            : this._messages.map(
                (msg) => html` <div class="chat-message ${msg.role}">${msg.content}</div> `,
              )
        }
      </div>
      <div class="chat-input-area">
        <textarea
          class="chat-input"
          rows="1"
          placeholder="Type a message..."
          @keydown=${(e: KeyboardEvent) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              this._sendMessage();
            }
          }}
        ></textarea>
        <div class="chat-send-btn" title="Send message" @click=${() => this._sendMessage()}>
          <svg viewBox="0 0 24 24">
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </div>
      </div>
    `;
  }
}

export function registerOpenp41geAgentChat(): void {
  if (!customElements.get("openp41ge-agent-chat")) {
    customElements.define("openp41ge-agent-chat", Openp41geAgentChat);
  }
}

registerOpenp41geAgentChat();

export { Openp41geAgentChat };
