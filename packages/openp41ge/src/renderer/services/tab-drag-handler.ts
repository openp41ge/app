import type { ITabDragHandler } from "../interfaces/tab-drag-handler";
import type { ICommandBus } from "../interfaces/command-bus";
import type { IGhostRenderer } from "../interfaces/ghost-renderer";
import type { ICellTargetRenderer } from "../interfaces/cell-target-renderer";
import { isOpenp41geGrid, isHTMLElement } from "../interfaces/element-guards";
import { TabDragSource } from "./drag-sources/tab-drag-source";
import { dragOrchestrator } from "./drag/orchestrator";
import { INSERT_BOUNDARY_THRESHOLD } from "./boundary/detection";

/**
 * Manages tab bar drag-and-drop state machine.
 *
 * Three modes:
 *   - "tab-bar": reorder tabs within the same cell
 *   - "cross-cell": move a tab to a different cell's tab bar
 *   - "grid": drop onto the grid (center or boundary to split)
 *
 * State is stored at module level so it survives grid re-renders
 * during tab-switch-on-hover.
 */
interface DragState {
  active: boolean;
  winId: string;
  worksetId: string;
  tid: string;
  fromIndex: number;
  col: number;
  bar: HTMLElement;
  tabBtn: HTMLElement;
  dragStartX: number;
  dragStartY: number;
  dragStarted: boolean;
  activeMode: "tab-bar" | "cross-cell" | "grid" | "openp41ge-bar" | null;
  splitSide: "left" | "right" | null;
  targetCellTabBar: HTMLElement | null;
  targetCellCoord: { row: number; col: number } | null;
  targetDropIdx: number;
  // Openp41ge-bar mode state
  topBarHighlightedEl: HTMLElement | null;
  topBarHoveredWorksetId: string | null;
  topBarHoverTimeout: ReturnType<typeof setTimeout> | null;
  topBarDropIdx: number;
  topBarCenterZone: boolean;
}

let _state: DragState | null = null;
let _contextMenuActive = false;

function cleanup(): void {
  if (!_state) return;
  document
    .querySelectorAll(
      ".tab-drop-indicator, .openp41ge-ghost-overlay, .openp41ge-split-overlay, .openp41ge-cell-target-highlight",
    )
    .forEach((el) => el.remove());
  _clearTopBarState(_state);
  _state.tabBtn.style.opacity = "1";
  window.openp41ge.drag.end();
  _state = null;
}

/**
 * Clean up openp41ge bar visual state for the given drag state.
 * Also removes any lingering grid overlays (ghost, split, cell highlight).
 */
function _clearTopBarState(s: DragState): void {
  if (s.topBarHoverTimeout) {
    clearTimeout(s.topBarHoverTimeout);
    s.topBarHoverTimeout = null;
  }
  if (s.topBarHighlightedEl) {
    s.topBarHighlightedEl.style.outline = "";
    s.topBarHighlightedEl.style.outlineOffset = "";
    s.topBarHighlightedEl.style.borderRadius = "";
    s.topBarHighlightedEl = null;
  }
  s.topBarHoveredWorksetId = null;
  s.topBarCenterZone = false;
  // Hide the openp41ge bar drop indicator
  const pb = document.querySelector("openp41ge-topbar");
  if (pb instanceof HTMLElement) {
    const indEl = pb.querySelector(".topbar-drop-indicator");
    if (indEl instanceof HTMLElement) indEl.style.display = "none";
  }
  // Also remove any lingering grid overlays
  document
    .querySelectorAll(
      ".openp41ge-ghost-overlay, .openp41ge-split-overlay, .openp41ge-cell-target-highlight, .tab-drop-indicator",
    )
    .forEach((el) => el.remove());
}

/**
 * Reset module-level tab drag state.
 * Called during app reset to clear any in-progress drag.
 */
export function resetTabDragState(): void {
  if (_state) {
    cleanup();
  }
  _contextMenuActive = false;
}

/** Mark context menu as active/inactive so drag handlers can skip
 *  mousedown events that are merely dismissing the native menu. */
export function setContextMenuActive(active: boolean): void {
  _contextMenuActive = active;
  if (!active) {
    // If the menu was just dismissed, also clear any stale drag state.
    if (_state && !_state.dragStarted) {
      cleanup();
    }
    // Clear the context-menu dismissal flag on all tab buttons,
    // so the next click on a tab can start a drag normally.
    document.querySelectorAll<HTMLElement>("[data-_ctx-dismiss]").forEach((el) => {
      delete el.dataset._ctxDismiss;
    });
  }
}

/** Check if a native context menu is currently showing. */
export function isContextMenuActive(): boolean {
  return _contextMenuActive;
}

/**
 * Get the insertion index in a tab bar based on cursor X position.
 */
export function getDropIndexInBar(bar: HTMLElement, clientX: number): number {
  const children = Array.from(bar.children).filter(isHTMLElement);
  const barRect = bar.getBoundingClientRect();
  const relX = clientX - barRect.left;

  // Sum widths to find which gap the cursor is in
  let accumulated = 0;
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    const w = child.getBoundingClientRect().width;
    // Position the indicator at the midpoint between children
    if (relX < accumulated + w / 2) {
      return i;
    }
    accumulated += w;
  }
  return children.length;
}

/**
 * Classify a horizontal position within the grid:
 * - "boundary": cursor is near a column boundary
 * - "cell-center": cursor is inside a cell
 *
 * Uses the shared INSERT_BOUNDARY_THRESHOLD constant from boundary/detection,
 * but maintains its own DOM cell reading and boundary-numbering scheme for
 * backwards compatibility:
 *   index 0..cols, where 0=left-edge, 1..cols-1=interior dividers, cols=right-edge
 *
 * Note: unlike computeDropTarget, this function uses column-relative boundary
 * checking (15% of column width rather than 15% of total width).
 */
export function classifyGridPosition(
  clientX: number,
  gridEl: HTMLElement,
): { type: "boundary" | "cell-center"; index: number; col: number } {
  const rect = gridEl.getBoundingClientRect();
  const relX = clientX - rect.left;
  const cols = isOpenp41geGrid(gridEl) ? (gridEl.pageData?.grid?.cols ?? 1) : 1;

  // Build column right-edge positions from DOM cell flex values
  const cells = gridEl.querySelectorAll(".openp41ge-grid-cell");
  const flexValues: number[] = [];
  for (const cell of cells) {
    const flex = (cell as HTMLElement).style.flex;
    const ratio = flex ? parseFloat(flex) : 1;
    flexValues.push(isNaN(ratio) ? 1 : ratio);
  }
  const totalFlex = flexValues.reduce((a, b) => a + b, 0);
  const dividerPositions: number[] = [];
  if (flexValues.length >= cols && totalFlex > 0) {
    let cum = 0;
    for (let i = 0; i < cols; i++) {
      cum += flexValues[i] / totalFlex;
      dividerPositions.push(cum * rect.width);
    }
  } else {
    for (let i = 1; i <= cols; i++) {
      dividerPositions.push((i / cols) * rect.width);
    }
  }
  const prevDivider = (i: number) => (i === 0 ? 0 : dividerPositions[i - 1]);

  // Find the actual column the mouse is in
  let actualCol = 0;
  for (let c = 0; c < cols; c++) {
    const left = prevDivider(c);
    const right = dividerPositions[c];
    if (relX >= left && relX < right) {
      actualCol = c;
      break;
    }
  }

  // Check if near a boundary (column-relative threshold)
  for (let b = 0; b <= cols; b++) {
    const boundaryPos = b === 0 ? 0 : b === cols ? rect.width : dividerPositions[b - 1];
    let adjColWidth: number;
    if (b === 0) {
      adjColWidth = dividerPositions[0];
    } else if (b === cols) {
      adjColWidth = cols === 1 ? rect.width : rect.width - dividerPositions[cols - 2];
    } else {
      adjColWidth = dividerPositions[b] - dividerPositions[b - 1];
    }
    if (adjColWidth > 0 && Math.abs(relX - boundaryPos) / adjColWidth < INSERT_BOUNDARY_THRESHOLD) {
      return { type: "boundary", index: b, col: actualCol };
    }
  }

  return { type: "cell-center", index: actualCol, col: actualCol };
}

/**
 * Determine which cell to split and which side the dragged tab goes to.
 *
 * The cell under the mouse cursor (target cell) is split. The tab goes to
 * the side of the cell where the mouse is hovering.
 *
 * - boundaryIndex = 0 (left edge): split cell 0, tab goes to LEFT
 * - boundaryIndex >= cols (right edge): split last cell, tab goes to RIGHT
 * - interior boundary N (1..cols-1):
 *     If mouseCol < N (mouse in cell N-1): split cell N-1, tab on RIGHT
 *     If mouseCol >= N (mouse in cell N): split cell N, tab on LEFT
 */
export function splitCellForBoundary(
  cols: number,
  boundaryIndex: number,
  mouseCol: number,
): { col: number; splitLeft: boolean } {
  if (boundaryIndex === 0) {
    return { col: 0, splitLeft: true };
  }
  if (boundaryIndex >= cols) {
    return { col: cols - 1, splitLeft: false };
  }
  // Interior boundary: split the cell the mouse is in
  if (mouseCol < boundaryIndex) {
    // Mouse is in the LEFT cell (N-1), near right edge
    return { col: mouseCol, splitLeft: false };
  } else {
    // Mouse is in the RIGHT cell (N), near left edge
    return { col: mouseCol, splitLeft: true };
  }
}

export class TabDragHandler implements ITabDragHandler {
  private _commandBus: ICommandBus | null = null;

  init(
    commandBus: ICommandBus,
    _ghostRenderer: IGhostRenderer,
    _cellTargetRenderer: ICellTargetRenderer,
  ): void {
    this._commandBus = commandBus;
  }

  createDragStarter(
    tabBtn: HTMLElement,
    _bar: HTMLElement,
    _col: number,
    _isActive: boolean,
    worksetId: string,
    tid: string,
    winId: string,
  ): (e: MouseEvent) => void {
    return (e: MouseEvent) => {
      if (e.button !== 0) return;
      if (_contextMenuActive) return;
      e.preventDefault();

      const label = tabBtn.textContent?.trim() || "Tab";
      const source = new TabDragSource(tabBtn, tid, winId, worksetId, label);
      dragOrchestrator.startDrag(source, e.clientX, e.clientY);
    };
  }

  cancelDrag(): void {
    dragOrchestrator.cancelDrag();
  }
}
