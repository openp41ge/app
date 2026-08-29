/**
 * Unit tests for GridDropTarget file-drag handling (openp41ge-tabs).
 *
 * Verifies that dropping a file source on the grid fires the grid-open-tab
 * CustomEvent with the correct detail shape (winId, tabConfig, targetCol,
 * split info), which Openp41geTabsEventHandler translates into the
 * actionOpenFile / splitFileOpen workspace commands.
 */

import { describe, test, expect } from "vitest";
import { GridDropTarget } from "openp41ge-tabs/targets/grid-drop-target";
import type { IDragSource } from "openp41ge-tabs/interfaces";

// ─── Test helpers ─────────────────────────────────────────────────────────

interface FakeGrid extends HTMLElement {
  winId: string;
  pageData: {
    id: string;
    grid: {
      cols: number;
      placements: Array<{ position: { row: number; col: number }; tabIds: string[] }>;
    };
  };
  getBoundingClientRect(): DOMRect;
}

function makeGrid(cols: number, width = 800, winId = "win-1", seedTabs = true): FakeGrid {
  const grid = document.createElement("div") as FakeGrid;
  grid.winId = winId;
  grid.pageData = {
    id: winId,
    grid: {
      cols,
      placements: Array.from({ length: cols }, (_, col) => ({
        position: { row: 0, col },
        // A populated grid carries a tab per column (realistic); an empty grid
        // (seedTabs=false) has none and must not be splittable.
        tabIds: seedTabs ? [`tab-${col}`] : [],
      })),
    },
  };
  const rect = {
    left: 0,
    top: 0,
    right: width,
    bottom: 400,
    width,
    height: 400,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect;
  grid.getBoundingClientRect = () => rect;
  return grid;
}

function fileSource(filePath: string): IDragSource {
  return {
    type: "file",
    createGhost() {
      return document.createElement("div");
    },
    getDragData() {
      return { type: "file", filePath };
    },
    onDragStart() {},
    onDragEnd() {},
  } as IDragSource;
}

async function captureDrop(grid: FakeGrid, relX: number): Promise<Record<string, unknown> | null> {
  let detail: Record<string, unknown> | null = null;
  const listener = (e: Event) => {
    detail = (e as CustomEvent).detail as Record<string, unknown>;
  };
  grid.addEventListener("grid-open-tab", listener);
  const target = new GridDropTarget(grid, grid.winId);
  const result = await target.onDrop(fileSource("/repo/app.ts"), relX, 200);
  grid.removeEventListener("grid-open-tab", listener);
  if (!result.success) throw new Error(`drop failed: ${JSON.stringify(result)}`);
  return detail;
}

// ─── Tests ────────────────────────────────────────────────────────────────

describe("GridDropTarget file drops", () => {
  test("cell-center drop fires grid-open-tab with winId, file config, and target column", async () => {
    const grid = makeGrid(2);
    // relX = 200 → fraction 0.25, inside column 0 (not a boundary)
    const detail = await captureDrop(grid, 200);

    expect(detail).not.toBeNull();
    expect(detail!.winId).toBe("win-1");
    expect(detail!.tabType).toBe("file-viewer");
    expect(detail!.tabConfig).toEqual({ filePath: "/repo/app.ts" });
    expect(detail!.targetCol).toBe(0);
  });

  test("boundary drop fires grid-open-tab with split info (left edge of a multi-col grid)", async () => {
    const grid = makeGrid(2);
    // relX = 30 → fraction 0.0375 < 0.15 → left boundary (index 0)
    const detail = await captureDrop(grid, 30);

    expect(detail).not.toBeNull();
    expect(detail!.winId).toBe("win-1");
    expect(detail!.tabType).toBe("file-viewer");
    expect(detail!.isBoundary).toBe(true);
    expect(detail!.splitCol).toBe(0);
    expect(detail!.splitLeft).toBe(true);
    expect(detail!.pinned).toBe(true);
  });

  test("empty grid: hover at the right edge shows a cell highlight, never a split ghost", () => {
    const grid = makeGrid(1, 800, "win-1", false);
    const target = new GridDropTarget(grid, grid.winId);
    const feedback = target.onHover(fileSource("/a.ts"), 780, 200);

    expect(feedback).not.toBeNull();
    expect(feedback!.showGhost).toBe(true);
    // No split preview on an empty grid — nothing exists to split against
    expect(feedback!.ghostConfig?.type).toBe("cell-highlight");
    expect(feedback!.ghostConfig?.col).toBe(0);
  });

  test("empty grid: file drop on the right boundary opens in col 0 without splitting", async () => {
    const grid = makeGrid(1, 800, "win-1", false);
    // relX = 780 → far right boundary of the single column
    const detail = await captureDrop(grid, 780);

    expect(detail).not.toBeNull();
    expect(detail!.isBoundary).toBeUndefined();
    expect(detail!.targetCol).toBe(0);
  });

  test("boundary drop on the right edge splits to the last column", async () => {
    const grid = makeGrid(2);
    // relX = 780 → fraction 0.975 > 0.85 → right boundary (index cols)
    const detail = await captureDrop(grid, 780);

    expect(detail).not.toBeNull();
    expect(detail!.winId).toBe("win-1");
    expect(detail!.isBoundary).toBe(true);
    expect(detail!.splitCol).toBe(1);
    expect(detail!.splitLeft).toBe(false);
  });
});

// ─── open-tab (git-entry) drops ───────────────────────────────────────────

function openTabSource(config: { repoName: string; branch?: string }): IDragSource {
  const { repoName, branch } = config;
  return {
    type: "open-tab",
    createGhost() {
      return document.createElement("div");
    },
    getDragData() {
      return {
        type: "open-tab",
        appType: "git-repository",
        title: branch ?? repoName,
        tabConfig: branch ? { repoName, branch } : { repoName },
      };
    },
    onDragStart() {},
    onDragEnd() {},
  } as IDragSource;
}

async function captureOpenTabDrop(
  grid: FakeGrid,
  relX: number,
  config: { repoName: string; branch?: string },
): Promise<Record<string, unknown> | null> {
  let detail: Record<string, unknown> | null = null;
  const listener = (e: Event) => {
    detail = (e as CustomEvent).detail as Record<string, unknown>;
  };
  grid.addEventListener("grid-open-tab", listener);
  const target = new GridDropTarget(grid, grid.winId);
  const result = await target.onDrop(openTabSource(config), relX, 200);
  grid.removeEventListener("grid-open-tab", listener);
  if (!result.success) throw new Error(`drop failed: ${JSON.stringify(result)}`);
  return detail;
}

describe("GridDropTarget open-tab (git-entry) drops", () => {
  test.each([
    { name: "repo row, cell-center", relX: 200, config: { repoName: "acme" }, branch: false },
    {
      name: "worktree row, cell-center",
      relX: 200,
      config: { repoName: "acme", branch: "main" },
      branch: true,
    },
  ])(
    "$name fires grid-open-tab with tabType/tabConfig/targetCol",
    async ({ relX, config, branch }) => {
      const grid = makeGrid(2);
      const detail = await captureOpenTabDrop(grid, relX, config);

      expect(detail).not.toBeNull();
      expect(detail!.winId).toBe("win-1");
      expect(detail!.tabType).toBe("git-repository");
      expect(detail!.tabConfig).toEqual(
        branch ? { repoName: "acme", branch: "main" } : { repoName: "acme" },
      );
      expect(detail!.targetCol).toBe(0);
      expect(detail!.pinned).toBe(true);
      expect(detail!.isBoundary).toBeUndefined();
    },
  );

  test("repo row boundary drop fires grid-open-tab with split info", async () => {
    const grid = makeGrid(2);
    // Left-edge boundary (fraction 0.0375 < 0.15)
    const detail = await captureOpenTabDrop(grid, 30, { repoName: "acme" });

    expect(detail).not.toBeNull();
    expect(detail!.tabType).toBe("git-repository");
    expect(detail!.tabConfig).toEqual({ repoName: "acme" });
    expect(detail!.isBoundary).toBe(true);
    expect(detail!.splitCol).toBe(0);
    expect(detail!.splitLeft).toBe(true);
    expect(detail!.pinned).toBe(true);
  });
});
