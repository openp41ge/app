const MIN_COLUMN_WIDTH_PX = 80;

/**
 * ColumnResizeController — Lit reactive controller for column resize drag.
 *
 * Extracted from openp41ge-grid's inline resize state. During drag, it applies
 * flex ratios directly to the DOM cells (no Lit re-render, no IPC). On
 * mouseup, it dispatches a single resizeCell operation to the workspace.
 *
 * Enforces a minimum column width of MIN_COLUMN_WIDTH_PX pixels.
 */
import type { ReactiveController, ReactiveControllerHost } from "lit";

export interface ResizeHost extends ReactiveControllerHost {
  /** Grid container element for positioning. */
  readonly gridElement: HTMLElement;

  /** Dispatches a command (IPC wrapper). */
  dispatchCommand(fn: string, ...args: unknown[]): void;

  /** Array of cell elements currently in the grid. */
  getCells(): HTMLElement[];

  /** Number of columns currently rendered. */
  columns: number;

  /** Current window ID for IPC dispatch. */
  winId: string;
}

export class ColumnResizeController implements ReactiveController {
  private _host: ResizeHost;
  private _resizing: {
    dividerIndex: number;
    /** Last mouse clientX seen during drag (for incremental delta). */
    lastX: number;
    handle: HTMLElement;
  } | null = null;

  constructor(host: ResizeHost) {
    this._host = host;
    host.addController(this);
  }

  hostConnected(): void {
    // Nothing to initialize
  }

  hostDisconnected(): void {
    this._cleanupDrag();
  }

  /** Start a resize drag on the given divider handle. */
  startResize(e: MouseEvent, dividerIndex: number, _dividers: number[]): void {
    e.preventDefault();

    const handle = e.currentTarget as HTMLElement;
    handle.classList.add("active");

    this._resizing = {
      dividerIndex,
      lastX: e.clientX,
      handle,
    };

    document.addEventListener("mousemove", this._onMouseMove);
    document.addEventListener("mouseup", this._onMouseUp);
  }

  private _onMouseMove = (ev: MouseEvent): void => {
    if (!this._resizing) return;
    const rect = this._host.gridElement.getBoundingClientRect();
    const deltaX = ev.clientX - this._resizing.lastX;
    const fraction = deltaX / rect.width;
    if (fraction === 0) return;

    this._applyLocalIncremental(fraction);
    this._resizing.lastX = ev.clientX;
  };

  private _onMouseUp = (): void => {
    if (!this._resizing) return;

    const { dividerIndex, handle } = this._resizing;

    document.removeEventListener("mousemove", this._onMouseMove);
    document.removeEventListener("mouseup", this._onMouseUp);
    if (handle.isConnected) handle.classList.remove("active");

    const dividerPos = this._computeDividerPosition(dividerIndex);

    this._resizing = null;

    // Sync final divider to workspace (single IPC call)
    this._host.dispatchCommand("resizeCell", this._host.winId, dividerIndex, dividerPos, false);
  };

  /**
   * Returns the minimum flex ratio based on grid pixel width.
   */
  private _minFlex(): number {
    const rect = this._host.gridElement.getBoundingClientRect();
    return Math.min(MIN_COLUMN_WIDTH_PX / rect.width, 0.5);
  }

  /**
   * Compute the divider position (0..1 fraction) from the current
   * flex values set on the grid cells. The divider between columns
   * dividerIndex and dividerIndex+1 sits at the cumulative sum of
   * flex values up to dividerIndex, divided by the total flex sum.
   */
  private _computeDividerPosition(dividerIndex: number): number {
    const cells = this._host.getCells();
    const columns = this._host.columns;
    if (columns <= 1) return 0.5;

    const flexValues: number[] = [];
    let total = 0;
    for (let c = 0; c < columns; c++) {
      const el = cells[c];
      if (!el) {
        flexValues.push(1 / columns);
        total += 1 / columns;
        continue;
      }
      const flex = el.style.flex;
      const ratio = flex ? parseFloat(flex) : 1 / columns;
      const v = isNaN(ratio) ? 1 / columns : ratio;
      flexValues.push(v);
      total += v;
    }

    const cumulative = flexValues.slice(0, dividerIndex + 1).reduce((a, b) => a + b, 0);
    const minF = this._minFlex();
    return Math.max(minF, Math.min(1 - minF, cumulative / total));
  }

  /**
   * Apply an incremental flex change to the two cells adjacent to the divider.
   * Reads current flex values from DOM, adjusts by `fraction` of total width,
   * and writes them back. No Lit re-render, no IPC during drag.
   */
  private _applyLocalIncremental(fraction: number): void {
    const columns = this._host.columns;
    if (columns <= 1 || !this._resizing) return;

    const dividerIndex = this._resizing.dividerIndex;
    const cells = this._host.getCells();

    // Read current ratios from cell flex styles
    const currentRatios: number[] = [];
    for (let c = 0; c < columns; c++) {
      const el = cells[c];
      if (!el) {
        currentRatios.push(1 / columns);
        continue;
      }
      const flex = el.style.flex;
      const ratio = flex ? parseFloat(flex) : 1 / columns;
      currentRatios.push(isNaN(ratio) ? 1 / columns : ratio);
    }

    const leftCol = dividerIndex;
    const rightCol = dividerIndex + 1;
    const minF = this._minFlex();

    // Incremental: fraction is the mouse delta / grid width since the
    // last mousemove. Apply it directly to current flex values.
    if (leftCol >= 0 && leftCol < columns) {
      currentRatios[leftCol] = Math.max(minF, currentRatios[leftCol] + fraction);
    }
    if (rightCol >= 0 && rightCol < columns) {
      currentRatios[rightCol] = Math.max(minF, currentRatios[rightCol] - fraction);
    }

    // Ensure ratios still sum reasonably (re-normalize to avoid drift)
    const sum = currentRatios.reduce((a, b) => a + b, 0);
    if (sum > 0) {
      for (let c = 0; c < columns; c++) {
        currentRatios[c] /= sum;
      }
    }

    // Apply directly to DOM
    for (let c = 0; c < columns; c++) {
      const el = cells[c];
      if (el) {
        el.style.flex = String(currentRatios[c]);
      }
    }
  }

  private _cleanupDrag(): void {
    document.removeEventListener("mousemove", this._onMouseMove);
    document.removeEventListener("mouseup", this._onMouseUp);
    if (this._resizing?.handle.isConnected) {
      this._resizing.handle.classList.remove("active");
    }
    this._resizing = null;
  }
}
