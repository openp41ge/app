/**
 * init-drag-system — Initializes the openp41ge-tabs drag-and-drop system.
 *
 * Sets up:
 *   1. A custom target resolver that maps DOM elements to openp41ge-tabs
 *      drop targets (TabBarDropTarget, GridDropTarget)
 *   2. A mousedown handler on document that starts drag sessions
 *      when the user grabs a tab button
 *   3. The DragOrchestrator that coordinates the drag lifecycle
 *   4. Cross-window drag bridge — main-process ghost overlay, cross-window
 *      hit-testing, and detach-to-new-window handling.
 *
 * Called during bootstrap via StartupContext.wireServices().
 */

import {
  DragOrchestrator,
  TabDragSource,
  GhostManager,
  DRAG_EVENTS,
  type IDragSource,
  type IDropTarget,
} from "../openp41ge-tabs-adapter";

let _orchestrator: DragOrchestrator | null = null;
let _currentSource: IDragSource | null = null;
let _ghostManager = new GhostManager();

/**
 * Initialize the drag system. Call once during startup.
 * Returns a cleanup function.
 */
export function initDragSystem(): () => void {
  const cleanups: (() => void)[] = [];

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

    // Ignore close button clicks
    if ((e.target as HTMLElement).closest?.(".tab-close")) return;

    e.preventDefault();

    const tabId = tabBtn.getAttribute("data-tab-id") || "";
    const tabBarEl = tabBtn.closest?.("tab-bar");
    if (!tabBarEl) return;

    const tabBar = tabBarEl as HTMLElement & { winId?: string; col?: number };
    const winId = tabBar.winId || "";
    const col = tabBar.col ?? 0;
    const label = tabBtn.textContent?.trim() || "Tab";

    const dragSource = new TabDragSource(tabBtn, tabId, winId, col.toString(), label);
    _currentSource = dragSource;
    _orchestrator?.startDrag(dragSource, e.clientX, e.clientY);

    // Show main-process ghost overlay (visible outside the window)
    window.openp41ge.drag.start(label, e.screenX, e.screenY);
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

  // ── Mousemove: update grid ghost + cross-window detection ────────────
  const onMouseMove = (e: MouseEvent) => {
    if (!_orchestrator?.isDragging) return;

    // Update the in-window grid ghost overlay
    updateGridGhost(e.clientX, e.clientY);

    // Cross-window detection: if elementFromPoint returns null, the cursor
    // has left the Electron window. The main-process ghost overlay (started
    // in mousedown) keeps the drag visual visible. The orchestrator fires
    // openp41ge-drag-detach when no target is found on mouseup, which opens
    // the tab in a new window.
  };

  document.addEventListener("mousemove", onMouseMove);
  cleanups.push(() => document.removeEventListener("mousemove", onMouseMove));

  // ── Mouseup: clear grid ghost ────────────────────────────────────────
  const onMouseUp = () => {
    clearGridGhost();
    _currentSource = null;
  };

  document.addEventListener("mouseup", onMouseUp);
  cleanups.push(() => document.removeEventListener("mouseup", onMouseUp));

  // ── Orchestrator position events → move main-process ghost ───────────
  const onPosition = (e: Event) => {
    const detail = (e as CustomEvent).detail as { screenX: number; screenY: number };
    if (detail) {
      window.openp41ge.drag.move(detail.screenX, detail.screenY);
    }
  };

  document.addEventListener(DRAG_EVENTS.POSITION, onPosition);
  cleanups.push(() => document.removeEventListener(DRAG_EVENTS.POSITION, onPosition));

  // ── Orchestrator end event → hide main-process ghost ─────────────────
  const onDragEnd = () => {
    window.openp41ge.drag.end();
    clearGridGhost();
    _currentSource = null;
  };

  document.addEventListener(DRAG_EVENTS.END, onDragEnd);
  cleanups.push(() => document.removeEventListener(DRAG_EVENTS.END, onDragEnd));

  // ── Orchestrator detach event → create new window ────────────────────
  const onDetach = (e: Event) => {
    const detail = (e as CustomEvent).detail as {
      winId: string;
      tabId: string;
      bounds: { x: number; y: number; width: number; height: number };
    };
    if (detail) {
      window.openp41ge.workspace.detachTab(detail.winId, detail.tabId, detail.bounds);
    }
  };

  document.addEventListener(DRAG_EVENTS.DETACH, onDetach);
  cleanups.push(() => document.removeEventListener(DRAG_EVENTS.DETACH, onDetach));

  return () => {
    _ghostManager.dispose();
    for (const fn of cleanups) fn();
  };
}

// ── Target resolver ───────────────────────────────────────────────────────

/**
 * Target resolver for openp41ge-tabs DragOrchestrator.
 *
 * Maps coordinates to the correct openp41ge-tabs drop target:
 *   - If over a <tab-bar> → use the bar's internal TabBarDropTarget
 *   - If over a <tab-grid> → use the grid's internal GridDropTarget
 */
export function openp41geTargetResolver(clientX: number, clientY: number): IDropTarget | null {
  const el = document.elementFromPoint(clientX, clientY);
  if (!el || !(el instanceof HTMLElement)) return null;

  // Check for tab bar first (higher z-order)
  const tabBarEl = el.closest?.("tab-bar");
  if (tabBarEl instanceof HTMLElement) {
    const dropTarget = (tabBarEl as HTMLElement & { dropTarget?: IDropTarget }).dropTarget;
    if (dropTarget) return dropTarget;
  }

  // Check for tab grid
  const tabGridEl = el.closest?.("tab-grid");
  if (tabGridEl instanceof HTMLElement) {
    const dropTarget = (tabGridEl as HTMLElement & { dropTarget?: IDropTarget }).dropTarget;
    if (dropTarget) return dropTarget;
  }

  return null;
}

// ── Ghost overlay management ──────────────────────────────────────────────

/** Track the grid element that currently has a ghost overlay. */
let _ghostShownGrid: HTMLElement | null = null;

/**
 * Update the grid ghost overlay based on the current cursor position.
 */
function updateGridGhost(clientX: number, clientY: number): void {
  clearGridGhost();

  const target = openp41geTargetResolver(clientX, clientY);
  if (!target || target.type !== "grid") return;

  const source = _currentSource;
  if (!source) return;
  const feedback = target.onHover(source, clientX, clientY);
  if (!feedback || !feedback.showGhost || !feedback.ghostConfig) return;

  const cfg = feedback.ghostConfig as {
    cols?: number;
    boundaryIndex?: number;
    splitCol?: number;
    splitLeft?: boolean;
    mouseCol?: number;
  };
  _ghostManager.showGhost(target.element, {
    cols: cfg.cols ?? 1,
    boundaryIndex: cfg.boundaryIndex,
    splitCol: cfg.splitCol,
    splitLeft: cfg.splitLeft,
    activeCol: cfg.mouseCol ?? 0,
  });
  _ghostShownGrid = target.element;
}

function clearGridGhost(): void {
  if (_ghostShownGrid) {
    _ghostManager.hideGhost(_ghostShownGrid);
    _ghostShownGrid = null;
  }
}
