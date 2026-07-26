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
} from "../openp41ge-tabs-adapter";

let _orchestrator: DragOrchestrator | null = null;
let _currentSource: IDragSource | null = null;
let _ghostManager = new GhostManager();

/** Whether another Electron window has an active drag. */
let _remoteDragActive = false;
/** Whether our window has an active local drag. */
let _localDragActive = false;

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

    // Use a ghostFactory that returns an invisible element — we only want the
    // main-process BrowserWindow ghost (DragGhostManager), not the in-DOM floating ghost.
    const dragSource = new TabDragSource(tabBtn, tabId, winId, col.toString(), label, () => {
      const ghost = document.createElement("div");
      ghost.style.cssText =
        "position:fixed;pointer-events:none;opacity:0;width:1px;height:1px;z-index:-1;";
      return ghost;
    });
    _currentSource = dragSource;
    _orchestrator?.startDrag(dragSource, e.clientX, e.clientY);

    window.openp41ge.drag.start(
      label,
      e.screenX,
      e.screenY,
      undefined,
      tabId,
      winId,
      col.toString(),
    );
  };

  document.addEventListener("mousedown", onMouseDown);
  cleanups.push(() => document.removeEventListener("mousedown", onMouseDown));

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
    if (_localDragActive) {
      clearGridGhost();
      _localDragActive = false;
      _currentSource = null;
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
      window.openp41ge.drag.move(detail.screenX, detail.screenY);
      if (!_dragActivated) {
        _dragActivated = true;
        _localDragActive = true;
        window.openp41ge.drag.activate();
      }
    }
  });

  // ── Orchestrator end event → hide main-process ghost ─────────────────
  const onDragEnd = () => {
    _dragActivated = false;
    _focusedOnEntry = false;
    window.openp41ge.drag.end();
    clearGridGhost();
    _localDragActive = false;
    _currentSource = null;
  };

  document.addEventListener(DRAG_EVENTS.END, onDragEnd);
  cleanups.push(() => document.removeEventListener(DRAG_EVENTS.END, onDragEnd));

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

    window.openp41ge.workspace.detachTab(detail.winId, detail.tabId, detail.bounds);
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

  // ── Incoming ghost position from main process poll ───────────────────
  // The main process polls screen.getCursorScreenPoint() at ~20fps during
  // a drag and broadcasts the position to all windows. This is the only
  // reliable source of continuous cursor coordinates during cross-window
  // drags — no renderer process receives mousemove events continuously.
  // ── Incoming ghost position from main process poll ───────────────────
  // The main process polls screen.getCursorScreenPoint() at ~20fps during
  // a drag and broadcasts the position to all windows. This is the only
  // reliable source of continuous cursor coordinates during cross-window
  // drags — no renderer process receives mousemove events continuously.
  type GhostShowData = { screenX: number; screenY: number; label?: string };
  window.openp41ge.drag.onGhostShow((data: GhostShowData) => {
    const screenX = data.screenX;
    const screenY = data.screenY;
    if (typeof screenX !== "number" || typeof screenY !== "number") return;

    _remoteDragActive = true;

    // Convert screen → viewport coordinates and show ghost
    const cx = screenX - window.screenX;
    const cy = screenY - window.screenY;
    _updateCrossWindowGhost(cx, cy);
  });

  // ── Remote drag state tracking ───────────────────────────────────────
  // Main process broadcasts drag-state (active/inactive) to all windows.
  window.openp41ge.drag.onDragState((active: boolean) => {
    _remoteDragActive = active;
    if (!active) {
      _hideCrossWindowGhost();
    }
  });

  // ── Incoming end-session event (source window cleanup) ────────────────
  window.openp41ge.drag.onEndSession(() => {
    _dragActivated = false;
    _focusedOnEntry = false;
    _localDragActive = false;
    _orchestrator?.cancelDrag();
    window.openp41ge.drag.end();
    clearGridGhost();
    _currentSource = null;
  });

  return () => {
    _ghostManager.dispose();
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

      // Use computeDropTarget for boundary detection — same logic as
      // GridDropTarget.onDrop, handles all column counts including cols === 1.
      const pos = computeDropTarget(gridEl, relX, gridRect.width, cols);
      const mouseCol = pos.col;

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

export function openp41geTargetResolver(clientX: number, clientY: number): IDropTarget | null {
  const el = document.elementFromPoint(clientX, clientY);
  if (!el || !(el instanceof HTMLElement)) return null;

  const tabBarEl = el.closest?.("tab-bar");
  if (tabBarEl instanceof HTMLElement) {
    const dropTarget = (tabBarEl as HTMLElement & { dropTarget?: IDropTarget }).dropTarget;
    if (dropTarget) return dropTarget;
  }

  const tabGridEl = el.closest?.("tab-grid");
  if (tabGridEl instanceof HTMLElement) {
    const dropTarget = (tabGridEl as HTMLElement & { dropTarget?: IDropTarget }).dropTarget;
    if (dropTarget) return dropTarget;
  }

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
