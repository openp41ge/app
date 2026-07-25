/**
 * Unit tests for computeDropTarget.
 *
 * Tests the boundary detection logic for all file drag-and-drop scenarios
 * without needing an Electron rendering context.
 */

import { describe, test, expect, beforeAll } from "vitest";

// Simple DOM mock so computeDropTarget can run outside a browser
function createMockDoc() {
  let idCounter = 0;
  class MockElement {
    tagName = "DIV";
    className = "";
    style: Record<string, string> = {};
    children: MockElement[] = [];
    id = `mock-${++idCounter}`;
    constructor() {}
    setAttribute() {}
    appendChild(child: MockElement) {
      this.children.push(child);
    }
    querySelectorAll(sel: string): MockElement[] {
      if (sel === ".openp41ge-grid-cell") return this.children;
      return [];
    }
  }
  return { MockElement };
}

beforeAll(() => {
  const { MockElement } = createMockDoc();
  (globalThis as any).document = {
    createElement: () => new MockElement() as any,
  };
});

const { computeDropTarget, INSERT_BOUNDARY_THRESHOLD } =
  await import("@openp41ge/renderer/services/boundary/detection");

/** Create a mock grid element with given cell flex values. */
function mockGrid(cols: number, flexValues?: number[]): HTMLElement {
  const el = document.createElement("div") as any;
  for (let i = 0; i < cols; i++) {
    const cell = document.createElement("div") as any;
    cell.className = "openp41ge-grid-cell";
    const fv = flexValues?.[i] ?? 1;
    cell.style = { flex: `${fv}` };
    el.children.push(cell);
  }
  return el as HTMLElement;
}

/** Shortcut: call computeDropTarget with an equal-width mock grid. */
function targetAt(cols: number, position: number): ReturnType<typeof computeDropTarget> {
  const gridEl = mockGrid(cols);
  const gridWidth = 1000;
  const relX = position * gridWidth;
  return computeDropTarget(gridEl, relX, gridWidth, cols);
}

describe("computeDropTarget", () => {
  // ── cols ≤ 1 — always returns cell-center ──────────────────
  describe("cols <= 1", () => {
    test("cols=0 returns cell-center", () => {
      const r = targetAt(0, 0.5);
      expect(r.isBoundary).toBe(false);
      expect(r.col).toBe(0);
    });
    test("cols=1 at left edge returns cell-center", () => {
      const r = targetAt(1, 0.05);
      expect(r.isBoundary).toBe(false);
    });
    test("cols=1 at center returns cell-center", () => {
      const r = targetAt(1, 0.5);
      expect(r.isBoundary).toBe(false);
    });
    test("cols=1 at right edge returns cell-center", () => {
      const r = targetAt(1, 0.95);
      expect(r.isBoundary).toBe(false);
    });
  });

  // ── cols=2 — equal widths ──────────────────────────────────
  describe("cols=2 equal widths", () => {
    test("leftmost extreme (pos=0.01) → boundary at 0", () => {
      const r = targetAt(2, 0.01);
      expect(r.isBoundary).toBe(true);
      expect(r.boundaryIndex).toBe(0);
      expect(r.col).toBe(0);
    });

    test("near left edge (pos=0.10) → boundary at 0", () => {
      const r = targetAt(2, 0.1);
      expect(r.isBoundary).toBe(true);
      expect(r.boundaryIndex).toBe(0);
    });

    test("col 0 center (pos=0.25) → NOT boundary", () => {
      const r = targetAt(2, 0.25);
      expect(r.isBoundary).toBe(false);
      expect(r.col).toBe(0);
    });

    test("near first divider (pos=0.45) → boundary at 1", () => {
      const r = targetAt(2, 0.45);
      expect(r.isBoundary).toBe(true);
      expect(r.boundaryIndex).toBe(1);
    });

    test("at first divider (pos=0.50) → boundary at 1", () => {
      const r = targetAt(2, 0.5);
      expect(r.isBoundary).toBe(true);
      expect(r.boundaryIndex).toBe(1);
      expect(r.col).toBe(1);
    });

    test("col 1 center (pos=0.75) → NOT boundary", () => {
      const r = targetAt(2, 0.75);
      expect(r.isBoundary).toBe(false);
      expect(r.col).toBe(1);
    });

    test("near right edge (pos=0.90) → boundary at 2", () => {
      const r = targetAt(2, 0.9);
      expect(r.isBoundary).toBe(true);
      expect(r.boundaryIndex).toBe(2);
    });

    test("rightmost extreme (pos=0.99) → boundary at 2", () => {
      const r = targetAt(2, 0.99);
      expect(r.isBoundary).toBe(true);
      expect(r.boundaryIndex).toBe(2);
    });

    // Threshold edges
    test("at 12% from left (pos=0.12) → boundary (0.12 < 0.15)", () => {
      const r = targetAt(2, 0.12);
      expect(r.isBoundary).toBe(true);
      expect(r.boundaryIndex).toBe(0);
    });

    test("at 20% from left (pos=0.20) → NOT boundary (0.20 > 0.15)", () => {
      const r = targetAt(2, 0.2);
      expect(r.isBoundary).toBe(false);
    });

    test("at 88% from left (pos=0.88) → boundary (0.12 < 0.15 from right)", () => {
      const r = targetAt(2, 0.88);
      expect(r.isBoundary).toBe(true);
      expect(r.boundaryIndex).toBe(2);
    });
  });

  // ── cols=3 — equal widths ──────────────────────────────────
  describe("cols=3 equal widths", () => {
    test("col 0 center (pos=0.17) → NOT boundary", () => {
      const r = targetAt(3, 0.17);
      expect(r.isBoundary).toBe(false);
      expect(r.col).toBe(0);
    });

    test("col 1 center (pos=0.50) → NOT boundary", () => {
      const r = targetAt(3, 0.5);
      expect(r.isBoundary).toBe(false);
      expect(r.col).toBe(1);
    });

    test("col 2 center (pos=0.83) → NOT boundary", () => {
      const r = targetAt(3, 0.83);
      expect(r.isBoundary).toBe(false);
      expect(r.col).toBe(2);
    });

    test("divider 0 (pos=0.33) → boundary at 1", () => {
      const r = targetAt(3, 0.33);
      expect(r.isBoundary).toBe(true);
      expect(r.boundaryIndex).toBe(1);
    });

    test("divider 1 (pos=0.67) → boundary at 2", () => {
      const r = targetAt(3, 0.67);
      expect(r.isBoundary).toBe(true);
      expect(r.boundaryIndex).toBe(2);
    });

    test("left edge (pos=0.05) → boundary at 0", () => {
      const r = targetAt(3, 0.05);
      expect(r.isBoundary).toBe(true);
      expect(r.boundaryIndex).toBe(0);
    });

    test("right edge (pos=0.95) → boundary at 3", () => {
      const r = targetAt(3, 0.95);
      expect(r.isBoundary).toBe(true);
      expect(r.boundaryIndex).toBe(3);
    });
  });

  // ── cols=2 — unequal widths ────────────────────────────────
  describe("cols=2 unequal widths (60/40)", () => {
    // flex = [3, 2] → total=5 → divider at 3/5=0.6
    test("col 0 center (pos=0.30) → NOT boundary", () => {
      const gridEl = mockGrid(2, [3, 2]);
      const r = computeDropTarget(gridEl, 300, 1000, 2);
      expect(r.isBoundary).toBe(false);
      expect(r.col).toBe(0);
    });

    test("near divider (pos=0.55) → boundary at 1", () => {
      const gridEl = mockGrid(2, [3, 2]);
      const r = computeDropTarget(gridEl, 550, 1000, 2);
      expect(r.isBoundary).toBe(true);
      expect(r.boundaryIndex).toBe(1);
    });

    test("at divider (pos=0.60) → boundary at 1", () => {
      const gridEl = mockGrid(2, [3, 2]);
      const r = computeDropTarget(gridEl, 600, 1000, 2);
      expect(r.isBoundary).toBe(true);
      expect(r.boundaryIndex).toBe(1);
    });

    test("col 1 center (pos=0.80) → NOT boundary", () => {
      const gridEl = mockGrid(2, [3, 2]);
      const r = computeDropTarget(gridEl, 800, 1000, 2);
      expect(r.isBoundary).toBe(false);
      expect(r.col).toBe(1);
    });
  });

  // ── No cells in DOM — fallback to equal-width dividers ─────
  describe("fallback when no cells", () => {
    test("no cells → equal-width fallback", () => {
      const el = document.createElement("div") as any;
      el.children = []; // no .openp41ge-grid-cell children
      const r = computeDropTarget(el as HTMLElement, 250, 1000, 4);
      expect(r.isBoundary).toBe(true);
      expect(r.boundaryIndex).toBe(1);
    });
  });

  // ── Constants ─────────────────────────────────────────────
  test("INSERT_BOUNDARY_THRESHOLD is 0.15", () => {
    expect(INSERT_BOUNDARY_THRESHOLD).toBe(0.15);
  });
});
