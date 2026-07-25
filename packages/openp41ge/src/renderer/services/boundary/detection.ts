/**
 * Shared boundary detection — single source of truth for column divider
 * computation and drop-target classification.
 *
 * Separates DOM reading (getDividerPositions) from pure computation
 * (classifyGridPosition) so the core logic is testable without a DOM.
 */

export const INSERT_BOUNDARY_THRESHOLD = 0.15;

/**
 * Read actual column divider positions from DOM cells' flex values.
 * Returns an array of normalized 0..1 divider positions, one fewer
 * than the number of columns (or empty for a single column).
 */
export function getDividerPositions(gridEl: HTMLElement, cols: number): number[] {
  if (cols <= 1) return [];
  const cells = gridEl.querySelectorAll(".openp41ge-grid-cell");
  if (cells.length === 0) return Array.from({ length: cols - 1 }, (_, i) => (i + 1) / cols);
  const flexValues: number[] = [];
  for (const cell of cells) {
    const flex = (cell as HTMLElement).style.flex;
    const ratio = flex ? parseFloat(flex) : 1;
    flexValues.push(isNaN(ratio) ? 1 : ratio);
  }
  const total = flexValues.reduce((a, b) => a + b, 0);
  if (total === 0) return Array.from({ length: cols - 1 }, (_, i) => (i + 1) / cols);
  const dividers: number[] = [];
  let cumulative = 0;
  for (let i = 0; i < cols - 1; i++) {
    cumulative += flexValues[i] / total;
    dividers.push(cumulative);
  }
  return dividers;
}

/**
 * Results from classifying a horizontal position within a grid.
 */
export interface GridPosition {
  col: number;
  isBoundary: boolean;
  boundaryIndex: number;
}

/**
 * Classify a horizontal position (0..gridWidth) within a grid with
 * the given divider positions.
 *
 * @param relX - Horizontal position relative to the grid's left edge
 * @param gridWidth - Total width of the grid in pixels
 * @param dividers - Divider positions in 0..1 from getDividerPositions()
 * @param cols - Number of columns
 * @returns GridPosition with column, whether near a boundary, and boundary index
 */
export function classifyGridPosition(
  relX: number,
  gridWidth: number,
  dividers: number[],
  cols: number,
): GridPosition {
  if (cols <= 0) return { col: 0, isBoundary: false, boundaryIndex: 0 };

  const position = relX / gridWidth; // 0..1

  // Find which column this position falls in.
  // Uses strict less-than (`<`) for the right edge so that a position
  // exactly at a divider is assigned to the RIGHT column (matching the
  // legacy inline boundary detection in tab-drag-handler.ts).
  let col = cols - 1;
  for (let i = 0; i < cols - 1; i++) {
    if (position < dividers[i]) {
      col = i;
      break;
    }
  }

  // Find the nearest boundary
  // Use -1 as sentinel for "not yet set" so we can distinguish
  // between "left edge" (index 0) and "first divider" (index 1).
  let nearestBoundary = -1;
  let minDist = Infinity;

  // Left edge
  const distToLeft = Math.abs(position);
  if (distToLeft < minDist) {
    minDist = distToLeft;
    nearestBoundary = 0;
  }

  // Interior dividers (indexed 1..cols-1 in boundary space)
  for (let i = 0; i < dividers.length; i++) {
    const dist = Math.abs(position - dividers[i]);
    if (dist < minDist) {
      minDist = dist;
      nearestBoundary = i + 1; // +1 because 0 is left edge
    }
  }

  // Far-right edge (index cols)
  const distToRight = Math.abs(position - 1);
  if (distToRight < minDist) {
    minDist = distToRight;
    nearestBoundary = cols;
  }

  const isBoundary = minDist < INSERT_BOUNDARY_THRESHOLD;
  return { col, isBoundary, boundaryIndex: nearestBoundary === -1 ? 0 : nearestBoundary };
}

/**
 * Convenience function that combines getDividerPositions + classifyGridPosition
 * for callers that have a grid element and an absolute clientX.
 *
 * Equivalent to the old computeDropTarget API.
 */
export function computeDropTarget(
  gridEl: HTMLElement,
  relX: number,
  gridWidth: number,
  cols: number,
): GridPosition {
  if (cols <= 1) return { col: 0, isBoundary: false, boundaryIndex: 0 };
  const dividers = getDividerPositions(gridEl, cols);
  return classifyGridPosition(relX, gridWidth, dividers, cols);
}
