/**
 * Unit tests for compute-layout.ts — pure function computing pixel rects
 * for tabs and overlays from a window + viewport.
 */

import * as types from "@openp41ge/layout/types";
import { computeLayout, distributeSpace } from "@openp41ge/layout/compute-layout";

// ─── Helpers ──────────────────────────────────────────────────────────────

function makeWindow(grid: any, overlays: any[] = [], width = 1280, height = 800): any {
  return {
    id: "w1",
    bounds: { x: 0, y: 0, width, height },
    monitor: 0,
    grid,
    sidebar: { activeViewId: null, width: 280 },
    repoRefs: [],
    overlays,
  };
}

function makeGrid(placements: any[], dividers?: any, rows = 1, cols?: number) {
  const c = cols ?? Math.max(1, ...placements.map((p: any) => p.position.col + 1));
  const grid = types.createGrid("g1", rows, c);
  grid.placements = placements.map((p: any) => ({
    tabIds: [p.tabId ?? p.paneId ?? `tab-${p.position.col}`],
    position: p.position,
    span: p.span ?? { rowSpan: 1, colSpan: 1 },
  }));
  if (dividers) {
    grid.dividers = dividers;
  }
  return grid;
}

// ─── Empty / Missing Pages ────────────────────────────────────────────────

describe("computeLayout (unit) — empty grid", () => {
  test("returns empty layout for window with empty grid", () => {
    const grid = makeGrid([]);
    const win = makeWindow(grid);
    const viewport = { x: 0, y: 0, width: 1280, height: 800 };
    const layout = computeLayout(win, viewport);
    expect(layout.size).toBe(0);
  });

  test("returns empty layout for window with empty grid (null grid)", () => {
    const grid = makeGrid([]);
    const win = makeWindow(grid);
    const viewport = { x: 0, y: 0, width: 1280, height: 800 };
    const layout = computeLayout(win, viewport);
    expect(layout.size).toBe(0);
  });
});

// ─── Basic Grid Layout ────────────────────────────────────────────────────

describe("computeLayout (unit) — grid tabs", () => {
  test("computes rect for a single tab in 1×1 grid", () => {
    const grid = makeGrid([{ tabId: "t1", position: { row: 0, col: 0 } }]);
    const win = makeWindow(grid);
    const viewport = { x: 0, y: 0, width: 1280, height: 800 };

    const layout = computeLayout(win, viewport);
    expect(layout.size).toBe(1);

    const r1 = layout.get("t1" as any);
    expect(r1).toEqual({ x: 0, y: 0, width: 1280, height: 800 });
  });

  test("computes rects for 2 tabs in 1×2 grid with equal dividers", () => {
    const grid = makeGrid([
      { tabId: "t1", position: { row: 0, col: 0 } },
      { tabId: "t2", position: { row: 0, col: 1 } },
    ]);
    const win = makeWindow(grid);
    const viewport = { x: 0, y: 0, width: 1000, height: 800 };

    const layout = computeLayout(win, viewport);
    expect(layout.size).toBe(2);

    expect(layout.get("t1" as any)).toEqual({ x: 0, y: 0, width: 500, height: 800 });
    expect(layout.get("t2" as any)).toEqual({ x: 500, y: 0, width: 500, height: 800 });
  });

  test("computes rects for 4 tabs in 2×2 grid with equal dividers", () => {
    const grid = makeGrid(
      [
        { tabId: "t1", position: { row: 0, col: 0 } },
        { tabId: "t2", position: { row: 0, col: 1 } },
        { tabId: "t3", position: { row: 1, col: 0 } },
        { tabId: "t4", position: { row: 1, col: 1 } },
      ],
      { columns: [0.5], rows: [0.5] },
      2,
      2,
    );
    const win = makeWindow(grid);
    const viewport = { x: 0, y: 0, width: 1000, height: 800 };

    const layout = computeLayout(win, viewport);
    expect(layout.size).toBe(4);

    expect(layout.get("t1" as any)).toEqual({ x: 0, y: 0, width: 500, height: 400 });
    expect(layout.get("t2" as any)).toEqual({ x: 500, y: 0, width: 500, height: 400 });
    expect(layout.get("t3" as any)).toEqual({ x: 0, y: 400, width: 500, height: 400 });
    expect(layout.get("t4" as any)).toEqual({ x: 500, y: 400, width: 500, height: 400 });
  });

  test("uses custom divider ratios", () => {
    const grid = makeGrid(
      [
        { tabId: "t1", position: { row: 0, col: 0 } },
        { tabId: "t2", position: { row: 0, col: 1 } },
      ],
      { columns: [0.25], rows: [] },
    );
    const win = makeWindow(grid);
    const viewport = { x: 0, y: 0, width: 800, height: 600 };

    const layout = computeLayout(win, viewport);
    expect(layout.get("t1" as any)?.width).toBe(Math.round(0.25 * 800));
    expect(layout.get("t2" as any)?.width).toBe(800 - Math.round(0.25 * 800));
  });

  test("handles placements with colSpan and rowSpan", () => {
    const grid = makeGrid(
      [{ tabId: "t1", position: { row: 0, col: 0 }, span: { rowSpan: 2, colSpan: 2 } }],
      { columns: [0.5], rows: [0.5] },
      2,
      2,
    );
    const win = makeWindow(grid);
    const viewport = { x: 0, y: 0, width: 1000, height: 800 };

    const layout = computeLayout(win, viewport);
    expect(layout.get("t1" as any)).toEqual({ x: 0, y: 0, width: 1000, height: 800 });
  });

  test("skips placements outside grid dimensions", () => {
    const grid = makeGrid(
      [
        { tabId: "t1", position: { row: 0, col: 0 } },
        { tabId: "t2", position: { row: 5, col: 5 } },
      ],
      { columns: [], rows: [] },
    );
    const win = makeWindow(grid);
    const viewport = { x: 0, y: 0, width: 1280, height: 800 };

    const layout = computeLayout(win, viewport);
    expect(layout.size).toBe(1);
    expect(layout.has("t2" as any)).toBe(false);
  });
});

// ─── Overlay Layout ───────────────────────────────────────────────────────

describe("computeLayout (unit) — overlays", () => {
  const makeOverlay = (pos: any, width = 400, height = 300) => {
    const tab = types.createTab("t1", "video", "YouTube");
    return { ...types.createOverlayData("o1", tab, pos), width, height };
  };

  test("position: bottom-right", () => {
    const overlay = makeOverlay("bottom-right");
    const win = makeWindow(makeGrid([]), [overlay]);
    const vp = { x: 0, y: 0, width: 1920, height: 1080 };
    const layout = computeLayout(win, vp);
    expect(layout.size).toBe(1);
    expect(layout.get("t1" as any)).toEqual({ x: 1520, y: 780, width: 400, height: 300 });
  });

  test("position: top-left", () => {
    const overlay = makeOverlay("top-left", 300, 200);
    const win = makeWindow(makeGrid([]), [overlay]);
    const vp = { x: 0, y: 0, width: 800, height: 600 };
    const layout = computeLayout(win, vp);
    expect(layout.get("t1" as any)).toEqual({ x: 0, y: 0, width: 300, height: 200 });
  });

  test("position: top-right", () => {
    const overlay = makeOverlay("top-right", 300, 200);
    const win = makeWindow(makeGrid([]), [overlay]);
    const vp = { x: 0, y: 0, width: 800, height: 600 };
    const layout = computeLayout(win, vp);
    expect(layout.get("t1" as any)).toEqual({ x: 500, y: 0, width: 300, height: 200 });
  });

  test("position: bottom-left", () => {
    const overlay = makeOverlay("bottom-left", 300, 200);
    const win = makeWindow(makeGrid([]), [overlay]);
    const vp = { x: 0, y: 0, width: 800, height: 600 };
    const layout = computeLayout(win, vp);
    expect(layout.get("t1" as any)).toEqual({ x: 0, y: 400, width: 300, height: 200 });
  });

  test("position: center", () => {
    const overlay = makeOverlay("center", 400, 300);
    const win = makeWindow(makeGrid([]), [overlay]);
    const vp = { x: 0, y: 0, width: 800, height: 600 };
    const layout = computeLayout(win, vp);
    expect(layout.get("t1" as any)).toEqual({ x: 200, y: 150, width: 400, height: 300 });
  });

  test("custom position (x, y)", () => {
    const overlay = makeOverlay({ x: 100, y: 50 }, 300, 200);
    const win = makeWindow(makeGrid([]), [overlay]);
    const vp = { x: 0, y: 0, width: 800, height: 600 };
    const layout = computeLayout(win, vp);
    expect(layout.get("t1" as any)).toEqual({ x: 100, y: 50, width: 300, height: 200 });
  });

  test("custom position clamps width/height to viewport", () => {
    const overlay = makeOverlay({ x: 0, y: 0 }, 2000, 2000);
    const win = makeWindow(makeGrid([]), [overlay]);
    const vp = { x: 0, y: 0, width: 800, height: 600 };
    const layout = computeLayout(win, vp);
    expect(layout.get("t1" as any)?.width).toBe(800);
    expect(layout.get("t1" as any)?.height).toBe(600);
    expect(layout.get("t1" as any)?.x).toBe(0);
    expect(layout.get("t1" as any)?.y).toBe(0);
  });

  test("custom position negative coords clamped to 0", () => {
    const overlay = makeOverlay({ x: -100, y: -50 }, 300, 200);
    const win = makeWindow(makeGrid([]), [overlay]);
    const vp = { x: 0, y: 0, width: 800, height: 600 };
    const layout = computeLayout(win, vp);
    expect(layout.get("t1" as any)?.x).toBe(0);
    expect(layout.get("t1" as any)?.y).toBe(0);
  });

  test("combined grid and overlay tabs", () => {
    const grid = makeGrid([{ tabId: "t1", position: { row: 0, col: 0 } }]);
    // Use a different tab ID for overlay
    const overlayTab = types.createTab("overlay-tab", "video", "YouTube");
    const overlay = {
      ...types.createOverlayData("o1", overlayTab, "bottom-right"),
      width: 400,
      height: 300,
    };
    const win = makeWindow(grid, [overlay]);
    const vp = { x: 0, y: 0, width: 1280, height: 800 };

    const layout = computeLayout(win, vp);
    expect(layout.size).toBe(2);
    expect(layout.has("t1" as any)).toBe(true);
    expect(layout.has("overlay-tab" as any)).toBe(true);
  });
});

// ─── distributeSpace (pure function) ───────────────────────────────────────

describe("distributeSpace (unit)", () => {
  test("count <= 0 returns empty array", () => {
    expect(distributeSpace(800, 0, [])).toEqual([]);
    expect(distributeSpace(800, -1, [])).toEqual([]);
    expect(distributeSpace(800, -5, [])).toEqual([]);
  });

  test("count === 1 returns full total", () => {
    expect(distributeSpace(800, 1, [])).toEqual([800]);
  });

  test("equal distribution when count > 1 with no ratios", () => {
    expect(distributeSpace(1000, 2, [])).toEqual([500, 500]);
    const three = distributeSpace(1000, 3, []);
    expect(three).toHaveLength(3);
    expect(three[0]).toBeCloseTo(333.333, 2);
    expect(three[1]).toBeCloseTo(333.333, 2);
    expect(three[2]).toBeCloseTo(333.333, 2);
  });

  test("ratio-based distribution", () => {
    const result = distributeSpace(800, 2, [0.25]);
    expect(result[0]).toBeCloseTo(200);
  });

  test("ratio fallback when fractions length != count", () => {
    const result = distributeSpace(800, 3, [0.5]);
    expect(result).toHaveLength(3);
    expect(result[0]).toBeCloseTo(266.667, 1);
  });

  test("ratio fallback when a fraction is <= 0", () => {
    const result = distributeSpace(800, 2, [-0.1]);
    expect(result).toEqual([400, 400]);
  });

  test("zero divider triggers fallback", () => {
    const result = distributeSpace(800, 2, [0]);
    expect(result).toEqual([400, 400]);
  });

  test("sum of results equals total (within rounding)", () => {
    for (let total = 100; total <= 2000; total += 150) {
      for (let count = 1; count <= 6; count++) {
        const result = distributeSpace(total, count, []);
        expect(result).toHaveLength(count);
        const sum = result.reduce((a, b) => a + b, 0);
        expect(Math.abs(sum - total)).toBeLessThanOrEqual(count);
      }
    }
  });

  test("all results are non-negative", () => {
    for (let total = 50; total <= 500; total += 50) {
      for (let count = 0; count <= 5; count++) {
        const result = distributeSpace(total, count, []);
        for (const v of result) {
          expect(v).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });

  test("without ratios, distribution is approximately equal", () => {
    const total = 1000;
    for (let count = 2; count <= 8; count++) {
      const result = distributeSpace(total, count, []);
      expect(result).toHaveLength(count);
      for (let i = 1; i < result.length; i++) {
        expect(Math.abs(result[i] - result[0])).toBeLessThanOrEqual(1);
      }
    }
  });

  test("ratio-based distribution preserves total", () => {
    for (let total = 200; total <= 1000; total += 200) {
      const ratios = [0.3, 0.7];
      const result = distributeSpace(total, 2, ratios);
      expect(result).toHaveLength(2);
      const sum = result.reduce((a, b) => a + b, 0);
      expect(Math.abs(sum - total)).toBeLessThanOrEqual(1);
    }
  });

  test("zero total returns zeros", () => {
    for (let count = 0; count <= 5; count++) {
      const result = distributeSpace(0, count, []);
      expect(result).toHaveLength(count > 0 ? count : 0);
      for (const v of result) {
        expect(v).toBe(0);
      }
    }
  });
});

// ─── Property-style invariants for computeLayout ─────────────────────────

describe("computeLayout (property invariants)", () => {
  test("grid tab rects stay within viewport bounds", () => {
    const viewports = [
      { x: 0, y: 0, width: 1280, height: 800 },
      { x: 0, y: 0, width: 800, height: 600 },
      { x: 0, y: 0, width: 1920, height: 1080 },
      { x: 0, y: 0, width: 1024, height: 768 },
    ];

    for (const vp of viewports) {
      for (let cols = 1; cols <= 4; cols++) {
        for (let rows = 1; rows <= 3; rows++) {
          const grid = makeGrid(
            Array.from({ length: cols * rows }, (_, i) => ({
              tabId: `t${i}`,
              position: { row: Math.floor(i / cols), col: i % cols },
            })),
            undefined,
            rows,
            cols,
          );
          const win = makeWindow(grid, [], vp.width, vp.height);

          const layout = computeLayout(win, vp);
          expect(layout.size).toBe(cols * rows);

          for (const [, rect] of layout) {
            expect(rect.x).toBeGreaterThanOrEqual(0);
            expect(rect.y).toBeGreaterThanOrEqual(0);
            expect(rect.width).toBeGreaterThan(0);
            expect(rect.height).toBeGreaterThan(0);
            expect(rect.x + rect.width).toBeLessThanOrEqual(vp.width);
            expect(rect.y + rect.height).toBeLessThanOrEqual(vp.height);
          }
        }
      }
    }
  });

  test("no two grid tab rects overlap", () => {
    const vp = { x: 0, y: 0, width: 1280, height: 800 };
    const configs = [
      [2, 2],
      [2, 3],
      [3, 2],
      [3, 3],
    ];

    for (const [rows, cols] of configs) {
      const grid = makeGrid(
        Array.from({ length: rows * cols }, (_, i) => ({
          tabId: `t${i}`,
          position: { row: Math.floor(i / cols), col: i % cols },
        })),
        undefined,
        rows,
        cols,
      );
      const win = makeWindow(grid, [], vp.width, vp.height);

      const layout = computeLayout(win, vp);
      const rects = Array.from(layout.values());

      for (let i = 0; i < rects.length; i++) {
        for (let j = i + 1; j < rects.length; j++) {
          const a = rects[i],
            b = rects[j];
          const noOverlap =
            a.x + a.width <= b.x ||
            b.x + b.width <= a.x ||
            a.y + a.height <= b.y ||
            b.y + b.height <= a.y;
          expect(noOverlap).toBe(true);
        }
      }
    }
  });
});
