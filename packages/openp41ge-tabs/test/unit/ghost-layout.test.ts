/**
 * Unit tests for ghost-layout.ts — pure ghost overlay layout computation.
 */
import { describe, it, expect } from "vitest";
import { computeGhostLayout } from "openp41ge-tabs/ghost-layout";

// ─── computeGhostLayout — cell-center drops ───────────────────────────────

describe("computeGhostLayout — cell-center drops", () => {
  const flexValues = [0.5, 0.3, 0.2];
  const cols = 3;

  it("marks the target column as active for a cell-center drop", () => {
    const result = computeGhostLayout(cols, flexValues, { type: "cell-center", col: 1 });
    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ flex: 0.5, highlighted: false, splitPair: false, active: false });
    expect(result[1]).toEqual({ flex: 0.3, highlighted: false, splitPair: false, active: true });
    expect(result[2]).toEqual({ flex: 0.2, highlighted: false, splitPair: false, active: false });
  });

  it("marks col 0 as active for leftmost cell-center drop", () => {
    const result = computeGhostLayout(cols, flexValues, { type: "cell-center", col: 0 });
    expect(result[0].active).toBe(true);
    expect(result[1].active).toBe(false);
    expect(result[2].active).toBe(false);
  });

  it("marks last col as active for rightmost cell-center drop", () => {
    const result = computeGhostLayout(cols, flexValues, { type: "cell-center", col: 2 });
    expect(result[0].active).toBe(false);
    expect(result[1].active).toBe(false);
    expect(result[2].active).toBe(true);
  });

  it("preserves flex values unchanged for cell-center drops", () => {
    const result = computeGhostLayout(cols, flexValues, { type: "cell-center", col: 0 });
    result.forEach((col, i) => {
      expect(col.flex).toBe(flexValues[i]);
    });
  });

  it("handles single-column grid", () => {
    const result = computeGhostLayout(1, [1], { type: "cell-center", col: 0 });
    expect(result).toHaveLength(1);
    expect(result[0].active).toBe(true);
  });
});

// ─── computeGhostLayout — split drops ─────────────────────────────────────

describe("computeGhostLayout — split drops", () => {
  const flexValues = [0.5, 0.5];
  const cols = 2;

  it("creates 3 columns for a split drop (2 → 3)", () => {
    const result = computeGhostLayout(cols, flexValues, {
      type: "split",
      splitCol: 0,
      splitLeft: true,
    });
    expect(result).toHaveLength(3);
  });

  it("highlighted column is first half when splitLeft=true", () => {
    const result = computeGhostLayout(cols, flexValues, {
      type: "split",
      splitCol: 0,
      splitLeft: true,
    });
    expect(result[0].highlighted).toBe(true);
    expect(result[0].splitPair).toBe(false);
    expect(result[1].highlighted).toBe(false);
    expect(result[1].splitPair).toBe(true);
  });

  it("highlighted column is second half when splitLeft=false", () => {
    const result = computeGhostLayout(cols, flexValues, {
      type: "split",
      splitCol: 0,
      splitLeft: false,
    });
    expect(result[0].highlighted).toBe(false);
    expect(result[0].splitPair).toBe(true);
    expect(result[1].highlighted).toBe(true);
    expect(result[1].splitPair).toBe(false);
  });

  it("split halves sum to original column flex", () => {
    const result = computeGhostLayout(cols, flexValues, {
      type: "split",
      splitCol: 1,
      splitLeft: true,
    });
    // splitCol=1 → original flex=0.5, halves should be 0.25 each
    expect(result[1].flex + result[2].flex).toBeCloseTo(0.5);
  });

  it("keeps non-split columns unchanged", () => {
    const values = [0.6, 0.4];
    const result = computeGhostLayout(cols, values, {
      type: "split",
      splitCol: 1,
      splitLeft: true,
    });
    expect(result[0].flex).toBe(0.6);
    expect(result[0].active).toBe(false);
    expect(result[0].highlighted).toBe(false);
  });

  it("handles split on first column", () => {
    const result = computeGhostLayout(3, [0.4, 0.3, 0.3], {
      type: "split",
      splitCol: 0,
      splitLeft: false,
    });
    expect(result).toHaveLength(4);
    expect(result[0].splitPair).toBe(true);
    expect(result[0].highlighted).toBe(false);
    expect(result[1].highlighted).toBe(true);
    expect(result[1].splitPair).toBe(false);
  });

  it("handles split on last column", () => {
    const result = computeGhostLayout(3, [0.4, 0.3, 0.3], {
      type: "split",
      splitCol: 2,
      splitLeft: true,
    });
    expect(result).toHaveLength(4);
    expect(result[2].highlighted).toBe(true);
    expect(result[2].splitPair).toBe(false);
    expect(result[3].highlighted).toBe(false);
    expect(result[3].splitPair).toBe(true);
  });
});
