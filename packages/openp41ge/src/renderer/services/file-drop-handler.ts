/**
 * Handles file-tree drag-and-drop onto the grid.
 *
 * Determines whether to add the file to an existing cell or
 * split the grid to create a new cell.
 */
import type { IFileDropHandler } from "../interfaces/file-drop-handler";
import type { ICommandBus } from "../interfaces/command-bus";
import type { IGhostRenderer } from "../interfaces/ghost-renderer";
import { readColumnFlex } from "./ghost-renderer";
import { computeDropTarget } from "./boundary/detection";
import { isOpenp41geGrid, type Openp41geGridElement } from "../interfaces/element-guards";

export class FileDropHandler implements IFileDropHandler {
  private _commandBus: ICommandBus | null = null;
  private _ghostRenderer: IGhostRenderer | null = null;
  private _fileDropOverlay: HTMLElement | null = null;

  init(commandBus: ICommandBus, ghostRenderer: IGhostRenderer): void {
    this._commandBus = commandBus;
    this._ghostRenderer = ghostRenderer;
  }

  handleDragOver(e: DragEvent, gridEl: HTMLElement): void {
    if (this._isRepoDragEvent(e)) {
      e.preventDefault();
      e.dataTransfer!.dropEffect = "copy";
      this._showFileDropOverlay(e.clientX, gridEl);
      return;
    }
    if (!this._isFileDragEvent(e)) return;
    e.preventDefault();
    e.dataTransfer!.dropEffect = "copy";
    this._showFileDropOverlay(e.clientX, gridEl);
  }

  handleDragLeave(e: DragEvent, gridEl: HTMLElement): void {
    if (this._isRepoDragEvent(e)) {
      this._hideFileDropOverlay(gridEl);
      return;
    }
    if (gridEl.contains(e.relatedTarget as Node)) return;
    this._hideFileDropOverlay(gridEl);
  }

  handleDrop(e: DragEvent, gridEl: HTMLElement): void {
    if (this._isRepoDragEvent(e)) {
      this._handleRepoDrop(e, gridEl);
      return;
    }
    if (!this._isFileDragEvent(e)) return;
    e.preventDefault();
    this._hideFileDropOverlay(gridEl);

    const filePath = e.dataTransfer?.getData("text/plain");
    if (!filePath) return;

    if (!isOpenp41geGrid(gridEl)) return;
    const pageData = gridEl.pageData;
    if (!pageData) return;

    const fileName = filePath.split("/").pop() || filePath;
    const winId = gridEl.winId;

    // Set pending path so the FileEditorController picks it up on mount
    window.__pendingFilePath = filePath;
    window.__pendingFileName = fileName;

    // Empty grid: resize to 1 column, drop at col 0
    if (pageData.grid.cols === 0 || pageData.grid.placements.length === 0) {
      if (pageData.grid.cols === 0) {
        this._commandBus!.dispatch("resizeGrid", winId, pageData.id, 1, 1);
      }
      this._setFocusedCol(gridEl, 0);
      this._commandBus!.dispatch(
        "actionOpenFile",
        winId,
        pageData.id,
        "file-viewer",
        fileName,
        filePath,
        0,
        true,
      );
      return;
    }

    const target = this._resolveDropTarget(e.clientX, gridEl);

    if (target.isBoundary) {
      const insertCol = Math.min(target.boundaryIndex, pageData.grid.cols);
      this._commandBus!.dispatch("insertGridColumn", winId, pageData.id, insertCol);
      this._setFocusedCol(gridEl, insertCol);
      this._commandBus!.dispatch(
        "actionOpenFile",
        winId,
        pageData.id,
        "file-viewer",
        fileName,
        filePath,
        insertCol,
        true,
      );
    } else {
      const dropCol = target.cursorCol ?? target.col;
      if (dropCol >= pageData.grid.cols) {
        this._commandBus!.dispatch("resizeGrid", winId, pageData.id, 1, dropCol + 1);
      }
      this._setFocusedCol(gridEl, dropCol);
      this._commandBus!.dispatch(
        "actionOpenFile",
        winId,
        pageData.id,
        "file-viewer",
        fileName,
        filePath,
        dropCol,
        true,
      );
    }
  }

  private _setFocusedCol(gridEl: HTMLElement, col: number): void {
    if (typeof (gridEl as Openp41geGridElement)._setFocusedCol === "function") {
      (gridEl as Openp41geGridElement)._setFocusedCol!(col);
    } else {
      (gridEl as Openp41geGridElement)._lastActiveCellCol = col;
      (gridEl as Openp41geGridElement)._focusedCol = col;
    }
  }

  private _isFileDragEvent(e: DragEvent): boolean {
    try {
      const types = e.dataTransfer?.types;
      if (!types) return false;
      for (let i = 0; i < types.length; i++) {
        if (String(types[i]) === "text/plain") return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  private _isRepoDragEvent(e: DragEvent): boolean {
    try {
      const types = e.dataTransfer?.types;
      if (!types) return false;
      for (let i = 0; i < types.length; i++) {
        if (String(types[i]) === "application/x-openp41ge-repo") return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  private _resolveDropTarget(
    clientX: number,
    gridEl: HTMLElement,
  ): { col: number; isBoundary: boolean; boundaryIndex: number; cursorCol?: number } {
    const rect = gridEl.getBoundingClientRect();
    const page = isOpenp41geGrid(gridEl) ? gridEl.pageData : null;
    if (!page || rect.width === 0 || page.grid.cols === 0) {
      return { col: 0, isBoundary: false, boundaryIndex: 0, cursorCol: 0 };
    }

    const cols = page.grid.cols;
    const relX = clientX - rect.left;
    const position = relX / rect.width;

    // Extreme edges (left/right 12%) — always create a boundary split.
    const EDGE_ZONE = 0.12;
    if (position < EDGE_ZONE) {
      return { col: 0, isBoundary: true, boundaryIndex: 0, cursorCol: 0 };
    }
    if (1 - position < EDGE_ZONE) {
      const lastCol = Math.max(0, cols - 1);
      return { col: lastCol, isBoundary: true, boundaryIndex: cols, cursorCol: lastCol };
    }

    // For multi-column grids, use computeDropTarget for between-column boundaries.
    if (cols > 1) {
      const target = computeDropTarget(gridEl, relX, rect.width, cols);
      if (!target.isBoundary) {
        return { ...target, cursorCol: target.col };
      }
      // Map divider index to boundary position (N+1 for divider N)
      const bi = target.boundaryIndex < cols ? target.boundaryIndex + 1 : cols;
      return { col: bi, isBoundary: true, boundaryIndex: bi, cursorCol: target.col };
    }

    // Single column, not at an edge → cell-center drop
    return { col: 0, isBoundary: false, boundaryIndex: -1, cursorCol: 0 };
  }

  private _showFileDropOverlay(clientX: number, gridEl: HTMLElement): void {
    this._hideFileDropOverlay(gridEl);

    if (!isOpenp41geGrid(gridEl)) return;
    const page = gridEl.pageData;
    if (!page) return;

    // Empty grid (0 cols or no placements): show single full-width column overlay
    if (page.grid.cols === 0 || page.grid.placements.length === 0) {
      this._ghostRenderer!.showCellOverlay(gridEl, 1, 0, true, [1]);
      return;
    }

    const target = this._resolveDropTarget(clientX, gridEl);
    const { cols } = page.grid;

    // Read current cell flex values so the overlay respects resized widths
    const columnFlex = readColumnFlex(gridEl, cols);

    if (target.isBoundary) {
      // Show a boundary-split preview — insertGridColumn will create a new cell.
      // The new column is at boundaryIndex. splitCol is the column under the cursor
      // (the one that visually appears to "split" to make room).
      const bi = target.boundaryIndex;
      const splitCol = Math.min(target.cursorCol ?? target.col, cols - 1);
      // Highlight the new column (at boundaryIndex), not the column being split
      const splitHighlightCol = bi;
      this._ghostRenderer!.showGhost(gridEl, {
        cols,
        boundaryIndex: bi,
        splitCol,
        splitHighlightCol,
        isFileDrop: true,
        columnFlex,
      });
    } else {
      this._ghostRenderer!.showCellOverlay(gridEl, cols, target.col, true, columnFlex);
    }
  }

  private _handleRepoDrop(e: DragEvent, gridEl: HTMLElement): void {
    e.preventDefault();
    this._hideFileDropOverlay(gridEl);

    const repoName = e.dataTransfer?.getData("application/x-openp41ge-repo");
    if (!repoName) return;

    if (!isOpenp41geGrid(gridEl)) return;
    const pageData = gridEl.pageData;
    if (!pageData) return;

    const winId = gridEl.winId;

    // Resolve the drop target to determine if we should split the grid.
    const target = this._resolveDropTarget(e.clientX, gridEl);

    if (target.isBoundary) {
      // Boundary drop: split the grid first, then open the git browser
      // in the new column.
      const insertCol = Math.min(target.boundaryIndex, pageData.grid.cols);
      this._commandBus!.dispatch("insertGridColumn", winId, pageData.id, insertCol);
      this._setFocusedCol(gridEl, insertCol);
    } else {
      // Cell-center drop: just set the focused column
      this._setFocusedCol(gridEl, target.cursorCol ?? target.col);
    }

    // Dispatch repo-open-git — openp41ge-worktree-tree._openGitTab will use
    // _getLastActiveCellCol() to find the target column (which we just set).
    document.dispatchEvent(
      new CustomEvent("repo-open-git", {
        detail: { repoName },
      }),
    );
  }

  private _hideFileDropOverlay(gridEl?: HTMLElement): void {
    if (this._fileDropOverlay) {
      this._fileDropOverlay.remove();
      this._fileDropOverlay = null;
    }
    // Also clean up overlays created via GhostRenderer
    if (gridEl && this._ghostRenderer) {
      this._ghostRenderer.hideGhost(gridEl);
      this._ghostRenderer.hideCellOverlay(gridEl);
    }
  }
}
