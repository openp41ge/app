/**
 * Unit tests for LazyLineWidthTracker (Phase 1A of the large-file-performance plan).
 *
 * The tracker replaces `_updateContentWidth()`'s per-file full scan with:
 *   - a synchronous scan of only the first batch on load,
 *   - a batched background scan (via an injectable idle scheduler),
 *   - single-line re-measurement on edits.
 *
 * All idle scheduling is injected so tests are deterministic.
 */
import { describe, test, expect, vi, type Mock } from "vitest";
import { LazyLineWidthTracker } from "../../../src/components/file-editor/line-width-tracker";

/** measure fn: width == lineNumber (so max == last measured line). */
const widthIsLineNumber = (line: number): number => line;

interface Fixture {
  tracker: LazyLineWidthTracker;
  measure: Mock<(line: number) => number>;
  schedule: Mock<(cb: () => void) => void>;
  /** Drain the injected scheduler's callback queue synchronously. */
  flush(): void;
}

function makeTracker(
  opts: {
    batchSize?: number;
    lineCount?: number;
    schedule?: (cb: () => void) => void;
  } = {},
): Fixture {
  const schedule = vi.fn(opts.schedule ?? ((cb: () => void) => queueMicrotask(cb)));
  const measure = vi.fn(widthIsLineNumber);
  const tracker = new LazyLineWidthTracker(measure, {
    batchSize: opts.batchSize ?? 1000,
    scheduleIdle: schedule,
  });
  const flush = (): void => {
    let guard = 0;
    while (schedule.mock.calls.length > 0 && guard++ < 10000) {
      const cb = schedule.mock.calls.shift()![0] as () => void;
      cb();
    }
  };
  return { tracker, measure, schedule, flush };
}

describe("LazyLineWidthTracker", () => {
  test("init measures ONLY the first batch synchronously, not the whole file", () => {
    const { tracker, measure } = makeTracker({ batchSize: 1000 });
    tracker.init(5000);
    expect(measure).toHaveBeenCalledTimes(1000); // exactly one batch, not 5000
    expect(tracker.maxColumns).toBe(1000); // lines 1..1000 measured -> max = 1000
  });

  test("background scan completes the rest in batches without blocking", () => {
    const { tracker, measure, flush } = makeTracker({ batchSize: 1000 });
    tracker.init(5000);
    expect(measure).toHaveBeenCalledTimes(1000);
    tracker.scheduleBackgroundScan();
    flush();
    expect(measure).toHaveBeenCalledTimes(5000);
    expect(tracker.maxColumns).toBe(5000);
    expect(tracker.get(5000)).toBe(5000);
  });

  test("scheduleBackgroundScan(onProgress) reports after each completed batch", () => {
    const { tracker, schedule, flush } = makeTracker({ batchSize: 1000 });
    tracker.init(5000);
    schedule.mockClear(); // discard the init-internal schedules
    const progress = vi.fn();
    tracker.scheduleBackgroundScan(progress, 1);
    flush();
    expect(progress).toHaveBeenCalledTimes(5); // 5 batches of 1000 for 5000 lines
  });

  test("measure() re-measures a single edited line and raises the max", () => {
    const { tracker, measure } = makeTracker({ batchSize: 1000 });
    measure.mockImplementation((line: number) => (line === 50 ? 9999 : line));
    tracker.init(100);
    expect(tracker.maxColumns).toBe(9999);
    expect(tracker.get(50)).toBe(9999);
  });

  test("edit on a non-max line keeps maxColumns accurate", () => {
    const { tracker, measure } = makeTracker({ batchSize: 1000 });
    tracker.init(200); // max = 200 (line 200)
    measure.mockImplementation((line: number) => (line === 100 ? 2100 : line));
    tracker.measure(100);
    expect(tracker.maxColumns).toBe(2100);
  });

  test("invalidateLine drops the removed width from the recomputed max", () => {
    const { tracker } = makeTracker({ batchSize: 1000 });
    tracker.init(100); // max = 100 (line 100)
    tracker.invalidateLine(100);
    expect(tracker.get(100)).toBeUndefined();
    expect(tracker.maxColumns).toBe(99);
  });

  test("invalidateFrom clears all shifted lines and recomputes max from what remains", () => {
    const { tracker } = makeTracker({ batchSize: 1000 });
    tracker.init(100); // max = 100
    tracker.invalidateFrom(50);
    expect(tracker.get(49)).toBe(49);
    expect(tracker.get(50)).toBeUndefined();
    expect(tracker.get(100)).toBeUndefined();
    expect(tracker.maxColumns).toBe(49); // lines 50.. pending background re-measure
  });

  test("setLineCount extends the scan horizon for background work", () => {
    const { tracker, measure, flush } = makeTracker({ batchSize: 1000 });
    tracker.init(1000);
    expect(measure).toHaveBeenCalledTimes(1000);
    tracker.setLineCount(3000);
    tracker.scheduleBackgroundScan();
    flush();
    expect(measure).toHaveBeenCalledTimes(3000);
    expect(tracker.maxColumns).toBe(3000);
  });

  test("reset clears cache and max", () => {
    const { tracker } = makeTracker({ batchSize: 1000 });
    tracker.init(100);
    expect(tracker.maxColumns).toBe(100);
    tracker.reset();
    expect(tracker.maxColumns).toBe(0);
    expect(tracker.get(1)).toBeUndefined();
  });

  test("dispose cancels pending background scanning", () => {
    const { tracker, measure, schedule, flush } = makeTracker({ batchSize: 100 });
    tracker.init(5000);
    expect(measure).toHaveBeenCalledTimes(100);
    tracker.scheduleBackgroundScan();
    expect(schedule).toHaveBeenCalled(); // pending work was scheduled…
    tracker.dispose(); // …and is cancelled here
    flush();
    expect(measure).toHaveBeenCalledTimes(100); // nothing measured after dispose
  });

  test("empty file: init(0) measures nothing and reports max 0", () => {
    const { tracker, measure } = makeTracker({ batchSize: 1000 });
    tracker.init(0);
    expect(measure).not.toHaveBeenCalled();
    expect(tracker.maxColumns).toBe(0);
  });
});
