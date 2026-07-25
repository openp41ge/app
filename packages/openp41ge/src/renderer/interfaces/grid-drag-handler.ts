/**
 * Grid drag handler — pane drag state machine.
 *
 * Manages the drag-to-move-pane interaction within the grid.
 * Tracks mouse events and determines drop target (cell center or boundary).
 */

import type { Tab } from "../../layout/types";
import type { ICommandBus } from "./command-bus";
import type { IGhostRenderer } from "./ghost-renderer";

export interface IGridDragHandler {
  /** Initialize with required dependencies. */
  init(commandBus: ICommandBus, ghostRenderer: IGhostRenderer): void;

  /** Handle mousedown on a pane element. */
  handleMouseDown(
    e: MouseEvent,
    paneId: string,
    gridEl: HTMLElement,
    getTab: (id: string) => Tab | undefined,
    getTabMap: () => Record<string, Tab | undefined>,
  ): void;

  /** Cancel any active drag. */
  cancelDrag(): void;
}
