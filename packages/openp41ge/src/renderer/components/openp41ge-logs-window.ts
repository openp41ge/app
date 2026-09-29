/**
 * <openp41ge-logs-window> — the standalone Logs window root.
 *
 * Booted when the main process creates a window with windowType `"logs"`. It is
 * a resizable window (hiddenInset titlebar, like workspace windows) with a top
 * bar and a single shared <tab-grid> (no sidebars) so several log streams can
 * be watched side by side.
 *
 * The component reuses the uikit tab system rather than a hand-rolled grid:
 *   - <tab-grid> owns the columns, per-column <tab-bar>/<tab-content>, the
 *     drop targets, ghost previews and drag-split detection.
 *   - This component owns the LOCAL grid model (placements / active tabs / tab
 *     metadata) and mounts one <openp41ge-log-viewer> per tab via
 *     grid.mountController().
 *   - Drag/reorder/split/move are driven by the events the grid and its tab
 *     bars bubble up (grid-activate, grid-move, grid-split, tab-bar-reorder,
 *     tab-bar-move-cell, grid-focus-col). A thin logs-specific DragOrchestrator
 *     starts tab drags; it is intentionally NOT the workspace's drag system
 *     (which is coupled to the workspace model and is skipped for logs windows
 *     in StartupContext.wireServices).
 *
 * Each tab is a single log stream (one system). By default the grid opens one
 * tab per system that has logged, plus the platform. The top-bar "＋ Stream"
 * button opens the stream picker drawer; "＋ Column" opens a fresh empty
 * column. Clicking an ERROR row opens a detail drawer for that entry.
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
import {
  DragOrchestrator,
  TabDragSource,
  type TabGrid,
  type TargetResolver,
  type IDropTarget,
} from "openp41ge-uikit";
import { LogFilePageReader } from "../services/log-file-page-reader";
import { getCapturedErrors, type CapturedError } from "../services/error-capture-service";

interface LogTab {
  id: string;
  /** System (plugin id / platform) this tab filters to. */
  system: string;
  title: string;
}

interface Placement {
  position: { row: number; col: number };
  tabIds: string[];
}

interface DetailState {
  message: string;
  source: string;
  system: string;
  timestamp: number;
}

const TAB_PREFIX = "logtab-";
let _tabSeq = 0;

/** Stable grid window id — the logs grid is local to this window, so a single
 *  shared id is enough (the drop events carry it but this host ignores it). */
const WIN_ID = "logs-window";

@customElement("openp41ge-logs-window")
export class Openp41geLogsWindow extends LitElement {
  /** Fully store the grid state in `state` so Lit re-renders on change. */
  @state() private _tabs: LogTab[] = [];
  /** Column-ordered placements: `_placements[i].position.col === i`. */
  @state() private _placements: Placement[] = [];
  /** col (as string key) → active tab id in that column. */
  @state() private _activeTabIds: Record<string, string> = {};
  @state() private _pickerOpen = false;
  @state() private _pickerQuery = "";
  @state() private _detail: DetailState | null = null;
  /** When the first streams register, populate the default tabs once. */
  @state() private _defaultsApplied = false;

  private _viewers = new Map<string, Openp41geLogViewer>();
  private _offStreams: (() => void) | null = null;
  private _offLogs: (() => void) | null = null;
  private _detailUnsub: (() => void) | null = null;
  private _orchestrator: DragOrchestrator | null = null;
  /** Column new streams are opened in (last active/focused column). */
  private _lastActiveCol = 0;

  // ── Lifecycle ────────────────────────────────────────────────────────

  connectedCallback(): void {
    super.connectedCallback();
    this._setupDrag();
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
    this._teardownDrag();
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

  protected firstUpdated(): void {
    this._attachDetailListeners();
  }

  protected updated(changed: Map<string, unknown>): void {
    if (changed.has("_placements") || changed.has("_tabs")) {
      void this._mountViewers();
    }
  }

  // ── Drag setup (logs-specific, NOT the workspace drag system) ─────────

  private _resolveTarget: TargetResolver = (
    clientX: number,
    clientY: number,
  ): IDropTarget | null => {
    const el = document.elementFromPoint(clientX, clientY);
    if (!el) return null;
    // <tab-bar> and <tab-grid> are light-DOM components that expose their own
    // dropTarget; match them directly (the workspace resolver's legacy class
    // selectors do not apply to the uikit components).
    const tabBarEl = (el as Element).closest?.("tab-bar");
    if (tabBarEl instanceof HTMLElement) {
      const dt = (tabBarEl as unknown as { dropTarget?: IDropTarget }).dropTarget;
      if (dt) return dt;
    }
    const gridEl = (el as Element).closest?.("tab-grid");
    if (gridEl instanceof HTMLElement) {
      const dt = (gridEl as unknown as { dropTarget?: IDropTarget }).dropTarget;
      if (dt) return dt;
    }
    return null;
  };

  private _setupDrag(): void {
    if (this._orchestrator) return;
    this._orchestrator = new DragOrchestrator(this._resolveTarget);
    this.shadowRoot?.addEventListener("mousedown", this._onMouseDown);
    this.shadowRoot?.addEventListener("click", this._onTabCloseClick);
  }

  private _teardownDrag(): void {
    this._orchestrator?.dispose();
    this._orchestrator = null;
    this.shadowRoot?.removeEventListener("mousedown", this._onMouseDown);
    this.shadowRoot?.removeEventListener("click", this._onTabCloseClick);
  }

  private _onMouseDown = (e: Event): void => {
    const me = e as MouseEvent;
    // Only the primary button initiates tab drags; right/middle clicks must
    // never start one. Close buttons are handled by the click handler below.
    if (me.button !== 0) return;
    const target = me.target as Element | null;
    if (target?.closest?.(".tab-close")) return;
    const tabBtn = target?.closest?.("[data-tab-id]");
    if (!(tabBtn instanceof HTMLElement)) return;

    e.preventDefault();
    const tabId = tabBtn.getAttribute("data-tab-id") || "";
    const barEl = tabBtn.closest("tab-bar");
    if (!barEl) return;
    const bar = barEl as HTMLElement & { winId?: string };
    const winId = bar.winId || WIN_ID;
    const label = this._tabById(tabId)?.title ?? tabBtn.textContent?.trim() ?? "Tab";
    const source = new TabDragSource(tabBtn, tabId, winId, winId, label);
    this._orchestrator?.startDrag(source, me.clientX, me.clientY);
  };

  private _onTabCloseClick = (e: Event): void => {
    const el = (e.target as Element | null)?.closest?.(".tab-close[data-close-tab-id]");
    if (!(el instanceof HTMLElement)) return;
    e.preventDefault();
    e.stopPropagation();
    const tabId = el.getAttribute("data-close-tab-id");
    if (tabId) this._closeTab(tabId);
  };

  // ── Default tabs ─────────────────────────────────────────────────────

  /** Open one tab per system that has logged, placed in a single column. */
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
    this._setPlacements([{ position: { row: 0, col: 0 }, tabIds }]);
    this._reconcileActives();
    this._lastActiveCol = 0;
  }

  private _makeTab(system: string): LogTab {
    return { id: `${TAB_PREFIX}${_tabSeq++}`, system, title: system };
  }

  private _tabById(tabId: string): LogTab | undefined {
    return this._tabs.find((t) => t.id === tabId);
  }

  // ── Grid state helpers ───────────────────────────────────────────────

  private get _cols(): number {
    return Math.max(this._placements.length, 1);
  }

  private _colPlacement(col: number): Placement | undefined {
    return this._placements.find((p) => p.position.col === col);
  }

  /** Sort placements by column and renumber so `[i].position.col === i` — the
   *  invariant <tab-grid>'s `_getNextTabForCell` and GridDropTarget rely on. */
  private _setPlacements(placements: Placement[]): void {
    const sorted = [...placements].sort((a, b) => a.position.col - b.position.col);
    this._placements = sorted.map((p, i) => ({
      position: { row: 0, col: i },
      tabIds: p.tabIds,
    }));
  }

  /** Ensure every column that has tabs has a valid active id (first tab if the
   *  tracked one was closed/moved), and drop stale column entries. */
  private _reconcileActives(): void {
    const next: Record<string, string> = {};
    for (const p of this._placements) {
      const colStr = String(p.position.col);
      const cur = this._activeTabIds[colStr];
      next[colStr] = cur && p.tabIds.includes(cur) ? cur : (p.tabIds[0] ?? "");
    }
    this._activeTabIds = next;
  }

  private _activeTabIdFor(col: number): string {
    return this._activeTabIds[String(col)] ?? this._colPlacement(col)?.tabIds[0] ?? "";
  }

  /**
   * Move a tab into `targetCol` at `insertAt` (append when -1 / out of range).
   * Removes the source column if it empties (never below one column).
   */
  private _moveTab(tabId: string, targetCol: number, insertAt: number, activate = true): void {
    const boxes = this._placements.map((p) => ({ tabIds: [...p.tabIds] }));
    const srcIdx = boxes.findIndex((b) => b.tabIds.includes(tabId));
    if (srcIdx < 0) return;
    boxes[srcIdx].tabIds = boxes[srcIdx].tabIds.filter((id) => id !== tabId);

    let tIdx = targetCol;
    if (tIdx < 0 || tIdx > boxes.length) tIdx = boxes.length;
    if (tIdx >= boxes.length) boxes.push({ tabIds: [] });
    const at =
      insertAt < 0 ? boxes[tIdx].tabIds.length : Math.min(insertAt, boxes[tIdx].tabIds.length);
    boxes[tIdx].tabIds.splice(at, 0, tabId);

    if (boxes[srcIdx].tabIds.length === 0 && boxes.length > 1) {
      boxes.splice(srcIdx, 1);
    }

    this._setPlacements(boxes.map((b, i) => ({ position: { row: 0, col: i }, tabIds: b.tabIds })));
    this._reconcileActives();
    if (activate) {
      const landed = boxes.findIndex((b) => b.tabIds.includes(tabId));
      if (landed >= 0) {
        this._activeTabIds = { ...this._activeTabIds, [String(landed)]: tabId };
        this._lastActiveCol = landed;
      }
    }
  }

  /** Reorder a tab within a single column. */
  private _reorder(col: number, fromIndex: number, toIndex: number): void {
    const boxes = this._placements.map((p) => ({ tabIds: [...p.tabIds] }));
    const box = boxes[col];
    if (!box || fromIndex < 0 || fromIndex >= box.tabIds.length) return;
    if (toIndex < 0 || toIndex > box.tabIds.length) return;
    const [moved] = box.tabIds.splice(fromIndex, 1);
    box.tabIds.splice(toIndex, 0, moved);
    this._setPlacements(boxes.map((b, i) => ({ position: { row: 0, col: i }, tabIds: b.tabIds })));
    this._reconcileActives();
  }

  /** Split a tab into a fresh column placed at the given boundary. */
  private _splitTab(tabId: string, splitCol: number, splitLeft: boolean): void {
    const boxes = this._placements.map((p) => ({ tabIds: [...p.tabIds] }));
    const srcIdx = boxes.findIndex((b) => b.tabIds.includes(tabId));
    if (srcIdx < 0) return;
    boxes[srcIdx].tabIds = boxes[srcIdx].tabIds.filter((id) => id !== tabId);

    const at = Math.max(0, Math.min(splitLeft ? splitCol : splitCol + 1, boxes.length));
    boxes.splice(at, 0, { tabIds: [tabId] });

    // Remove the (now empty) source column if it has no tabs left.
    if (boxes.length > 1) {
      const emptyIdx = boxes.findIndex((b) => b.tabIds.length === 0);
      if (emptyIdx >= 0 && !boxes[emptyIdx].tabIds.includes(tabId)) {
        boxes.splice(emptyIdx, 1);
      }
    }

    this._setPlacements(boxes.map((b, i) => ({ position: { row: 0, col: i }, tabIds: b.tabIds })));
    this._reconcileActives();
    const landed = boxes.findIndex((b) => b.tabIds.includes(tabId));
    if (landed >= 0) {
      this._activeTabIds = { ...this._activeTabIds, [String(landed)]: tabId };
      this._lastActiveCol = landed;
    }
  }

  /** Open a fresh empty column at the end and focus it. */
  private _addColumn(): void {
    const boxes = this._placements.map((p) => ({ tabIds: [...p.tabIds] }));
    boxes.push({ tabIds: [] });
    this._setPlacements(boxes.map((b, i) => ({ position: { row: 0, col: i }, tabIds: b.tabIds })));
    this._reconcileActives();
    this._lastActiveCol = boxes.length - 1;
  }

  private _closeTab(tabId: string): void {
    const boxes = this._placements.map((p) => ({ tabIds: [...p.tabIds] }));
    const srcIdx = boxes.findIndex((b) => b.tabIds.includes(tabId));
    if (srcIdx < 0) return;
    boxes[srcIdx].tabIds = boxes[srcIdx].tabIds.filter((id) => id !== tabId);
    if (boxes.length > 1 && boxes[srcIdx].tabIds.length === 0) {
      boxes.splice(srcIdx, 1);
    }
    this._setPlacements(boxes.map((b, i) => ({ position: { row: 0, col: i }, tabIds: b.tabIds })));
    this._tabs = this._tabs.filter((t) => t.id !== tabId);
    this._releaseViewer(tabId);
    this._reconcileActives();
    if (this._lastActiveCol >= this._placements.length) this._lastActiveCol = 0;
  }

  // ── Tab / cell operations (public accessors used by tests) ───────────

  private _activate(col: number, tabId: string): void {
    const p = this._colPlacement(col);
    if (!p || !p.tabIds.includes(tabId)) return;
    this._lastActiveCol = col;
    this._activeTabIds = { ...this._activeTabIds, [String(col)]: tabId };
  }

  /** Open (or reuse) a tab for `system` in the given column. */
  private _openStream(system: string, col?: number): void {
    let targetCol = col ?? this._lastActiveCol;
    if (!this._colPlacement(targetCol)) {
      targetCol = this._placements.length ? this._placements[0].position.col : 0;
    }

    let tab = this._tabById(this._tabs.find((t) => t.system === system)?.id ?? "");
    if (!tab) {
      tab = this._makeTab(system);
      this._tabs = [...this._tabs, tab];
      this._moveTab(tab.id, targetCol, -1, true);
      return;
    }

    const currentCol = this._placements.findIndex((p) => p.tabIds.includes(tab.id));
    if (currentCol === targetCol && this._colPlacement(targetCol)) {
      this._activate(targetCol, tab.id);
    } else {
      this._moveTab(tab.id, targetCol, -1, true);
    }
  }

  // ── Grid event handlers (bubbled from <tab-grid> / <tab-bar>) ─────────

  private _onGridActivate = (e: Event): void => {
    const detail = (e as CustomEvent).detail ?? {};
    const tabId = detail.tabId as string | undefined;
    const col = detail.col as number | undefined;
    if (!tabId) return;
    const colNum =
      typeof col === "number" ? col : this._placements.findIndex((p) => p.tabIds.includes(tabId));
    this._activate(colNum, tabId);
  };

  private _onGridFocusCol = (e: Event): void => {
    const col = (e as CustomEvent).detail?.col as number | undefined;
    if (typeof col === "number") this._lastActiveCol = col;
  };

  private _onGridMove = (e: Event): void => {
    const detail = (e as CustomEvent).detail ?? {};
    const tabId = detail.tabId as string | undefined;
    if (!tabId) return;
    this._moveTab(
      tabId,
      Number(detail.targetCol) || 0,
      Number.isFinite(detail.insertAt) ? detail.insertAt : -1,
    );
  };

  private _onGridSplit = (e: Event): void => {
    const detail = (e as CustomEvent).detail ?? {};
    const tabId = detail.tabId as string | undefined;
    if (!tabId) return;
    this._splitTab(tabId, Number(detail.splitCol) || 0, Boolean(detail.splitLeft));
  };

  private _onReorder = (e: Event): void => {
    const detail = (e as CustomEvent).detail ?? {};
    this._reorder(Number(detail.col) || 0, Number(detail.fromIndex), Number(detail.toIndex));
  };

  private _onMoveCell = (e: Event): void => {
    const detail = (e as CustomEvent).detail ?? {};
    const tabId = detail.tabId as string | undefined;
    if (!tabId) return;
    this._moveTab(tabId, Number(detail.targetCol) || 0, Number(detail.dropIndex), true);
  };

  // ── Stream picker ────────────────────────────────────────────────────

  private _openPicker(): void {
    this._pickerOpen = true;
    this._pickerQuery = "";
  }

  private _closePicker(): void {
    this._pickerOpen = false;
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

  // ── Viewer mounting into <tab-grid> ──────────────────────────────────

  private _grid(): TabGrid | null {
    const grid = this.renderRoot?.querySelector("tab-grid");
    return grid ? (grid as unknown as TabGrid) : null;
  }

  /** Mount each tab's log viewer into its <tab-content> controller slot.
   *  Waits for the grid (and its tab-content children) to finish rendering so
   *  the controller divs exist before mounting. Idempotent — re-mounts after
   *  a re-render so viewers follow their tabs when they move columns. */
  private async _mountViewers(): Promise<void> {
    const grid = this._grid();
    if (!grid) return;
    try {
      await (grid as unknown as { updateComplete: Promise<void> }).updateComplete;
      const contents = grid.querySelectorAll("tab-content");
      await Promise.all(
        Array.from(contents).map(
          (tc) => (tc as unknown as { updateComplete: Promise<void> }).updateComplete,
        ),
      );
    } catch {
      // Defensive: if the grid is mid-teardown, skip this pass.
    }
    for (const tab of this._tabs) {
      if (!this._placements.some((p) => p.tabIds.includes(tab.id))) continue;
      const viewer = this._ensureViewer(tab);
      grid.mountController(tab.id, viewer);
    }
  }

  private _ensureViewer(tab: LogTab): Openp41geLogViewer {
    let viewer = this._viewers.get(tab.id);
    if (!viewer) {
      viewer = document.createElement(Openp41geLogViewer.tagName) as Openp41geLogViewer;
      viewer.pageReader = new LogFilePageReader();
      viewer.system = tab.system;
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

  private _tabData(): Record<string, { title: string; content: string; pinned: boolean }> {
    const data: Record<string, { title: string; content: string; pinned: boolean }> = {};
    for (const t of this._tabs) data[t.id] = { title: t.title, content: "", pinned: true };
    return data;
  }

  render(): TemplateResult {
    const isMac =
      typeof window !== "undefined" &&
      (window.openp41ge?.platform === "darwin" || navigator.platform.startsWith("Mac"));

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
          position: relative;
          display: flex;
          overflow: hidden;
        }
        .lw-grid tab-grid {
          flex: 1;
          min-width: 0;
          min-height: 0;
          display: block;
        }
        .lw-empty {
          position: absolute;
          inset: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 10px;
          color: var(--text-muted, #888);
          font-size: 12px;
          font-style: italic;
          pointer-events: none;
          background: var(--bg-primary, #1e1e1e);
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
        <div class="lw-titlebar" style="padding-left: ${isMac ? "82px" : "10px"}">
          <span class="lw-title">Logs</span>
          <button
            type="button"
            class="lw-btn"
            data-testid="lw-add-stream"
            @click=${this._openPicker}
          >
            ＋ Stream
          </button>
          <button
            type="button"
            class="lw-btn"
            data-testid="lw-add-column"
            @click=${this._addColumn}
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
          <tab-grid
            .winId=${WIN_ID}
            .cols=${this._cols}
            .placements=${this._placements}
            .tabData=${this._tabData()}
            .activeTabIds=${this._activeTabIds}
            @grid-activate=${this._onGridActivate}
            @grid-focus-col=${this._onGridFocusCol}
            @grid-move=${this._onGridMove}
            @grid-split=${this._onGridSplit}
            @tab-bar-reorder=${this._onReorder}
            @tab-bar-move-cell=${this._onMoveCell}
          ></tab-grid>
          ${
            this._tabs.length === 0
              ? html`<div class="lw-empty" data-testid="lw-empty">
                  <span>No log streams open.</span>
                  <button
                    type="button"
                    class="lw-btn"
                    style="pointer-events:auto"
                    @click=${this._openPicker}
                  >
                    ＋ Open a stream
                  </button>
                </div>`
              : nothing
          }
        </div>
      </div>

      ${
        this._pickerOpen
          ? html`
              <div class="lw-drawer-mask" @click=${this._closePicker}></div>
              <aside class="lw-drawer" data-testid="lw-picker">
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
                      ? html`<div class="lw-empty" style="position:static">No streams match.</div>`
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

  /** Renders a stream picker row. */
  private _pickerRow(s: LogStreamInfo): TemplateResult {
    const open = (): void => {
      this._closePicker();
      this._openStream(s.system);
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
