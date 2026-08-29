/**
 * Unit tests for WrappedLineIndex — the model↔view mapping behind word-wrap
 * virtual scrolling (Phase 2 of the large-file-performance plan).
 *
 * Pins the invariants the viewport relies on:
 *   - view line count / view-line-start match a brute-force segment walk
 *   - view→model resolution (findViewLine) matches the same walk, in O(log n)
 *   - invalidation after edits keeps the mapping correct without a full rebuild
 */
import { describe, test, expect } from "vitest";
import { WrappedLineIndex } from "../../../src/view/wrapped-line-index";
import { computeWrapSegments } from "../../../src/view/word-wrap-helper";

const WRAP = 20;

function makeProvider(contents: string[]) {
  return {
    getLineContent: (line: number): string => contents[line - 1] ?? "",
  };
}

describe("WrappedLineIndex", () => {
  test("totalViewLineCount equals brute-force sum of wrap segments", () => {
    const contents = [
      "short",
      "x".repeat(45), // 3 segments @ 20
      "hello world ".repeat(4), // 2+ segments
      "single",
    ];
    const idx = new WrappedLineIndex(makeProvider(contents), WRAP);
    idx.setTotalModelLineCount(contents.length);
    const expected = contents.reduce((sum, c) => sum + computeWrapSegments(c, WRAP).length, 0);
    expect(idx.totalViewLineCount).toBe(expected);
  });

  test("getViewLineStart matches brute force for every model line", () => {
    const contents = ["a", "y".repeat(55), "b", "z".repeat(25), "c", "q".repeat(41)];
    const idx = new WrappedLineIndex(makeProvider(contents), WRAP);
    idx.setTotalModelLineCount(contents.length);
    for (let line = 1; line <= contents.length; line++) {
      expect(idx.getViewLineStart(line)).toBe(bruteForceViewLineStart(line, contents));
    }
  });

  test("findViewLine resolves every view line to the correct model/segment", () => {
    const contents = ["ab", "z".repeat(55), "cd", "y".repeat(30), "e"];
    const idx = new WrappedLineIndex(makeProvider(contents), WRAP);
    idx.setTotalModelLineCount(contents.length);

    let viewLine = 1;
    for (let m = 1; m <= contents.length; m++) {
      const segments = computeWrapSegments(contents[m - 1], WRAP);
      for (let s = 0; s < segments.length; s++) {
        const info = idx.findViewLine(viewLine);
        expect(info).not.toBeNull();
        expect(info!.modelLine).toBe(m);
        expect(info!.segmentIndex).toBe(s);
        viewLine++;
      }
    }
    expect(viewLine - 1).toBe(idx.totalViewLineCount);
    expect(idx.findViewLine(idx.totalViewLineCount + 1)).toBeNull();
    expect(idx.findViewLine(0)).toBeNull();
  });

  test("invalidateFrom repairs the tail mapping after a line-shifting edit", () => {
    const contents = ["a".repeat(45), "bbb", "ccc", "ddd", "eee", "fff"];
    const idx = new WrappedLineIndex(makeProvider(contents), WRAP);
    idx.setTotalModelLineCount(contents.length);

    // Warm the full index, then simulate a structural edit at model line 2
    // (e.g. a line inserted above) — everything from line 2 down is stale.
    expect(idx.findViewLine(idx.totalViewLineCount)!.modelLine).toBe(contents.length);
    idx.invalidateFrom(2);
    // After invalidation, resolving a view line in the stale tail must rebuild
    // and still agree with brute force.
    for (let m = 2; m <= contents.length; m++) {
      expect(idx.getViewLineStart(m)).toBe(bruteForceViewLineStart(m, contents));
    }
    const last = idx.totalViewLineCount;
    expect(idx.findViewLine(last)!.modelLine).toBe(contents.length);
  });

  test("setWrapColumn resets cached mapping", () => {
    const contents = ["a".repeat(50), "b".repeat(50)];
    const idx = new WrappedLineIndex(makeProvider(contents), 20);
    idx.setTotalModelLineCount(contents.length);
    const count20 = idx.totalViewLineCount;
    idx.setWrapColumn(10);
    expect(idx.totalViewLineCount).toBeGreaterThan(count20);
    // fully re-resolved correctly
    for (let m = 1; m <= contents.length; m++) {
      const viewStart = idx.getViewLineStart(m);
      expect(viewStart).toBe(bruteForceViewLineStart(m, contents, 10));
    }
  });

  test("changing to a larger line count extends lazily; smaller truncates", () => {
    const contents = ["a", "b", "c"];
    const idx = new WrappedLineIndex(makeProvider(contents), WRAP);
    idx.setTotalModelLineCount(3);
    const total3 = idx.totalViewLineCount;
    idx.setTotalModelLineCount(5); // grows (provider returns "" beyond contents)
    expect(idx.totalViewLineCount).toBeGreaterThanOrEqual(total3);
    idx.setTotalModelLineCount(1);
    expect(idx.totalViewLineCount).toBe(1);
  });

  test("empty document reports 0 view lines", () => {
    const idx = new WrappedLineIndex(makeProvider([]), WRAP);
    idx.setTotalModelLineCount(0);
    expect(idx.totalViewLineCount).toBe(0);
    expect(idx.findViewLine(1)).toBeNull();
  });
});

function bruteForceViewLineStart(line: number, contents: string[], wrap = WRAP): number {
  let acc = 1;
  for (let i = 1; i < line; i++) {
    acc += computeWrapSegments(contents[i - 1], wrap).length;
  }
  return acc;
}
