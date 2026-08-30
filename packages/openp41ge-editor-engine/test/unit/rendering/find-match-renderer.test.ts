/**
 * Unit tests for the find-match → view-span conversion (`toFindViewSpans`).
 *
 * Pins the contract between FindInEditor match geometry (model space) and the
 * FindMatchRenderer paint layer (view space, word-wrap aware):
 *   - without a converter each match maps to one span with unchanged columns
 *   - with word wrap a match inside one wrap segment maps to that view line
 *   - a match crossing a wrap boundary is split with per-segment clipping
 *   - exactly one span is tagged active per match
 */
import { describe, test, expect } from "vitest";
import {
  toFindViewSpans,
  type IFindViewConverter,
  type FindViewSpan,
} from "../../../src/rendering/find-match-renderer";
import type { FindMatch } from "../../../src/input/find-in-editor";

interface FakeSeg {
  startColumn: number;
  endColumn: number;
}

/** Hand-rolled converter mirroring CoordinatesConverter's resolution. */
function fakeConverter(lines: Array<{ base: number; segments: FakeSeg[] }>): IFindViewConverter {
  const get = (line: number) => lines[line - 1];
  return {
    getWrapSegments: (modelLine: number) => {
      const segs = get(modelLine)?.segments;
      return segs && segs.length > 0 ? segs : null;
    },
    getViewLineFromModelLine: (modelLine: number) => get(modelLine)?.base ?? modelLine,
    convertModelToViewPosition: (modelLine: number, modelColumn: number) => {
      const data = get(modelLine);
      if (!data || data.segments.length <= 1) {
        return { lineNumber: data?.base ?? modelLine, column: modelColumn };
      }
      for (let i = 0; i < data.segments.length; i++) {
        const seg = data.segments[i];
        if (modelColumn < seg.endColumn) {
          return {
            lineNumber: data.base + i,
            column: modelColumn - seg.startColumn + 1,
          };
        }
      }
      const last = data.segments[data.segments.length - 1];
      return {
        lineNumber: data.base + data.segments.length - 1,
        column: modelColumn - last.startColumn + 1,
      };
    },
  };
}

const m = (lineNumber: number, column: number, length: number): FindMatch => ({
  lineNumber,
  column,
  length,
  text: "x".repeat(length),
});

describe("toFindViewSpans", () => {
  test("maps directly when no converter is provided", () => {
    const spans = toFindViewSpans([m(3, 5, 4), m(7, 1, 2)], null, 0);
    expect(spans).toEqual([
      { line: 3, startColumn: 5, endColumn: 9, isActive: true },
      { line: 7, startColumn: 1, endColumn: 3, isActive: false },
    ]);
  });

  test("empty matches yield no spans", () => {
    expect(toFindViewSpans([], null, 0)).toEqual([]);
  });

  test("single-segment wrap line maps to its one view line", () => {
    const conv = fakeConverter([{ base: 10, segments: [{ startColumn: 1, endColumn: 100 }] }]);
    const spans = toFindViewSpans([m(1, 5, 4)], conv);
    expect(spans.length).toBe(1);
    expect(spans[0]).toEqual({ line: 10, startColumn: 5, endColumn: 9, isActive: false });
  });

  test("match inside a middle wrap segment lands on the right view line", () => {
    const conv = fakeConverter([
      {
        base: 40,
        segments: [
          { startColumn: 1, endColumn: 21 },
          { startColumn: 21, endColumn: 41 },
          { startColumn: 41, endColumn: 61 },
        ],
      },
    ]);
    // Model columns 30..35 sit entirely in segment 2 (21..41) → view line 41, cols 10..15.
    const spans = toFindViewSpans([m(1, 30, 5)], conv);
    expect(spans).toEqual([{ line: 41, startColumn: 10, endColumn: 15, isActive: false }]);
  });

  test("match crossing a wrap boundary is clipped across two view lines", () => {
    const conv = fakeConverter([
      {
        base: 50,
        segments: [
          { startColumn: 1, endColumn: 21 },
          { startColumn: 21, endColumn: 41 },
        ],
      },
    ]);
    // Model cols 15..27 span segment 1 (15..21) and segment 2 (21..27).
    const spans = toFindViewSpans([m(1, 15, 12)], conv);
    expect(spans).toEqual([
      { line: 50, startColumn: 15, endColumn: 21, isActive: false },
      { line: 51, startColumn: 1, endColumn: 7, isActive: false },
    ]);
  });

  test("a wrap-crossing active match highlights every one of its spans", () => {
    const conv = fakeConverter([
      {
        base: 8,
        segments: [
          { startColumn: 1, endColumn: 21 },
          { startColumn: 21, endColumn: 41 },
        ],
      },
    ]);
    // Current match spans a wrap boundary — the whole match reads active,
    // so BOTH resulting spans carry the active highlight.
    const spans: FindViewSpan[] = toFindViewSpans([m(1, 15, 12)], conv, 0);
    expect(spans).toHaveLength(2);
    expect(spans.every((s) => s.isActive)).toBe(true);
  });

  test("active index tags only the spans of the requested match", () => {
    const conv = fakeConverter([
      {
        base: 8,
        segments: [
          { startColumn: 1, endColumn: 21 },
          { startColumn: 21, endColumn: 41 },
        ],
      },
      { base: 10, segments: [{ startColumn: 1, endColumn: 41 }] },
    ]);
    const spans = toFindViewSpans([m(1, 15, 12), m(2, 2, 3)], conv, 1);
    // Match 1 spans two view lines (not active); match 2 spans one (active).
    expect(spans.filter((s) => s.isActive)).toHaveLength(1);
    expect(spans.filter((s) => s.isActive)[0]).toMatchObject({ line: 10 });
  });

  test("active index tags the requested match across the full set", () => {
    const spans = toFindViewSpans([m(1, 1, 2), m(1, 10, 2)], null, 1);
    expect(spans[0].isActive).toBe(false);
    expect(spans[1].isActive).toBe(true);
  });
});
