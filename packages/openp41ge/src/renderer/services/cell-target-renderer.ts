import type { ICellTargetRenderer } from "../interfaces/cell-target-renderer";

import { isHTMLElement } from "../interfaces/element-guards";

/**
 * Renders visual indicators for tab drop targets.
 *
 * Manages tab insertion indicators (vertical bars in tab bars),
 * cell highlights, and split overlays.
 */
export class CellTargetRenderer implements ICellTargetRenderer {
  private _tabIndicators: HTMLElement[] = [];
  private _cellHighlightEl: HTMLElement | null = null;
  private _splitOverlayEl: HTMLElement | null = null;

  showTabInsertIndicator(bar: HTMLElement, index: number): HTMLElement {
    const ind = document.createElement("span");
    ind.className = "tab-drop-indicator";
    ind.style.cssText = [
      "width:2px",
      "height:60%",
      "background:var(--accent-hover)",
      "border-radius:1px",
      "flex-shrink:0",
      "pointer-events:none",
      "margin:0 -1px",
    ].join(";");

    const children = Array.from(bar.children).filter(isHTMLElement);
    if (index < children.length) {
      bar.insertBefore(ind, children[index]);
    } else {
      bar.appendChild(ind);
    }
    this._tabIndicators.push(ind);
    return ind;
  }

  removeTabIndicators(): void {
    for (const ind of this._tabIndicators) {
      if (ind.parentElement) {
        ind.parentElement.removeChild(ind);
      }
    }
    this._tabIndicators = [];
  }

  showCellHighlight(gridEl: HTMLElement, col: number): void {
    this.removeCellHighlights();

    // Find the cell element for this column
    const cells = Array.from(gridEl.children).filter(
      (c) => c instanceof HTMLElement && c.classList.contains("openp41ge-grid-cell"),
    );
    const cell = cells[col];
    if (!(cell instanceof HTMLElement)) return;

    const highlight = document.createElement("div");
    highlight.className = "openp41ge-cell-target-highlight";
    highlight.style.cssText = [
      "position:absolute",
      "inset:2px",
      "background:rgba(74,158,255,0.08)",
      "border:2px solid rgba(74,158,255,0.50)",
      "border-radius:4px",
      "pointer-events:none",
      "z-index:15",
    ].join(";");
    cell.appendChild(highlight);
    this._cellHighlightEl = highlight;
  }

  removeCellHighlights(): void {
    if (this._cellHighlightEl && this._cellHighlightEl.parentElement) {
      this._cellHighlightEl.parentElement.removeChild(this._cellHighlightEl);
    }
    this._cellHighlightEl = null;
  }

  showSplitOverlay(
    gridEl: HTMLElement,
    boundaryIndex: number,
    cols: number,
    highlightCol?: number,
    splitColArg?: number,
    splitLeft?: boolean,
  ): HTMLElement {
    this.hideSplitOverlay();
    this.removeCellHighlights();

    const overlay = document.createElement("div");
    overlay.className = "openp41ge-split-overlay";
    overlay.style.cssText = [
      "position:absolute",
      "inset:0",
      "z-index:30",
      "pointer-events:none",
      "display:flex",
      "flex-direction:row",
    ].join(";");

    // Read actual column flex values from DOM cells
    const cells = Array.from(gridEl.querySelectorAll(".openp41ge-grid-cell"));
    const flexValues: number[] = [];
    for (const cell of cells) {
      const flex = (cell as HTMLElement).style.flex;
      const ratio = flex ? parseFloat(flex) : 1;
      flexValues.push(isNaN(ratio) ? 1 : ratio);
    }
    const totalFlex = flexValues.reduce((a, b) => a + b, 0);
    const normalizedFlex =
      totalFlex > 0
        ? flexValues.map((f) => f / totalFlex)
        : Array.from({ length: cols }, () => 1 / cols);

    // Determine which column to split
    const splitCol = splitColArg ?? (boundaryIndex >= cols ? cols - 1 : boundaryIndex);

    // Determine split direction: splitLeft=true → new column on LEFT of splitCol
    // splitLeft=false → new column on RIGHT of splitCol (default)
    // Default to match _handleBoundaryDrop logic
    const useSplitLeft =
      splitLeft ??
      (boundaryIndex === 0
        ? true
        : boundaryIndex >= cols
          ? false
          : (splitColArg ?? 0) >= boundaryIndex);

    // Highlighted column: the new column
    const hCol = useSplitLeft ? splitCol : splitCol + 1;
    const previewCols = cols + 1;

    for (let c = 0; c < previewCols; c++) {
      const colDiv = document.createElement("div");
      let flexVal: number;

      if (useSplitLeft) {
        // New column on LEFT of splitCol
        // Original col at splitCol keeps half width; new col gets other half
        if (c < splitCol) {
          // Columns before splitCol are unchanged (shifted right by 1? No, they stay)
          // Actually for splitLeft=true, new column is at index splitCol, original col shifts right
          flexVal = normalizedFlex[c];
        } else if (c === splitCol) {
          // New column — gets half of original splitCol's width
          flexVal = (normalizedFlex[splitCol] ?? 1 / cols) / 2;
        } else if (c === splitCol + 1) {
          // Original splitCol column — keeps half its width
          flexVal = (normalizedFlex[splitCol] ?? 1 / cols) / 2;
        } else {
          // Columns after splitCol+1 shift right by 1
          flexVal = normalizedFlex[c - 1] ?? 1 / cols;
        }
      } else {
        // New column on RIGHT of splitCol (classic behavior)
        if (c < splitCol) {
          flexVal = normalizedFlex[c];
        } else if (c === splitCol) {
          flexVal = (normalizedFlex[splitCol] ?? 1 / cols) / 2;
        } else if (c === splitCol + 1) {
          flexVal = (normalizedFlex[splitCol] ?? 1 / cols) / 2;
        } else {
          flexVal = normalizedFlex[c - 1] ?? 1 / cols;
        }
      }

      colDiv.style.cssText = [
        `flex:${flexVal}`,
        "min-width:0",
        "height:100%",
        "position:relative",
        c < previewCols - 1 ? "border-right:1px solid rgba(74,158,255,0.15)" : "",
      ]
        .filter(Boolean)
        .join(";");
      if (c === hCol) {
        // Strong highlight on the tab target column (new column)
        colDiv.style.background = "rgba(74,158,255,0.12)";
        colDiv.style.boxShadow = "inset 0 0 0 2px rgba(74,158,255,0.50)";
      } else if (c === splitCol || c === splitCol + 1) {
        colDiv.style.background = "rgba(74,158,255,0.06)";
      } else {
        colDiv.style.background = "rgba(74,158,255,0.04)";
      }
      overlay.appendChild(colDiv);
    }

    gridEl.appendChild(overlay);
    this._splitOverlayEl = overlay;
    return overlay;
  }

  hideSplitOverlay(): void {
    if (this._splitOverlayEl && this._splitOverlayEl.parentElement) {
      this._splitOverlayEl.parentElement.removeChild(this._splitOverlayEl);
    }
    this._splitOverlayEl = null;
  }
}
