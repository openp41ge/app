/**
 * init-drag-system — Initializes the openp41ge-tabs drag-and-drop system.
 *
 * Sets up:
 *   1. A custom target resolver that maps DOM elements to openp41ge-tabs
 *      drop targets (TabBarDropTarget, GridDropTarget)
 *   2. A mousedown handler on document that starts drag sessions
 *      when the user grabs a tab button
 *   3. The DragOrchestrator that coordinates the drag lifecycle
 *
 * Called during bootstrap (RegisterEventListenersStep).
 */

import {
  DragOrchestrator,
  TabDragSource,
  GhostManager,
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

  // Create the orchestrator
  _orchestrator = new DragOrchestrator(openp41geTargetResolver);
  cleanups.push(() => {
    _orchestrator?.dispose();
    _orchestrator = null;
  });

  // Listen for mousedown on document to initiate tab drags
  const onMouseDown = (e: MouseEvent) => {
    const tabBtn = (e.target as HTMLElement).closest?.("[data-tab-id]");
    if (!tabBtn || !(tabBtn instanceof HTMLElement)) return;

    // Ignore close button clicks
    if ((e.target as HTMLElement).closest?.(".tab-close")) return;

    e.preventDefault();

    const tabId = tabBtn.getAttribute("data-tab-id") || "";
    const tabBarEl = tabBtn.closest?.("tab-bar");

    // Only proceed if we can find the tab bar
    if (!tabBarEl) return;

    const tabBar = tabBarEl as HTMLElement & { winId?: string; col?: number };
    const winId = tabBar.winId || "";
    const col = tabBar.col ?? 0;
    const dragSource = new TabDragSource(tabBtn, tabId, winId, col.toString());
    _currentSource = dragSource;
    _orchestrator?.startDrag(dragSource, e.clientX, e.clientY);
  };

  document.addEventListener("mousedown", onMouseDown);
  cleanups.push(() => document.removeEventListener("mousedown", onMouseDown));

  // Listen for click on tab buttons to activate tabs
  const onClick = (e: MouseEvent) => {
    const tabBtn = (e.target as HTMLElement).closest?.("[data-tab-id]");
    if (!tabBtn || !(tabBtn instanceof HTMLElement)) return;

    // Ignore close button clicks
    if ((e.target as HTMLElement).closest?.(".tab-close")) return;

    const tabId = tabBtn.getAttribute("data-tab-id") || "";
    const tabBarEl = tabBtn.closest?.("tab-bar");
    if (!tabBarEl) return;

    const tabBarEl2 = tabBarEl as HTMLElement & { winId?: string };
    const winId = tabBarEl2.winId || "";

    // Fire grid-activate so the Openp41geTabsEventHandler picks it up
    tabBtn.dispatchEvent(
      new CustomEvent("grid-activate", {
        bubbles: true,
        detail: { winId, tabId },
      }),
    );
  };

  document.addEventListener("click", onClick);
  cleanups.push(() => document.removeEventListener("click", onClick));

  // Track mousemove to update grid ghost overlays
  const onMouseMove = (e: MouseEvent) => {
    if (!_orchestrator?.isDragging) return;
    updateGridGhost(e.clientX, e.clientY);
  };

  document.addEventListener("mousemove", onMouseMove);
  cleanups.push(() => document.removeEventListener("mousemove", onMouseMove));

  const onMouseUp = () => {
    clearGridGhost();
    _currentSource = null;
  };

  document.addEventListener("mouseup", onMouseUp);
  cleanups.push(() => document.removeEventListener("mouseup", onMouseUp));

  return () => {
    _ghostManager.dispose();
    for (const fn of cleanups) fn();
  };
}

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

/** Track the grid element that currently has a ghost overlay. */
let _ghostShownGrid: HTMLElement | null = null;

/**
 * Update the grid ghost overlay based on the current cursor position.
 * Mirrors the demo's updateGridGhost logic.
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
    cols: cfg.cols,
    boundaryIndex: cfg.boundaryIndex,
    splitCol: cfg.splitCol,
    splitLeft: cfg.splitLeft,
    activeCol: cfg.mouseCol ?? cfg.col,
  });
  _ghostShownGrid = target.element;
}

function clearGridGhost(): void {
  if (_ghostShownGrid) {
    _ghostManager.hideGhost(_ghostShownGrid);
    _ghostShownGrid = null;
  }
}
