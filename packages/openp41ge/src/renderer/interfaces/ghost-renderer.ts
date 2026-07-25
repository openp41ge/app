/**
 * Ghost renderer — renders translucent drop preview during drag.
 *
 * Pure DOM creation — no state machine. Takes a preview description
 * and produces the corresponding DOM overlay.
 */

export interface GhostPreview {
  /** Number of columns to preview. */
  cols: number;
  /** Whether one of the columns is highlighted as the active drop target. */
  activeCol?: number;
  /** Whether to show a split boundary. */
  boundaryIndex?: number;
  /**
   * Which column in the split preview to highlight as the tab target.
   * Defaults to the column to the right of the split (splitCol+1).
   * Set to splitCol when the tab goes to the left side.
   */
  splitHighlightCol?: number;
  /**
   * Which column is being split (0-indexed). When provided, the ghost
   * uses this instead of re-deriving from boundaryIndex, which fixes
   * interior-boundary splits where the mouse is in the LEFT cell.
   */
  splitCol?: number;
  /**
   * Whether the tab goes to the left half (true) or right half (false)
   * of the split column. When set, this takes priority over
   * splitHighlightCol for determining the drop direction.
   */
  splitLeft?: boolean;
  /** Whether this is a file-tree drop (different visual treatment). */
  isFileDrop?: boolean;
  /**
   * Flex values to use for each column, matching the grid's current
   * column widths. When provided, each column div gets flex: <value>
   * instead of flex:1, so the ghost respects resized column widths.
   * When absent, columns are evenly distributed (flex:1).
   */
  columnFlex?: number[];
}

export interface IGhostRenderer {
  /** Show a ghost overlay in the parent element. */
  showGhost(parent: HTMLElement, preview: GhostPreview): HTMLElement;

  /** Hide and remove the ghost overlay. */
  hideGhost(parent: HTMLElement): void;

  /** Show a cell-highlight overlay for file drops or tab moves. */
  showCellOverlay(
    parent: HTMLElement,
    cols: number,
    activeCol: number,
    isFileDrop?: boolean,
    columnFlex?: number[],
  ): HTMLElement;

  /** Hide the cell overlay. */
  hideCellOverlay(parent: HTMLElement): void;
}
