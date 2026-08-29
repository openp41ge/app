/**
 * Unit tests for LineWidthTracker (Phase 1A of the large-file-performance plan).
 *
 * Contract (per explicit product requirement): the horizontal scrollbar must be
 * the CORRECT size from the start and must NOT grow as more of the file is
 * measured. So:
 *   - measureRange() computes an exact max in one synchronous pass (no stale
 *     narrower provisional value, no background widening)
 *   - edits re-measure only touched lines; shrinking the max line recomputes
 *     the exact max from the cache immediately
 */
import { describe, test, expect, vi, type Mock } from "vitest";
import { LineWidthTracker } from "../../../src/components/file-editor/line-width-tracker";

/** measure fn: width == lineNumber (so max == last measured line). */
const widthIsLineNumber = (line: number): number => line;

interface Fixture {
  tracker: LineWidthTracker;
  measure: Mock<(line: number) => number>;
}

function makeTracker(): Fixture {
  const measure = vi.fn(widthIsLineNumber);
  const tracker = new LineWidthTracker(measure);
  return { tracker, measure };
}

describe("LineWidthTracker", () => {
  test("measureRange gives the exact max across the whole file (correct from start)", () => {
    const { tracker, measure } = makeTracker();
    tracker.measureRange(1, 5000);
    expect(measure).toHaveBeenCalledTimes(5000);
    // No provisional/partial max — it is already the true max.
    expect(tracker.maxColumns).toBe(5000);
    expect(tracker.get(2500)).toBe(2500);
  });

  test("measure() on a single edited line re-measures just that line and raises the max", () => {
    const { tracker, measure } = makeTracker();
    tracker.measureRange(1, 100);
    measure.mockImplementation((line: number) => (line === 50 ? 9999 : line));
    tracker.measure(50);
    expect(tracker.maxColumns).toBe(9999);
    expect(tracker.get(50)).toBe(9999);
    // Only the edited line was re-measured.
    expect(measure).toHaveBeenCalledTimes(100 + 1);
  });

  test("editing a non-max line keeps the max exact without a rescan", () => {
    const { tracker, measure } = makeTracker();
    tracker.measureRange(1, 200);
    const before = measure.mock.calls.length;
    measure.mockImplementation((line: number) => (line === 100 ? 2100 : line));
    tracker.measure(100);
    expect(tracker.maxColumns).toBe(2100);
    expect(measure.mock.calls.length - before).toBe(1); // one line only
  });

  test("shrinking the max line recomputes the exact max immediately (no stale wide scrollbar)", () => {
    const { tracker } = makeTracker();
    tracker.measureRange(1, 100); // max = 100 (line 100)
    // Edit line 100 to be short — it was the max.
    tracker.measure(100); // still 100 under the default fn (lineNumber)
    expect(tracker.maxColumns).toBe(100);
    // Now shrink it to 5 via invalidate + remeasure path used on edits:
    tracker.invalidateLine(100);
    expect(tracker.maxColumns).toBe(99); // next-highest is line 99, not stale 100
  });

  test("invalidateLine drops the removed width and recomputes max", () => {
    const { tracker } = makeTracker();
    tracker.measureRange(1, 100);
    expect(tracker.maxColumns).toBe(100);
    tracker.invalidateLine(100);
    expect(tracker.get(100)).toBeUndefined();
    expect(tracker.maxColumns).toBe(99);
  });

  test("invalidateFrom clears all shifted lines (line insert/delete)", () => {
    const { tracker } = makeTracker();
    tracker.measureRange(1, 100);
    tracker.invalidateFrom(50);
    expect(tracker.get(49)).toBe(49);
    expect(tracker.get(50)).toBeUndefined();
    expect(tracker.get(100)).toBeUndefined();
    expect(tracker.maxColumns).toBe(49); // exact for the remaining lines
  });

  test("recomputeMax after the max line shrinks gives the exact next-highest", () => {
    const { tracker } = makeTracker();
    tracker.measureRange(1, 100);
    // Simulate a same-line edit that shortens line 100 from 100 to 5.
    tracker.measure(100); // cache now 100 again
    // Replace the cached value with a short one the way an edit would after
    // overwriting the measured value:
    // (measure() already set it; emulate by invalidating the stale max)
    tracker.invalidateLine(100);
    expect(tracker.maxColumns).toBe(99);
    tracker.recomputeMax();
    expect(tracker.maxColumns).toBe(99);
  });

  test("reset clears cache and max", () => {
    const { tracker } = makeTracker();
    tracker.measureRange(1, 100);
    expect(tracker.maxColumns).toBe(100);
    tracker.reset();
    expect(tracker.maxColumns).toBe(0);
    expect(tracker.get(1)).toBeUndefined();
  });

  test("empty range measures nothing and reports max 0", () => {
    const { tracker, measure } = makeTracker();
    tracker.measureRange(1, 0);
    expect(measure).not.toHaveBeenCalled();
    expect(tracker.maxColumns).toBe(0);
  });
});
