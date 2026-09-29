/**
 * <openp41ge-logs-window> — the standalone Logs window root.
 *
 * Booted when the main process creates a window with windowType `"logs"`. It is
 * a resizable window (hiddenInset titlebar, like workspace windows) with a top
 * bar and a tab bar, no sidebars, that shows log streams in a grid so several
 * streams can be watched side by side.
 *
 * Each tab is a single log stream (one system). By default the grid opens one
 * tab per system that has logged, plus one for the platform. The "+" button in
 * a column's tab bar opens the stream picker drawer to open specific streams.
 * Clicking an ERROR row opens a detail drawer for that entry.
 */

import { LitElement, html, type TemplateResult, nothing } from "lit";
import { state, customElement } from "lit/decorators.js";
import {
  listLogStreams,
  subscribeLogStreams,
  subscribeLogs,
  type LogStreamInfo,
} from "openp41ge-logger";
import { Openp41geLogViewer } from "openp41ge-logger/viewer";
import { LogFilePageReader } from "../services/log-file-page-reader";
import { getCapturedErrors, type CapturedError } from "../services/error-capture-service";

interface LogTab {
  id: string;
  /** System (plugin id / platform) this tab filters to. */
  system: string;
  title: string;
}

interface Cell {
  id: string;
  tabIds: string[];
  activeId: string;
}

interface DetailState {
  message: string;
  source: string;
  system: string;
  timestamp: number;
}

const TAB_PREFIX = "logtab-";
let _tabSeq = 0;
let _cellSeq = 0;

@customElement("openp41ge-logs-window")
export class Openp41geLogsWindow extends LitElement {
  /** Fully store the grid state in `state` so Lit re-renders on change. */
  @state() private _tabs: LogTab[] = [];
  @state() private _cells: Cell[] = [];
  /** Cell id the picker was opened from, or null when the drawer is closed. */
  @state() private _pickerFor: string | null = null;
  @state() private _pickerQuery = "";
  @state() private _detail: DetailState | null = null;
  @state() private _columnRatios: number[] = [];
  /** When the first streams register, populate the default tabs once. */
  private _defaultsApplied = false;

  private _viewers = new Map<string, Openp41geLogViewer>();
  private _offStreams: (() => void) | null = null;
  private _offLogs: (() => void) | null = null;
  private _detailUnsub: (() => void) | null = null;

  // ── Lifecycle ────────────────────────────────────────────────────────

  connectedCallback(): void {
    super.connectedCallback();
    // Build the default tab set from the systems that have logged so far. If
    // none have logged yet, subscribe and populate as soon as the first stream
    // registers (so a freshly booted app still gets its default tabs).
    if (listLogStreams().length > 0) {
      this._applyDefaults();
    }
    this._offStreams = subscribeLogStreams(() => {
      if (!this._defaultsApplied && listLogStreams().length > 0) {
        this._applyDefaults();
      }
      this.requestUpdate();
    });
    this._offLogs = subscribeLogs(() => this.requestUpdate());
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this._offStreams?.();
    this._offStreams = null;
    this._offLogs?.();
    this._offLogs = null;
    this._detachDetailListeners();
    for (const v of this._viewers.values()) {
      if (v.parentNode) v.parentNode.removeChild(v);
    }
    this._viewers.clear();
  }

  // ── Default tabs ─────────────────────────────────────────────────────

  /** Open one tab per system that has logged (grouping its streams), plus the
   *  platform if it has logged. All placed in a single column. */
  private _applyDefaults(): void {
    if (this._defaultsApplied) return;
    const systems = new Set(listLogStreams().map((s) => s.system));
    if (systems.size === 0) return;
    this._defaultsApplied = true;
    const tabs = [...systems]
      .sort((a, b) => a.localeCompare(b))
      .map((system) => this._makeTab(system));
    const tabIds = tabs.map((t) => t.id);
    this._tabs = tabs;
    this._cells = [
      {
        id: `cell-${_cellSeq++}`,
        tabIds,
        activeId: tabIds[0] ?? "",
      },
    ];
    this._columnRatios = [1];
  }

  private _makeTab(system: string): LogTab {
    return { id: `${TAB_PREFIX}${_tabSeq++}`, system, title: system };
  }

  // ── Tab / cell operations ────────────────────────────────────────────

  private _cell(cellId: string): Cell | undefined {
    return this._cells.find((c) => c.id === cellId);
  }

  private _tab(tabId: string): LogTab | undefined {
    return this._tabs.find((t) => t.id === tabId);
  }

  private _openStream(system: string, cellId: string | null): void {
    // Reuse an existing tab for the same system (activate it in its cell).
    const existing = this._tabs.find((t) => t.system === system);
    // Determine the target cell: the picker's cell, else the first cell.
    const target = this._cell(cellId ?? "") ??
      this._cells[0] ?? { id: `cell-${_cellSeq++}`, tabIds: [], activeId: "" };

    if (!this._cells.some((c) => c.id === target.id)) {
      this._cells = [...this._cells, target];
    }
    if (existing) {
      const cell = this._cell(target.id);
      if (cell && !cell.tabIds.includes(existing.id)) {
        this._updateCell(target.id, { tabIds: [...cell.tabIds, existing.id] });
      }
      this._updateCell(target.id, { activeId: existing.id });
      return;
    }

    const tab = this._makeTab(system);
    this._tabs = [...this._tabs, tab];
    this._updateCell(target.id, { tabIds: [...target.tabIds, tab.id], activeId: tab.id });
  }

  private _updateCell(cellId: string, patch: Partial<Cell>): void {
    this._cells = this._cells.map((c) => (c.id === cellId ? { ...c, ...patch } : c));
  }

  private _activateTab(cellId: string, tabId: string): void {
    this._updateCell(cellId, { activeId: tabId });
  }

  private _closeTab(cellId: string, tabId: string): void {
    const cell = this._cell(cellId);
    if (!cell || !cell.tabIds.includes(tabId)) return;
    const tabIds = cell.tabIds.filter((id) => id !== tabId);
    const activeId = tabIds.length === 0 ? "" : cell.activeId === tabId ? tabIds[0] : cell.activeId;
    this._updateCell(cellId, { tabIds, activeId });
    this._tabs = this._tabs.filter((t) => t.id !== tabId);
    this._releaseViewer(tabId);
    if (tabIds.length === 0) this._removeEmptyCell(cellId);
  }

  private _removeEmptyCell(cellId: string): void {
    // Never leave zero columns: keep a single empty cell so the "+" is usable.
    const remaining = this._cells.filter((c) => c.id !== cellId);
    this._cells = remaining.length > 0 ? remaining : [];
    this._columnRatios = this._normalizeRatios(this._columnRatios.slice(1));
    if (this._cells.length === 0) {
      const fresh = { id: `cell-${_cellSeq++}`, tabIds: [], activeId: "" };
      this._cells = [fresh];
      this._columnRatios = [1];
    }
  }

  /** Split a cell into two columns (moves it to a fresh right-hand column). */
  private _splitCell(cellId: string): void {
    const cell = this._cell(cellId);
    if (!cell) return;
    // A fresh column that hosts no tabs yet is opened next to the current cell.
    const fresh = { id: `cell-${_cellSeq++}`, tabIds: [], activeId: "" };
    const idx = this._cells.findIndex((c) => c.id === cellId);
    const cells = [...this._cells.slice(0, idx + 1), fresh, ...this._cells.slice(idx + 1)];
    this._cells = cells;
    const ratios = [
      ...this._columnRatios.slice(0, idx + 1),
      1,
      ...this._columnRatios.slice(idx + 1),
    ];
    this._columnRatios = this._normalizeRatios(ratios);
  }

  private _normalizeRatios(ratios: number[]): number[] {
    if (ratios.length === 0) return [1];
    const sum = ratios.reduce((a, b) => a + b, 0) || 1;
    return ratios.map((r) => r / sum);
  }

  // ── Stream picker ────────────────────────────────────────────────────

  private _openPicker(cellId: string): void {
    this._pickerFor = cellId;
    this._pickerQuery = "";
  }

  private _closePicker(): void {
    this._pickerFor = null;
  }

  private _availableStreams(): LogStreamInfo[] {
    const q = this._pickerQuery.trim().toLowerCase();
    const streams = listLogStreams();
    if (!q) return streams;
    return streams.filter(
      (s) => s.system.toLowerCase().includes(q) || s.name.toLowerCase().includes(q),
    );
  }

  // ── Detail drawer ────────────────────────────────────────────────────

  private _attachDetailListeners(): void {
    if (this._detailUnsub) return;
    const handler = (e: Event): void => {
      const el = (e.target as HTMLElement | null)?.closest?.(`.level-error`);
      if (!el) return;
      const row = el.closest(".log-entry") as HTMLElement | null;
      if (!row) return;
      const message = row.querySelector(".log-message")?.textContent?.trim() ?? "";
      const source = row.querySelector(".log-source")?.textContent?.trim() ?? "";
      const system = row.querySelector(".log-system")?.textContent?.trim() ?? "";
      const tsEl = row.querySelector(".log-time")?.textContent?.trim() ?? "";
      const timestamp = Date.parse(tsEl) || Date.now();
      this._detail = { message, source, system, timestamp };
    };
    this.shadowRoot?.addEventListener("click", handler);
    this._detailUnsub = () => this.shadowRoot?.removeEventListener("click", handler);
  }

  private _closeDetail(): void {
    this._detail = null;
  }

  private _detachDetailListeners(): void {
    this._detailUnsub?.();
    this._detailUnsub = null;
  }

  // ── Viewer mounting ──────────────────────────────────────────────────

  private _ensureViewer(tab: LogTab, host: HTMLElement): Openp41geLogViewer {
    let viewer = this._viewers.get(tab.id);
    if (!viewer) {
      viewer = document.createElement(Openp41geLogViewer.tagName) as Openp41geLogViewer;
      viewer.pageReader = new LogFilePageReader();
      viewer.system = tab.system;
      host.appendChild(viewer);
      this._viewers.set(tab.id, viewer);
    }
    return viewer;
  }

  private _releaseViewer(tabId: string): void {
    const viewer = this._viewers.get(tabId);
    if (viewer?.parentNode) viewer.parentNode.removeChild(viewer);
    this._viewers.delete(tabId);
  }

  // ── Render ───────────────────────────────────────────────────────────

  protected firstUpdated(): void {
    this._attachDetailListeners();
  }

  protected updated(): void {
    // Keep each cell's active-tab viewer mounted (and only it visible). The
    // viewer element is created lazily and reused across re-renders; Lit's
    // re-render never touches it because it lives inside the stable
    // .lw-content container rather than being part of the template.
    for (const cell of this._cells) {
      const content = this.renderRoot?.querySelector<HTMLElement>(
        `.lw-content[data-cell="${cell.id}"]`,
      );
      if (!content) continue;
      const tab = this._tab(cell.activeId);
      if (!tab) continue;
      const viewer = this._ensureViewer(tab, content);
      content.querySelectorAll<HTMLElement>("openp41ge-log-viewer").forEach((v) => {
        v.style.display = v === viewer ? "flex" : "none";
        if (v === viewer) {
          v.style.flex = "1";
          v.style.minHeight = "0";
        }
      });
    }
  }

  render(): TemplateResult {
    const isMac =
      typeof window !== "undefined" &&
      (window.openp41ge?.platform === "darwin" || navigator.platform.startsWith("Mac"));
    const ratios =
      this._columnRatios.length === this._cells.length
        ? this._columnRatios
        : this._normalizeRatios(this._columnRatios.concat([1]));

    return html`
      <style>
        :host {
          display: block;
          height: 100%;
          overflow: hidden;
        }
        .lw-root {
          display: flex;
          flex-direction: column;
          height: 100%;
          min-height: 0;
          box-sizing: border-box;
          background: var(--bg-primary, #1e1e1e);
          color: var(--text-primary, #d4d4d4);
          font-family: "Cascadia Code", "Fira Code", "JetBrains Mono", "Consolas", monospace;
        }
        .lw-titlebar {
          flex-shrink: 0;
          height: 40px;
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 0 10px;
          border-bottom: 1px solid var(--border-divider, #2d2d2d);
          background: var(--bg-primary, #1e1e1e);
          -webkit-app-region: drag;
          user-select: none;
        }
        .lw-title {
          font-weight: 600;
          color: var(--text-secondary, #999);
          letter-spacing: 0.03em;
          font-size: 13px;
        }
        .lw-titlebar .lw-spacer {
          flex: 1;
        }
        .lw-titlebar button,
        .lw-winbtn {
          -webkit-app-region: no-drag;
        }
        .lw-btn {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          height: 26px;
          padding: 0 10px;
          border: 1px solid var(--border-divider, #333);
          border-radius: 5px;
          background: var(--bg-secondary, #161616);
          color: var(--text-primary, #ccc);
          font-size: 12px;
          font-family: var(--font-ui, sans-serif);
          cursor: pointer;
        }
        .lw-btn:hover {
          background: var(--bg-hover, #262626);
        }
        .lw-winbtn {
          width: 46px;
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          color: var(--text-secondary, #aaa);
          font-size: 14px;
          font-family: var(--font-ui, sans-serif);
        }
        .lw-winbtn:hover {
          background: var(--bg-hover, #333);
        }
        .lw-winbtn.lw-close:hover {
          background: #e81123;
          color: #fff;
        }
        .lw-grid {
          flex: 1;
          min-height: 0;
          display: flex;
          overflow: hidden;
        }
        .lw-cell {
          display: flex;
          flex-direction: column;
          min-width: 0;
          min-height: 0;
          overflow: hidden;
          border-right: 1px solid var(--border-divider, #232323);
        }
        .lw-cell:last-child {
          border-right: none;
        }
        .lw-tabbar {
          flex-shrink: 0;
          height: 36px;
          display: flex;
          align-items: center;
          gap: 4px;
          padding: 0 6px;
          border-bottom: 1px solid var(--border-divider, #2d2d2d);
          background: var(--bg-secondary, #161616);
          overflow-x: auto;
          box-sizing: border-box;
        }
        .lw-tabbar::-webkit-scrollbar {
          height: 0;
        }
        .lw-chip {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          height: 26px;
          padding: 0 8px;
          border: 1px solid transparent;
          border-radius: 5px;
          color: var(--text-secondary, #999);
          font-size: 12px;
          font-family: var(--font-ui, sans-serif);
          cursor: pointer;
          white-space: nowrap;
          flex-shrink: 0;
          user-select: none;
        }
        .lw-chip:hover {
          background: var(--bg-hover, #262626);
        }
        .lw-chip.lw-active {
          background: var(--bg-hover, #262626);
          color: var(--text-primary, #e0e0e0);
          border-color: var(--border-divider, #333);
        }
        .lw-chip .lw-close {
          display: inline-flex;
          width: 14px;
          height: 14px;
          align-items: center;
          justify-content: center;
          border-radius: 3px;
          color: var(--text-muted, #888);
          font-size: 10px;
          line-height: 1;
        }
        .lw-chip .lw-close:hover {
          background: var(--danger, #e81123);
          color: #fff;
        }
        .lw-add {
          flex-shrink: 0;
          width: 26px;
          height: 26px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border: 1px solid var(--border-divider, #333);
          border-radius: 5px;
          color: var(--text-secondary, #aaa);
          font-size: 14px;
          font-family: var(--font-ui, sans-serif);
          cursor: pointer;
        }
        .lw-add:hover {
          background: var(--bg-hover, #262626);
        }
        .lw-content {
          flex: 1;
          min-height: 0;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        .lw-empty {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--text-muted, #888);
          font-size: 12px;
          font-style: italic;
        }
        .lw-drawer-mask {
          position: absolute;
          inset: 0;
          z-index: 5;
          background: rgba(0, 0, 0, 0.4);
        }
        .lw-drawer {
          position: absolute;
          top: 0;
          right: 0;
          bottom: 0;
          width: 340px;
          max-width: 80%;
          z-index: 6;
          display: flex;
          flex-direction: column;
          background: var(--bg-secondary, #161616);
          border-left: 1px solid var(--border-divider, #2d2d2d);
          box-shadow: -8px 0 24px rgba(0, 0, 0, 0.35);
          box-sizing: border-box;
        }
        .lw-drawer-head {
          flex-shrink: 0;
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 12px;
          border-bottom: 1px solid var(--border-divider, #2d2d2d);
          font-size: 13px;
          font-weight: 600;
          font-family: var(--font-ui, sans-serif);
        }
        .lw-drawer-close {
          margin-left: auto;
          width: 22px;
          height: 22px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: 4px;
          color: var(--text-muted, #888);
          cursor: pointer;
          font-family: var(--font-ui, sans-serif);
        }
        .lw-drawer-close:hover {
          background: var(--bg-hover, #262626);
        }
        .lw-picker-search {
          flex-shrink: 0;
          margin: 10px 12px 0;
          padding: 6px 10px;
          border: 1px solid var(--border-divider, #333);
          border-radius: 5px;
          background: var(--bg-primary, #1e1e1e);
          color: var(--text-primary, #d4d4d4);
          font-size: 12px;
          font-family: var(--font-ui, sans-serif);
          outline: none;
        }
        .lw-picker-list {
          flex: 1;
          min-height: 0;
          overflow-y: auto;
          padding: 8px 6px;
        }
        .lw-picker-row {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 6px 8px;
          border-radius: 5px;
          cursor: pointer;
          font-size: 12px;
          font-family: var(--font-ui, sans-serif);
        }
        .lw-picker-row:hover {
          background: var(--bg-hover, #262626);
        }
        .lw-picker-row .lw-sys {
          flex: 1;
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .lw-picker-row .lw-count {
          flex-shrink: 0;
          color: var(--text-muted, #888);
          font-size: 11px;
          background: var(--bg-primary, #1e1e1e);
          border-radius: 8px;
          padding: 1px 7px;
        }
        .lw-detail-body {
          flex: 1;
          min-height: 0;
          overflow-y: auto;
          padding: 12px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .lw-sec-title {
          color: var(--text-muted, #888);
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          font-family: var(--font-ui, sans-serif);
        }
        .lw-detail-message {
          white-space: pre-wrap;
          word-break: break-word;
          color: var(--text-primary, #d4d4d4);
        }
        .lw-detail-meta {
          display: flex;
          flex-direction: column;
          gap: 4px;
          color: var(--text-secondary, #aaa);
          font-size: 12px;
        }
      </style>

      <div class="lw-root">
        <div class="lw-titlebar">
          ${isMac ? nothing : html``}
          <span class="lw-title">Logs</span>
          <button
            type="button"
            class="lw-btn"
            @click=${() => this._splitCell(this._cells[0]?.id ?? "")}
          >
            ＋ Column
          </button>
          <span class="lw-spacer"></span>
          ${
            isMac
              ? nothing
              : html`
                  <div class="lw-winbtn" @click=${() => window.openp41ge?.window.minimize()}>─</div>
                  <div class="lw-winbtn" @click=${() => window.openp41ge?.window.maximize()}>□</div>
                  <div class="lw-winbtn lw-close" @click=${() => window.openp41ge?.window.close()}>
                    ✕
                  </div>
                `
          }
        </div>

        <div class="lw-grid">
          ${this._cells.map((cell, i) => this._renderCell(cell, i, ratios[i] ?? 1))}
          ${
            this._cells.length === 0
              ? html`<div class="lw-empty">No log columns — use ＋ Column to add one.</div>`
              : nothing
          }
        </div>
      </div>

      ${
        this._pickerFor
          ? html`
              <div class="lw-drawer-mask" @click=${this._closePicker}></div>
              <aside class="lw-drawer">
                <div class="lw-drawer-head">
                  <span>Open a log stream</span>
                  <button
                    type="button"
                    class="lw-drawer-close"
                    @click=${this._closePicker}
                    aria-label="Close"
                  >
                    ✕
                  </button>
                </div>
                <input
                  type="text"
                  class="lw-picker-search"
                  placeholder="Filter streams…"
                  data-testid="lw-picker-search"
                  .value=${this._pickerQuery}
                  @input=${(e: Event) => (this._pickerQuery = (e.target as HTMLInputElement).value)}
                />
                <div class="lw-picker-list" data-testid="lw-picker-list">
                  ${
                    this._availableStreams().length === 0
                      ? html`<div class="lw-empty">No streams match.</div>`
                      : this._availableStreams().map((s) => this._pickerRow(s))
                  }
                </div>
              </aside>
            `
          : nothing
      }
      ${
        this._detail
          ? html`
              <div class="lw-drawer-mask" @click=${this._closeDetail}></div>
              <aside class="lw-drawer" data-testid="lw-detail-drawer">
                <div class="lw-drawer-head">
                  <span>Error detail</span>
                  <button
                    type="button"
                    class="lw-drawer-close"
                    @click=${this._closeDetail}
                    aria-label="Close"
                  >
                    ✕
                  </button>
                </div>
                <div class="lw-detail-body">
                  <div>
                    <div class="lw-sec-title">Message</div>
                    <div class="lw-detail-message">${this._escape(this._detail.message)}</div>
                  </div>
                  <div class="lw-detail-meta">
                    <div>
                      <span class="lw-sec-title">Source </span>${this._escape(this._detail.source)}
                    </div>
                    <div>
                      <span class="lw-sec-title">System </span>${this._escape(this._detail.system)}
                    </div>
                    <div>
                      <span class="lw-sec-title">Time </span
                      >${new Date(this._detail.timestamp).toLocaleString()}
                    </div>
                  </div>
                  ${this._detailStack(this._detail)}
                </div>
              </aside>
            `
          : nothing
      }
    `;
  }

  private _renderCell(cell: Cell, index: number, ratio: number): TemplateResult {
    const active = this._tab(cell.activeId);
    return html`
      <div class="lw-cell" style="flex: ${ratio}" data-testid="lw-cell">
        <div class="lw-tabbar">
          ${cell.tabIds.map((tid) => this._tabChip(cell, tid))}
          <button
            type="button"
            class="lw-add"
            data-testid="lw-add"
            title="Open a log stream"
            @click=${() => this._openPicker(cell.id)}
          >
            ＋
          </button>
          <button
            type="button"
            class="lw-add"
            title="Split into a new column"
            data-testid="lw-split"
            @click=${() => this._splitCell(cell.id)}
          >
            ▥
          </button>
        </div>
        <div class="lw-content" data-cell=${cell.id}>
          ${
            active
              ? nothing
              : html`<div class="lw-empty">No tab open — press ＋ to open a stream.</div>`
          }
        </div>
      </div>
    `;
  }

  private _tabChip(cell: Cell, tabId: string): TemplateResult | typeof nothing {
    const tab = this._tab(tabId);
    if (!tab) return nothing;
    return html`
      <div
        class="lw-chip${tabId === cell.activeId ? " lw-active" : ""}"
        data-testid="lw-chip"
        @click=${() => this._activateTab(cell.id, tabId)}
      >
        <span class="lw-chip-label">${this._escape(tab.title)}</span>
        <span
          class="lw-close"
          role="button"
          aria-label="Close tab"
          @click=${(e: Event) => {
            e.stopPropagation();
            this._closeTab(cell.id, tabId);
          }}
        >
          ×
        </span>
      </div>
    `;
  }

  /** Renders a (re-)mountable host element so Lit doesn't clobber the live
   *  viewer DOM between re-renders. The viewer is created lazily and reused. */
  private _pickerRow(s: LogStreamInfo): TemplateResult {
    const open = (): void => {
      const forCell = this._pickerFor;
      this._closePicker();
      this._openStream(s.system, forCell);
    };
    return html`
      <div class="lw-picker-row" data-testid="lw-picker-row" @click=${open}>
        <span class="lw-sys"
          >${this._escape(s.system)}${this._escape(s.name === s.system ? "" : ` (${s.name})`)}</span
        >
        <span class="lw-count">${s.entryCount}</span>
      </div>
    `;
  }

  private _detailStack(detail: DetailState): TemplateResult | typeof nothing {
    // Best-effort: surface a captured error's stack when the message matches.
    const captured: CapturedError | undefined = getCapturedErrors().find(
      (e) => e.message === detail.message,
    );
    if (!captured?.stack) return nothing;
    return html`
      <div>
        <div class="lw-sec-title">Stack</div>
        <pre class="lw-detail-message">${this._escape(String(captured.stack))}</pre>
      </div>
    `;
  }

  private _escape(text: string): string {
    return text.replace(
      /[&<>"']/g,
      (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[m] ?? m,
    );
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "openp41ge-logs-window": Openp41geLogsWindow;
  }
}
