/**
 * <debug-log-panel> — app-log panel hosted inside the workspaces overlay as
 * its "Logs" feature tab (see WorkspaceManagerModal._systemTabs).
 *
 *   Logs sub-tab   — queryable, virtualized list of the app-log bus (search,
 *                    level filter, source). Includes the session-only Debug
 *                    toggle (captures/stores DEBUG while enabled). The panel
 *                    is always present inside the Logs tab; the toggle never
 *                    controls tab or panel presence.
 *   Events sub-tab — live, structured debug events (source / label / data /
 *                    timestamp) — where cross-window drag diagnostics surface.
 *
 * Fills its host (the workspaces overlay body): no header, no close button,
 * no drag handle — the surrounding overlay top bar owns tabs + close.
 */

import { LitElement, html } from "lit";
import { state } from "lit/decorators.js";
import {
  LogLevel,
  LOG_LEVEL_LABELS,
  queryLog,
  clearLogBuffer,
  subscribeLogs,
  setMinLevel,
  getMinLevel,
  type LogQuery,
  type StoredLogEntry,
} from "openp41ge-logger";

/** Build-time debug flag — replaced by vite.config `define` from OPENP41GE_DEBUG. */
declare const __OPENP41GE_DEBUG__: boolean;

const ROW_H = 21;
const OVERSCAN = 8;
const REFRESH_THROTTLE_MS = 40;

type TabName = "logs" | "events";

function _pad(n: number, w = 2): string {
  return String(n).padStart(w, "0");
}

function _formatTime(ts: number): string {
  const d = new Date(ts);
  return `${_pad(d.getHours())}:${_pad(d.getMinutes())}:${_pad(d.getSeconds())}.${_pad(d.getMilliseconds(), 3)}`;
}

function _escape(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function _levelClass(level: LogLevel): string {
  return LogLevel[level].toLowerCase();
}

export class DebugLogPanel extends LitElement {
  static readonly tagName = "debug-log-panel";

  protected createRenderRoot(): HTMLElement | DocumentFragment {
    return this;
  }

  // ── State ────────────────────────────────────────────────────────────
  @state() private _tab: TabName = "logs";
  @state() private _search = "";
  @state() private _levelFilter = LogLevel.DEBUG;
  @state() private _debugSession = getMinLevel() === LogLevel.DEBUG;
  /** Logs-tab entries, newest first. */
  @state() private _entries: StoredLogEntry[] = [];
  /** Events-tab entries (DEBUG), newest first. */
  @state() private _events: StoredLogEntry[] = [];
  @state() private _scrollTop = 0;
  @state() private _expanded = new Set<number>();

  private _unsub: (() => void) | null = null;
  private _refreshTimer: number | null = null;

  private get _scrollEl(): HTMLElement | null {
    return this.querySelector(".log-scroll");
  }

  // ── Lifecycle ────────────────────────────────────────────────────────

  connectedCallback(): void {
    super.connectedCallback();
    this._refresh();
    this._unsub = subscribeLogs(() => this._scheduleRefresh());
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this._unsub?.();
    this._unsub = null;
    if (this._refreshTimer !== null) {
      window.clearTimeout(this._refreshTimer);
      this._refreshTimer = null;
    }
  }

  updated(): void {
    // Keep pinned to newest when the user hasn't scrolled up.
    const el = this._scrollEl;
    if (el && this._tab === "logs") {
      const nearBottom =
        el.scrollTop + el.clientHeight >= el.scrollHeight - 8 || el.scrollHeight === 0;
      if (nearBottom) {
        el.scrollTop = el.scrollHeight;
      }
    }
  }

  // ── Refresh ──────────────────────────────────────────────────────────

  private _scheduleRefresh(): void {
    if (this._refreshTimer !== null) return;
    this._refreshTimer = window.setTimeout(() => {
      this._refreshTimer = null;
      this._refresh();
    }, REFRESH_THROTTLE_MS);
  }

  private _refresh(): void {
    this._debugSession = getMinLevel() === LogLevel.DEBUG;
    const q: LogQuery = { minLevel: this._levelFilter };
    if (this._search.trim()) q.search = this._search.trim();
    this._entries = [...queryLog(q)].reverse();
    this._events = [...queryLog({ minLevel: LogLevel.DEBUG, maxLevel: LogLevel.DEBUG })].reverse();
  }

  // ── Debug session toggle ─────────────────────────────────────────────

  private _toggleDebugSession(on: boolean): void {
    this._debugSession = on;
    setMinLevel(on ? LogLevel.DEBUG : LogLevel.INFO);
    window.openp41ge?.logs?.setDebug?.(on);
    this._refresh();
  }

  // ── Virtualization (Logs tab) ────────────────────────────────────────

  private get _viewportHeight(): number {
    const el = this._scrollEl;
    return (el?.clientHeight ?? 0) > 0 ? el!.clientHeight : 320;
  }

  private get _visibleRows(): Array<{ index: number; top: number }> {
    const scrollTop = this._tab === "logs" ? this._scrollTop : 0;
    const start = Math.max(0, Math.floor(scrollTop / ROW_H) - OVERSCAN);
    const end = Math.min(
      this._entries.length,
      Math.ceil((scrollTop + this._viewportHeight) / ROW_H) + OVERSCAN,
    );
    const rows: Array<{ index: number; top: number }> = [];
    for (let i = start; i < end; i++) {
      rows.push({ index: i, top: i * ROW_H });
    }
    return rows;
  }

  private _onScroll(): void {
    const el = this._scrollEl;
    if (!el) return;
    this._scrollTop = el.scrollTop;
  }

  // ── Handlers ─────────────────────────────────────────────────────────

  private _onSearch(e: Event): void {
    this._search = (e.target as HTMLInputElement).value;
    this._scheduleRefresh();
  }

  private _onLevelFilter(e: Event): void {
    this._levelFilter = Number((e.target as HTMLSelectElement).value) as LogLevel;
    this._scheduleRefresh();
  }

  private _toggleExpand(id: number): void {
    const next = new Set(this._expanded);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    this._expanded = next;
  }

  // ── Render ───────────────────────────────────────────────────────────

  render() {
    return html`
      <style>
        .ov {
          display: flex;
          flex-direction: column;
          flex: 1;
          min-height: 0;
          overflow: hidden;
          background: var(--bg-primary, #1e1e1e);
          color: var(--text-primary, #e0e0e0);
          font-family: "Cascadia Code", "Fira Code", "JetBrains Mono", Consolas, monospace;
          font-size: 12px;
        }
        .tabs {
          display: flex;
          gap: 2px;
          margin-right: 4px;
        }
        .tab {
          padding: 3px 12px;
          border: 1px solid transparent;
          border-radius: 4px;
          background: transparent;
          color: var(--text-secondary, #999);
          cursor: pointer;
          font-family: inherit;
          font-size: 12px;
        }
        .tab.active {
          background: var(--bg-active, #2d2d2d);
          border-color: var(--border-color, #444);
          color: var(--text-primary, #e0e0e0);
        }

        .toolbar {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 6px 10px;
          border-bottom: 1px solid var(--border-color, #333);
          background: var(--bg-secondary, #252526);
          flex-shrink: 0;
        }
        .dbg {
          display: flex;
          align-items: center;
          gap: 4px;
          white-space: nowrap;
        }
        .dbg input {
          accent-color: var(--accent, #4a9eff);
        }
        .search {
          flex: 1;
          min-width: 80px;
          background: var(--bg-input, #2a2a2a);
          border: 1px solid var(--border-color, #3a3a3a);
          border-radius: 4px;
          color: inherit;
          padding: 3px 8px;
          font-family: inherit;
          font-size: 12px;
        }
        .search:focus {
          outline: none;
          border-color: var(--border-focus, #4a9eff);
        }
        select {
          background: var(--bg-input, #2a2a2a);
          border: 1px solid var(--border-color, #3a3a3a);
          border-radius: 4px;
          color: inherit;
          font-family: inherit;
          font-size: 12px;
        }
        .btn {
          background: var(--bg-input, #2a2a2a);
          border: 1px solid var(--border-color, #3a3a3a);
          border-radius: 4px;
          color: var(--text-secondary, #bbb);
          cursor: pointer;
          font-family: inherit;
          font-size: 12px;
          padding: 3px 10px;
        }
        .btn:hover {
          color: var(--text-primary, #fff);
        }

        .log-scroll {
          flex: 1;
          overflow-y: auto;
          position: relative;
          min-height: 140px;
        }
        .log-canvas {
          position: relative;
          width: 100%;
        }
        .log-row {
          position: absolute;
          left: 0;
          right: 0;
          height: ${ROW_H - 1}px;
          line-height: ${ROW_H - 1}px;
          display: flex;
          gap: 8px;
          padding: 0 8px;
          white-space: nowrap;
          overflow: hidden;
        }
        .log-row:hover {
          background: var(--bg-hover, #262626);
        }
        .log-time {
          color: #6a737d;
          flex-shrink: 0;
          width: 92px;
        }
        .log-lvl {
          width: 34px;
          flex-shrink: 0;
          text-align: right;
          font-weight: 600;
          opacity: 0.8;
        }
        .log-lvl.level-debug {
          color: #6a9955;
        }
        .log-lvl.level-info {
          color: #d4d4d4;
        }
        .log-lvl.level-warn {
          color: #d7ba7d;
        }
        .log-lvl.level-error {
          color: #f44747;
        }
        .log-src {
          color: #569cd6;
          flex-shrink: 0;
          max-width: 180px;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .log-msg {
          flex: 1;
          overflow: hidden;
          text-overflow: ellipsis;
          color: var(--text-primary, #d4d4d4);
        }

        .event-list {
          flex: 1;
          overflow-y: auto;
          min-height: 140px;
        }
        .event-row {
          display: flex;
          gap: 8px;
          padding: 2px 8px;
          line-height: 1.5;
        }
        .event-row:hover {
          background: var(--bg-hover, #262626);
        }
        .ev-time {
          color: #6a737d;
          flex-shrink: 0;
          width: 92px;
        }
        .ev-src {
          color: #569cd6;
          flex-shrink: 0;
          max-width: 180px;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .ev-label {
          flex: 1;
          color: #d4d4d4;
        }
        .ev-toggle {
          background: none;
          border: none;
          color: #999;
          cursor: pointer;
          font-family: inherit;
        }
        .event-data {
          margin: 2px 8px 6px 108px;
          padding: 6px 8px;
          background: var(--bg-active, #202020);
          border: 1px solid var(--border-color, #333);
          border-radius: 4px;
          white-space: pre-wrap;
          word-break: break-all;
        }
        .empty {
          display: flex;
          align-items: center;
          justify-content: center;
          height: 100%;
          color: #555;
        }
      </style>
      <div class="ov">
        <div class="toolbar">
          <label class="dbg" title="Capture/store DEBUG this session">
            <input
              type="checkbox"
              ?checked=${this._debugSession}
              @change=${(e: Event) => this._toggleDebugSession((e.target as HTMLInputElement).checked)}
            />
            Debug
          </label>
          <select @change=${this._onLevelFilter} title="Minimum level filter">
            ${([LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR] as LogLevel[]).map(
              (lvl) =>
                html`<option value=${lvl} ?selected=${this._levelFilter === lvl}>
                  ${LOG_LEVEL_LABELS[lvl]}+
                </option>`,
            )}
          </select>
          <input
            class="search"
            placeholder="search source/message…"
            .value=${this._search}
            @input=${this._onSearch}
          />
          <div class="tabs">
            <button
              class="tab${this._tab === "logs" ? " active" : ""}"
              @click=${() => (this._tab = "logs")}
            >
              Logs
            </button>
            <button
              class="tab${this._tab === "events" ? " active" : ""}"
              @click=${() => (this._tab = "events")}
            >
              Events
            </button>
          </div>
          <button class="btn" @click=${() => clearLogBuffer()}>Clear</button>
        </div>
        ${this._tab === "logs" ? this._renderLogs() : this._renderEvents()}
      </div>
    `;
  }

  private _renderLogs() {
    return html`
      <div class="log-scroll" @scroll=${this._onScroll}>
        <div class="log-canvas" style="height:${this._entries.length * ROW_H}px">
          ${
            this._entries.length === 0
              ? html`<div class="empty">No captured logs</div>`
              : this._visibleRows.map(
                  (row) => html`
                    <div class="log-row" style="transform:translateY(${row.top}px)">
                      <span class="log-time"
                        >${_formatTime(this._entries[row.index].timestamp)}</span
                      >
                      <span class="log-lvl lvl-${_levelClass(this._entries[row.index].level)}"
                        >${LOG_LEVEL_LABELS[this._entries[row.index].level]}</span
                      >
                      <span class="log-src">${_escape(this._entries[row.index].source)}</span>
                      <span class="log-msg">${_escape(this._entries[row.index].message)}</span>
                    </div>
                  `,
                )
          }
        </div>
      </div>
      <div
        style="padding:4px 10px;color:#6a737d;border-top:1px solid var(--border-color,#333);flex-shrink:0;"
      >
        ${this._entries.length} captured · debug = ${this._debugSession ? "on" : "off"}
      </div>
    `;
  }

  private _renderEvents() {
    const events = this._events.slice(0, 400);
    return html`
      <div class="event-list">
        ${
          events.length === 0
            ? html`<div class="empty">No debug events — enable Debug in the Logs tab</div>`
            : events.map(
                (ev) => html`
                  <div class="event-row">
                    <span class="ev-time">${_formatTime(ev.timestamp)}</span>
                    <span class="ev-src">${_escape(ev.source)}</span>
                    <span class="ev-label">${_escape(ev.message)}</span>
                    ${
                      ev.data !== undefined
                        ? html`<button class="ev-toggle" @click=${() => this._toggleExpand(ev.id)}>
                            ${this._expanded.has(ev.id) ? "▾" : "▸"}
                          </button>`
                        : ""
                    }
                  </div>
                  ${
                    this._expanded.has(ev.id) && ev.data !== undefined
                      ? html`<div class="event-data">
                          ${_escape(JSON.stringify(ev.data, null, 2))}
                        </div>`
                      : ""
                  }
                `,
              )
        }
      </div>
    `;
  }
}

// ── Registration ─────────────────────────────────────────────────────────

customElements.define(DebugLogPanel.tagName, DebugLogPanel);

/**
 * True when a debug session should be seeded at launch:
 * build-time `OPENP41GE_DEBUG=1` (defined as __OPENP41GE_DEBUG__) or the
 * runtime `localStorage["openp41ge-debug"] === "1"` override.
 */
export function isDebugSeed(): boolean {
  let builtIn = false;
  try {
    builtIn = typeof __OPENP41GE_DEBUG__ !== "undefined" ? !!__OPENP41GE_DEBUG__ : false;
  } catch {
    builtIn = false;
  }
  if (builtIn) return true;
  try {
    return localStorage.getItem("openp41ge-debug") === "1";
  } catch {
    return false;
  }
}
