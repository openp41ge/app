/**
 * Tab drag handler — manages tab bar drag-and-drop.
 *
 * Three modes:
 *   - "tab-bar": reorder tabs within the same cell
 *   - "cross-cell": move a tab to a different cell's tab bar
 *   - "grid": drop onto the grid (center or boundary to split)
 */

import type { ICommandBus } from "./command-bus";
import type { IGhostRenderer } from "./ghost-renderer";
import type { ICellTargetRenderer } from "./cell-target-renderer";

export interface TabBarUnderCursor {
  bar: HTMLElement;
  row: number;
  col: number;
}

export interface ITabDragHandler {
  /** Initialize with required dependencies. */
  init(
    commandBus: ICommandBus,
    ghostRenderer: IGhostRenderer,
    cellTargetRenderer: ICellTargetRenderer,
  ): void;

  /**
   * Create a drag starter function for a tab button.
   * Returns a function that can be assigned as the mousedown handler.
   */
  createDragStarter(
    tabBtn: HTMLElement,
    bar: HTMLElement,
    col: number,
    isActive: boolean,
    worksetId: string,
    tid: string,
    winId: string,
  ): (e: MouseEvent) => void;

  /** Cancel any active drag. Reset state. */
  cancelDrag(): void;
}
