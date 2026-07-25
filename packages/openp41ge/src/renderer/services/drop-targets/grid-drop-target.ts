/**
 * GridDropTarget — handles drops on the grid surface (cells and boundaries).
 *
 * Visual feedback:
 *   - Hover over a cell center → highlight the cell (ghost overlay)
 *   - Hover near a column boundary → show split overlay (vertical line)
 *   - Manages its own CSS classes and indicator elements on the grid DOM
 *
 * Boundary threshold: within 15% of a divider = boundary zone
 */

import type {
  IDragSource,
  IDropTarget,
  DragResult,
  DragSourceData,
  TargetFeedback,
} from "../../interfaces/drag-handler";
import { isOpenp41geGrid, type Openp41geGridElement } from "../../interfaces/element-guards";
import { getWorkspace } from "../../app";
import { isSameFilePathInCell } from "../../utils/shared-drag-utils";
import { computeDropTarget } from "../boundary/detection";

export class GridDropTarget implements IDropTarget {
  readonly type = "grid";

  readonly element: HTMLElement;
  private _commandBus: { dispatch: (fn: string, ...args: unknown[]) => void };

  constructor(
    gridEl: HTMLElement,
    commandBus: { dispatch: (fn: string, ...args: unknown[]) => void },
  ) {
    this.element = gridEl;
    this._commandBus = commandBus;
  }

  onHover(_source: IDragSource, clientX: number, _clientY: number): TargetFeedback | null {
    if (!isOpenp41geGrid(this.element)) return null;
    const gridEl = this.element as Openp41geGridElement;
    const pageData = gridEl.pageData;
    if (!pageData) return null;

    const rect = this.element.getBoundingClientRect();
    const relX = clientX - rect.left;
    const cols = pageData.grid.cols;

    const pos = computeDropTarget(this.element, relX, rect.width, cols);
    const mouseCol = pos.col;

    if (pos.isBoundary) {
      // Compute split direction (must match _handleBoundaryDrop logic)
      const splitLeft =
        pos.boundaryIndex === 0
          ? true
          : pos.boundaryIndex >= cols
            ? false
            : mouseCol >= pos.boundaryIndex;
      // Compute which column is being split (same logic as _handleBoundaryDrop)
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
      ghostConfig: {
        type: "cell-highlight",
        col: mouseCol,
        cols,
      },
    };
  }

  async onDrop(source: IDragSource, clientX: number, _clientY: number): Promise<DragResult> {
    if (!isOpenp41geGrid(this.element)) return { success: false, reason: "not a grid element" };
    const gridEl = this.element as Openp41geGridElement;
    const pageData = gridEl.pageData;
    if (!pageData) return { success: false, reason: "no page data" };

    const rect = this.element.getBoundingClientRect();
    const relX = clientX - rect.left;
    const cols = pageData.grid.cols;

    const data = source.getDragData();

    // Use shared boundary detection
    const pos = computeDropTarget(this.element, relX, rect.width, cols);

    if (pos.isBoundary) {
      return this._handleBoundaryDrop(data, pos.boundaryIndex, pos.col, cols);
    }

    // Cell-center drop
    return this._handleCellDrop(data, pos.col);
  }

  onLeave(): void {
    // Visual cleanup is done by the drag handler (hides ghost)
  }

  // ── Private helpers ──────────────────────────────────────────────────

  private async _handleBoundaryDrop(
    data: DragSourceData,
    boundaryIndex: number,
    mouseCol: number,
    cols: number,
  ): Promise<DragResult> {
    // Determine split direction
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

    switch (data.type) {
      case "tab":
      case "openp41ge-tab": {
        // Get the target openp41ge ID from the grid itself.
        // After a center-zone auto-switch, data.worksetId may point to a
        // different openp41ge than the grid we're dropping on.
        const gridWorksetId = isOpenp41geGrid(this.element)
          ? (this.element as Openp41geGridElement).pageData?.id
          : undefined;

        // If the drop is on a different openp41ge than the tab's origin,
        // first insert a new column in the target grid at the boundary
        // position, then move the tab into the new cell.
        if (gridWorksetId && gridWorksetId !== data.worksetId) {
          const insertCol = splitLeft ? splitCol : splitCol + 1;
          this._commandBus.dispatch("insertGridColumn", data.winId, gridWorksetId, insertCol);
          this._commandBus.dispatch(
            "moveTabBetweenCells",
            data.winId,
            data.tabId,
            data.winId,
            0,
            insertCol,
            -1,
          );
          return { success: true };
        }

        // Prevent splitting if source cell would become empty
        if (isOpenp41geGrid(this.element)) {
          const grid = this.element as Openp41geGridElement;
          const pageData = grid.pageData;
          if (pageData) {
            const sourcePlacement = pageData.grid.placements.find((p) =>
              (p.tabIds as string[]).includes(data.tabId),
            );
            if (sourcePlacement && (sourcePlacement.tabIds as string[]).length <= 1) {
              // Last tab in source cell — tab bar handles reorder/move; grid split would
              // leave an empty cell. Instead, move the tab via moveTabBetweenCells.
              return { success: false, reason: "cannot split last tab from cell" };
            }
          }
        }

        // Compute focus tab for the source cell
        let focusTabId: string | undefined;
        if (isOpenp41geGrid(this.element) && this.element._getNextTabForCell) {
          const sourceCol = this.element._lastActiveCellCol ?? 0;
          const next = this.element._getNextTabForCell(sourceCol, data.tabId);
          if (next) focusTabId = next;
        }

        this._commandBus.dispatch(
          "splitTabFromCell",
          data.winId,
          data.tabId,
          splitCol,
          splitLeft,
          focusTabId,
        );

        if (isOpenp41geGrid(this.element)) {
          const grid = this.element as Openp41geGridElement;
          grid._lastActiveCellCol = splitLeft ? splitCol : splitCol + 1;
          grid._focusedCol = grid._lastActiveCellCol;
        }
        return { success: true };
      }
      case "file":
        return { success: false, reason: "boundary drop not yet supported for files" };
      case "repo":
        return { success: false, reason: "boundary drop not yet supported for repos" };
    }
  }

  private async _handleCellDrop(data: DragSourceData, targetCol: number): Promise<DragResult> {
    switch (data.type) {
      case "tab":
      case "openp41ge-tab": {
        // Check if tab already exists in target cell
        if (isOpenp41geGrid(this.element) && (this.element as Openp41geGridElement).pageData) {
          const grid = this.element as Openp41geGridElement;
          const pageData = grid.pageData!;
          const targetPlacement = pageData.grid.placements.find(
            (p) => p.position.row === 0 && p.position.col === targetCol,
          );

          if (targetPlacement && (targetPlacement.tabIds as string[]).includes(data.tabId)) {
            // Already in the target cell — just activate it.
            // Using moveTabBetweenCells for same-cell would remove and
            // re-add the tab, which for a single-tab cell triggers
            // compactGrid on the intermediate empty cell — causing
            // the column to vanish and the tab to disappear.
            this._commandBus.dispatch("activateTabInCell", data.winId, data.tabId);
            grid._lastActiveCellCol = targetCol;
            grid._focusedCol = targetCol;
            return { success: true };
          }

          // Check for same-file duplicate
          const ws = getWorkspace();
          if (
            ws &&
            targetPlacement &&
            isSameFilePathInCell(ws, data.tabId, targetPlacement.tabIds as string[])
          ) {
            let focusTabId: string | undefined;
            if (grid._getNextTabForCell) {
              const sourceCol = grid._lastActiveCellCol ?? 0;
              const next = grid._getNextTabForCell(sourceCol, data.tabId);
              if (next) focusTabId = next;
            }
            this._commandBus.dispatch("removeTabFromCell", data.winId, data.tabId, focusTabId);
            grid._lastActiveCellCol = targetCol;
            grid._focusedCol = targetCol;
            return { success: true };
          }
        }

        // Normal move — use the grid's own openp41ge ID as target.
        // After a center-zone auto-switch, data.worksetId points to the
        // original openp41ge, not the grid's openp41ge.
        let focusTabId: string | undefined;
        if (isOpenp41geGrid(this.element) && this.element._getNextTabForCell) {
          const sourceCol = this.element._lastActiveCellCol ?? 0;
          const next = this.element._getNextTabForCell(sourceCol, data.tabId);
          if (next) focusTabId = next;
        }

        this._commandBus.dispatch(
          "moveTabBetweenCells",
          data.winId,
          data.tabId,
          data.winId,
          0,
          targetCol,
          -1,
          focusTabId,
        );

        if (isOpenp41geGrid(this.element)) {
          const grid = this.element as Openp41geGridElement;
          grid._lastActiveCellCol = targetCol;
          grid._focusedCol = targetCol;
        }
        return { success: true };
      }

      case "file": {
        this._commandBus.dispatch(
          "openFileInCell",
          "", // FIXME: need winId/worksetId for file drops
          "0",
          data.filePath,
          targetCol,
        );
        return { success: true };
      }

      case "repo": {
        this._commandBus.dispatch(
          "addRepoToOpenp41ge",
          "", // FIXME: need winId/worksetId for repo drops
          "0",
          data.repoName,
          targetCol,
        );
        return { success: true };
      }
    }
  }
}
