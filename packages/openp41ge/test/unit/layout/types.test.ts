/**
 * Unit tests for types.ts — factory functions and schema parsing.
 */

import {
  createTab,
  createGrid,
  createWindow,
  createWorkspace,
  createOverlayData,
  activeTabInCell,
  setActiveTabInCell,
  TabId,
  WorkspaceId,
  WindowId,
  OverlayId,
} from "@openp41ge/layout/types";

// ─── Tab ──────────────────────────────────────────────────────────────────

describe("createTab (unit)", () => {
  test("creates a tab with id, appType, title", () => {
    const tab = createTab("p1", "terminal", "Terminal");
    expect(tab.id).toBe("p1");
    expect(tab.appType).toBe("terminal");
    expect(tab.title).toBe("Terminal");
    expect(tab.config).toEqual({});
  });

  test("accepts optional config", () => {
    const config = { cwd: "/home", shell: "/bin/zsh" };
    const tab = createTab("p2", "terminal", "Shell", config);
    expect(tab.config).toEqual(config);
  });

  test("defaults config to empty object when omitted", () => {
    const tab = createTab("p3", "markdown", "Notes");
    expect(tab.config).toEqual({});
  });

  test("accepts empty config object", () => {
    const tab = createTab("p4", "video", "Stream", {});
    expect(tab.config).toEqual({});
  });

  test("handles all app type values", () => {
    const types = ["terminal", "file-explorer", "markdown", "table", "video"];
    for (const t of types) {
      const tab = createTab(`p-${t}`, t, t);
      expect(tab.appType).toBe(t);
      expect(tab.id).toBe(`p-${t}`);
    }
  });
});

// ─── Grid ─────────────────────────────────────────────────────────────────

describe("createGrid (unit)", () => {
  test("creates a grid with given rows and cols", () => {
    const grid = createGrid("g1", 2, 3);
    expect(grid.id).toBe("g1");
    expect(grid.rows).toBe(2);
    expect(grid.cols).toBe(3);
    expect(grid.placements).toEqual([]);
    expect(grid.dividers.columns).toHaveLength(2); // cols - 1
    expect(grid.dividers.rows).toHaveLength(1); // rows - 1
  });

  test("creates a 1×1 grid with no dividers", () => {
    const grid = createGrid("g2");
    expect(grid.rows).toBe(1);
    expect(grid.cols).toBe(1);
    expect(grid.dividers.columns).toEqual([]);
    expect(grid.dividers.rows).toEqual([]);
  });

  test("creates a 1×5 grid with 4 column dividers", () => {
    const grid = createGrid("g3", 1, 5);
    expect(grid.dividers.columns).toHaveLength(4);
    expect(grid.dividers.rows).toHaveLength(0);
    for (const d of grid.dividers.columns) {
      expect(d).toBe(0.5);
    }
  });

  test("creates a 5×1 grid with 4 row dividers", () => {
    const grid = createGrid("g4", 5, 1);
    expect(grid.dividers.columns).toHaveLength(0);
    expect(grid.dividers.rows).toHaveLength(4);
    for (const d of grid.dividers.rows) {
      expect(d).toBe(0.5);
    }
  });

  test("defaults to 1×1 when no dimensions given", () => {
    const grid = createGrid("g5");
    expect(grid.rows).toBe(1);
    expect(grid.cols).toBe(1);
  });
});

// ─── Window ───────────────────────────────────────────────────────────────

describe("createWindow (unit)", () => {
  test("creates a window with a grid and sidebar", () => {
    const win = createWindow("w1");
    expect(win.id).toBe("w1");
    expect(win.grid).toBeDefined();
    expect(win.grid.rows).toBe(1);
    expect(win.grid.cols).toBe(1);
    expect(win.sidebar).toBeDefined();
    expect(win.sidebar.activeViewId).toBeNull();
    expect(win.overlays).toEqual([]);
  });

  test("accepts custom bounds", () => {
    const bounds = { x: 100, y: 50, width: 800, height: 600 };
    const win = createWindow("w2", bounds);
    expect(win.bounds).toEqual(bounds);
  });

  test("defaults bounds to 1280×800", () => {
    const win = createWindow("w3");
    expect(win.bounds).toEqual({ x: 0, y: 0, width: 1280, height: 800 });
  });

  test("accepts monitor index", () => {
    const win = createWindow("w4", undefined, 1);
    expect(win.monitor).toBe(1);
  });

  test("defaults monitor to 0", () => {
    const win = createWindow("w5");
    expect(win.monitor).toBe(0);
  });
});

// ─── Workspace ────────────────────────────────────────────────────────────

describe("createWorkspace (unit)", () => {
  test("creates a workspace with one window and no tabs", () => {
    const ws = createWorkspace("ws1");
    expect(ws.id).toBe("ws1");
    expect(ws.windows).toHaveLength(1);
    expect(ws.windows[0].grid).toBeDefined();
    expect(ws.windows[0].sidebar).toBeDefined();
    expect(ws.editorTabs).toEqual({});
  });

  test("workspace ID follows pattern", () => {
    const ws = createWorkspace("my-workspace");
    expect(ws.id).toBe("my-workspace");
  });

  test("window in new workspace has generated ID", () => {
    const ws = createWorkspace("test");
    expect(ws.windows[0].id).toBe("win-test-0");
  });
});

// ─── Overlay Data ─────────────────────────────────────────────────────────

describe("createOverlayData (unit)", () => {
  test("creates overlay data with default position", () => {
    const tab = createTab("p1", "video", "YouTube");
    const overlay = createOverlayData("o1", tab);
    expect(overlay.id).toBe("o1");
    expect(overlay.tab).toStrictEqual(tab);
    expect(overlay.position).toBe("bottom-right");
    expect(overlay.width).toBe(400);
    expect(overlay.height).toBe(300);
    expect(overlay.opacity).toBe(0.95);
    expect(overlay.zIndex).toBe(100);
  });

  test("accepts custom position", () => {
    const tab = createTab("p2", "notes", "Notes");
    const overlay = createOverlayData("o2", tab, "top-left");
    expect(overlay.position).toBe("top-left");
  });

  test("accepts all position presets", () => {
    const tab = createTab("p3", "video", "Vid");
    const positions = ["top-left", "top-right", "bottom-left", "bottom-right", "center"] as const;
    for (const pos of positions) {
      const overlay = createOverlayData("o", tab, pos);
      expect(overlay.position).toBe(pos);
    }
  });

  test("accepts custom coordinate position", () => {
    const tab = createTab("p4", "notes", "Notes");
    const overlay = createOverlayData("o4", tab, { x: 150, y: 75 });
    expect(overlay.position).toEqual({ x: 150, y: 75 });
  });
});

// ─── activeTabInCell ─────────────────────────────────────────────────────

describe("activeTabInCell", () => {
  test("returns the first tab ID", () => {
    const placement: any = { tabIds: ["tab-a", "tab-b"] };
    expect(activeTabInCell(placement)).toBe("tab-a");
  });

  test("works with a single tab", () => {
    const placement: any = { tabIds: ["tab-only"] };
    expect(activeTabInCell(placement)).toBe("tab-only");
  });
});

// ─── setActiveTabInCell ──────────────────────────────────────────────────

describe("setActiveTabInCell", () => {
  test("moves the specified tab to index 0", () => {
    const placement: any = { tabIds: ["tab-a", "tab-b", "tab-c"] };
    const result = setActiveTabInCell(placement, "tab-c");
    expect(result.tabIds[0]).toBe("tab-c");
    expect(result.tabIds).toContain("tab-a");
    expect(result.tabIds).toContain("tab-b");
    expect(result.tabIds).toHaveLength(3);
  });

  test("returns a new object (immutable)", () => {
    const placement: any = { tabIds: ["p1", "p2"] };
    const result = setActiveTabInCell(placement, "p2");
    expect(result).not.toBe(placement);
    expect(result.tabIds).not.toBe(placement.tabIds);
  });

  test("works when specified tab is already active", () => {
    const placement: any = { tabIds: ["p1", "p2"] };
    const result = setActiveTabInCell(placement, "p1");
    expect(result.tabIds[0]).toBe("p1");
    expect(result.tabIds).toHaveLength(2);
  });
});

// ─── ID Brand Types ───────────────────────────────────────────────────────

describe("ID brand types (unit)", () => {
  test("ID schemas parse branded strings", () => {
    expect(TabId.parse("tab-1")).toBe("tab-1");
    expect(WorkspaceId.parse("ws1")).toBe("ws1");
    expect(WindowId.parse("win-1")).toBe("win-1");
    expect(TabId.parse("tab-1")).toBe("tab-1");
    expect(OverlayId.parse("overlay-1")).toBe("overlay-1");
  });
});
