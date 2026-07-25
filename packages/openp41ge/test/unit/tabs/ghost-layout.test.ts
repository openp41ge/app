/**
 * Exhaustive tests for the ghost overlay layout computation.
 *
 * Tests every possible drop zone configuration for 1, 2, 3, and 4 column
 * grids. The layout is a pure function — no DOM required.
 *
 * For N columns:
 *   - N cell-center zones (column count unchanged)
 *   - 2N split zones (column count increases by 1)
 *
 * Each test verifies:
 *   - Number of columns in the result
 *   - Flex values match expectations
 *   - Which column is highlighted (the drop target)
 *   - Which column is split-pair (the other half of the split)
 *   - Which column is active (cell-center style)
 */

import { describe, it, expect } from "vitest";
import { computeGhostLayout } from "@openp41ge/renderer/services/drag/ghost-layout";
import type { GhostColumn } from "@openp41ge/renderer/services/drag/ghost-layout";

// ─── Assertion helpers ────────────────────────────────────────────────────

function describeCols(columns: GhostColumn[]): string {
  return columns
    .map(
      (c, i) =>
        `[${i}:flex=${c.flex.toFixed(3)}${c.highlighted ? " HIGHLIGHTED" : ""}${c.splitPair ? " split-pair" : ""}${c.active ? " active" : ""}]`,
    )
    .join(" ");
}

function expectColCount(columns: GhostColumn[], expected: number, label: string): void {
  expect(columns.length, `${label}: column count`).toBe(expected);
}

function expectFlex(columns: GhostColumn[], colIdx: number, expected: number, label: string): void {
  expect(columns[colIdx].flex, `${label}: col ${colIdx} flex`).toBeCloseTo(expected, 3);
}

function expectCol(
  columns: GhostColumn[],
  colIdx: number,
  expected: {
    flex?: number;
    highlighted?: boolean;
    splitPair?: boolean;
    active?: boolean;
  },
  label: string,
): void {
  const c = columns[colIdx];
  const prefix = `${label}: col ${colIdx}`;
  if (expected.flex !== undefined) expect(c.flex, `${prefix} flex`).toBeCloseTo(expected.flex, 3);
  if (expected.highlighted !== undefined)
    expect(c.highlighted, `${prefix} highlighted`).toBe(expected.highlighted);
  if (expected.splitPair !== undefined)
    expect(c.splitPair, `${prefix} splitPair`).toBe(expected.splitPair);
  if (expected.active !== undefined) expect(c.active, `${prefix} active`).toBe(expected.active);
}

// ─── 1-COLUMN GRID ──────────────────────────────────────────────────────

describe("1-column grid", () => {
  const cols = 1;
  const flex = [1];

  describe("Cell-center (1 zone)", () => {
    it("center of col 0 -> 1 col, col 0 is active", () => {
      const result = computeGhostLayout(cols, flex, { type: "cell-center", col: 0 });
      expectColCount(result, 1, "1-col center");
      expectCol(
        result,
        0,
        { flex: 1, highlighted: false, splitPair: false, active: true },
        "1-col center",
      );
    });
  });

  describe("Split (2 zones)", () => {
    it("left edge (splitCol=0, splitLeft=true) -> 2 cols, col 0 highlighted", () => {
      const result = computeGhostLayout(cols, flex, {
        type: "split",
        splitCol: 0,
        splitLeft: true,
      });
      expectColCount(result, 2, "1-col left split");
      expectCol(result, 0, { flex: 0.5, highlighted: true, splitPair: false }, "col 0 new tab");
      expectCol(
        result,
        1,
        { flex: 0.5, highlighted: false, splitPair: true },
        "col 1 original right",
      );
    });

    it("right edge (splitCol=0, splitLeft=false) -> 2 cols, col 1 highlighted", () => {
      const result = computeGhostLayout(cols, flex, {
        type: "split",
        splitCol: 0,
        splitLeft: false,
      });
      expectColCount(result, 2, "1-col right split");
      expectCol(
        result,
        0,
        { flex: 0.5, highlighted: false, splitPair: true },
        "col 0 original left",
      );
      expectCol(result, 1, { flex: 0.5, highlighted: true, splitPair: false }, "col 1 new tab");
    });
  });
});

// ─── 2-COLUMN GRID ──────────────────────────────────────────────────────

describe("2-column grid", () => {
  const cols = 2;
  const flex = [0.5, 0.5];

  describe("Cell-center (2 zones)", () => {
    it("center of col 0 -> 2 cols, col 0 is active", () => {
      const result = computeGhostLayout(cols, flex, { type: "cell-center", col: 0 });
      expectColCount(result, 2, "2-col center 0");
      expectCol(
        result,
        0,
        { flex: 0.5, active: true, highlighted: false, splitPair: false },
        "col 0",
      );
      expectCol(
        result,
        1,
        { flex: 0.5, active: false, highlighted: false, splitPair: false },
        "col 1",
      );
    });

    it("center of col 1 -> 2 cols, col 1 is active", () => {
      const result = computeGhostLayout(cols, flex, { type: "cell-center", col: 1 });
      expectColCount(result, 2, "2-col center 1");
      expectCol(result, 0, { flex: 0.5, active: false }, "col 0");
      expectCol(result, 1, { flex: 0.5, active: true }, "col 1");
    });
  });

  describe("Split (4 zones)", () => {
    // Left edge of grid
    it("left edge (splitCol=0, splitLeft=true) -> 3 cols, col 0 highlighted", () => {
      const result = computeGhostLayout(cols, flex, {
        type: "split",
        splitCol: 0,
        splitLeft: true,
      });
      expectColCount(result, 3, "2-col left edge");
      // [new tab] [col0-right-half] [col1]
      expectCol(result, 0, { flex: 0.25, highlighted: true, splitPair: false }, "new tab left");
      expectCol(result, 1, { flex: 0.25, highlighted: false, splitPair: true }, "col0 right half");
      expectCol(result, 2, { flex: 0.5, highlighted: false, splitPair: false }, "col1 unchanged");
    });

    // Col 0 right side (interior boundary, mouse in col 0)
    it("col 0 right edge (splitCol=0, splitLeft=false) -> 3 cols, col 1 highlighted", () => {
      const result = computeGhostLayout(cols, flex, {
        type: "split",
        splitCol: 0,
        splitLeft: false,
      });
      expectColCount(result, 3, "2-col col0 right");
      // [col0-left-half] [new tab] [col1]
      expectCol(result, 0, { flex: 0.25, highlighted: false, splitPair: true }, "col0 left half");
      expectCol(result, 1, { flex: 0.25, highlighted: true, splitPair: false }, "new tab between");
      expectCol(result, 2, { flex: 0.5, highlighted: false, splitPair: false }, "col1 unchanged");
    });

    // Col 1 left side (interior boundary, mouse in col 1)
    it("col 1 left edge (splitCol=1, splitLeft=true) -> 3 cols, col 1 highlighted", () => {
      const result = computeGhostLayout(cols, flex, {
        type: "split",
        splitCol: 1,
        splitLeft: true,
      });
      expectColCount(result, 3, "2-col col1 left");
      // [col0] [new tab] [col1-right-half]
      expectCol(result, 0, { flex: 0.5, highlighted: false, splitPair: false }, "col0 unchanged");
      expectCol(result, 1, { flex: 0.25, highlighted: true, splitPair: false }, "new tab between");
      expectCol(result, 2, { flex: 0.25, highlighted: false, splitPair: true }, "col1 right half");
    });

    // Right edge of grid
    it("right edge (splitCol=1, splitLeft=false) -> 3 cols, col 2 highlighted", () => {
      const result = computeGhostLayout(cols, flex, {
        type: "split",
        splitCol: 1,
        splitLeft: false,
      });
      expectColCount(result, 3, "2-col right edge");
      // [col0] [col1-left-half] [new tab]
      expectCol(result, 0, { flex: 0.5, highlighted: false, splitPair: false }, "col0 unchanged");
      expectCol(result, 1, { flex: 0.25, highlighted: false, splitPair: true }, "col1 left half");
      expectCol(result, 2, { flex: 0.25, highlighted: true, splitPair: false }, "new tab right");
    });
  });
});

// ─── 3-COLUMN GRID ──────────────────────────────────────────────────────

describe("3-column grid", () => {
  const cols = 3;
  const flex = [1 / 3, 1 / 3, 1 / 3];
  const f = 1 / 3; // 0.333

  describe("Cell-center (3 zones)", () => {
    it("center of col 0 -> 3 cols, col 0 is active", () => {
      const result = computeGhostLayout(cols, flex, { type: "cell-center", col: 0 });
      expectColCount(result, 3, "3-col center 0");
      expectCol(result, 0, { flex: f, active: true }, "col 0");
      expectCol(result, 1, { flex: f, active: false }, "col 1");
      expectCol(result, 2, { flex: f, active: false }, "col 2");
    });

    it("center of col 1 -> 3 cols, col 1 is active", () => {
      const result = computeGhostLayout(cols, flex, { type: "cell-center", col: 1 });
      expectColCount(result, 3, "3-col center 1");
      expectCol(result, 0, { flex: f, active: false }, "col 0");
      expectCol(result, 1, { flex: f, active: true }, "col 1");
      expectCol(result, 2, { flex: f, active: false }, "col 2");
    });

    it("center of col 2 -> 3 cols, col 2 is active", () => {
      const result = computeGhostLayout(cols, flex, { type: "cell-center", col: 2 });
      expectColCount(result, 3, "3-col center 2");
      expectCol(result, 0, { flex: f, active: false }, "col 0");
      expectCol(result, 1, { flex: f, active: false }, "col 1");
      expectCol(result, 2, { flex: f, active: true }, "col 2");
    });
  });

  describe("Split (6 zones)", () => {
    // Left edge of grid
    it("left edge (splitCol=0, splitLeft=true) -> 4 cols, col 0 highlighted", () => {
      const result = computeGhostLayout(cols, flex, {
        type: "split",
        splitCol: 0,
        splitLeft: true,
      });
      expectColCount(result, 4, "3-col left edge");
      expectCol(result, 0, { flex: f / 2, highlighted: true, splitPair: false }, "new tab left");
      expectCol(result, 1, { flex: f / 2, highlighted: false, splitPair: true }, "col0 right half");
      expectCol(result, 2, { flex: f, highlighted: false, splitPair: false }, "col1 unchanged");
      expectCol(result, 3, { flex: f, highlighted: false, splitPair: false }, "col2 unchanged");
    });

    // Col 0 right side (mouse in col 0, near divider 1)
    it("col 0 right edge (splitCol=0, splitLeft=false) -> 4 cols, col 1 highlighted", () => {
      const result = computeGhostLayout(cols, flex, {
        type: "split",
        splitCol: 0,
        splitLeft: false,
      });
      expectColCount(result, 4, "3-col col0 right");
      expectCol(result, 0, { flex: f / 2, highlighted: false, splitPair: true }, "col0 left half");
      expectCol(result, 1, { flex: f / 2, highlighted: true, splitPair: false }, "new tab");
      expectCol(result, 2, { flex: f, highlighted: false, splitPair: false }, "col1 unchanged");
      expectCol(result, 3, { flex: f, highlighted: false, splitPair: false }, "col2 unchanged");
    });

    // Col 1 left side (mouse in col 1, near divider 1)
    it("col 1 left edge (splitCol=1, splitLeft=true) -> 4 cols, col 1 highlighted", () => {
      const result = computeGhostLayout(cols, flex, {
        type: "split",
        splitCol: 1,
        splitLeft: true,
      });
      expectColCount(result, 4, "3-col col1 left");
      expectCol(result, 0, { flex: f, highlighted: false, splitPair: false }, "col0 unchanged");
      expectCol(result, 1, { flex: f / 2, highlighted: true, splitPair: false }, "new tab");
      expectCol(result, 2, { flex: f / 2, highlighted: false, splitPair: true }, "col1 right half");
      expectCol(result, 3, { flex: f, highlighted: false, splitPair: false }, "col2 unchanged");
    });

    // Col 1 right side (mouse in col 1, near divider 2)
    it("col 1 right edge (splitCol=1, splitLeft=false) -> 4 cols, col 2 highlighted", () => {
      const result = computeGhostLayout(cols, flex, {
        type: "split",
        splitCol: 1,
        splitLeft: false,
      });
      expectColCount(result, 4, "3-col col1 right");
      expectCol(result, 0, { flex: f, highlighted: false, splitPair: false }, "col0 unchanged");
      expectCol(result, 1, { flex: f / 2, highlighted: false, splitPair: true }, "col1 left half");
      expectCol(result, 2, { flex: f / 2, highlighted: true, splitPair: false }, "new tab");
      expectCol(result, 3, { flex: f, highlighted: false, splitPair: false }, "col2 unchanged");
    });

    // Col 2 left side (mouse in col 2, near divider 2)
    it("col 2 left edge (splitCol=2, splitLeft=true) -> 4 cols, col 2 highlighted", () => {
      const result = computeGhostLayout(cols, flex, {
        type: "split",
        splitCol: 2,
        splitLeft: true,
      });
      expectColCount(result, 4, "3-col col2 left");
      expectCol(result, 0, { flex: f, highlighted: false, splitPair: false }, "col0 unchanged");
      expectCol(result, 1, { flex: f, highlighted: false, splitPair: false }, "col1 unchanged");
      expectCol(result, 2, { flex: f / 2, highlighted: true, splitPair: false }, "new tab");
      expectCol(result, 3, { flex: f / 2, highlighted: false, splitPair: true }, "col2 right half");
    });

    // Right edge of grid
    it("right edge (splitCol=2, splitLeft=false) -> 4 cols, col 3 highlighted", () => {
      const result = computeGhostLayout(cols, flex, {
        type: "split",
        splitCol: 2,
        splitLeft: false,
      });
      expectColCount(result, 4, "3-col right edge");
      expectCol(result, 0, { flex: f, highlighted: false, splitPair: false }, "col0 unchanged");
      expectCol(result, 1, { flex: f, highlighted: false, splitPair: false }, "col1 unchanged");
      expectCol(result, 2, { flex: f / 2, highlighted: false, splitPair: true }, "col2 left half");
      expectCol(result, 3, { flex: f / 2, highlighted: true, splitPair: false }, "new tab right");
    });
  });
});

// ─── UNEQUAL FLEX VALUES ─────────────────────────────────────────────────

describe("Unequal flex values", () => {
  it("2-col grid with flex [0.7, 0.3], split left -> flex preserved", () => {
    const result = computeGhostLayout(2, [0.7, 0.3], {
      type: "split",
      splitCol: 0,
      splitLeft: true,
    });
    // [new] [col0-right-half] [col1]
    expectCol(result, 0, { flex: 0.35, highlighted: true }, "new tab");
    expectCol(result, 1, { flex: 0.35, highlighted: false, splitPair: true }, "col0 right half");
    expectCol(result, 2, { flex: 0.3, highlighted: false }, "col1 unchanged");
  });

  it("2-col grid with flex [0.7, 0.3], split right -> flex preserved", () => {
    const result = computeGhostLayout(2, [0.7, 0.3], {
      type: "split",
      splitCol: 1,
      splitLeft: false,
    });
    // [col0] [col1-left-half] [new]
    expectCol(result, 0, { flex: 0.7, highlighted: false }, "col0 unchanged");
    expectCol(result, 1, { flex: 0.15, highlighted: false, splitPair: true }, "col1 left half");
    expectCol(result, 2, { flex: 0.15, highlighted: true }, "new tab right");
  });

  it("3-col grid with flex [0.5, 0.3, 0.2], cell-center col 2 -> flex preserved", () => {
    const result = computeGhostLayout(3, [0.5, 0.3, 0.2], { type: "cell-center", col: 2 });
    expectCol(result, 0, { flex: 0.5, active: false }, "col 0");
    expectCol(result, 1, { flex: 0.3, active: false }, "col 1");
    expectCol(result, 2, { flex: 0.2, active: true }, "col 2");
  });
});
