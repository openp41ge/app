/**
 * GridDropTarget — handles drops on the grid surface (cells and boundaries).
 *
 * Fires CustomEvents on `this.element` for drop operations.
 * The host application (openp41ge) listens for these events and routes
 * them to IPC / workspace operations.
 *
 * Events (bubbling):
 *   grid-split       — { winId, tabId, splitCol, splitLeft, focusTabId }
 *   grid-activate    — { winId, tabId }
 *   grid-move        — { sourceWinId, tabId, targetWinId, targetCol, insertAt, focusTabId }
 *   grid-remove      — { winId, tabId, focusTabId }
 *   grid-open-tab    — { winId, tabType, tabConfig, targetCol }
 */

import type {
  IDragSource,
  IDropTarget,
  DragResult,
  DragSourceData,
  TargetFeedback,
} from "../interfaces";
import { computeDropTarget, isSameFilePathInCell } from "../boundary";

export const GRID_EVENTS = {
  SPLIT: "grid-split",
  ACTIVATE: "grid-activate",
  MOVE: "grid-move",
  REMOVE: "grid-remove",
  OPEN_TAB: "grid-open-tab",
} as const;

export interface WorkspaceLike {
  tabs: Record<string, { config?: { filePath?: string } }>;
}

export interface GridElementLike {
  pageData?: {
    id: string;
    grid: {
      cols: number;
      placements: Array<{
        position: { row: number; col: number };
        tabIds: string[];
      }>;
    };
  };
  winId: string;
  _lastActiveCellCol?: number;
  _focusedCol?: number;
  _getNextTabForCell?: (col: number, tabId: string) => string | undefined;
  getBoundingClientRect(): DOMRect;
  querySelectorAll(selectors: string): NodeListOf<Element>;
}

export class GridDropTarget implements IDropTarget {
  readonly type = "grid";
  readonly element: HTMLElement;

  readonly winId: string;
  private _workspace: WorkspaceLike | null;

  constructor(gridEl: HTMLElement, winId: string, workspace?: WorkspaceLike | null) {
    this.element = gridEl;
    this.winId = winId;
    this._workspace = workspace ?? null;
  }

  onHover(_source: IDragSource, clientX: number, _clientY: number): TargetFeedback | null {
    const gridEl = this.element as unknown as GridElementLike;
    const pageData = gridEl.pageData;
    if (!pageData) return null;

    const rect = this.element.getBoundingClientRect();
    const relX = clientX - rect.left;
    const cols = pageData.grid.cols;
    const pos = computeDropTarget(this.element, relX, rect.width, cols);
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
      return {
        showGhost: true,
        ghostConfig: {
          type: "split",
          boundaryIndex: pos.boundaryIndex,
          cols,
          mouseCol,
          splitLeft,
          splitCol,
        },
      };
    }

    return {
      showGhost: true,
      ghostConfig: { type: "cell-highlight", col: mouseCol, cols },
    };
  }

  async onDrop(source: IDragSource, clientX: number, _clientY: number): Promise<DragResult> {
    const gridEl = this.element as unknown as GridElementLike;
    const pageData = gridEl.pageData;
    if (!pageData) return { success: false, reason: "no page data" };

    const rect = this.element.getBoundingClientRect();
    const relX = clientX - rect.left;
    const cols = pageData.grid.cols;
    const data = source.getDragData();
    const pos = computeDropTarget(this.element, relX, rect.width, cols);

    if (pos.isBoundary) {
      return this._handleBoundaryDrop(data, pos.boundaryIndex, pos.col, cols, gridEl);
    }

    return this._handleCellDrop(data, pos.col, gridEl);
  }

  onLeave(): void {
    // Visual cleanup handled by the orchestrator
  }

  private _fire(type: string, detail: Record<string, unknown>): void {
    this.element.dispatchEvent(new CustomEvent(type, { bubbles: true, detail }));
  }

  private _handleBoundaryDrop(
    data: DragSourceData,
    boundaryIndex: number,
    mouseCol: number,
    cols: number,
    gridEl: GridElementLike,
  ): DragResult {
    let splitCol: number;
    let splitLeft: boolean;

    if (boundaryIndex === 0) {
      splitCol = 0;
      splitLeft = true;
    } else if (boundaryIndex >= cols) {
      splitCol = cols - 1;
      splitLeft = false;
    } else if (mouseCol < boundaryIndex) {
      splitCol = mouseCol;
      splitLeft = false;
    } else {
      splitCol = mouseCol;
      splitLeft = true;
    }

    if (data.type === "tab" || data.type === "openp41ge-tab") {
      let focusTabId: string | undefined;
      if (gridEl._getNextTabForCell) {
        focusTabId = gridEl._getNextTabForCell(gridEl._lastActiveCellCol ?? 0, data.tabId);
      }

      this._fire(GRID_EVENTS.SPLIT, {
        sourceWinId: data.winId,
        winId: this.winId,
        tabId: data.tabId,
        splitCol,
        splitLeft,
        focusTabId,
      });

      gridEl._lastActiveCellCol = splitLeft ? splitCol : splitCol + 1;
      gridEl._focusedCol = gridEl._lastActiveCellCol;
      return { success: true };
    }

    if (data.type === "file") {
      // For file boundary drops, fire grid-open-tab with split info.
      // The Openp41geTabsEventHandler will dispatch splitFileOpen.
      this._fire(GRID_EVENTS.OPEN_TAB, {
        winId: this.winId,
        tabType: "file-viewer",
        tabConfig: { filePath: data.filePath },
        targetCol: splitCol,
        isBoundary: true,
        splitCol,
        splitLeft,
        pinned: true,
      });
      return { success: true };
    }

    return { success: false, reason: "boundary drop not supported for this type" };
  }

  private _handleCellDrop(
    data: DragSourceData,
    targetCol: number,
    gridEl: GridElementLike,
  ): DragResult {
    const pageData = gridEl.pageData;
    if (!pageData) return { success: false, reason: "no page data" };

    if (data.type === "tab" || data.type === "openp41ge-tab") {
      const targetPlacement = pageData.grid.placements.find(
        (p) => p.position.row === 0 && p.position.col === targetCol,
      );

      if (targetPlacement && targetPlacement.tabIds.includes(data.tabId)) {
        this._fire(GRID_EVENTS.ACTIVATE, { winId: this.winId, tabId: data.tabId });
        gridEl._lastActiveCellCol = targetCol;
        gridEl._focusedCol = targetCol;
        return { success: true };
      }

      if (
        this._workspace &&
        targetPlacement &&
        isSameFilePathInCell(this._workspace, data.tabId, targetPlacement.tabIds as string[])
      ) {
        let focusTabId: string | undefined;
        if (gridEl._getNextTabForCell) {
          focusTabId = gridEl._getNextTabForCell(gridEl._lastActiveCellCol ?? 0, data.tabId);
        }
        this._fire(GRID_EVENTS.REMOVE, { winId: this.winId, tabId: data.tabId, focusTabId });
        gridEl._lastActiveCellCol = targetCol;
        gridEl._focusedCol = targetCol;
        return { success: true };
      }

      let focusTabId: string | undefined;
      if (gridEl._getNextTabForCell) {
        focusTabId = gridEl._getNextTabForCell(gridEl._lastActiveCellCol ?? 0, data.tabId);
      }

      this._fire(GRID_EVENTS.MOVE, {
        sourceWinId: data.winId,
        tabId: data.tabId,
        targetWinId: this.winId,
        targetCol,
        insertAt: -1,
        focusTabId,
      });

      gridEl._lastActiveCellCol = targetCol;
      gridEl._focusedCol = targetCol;
      return { success: true };
    }

    if (data.type === "file") {
      this._fire(GRID_EVENTS.OPEN_TAB, {
        winId: "",
        tabType: "file-viewer",
        tabConfig: { filePath: data.filePath },
        targetCol,
      });
      return { success: true };
    }

    return { success: false, reason: "drop not supported for this type" };
  }
}
