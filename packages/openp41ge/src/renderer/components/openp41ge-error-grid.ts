/**
 * openp41ge-error-grid — the manager window's "Errors" tab content.
 *
 * Renders every error captured by the error-capture-service as a grid of
 * cards (newest first): type badge, message, source, timestamp, and an
 * expandable stack trace. Errors never auto-dismiss; the user can dismiss a
 * single card or clear them all.
 *
 * Error text (message/source/stack) is rendered as escaped text by Lit
 * (never `unsafeHTML`) — captured messages are untrusted strings.
 */
import { LitElement, html, css, nothing, type TemplateResult } from "lit";
import { customElement, state } from "lit/decorators.js";
import {
  subscribeErrors,
  removeCapturedError,
  clearCapturedErrors,
  type CapturedError,
} from "../services/error-capture-service";

const TYPE_LABEL: Record<CapturedError["type"], string> = {
  exception: "Exception",
  rejection: "Rejection",
  console: "Console",
  "main-process": "Main",
};

function formatTime(ts: number): string {
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return String(ts);
  }
}

@customElement("openp41ge-error-grid")
export class Openp41geErrorGrid extends LitElement {
  @state() private _errors: CapturedError[] = [];
  /** Indexes of cards whose stack trace is expanded. */
  @state() private _expanded: Set<number> = new Set();
  private _unsub?: () => void;

  connectedCallback(): void {
    super.connectedCallback();
    this._unsub = subscribeErrors((errs: CapturedError[]) => {
      this._errors = errs;
    });
  }

  disconnectedCallback(): void {
    this._unsub?.();
    this._unsub = undefined;
    super.disconnectedCallback();
  }

  private _toggleStack(i: number): void {
    const next = new Set(this._expanded);
    if (next.has(i)) next.delete(i);
    else next.add(i);
    this._expanded = next;
  }

  private _remove(i: number): void {
    removeCapturedError(i);
  }

  private _clearAll(): void {
    clearCapturedErrors();
  }

  static styles = css`
    :host {
      display: block;
      height: 100%;
    }
    .eg-root {
      height: 100%;
      box-sizing: border-box;
      padding: 14px 16px;
      overflow-y: auto;
    }
    .eg-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      margin-bottom: 12px;
    }
    .eg-title {
      font-size: 14px;
      font-weight: 600;
      color: var(--text-primary, #eee);
    }
    .eg-clear {
      flex-shrink: 0;
      background: rgba(255, 255, 255, 0.08);
      border: 1px solid rgba(255, 255, 255, 0.15);
      border-radius: 6px;
      color: rgba(255, 255, 255, 0.8);
      font-size: 12px;
      padding: 4px 10px;
      cursor: pointer;
    }
    .eg-clear:hover {
      background: rgba(255, 255, 255, 0.16);
      color: #fff;
    }
    .eg-empty {
      color: var(--text-secondary, #999);
      text-align: center;
      padding: 48px 0;
      font-size: 13px;
    }
    .eg-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
      gap: 10px;
    }
    .eg-card {
      background: rgba(0, 0, 0, 0.25);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-left: 3px solid #8c2a2a;
      border-radius: 8px;
      padding: 10px 12px;
      min-width: 0;
    }
    .eg-card[data-type="rejection"] {
      border-left-color: #8c6a2a;
    }
    .eg-card[data-type="console"] {
      border-left-color: #6a5a8c;
    }
    .eg-card[data-type="main-process"] {
      border-left-color: #2a5a8c;
    }
    .eg-card-head {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 6px;
    }
    .eg-badge {
      flex-shrink: 0;
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.03em;
      text-transform: uppercase;
      background: rgba(255, 255, 255, 0.1);
      color: rgba(255, 255, 255, 0.75);
      border-radius: 4px;
      padding: 1px 6px;
    }
    .eg-time {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: var(--text-secondary, #999);
      font-size: 11px;
    }
    .eg-remove {
      flex-shrink: 0;
      background: transparent;
      border: none;
      color: rgba(255, 255, 255, 0.5);
      font-size: 12px;
      cursor: pointer;
      padding: 2px;
      border-radius: 4px;
    }
    .eg-remove:hover {
      background: rgba(255, 255, 255, 0.15);
      color: #fff;
    }
    .eg-msg {
      color: #ffcdd2;
      font-weight: 600;
      font-size: 13px;
      word-break: break-word;
      margin-bottom: 4px;
    }
    .eg-source {
      color: var(--text-secondary, #999);
      font-size: 12px;
      word-break: break-all;
      margin-bottom: 6px;
    }
    .eg-stack-toggle {
      background: none;
      border: none;
      color: var(--accent, #7aa2ff);
      font-size: 12px;
      cursor: pointer;
      padding: 0;
    }
    .eg-stack-toggle:hover {
      text-decoration: underline;
    }
    .eg-stack {
      margin: 8px 0 0;
      white-space: pre-wrap;
      background: rgba(0, 0, 0, 0.4);
      border-radius: 6px;
      padding: 8px 10px;
      color: rgba(255, 255, 255, 0.6);
      font-size: 11.5px;
      overflow-wrap: anywhere;
      max-height: 260px;
      overflow-y: auto;
    }
  `;

  render(): TemplateResult {
    const list = this._errors;
    return html`
      <div class="eg-root">
        <div class="eg-head">
          <span class="eg-title">${list.length} error${list.length !== 1 ? "s" : ""} captured</span>
          ${
            list.length > 0
              ? html`<button class="eg-clear" @click=${this._clearAll}>Clear all</button>`
              : nothing
          }
        </div>
        ${
          list.length === 0
            ? html`<p class="eg-empty">No errors captured.</p>`
            : html`<div class="eg-grid">
                ${list.map(
                  (e, i) => html`
                    <div class="eg-card" data-type=${e.type}>
                      <div class="eg-card-head">
                        <span class="eg-badge">${TYPE_LABEL[e.type]}</span>
                        <span class="eg-time">${formatTime(e.timestamp)}</span>
                        <button
                          class="eg-remove"
                          aria-label="Dismiss error"
                          data-tip="Dismiss"
                          @click=${() => this._remove(i)}
                        >
                          ✕
                        </button>
                      </div>
                      <div class="eg-msg">${e.message}</div>
                      ${e.source ? html`<div class="eg-source">${e.source}</div>` : nothing}
                      ${
                        e.stack
                          ? html`
                              <button class="eg-stack-toggle" @click=${() => this._toggleStack(i)}>
                                ${this._expanded.has(i) ? "Hide stack" : "Show stack"}
                              </button>
                              ${
                                this._expanded.has(i)
                                  ? html`<pre class="eg-stack">${e.stack}</pre>`
                                  : nothing
                              }
                            `
                          : nothing
                      }
                    </div>
                  `,
                )}
              </div>`
        }
      </div>
    `;
  }
}
