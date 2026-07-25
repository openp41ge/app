/**
 * Ghost layout — pure functions for computing ghost overlay column layout.
 *
 * Separated from GhostManager so the layout logic can be tested exhaustively
 * without DOM rendering.
 *
 * A ghost overlay shows the grid's columns after a drop. For a split drop,
 * one column is halved to make room for a new column, increasing the total
 * column count by 1. For a cell-center drop, the column count stays the same
 * but one column is visually highlighted.
 */

// ─── Types ────────────────────────────────────────────────────────────────

export interface GhostColumn {
  /** Flex value (proportional width) for this column */
  flex: number;
  /** Primary drop target — bright blue highlight with thick border */
  highlighted: boolean;
  /** Part of a split pair — the other half of the split cell, subtle blue */
  splitPair: boolean;
  /** Cell-center drop target — subtle blue with thin border */
  active: boolean;
}

export interface SplitZone {
  type: "split";
  /** Which column in the original grid is being split */
  splitCol: number;
  /** Whether the tab goes to the left half (true) or right half (false) */
  splitLeft: boolean;
}

export interface CellCenterZone {
  type: "cell-center";
  /** Which column in the original grid the tab goes to */
  col: number;
}

export type DropZone = SplitZone | CellCenterZone;

// ─── Layout computation ──────────────────────────────────────────────────

/**
 * Compute the ghost overlay column layout for a given drop zone.
 *
 * @param cols - Number of columns in the original grid
 * @param columnFlex - Flex values for each column (length = cols)
 * @param dropZone - The drop zone (split or cell-center)
 * @returns Ordered list of columns describing the ghost overlay
 */
export function computeGhostLayout(
  cols: number,
  columnFlex: number[],
  dropZone: DropZone,
): GhostColumn[] {
  if (dropZone.type === "split") {
    return computeSplitLayout(cols, columnFlex, dropZone.splitCol, dropZone.splitLeft);
  }
  return computeCellCenterLayout(cols, columnFlex, dropZone.col);
}

/**
 * Compute the ghost overlay for a split drop.
 *
 * The grid gains one column: the split column is replaced by two half-width
 * columns. One of those two is the drop target.
 *
 * @param cols - Original column count
 * @param flex - Original flex values
 * @param splitCol - Which column to split
 * @param splitLeft - True: tab goes to the left half (highlight col = splitCol)
 *                     False: tab goes to the right half (highlight col = splitCol + 1)
 */
function computeSplitLayout(
  cols: number,
  flex: number[],
  splitCol: number,
  splitLeft: boolean,
): GhostColumn[] {
  const half = (flex[splitCol] ?? 1 / cols) / 2;
  const highlightCol = splitLeft ? splitCol : splitCol + 1;
  const result: GhostColumn[] = [];

  for (let c = 0; c < cols; c++) {
    if (c < splitCol) {
      // Column before the split — unchanged
      result.push({
        flex: flex[c] ?? 1 / cols,
        highlighted: false,
        splitPair: false,
        active: false,
      });
    } else if (c === splitCol) {
      // Split column → two halves
      const isLeftHalfHighlighted = highlightCol === result.length; // left half is at result.length
      const isRightHalfHighlighted = highlightCol === result.length + 1; // right half is at result.length + 1

      result.push({
        flex: half,
        highlighted: isLeftHalfHighlighted,
        splitPair: !isLeftHalfHighlighted,
        active: false,
      });
      result.push({
        flex: half,
        highlighted: isRightHalfHighlighted,
        splitPair: !isRightHalfHighlighted,
        active: false,
      });
    } else {
      // Column after the split — unchanged, but shifted by 1 due to the split
      result.push({
        flex: flex[c] ?? 1 / cols,
        highlighted: false,
        splitPair: false,
        active: false,
      });
    }
  }

  return result;
}

/**
 * Compute the ghost overlay for a cell-center drop.
 * Column count stays the same; the target column is marked as active.
 */
function computeCellCenterLayout(cols: number, flex: number[], activeCol: number): GhostColumn[] {
  const result: GhostColumn[] = [];
  for (let c = 0; c < cols; c++) {
    result.push({
      flex: flex[c] ?? 1 / cols,
      highlighted: false,
      splitPair: false,
      active: c === activeCol,
    });
  }
  return result;
}
