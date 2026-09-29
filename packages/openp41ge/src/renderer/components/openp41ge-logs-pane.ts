/**
 * <openp41ge-logs-pane> — the manager window's unified Logs tab.
 *
 * A single, datetime-ordered log viewer that merges what used to be the
 * Logs sidebar (one row per log system) and the per-system log grid into one
 * list showing EVERY stream. Filtering (level, stream, text) lives in a
 * right-side DRAWER instead of a bottom bar; the old systems sidebar is gone.
 *
 * Data comes from the persisted daily log files via `LogFilePageReader`
 * (newest at the bottom, older pages as the user scrolls up, live entries via
 * polling). If the `log:read-backward` IPC isn't available the pane falls back
 * to the in-memory log bus.
 *
 * Captured errors appear in place as ERROR-level rows. Clicking an ERROR row
 * opens a detail drawer showing the message, source, system, timestamp and —
 * where the runtime error capture has a record of it — the full stack trace.
 */

import { LitElement, html, type TemplateResult, nothing } from "lit";
import { state, customElement } from "lit/decorators.js";
import {
  LogLevel,
  LOG_LEVEL_LABELS,
  listLogStreams,
  subscribeLogStreams,
  subscribeLogs,
  queryLog,
  type LogEntry,
  type LogPageReader,
  type LogViewEntry,
} from "openp41ge-logger";
import { LogFilePageReader } from "../services/log-file-page-reader";
import { getCapturedErrors, type CapturedError } from "../services/error-capture-service";

interface Row {
  timestamp: number;
  level: LogLevel;
  levelLabel: string;
  system: string;
  source: string;
  message: string;
  process: string;
  data?: Record<string, unknown>;
}

const PAGE_LIMIT = 300;
const LOAD_OLDER_SCROLL_THRESHOLD = 120;

function toRow(e: LogViewEntry | LogEntry): Row {
  const view = e as LogViewEntry;
  const data = (e as LogEntry).data ?? (e as unknown as { data?: Record<string, unknown> }).data;
  return {
    timestamp: e.timestamp,
    level: e.level as LogLevel,
    levelLabel: view.levelLabel ?? LOG_LEVEL_LABELS[e.level as LogLevel] ?? "LOG",
    system: e.system,
    source: e.source ?? (e as LogEntry).name ?? "",
    message: view.message ?? (e as LogEntry).text ?? "",
    process: e.process,
    ...(data ? { data } : {}),
  };
}

function sameRow(a: Row, b: Row): boolean {
  return (
    a.timestamp === b.timestamp &&
    a.level === b.level &&
    a.system === b.system &&
    a.source === b.source &&
    a.message === b.message
  );
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number, w = 2): string => String(n).padStart(w, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number): string => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

@customElement("openp41ge-logs-pane")
export class Openp41geLogsPane extends LitElement {
  static tagName = "openp41ge-logs-pane";

  @state() private _rows: Row[] = [];
  @state() private _loading = true;
  @state() private _hasOlder = false;
  @state() private _loadingOlder = false;
  @state() private _pageFailed = false;

  @state() private _minLevel: LogLevel = LogLevel.DEBUG;
  @state() private _selectedStreams: string[] = [];
  @state() private _streams: Array<{ system: string; name: string; entryCount: number }> = [];
  @state() private _query = "";

  @state() private _filterOpen = false;
  @state() private _detailOpen = false;
  @state() private _detail: Row | null = null;
  @state() private _detailError: CapturedError | null = null;

  private _reader: LogPageReader | null = null;
  private _cursor: unknown = null;
  private _offSub: (() => void) | null = null;
  private _offStreams: (() => void) | null = null;
  private _attachBottom = true;
  private _scrollPending = false;
  private _lastScrollHeight = 0;

  connectedCallback(): void {
    super.connectedCallback();
    this._refreshStreams();
    this._offStreams = subscribeLogStreams(() => this._refreshStreams());
    void this._start();
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this._offSub?.();
    this._offSub = null;
    this._offStreams?.();
    this._offStreams = null;
  }

  // ── Data ─────────────────────────────────────────────────────────────

  private async _start(): Promise<void> {
    const reader = new LogFilePageReader();
    try {
      const res = await reader.loadLatest(PAGE_LIMIT);
      this._rows = res.entries.map(toRow);
      this._hasOlder = res.hasOlder;
      this._cursor = res.cursor;
      this._reader = reader;
      this._offSub = reader.subscribe((e) => this._append(toRow(e)));
      this._attachBottom = true;
    } catch {
      // Fall back to the in-memory log bus.
      this._pageFailed = true;
      this._rows = queryLog({ limit: PAGE_LIMIT }).map(toRow);
      this._hasOlder = false;
      this._offSub = subscribeLogs((e) => {
        if (e === null) {
          this._rows = [];
          this._attachBottom = true;
          return;
        }
        this._append(toRow(e));
      });
    }
    this._loading = false;
    await this.updateComplete;
    this._scheduleScrollToBottom();
  }

  private _append(row: Row): void {
    const last = this._rows[this._rows.length - 1];
    if (last && sameRow(last, row)) return;
    this._rows = [...this._rows, row];
    if (this._attachBottom) this._scheduleScrollToBottom();
  }

  private _scheduleScrollToBottom(): void {
    if (this._scrollPending) return;
    this._scrollPending = true;
    this._raf(() => {
      this._scrollPending = false;
      const el = this._listEl();
      if (el) el.scrollTop = el.scrollHeight;
    });
  }

  /** rAF with a synchronous fallback (jsdom test environments have no rAF). */
  private _raf(cb: () => void): void {
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(cb);
    else cb();
  }

  private _listEl(): HTMLElement | null {
    return this.renderRoot?.querySelector<HTMLElement>(".lp-list") ?? null;
  }

  private _onScroll(): void {
    const el = this._listEl();
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    this._attachBottom = atBottom;
    if (el.scrollTop < LOAD_OLDER_SCROLL_THRESHOLD && this._hasOlder && !this._loadingOlder) {
      void this._loadOlder();
    }
  }

  private async _loadOlder(): Promise<void> {
    if (!this._reader) return;
    this._loadingOlder = true;
    try {
      const el = this._listEl();
      this._lastScrollHeight = el?.scrollHeight ?? 0;
      const res = await this._reader.loadOlder(this._cursor, PAGE_LIMIT);
      const older = res.entries.map(toRow);
      const existing = new Set(this._rows.map((r) => `${r.timestamp}|${r.source}|${r.message}`));
      const fresh = older.filter((r) => !existing.has(`${r.timestamp}|${r.source}|${r.message}`));
      this._rows = [...fresh, ...this._rows];
      this._hasOlder = res.hasOlder;
      this._cursor = res.cursor;
      await this.updateComplete;
      // Preserve the visual position: keep the bottom edge where it was.
      if (el) el.scrollTop = el.scrollHeight - this._lastScrollHeight + el.scrollTop;
    } finally {
      this._loadingOlder = false;
    }
  }

  private _refreshStreams(): void {
    const streams = listLogStreams().map((s) => ({
      system: s.system,
      name: s.name,
      entryCount: s.entryCount,
    }));
    streams.sort((a, b) => a.system.localeCompare(b.system) || a.name.localeCompare(b.name));
    this._streams = streams;
  }

  // ── Filtering ────────────────────────────────────────────────────────

  private get _visibleRows(): Row[] {
    const lvl = this._minLevel;
    const streams = this._selectedStreams;
    const q = this._query.trim().toLowerCase();
    return this._rows.filter((r) => {
      if (r.level < lvl) return false;
      if (streams.length > 0 && !streams.includes(r.source)) return false;
      if (q) {
        const hay = `${r.source} ${r.system} ${r.message}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }

  private _setLevel(lvl: LogLevel): void {
    this._minLevel = lvl;
  }

  private _toggleStream(name: string): void {
    const has = this._selectedStreams.includes(name);
    this._selectedStreams = has
      ? this._selectedStreams.filter((s) => s !== name)
      : [...this._selectedStreams, name];
  }

  private _clearFilters(): void {
    this._minLevel = LogLevel.DEBUG;
    this._selectedStreams = [];
    this._query = "";
  }

  // ── Detail drawer ────────────────────────────────────────────────────

  private _openDetail(row: Row): void {
    this._detail = row;
    this._detailError = this._findCaptured(row);
    this._detailOpen = true;
  }

  private _findCaptured(row: Row): CapturedError | null {
    const list = getCapturedErrors();
    return (
      list.find((e) => e.message === row.message) ??
      list.find((e) => row.message.includes(e.message)) ??
      list.find((e) => e.message.includes(row.message)) ??
      null
    );
  }

  private _closeDetail(): void {
    this._detailOpen = false;
    this._detail = null;
    this._detailError = null;
  }

  // ── Render ───────────────────────────────────────────────────────────

  render(): TemplateResult {
    const rows = this._visibleRows;
    const errorCount = rows.filter((r) => r.level === LogLevel.ERROR).length;
    return html`
      <style>
        :host {
          display: flex;
          flex-direction: column;
          height: 100%;
          box-sizing: border-box;
          overflow: hidden;
          position: relative;
          background: var(--bg-primary, #1e1e1e);
          color: var(--text-primary, #d4d4d4);
          font-family: "Cascadia Code", "Fira Code", "JetBrains Mono", "Consolas", monospace;
          font-size: 12px;
        }
        .lp-toolbar {
          display: flex;
          align-items: center;
          flex-shrink: 0;
          height: 34px;
          padding: 0 8px;
          border-bottom: 1px solid var(--border-divider, #2d2d2d);
          background: var(--bg-primary, #1e1e1e);
          gap: 8px;
          box-sizing: border-box;
        }
        .lp-title {
          font-weight: 600;
          color: var(--text-secondary, #999);
          letter-spacing: 0.03em;
        }
        .lp-spacer {
          flex: 1;
        }
        .lp-error-btn {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          background: transparent;
          border: 1px solid transparent;
          color: var(--text-secondary, #999);
          cursor: pointer;
          font-family: inherit;
          font-size: 11px;
          padding: 2px 8px;
          border-radius: 4px;
        }
        .lp-error-btn:hover {
          background: rgba(255, 255, 255, 0.07);
          color: var(--text-primary, #fff);
        }
        .lp-error-btn .lp-err-count {
          display: inline-block;
          min-width: 14px;
          padding: 0 5px;
          border-radius: 8px;
          background: var(--danger, #e5484d);
          color: #fff;
          font-size: 10px;
          text-align: center;
        }
        .lp-filter-btn {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          background: transparent;
          border: 1px solid var(--border-divider, #2d2d2d);
          color: var(--text-secondary, #999);
          cursor: pointer;
          font-family: inherit;
          font-size: 11px;
          padding: 2px 9px;
          border-radius: 4px;
        }
        .lp-filter-btn:hover,
        .lp-filter-btn.active {
          background: rgba(255, 255, 255, 0.09);
          color: var(--text-primary, #fff);
        }
        .lp-list {
          flex: 1;
          overflow-y: auto;
          padding: 4px 0;
          overflow-anchor: none;
        }
        .lp-entry {
          display: flex;
          align-items: baseline;
          gap: 8px;
          padding: 1px 10px;
          white-space: pre-wrap;
          word-break: break-word;
          border-left: 2px solid transparent;
        }
        .lp-entry--error {
          cursor: pointer;
          background: rgba(229, 72, 77, 0.06);
        }
        .lp-entry--error:hover {
          background: rgba(229, 72, 77, 0.14);
        }
        .lp-level {
          flex-shrink: 0;
          width: 46px;
          text-align: right;
          font-weight: 600;
        }
        .lp-tag--error {
          color: #ff6b6b;
        }
        .lp-tag--warn {
          color: #f5a623;
        }
        .lp-tag--info {
          color: #5aa9ff;
        }
        .lp-tag--debug {
          color: #8a8a8a;
        }
        .lp-time {
          flex-shrink: 0;
          color: var(--text-muted, #888);
        }
        .lp-name {
          flex-shrink: 0;
          color: var(--text-secondary, #aaa);
        }
        .lp-err-hint {
          flex-shrink: 0;
          color: #ff6b6b;
          font-size: 10px;
        }
        .lp-text {
          flex: 1;
          min-width: 0;
        }
        .lp-empty,
        .lp-loading {
          padding: 20px 12px;
          font-style: italic;
          color: var(--text-muted, #888);
        }
        .lp-older-hint {
          padding: 6px 12px;
          font-size: 11px;
          color: var(--text-muted, #888);
        }
        /* ── Drawer layer ── */
        .lp-backdrop {
          position: absolute;
          inset: 0;
          background: rgba(0, 0, 0, 0.4);
          z-index: 5;
        }
        .lp-drawer {
          position: absolute;
          top: 0;
          right: 0;
          bottom: 0;
          width: 320px;
          max-width: 80%;
          background: var(--bg-secondary, #161616);
          border-left: 1px solid var(--border-divider, #2d2d2d);
          z-index: 6;
          display: flex;
          flex-direction: column;
          box-shadow: -8px 0 24px rgba(0, 0, 0, 0.4);
          transform: translateX(0);
        }
        .lp-drawer-head {
          display: flex;
          align-items: center;
          height: 34px;
          padding: 0 8px 0 12px;
          border-bottom: 1px solid var(--border-divider, #2d2d2d);
          font-size: 12px;
          font-weight: 600;
          flex-shrink: 0;
        }
        .lp-drawer-close {
          margin-left: auto;
          background: transparent;
          border: none;
          color: var(--text-secondary, #999);
          cursor: pointer;
          font-size: 14px;
          padding: 4px 8px;
        }
        .lp-drawer-body {
          flex: 1;
          overflow-y: auto;
          padding: 10px 12px;
          font-family: var(--font-ui, system-ui, sans-serif);
          font-size: 12px;
        }
        .lp-density {
          font-family: monospace;
          font-size: 11px;
        }
        .lp-sec {
          margin: 0 0 14px;
        }
        .lp-sec-title {
          display: block;
          margin-bottom: 6px;
          font-size: 11px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          color: var(--text-secondary, #999);
        }
        .lp-level-pills {
          display: flex;
          gap: 4px;
          flex-wrap: wrap;
        }
        .lp-pill {
          background: transparent;
          border: 1px solid var(--border-divider, #2d2d2d);
          color: var(--text-secondary, #999);
          cursor: pointer;
          font-family: inherit;
          font-size: 11px;
          padding: 3px 9px;
          border-radius: 4px;
        }
        .lp-pill.active {
          background: rgba(255, 255, 255, 0.12);
          color: var(--text-primary, #fff);
          border-color: var(--text-secondary, #999);
        }
        .lp-streams {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .lp-stream-row {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 3px 6px;
          border-radius: 4px;
          cursor: pointer;
          font-family: monospace;
          font-size: 11px;
        }
        .lp-stream-row:hover {
          background: rgba(255, 255, 255, 0.06);
        }
        .lp-stream-row input {
          margin: 0;
        }
        .lp-stream-count {
          margin-left: auto;
          color: var(--text-muted, #888);
        }
        .lp-query {
          width: 100%;
          box-sizing: border-box;
          background: var(--bg-primary, #1e1e1e);
          border: 1px solid var(--border-divider, #2d2d2d);
          color: var(--text-primary, #d4d4d4);
          font-family: inherit;
          font-size: 12px;
          padding: 5px 8px;
          border-radius: 4px;
        }
        .lp-drawer-actions {
          display: flex;
          gap: 8px;
          margin-top: 16px;
          flex-shrink: 0;
        }
        .lp-btn {
          background: rgba(255, 255, 255, 0.08);
          border: 1px solid var(--border-divider, #2d2d2d);
          color: var(--text-primary, #e0e0e0);
          cursor: pointer;
          font-family: inherit;
          font-size: 12px;
          padding: 5px 12px;
          border-radius: 4px;
        }
        .lp-btn:hover {
          background: rgba(255, 255, 255, 0.13);
        }
        .lp-btn--clear {
          background: transparent;
        }
        /* Detail drawer */
        .lp-detail-message {
          font-weight: 600;
          color: var(--danger, #ff6b6b);
          white-space: pre-wrap;
          word-break: break-word;
        }
        .lp-detail-meta {
          font-family: monospace;
          font-size: 11px;
          color: var(--text-secondary, #aaa);
          line-height: 1.6;
        }
        .lp-detail-stack {
          margin: 0;
          padding: 8px 10px;
          background: var(--bg-primary, #1e1e1e);
          border: 1px solid var(--border-divider, #2d2d2d);
          border-radius: 4px;
          font-family: monospace;
          font-size: 11px;
          line-height: 1.5;
          white-space: pre-wrap;
          word-break: break-word;
          color: var(--text-secondary, #bbb);
          overflow-x: auto;
        }
        .lp-empty-streams {
          color: var(--text-muted, #888);
          font-style: italic;
        }
      </style>

      <div class="lp-toolbar">
        <span class="lp-title">Logs</span>
        ${
          errorCount > 0
            ? html`
                <button
                  type="button"
                  class="lp-error-btn"
                  title="Jump to first error"
                  @click=${() => this._scrollToFirstError()}
                >
                  <span>Errors</span>
                  <span class="lp-err-count">${errorCount}</span>
                </button>
              `
            : nothing
        }
        <span class="lp-spacer"></span>
        <button
          type="button"
          class="lp-filter-btn${this._filterOpen ? " active" : ""}"
          title="Filter logs"
          data-testid="lp-filter-btn"
          @click=${() => (this._filterOpen = !this._filterOpen)}
        >
          ${
            this._selectedStreams.length > 0 || this._minLevel !== LogLevel.DEBUG || this._query
              ? "Filter ●"
              : "Filter"
          }
        </button>
      </div>

      <div class="lp-list" data-testid="lp-list" @scroll=${this._onScroll}>
        ${
          this._loading
            ? html`<div class="lp-loading">Loading logs…</div>`
            : rows.length === 0
              ? html`<div class="lp-empty">
                  No log entries${this._query ? " match the filter" : ""}.
                </div>`
              : html`
                  ${
                    this._hasOlder
                      ? html`<div class="lp-older-hint">Scroll up for older logs…</div>`
                      : nothing
                  }
                  ${
                    this._pageFailed
                      ? html`<div class="lp-older-hint">
                          Using in-memory log buffer (persisted history unavailable).
                        </div>`
                      : nothing
                  }
                  ${rows.map((r) => this._row(r))}
                `
        }
      </div>

      ${
        this._filterOpen
          ? html`
              <div
                class="lp-backdrop"
                data-testid="lp-filter-backdrop"
                @click=${() => (this._filterOpen = false)}
              ></div>
              <aside class="lp-drawer" data-testid="lp-filter-drawer">
                <div class="lp-drawer-head">
                  <span>Filter logs</span>
                  <button
                    class="lp-drawer-close"
                    aria-label="Close filters"
                    @click=${() => (this._filterOpen = false)}
                  >
                    ✕
                  </button>
                </div>
                <div class="lp-drawer-body">
                  <div class="lp-sec">
                    <span class="lp-sec-title">Minimum level</span>
                    <div class="lp-level-pills">
                      ${[LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR].map(
                        (lvl) => html`
                          <button
                            type="button"
                            class="lp-pill${lvl === this._minLevel ? " active" : ""}"
                            data-testid="lp-level-${LOG_LEVEL_LABELS[lvl]}"
                            @click=${() => this._setLevel(lvl)}
                          >
                            ${LOG_LEVEL_LABELS[lvl]}
                          </button>
                        `,
                      )}
                    </div>
                  </div>
                  <div class="lp-sec">
                    <span class="lp-sec-title">Streams</span>
                    <div class="lp-streams">
                      ${
                        this._streams.length === 0
                          ? html`<div class="lp-empty-streams">No streams logged yet.</div>`
                          : this._streams.map(
                              (s) => html`
                                <label class="lp-stream-row" data-testid="lp-stream-${s.name}">
                                  <input
                                    type="checkbox"
                                    .checked=${this._selectedStreams.includes(s.name)}
                                    @change=${() => this._toggleStream(s.name)}
                                  />
                                  <span>${s.name}</span>
                                  <span class="lp-stream-count">${s.entryCount}</span>
                                </label>
                              `,
                            )
                      }
                    </div>
                  </div>
                  <div class="lp-sec">
                    <span class="lp-sec-title">Text</span>
                    <input
                      type="text"
                      class="lp-query"
                      placeholder="Contains…"
                      data-testid="lp-query"
                      .value=${this._query}
                      @input=${(e: Event) => (this._query = (e.target as HTMLInputElement).value)}
                    />
                  </div>
                </div>
                <div class="lp-drawer-actions">
                  <button type="button" class="lp-btn lp-btn--clear" @click=${this._clearFilters}>
                    Clear filters
                  </button>
                  <button type="button" class="lp-btn" @click=${() => (this._filterOpen = false)}>
                    Done
                  </button>
                </div>
              </aside>
            `
          : nothing
      }
      ${
        this._detailOpen && this._detail
          ? html`
              <div
                class="lp-backdrop"
                data-testid="lp-detail-backdrop"
                @click=${this._closeDetail}
              ></div>
              <aside class="lp-drawer" data-testid="lp-detail-drawer">
                <div class="lp-drawer-head">
                  <span>Error details</span>
                  <button
                    class="lp-drawer-close"
                    aria-label="Close details"
                    @click=${this._closeDetail}
                  >
                    ✕
                  </button>
                </div>
                <div class="lp-drawer-body">
                  <div class="lp-sec">
                    <div class="lp-detail-message">
                      ${this._escape(this._detailError?.message ?? this._detail.message)}
                    </div>
                  </div>
                  <div class="lp-sec">
                    <span class="lp-sec-title"
                      >${this._detailError?.type ?? this._detail.levelLabel}</span
                    >
                    <div class="lp-detail-meta">
                      <div>source: ${this._escape(this._detail.source)}</div>
                      <div>system: ${this._escape(this._detail.system)}</div>
                      <div>
                        time: ${this._escape(formatDate(this._detail.timestamp))}
                        ${this._escape(formatTime(this._detail.timestamp))}
                      </div>
                    </div>
                  </div>
                  ${
                    this._detailError?.stack
                      ? html`
                          <div class="lp-sec">
                            <span class="lp-sec-title">Stack</span>
                            <pre class="lp-detail-stack">
${this._escape(this._detailError.stack)}</pre>
                          </div>
                        `
                      : this._detail.data
                        ? html`
                            <div class="lp-sec">
                              <span class="lp-sec-title">Data</span>
                              <pre class="lp-detail-stack">
${this._escape(JSON.stringify(this._detail.data, null, 2))}</pre>
                            </div>
                          `
                        : nothing
                  }
                </div>
              </aside>
            `
          : nothing
      }
    `;
  }

  private _row(r: Row): TemplateResult {
    const isError = r.level === LogLevel.ERROR;
    const levelClass = isError
      ? "lp-tag--error"
      : r.level === LogLevel.WARN
        ? "lp-tag--warn"
        : r.level === LogLevel.INFO
          ? "lp-tag--info"
          : "lp-tag--debug";
    return html`
      <div
        class="lp-entry${isError ? " lp-entry--error" : ""}"
        data-testid="lp-entry"
        data-level=${r.levelLabel}
        ${isError ? `role="button" tabindex="0"` : ""}
        @click=${isError ? () => this._openDetail(r) : nothing}
        @keydown=${
          isError
            ? (e: KeyboardEvent) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  this._openDetail(r);
                }
              }
            : nothing
        }
      >
        <span class="lp-level ${levelClass}">${r.levelLabel}</span>
        <span class="lp-time">${formatTime(r.timestamp)}</span>
        <span class="lp-name">[${r.source}]</span>
        ${isError ? html`<span class="lp-err-hint">ⓘ</span>` : nothing}
        <span class="lp-text">${this._escape(r.message)}</span>
      </div>
    `;
  }

  private _scrollToFirstError(): void {
    const idx = this._visibleRows.findIndex((r) => r.level === LogLevel.ERROR);
    if (idx < 0) return;
    this._raf(() => {
      const el = this._listEl();
      if (!el) return;
      const node = el.querySelectorAll<HTMLElement>("[data-testid=lp-entry]")[idx];
      if (node) node.scrollIntoView({ block: "center" });
    });
  }

  private _escape(s: string): string {
    const el = document.createElement("span");
    el.textContent = s;
    return el.innerHTML;
  }
}
