// @vitest-environment node
/**
 * Integration tests for computeLayout — given a window + viewport,
 * computeLayout() produces correct pixel rects for all placements and overlays.
 *
 * These tests exercise the real computeLayout function from
 * @openp41ge/layout/compute-layout with realistic window and grid states.
 */

import { describe, it, expect } from "vitest";
import * as types from "@openp41ge/layout/types";
import * as ops from "@openp41ge/layout/operations";
import { computeLayout, distributeSpace } from "@openp41ge/layout/compute-layout";

// ─── Helpers ──────────────────────────────────────────────────────────────

function makeGrid(placements: Array<{ tabId: string; col: number }>, cols = 1, rows = 1) {
  const grid = types.createGrid("g1", rows, cols);
  grid.placements = placements.map((p) => ({
    tabIds: [p.tabId as types.TabId],
    position: { row: 0, col: p.col },
    span: { rowSpan: 1, colSpan: 1 },
  }));
  return grid;
}

function makeWindow(grid: types.Grid, overlays: types.Overlay[] = []): types.Window {
  return {
    id: "w1",
    bounds: { x: 0, y: 0, width: 1280, height: 800 },
    monitor: 0,
    grid,
    sidebar: { activeViewId: null, width: 280 },
    repoRefs: [],
    overlays,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────

describe("computeLayout — integration", () => {
  describe("Grid layout computation", () => {
    it("computes full-window rect for single tab in 1×1 grid", () => {
      const grid = makeGrid([{ tabId: "t1", col: 0 }]);
      const win = makeWindow(grid);
      const viewport = { x: 0, y: 0, width: 1280, height: 800 };

      const layout = computeLayout(win, viewport);
      expect(layout.size).toBe(1);

      const rect = layout.get("t1" as types.TabId);
      expect(rect).toEqual({ x: 0, y: 0, width: 1280, height: 800 });
    });

    it("computes equal-width rects for two columns", () => {
      const grid = makeGrid(
        [
          { tabId: "t1", col: 0 },
          { tabId: "t2", col: 1 },
        ],
        2,
      );
      const win = makeWindow(grid);
      const viewport = { x: 0, y: 0, width: 1000, height: 800 };

      const layout = computeLayout(win, viewport);
      expect(layout.size).toBe(2);

      const r1 = layout.get("t1" as types.TabId);
      const r2 = layout.get("t2" as types.TabId);
      expect(r1).toEqual({ x: 0, y: 0, width: 500, height: 800 });
      expect(r2).toEqual({ x: 500, y: 0, width: 500, height: 800 });
    });

    it("computes equal-height rects for two rows", () => {
      const grid = makeGrid(
        [
          { tabId: "t1", col: 0 },
          { tabId: "t2", col: 0 },
        ],
        1,
        2,
      );
      // Manually set second placement to row 1
      grid.placements[1] = {
        tabIds: ["t2" as types.TabId],
        position: { row: 1, col: 0 },
        span: { rowSpan: 1, colSpan: 1 },
      };

      const win = makeWindow(grid);
      const viewport = { x: 0, y: 0, width: 1000, height: 600 };

      const layout = computeLayout(win, viewport);
      expect(layout.size).toBe(2);

      const r1 = layout.get("t1" as types.TabId);
      const r2 = layout.get("t2" as types.TabId);
      expect(r1).toEqual({ x: 0, y: 0, width: 1000, height: 300 });
      expect(r2).toEqual({ x: 0, y: 300, width: 1000, height: 300 });
    });

    it("computes rects for 2×2 grid (4 cells)", () => {
      const grid = makeGrid(
        [
          { tabId: "t1", col: 0 },
          { tabId: "t2", col: 1 },
          { tabId: "t3", col: 0 },
          { tabId: "t4", col: 1 },
        ],
        2,
        2,
      );
      grid.placements[2] = {
        tabIds: ["t3" as types.TabId],
        position: { row: 1, col: 0 },
        span: { rowSpan: 1, colSpan: 1 },
      };
      grid.placements[3] = {
        tabIds: ["t4" as types.TabId],
        position: { row: 1, col: 1 },
        span: { rowSpan: 1, colSpan: 1 },
      };

      const win = makeWindow(grid);
      const viewport = { x: 0, y: 0, width: 800, height: 800 };

      const layout = computeLayout(win, viewport);
      expect(layout.size).toBe(4);

      expect(layout.get("t1" as types.TabId)).toEqual({ x: 0, y: 0, width: 400, height: 400 });
      expect(layout.get("t2" as types.TabId)).toEqual({ x: 400, y: 0, width: 400, height: 400 });
      expect(layout.get("t3" as types.TabId)).toEqual({ x: 0, y: 400, width: 400, height: 400 });
      expect(layout.get("t4" as types.TabId)).toEqual({ x: 400, y: 400, width: 400, height: 400 });
    });
  });

  describe("Layout with non-default viewport offset", () => {
    it("computes rects with viewport offset", () => {
      const grid = makeGrid([{ tabId: "t1", col: 0 }]);
      const win = makeWindow(grid);
      const viewport = { x: 100, y: 50, width: 800, height: 600 };

      const layout = computeLayout(win, viewport);
      const rect = layout.get("t1" as types.TabId);
      expect(rect).toEqual({ x: 100, y: 50, width: 800, height: 600 });
    });

    it("computes multi-column rects with viewport offset", () => {
      const grid = makeGrid(
        [
          { tabId: "t1", col: 0 },
          { tabId: "t2", col: 1 },
        ],
        2,
      );
      const win = makeWindow(grid);
      const viewport = { x: 100, y: 100, width: 800, height: 600 };

      const layout = computeLayout(win, viewport);
      expect(layout.get("t1" as types.TabId)).toEqual({ x: 100, y: 100, width: 400, height: 600 });
      expect(layout.get("t2" as types.TabId)).toEqual({ x: 500, y: 100, width: 400, height: 600 });
    });
  });

  describe("Layout with overlays", () => {
    it("includes overlay positions in the layout", () => {
      const grid = makeGrid([{ tabId: "t1", col: 0 }]);
      const oTab = types.createTab("o1", "video", "Video");
      const overlay = types.createOverlayData("ov1", oTab, "bottom-right");

      const win = makeWindow(grid, [overlay]);
      const viewport = { x: 0, y: 0, width: 1280, height: 800 };

      const layout = computeLayout(win, viewport);
      // Should have both the grid tab and the overlay
      expect(layout.size).toBe(2);

      const oRect = layout.get("o1" as types.TabId);
      expect(oRect).toEqual({ x: 880, y: 500, width: 400, height: 300 });
    });

    it("includes overlay at custom position", () => {
      const grid = makeGrid([]);
      const oTab = types.createTab("o1", "notes", "Notes");
      const overlay = types.createOverlayData("ov2", oTab);
      (overlay as any).position = { x: 50, y: 50 };

      const win = makeWindow(grid, [overlay]);
      const viewport = { x: 0, y: 0, width: 1280, height: 800 };

      const layout = computeLayout(win, viewport);
      const oRect = layout.get("o1" as types.TabId);
      expect(oRect).toEqual({ x: 50, y: 50, width: 400, height: 300 });
    });

    it("clamps overlay custom position to viewport", () => {
      const grid = makeGrid([]);
      const oTab = types.createTab("o1", "notes", "Notes");
      const overlay = types.createOverlayData("ov3", oTab);
      (overlay as any).position = { x: 2000, y: 2000 }; // Out of bounds

      const win = makeWindow(grid, [overlay]);
      const viewport = { x: 0, y: 0, width: 1280, height: 800 };

      const layout = computeLayout(win, viewport);
      const oRect = layout.get("o1" as types.TabId);

      // Width is 400, height is 300 — clamped to fit viewport
      expect(oRect!.x).toBe(1280 - 400);
      expect(oRect!.y).toBe(800 - 300);
    });

    it("includes all overlay positions (top-left, top-right, bottom-left, center)", () => {
      const grid = makeGrid([]);
      const viewport = { x: 0, y: 0, width: 1000, height: 800 };

      const positions: Array<{ pos: types.OverlayPosition; expectedX: number; expectedY: number }> =
        [
          { pos: "top-left", expectedX: 0, expectedY: 0 },
          { pos: "top-right", expectedX: 600, expectedY: 0 },
          { pos: "bottom-left", expectedX: 0, expectedY: 500 },
          { pos: "center", expectedX: 300, expectedY: 250 },
        ];

      for (const { pos, expectedX, expectedY } of positions) {
        const name = `o-${pos}`;
        const oTab = types.createTab(name, "video", "Video");
        const overlay = types.createOverlayData(name, oTab, pos);
        const win = makeWindow(grid, [overlay]);

        const layout = computeLayout(win, viewport);
        const rect = layout.get(name as types.TabId);
        expect(rect).toEqual({ x: expectedX, y: expectedY, width: 400, height: 300 });
      }
    });
  });

  describe("Layout with mixed grid + overlays", () => {
    it("computes layout for grid tabs and overlays together", () => {
      const grid = makeGrid(
        [
          { tabId: "t1", col: 0 },
          { tabId: "t2", col: 1 },
        ],
        2,
      );
      const oTab = types.createTab("o1", "notes", "Notes");
      const overlay = types.createOverlayData("ov1", oTab, "bottom-right");

      const win = makeWindow(grid, [overlay]);
      const viewport = { x: 0, y: 0, width: 1000, height: 800 };

      const layout = computeLayout(win, viewport);
      expect(layout.size).toBe(3);

      expect(layout.get("t1" as types.TabId)).toBeDefined();
      expect(layout.get("t2" as types.TabId)).toBeDefined();
      expect(layout.get("o1" as types.TabId)).toBeDefined();
    });
  });

  describe("Empty grid", () => {
    it("returns empty Map for window with no placements", () => {
      const grid = makeGrid([]);
      const win = makeWindow(grid);
      const viewport = { x: 0, y: 0, width: 1280, height: 800 };

      const layout = computeLayout(win, viewport);
      expect(layout.size).toBe(0);
    });

    it("returns only overlay rects when grid is empty but overlays exist", () => {
      const grid = makeGrid([]);
      const oTab = types.createTab("o1", "video", "Video");
      const overlay = types.createOverlayData("ov1", oTab, "center");
      const win = makeWindow(grid, [overlay]);
      const viewport = { x: 0, y: 0, width: 1000, height: 800 };

      const layout = computeLayout(win, viewport);
      expect(layout.size).toBe(1);
      expect(layout.get("o1" as types.TabId)).toBeDefined();
    });
  });

  describe("distributeSpace unit within integration", () => {
    it("returns single-element array for count=1", () => {
      expect(distributeSpace(1000, 1, [])).toEqual([1000]);
    });

    it("returns equal widths when ratios are empty", () => {
      const spaces = distributeSpace(1000, 2, []);
      expect(spaces).toEqual([500, 500]);
    });

    it("returns equal widths for negative or zero fractions (fallback to equal distribution)", () => {
      const spaces = distributeSpace(1000, 3, [1, 0]);
      // Ratios {1, 0} produce fractions: [1-0=1, 0-1=-1, 1-0=1] → has negative → fallback to equal
      // Equal distribution: 1000/3 ≈ 333.33 each, with Math.round applied individually
      expect(spaces).toEqual([333.3333333333333, 333.3333333333333, 333.3333333333333]);
    });

    it("distributes space according to ratios", () => {
      const spaces = distributeSpace(1000, 3, [0.2, 0.5]);
      // fractions: [0.2, 0.3, 0.5]
      expect(spaces).toEqual([200, 300, 500]);
    });
  });
});
