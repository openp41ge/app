// @ts-nocheck
/**
 * Tests for `FoldLineIndex` — the model-line ↔ visible-line mapping used when
 * lines are folded away. Hidden lines contribute zero visible lines.
 */
import { describe, test, expect } from "vitest";
import { FoldLineIndex } from "../../../src/view/fold-line-index";

function makeIndex(hidden: Set<number>, total = 10) {
  const idx = new FoldLineIndex({ isHidden: (m) => hidden.has(m) });
  idx.setTotalModelLineCount(total);
  return idx;
}

describe("FoldLineIndex", () => {
  test("no hidden lines: one visible line per model line", () => {
    const idx = makeIndex(new Set(), 5);
    expect(idx.totalVisibleLineCount).toBe(5);
    expect(idx.getVisibleLineStart(1)).toBe(1);
    expect(idx.getVisibleLineStart(5)).toBe(5);
    for (let v = 1; v <= 5; v++) expect(idx.findModelLine(v)).toBe(v);
  });

  test("hiding lines reduces the total and compacts the starts", () => {
    // Lines 2 and 3 hidden (a fold region header at 1, body 2..3 collapsed).
    const idx = makeIndex(new Set([2, 3]), 5);
    expect(idx.totalVisibleLineCount).toBe(3);
    expect(idx.visibleCountThrough(1)).toBe(1);
    expect(idx.visibleCountThrough(2)).toBe(1);
    expect(idx.visibleCountThrough(3)).toBe(1);
    expect(idx.visibleCountThrough(5)).toBe(3);
    // Visible lines 1,4,5 → starts 1,2,3.
    expect(idx.getVisibleLineStart(1)).toBe(1);
    expect(idx.getVisibleLineStart(4)).toBe(2);
    expect(idx.getVisibleLineStart(5)).toBe(3);
    expect(idx.findModelLine(1)).toBe(1);
    expect(idx.findModelLine(2)).toBe(4);
    expect(idx.findModelLine(3)).toBe(5);
  });

  test("a trailing hidden line is skipped by findModelLine", () => {
    const idx = makeIndex(new Set([5]), 5);
    expect(idx.totalVisibleLineCount).toBe(4);
    expect(idx.findModelLine(4)).toBe(4);
    // visible line 5 doesn't exist; the last valid visible line maps to 4.
    expect(idx.findModelLine(5)).toBe(0);
  });

  test("empty document", () => {
    const idx = makeIndex(new Set(), 0);
    expect(idx.totalVisibleLineCount).toBe(0);
    expect(idx.findModelLine(1)).toBe(0);
  });

  test("invalidateFrom rebuilds lazily after a fold state change", () => {
    const hidden = new Set<number>([2]);
    const idx = makeIndex(hidden, 3);
    expect(idx.totalVisibleLineCount).toBe(2);
    // Unfold line 2: mark everything from line 2 stale.
    hidden.delete(2);
    idx.invalidateFrom(2);
    expect(idx.totalVisibleLineCount).toBe(3);
    expect(idx.findModelLine(2)).toBe(2);
  });

  test("all lines hidden", () => {
    const idx = makeIndex(new Set([1, 2, 3]), 3);
    expect(idx.totalVisibleLineCount).toBe(0);
    expect(idx.findModelLine(1)).toBe(0);
  });
});
