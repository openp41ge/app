/**
 * init-drag-system — Initializes the openp41ge-tabs drag-and-drop system.
 *
 * Cross-window drag:
 *   - Main process broadcasts drag-state (active/inactive) to all windows
 *   - When drag-state=active, every window tracks _remoteDragActive
 *   - On mousemove, if _remoteDragActive and cursor is over a drop target,
 *     show grid ghost overlay locally (no IPC per frame needed)
 *   - On mouseup, if no local drag and _remoteDragActive, query main process
 *     for drag data, resolve local target, dispatch workspace operation
 */

import {
  DragOrchestrator,
  TabDragSource,
  GhostManager,
  DRAG_EVENTS,
  computeDropTarget,
  type IDragSource,
  type IDropTarget,
  type DragResult,
  type DragSourceData,
} from "../openp41ge-tabs-adapter";

import { createLogger } from "openp41ge-logger";

const log = createLogger("openp41ge", "cross-window-drag");

import { FileDragSource } from "./drag-sources/file-drag-source";
import { GitEntryDragSource } from "./drag-sources/git-entry-drag-source";
import { LogStreamDragSource } from "./drag-sources/log-stream-drag-source";
import { ClosedSidebarDropTarget } from "./drop-targets/closed-sidebar-drop-target";
import { ExplorerReorderDropTarget } from "./drop-targets/explorer-reorder-drop-target";
import {
  SidebarDropTarget,
  setSidebarDropFeedbackSuppressed,
} from "./drop-targets/sidebar-drop-target";
import { SIDEBAR_DROP_EVENT } from "openp41ge-constants";

// ─── SidebarTabDragSource — drag source for sidebar system tabs ──────────

class SidebarTabDragSource implements IDragSource {
  readonly type = "sidebar-tab";

  private _el: HTMLElement;
  private _tabId: string;
  private _side: string;
  private _winId: string;
  private _title: string;
  private _ghost: HTMLElement | null = null;
  private _ghostFactory?: () => HTMLElement;

  constructor(
    el: HTMLElement,
    tabId: string,
    side: string,
    winId: string,
    title: string,
    ghostFactory?: () => HTMLElement,
  ) {
    this._el = el;
    this._tabId = tabId;
    this._side = side;
    this._winId = winId;
    this._title = title;
    this._ghostFactory = ghostFactory;
  }

  createGhost(): HTMLElement {
    // Like grid tabs/files, the in-DOM ghost is invisible — the visible drag
    // element is the main-process bitmap ghost (DragGhostManager).
    if (this._ghostFactory) {
      const ghost = this._ghostFactory();
      this._ghost = ghost;
      return ghost;
    }

    const ghost = document.createElement("div");
    ghost.classList.add("openp41ge-drag-ghost");
    const label = document.createElement("span");
    label.textContent = this._title;
    ghost.appendChild(label);

    const w = this._el.offsetWidth || 120;
    const h = this._el.offsetHeight || 28;

    ghost.style.cssText = [
      "position:fixed",
      `height:${h}px`,
      `width:${w}px`,
      "padding:4px 14px",
      "display:block",
      "line-height:14px",
      "font-size:12px",
      "color:#e0e0e0",
      "background:#2a2a2a",
      "border-radius:4px",
      "outline:2px solid rgba(74,158,255,0.60)",
      "outline-offset:2px",
      "box-shadow:0 4px 12px rgba(0,0,0,0.3)",
      "z-index:99999",
      "pointer-events:none",
      "opacity:0.85",
      "overflow:hidden",
      "white-space:nowrap",
      "text-overflow:ellipsis",
      "box-sizing:border-box",
    ].join(";");

    ghost.dataset.dragGhostWidth = String(w);
    ghost.dataset.dragGhostHeight = String(h);
    this._ghost = ghost;
    return ghost;
  }

  getDragData(): DragSourceData {
    return {
      type: "system-tab",
      tabId: this._tabId,
      side: this._side,
      winId: this._winId,
      title: this._title,
    };
  }

  onDragStart(): void {
    this._el.style.opacity = "0.4";
  }

  onDragEnd(_result: DragResult): void {
    this._el.style.opacity = "1";
    if (this._ghost && this._ghost.parentNode) {
      this._ghost.parentNode.removeChild(this._ghost);
    }
    this._ghost = null;
  }
}

let _orchestrator: DragOrchestrator | null = null;
let _currentSource: IDragSource | null = null;
/** File row whose native draggable was disabled for a custom drag gesture (restored on end). */
let _fileRowSuppressedDrag: HTMLElement | null = null;
let _ghostManager = new GhostManager();

/** Whether another Electron window has an active drag. */
let _remoteDragActive = false;
/** Drag source type of the remote (other-window) drag, from the drag-state broadcast. */
let _remoteDragType: string | null = null;
/** Whether our window has an active local drag. */
let _localDragActive = false;

/** Set when a file drag meets the threshold. Used to create new window on mouseup if not dropped on target. */
let _localFileDragActive = false;
/** Pending file path for new-window creation when file drag ends without a valid drop target. */
let _pendingFileDetachPath: string | null = null;
/** Set to true when a file is successfully dropped on a grid target (via grid-open-tab). */
let _fileDropHandled = false;
/**
 * Set once a file drag engages (threshold met) so the trailing browser `click`
 * on the source row can be suppressed — otherwise releasing back over the
 * explorer after a drag is seen as a click and opens the file. Files should
 * only open on an explicit grid drop.
 */
let _suppressFileRowClick = false;

/** Last screen position from POSITION events — used for new-window positioning. */
let _lastScreenPos = { screenX: 0, screenY: 0 };

/** Deferred drag:start params for tab drags, captured on mousedown, fired on first POSITION event. */
let _pendingDragStart: {
  label: string;
  screenX: number;
  screenY: number;
  tabId: string;
  winId: string;
  worksetId: string;
  tabWidth: number;
  tabHeight: number;
  offsetX: number;
  offsetY: number;
  /** Source tab button rect (viewport coords) for the main-process capturePage snapshot. */
  captureRect: { x: number; y: number; width: number; height: number };
} | null = null;

/**
 * Ghost capture inset (px) applied to the tab-button rect. Trims the tab's 1px
 * separator border (and any drop-indicator line clipped at the edge) so the
 * bitmap ghost is a clean copy of the tab interior.
 */
const TAB_GHOST_CAPTURE_INSET = 2;

/**
 * Deferred drag:start params for sidebar tab drags — captured on mousedown,
 * fired on the first POSITION event (like grid tabs, so the sidebar tab gets
 * the same pixel-accurate bitmap ghost).
 */
let _pendingSidebarDragStart: {
  label: string;
  screenX: number;
  screenY: number;
  tabId: string;
  side: string;
  winId: string;
  width: number;
  height: number;
  offsetX: number;
  offsetY: number;
  /** Source sidebar-tab rect (viewport coords), trimmed by TAB_GHOST_CAPTURE_INSET. */
  captureRect: { x: number; y: number; width: number; height: number };
} | null = null;

/**
 * Source sidebar side of the most recent sidebar-tab drag.
 *
 * Survives drag teardown: the orchestrator fires DRAG_EVENTS.END (which makes
 * the host tear down and null _currentSource) BEFORE it resolves the drop
 * target on mouseup, so the final resolve can't see the live source. This flag
 * lets the resolver still know the drag was a system-tab (and from which side)
 * for that final resolve. Cleared when any non-sidebar drag starts (grid tab /
 * file) or when a drag is interrupted, so it never leaks into another gesture.
 */
let _sidebarTabDragSide: "left" | "right" | null = null;

/** Deferred drag:start params for file drags. */
let _pendingFileDragStart: {
  label: string;
  screenX: number;
  screenY: number;
  filePath: string;
  winId: string;
  offsetX: number;
  offsetY: number;
  elementWidth: number;
  elementHeight: number;
  /** Source row rect (viewport coords) for the main-process capturePage snapshot. */
  captureRect: { x: number; y: number; width: number; height: number };
} | null = null;

/**
 * Deferred drag:start params for git-entry (repo/worktree row) drags —
 * captured on mousedown, fired on the first POSITION event exactly like
 * file/tab backlog. The open-tab payload rides `openTabData` into the main
 * process so a cross-window drop can resolve appType/tabConfig.
 */
let _pendingGitEntryDragStart: {
  label: string;
  screenX: number;
  screenY: number;
  repoName: string;
  branch?: string;
  /** Search-result rows drag the git-commit-search app (placeholder); others
   * the git-repository browser. Defaults to git-repository on the wire. */
  appType?: string;
  /** Full commit hash for search-result rows. */
  hash?: string;
  winId: string;
  offsetX: number;
  offsetY: number;
  elementWidth: number;
  elementHeight: number;
  /** Source row rect (viewport coords) for the main-process capturePage snapshot. */
  captureRect: { x: number; y: number; width: number; height: number };
} | null = null;

/**
 * Deferred drag:start params for log-stream (Logs sidebar row) drags — captured
 * on mousedown, fired on the first POSITION event exactly like file/tab/git
 * backlog. The open-tab payload rides `openTabData` so a TARGET window's
 * cross-window drop can open a stream-scoped log-viewer pane.
 */
let _pendingLogStreamDragStart: {
  label: string;
  screenX: number;
  screenY: number;
  system: string;
  winId: string;
  offsetX: number;
  offsetY: number;
  elementWidth: number;
  elementHeight: number;
  /** Source row rect (viewport coords) for the main-process capturePage snapshot. */
  captureRect: { x: number; y: number; width: number; height: number };
} | null = null;

/** Set to true when a git-entry drag engages so the trailing browser `click`
 * on the source row can be suppressed — otherwise releasing back over the
 * explorer after a drag is seen as a click and toggles the repo/worktree.
 * Actions should only happen on an explicit drop (grid open / explorer
 * reorder / cancel). */
let _suppressGitEntryRowClick = false;

/** Git-entry (repo/worktree) row whose native draggable was disabled for a
 * custom drag gesture (restored on end). */
let _gitEntryRowSuppressedDrag: HTMLElement | null = null;

/** Set to true when a log-stream drag engages so the trailing browser `click`
 * on the source row can be suppressed — otherwise releasing back over the
 * sidebar after a drag is seen as a click and re-opens the stream as if it
 * were a plain click. A stream should only open on an explicit grid drop (or
 * a plain click that never became a drag). */
let _suppressLogStreamRowClick = false;

/**
 * The window ID of this renderer, resolved lazily.
 * Cannot be cached at init time because openp41ge:init (which sets
 * _windowId in the preload) arrives after bootstrap runs. Use
 * _resolveMyWinId() instead for cross-window drops.
 */
let _myWinId: string | null = null;

function _resolveMyWinId(): string {
  if (_myWinId) return _myWinId;
  _myWinId = window.openp41ge.workspace.getWindowId();
  return _myWinId || "";
}

/** Restore native draggable on the file row disabled for a custom drag gesture. */
function _restoreFileRowDraggable(): void {
  if (_fileRowSuppressedDrag) {
    // Lit may have re-rendered the row (re-adding draggable="true") — only set
    // "true" if it's currently "false" to avoid clobbering a fresh render state.
    if (_fileRowSuppressedDrag.getAttribute("draggable") === "false") {
      _fileRowSuppressedDrag.setAttribute("draggable", "true");
    }
    _fileRowSuppressedDrag = null;
  }
}

/** Restore native draggable on the git-entry (repo/worktree) row disabled for
 * this custom drag gesture — same Lit re-render guard as file rows. */
function _restoreGitEntryRowDraggable(): void {
  if (_gitEntryRowSuppressedDrag) {
    if (_gitEntryRowSuppressedDrag.getAttribute("draggable") === "false") {
      _gitEntryRowSuppressedDrag.setAttribute("draggable", "true");
    }
    _gitEntryRowSuppressedDrag = null;
  }
}

// ─── Mousedown: initiate git-entry (repo/worktree row) drags ────────────
// Module-level so the synthetic Mousedown test hooks can drive it directly.
function onGitEntryMouseDown(e: MouseEvent): void {
  // Only the primary (left) button engages drags — right/middle clicks must
  // never start a drag or interrupt an existing one.
  if (e.button !== 0) return;

  // Lit repo-tree items render their rows in the light DOM (no shadow root for
  // the header rows), but composedPath() safely walks any boundary in case the
  // structure changes later.
  const row = e
    .composedPath()
    .find(
      (el): el is HTMLElement =>
        el instanceof HTMLElement &&
        (el.hasAttribute("data-repo-row") || el.hasAttribute("data-worktree-row")),
    );
  if (!row) return;

  // Don't initiate a drag on row action buttons (+ add worktree / refresh /
  // confirm) — those stay click-only.
  if ((e.target as HTMLElement).closest?.(".repo-header-btn, .wt-row-btn")) return;

  // New gesture — clear any unconsumed suppression flag from a previous drag.
  _suppressGitEntryRowClick = false;

  // Disable native dragging for THIS gesture — the custom pipeline is the sole
  // owner of git-entry drags. Restored in onDragEnd/onMouseUp.
  _gitEntryRowSuppressedDrag = row;
  row.setAttribute("draggable", "false");

  e.preventDefault();

  const repoName = row.getAttribute("data-repo") || "";
  const branch = row.getAttribute("data-branch") || undefined;
  // Commit-search result rows are flagged so their drop opens the new
  // git-commit-search app instead of the git-repository browser.
  const isSearchResult = row.hasAttribute("data-git-search-result");
  const hash = row.getAttribute("data-hash") || undefined;
  if (!repoName) return;
  // Worktree tabs are titled by their branch; repo tabs by the repo name;
  // commit-search result rows by their short hash.
  const title = isSearchResult
    ? row.getAttribute("data-short-hash") || (hash ? hash.slice(0, 7) : repoName)
    : branch || repoName;
  const winId = _resolveMyWinId();

  // Calculate offset from cursor to element's top-left corner. For commit-search
  // result rows the FILE sub-rows are children of the row, so the full
  // boundingRect would capture them in the drag ghost bitmap. Capture only the
  // row's own header band (the compact commit header line) instead.
  const captureEl: HTMLElement = isSearchResult
    ? (row.querySelector<HTMLElement>(".commit-result-head") ?? row)
    : row;
  const rect = captureEl.getBoundingClientRect();
  const elScreenX = window.screenX + rect.left;
  const elScreenY = window.screenY + rect.top;
  const offsetX = e.screenX - elScreenX;
  const offsetY = e.screenY - elScreenY;

  const dragSource = new GitEntryDragSource(repoName, title, branch, {
    searchResult: isSearchResult,
    hash,
  });
  dragSource.setOffset(offsetX, offsetY);
  _currentSource = dragSource;
  _sidebarTabDragSide = null; // not a sidebar-tab drag
  _orchestrator?.startDrag(dragSource, e.clientX, e.clientY);

  // Defer drag:start until the first POSITION event (after threshold met),
  // mirroring the file/tab pattern so the main process captures a
  // pixel-accurate bitmap of the source row.
  _pendingGitEntryDragStart = {
    label: title,
    screenX: e.screenX,
    screenY: e.screenY,
    repoName,
    branch,
    appType: isSearchResult ? "git-commit-search" : "git-repository",
    hash,
    winId,
    offsetX,
    offsetY,
    elementWidth: captureEl.offsetWidth,
    elementHeight: captureEl.offsetHeight,
    captureRect: {
      x: rect.x + TAB_GHOST_CAPTURE_INSET,
      y: rect.y + TAB_GHOST_CAPTURE_INSET,
      width: Math.max(1, rect.width - TAB_GHOST_CAPTURE_INSET * 2),
      height: Math.max(1, rect.height - TAB_GHOST_CAPTURE_INSET * 2),
    },
  };
}

// ─── Mousedown: initiate log-stream (Logs sidebar row) drags ─────────────
// Module-level so the synthetic Mousedown test hooks can drive it directly.
function onLogStreamMouseDown(e: MouseEvent): void {
  // Only the primary (left) button engages drags — right/middle clicks must
  // never start a drag or interrupt an existing one.
  if (e.button !== 0) return;

  // Logs sidebar rows are built in the light DOM by LogsSystemTabController.
  const row = e
    .composedPath()
    .find(
      (el): el is HTMLElement => el instanceof HTMLElement && el.hasAttribute("data-log-system"),
    );
  if (!row) return;

  // New gesture — clear any unconsumed suppression flag from a previous drag.
  _suppressLogStreamRowClick = false;

  // Prevent text-selection / native text drag on the row during the gesture.
  e.preventDefault();

  const system = row.getAttribute("data-log-system") || "";
  if (!system) return;
  const title = system;
  const winId = _resolveMyWinId();

  // Calculate offset from cursor to element's top-left corner (screen coords).
  const rect = row.getBoundingClientRect();
  const elScreenX = window.screenX + rect.left;
  const elScreenY = window.screenY + rect.top;
  const offsetX = e.screenX - elScreenX;
  const offsetY = e.screenY - elScreenY;

  const dragSource = new LogStreamDragSource(system, title);
  dragSource.setOffset(offsetX, offsetY);
  _currentSource = dragSource;
  _sidebarTabDragSide = null; // not a sidebar-tab drag
  _orchestrator?.startDrag(dragSource, e.clientX, e.clientY);

  // Defer drag:start until the first POSITION event (after threshold met),
  // mirroring the file/tab/git pattern so the main process captures a
  // pixel-accurate bitmap of the source row.
  _pendingLogStreamDragStart = {
    label: title,
    screenX: e.screenX,
    screenY: e.screenY,
    system,
    winId,
    offsetX,
    offsetY,
    elementWidth: row.offsetWidth,
    elementHeight: row.offsetHeight,
    captureRect: {
      x: rect.x + TAB_GHOST_CAPTURE_INSET,
      y: rect.y + TAB_GHOST_CAPTURE_INSET,
      width: Math.max(1, rect.width - TAB_GHOST_CAPTURE_INSET * 2),
      height: Math.max(1, rect.height - TAB_GHOST_CAPTURE_INSET * 2),
    },
  };
}

// ─── Dummy drag source for cross-window ghost preview ────────────────────

/**
 * Initialize the drag system. Call once during startup.
 * Returns a cleanup function.
 */
export function initDragSystem(): () => void {
  const cleanups: (() => void)[] = [];

  // Cache window ID for local drag session tracking (getWindowId may return
  // null if openp41ge:init hasn't arrived yet — _resolveMyWinId handles lazily)
  _myWinId = window.openp41ge.workspace.getWindowId();

  // ── Create the orchestrator ──────────────────────────────────────────
  _orchestrator = new DragOrchestrator(openp41geTargetResolver);
  cleanups.push(() => {
    _orchestrator?.dispose();
    _orchestrator = null;
  });

  // ── Mousedown: initiate tab drags ────────────────────────────────────
  const onMouseDown = (e: MouseEvent) => {
    const tabBtn = (e.target as HTMLElement).closest?.("[data-tab-id]");
    if (!tabBtn || !(tabBtn instanceof HTMLElement)) return;

    if ((e.target as HTMLElement).closest?.(".tab-close")) return;

    e.preventDefault();

    const tabId = tabBtn.getAttribute("data-tab-id") || "";
    const tabBarEl = tabBtn.closest?.("tab-bar");
    if (!tabBarEl) return;

    const tabBar = tabBarEl as HTMLElement & { winId?: string; col?: number };
    const winId = tabBar.winId || "";
    const col = tabBar.col ?? 0;
    const label = tabBtn.textContent?.trim() || "Tab";

    // Calculate offset from cursor to tab's top-left (in screen coordinates)
    const tabRect = tabBtn.getBoundingClientRect();
    const tabScreenX = window.screenX + tabRect.left;
    const tabScreenY = window.screenY + tabRect.top;
    const tabWidth = tabBtn.offsetWidth;
    const tabHeight = tabBtn.offsetHeight;
    const offsetX = e.screenX - tabScreenX;
    const offsetY = e.screenY - tabScreenY;

    // Use a ghostFactory that returns an invisible element — we only want the
    // main-process BrowserWindow ghost (DragGhostManager), not the in-DOM floating ghost.
    const dragSource = new TabDragSource(tabBtn, tabId, winId, col.toString(), label, () => {
      const ghost = document.createElement("div");
      ghost.style.cssText =
        "position:fixed;pointer-events:none;opacity:0;width:1px;height:1px;z-index:-1;";
      return ghost;
    });
    _currentSource = dragSource;
    _sidebarTabDragSide = null; // not a sidebar-tab drag
    _orchestrator?.startDrag(dragSource, e.clientX, e.clientY);

    // Defer drag:start until the POSITION event fires (after threshold met).
    // Store params for the deferred call.
    _pendingDragStart = {
      label,
      screenX: e.screenX,
      screenY: e.screenY,
      tabId,
      winId,
      worksetId: col.toString(),
      tabWidth,
      tabHeight,
      offsetX,
      offsetY,
      captureRect: {
        x: tabRect.x + TAB_GHOST_CAPTURE_INSET,
        y: tabRect.y + TAB_GHOST_CAPTURE_INSET,
        width: Math.max(1, tabRect.width - TAB_GHOST_CAPTURE_INSET * 2),
        height: Math.max(1, tabRect.height - TAB_GHOST_CAPTURE_INSET * 2),
      },
    };
  };

  document.addEventListener("mousedown", onMouseDown);
  cleanups.push(() => document.removeEventListener("mousedown", onMouseDown));

  // ── Mousedown: initiate file drags from the explorer ─────────────────
  const onFileMouseDown = (e: MouseEvent) => {
    // Only the primary (left) button engages file drags — right/middle clicks
    // must never start a drag or interrupt an existing one (an active drag is
    // torn down by the mousedown safety-net above).
    if (e.button !== 0) return;

    // The uikit <openp41ge-tree> renders its rows in a shadow root, so at the
    // document boundary e.target retargets to the host. Walk composedPath() to
    // find the actual file row carrying data-file-path.
    const fileEl = e
      .composedPath()
      .find(
        (el): el is HTMLElement => el instanceof HTMLElement && el.hasAttribute("data-file-path"),
      );
    if (!fileEl) return;

    // New gesture — clear any unconsumed suppression flag from a previous drag.
    _suppressFileRowClick = false;

    // Disable native dragging for THIS gesture — the custom pipeline is the sole
    // owner of file drags. Removing native draggable deterministically stops
    // Chromium from initiating an OS HTML5 drag that can race the custom gesture
    // and swallow its mousemove (native draggable rows are the one thing synthetic
    // tests can't reproduce). Restored in onDragEnd/onMouseUp.
    _fileRowSuppressedDrag = fileEl;
    fileEl.setAttribute("draggable", "false");

    e.preventDefault();

    const filePath = fileEl.getAttribute("data-file-path") || "";
    const fileName = filePath.split("/").filter(Boolean).pop() || "file";
    const label = fileName;
    const winId = _resolveMyWinId();

    // Calculate offset from cursor to element's top-left corner
    const fileRect = fileEl.getBoundingClientRect();
    const fileScreenX = window.screenX + fileRect.left;
    const fileScreenY = window.screenY + fileRect.top;
    const offsetX = e.screenX - fileScreenX;
    const offsetY = e.screenY - fileScreenY;
    const elementWidth = fileEl.offsetWidth;
    const elementHeight = fileEl.offsetHeight;

    const dragSource = new FileDragSource(filePath, fileName);
    dragSource.setOffset(offsetX, offsetY);
    _currentSource = dragSource;
    _sidebarTabDragSide = null; // not a sidebar-tab drag
    _orchestrator?.startDrag(dragSource, e.clientX, e.clientY);

    // Defer drag:start until the POSITION event fires (after threshold met)
    _pendingFileDragStart = {
      label,
      screenX: e.screenX,
      screenY: e.screenY,
      filePath,
      winId,
      offsetX,
      offsetY,
      elementWidth,
      elementHeight,
      captureRect: {
        x: fileRect.x,
        y: fileRect.y,
        width: fileRect.width,
        height: fileRect.height,
      },
    };
  };

  document.addEventListener("mousedown", onFileMouseDown);
  cleanups.push(() => document.removeEventListener("mousedown", onFileMouseDown));

  // ── Mousedown: initiate git-entry (repo/worktree row) drags ──────────
  document.addEventListener("mousedown", onGitEntryMouseDown);
  cleanups.push(() => document.removeEventListener("mousedown", onGitEntryMouseDown));

  // ── Mousedown: initiate log-stream (Logs sidebar row) drags ──────────
  document.addEventListener("mousedown", onLogStreamMouseDown);
  cleanups.push(() => document.removeEventListener("mousedown", onLogStreamMouseDown));

  // ── Suppress native HTML5 drag for file rows while a custom file drag runs ──
  // Explorer file rows are natively draggable (uikit <openp41ge-tree>). Once
  // onFileMouseDown starts the custom orchestrator drag, cancel the native
  // dragstart for the same gesture so only the custom pipeline runs — otherwise
  // both systems fire → double ghosts / double opens.
  const onFileNativeDragStart = (e: DragEvent) => {
    if (_currentSource?.type !== "file") return;
    // composedPath() sees through the <openp41ge-tree> shadow root (e.target is
    // retargeted to the host at this level).
    const hasFilePath = e
      .composedPath()
      .some((el) => el instanceof HTMLElement && el.hasAttribute("data-file-path"));
    if (hasFilePath) {
      e.preventDefault();
    }
  };
  document.addEventListener("dragstart", onFileNativeDragStart, true);
  cleanups.push(() => document.removeEventListener("dragstart", onFileNativeDragStart, true));

  // ── Suppress native HTML5 drag for git-entry rows while a custom drag runs ──
  const onGitEntryNativeDragStart = (e: DragEvent) => {
    if (_currentSource?.type !== "open-tab") return;
    const hasGitRow = e
      .composedPath()
      .some(
        (el) =>
          el instanceof HTMLElement &&
          (el.hasAttribute("data-repo-row") || el.hasAttribute("data-worktree-row")),
      );
    if (hasGitRow) {
      e.preventDefault();
    }
  };
  document.addEventListener("dragstart", onGitEntryNativeDragStart, true);
  cleanups.push(() => document.removeEventListener("dragstart", onGitEntryNativeDragStart, true));

  // ── Suppress the trailing click after a git-entry drag ───────────────
  // Once a git-entry drag engages (threshold met -> _suppressGitEntryRowClick
  // true), a release back over the explorer could otherwise be seen as a click
  // and toggle the repo/worktree row's expansion. Capture phase, consumed once.
  const onGitEntryRowClickSuppress = (e: MouseEvent) => {
    if (!_suppressGitEntryRowClick) return;
    _suppressGitEntryRowClick = false;
    const hasGitRow = e
      .composedPath()
      .some(
        (el) =>
          el instanceof HTMLElement &&
          (el.hasAttribute("data-repo-row") || el.hasAttribute("data-worktree-row")),
      );
    if (hasGitRow) {
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  };
  document.addEventListener("click", onGitEntryRowClickSuppress, true);
  cleanups.push(() => document.removeEventListener("click", onGitEntryRowClickSuppress, true));

  // ── Suppress the trailing click after a file drag ─────────────────────
  // Once a file drag engages (threshold met -> _suppressFileRowClick true),
  // the browser may still synthesize a `click` on the source row if press and
  // release stayed within the click slop. That click would open the file like
  // a single click. Because it fires in CAPTURE phase before the row's own
  // @click handler, preventDefault + stopImmediatePropagation blocks the open.
  // Only file-row-targeted clicks are suppressed, and only once (flag consumed).
  const onFileRowClickSuppress = (e: MouseEvent) => {
    if (!_suppressFileRowClick) return;
    _suppressFileRowClick = false;
    const hasFileRow = e
      .composedPath()
      .some((el) => el instanceof HTMLElement && el.hasAttribute("data-file-path"));
    if (hasFileRow) {
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  };
  document.addEventListener("click", onFileRowClickSuppress, true);
  cleanups.push(() => document.removeEventListener("click", onFileRowClickSuppress, true));

  // ── Suppress the trailing click after a log-stream drag ──────────────
  // Once a log-stream drag engages (threshold met -> _suppressLogStreamRowClick
  // true), the browser may still synthesize a `click` on the source row if press
  // and release stayed within the click slop. That click would re-open the stream
  // via the sidebar's @click handler. Capture phase, consumed once.
  const onLogStreamRowClickSuppress = (e: MouseEvent) => {
    if (!_suppressLogStreamRowClick) return;
    _suppressLogStreamRowClick = false;
    const hasLogRow = e
      .composedPath()
      .some((el) => el instanceof HTMLElement && el.hasAttribute("data-log-system"));
    if (hasLogRow) {
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  };
  document.addEventListener("click", onLogStreamRowClickSuppress, true);
  cleanups.push(() => document.removeEventListener("click", onLogStreamRowClickSuppress, true));

  // ── Mousedown: initiate sidebar tab drags ────────────────────────────
  const onSidebarTabMouseDown = (e: MouseEvent) => {
    const sidebarTab = (e.target as HTMLElement).closest?.("[data-sidebar-tab-id]");
    if (!sidebarTab || !(sidebarTab instanceof HTMLElement)) return;

    // Don't initiate drag on close/pin button clicks
    if ((e.target as HTMLElement).closest?.(".sidebar-tab-close")) return;
    if ((e.target as HTMLElement).closest?.(".sidebar-tab-pin")) return;

    e.preventDefault();

    const tabId = sidebarTab.getAttribute("data-sidebar-tab-id") || "";
    const side = sidebarTab.getAttribute("data-sidebar-side") || "";
    const title =
      sidebarTab.getAttribute("data-tab-title") || sidebarTab.textContent?.trim() || "Tab";
    const winId = _resolveMyWinId();

    const sidebarEl = sidebarTab.closest?.("openp41ge-sidebar");
    if (!sidebarEl) return;

    const dragSource = new SidebarTabDragSource(
      sidebarTab,
      tabId,
      side,
      winId,
      title,
      // Invisible in-DOM ghost — the visible drag element is the main-process
      // bitmap ghost captured from this sidebar tab (captureRect below).
      () => {
        const ghost = document.createElement("div");
        ghost.style.cssText =
          "position:fixed;pointer-events:none;opacity:0;width:1px;height:1px;z-index:-1;";
        return ghost;
      },
    );
    _currentSource = dragSource;
    _sidebarTabDragSide = side === "left" || side === "right" ? side : null;
    _orchestrator?.startDrag(dragSource, e.clientX, e.clientY);

    // Defer drag:start until the first POSITION event — store the sidebar
    // tab's dims/offset so the bitmap ghost lines up under the cursor exactly
    // like the source tab (frame the capture with TAB_GHOST_CAPTURE_INSET to
    // trim the 1px separator border).
    const rect = sidebarTab.getBoundingClientRect();
    const elScreenX = window.screenX + rect.left;
    const elScreenY = window.screenY + rect.top;
    _pendingSidebarDragStart = {
      label: title,
      screenX: e.screenX,
      screenY: e.screenY,
      tabId,
      side,
      winId,
      width: sidebarTab.offsetWidth,
      height: sidebarTab.offsetHeight,
      offsetX: e.screenX - elScreenX,
      offsetY: e.screenY - elScreenY,
      captureRect: {
        x: rect.x + TAB_GHOST_CAPTURE_INSET,
        y: rect.y + TAB_GHOST_CAPTURE_INSET,
        width: Math.max(1, rect.width - TAB_GHOST_CAPTURE_INSET * 2),
        height: Math.max(1, rect.height - TAB_GHOST_CAPTURE_INSET * 2),
      },
    };
  };

  document.addEventListener("mousedown", onSidebarTabMouseDown);
  cleanups.push(() => document.removeEventListener("mousedown", onSidebarTabMouseDown));

  // ── Click: activate tab (short clicks that don't become drags) ────────
  const onClick = (e: MouseEvent) => {
    const tabBtn = (e.target as HTMLElement).closest?.("[data-tab-id]");
    if (!tabBtn || !(tabBtn instanceof HTMLElement)) return;

    if ((e.target as HTMLElement).closest?.(".tab-close")) return;

    const tabId = tabBtn.getAttribute("data-tab-id") || "";
    const tabBarEl = tabBtn.closest?.("tab-bar");
    if (!tabBarEl) return;

    const winId = (tabBarEl as HTMLElement & { winId?: string }).winId || "";

    tabBtn.dispatchEvent(
      new CustomEvent("grid-activate", {
        bubbles: true,
        detail: { winId, tabId },
      }),
    );
  };

  document.addEventListener("click", onClick);
  cleanups.push(() => document.removeEventListener("click", onClick));

  // ── Mousemove: update grid ghost or show cross-window ghost ───────────
  let _focusedOnEntry = false;
  const onMouseMove = (e: MouseEvent) => {
    log.debug("mousemove", {
      x: e.clientX,
      y: e.clientY,
      localDragActive: _localDragActive,
      remoteDragActive: _remoteDragActive,
    });
    if (_localDragActive) {
      updateGridGhost(e.clientX, e.clientY);
      return;
    }
    if (_remoteDragActive) {
      if (!_focusedOnEntry) {
        _focusedOnEntry = true;
        window.focus();
      }
      _updateCrossWindowGhost(e.clientX, e.clientY);
    }
  };

  document.addEventListener("mousemove", onMouseMove);
  cleanups.push(() => document.removeEventListener("mousemove", onMouseMove));

  // ── Mouseup: handle cross-window drops ───────────────────────────────
  const onMouseUp = async (e: MouseEvent) => {
    _pendingDragStart = null;
    _pendingSidebarDragStart = null;
    _pendingFileDragStart = null;
    _pendingGitEntryDragStart = null;
    _pendingLogStreamDragStart = null;
    if (_localDragActive) {
      clearGridGhost();

      // Defer new-window creation to after the orchestrator's mouseup
      // handler has processed the target drop (setTimeout(0) so the
      // orchestrator's synchronous handler runs first).
      // _fileDropHandled is set to true by the grid-open-tab handler
      // if the orchestrator drops the file on a valid target.
      if (_localFileDragActive && _pendingFileDetachPath) {
        const filePath = _pendingFileDetachPath;
        // Use the mouseup event's OWN screen coords — the true OS release
        // point. On a real drag-out the cursor is over the desktop, so
        // e.screenX/Y are OUTSIDE the window bounds; _lastScreenPos is the
        // last in-window POSITION (stale, inside the window) and would
        // misclassify an outside release as an in-window miss.
        const dropScreenX =
          typeof e.screenX === "number" && e.screenX !== 0 && isFinite(e.screenX)
            ? e.screenX
            : _lastScreenPos.screenX;
        const dropScreenY =
          typeof e.screenY === "number" && e.screenY !== 0 && isFinite(e.screenY)
            ? e.screenY
            : _lastScreenPos.screenY;
        _pendingFileDetachPath = null;
        // Use setTimeout(0) to yield to the event loop, allowing any
        // pending IPC messages (endSession from cross-window drops) to
        // be delivered before we decide whether to create a new window.
        setTimeout(async () => {
          if (!_fileDropHandled) {
            // Only create a new window when the release happened OUTSIDE every
            // openp41ge window (dragged out onto the desktop / other apps). An
            // in-window miss — over the sidebar, window chrome, or a non-target
            // grid area — is a cancelled drop, NOT a new window.
            const hit = await window.openp41ge.drag
              .check(dropScreenX, dropScreenY)
              .catch(() => null);
            if (!hit) {
              const fileName = filePath.split("/").filter(Boolean).pop() || "file";
              const sourceWinId = _resolveMyWinId();
              window.openp41ge.workspace.dispatch(
                "actionOpenFileInNewWindow",
                filePath,
                fileName,
                sourceWinId,
                dropScreenX,
                dropScreenY,
              );
            }
          }
          _fileDropHandled = false;
        }, 0);
      }
      _localDragActive = false;
      _localFileDragActive = false;
      _currentSource = null;
      _restoreFileRowDraggable();
      _restoreGitEntryRowDraggable();
      return;
    }
    if (_remoteDragActive) {
      await _handleCrossWindowDrop(e.clientX, e.clientY, e.screenX, e.screenY);
    }
  };

  document.addEventListener("mouseup", onMouseUp);
  cleanups.push(() => document.removeEventListener("mouseup", onMouseUp));

  // ── Orchestrator position events → move main-process ghost ───────────
  // Also broadcasts drag-active to other windows on the FIRST position event
  // (which fires after the drag threshold is met), not on mousedown.
  let _dragActivated = false;
  document.addEventListener(DRAG_EVENTS.POSITION, (e: Event) => {
    const detail = (e as CustomEvent).detail as { screenX: number; screenY: number };
    if (detail) {
      _lastScreenPos = { screenX: detail.screenX, screenY: detail.screenY };
      window.openp41ge.drag.move(detail.screenX, detail.screenY);
      if (!_dragActivated) {
        _dragActivated = true;
        _localDragActive = true;
        _localFileDragActive = !!_pendingFileDragStart;
        // Drag engaged (threshold met) — suppress the trailing click-on-the-row so
        // releasing back over the explorer can't open the file as if it were a click.
        _suppressFileRowClick = !!_pendingFileDragStart;
        // Same suppression for git-entry rows: releasing over the explorer must
        // not toggle the repo/worktree row as if it were a click.
        _suppressGitEntryRowClick = !!_pendingGitEntryDragStart;
        // And for log-stream rows: releasing back over the Logs sidebar must not
        // re-open the stream as if it were a plain click.
        _suppressLogStreamRowClick = !!_pendingLogStreamDragStart;
        if (_pendingFileDragStart) {
          _pendingFileDetachPath = _pendingFileDragStart.filePath;
        }

        // First POSITION event fires after the drag threshold is met — now
        // it's safe to show the main-process BrowserWindow ghost and broadcast
        // drag-active to other windows.
        if (_pendingDragStart) {
          const p = _pendingDragStart;
          // Hide any tab-bar drop indicator before the async capturePage run, so
          // the captured frame is a clean tab (no blue insert line). The
          // orchestrator re-shows the indicator on the next mousemove's onHover.
          document.querySelectorAll(".tab-drop-indicator").forEach((el) => {
            (el as HTMLElement).style.display = "none";
          });
          // Tab ghost: like files, the main process captures a pixel-accurate
          // bitmap of the actual tab button and swaps it into the DragGhostManager
          // window in-place, so the drag element is an exact copy of the tab — the
          // pill is only a brief fallback while capture resolves.
          window.openp41ge.drag.start(
            p.label,
            p.screenX,
            p.screenY,
            undefined,
            p.tabId,
            p.winId,
            p.worksetId,
            p.tabWidth,
            p.tabHeight,
            p.offsetX,
            p.offsetY,
            "tab",
            undefined,
            p.captureRect,
            TAB_GHOST_CAPTURE_INSET,
          );
          _pendingDragStart = null;
        } else if (_pendingSidebarDragStart) {
          const p = _pendingSidebarDragStart;
          _pendingSidebarDragStart = null;
          // Suppress the sidebar-wide ghost overlay + drop indicator during the
          // capture: SidebarDropTarget.onHover re-creates them synchronously later
          // in the SAME mousemove, so a one-shot removal would be re-added before
          // capturePage samples — the sidebar wash covers the whole tab interior
          // and the capture inset can't clip it (unlike the grid's edge line).
          setSidebarDropFeedbackSuppressed(true);
          document
            .querySelectorAll(".sidebar-ghost-overlay, .sidebar-drop-indicator")
            .forEach((el) => el.remove());
          document.querySelectorAll(".tab-drop-indicator").forEach((el) => {
            (el as HTMLElement).style.display = "none";
          });
          // Sidebar tab ghost: same pixel-accurate bitmap treatment as grid tabs
          // — capture the actual sidebar tab and render it in the DragGhostManager
          // window at the tab's exact size, trimmed by the capture inset.
          window.openp41ge.drag.start(
            p.label,
            p.screenX,
            p.screenY,
            undefined,
            p.tabId,
            p.winId,
            p.side,
            p.width,
            p.height,
            p.offsetX,
            p.offsetY,
            "sidebar-tab",
            undefined,
            p.captureRect,
            TAB_GHOST_CAPTURE_INSET,
          );
          // Re-enable sidebar drop feedback shortly after the capture samples.
          window.setTimeout(() => setSidebarDropFeedbackSuppressed(false), 60);
        } else if (_pendingFileDragStart) {
          const p = _pendingFileDragStart;
          // File ghost: the main process captures a pixel-accurate bitmap of the
          // source row (capturePage) and renders it in the DragGhostManager window
          // at the row's exact dimensions, so the ghost looks like the row AND
          // travels outside the window. Use the source row's dims/offset so the
          // ghost lines up under the cursor.
          window.openp41ge.drag.start(
            p.label,
            p.screenX,
            p.screenY,
            undefined,
            undefined,
            p.winId,
            undefined,
            p.elementWidth,
            p.elementHeight,
            p.offsetX,
            p.offsetY,
            "file",
            p.filePath,
            p.captureRect,
          );
          _pendingFileDragStart = null;
        } else if (_pendingGitEntryDragStart) {
          const p = _pendingGitEntryDragStart;
          // Git-entry ghost: identical bitmap treatment to files — the main
          // process captures the source repo/worktree row and renders it in the
          // DragGhostManager window at the row's exact dimensions. The open-tab
          // payload (appType/tabConfig) rides `openTabData` so a TARGET window's
          // cross-window drop can resolve it without seeing the source row.
          window.openp41ge.drag.start(
            p.label,
            p.screenX,
            p.screenY,
            undefined,
            undefined,
            p.winId,
            undefined,
            p.elementWidth,
            p.elementHeight,
            p.offsetX,
            p.offsetY,
            "open-tab",
            undefined,
            p.captureRect,
            TAB_GHOST_CAPTURE_INSET,
            {
              appType: p.appType ?? "git-repository",
              tabConfig:
                p.appType === "git-commit-search"
                  ? { repoName: p.repoName, hash: p.hash }
                  : p.branch
                    ? { repoName: p.repoName, branch: p.branch }
                    : { repoName: p.repoName },
            },
          );
          _pendingGitEntryDragStart = null;
        } else if (_pendingLogStreamDragStart) {
          const p = _pendingLogStreamDragStart;
          // Log-stream ghost: identical bitmap treatment to files/git entries
          // — the main process captures the source sidebar row and renders it
          // in the DragGhostManager window at the row's exact dimensions. The
          // open-tab payload (appType/tabConfig) rides `openTabData` so a
          // TARGET window's cross-window drop can open a stream-scoped
          // log-viewer pane without seeing the source row.
          window.openp41ge.drag.start(
            p.label,
            p.screenX,
            p.screenY,
            undefined,
            undefined,
            p.winId,
            undefined,
            p.elementWidth,
            p.elementHeight,
            p.offsetX,
            p.offsetY,
            "open-tab",
            undefined,
            p.captureRect,
            TAB_GHOST_CAPTURE_INSET,
            { appType: "log-viewer", tabConfig: { system: p.system } },
          );
          _pendingLogStreamDragStart = null;
        }
        window.openp41ge.drag.activate();
      }
    }
  });

  // ── Orchestrator end event → hide main-process ghost ─────────────────
  // Full local-drag teardown: hide the main-process ghost, clear the DOM grid
  // ghost, drop all drag flags and restore the source row's native draggable.
  // Used by the END event AND the interruption safety-net (any unexpected
  // mousedown/right-click during a drag) so no interrupted drag can ever leave
  // a floating ghost behind.
  const teardownLocalDrag = () => {
    _dragActivated = false;
    _focusedOnEntry = false;
    _lastScreenPos = { screenX: 0, screenY: 0 };
    window.openp41ge.drag.end();
    clearGridGhost();
    _clearSidebarDropTargetCache();
    setSidebarDropFeedbackSuppressed(false);
    _localDragActive = false;
    _localFileDragActive = false;
    _pendingFileDetachPath = null;
    _fileDropHandled = false;
    _pendingSidebarDragStart = null;
    _pendingGitEntryDragStart = null;
    _pendingLogStreamDragStart = null;
    _suppressGitEntryRowClick = false;
    _suppressLogStreamRowClick = false;
    _currentSource = null;
    _restoreFileRowDraggable();
    _restoreGitEntryRowDraggable();
  };

  const onDragEnd = () => {
    teardownLocalDrag();
  };

  document.addEventListener(DRAG_EVENTS.END, onDragEnd);
  cleanups.push(() => document.removeEventListener(DRAG_EVENTS.END, onDragEnd));

  // ── Interruption safety-net ───────────────────────────────────────────
  // Any new mousedown while a local drag is active is an interruption
  // (right/middle click, a second gesture, a tab click, …). Fully tear the
  // drag down (including hiding the main-process ghost) BEFORE any other
  // handler can react — so no interrupted drag ever leaves a floating ghost.
  // Capture phase so it runs before the bubble-phase drag/click handlers.
  const onInterruptMousedown = () => {
    if (_localDragActive) {
      _orchestrator?.cancelDrag();
      teardownLocalDrag();
      // Interrupted (no pending drop resolve) — clear the remembered side so it
      // can't leak into a subsequent drag.
      _sidebarTabDragSide = null;
    }
  };
  document.addEventListener("mousedown", onInterruptMousedown, true);
  cleanups.push(() => document.removeEventListener("mousedown", onInterruptMousedown, true));

  // ── Orchestrator detach event → check cross-window, then create window ──
  const onDetach = async (e: Event) => {
    const detail = (e as CustomEvent).detail as {
      winId: string;
      tabId: string;
      screenX?: number;
      screenY?: number;
      sourceWorksetId?: string;
      bounds: { x: number; y: number; width: number; height: number };
    };
    if (!detail) return;

    const screenX = detail.screenX ?? detail.bounds.x + 50;
    const screenY = detail.screenY ?? detail.bounds.y + 50;
    const dragData = JSON.stringify({
      tabId: detail.tabId,
      winId: detail.winId,
      worksetId: detail.sourceWorksetId ?? detail.winId,
      type: "tab",
    });

    try {
      const resolved = await _tryCrossWindowDrop(
        detail.winId,
        detail.tabId,
        screenX,
        screenY,
        dragData,
      );
      if (resolved) return;
    } catch {
      // fall through
    }

    window.openp41ge.workspace.detachTab(
      detail.winId,
      detail.tabId,
      detail.bounds,
      screenX,
      screenY,
    );
  };

  document.addEventListener(DRAG_EVENTS.DETACH, onDetach);
  cleanups.push(() => document.removeEventListener(DRAG_EVENTS.DETACH, onDetach));

  // ── Orchestrator cross event → forward cursor to other windows ──────────
  // The source window always receives mousemove events (it has focus). When
  // the cursor leaves the grid, the orchestrator fires CROSS with screen
  // coordinates. We forward them so other windows can update their ghost.
  const onCross = (e: Event) => {
    const detail = (e as CustomEvent).detail as { screenX: number; screenY: number } | undefined;
    if (detail && _localDragActive) {
      window.openp41ge.drag.ghostForward(detail.screenX, detail.screenY);
    }
  };
  document.addEventListener(DRAG_EVENTS.CROSS, onCross);
  cleanups.push(() => document.removeEventListener(DRAG_EVENTS.CROSS, onCross));

  // ── Sidebar tab drop → dispatch workspace operation ────────────────
  const onSidebarTabDrop = (e: Event) => {
    const detail = (e as CustomEvent).detail as {
      tabId: string;
      sourceSide: string;
      targetSide: string;
      dropIndex: number;
      winId: string;
    };
    if (!detail) return;

    window.openp41ge.workspace.dispatch(
      "moveSystemTabToSidebar",
      detail.winId,
      detail.tabId,
      detail.targetSide,
      detail.dropIndex,
    );
  };
  document.addEventListener(SIDEBAR_DROP_EVENT, onSidebarTabDrop);
  cleanups.push(() => document.removeEventListener(SIDEBAR_DROP_EVENT, onSidebarTabDrop));

  // ── Listen for grid-open-tab to mark file drop handled ──────────────
  // When a file is dropped on a valid grid target (same-window), the
  // orchestrator fires grid-open-tab. We set _fileDropHandled so the
  // deferred check in onMouseUp doesn't create a new window.
  const onGridOpenTab = (e: Event) => {
    const detail = (e as CustomEvent).detail as { tabConfig?: { filePath?: string } };
    if (detail?.tabConfig?.filePath) {
      _fileDropHandled = true;
    }
  };
  document.addEventListener("grid-open-tab", onGridOpenTab);
  cleanups.push(() => document.removeEventListener("grid-open-tab", onGridOpenTab));

  // ── HTML5 drag from <openp41ge-tree> — new window on drag-out ──────
  let _html5FileDragPath: string | null = null;
  document.addEventListener("dragstart", (e: DragEvent) => {
    if (e.dataTransfer?.types.includes("text/plain")) {
      const data = e.dataTransfer.getData("text/plain");
      if (data && (data.startsWith("/") || data.includes(".") || data.match(/^[\w.-]+\//))) {
        _html5FileDragPath = data;
        _fileDropHandled = false;
      }
    }
  });
  cleanups.push(() => document.removeEventListener("dragstart", () => {}));

  document.addEventListener("dragend", (e: DragEvent) => {
    if (!_html5FileDragPath) return;
    const filePath = _html5FileDragPath;
    _html5FileDragPath = null;
    if (e.dataTransfer?.dropEffect === "none" && !_fileDropHandled) {
      const fileName = filePath.split("/").filter(Boolean).pop() || "file";
      const sourceWinId = _resolveMyWinId();
      window.openp41ge.workspace.dispatch(
        "actionOpenFileInNewWindow",
        filePath,
        fileName,
        sourceWinId,
        e.screenX,
        e.screenY,
      );
    }
    _fileDropHandled = false;
  });
  cleanups.push(() => document.removeEventListener("dragend", () => {}));

  // ── Incoming ghost position from main process poll ───────────────────
  // The main process polls screen.getCursorScreenPoint() at ~20fps during
  // an active drag and broadcasts to ALL windows — including the SOURCE
  // window. A source window is already dragging locally (main-process bitmap
  // ghost + local updateGridGhost preview), so it must ignore these poll
  // updates; otherwise it would set _remoteDragActive and paint a grid ghost
  // via _updateCrossWindowGhost based purely on grid-relative coords (which
  // even extend under an overlaid sidebar).
  type GhostShowData = { screenX: number; screenY: number; label?: string; clear?: boolean };
  window.openp41ge.drag.onGhostShow((data: GhostShowData) => {
    if (_localDragActive) return;
    const screenX = data.screenX;
    const screenY = data.screenY;
    if (typeof screenX !== "number" || typeof screenY !== "number") return;

    _remoteDragActive = true;

    // A `clear` payload means the cursor is over another window (usually the
    // source) — this window must not paint a cross-window drop indicator. Hide
    // any stale indicator left from a previous position.
    if (data.clear) {
      _hideCrossWindowGhost();
      return;
    }

    // Convert screen → viewport coordinates and show ghost
    const cx = screenX - window.screenX;
    const cy = screenY - window.screenY;
    log.debug("ipc-ghost", { screenX, screenY, clientX: cx, clientY: cy });
    _updateCrossWindowGhost(cx, cy);
  });

  // ── Remote drag state tracking ───────────────────────────────────────
  // Main process broadcasts drag-state (active/inactive) to all windows.
  window.openp41ge.drag.onDragState((state) => {
    _remoteDragActive = state.active;
    _remoteDragType = state.active ? state.type : null;
    if (!state.active) {
      _hideCrossWindowGhost();
    }
  });

  // ── Incoming end-session event (source window cleanup) ────────────────
  window.openp41ge.drag.onEndSession(() => {
    // Mark the file as handled — this tells the deferred timeout in
    // onMouseUp NOT to create a new window (because the cross-window
    // drop was successfully handled by the target window).
    _fileDropHandled = true;
    _dragActivated = false;
    _focusedOnEntry = false;
    _localDragActive = false;
    _localFileDragActive = false;
    _pendingFileDetachPath = null;
    _pendingLogStreamDragStart = null;
    _suppressLogStreamRowClick = false;
    _orchestrator?.cancelDrag();
    window.openp41ge.drag.end();
    clearGridGhost();
    _currentSource = null;
    _restoreFileRowDraggable();
    _restoreGitEntryRowDraggable();
  });

  return () => {
    _ghostManager.dispose();
    _clearSidebarDropTargetCache();
    for (const fn of cleanups) fn();
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Cross-window drop handling
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Handle a cross-window drop: mouseup in this window with an active remote
 * drag. Queries the main process for drag data, resolves local target,
 * dispatches the workspace operation, and ends the remote session.
 */
async function _handleCrossWindowDrop(
  clientX: number,
  clientY: number,
  _screenX: number,
  _screenY: number,
): Promise<void> {
  try {
    const active = await window.openp41ge.drag.getActive();
    if (!active) return;

    const target = openp41geTargetResolver(clientX, clientY);
    if (!target) return;

    const data = active.dragData;
    const sourceWinId = active.sourceWinId;
    log.debug("drop", {
      targetType: target.type,
      x: clientX,
      y: clientY,
      sourceWinId,
      tabId: (data as { tabId?: string }).tabId,
      dragType: data.type,
    });

    // Handle file drops: open the file in the target window/grid
    if (data.type === "file") {
      const filePath = data.filePath;
      if (filePath) {
        const gridEl = (target as IDropTarget & { element: HTMLElement }).element.closest(
          "tab-grid",
        ) as HTMLElement | null;
        if (gridEl) {
          const gridRect = gridEl.getBoundingClientRect();
          const relX = clientX - gridRect.left;
          const cols = (gridEl as HTMLElement & { cols?: number }).cols || 1;
          const pos = computeDropTarget(gridEl, relX, gridRect.width, cols);
          const targetCol = pos.col;
          const winId = (gridEl as HTMLElement & { winId?: string }).winId || _resolveMyWinId();

          if (pos.isBoundary) {
            // For file splits, use splitFileOpen which creates a new column
            const splitLeft =
              pos.boundaryIndex === 0
                ? true
                : pos.boundaryIndex >= cols
                  ? false
                  : targetCol >= pos.boundaryIndex;
            const splitCol =
              pos.boundaryIndex === 0 ? 0 : pos.boundaryIndex >= cols ? cols - 1 : targetCol;
            const fileName = filePath.split("/").filter(Boolean).pop() || "file";
            window.openp41ge.workspace.dispatch(
              "splitFileOpen",
              winId,
              "file-viewer",
              fileName,
              filePath,
              splitCol,
              splitLeft,
            );
          } else {
            const fileName = filePath.split("/").filter(Boolean).pop() || "file";
            window.openp41ge.workspace.dispatch(
              "actionOpenFile",
              winId,
              "file-viewer",
              fileName,
              filePath,
              targetCol,
              true,
            );
          }
        }
        window.openp41ge.drag.endSession();
        return;
      }
      // filePath was falsy — nothing to handle
      window.openp41ge.drag.endSession();
      return;
    }

    // Handle git-entry (open-tab) drops: open the git-repository pane in the
    // target window/grid, scoped to the repo (or to the branch for a worktree
    // row). Mirrors the file branch — boundary splits a new column.
    if (data.type === "open-tab") {
      const tabConfig = (data as { tabConfig?: Record<string, unknown> }).tabConfig ?? {};
      const repoName = (tabConfig as { repoName?: string }).repoName;
      const branch = (tabConfig as { branch?: string }).branch;
      const appType = (data as { appType?: string }).appType || "git-repository";

      // ── Log-system drop: open a system-scoped log-viewer pane ────────────
      if (appType === "log-viewer") {
        const system = (tabConfig as { system?: string }).system;
        if (!system) {
          window.openp41ge.drag.endSession();
          return;
        }
        const gridEl = (target as IDropTarget & { element: HTMLElement }).element.closest(
          "tab-grid",
        ) as HTMLElement | null;
        if (gridEl) {
          const gridRect = gridEl.getBoundingClientRect();
          const relX = clientX - gridRect.left;
          const cols = (gridEl as HTMLElement & { cols?: number }).cols || 1;
          const pos = computeDropTarget(gridEl, relX, gridRect.width, cols);
          const targetCol = pos.col;
          const winId = (gridEl as HTMLElement & { winId?: string }).winId || _resolveMyWinId();
          const tabName = system;

          if (pos.isBoundary) {
            const splitLeft =
              pos.boundaryIndex === 0
                ? true
                : pos.boundaryIndex >= cols
                  ? false
                  : targetCol >= pos.boundaryIndex;
            const splitCol =
              pos.boundaryIndex === 0 ? 0 : pos.boundaryIndex >= cols ? cols - 1 : targetCol;
            window.openp41ge.workspace.dispatch(
              "splitFileOpen",
              winId,
              "log-viewer",
              tabName,
              undefined,
              splitCol,
              splitLeft,
              { system },
            );
          } else {
            window.openp41ge.workspace.dispatch(
              "actionOpenFile",
              winId,
              "log-viewer",
              tabName,
              undefined,
              targetCol,
              true,
              { system },
            );
          }
        }
        window.openp41ge.drag.endSession();
        return;
      }

      if (!repoName) {
        window.openp41ge.drag.endSession();
        return;
      }

      // Commit-search drops carry the full hash; encode it (with the repo) into
      // the dispatch's config slot (a string) so the target window's controller
      // can restore it. Git-repository drops pass the plain repo name.
      const configSlot =
        appType === "git-commit-search"
          ? JSON.stringify({ repoName, hash: tabConfig.hash })
          : repoName;

      const gridEl = (target as IDropTarget & { element: HTMLElement }).element.closest(
        "tab-grid",
      ) as HTMLElement | null;
      if (gridEl) {
        const gridRect = gridEl.getBoundingClientRect();
        const relX = clientX - gridRect.left;
        const cols = (gridEl as HTMLElement & { cols?: number }).cols || 1;
        const pos = computeDropTarget(gridEl, relX, gridRect.width, cols);
        const targetCol = pos.col;
        const winId = (gridEl as HTMLElement & { winId?: string }).winId || _resolveMyWinId();
        // Worktree tabs are titled by their branch; repo tabs by the repoName;
        // commit-search result tabs by their short hash.
        const tabName =
          appType === "git-commit-search"
            ? ((tabConfig as { shortHash?: string }).shortHash ??
              String(tabConfig.hash ?? "").slice(0, 7))
            : branch || repoName;

        if (pos.isBoundary) {
          const splitLeft =
            pos.boundaryIndex === 0
              ? true
              : pos.boundaryIndex >= cols
                ? false
                : targetCol >= pos.boundaryIndex;
          const splitCol =
            pos.boundaryIndex === 0 ? 0 : pos.boundaryIndex >= cols ? cols - 1 : targetCol;
          window.openp41ge.workspace.dispatch(
            "splitFileOpen",
            winId,
            appType,
            tabName,
            configSlot,
            splitCol,
            splitLeft,
          );
        } else {
          window.openp41ge.workspace.dispatch(
            "actionOpenFile",
            winId,
            appType,
            tabName,
            configSlot,
            targetCol,
            true,
          );
        }
      }
      window.openp41ge.drag.endSession();
      return;
    }

    // Any other drag type (e.g. sidebar-tab) must not trigger a grid tab
    // move/split cross-window — sidebar tabs are window-local. End the remote
    // session and ignore, matching the pre-bitmap behaviour where a sidebar
    // drag had no session to act on.
    if (data.type !== "tab") {
      window.openp41ge.drag.endSession();
      return;
    }

    if (target.type === "tab-bar") {
      const tabBarTarget = target as IDropTarget & { winId: string; element: HTMLElement };
      const targetWinId = tabBarTarget.winId || _resolveMyWinId();

      // Check if cursor is near a grid boundary — even when over the tab bar,
      // the drop should create a new column if at the grid edge.
      const gridEl = tabBarTarget.element.closest("tab-grid") as HTMLElement | null;
      if (gridEl) {
        const gridRect = gridEl.getBoundingClientRect();
        const gridRelX = clientX - gridRect.left;
        const cols = (gridEl as HTMLElement & { cols?: number }).cols || 1;
        const gridPos = computeDropTarget(gridEl, gridRelX, gridRect.width, cols);

        if (gridPos.isBoundary) {
          const splitLeft =
            gridPos.boundaryIndex === 0
              ? true
              : gridPos.boundaryIndex >= cols
                ? false
                : gridPos.col >= gridPos.boundaryIndex;
          const splitCol =
            gridPos.boundaryIndex === 0
              ? 0
              : gridPos.boundaryIndex >= cols
                ? cols - 1
                : gridPos.col;
          _dispatchCrossWindowSplit(sourceWinId, data.tabId, targetWinId, splitCol, splitLeft);
          window.openp41ge.drag.endSession();
          return;
        }
      }

      const barEl = tabBarTarget.element;
      const barRect = barEl.getBoundingClientRect();
      const barRelX = clientX - barRect.left;
      const tabButtons = barEl.querySelectorAll("[data-tab-id]");
      let dropIndex = tabButtons.length;
      for (let i = 0; i < tabButtons.length; i++) {
        const btnRect = tabButtons[i].getBoundingClientRect();
        const btnMid = btnRect.left - barRect.left + btnRect.width / 2;
        if (barRelX < btnMid) {
          dropIndex = i;
          break;
        }
      }

      const colStr = tabBarTarget.element.closest(".grid-cell")?.getAttribute("data-cell-col");
      const dropCol = colStr ? parseInt(colStr, 10) : 0;

      _dispatchCrossWindowMove(sourceWinId, data.tabId, targetWinId, dropCol, dropIndex);
      window.openp41ge.drag.endSession();
      return;
    }

    if (target.type === "grid") {
      const gridTarget = target as IDropTarget & { winId: string };
      const targetWinId = gridTarget.winId || _resolveMyWinId();
      const gridEl = target.element;
      const gridRect = gridEl.getBoundingClientRect();
      const relX = clientX - gridRect.left;
      const cols = (gridEl as HTMLElement & { cols?: number }).cols || 1;

      const pos = computeDropTarget(gridEl, relX, gridRect.width, cols);
      const mouseCol = pos.col;
      log.debug("drop-grid", {
        col: mouseCol,
        isBoundary: pos.isBoundary,
        boundaryIndex: pos.boundaryIndex ?? -1,
        cols,
      });

      if (pos.isBoundary) {
        const splitLeft =
          pos.boundaryIndex === 0
            ? true
            : pos.boundaryIndex >= cols
              ? false
              : mouseCol >= pos.boundaryIndex;
        const splitCol =
          pos.boundaryIndex === 0 ? 0 : pos.boundaryIndex >= cols ? cols - 1 : mouseCol;
        _dispatchCrossWindowSplit(sourceWinId, data.tabId, targetWinId, splitCol, splitLeft);
      } else {
        _dispatchCrossWindowMove(sourceWinId, data.tabId, targetWinId, mouseCol, -1);
      }

      window.openp41ge.drag.endSession();
      return;
    }
  } catch {
    // Cross-window drop failed
  }
}

/**
 * Try cross-window drop from a DETACH event (mouseup in source window).
 * Returns true if handled, false otherwise.
 */
async function _tryCrossWindowDrop(
  sourceWinId: string,
  tabId: string,
  screenX: number,
  screenY: number,
  dragData: string,
): Promise<boolean> {
  try {
    const result = await window.openp41ge.drag.check(screenX, screenY, dragData);
    if (!result || !result.target) return false;

    const target = result.target as Record<string, unknown>;
    const type = target.type as string;
    const targetWinId = (target.winId || result.windowId) as string;

    if (type === "tab-bar") {
      const col = typeof target.col === "number" ? target.col : 0;
      const dropIndex = typeof target.dropIndex === "number" ? target.dropIndex : -1;
      _dispatchCrossWindowMove(sourceWinId, tabId, targetWinId, col, dropIndex);
      return true;
    }

    if (type === "grid-move") {
      const col = typeof target.col === "number" ? target.col : 0;
      _dispatchCrossWindowMove(sourceWinId, tabId, targetWinId, col, -1);
      return true;
    }

    if (type === "grid-split") {
      const splitCol = typeof target.splitCol === "number" ? target.splitCol : 0;
      const splitLeft = typeof target.splitLeft === "boolean" ? target.splitLeft : true;
      _dispatchCrossWindowSplit(sourceWinId, tabId, targetWinId, splitCol, splitLeft);
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

// ── Cross-window dispatch helpers ────────────────────────────────────────

function _dispatchCrossWindowMove(
  sourceWinId: string,
  tabId: string,
  targetWinId: string,
  targetCol: number,
  dropIndex: number,
): void {
  // dispatch uses (fn, ...args) rest params — pass individual arguments, NOT an array
  window.openp41ge.workspace.dispatch(
    "moveTabBetweenCells",
    sourceWinId,
    tabId,
    targetWinId,
    0,
    targetCol,
    dropIndex,
  );
}

function _dispatchCrossWindowSplit(
  sourceWinId: string,
  tabId: string,
  targetWinId: string,
  splitCol: number,
  splitLeft: boolean,
): void {
  window.openp41ge.workspace.dispatch(
    "splitCrossWindowTab",
    sourceWinId,
    tabId,
    targetWinId,
    splitCol,
    splitLeft,
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Test hooks (exposed for AI / manual testing via DevTools)
// ═══════════════════════════════════════════════════════════════════════════

if (typeof window !== "undefined") {
  (window as unknown as Record<string, unknown>)["__openp41geTestHooks"] = {
    setRemoteDragActive: (active: boolean) => {
      _remoteDragActive = active;
      if (!active) _hideCrossWindowGhost();
    },
    setRemoteDragType: (type: string | null) => {
      _remoteDragType = type;
    },
    getRemoteDragType: () => _remoteDragType,
    isRemoteDragActive: () => _remoteDragActive,
    isLocalDragActive: () => _localDragActive,
    getGridGhostOverlay: () =>
      _crossGhostGrid ? _crossGhostGrid.querySelector(".openp41ge-ghost-overlay") : null,
    getLocalGhostOverlay: () =>
      _ghostShownGrid ? _ghostShownGrid.querySelector(".openp41ge-ghost-overlay") : null,
    getOrchestrator: () => _orchestrator,
    setGridCols: (gridEl: HTMLElement, cols: number) => {
      (gridEl as HTMLElement & { cols: number }).cols = cols;
    },
    callUpdateCrossWindowGhost: (cx: number, cy: number) => _updateCrossWindowGhost(cx, cy),
    callHandleCrossWindowDrop: async (cx: number, cy: number, sx: number, sy: number) => {
      await _handleCrossWindowDrop(cx, cy, sx, sy);
    },
    forceCrossWindowGhostCleanup: () => _hideCrossWindowGhost(),
    gridEl: () => document.querySelector("tab-grid") as HTMLElement | null,
    getGitEntryPendingStart: () => _pendingGitEntryDragStart,
    getLogStreamPendingStart: () => _pendingLogStreamDragStart,
    getCurrentDragSourceType: () => _currentSource?.type ?? null,
    getCurrentDragData: () => _currentSource?.getDragData() ?? null,
    hasGitEntryRowSuppressed: () => _gitEntryRowSuppressedDrag !== null,
    restoreGitEntryRowDraggable: () => _restoreGitEntryRowDraggable(),
    resetTestDragState: () => {
      _orchestrator?.cancelDrag();
      _currentSource = null;
      _pendingDragStart = null;
      _pendingFileDragStart = null;
      _pendingSidebarDragStart = null;
      _pendingGitEntryDragStart = null;
      _pendingLogStreamDragStart = null;
      _gitEntryRowSuppressedDrag = null;
      _suppressGitEntryRowClick = false;
      _suppressLogStreamRowClick = false;
      _localDragActive = false;
      _localFileDragActive = false;
      _sidebarTabDragSide = null;
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Cross-window ghost overlay
// ═══════════════════════════════════════════════════════════════════════════

/** Track the grid element that currently has a cross-window ghost overlay. */
let _crossGhostGrid: HTMLElement | null = null;

/**
 * Cached reference to the <tab-grid> element in this window. Found once on
 * first call and reused — avoids elementFromPoint + closest, which can fail
 * silently if the DOM underneath the cursor changes or shadow boundaries
 * prevent closest() from reaching the grid.
 */
let _crossWindowGrid: HTMLElement | null = null;
let _crossWindowGridCols = 1;

/**
 * Show a grid ghost overlay in this window for a cross-window drag preview.
 * Called from mousemove when _remoteDragActive is true.
 *
 * Uses a cached grid reference (found once, not per-frame) to avoid
 * elementFromPoint + closest issues with shadow DOM or pointer-events.
 * Cursor position relative to the grid's bounding rect drives the
 * split/cell-center classification via computeDropTarget.
 */
function _updateCrossWindowGhost(clientX: number, clientY: number): void {
  // Sidebar-tab drags are sidebar-only, and workspace-skeleton drags open a
  // workspace window on drop — neither may light up a central grid as a drop
  // zone, so skip the grid ghost preview entirely.
  if (_remoteDragType === "sidebar-tab" || _remoteDragType === "workspace") {
    _hideCrossWindowGhost();
    return;
  }

  // Find and cache the grid ONCE
  if (!_crossWindowGrid || !document.contains(_crossWindowGrid)) {
    _crossWindowGrid = document.querySelector("tab-grid") as HTMLElement | null;
    if (!_crossWindowGrid) return;
    _crossWindowGridCols = (_crossWindowGrid as HTMLElement & { cols?: number }).cols ?? 1;
  }

  const rect = _crossWindowGrid.getBoundingClientRect();

  // Hide ghost if cursor leaves the grid bounds
  if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) {
    _hideCrossWindowGhost();
    return;
  }

  const relX = clientX - rect.left;
  const pos = computeDropTarget(_crossWindowGrid, relX, rect.width, _crossWindowGridCols);
  const mouseCol = pos.col;
  log.debug("compute-drop-target", {
    x: clientX,
    y: clientY,
    cols: _crossWindowGridCols,
    col: mouseCol,
    isBoundary: pos.isBoundary,
    boundaryIndex: pos.boundaryIndex ?? -1,
    relX,
  });

  if (pos.isBoundary) {
    const splitLeft =
      pos.boundaryIndex === 0
        ? true
        : pos.boundaryIndex >= _crossWindowGridCols
          ? false
          : mouseCol >= pos.boundaryIndex;
    const splitCol =
      pos.boundaryIndex === 0
        ? 0
        : pos.boundaryIndex >= _crossWindowGridCols
          ? _crossWindowGridCols - 1
          : mouseCol;
    _ghostManager.showGhost(_crossWindowGrid, {
      cols: _crossWindowGridCols,
      boundaryIndex: pos.boundaryIndex,
      splitCol,
      splitLeft,
      activeCol: mouseCol,
    });
  } else {
    _ghostManager.showGhost(_crossWindowGrid, {
      cols: _crossWindowGridCols,
      activeCol: mouseCol,
    });
  }
  log.debug("ghost-update", {
    x: clientX,
    y: clientY,
    cols: _crossWindowGridCols,
    isBoundary: pos.isBoundary,
    mouseCol,
  });
  _crossGhostGrid = _crossWindowGrid;
}

function _hideCrossWindowGhost(): void {
  if (_crossGhostGrid) {
    _ghostManager.hideGhost(_crossGhostGrid);
    _crossGhostGrid = null;
  }
  _crossWindowGrid = null;
}

// ═══════════════════════════════════════════════════════════════════════════
// Target resolver
// ═══════════════════════════════════════════════════════════════════════════

// Cache sidebar drop targets by side to avoid creating new instances on every mousemove
let _sidebarDropTargetLeft: SidebarDropTarget | null = null;
let _sidebarDropTargetRight: SidebarDropTarget | null = null;

// Cache the explorer repo-reorder drop target (one per drop-zone element).
let _explorerReorderTarget: ExplorerReorderDropTarget | null = null;

function _getExplorerReorderTarget(zoneEl: HTMLElement): ExplorerReorderDropTarget {
  if (_explorerReorderTarget && _explorerReorderTarget.element === zoneEl) {
    return _explorerReorderTarget;
  }
  _explorerReorderTarget = new ExplorerReorderDropTarget(zoneEl);
  return _explorerReorderTarget;
}

// Cache the closed-sidebar edge targets (one per side) for the same reason.
let _closedSidebarEdgeTargetLeft: ClosedSidebarDropTarget | null = null;
let _closedSidebarEdgeTargetRight: ClosedSidebarDropTarget | null = null;

/**
 * How close (in viewport px) the cursor must be to the app-window edge on the
 * closed side before the closed-sidebar edge drop indicator appears.
 */
const CLOSED_SIDEBAR_EDGE_THRESHOLD = 160;

function _isSidebarOpen(side: "left" | "right"): boolean {
  const host = document.querySelector(`openp41ge-sidebar[side="${side}"]`);
  return (
    host instanceof HTMLElement &&
    host.offsetHeight > 0 &&
    !host.classList.contains("sidebar-element-hidden")
  );
}

function _getClosedSidebarDropTarget(side: "left" | "right"): ClosedSidebarDropTarget | null {
  if (side === "left" && _closedSidebarEdgeTargetLeft) return _closedSidebarEdgeTargetLeft;
  if (side === "right" && _closedSidebarEdgeTargetRight) return _closedSidebarEdgeTargetRight;

  const hostEl = document.querySelector(`openp41ge-sidebar[side="${side}"]`);
  if (!(hostEl instanceof HTMLElement)) return null;
  const barEl = document.querySelector(`[data-sidebar-tab-bar="${side}"]`);
  const target = new ClosedSidebarDropTarget(
    hostEl,
    _resolveMyWinId(),
    side,
    barEl instanceof HTMLElement ? barEl : null,
  );
  if (side === "left") _closedSidebarEdgeTargetLeft = target;
  else _closedSidebarEdgeTargetRight = target;
  return target;
}

/**
 * When the cursor is within CLOSED_SIDEBAR_EDGE_THRESHOLD of the app-window
 * edge on the CLOSED other side, resolve to the closed-sidebar edge target — a
 * vertical-line drop indicator at the window edge; dropping moves the tab to
 * that sidebar (auto-opening it). Returns null when the cursor is elsewhere or
 * the other sidebar is open.
 */
function _resolveClosedSidebarEdgeTarget(clientX: number, sourceSide: string): IDropTarget | null {
  if (sourceSide !== "left" && sourceSide !== "right") return null;

  const otherSide: "left" | "right" = sourceSide === "left" ? "right" : "left";

  // If the other sidebar is open, its tab bar is the drop surface — the edge
  // line must never show for an open sidebar.
  if (_isSidebarOpen(otherSide)) return null;

  const nearLeft = clientX <= CLOSED_SIDEBAR_EDGE_THRESHOLD;
  const nearRight = clientX >= window.innerWidth - CLOSED_SIDEBAR_EDGE_THRESHOLD;

  if (otherSide === "left") {
    if (!nearLeft) return null;
  } else if (!nearRight) {
    return null;
  }

  return _getClosedSidebarDropTarget(otherSide);
}

function _getSidebarDropTarget(side: "left" | "right"): SidebarDropTarget | null {
  if (side === "left" && _sidebarDropTargetLeft) return _sidebarDropTargetLeft;
  if (side === "right" && _sidebarDropTargetRight) return _sidebarDropTargetRight;

  const barEl = document.querySelector(`[data-sidebar-tab-bar="${side}"]`);
  if (!(barEl instanceof HTMLElement)) return null;

  const winId = _resolveMyWinId();
  const target = new SidebarDropTarget(barEl, winId, side);
  if (side === "left") _sidebarDropTargetLeft = target;
  else _sidebarDropTargetRight = target;
  return target;
}

function _clearSidebarDropTargetCache(): void {
  // Any live edge indicator must be removed before the cached targets are dropped.
  _closedSidebarEdgeTargetLeft?.onLeave();
  _closedSidebarEdgeTargetRight?.onLeave();
  _sidebarDropTargetLeft = null;
  _sidebarDropTargetRight = null;
  _closedSidebarEdgeTargetLeft = null;
  _closedSidebarEdgeTargetRight = null;
  // Remove any explorer reorder insertion line still on screen.
  _explorerReorderTarget?.onLeave();
  _explorerReorderTarget = null;
}

export function openp41geTargetResolver(clientX: number, clientY: number): IDropTarget | null {
  const el = document.elementFromPoint(clientX, clientY);
  if (!el || !(el instanceof HTMLElement)) return null;

  // The sidebar side of the current drag, if it is a sidebar-tab drag. Read from
  // the live source during moves, or from _sidebarTabDragSide for the final
  // mouseup resolve (the orchestrator fires DRAG_EVENTS.END — host teardown
  // nulls _currentSource — BEFORE it resolves the drop target). Both must agree
  // so the drop indicator and the drop land on the same target.
  let sidebarDragSide: string | null = null;
  if (_currentSource) {
    const d = _currentSource.getDragData() as { side?: string };
    sidebarDragSide = d.side === "left" || d.side === "right" ? d.side : null;
  } else {
    sidebarDragSide = _sidebarTabDragSide;
  }

  // When dragging a sidebar tab, only sidebar surfaces are valid targets.
  // Skip grid tab bars and grid cells entirely.
  if (sidebarDragSide) {
    const sidebarBarEl = el.closest?.("[data-sidebar-tab-bar]");
    if (sidebarBarEl instanceof HTMLElement) {
      const side = sidebarBarEl.getAttribute("data-sidebar-tab-bar") as "left" | "right";
      if (side === "left" || side === "right") {
        return _getSidebarDropTarget(side);
      }
    }
    // Also allow drop on sidebar content area (appends to end of tab bar)
    const sidebarContentEl = el.closest?.("[data-sidebar-content]");
    if (sidebarContentEl instanceof HTMLElement) {
      const side = sidebarContentEl.getAttribute("data-sidebar-content") as "left" | "right";
      if (side === "left" || side === "right") {
        return _getSidebarDropTarget(side);
      }
    }
    // No real sidebar surface under the cursor. If the OTHER sidebar is closed
    // and the cursor is close enough to that window edge, resolve to the
    // closed-sidebar edge target so the drop can still land there.
    return _resolveClosedSidebarEdgeTarget(clientX, sidebarDragSide);
  }

  // Git-entry (repo/worktree row) drag: the ACTION is decided by drop
  // location. Over the explorer list the cursor resolves to the reorder
  // target; over the grid/tab bar it behaves exactly like a file drop
  // (grid open via grid-open-tab); anywhere else the drop cancels.
  if (_currentSource?.type === "open-tab") {
    const explorerZone = el.closest?.("[data-explorer-drop-zone]");
    if (explorerZone instanceof HTMLElement) {
      return _getExplorerReorderTarget(explorerZone);
    }
    // Fall through to the normal grid resolution below.
  }

  // Normal (non-sidebar) drag: check grid tab bars and grid cells
  const isFileDrag = _currentSource?.type === "file" || _currentSource?.type === "open-tab";
  const tabBarEl = el.closest?.("tab-bar");
  if (tabBarEl instanceof HTMLElement) {
    if (isFileDrag) {
      // TabBarDropTarget rejects non-tab sources, so a file dropped on a cell's
      // tab bar must resolve to the enclosing grid — GridDropTarget then computes
      // the column under the cursor (cell-center/boundary), matching the native
      // path and cross-window file drops.
      const gridEl = tabBarEl.closest?.("tab-grid");
      if (gridEl instanceof HTMLElement) {
        const gridTarget = (gridEl as HTMLElement & { dropTarget?: IDropTarget }).dropTarget;
        if (gridTarget) return gridTarget;
      }
    } else {
      const dropTarget = (tabBarEl as HTMLElement & { dropTarget?: IDropTarget }).dropTarget;
      if (dropTarget) return dropTarget;
    }
  }

  const tabGridEl = el.closest?.("tab-grid");
  if (tabGridEl instanceof HTMLElement) {
    const dropTarget = (tabGridEl as HTMLElement & { dropTarget?: IDropTarget }).dropTarget;
    if (dropTarget) return dropTarget;
  }

  // Sidebar surfaces are ONLY targets for sidebar-tab (system-tab) drags, which
  // are handled exclusively by the sidebar branch above (during moves via the
  // live source, at the final mouseup via _sidebarTabDragSide). Grid-tab and file
  // drags must never resolve the sidebar as a drop target — grid tabs can't be
  // dropped there (SidebarDropTarget rejects non-system-tab sources), so the
  // sidebar drop indicator must not light up for them.

  return null;
}

// ═══════════════════════════════════════════════════════════════════════════
// Local ghost overlay (same-window drag)
// ═══════════════════════════════════════════════════════════════════════════

let _ghostShownGrid: HTMLElement | null = null;

function updateGridGhost(clientX: number, clientY: number): void {
  clearGridGhost();

  const target = openp41geTargetResolver(clientX, clientY);
  if (!target || target.type !== "grid") return;

  const source = _currentSource;
  if (!source) return;
  const feedback = target.onHover(source, clientX, clientY);
  if (!feedback || !feedback.showGhost || !feedback.ghostConfig) return;

  const cfg = feedback.ghostConfig as Record<string, unknown>;
  _ghostManager.showGhost(target.element, {
    cols: (cfg.cols as number) ?? 1,
    boundaryIndex: cfg.boundaryIndex as number | undefined,
    splitCol: cfg.splitCol as number | undefined,
    splitLeft: cfg.splitLeft as boolean | undefined,
    // GridDropTarget.onHover returns `mouseCol` in split config,
    // but `col` in cell-center config — handle both.
    activeCol: (cfg.mouseCol ?? cfg.col ?? 0) as number,
  });
  _ghostShownGrid = target.element;
}

function clearGridGhost(): void {
  if (_ghostShownGrid) {
    _ghostManager.hideGhost(_ghostShownGrid);
    _ghostShownGrid = null;
  }
}
