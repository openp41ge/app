/**
 * <openp41ge-log-viewer> — Log viewer Lit component.
 *
 * Displays entries from the global log buffer with a level filter bar.
 *
 * Attributes:
 *   max-entries     Maximum log entries to render at once (default: 500)
 *
 * The component auto-scrolls to the bottom when new entries arrive
 * unless the user has scrolled up (paused scrolling).
 */

import { LitElement, html } from "lit";
import { state } from "lit/decorators.js";
import {
  LogLevel,
  LOG_LEVEL_LABELS,
  getLogBuffer,
  subscribeLogs,
  clearLogBuffer,
  type LogEntry,
} from "./log-buffer";

const LEVELS: LogLevel[] = [LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR];

function levelClass(level: LogLevel): string {
  return LogLevel[level].toLowerCase();
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return [
    String(d.getHours()).padStart(2, "0"),
    String(d.getMinutes()).padStart(2, "0"),
    String(d.getSeconds()).padStart(2, "0"),
  ].join(":");
}

export class Openp41geLogViewer extends LitElement {
  static readonly tagName = "openp41ge-log-viewer";

  protected createRenderRoot(): HTMLElement | DocumentFragment {
    return this;
  }

  @state() private _minLevel: LogLevel = LogLevel.DEBUG;
  @state() private _entries: LogEntry[] = [];

  private _unsubscribe: (() => void) | null = null;
  private _isScrolledUp = false;

  private get _listEl(): HTMLElement | null {
    return this.querySelector(".log-list");
  }

  connectedCallback(): void {
    super.connectedCallback();
    this._refresh();
    this._unsubscribe = subscribeLogs(() => this._refresh());
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this._unsubscribe?.();
    this._unsubscribe = null;
  }

  updated(): void {
    // Auto-scroll to bottom unless user scrolled up
    if (!this._isScrolledUp && this._listEl) {
      this._listEl.scrollTop = this._listEl.scrollHeight;
    }
  }

  private _refresh(): void {
    this._entries = getLogBuffer().filter((e) => e.level >= this._minLevel);
    // Reset scroll-paused state when buffer empties
    if (this._entries.length === 0) {
      this._isScrolledUp = false;
    }
  }

  private _setLevel(lvl: LogLevel): void {
    this._minLevel = lvl;
    this._refresh();
  }

  private _onScroll(): void {
    const el = this._listEl;
    if (el) {
      this._isScrolledUp = el.scrollTop + el.clientHeight < el.scrollHeight - 10;
    }
  }

  private _escapeHtml(text: string): string {
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  render() {
    return html`
      <style>
        :host {
          display: flex;
          flex-direction: column;
          height: 100%;
          background: #1e1e1e;
          color: #d4d4d4;
          font-family: "Cascadia Code", "Fira Code", "JetBrains Mono", "Consolas", monospace;
          font-size: 12px;
          overflow: hidden;
        }
        .toolbar {
          display: flex;
          align-items: center;
          gap: 4px;
          padding: 4px 8px;
          background: #252526;
          border-bottom: 1px solid #333;
          flex-shrink: 0;
        }
        .level-btn {
          padding: 2px 8px;
          border: 1px solid #444;
          border-radius: 3px;
          background: #333;
          color: #999;
          cursor: pointer;
          font-size: 11px;
          font-family: inherit;
        }
        .level-btn:hover {
          background: #3c3c3c;
          color: #ccc;
        }
        .level-btn.active {
          background: #094771;
          border-color: #1a7fd1;
          color: #fff;
        }
        .spacer {
          flex: 1;
        }
        .clear-btn {
          padding: 2px 8px;
          border: 1px solid #444;
          border-radius: 3px;
          background: #333;
          color: #999;
          cursor: pointer;
          font-size: 11px;
          font-family: inherit;
        }
        .clear-btn:hover {
          background: #5a1d1d;
          border-color: #8a3a3a;
          color: #f88;
        }
        .log-list {
          flex: 1;
          overflow-y: auto;
          padding: 4px 0;
        }
        .log-entry {
          display: flex;
          gap: 8px;
          padding: 1px 8px;
          line-height: 1.5;
          white-space: pre-wrap;
          word-break: break-all;
        }
        .log-entry:hover {
          background: #2a2a2a;
        }
        .log-entry.level-debug {
          color: #6a9955;
        }
        .log-entry.level-info {
          color: #d4d4d4;
        }
        .log-entry.level-warn {
          color: #d7ba7d;
        }
        .log-entry.level-error {
          color: #f44747;
        }
        .log-level-tag {
          flex-shrink: 0;
          width: 44px;
          text-align: right;
          font-weight: bold;
          opacity: 0.7;
        }
        .log-time {
          flex-shrink: 0;
          color: #666;
          width: 70px;
        }
        .log-name {
          flex-shrink: 0;
          color: #569cd6;
          margin-right: 4px;
        }
        .log-text {
          flex: 1;
        }
        .empty-msg {
          display: flex;
          align-items: center;
          justify-content: center;
          height: 100%;
          color: #555;
          font-size: 13px;
        }
      </style>
      <div class="toolbar">
        ${LEVELS.map(
          (lvl) => html`
            <button
              class="level-btn${lvl === this._minLevel ? " active" : ""}"
              @click=${() => this._setLevel(lvl)}
            >
              ${LOG_LEVEL_LABELS[lvl]}
            </button>
          `,
        )}
        <span class="spacer"></span>
        <button class="clear-btn" @click=${() => clearLogBuffer()}>Clear</button>
      </div>
      <div class="log-list" @scroll=${this._onScroll}>
        ${
          this._entries.length === 0
            ? html`<div class="empty-msg">No log entries</div>`
            : this._entries.map(
                (entry) => html`
                  <div class="log-entry level-${levelClass(entry.level)}">
                    <span class="log-level-tag">${LOG_LEVEL_LABELS[entry.level]}</span>
                    <span class="log-time">${formatTime(entry.timestamp)}</span>
                    <span class="log-name">[${this._escapeHtml(entry.name)}]</span>
                    <span class="log-text">${this._escapeHtml(entry.text)}</span>
                  </div>
                `,
              )
        }
      </div>
    `;
  }
}

let _registered = false;
export function registerOpenp41geLogViewer(): void {
  if (!_registered) {
    _registered = true;
    customElements.define(Openp41geLogViewer.tagName, Openp41geLogViewer);
  }
}
registerOpenp41geLogViewer();
