/**
 * FlexCache — caches column flex values for grid elements, using MutationObserver
 * to invalidate the cache when flex attributes change.
 *
 * Avoids redundant DOM reads on every drag tick.
 *
 * Used by GhostManager during ghost overlay computation.
 */
export class FlexCache {
  private _cache = new WeakMap<HTMLElement, { values: number[]; version: number }>();
  private _observerMap = new WeakMap<HTMLElement, MutationObserver>();
  private _versionCounter = 0;

  /**
   * Get cached flex values for a grid element, reading from DOM if stale.
   */
  get(gridEl: HTMLElement, cols: number): number[] {
    const cached = this._cache.get(gridEl);
    if (cached && cached.values.length === cols) {
      return cached.values;
    }
    return this._readAndCache(gridEl, cols);
  }

  /**
   * Invalidate cache for a grid element, forcing next read from DOM.
   */
  invalidate(gridEl: HTMLElement): void {
    this._cache.delete(gridEl);
  }

  /**
   * Start observing a grid element's cells for flex changes.
   */
  observe(gridEl: HTMLElement): void {
    if (this._observerMap.has(gridEl)) return;

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (
          mutation.type === "attributes" &&
          (mutation.attributeName === "style" || mutation.attributeName === "class")
        ) {
          this.invalidate(gridEl);
          return;
        }
      }
    });

    // Observe existing and future cells
    const cells = gridEl.querySelectorAll(".openp41ge-grid-cell");
    cells.forEach((cell) => {
      if (cell instanceof HTMLElement) {
        observer.observe(cell, { attributes: true, attributeFilter: ["style"] });
      }
    });

    // Also watch for new cells being added
    observer.observe(gridEl, { childList: true, subtree: true });

    this._observerMap.set(gridEl, observer);
  }

  /**
   * Stop observing and clean up.
   */
  disconnect(gridEl: HTMLElement): void {
    const observer = this._observerMap.get(gridEl);
    if (observer) {
      observer.disconnect();
      this._observerMap.delete(gridEl);
    }
    this._cache.delete(gridEl);
  }

  private _readAndCache(gridEl: HTMLElement, cols: number): number[] {
    const values = this._readColumnFlex(gridEl, cols);
    this._cache.set(gridEl, { values, version: ++this._versionCounter });
    return values;
  }

  private _readColumnFlex(gridEl: HTMLElement, cols: number): number[] {
    if (cols <= 1) return [1];
    const cells = gridEl.querySelectorAll(".openp41ge-grid-cell");
    if (cells.length === 0) return Array.from({ length: cols }, () => 1 / cols);
    const flexValues: number[] = [];
    for (const cell of cells) {
      const flex = (cell as HTMLElement).style.flex;
      const ratio = flex ? parseFloat(flex) : 1 / cols;
      flexValues.push(isNaN(ratio) ? 1 / cols : ratio);
    }
    while (flexValues.length < cols) flexValues.push(1 / cols);
    return flexValues.slice(0, cols);
  }
}
