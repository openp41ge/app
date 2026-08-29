/**
 * LineWidthTracker — incremental maximum-line-width tracking for the file editor.
 *
 * Phase 1A of the large-file-performance plan. Replaces the O(n) full-file scan
 * in `_updateContentWidth()` (which ran on every load AND every keystroke) with:
 *
 *   - a synchronous scan of only the first batch on load,
 *   - a batched background scan that yields via an injectable idle scheduler,
 *   - O(1)-ish re-measurement of just the edited line(s) on change.
 *
 * The reported `maxColumns` is intentionally *approximate* while a background
 * scan is pending — exactly like Monaco, the horizontal scrollbar is allowed to
 * refine over time rather than block the first paint (see the plan's
 * "Incremental max line width tracking" notes).
 */

export type IdleScheduler = (cb: () => void) => void;

export interface ILineWidthTrackerOptions {
  /** Number of lines measured per synchronous/background batch (default 1000). */
  batchSize?: number;
  /** Idle scheduler used for background batches (default: requestIdleCallback). */
  scheduleIdle?: IdleScheduler;
}

export interface ILineWidthTracker {
  /** Best-known maximum visible columns across the file (approximate while scanning). */
  readonly maxColumns: number;
  /** Cached columns for one line, or `undefined` if not measured yet. */
  get(lineNumber: number): number | undefined;
  /** Measures one line, caches it, and raises the running max if needed. */
  measure(lineNumber: number): number;
  /** Drops one line from the cache and recomputes the max if the max may have dropped. */
  invalidateLine(lineNumber: number): void;
  /** Drops every cached line >= lineNumber (line insert/delete shifts). */
  invalidateFrom(lineNumber: number): void;
  /** Re-scans the cache to recompute the running max (after the max line shrank). */
  recomputeMax(): void;
  /** Sets the file's total line count (scan horizon). */
  setLineCount(lineCount: number): void;
  /** Clears cache + max and cancels any pending background scan. */
  reset(): void;
  /** Synchronously measures the first batch; callers then run a background scan. */
  init(lineCount: number): void;
  /**
   * Schedule a batched background scan of not-yet-measured lines. `onProgress`
   * fires after every completed batch so the viewport can refresh live.
   * Pass `fromLine` to rescan from a specific line (after a structural edit).
   */
  scheduleBackgroundScan(onProgress?: () => void, fromLine?: number): void;
  /** Cancel pending background work. Safe to call multiple times. */
  dispose(): void;
}

function defaultIdleScheduler(): IdleScheduler {
  const g = globalThis as unknown as {
    requestIdleCallback?: (cb: () => void, opts?: { timeout?: number }) => number;
  };
  if (typeof g.requestIdleCallback === "function") {
    const ric = g.requestIdleCallback.bind(g);
    return (cb) => ric(cb, { timeout: 200 });
  }
  return (cb) => setTimeout(cb, 16);
}

export class LazyLineWidthTracker implements ILineWidthTracker {
  private readonly _measure: (lineNumber: number) => number;
  private readonly _batchSize: number;
  private readonly _scheduleIdle: IdleScheduler;

  private readonly _cache = new Map<number, number>();
  private _max = 0;
  /** Highest line number measured so far — the background scan resumes after it. */
  private _scannedUpTo = 0;
  private _lineCount = 0;

  /** Pending background scan (null = nothing scheduled). */
  private _pending: { nextStart: number; onProgress?: () => void } | null = null;
  private _idleScheduled = false;
  private _disposed = false;

  constructor(measure: (lineNumber: number) => number, options?: ILineWidthTrackerOptions) {
    this._measure = measure;
    this._batchSize = options?.batchSize ?? 1000;
    this._scheduleIdle = options?.scheduleIdle ?? defaultIdleScheduler();
  }

  get maxColumns(): number {
    return this._max;
  }

  get(lineNumber: number): number | undefined {
    return this._cache.get(lineNumber);
  }

  measure(lineNumber: number): number {
    const width = this._measure(lineNumber);
    this._cache.set(lineNumber, width);
    if (width > this._max) this._max = width;
    if (lineNumber > this._scannedUpTo) this._scannedUpTo = lineNumber;
    return width;
  }

  invalidateLine(lineNumber: number): void {
    const removed = this._cache.get(lineNumber);
    this._cache.delete(lineNumber);
    if (removed !== undefined && removed >= this._max) {
      this._recomputeMax();
    }
  }

  invalidateFrom(lineNumber: number): void {
    let mayHaveRemovedMax = false;
    for (const key of this._cache.keys()) {
      if (key >= lineNumber) {
        if ((this._cache.get(key) as number) >= this._max) mayHaveRemovedMax = true;
        this._cache.delete(key);
      }
    }
    if (mayHaveRemovedMax) this._recomputeMax();
    if (lineNumber - 1 < this._scannedUpTo) this._scannedUpTo = lineNumber - 1;
  }

  recomputeMax(): void {
    this._recomputeMax();
  }

  setLineCount(lineCount: number): void {
    this._lineCount = lineCount;
  }

  reset(): void {
    this._cache.clear();
    this._max = 0;
    this._scannedUpTo = 0;
    this._lineCount = 0;
    this._pending = null;
    this._idleScheduled = false;
  }

  init(lineCount: number): void {
    this._lineCount = lineCount;
    const end = Math.min(lineCount, this._batchSize);
    for (let i = 1; i <= end; i++) this.measure(i);
  }

  scheduleBackgroundScan(onProgress?: () => void, fromLine?: number): void {
    if (this._disposed) return;
    let nextStart: number;
    if (fromLine !== undefined) {
      this._scannedUpTo = Math.min(this._scannedUpTo, fromLine - 1);
      nextStart = fromLine;
    } else {
      nextStart = this._scannedUpTo + 1;
    }
    this._pending = { nextStart, onProgress };
    this._requestIdle();
  }

  dispose(): void {
    this._disposed = true;
    this._pending = null;
    this._idleScheduled = false;
  }

  private _requestIdle(): void {
    if (this._disposed || this._idleScheduled || !this._pending) return;
    this._idleScheduled = true;
    this._scheduleIdle(() => {
      this._idleScheduled = false;
      if (this._disposed) return;
      this._runBatch();
    });
  }

  private _runBatch(): void {
    const pending = this._pending;
    if (!pending) return;
    if (pending.nextStart > this._lineCount) {
      this._pending = null;
      return;
    }
    const end = Math.min(this._lineCount, pending.nextStart + this._batchSize - 1);
    for (let i = pending.nextStart; i <= end; i++) this.measure(i);

    if (end < this._lineCount) {
      this._pending = { nextStart: end + 1, onProgress: pending.onProgress };
      this._requestIdle();
    } else {
      this._pending = null;
    }
    pending.onProgress?.();
  }

  private _recomputeMax(): void {
    let max = 0;
    for (const width of this._cache.values()) {
      if (width > max) max = width;
    }
    this._max = max;
  }
}
