/**
 * Cell target renderer — renders overlay indicators for tab drop targets.
 *
 * Shows visual feedback for:
 *   - Tab insertion point within a tab bar (vertical indicator)
 *   - Cross-cell move target (cell highlight)
 *   - Grid boundary split (column divider preview)
 */

export interface ICellTargetRenderer {
  /** Show a tab insertion indicator at a specific index in a tab bar. */
  showTabInsertIndicator(bar: HTMLElement, index: number): HTMLElement;

  /** Remove all tab insertion indicators from a tab bar. */
  removeTabIndicators(): void;

  /** Show a highlight on a specific cell column. */
  showCellHighlight(gridEl: HTMLElement, col: number): void;

  /** Remove all cell highlights. */
  removeCellHighlights(): void;

  /** Show a split overlay at a grid boundary. */
  showSplitOverlay(
    gridEl: HTMLElement,
    boundaryIndex: number,
    cols: number,
    highlightCol?: number,
    splitCol?: number,
    splitLeft?: boolean,
  ): void;

  /** Hide the split overlay. */
  hideSplitOverlay(): void;
}
