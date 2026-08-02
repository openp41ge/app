// @ts-nocheck
/**
 * Unit tests for layout operations — pure functions transforming workspace state.
 *
 * Tests are organized by operation with simple setup helpers.
 */

import * as types from "@openp41ge/layout/types";
import * as ops from "@openp41ge/layout/operations";

// ─── Helpers ──────────────────────────────────────────────────────────────

function addDefaultSidebarTabs(ws: any) {
  const winId = ws.windows[0].id;
  ws = ops.openSystemTab(ws, winId, "right", "explorer", "Explorer", true);
  ws = ops.openSystemTab(ws, winId, "right", "git", "Git", true);
  return ws;
}

/** Create a workspace with one window and one tab "p1" (terminal) at (0,0). */
function makeWs() {
  const ws = addDefaultSidebarTabs(types.createWorkspace("ws1"));
  const winId = ws.windows[0].id;
  const tab = types.createTab("p1", "terminal", "Terminal");
  return ops.addTabToCell(ws, winId, tab, 0, 0);
}

function makeWsId(): string {
  return makeWs().windows[0].id;
}

function makeWinGrid(ws?: any, winId?: string) {
  ws = ws ?? addDefaultSidebarTabs(types.createWorkspace("ws1"));
  winId = winId ?? ws.windows[0].id;
  return ws.windows.find((w) => w.id === winId)!.grid;
}

// ─── Tab Management ───────────────────────────────────────────────────────

describe("registerTab", () => {
  test("adds a tab to the workspace registry", () => {
    const ws = types.createWorkspace("ws1");
    const tab = types.createTab("p1", "terminal", "Test");

    const result = ops.registerTab(ws, tab);
    expect(result.editorTabs["p1"]).toBeDefined();
    expect(result.editorTabs["p1"].title).toBe("Test");
  });

  test("preserves existing tabs when adding a new one", () => {
    const ws = types.createWorkspace("ws1");
    const t1 = types.createTab("p1", "terminal", "Existing");
    let r = ops.registerTab(ws, t1);
    const t2 = types.createTab("p2", "markdown", "New");

    r = ops.registerTab(r, t2);
    expect(r.editorTabs["p1"]).toBeDefined();
    expect(r.editorTabs["p2"]).toBeDefined();
  });
});

describe("addTabToCell", () => {
  test("adds a tab to an empty cell", () => {
    const ws = types.createWorkspace("ws1");
    const winId = ws.windows[0].id;
    const tab = types.createTab("p1", "terminal", "Test");

    const result = ops.addTabToCell(ws, winId, tab, 0, 0);

    const grid = result.windows[0].grid;
    expect(grid.placements).toHaveLength(1);
    expect(grid.placements[0].position).toEqual({ row: 0, col: 0 });
  });

  test("auto-registers tab if not already in workspace", () => {
    const ws = types.createWorkspace("ws1");
    const winId = ws.windows[0].id;
    const tab = types.createTab("unregistered", "terminal", "Test");

    const result = ops.addTabToCell(ws, winId, tab, 0, 0);

    expect(result.editorTabs["unregistered"]).toBeDefined();
  });

  test("adds tab to occupied cell (multiple tabs in one cell)", () => {
    const ws = types.createWorkspace("ws1");
    const winId = ws.windows[0].id;

    const t1 = types.createTab("p1", "terminal", "One");
    let r = ops.addTabToCell(ws, winId, t1, 0, 0);
    const t2 = types.createTab("p2", "markdown", "Two");
    const result = ops.addTabToCell(r, winId, t2, 0, 0);

    expect(result.windows[0].grid.placements).toHaveLength(1);
    expect(result.windows[0].grid.placements[0].tabIds).toEqual(["p1", "p2"]);
  });
});

describe("removeTabFromCell", () => {
  test("removes a tab from the grid", () => {
    const ws = makeWs();
    const winId = makeWsId();

    const result = ops.removeTabFromCell(ws, winId, "p1");
    expect(result.windows[0].grid.placements).toHaveLength(0);
  });

  test("does nothing when tab does not exist", () => {
    const ws = makeWs();
    const winId = makeWsId();

    const result = ops.removeTabFromCell(ws, winId, "non-existent");
    expect(result).toStrictEqual(ws);
  });

  test("compacts columns when a column becomes empty (middle column)", () => {
    const ws = types.createWorkspace("ws1");
    const winId = ws.windows[0].id;
    let r = ops.resizeGrid(ws, winId, 1, 3);

    const p1 = types.createTab("p1", "terminal", "One");
    const p2 = types.createTab("p2", "markdown", "Two");
    const p3 = types.createTab("p3", "video", "Three");

    r = ops.addTabToCell(r, winId, p1, 0, 0);
    r = ops.addTabToCell(r, winId, p2, 0, 1);
    r = ops.addTabToCell(r, winId, p3, 0, 2);

    const result = ops.removeTabFromCell(r, winId, "p2");

    const grid = result.windows[0].grid;
    expect(grid.cols).toBe(2);
    expect(grid.placements).toHaveLength(2);

    const p1Final = grid.placements.find((p: any) => p.tabIds.includes("p1"));
    const p3Final = grid.placements.find((p: any) => p.tabIds.includes("p3"));
    expect(p1Final?.position.col).toBe(0);
    expect(p3Final?.position.col).toBe(1);
  });

  test("removing the only placement leaves cols >= 1", () => {
    const ws = makeWs();
    const winId = makeWsId();

    const result = ops.removeTabFromCell(ws, winId, "p1");

    expect(result.windows[0].grid.cols).toBe(1);
    expect(result.windows[0].grid.placements).toHaveLength(0);
  });

  test("focusTabId overrides active tab after removing the active tab", () => {
    const ws = makeWs();
    const winId = makeWsId();

    const p2 = types.createTab("p2", "terminal", "Two");
    let r = ops.addTabToCell(ws, winId, p2, 0, 0);

    const result = ops.removeTabFromCell(r, winId, "p2", "p1");

    const placement = result.windows[0].grid.placements[0];
    expect(placement.tabIds).toEqual(["p1"]);
    expect(placement.activeTabId).toBe("p1");
  });

  test("focusTabId falls back to first remaining tab", () => {
    const ws = makeWs();
    const winId = makeWsId();

    const p2 = types.createTab("p2", "terminal", "Two");
    const p3 = types.createTab("p3", "terminal", "Three");
    let r = ops.addTabToCell(ws, winId, p2, 0, 0);
    r = ops.addTabToCell(r, winId, p3, 0, 0);

    const result = ops.removeTabFromCell(r, winId, "p3", "non-existent");

    const placement = result.windows[0].grid.placements[0];
    expect(placement.tabIds).not.toContain("p3");
    expect(placement.activeTabId).toBe("p1");
  });
});

describe("reorderTabsInCell", () => {
  test("reorders tab IDs within a cell", () => {
    const ws = types.createWorkspace("ws1");
    const winId = ws.windows[0].id;

    const t1 = types.createTab("p1", "terminal", "One");
    const t2 = types.createTab("p2", "markdown", "Two");
    let r = ops.addTabToCell(ws, winId, t1, 0, 0);
    r = ops.addTabToCell(r, winId, t2, 0, 0);

    const result = ops.reorderTabsInCell(r, winId, 0, 0, 0, 1);
    const pl = result.windows[0].grid.placements[0];
    expect(pl.tabIds).toEqual(["p2", "p1"]);
  });

  test("does nothing when cell not found", () => {
    const ws = makeWs();
    const winId = makeWsId();

    const result = ops.reorderTabsInCell(ws, winId, 5, 5, 0, 0);
    expect(result).toStrictEqual(ws);
  });
});

describe("switchTabInCell", () => {
  test("switches active tab in a matching cell", () => {
    const ws = types.createWorkspace("ws1");
    const winId = ws.windows[0].id;
    const t1 = types.createTab("t1", "terminal", "One");
    const t2 = types.createTab("t2", "markdown", "Two");
    let r = ops.addTabToCell(ws, winId, t1, 0, 0);
    r = ops.addTabToCell(r, winId, t2, 0, 0);

    const result = ops.switchTabInCell(r, winId, "t1", 0, 0);
    expect(result.windows[0].grid.placements[0].tabIds[0]).toBe("t1"); // t1 becomes active (moved to front)
  });

  test("does nothing when cell is not found", () => {
    const ws = types.createWorkspace("ws1");
    const winId = ws.windows[0].id;
    const result = ops.switchTabInCell(ws, winId, "t1", 99, 99);
    expect(result).toStrictEqual(ws);
  });
});

describe("renameTabOp", () => {
  test("renames an existing tab", () => {
    const r = makeWs();
    const winId = makeWsId();
    const tabId = r.windows[0].grid.placements[0].tabIds[0];

    const result = ops.renameTabOp(r, tabId, "New Title");
    expect(result.editorTabs[tabId].title).toBe("New Title");
  });

  test("does nothing when tab does not exist", () => {
    const r = makeWs();

    const result = ops.renameTabOp(r, "no-such-tab", "ignored");
    expect(result).toStrictEqual(r);
  });
});

describe("updateTabConfig", () => {
  test("updates a single key in tab config", () => {
    const ws = types.createWorkspace("ws1");
    const winId = ws.windows[0].id;
    const tab = types.createTab("t1", "terminal", "Test", { cwd: "/home" });
    const r = ops.registerTab(ws, tab);

    const result = ops.updateTabConfig(r, "t1", "cwd", "/new-home");
    expect(result.editorTabs["t1"].config?.cwd).toBe("/new-home");
  });
});

// ─── Grid Sizing ───────────────────────────────────────────────────────────

describe("resizeGrid", () => {
  test("increases grid dimensions", () => {
    const ws = types.createWorkspace("ws1");
    const winId = ws.windows[0].id;

    const result = ops.resizeGrid(ws, winId, 3, 4);
    expect(result.windows[0].grid.rows).toBe(3);
    expect(result.windows[0].grid.cols).toBe(4);
  });

  test("preserves existing placements when expanding", () => {
    const ws = makeWs();
    const winId = makeWsId();
    const result = ops.resizeGrid(ws, winId, 2, 2);
    expect(result.windows[0].grid.rows).toBe(2);
    expect(result.windows[0].grid.cols).toBe(2);

    // p1 should still be in its original position
    const p1Placement = result.windows[0].grid.placements.find((p: any) => p.tabIds.includes("p1"));
    expect(p1Placement).toBeDefined();
  });
});

describe("resizeCell", () => {
  test("updates a column divider ratio", () => {
    const ws = types.createWorkspace("ws1");
    const winId = ws.windows[0].id;
    let r = ops.resizeGrid(ws, winId, 1, 2);

    const result = ops.resizeCell(r, winId, 0, 0.75, false);
    expect(result.windows[0].grid.dividers.columns[0]).toBeCloseTo(0.75);
  });

  test("updates a row divider ratio", () => {
    const ws = types.createWorkspace("ws1");
    const winId = ws.windows[0].id;
    let r = ops.resizeGrid(ws, winId, 2, 1);

    const result = ops.resizeCell(r, winId, 0, 0.3, true);
    expect(result.windows[0].grid.dividers.rows[0]).toBeCloseTo(0.3);
  });

  test("clamps ratio to [0.1, 0.9]", () => {
    const ws = types.createWorkspace("ws1");
    const winId = ws.windows[0].id;
    let r = ops.resizeGrid(ws, winId, 1, 2);

    const result1 = ops.resizeCell(r, winId, 0, 0, false);
    expect(result1.windows[0].grid.dividers.columns[0]).toBeCloseTo(0.1);

    const result2 = ops.resizeCell(r, winId, 0, 1.5, false);
    expect(result2.windows[0].grid.dividers.columns[0]).toBeCloseTo(0.9);
  });
});

// ─── Overlay Management ────────────────────────────────────────────────────

describe("createOverlay", () => {
  test("adds an overlay to a window with default position", () => {
    const ws = types.createWorkspace("ws1");
    const winId = ws.windows[0].id;
    const tab = types.createTab("p1", "video", "YouTube");

    const result = ops.createOverlay(ws, winId, tab);

    expect(result.windows[0].overlays).toHaveLength(1);
    expect(result.windows[0].overlays[0].tab.id).toBe("p1");
    expect(result.windows[0].overlays[0].position).toBe("bottom-right");
  });

  test("auto-registers the tab if not in workspace", () => {
    const ws = types.createWorkspace("ws1");
    const winId = ws.windows[0].id;
    const tab = types.createTab("p_new", "video", "New");

    const result = ops.createOverlay(ws, winId, tab);
    expect(result.editorTabs["p_new"]).toBeDefined();
  });

  test("accepts a custom position", () => {
    const ws = types.createWorkspace("ws1");
    const winId = ws.windows[0].id;
    const tab = types.createTab("p1", "notes", "Notes");

    const result = ops.createOverlay(ws, winId, tab, "top-left");
    expect(result.windows[0].overlays[0].position).toBe("top-left");
  });
});

describe("removeOverlay", () => {
  test("removes an overlay by ID", () => {
    const ws = types.createWorkspace("ws1");
    const winId = ws.windows[0].id;
    const pane = types.createTab("p1", "video", "Video");
    let r = ops.createOverlay(ws, winId, pane);
    const overlayId = r.windows[0].overlays[0].id;

    const result = ops.removeOverlay(r, winId, overlayId);
    expect(result.windows[0].overlays).toHaveLength(0);
  });

  test("does nothing when overlay ID not found", () => {
    const ws = types.createWorkspace("ws1");
    const winId = ws.windows[0].id;
    const pane = types.createTab("p1", "video", "Video");
    let r = ops.createOverlay(ws, winId, pane);

    const result = ops.removeOverlay(r, winId, "no-such-overlay");
    expect(result).toStrictEqual(r);
  });
});

describe("moveOverlay", () => {
  test("moves an overlay to a custom position", () => {
    const ws = types.createWorkspace("ws1");
    const winId = ws.windows[0].id;
    const pane = types.createTab("p1", "video", "Video");
    let r = ops.createOverlay(ws, winId, pane);
    const overlayId = r.windows[0].overlays[0].id;

    const result = ops.moveOverlay(r, winId, overlayId, { x: 100, y: 200 });
    expect(result.windows[0].overlays[0].position).toEqual({ x: 100, y: 200 });
  });
});

// ─── Window Management ─────────────────────────────────────────────────────

describe("addWindow", () => {
  test("adds a new window with default bounds", () => {
    const ws = types.createWorkspace("ws1");

    const result = ops.addWindow(ws, "w2");
    expect(result.windows).toHaveLength(2);
    expect(result.windows[1].id).toBe("w2");
    expect(result.windows[1].grid).toBeDefined();
  });

  test("accepts custom bounds and monitor", () => {
    const ws = types.createWorkspace("ws1");

    const result = ops.addWindow(ws, "w2", { x: 100, y: 50, width: 800, height: 600 }, 1);
    expect(result.windows[1].bounds).toEqual({ x: 100, y: 50, width: 800, height: 600 });
    expect(result.windows[1].monitor).toBe(1);
  });
});

describe("closeWindow", () => {
  test("removes a window by ID", () => {
    const ws = types.createWorkspace("ws1");
    let r = ops.addWindow(ws, "w2");

    const result = ops.closeWindow(r, "w2");
    expect(result.windows).toHaveLength(1);
    expect(result.windows[0].id).not.toBe("w2");
  });

  test("does nothing when window ID not found", () => {
    const ws = types.createWorkspace("ws1");

    const result = ops.closeWindow(ws, "non-existent");
    expect(result).toStrictEqual(ws);
  });
});

describe("moveWindow", () => {
  test("updates window bounds and monitor", () => {
    const ws = types.createWorkspace("ws1");
    const winId = ws.windows[0].id;

    const result = ops.moveWindow(ws, winId, { x: 100, y: 50, width: 800, height: 600 }, 1);
    expect(result.windows[0].bounds).toEqual({ x: 100, y: 50, width: 800, height: 600 });
    expect(result.windows[0].monitor).toBe(1);
  });
});

describe("newWindow", () => {
  test("creates an empty window", () => {
    const ws = types.createWorkspace("ws1");
    const result = ops.newWindow(ws);
    expect(result.windows).toHaveLength(2);
  });
});

describe("detachTabToWindow", () => {
  test("creates a new window with the tab", () => {
    const ws = types.createWorkspace("ws1");
    const winId = ws.windows[0].id;
    const tab = types.createTab("p1", "terminal", "Terminal");
    let r = ops.addTabToCell(ws, winId, tab, 0, 0);

    const result = ops.detachTabToWindow(r, winId, "p1");

    expect(result.windows).toHaveLength(2);
    const newWin = result.windows.find((w: any) => w.id !== winId)!;
    expect(newWin.grid.placements[0].tabIds.includes("p1")).toBe(true);
  });

  test("does nothing when tab is not found", () => {
    const ws = types.createWorkspace("ws1");

    const result = ops.detachTabToWindow(ws, ws.windows[0].id, "ghost");
    expect(result).toStrictEqual(ws);
  });
});

// ─── Serialization ─────────────────────────────────────────────────────────

describe("serialize / deserialize", () => {
  test("serialize produces valid JSON", () => {
    const ws = makeWs();
    const json = ops.serialize(ws);
    const parsed = JSON.parse(json);
    expect(parsed.id).toBe(ws.id);
    expect(parsed.windows).toHaveLength(1);
  });

  test("deserialize parses valid JSON back into workspace", () => {
    const ws = makeWs();
    const json = ops.serialize(ws);
    const parsed = ops.deserialize(json);
    expect(parsed.id).toBe(ws.id);
    expect(parsed.windows[0].grid.placements).toHaveLength(1);
  });
});

describe("stripPreviewTabs", () => {
  function makeWsWithTabs(...tabs: Array<{ id: string; isPreview: boolean }>) {
    const ws = types.createWorkspace("ws-test-preview");
    const winId = ws.windows[0].id;
    let r = ws;
    for (const t of tabs) {
      const tab = types.createTab(t.id, "terminal", t.id, {}, t.isPreview);
      r = ops.registerTab(r, tab);
    }
    return r;
  }

  test("removes preview tabs from a placement", () => {
    let ws = makeWsWithTabs(
      { id: "pinned-1", isPreview: false },
      { id: "preview-1", isPreview: true },
      { id: "pinned-2", isPreview: false },
    );
    const winId = ws.windows[0].id;

    // Add all three tabs to the same cell
    ws = ops.addTabToCell(ws, winId, ws.editorTabs["pinned-1"], 0, 0);
    ws = ops.addTabToCell(ws, winId, ws.editorTabs["preview-1"], 0, 0);
    ws = ops.addTabToCell(ws, winId, ws.editorTabs["pinned-2"], 0, 0);

    const cleaned = ops.stripPreviewTabs(ws);

    // Preview tab should be removed from tabs registry
    expect(cleaned.editorTabs["preview-1"]).toBeUndefined();

    // Pinned tabs should survive
    expect(cleaned.editorTabs["pinned-1"]).toBeDefined();
    expect(cleaned.editorTabs["pinned-2"]).toBeDefined();

    // Placement should only have pinned tabs
    const pl = cleaned.windows[0].grid.placements[0];
    expect(pl.tabIds).toHaveLength(2);
    expect(pl.tabIds).toContain("pinned-1");
    expect(pl.tabIds).toContain("pinned-2");
    expect(pl.tabIds).not.toContain("preview-1");
  });

  test("does not remove pinned tabs", () => {
    let ws = makeWsWithTabs({ id: "t1", isPreview: false }, { id: "t2", isPreview: false });
    const winId = ws.windows[0].id;
    ws = ops.addTabToCell(ws, winId, ws.editorTabs["t1"], 0, 0);
    ws = ops.addTabToCell(ws, winId, ws.editorTabs["t2"], 0, 0);

    const originalTabCount = Object.keys(ws.editorTabs).length;
    const cleaned = ops.stripPreviewTabs(ws);

    expect(Object.keys(cleaned.editorTabs)).toHaveLength(originalTabCount);
    expect(cleaned.windows[0].grid.placements[0].tabIds).toHaveLength(2);
  });

  test("empties a cell when its only tab is a preview", () => {
    let ws = makeWsWithTabs({ id: "only-preview", isPreview: true });
    const winId = ws.windows[0].id;
    ws = ops.addTabToCell(ws, winId, ws.editorTabs["only-preview"], 0, 0);

    const cleaned = ops.stripPreviewTabs(ws);

    // Tab should be removed
    expect(cleaned.editorTabs["only-preview"]).toBeUndefined();

    // Cell should be empty (tabIds = []), it will render with quote placeholder.
    // If the only placement was removed by compactGrid, placements is empty.
    const placements = cleaned.windows[0].grid.placements;
    expect(placements.length).toBe(0);
  });

  test("resets activeTabId when it was a preview tab", () => {
    let ws = makeWsWithTabs(
      { id: "pinned-tab", isPreview: false },
      { id: "preview-active", isPreview: true },
    );
    const winId = ws.windows[0].id;
    ws = ops.addTabToCell(ws, winId, ws.editorTabs["pinned-tab"], 0, 0);
    ws = ops.addTabToCell(ws, winId, ws.editorTabs["preview-active"], 0, 0);

    // Make preview the active tab
    ws = ops.activateTabInCell(ws, winId, "preview-active");

    const cleaned = ops.stripPreviewTabs(ws);

    const pl = cleaned.windows[0].grid.placements[0];
    expect(pl.activeTabId).toBe("pinned-tab");
    expect(pl.tabIds).toHaveLength(1);
  });

  test("serialize() strips preview tabs before serializing", () => {
    let ws = makeWsWithTabs({ id: "pinned", isPreview: false }, { id: "preview", isPreview: true });
    const winId = ws.windows[0].id;
    ws = ops.addTabToCell(ws, winId, ws.editorTabs["pinned"], 0, 0);
    ws = ops.addTabToCell(ws, winId, ws.editorTabs["preview"], 0, 0);

    const json = ops.serialize(ws);
    const parsed = JSON.parse(json);

    // Preview tab should not appear in serialized output
    expect(parsed.editorTabs["preview"]).toBeUndefined();
    expect(parsed.editorTabs["pinned"]).toBeDefined();

    // Placement should only have pinned tab
    expect(parsed.windows[0].grid.placements[0].tabIds).toEqual(["pinned"]);
  });

  test("does not mutate the original workspace", () => {
    let ws = makeWsWithTabs({ id: "pinned", isPreview: false }, { id: "preview", isPreview: true });
    const winId = ws.windows[0].id;
    ws = ops.addTabToCell(ws, winId, ws.editorTabs["pinned"], 0, 0);
    ws = ops.addTabToCell(ws, winId, ws.editorTabs["preview"], 0, 0);

    const originalTabs = { ...ws.editorTabs };
    ops.stripPreviewTabs(ws);

    // Original workspace should be unchanged
    expect(ws.editorTabs["preview"]).toBeDefined();
    expect(ws.windows[0].grid.placements[0].tabIds).toContain("preview");
  });
});

// ─── Column Pane Management ────────────────────────────────────────────────

describe("addColumnTab", () => {
  test("adds a tab at the first empty column", () => {
    const ws = types.createWorkspace("ws1");
    const winId = ws.windows[0].id;

    const result = ops.addColumnTab(ws, winId, "terminal");
    expect(result.windows[0].grid.placements).toHaveLength(1);
    expect(result.windows[0].grid.placements[0].position.col).toBe(0);
  });

  test("adds a column when grid is full", () => {
    const ws = types.createWorkspace("ws1");
    const winId = ws.windows[0].id;

    let r = ops.addColumnTab(ws, winId, "terminal");
    const result = ops.addColumnTab(r, winId, "markdown");

    expect(result.windows[0].grid.cols).toBe(2);
    expect(result.windows[0].grid.placements).toHaveLength(2);
  });

  test("defaults appType to terminal", () => {
    const ws = types.createWorkspace("ws1");
    const winId = ws.windows[0].id;

    const result = ops.addColumnTab(ws, winId);

    const tabId = result.windows[0].grid.placements[0].tabIds[0];
    expect(result.editorTabs[tabId].appType).toBe("terminal");
  });
});

describe("removeColumnTab", () => {
  test("removes a tab and compacts columns", () => {
    const ws = types.createWorkspace("ws1");
    const winId = ws.windows[0].id;
    let r = ops.resizeGrid(ws, winId, 1, 2);

    const p1 = types.createTab("p1", "terminal", "One");
    const p2 = types.createTab("p2", "video", "Two");
    r = ops.addTabToCell(r, winId, p1, 0, 0);
    r = ops.addTabToCell(r, winId, p2, 0, 1);

    const result = ops.removeColumnTab(r, winId, "p1");

    const grid = result.windows[0].grid;
    expect(grid.cols).toBe(1);
    expect(grid.placements).toHaveLength(1);
    expect(grid.placements[0].tabIds.includes("p2")).toBe(true);
    expect(grid.placements[0].position.col).toBe(0);
  });
});

describe("splitTabFromCell", () => {
  test("does nothing when tab not found", () => {
    const ws = types.createWorkspace("ws1");
    const winId = ws.windows[0].id;
    const result = ops.splitTabFromCell(ws, winId, "non-existent", 0, 1);
    expect(result).toStrictEqual(ws);
  });
});

describe("activateTabInCell", () => {
  test("activates a tab in the cell", () => {
    const ws = types.createWorkspace("ws1");
    const winId = ws.windows[0].id;
    const t1 = types.createTab("t1", "terminal", "One");
    const t2 = types.createTab("t2", "markdown", "Two");
    let r = ops.addTabToCell(ws, winId, t1, 0, 0);
    r = ops.addTabToCell(r, winId, t2, 0, 0);

    const result = ops.activateTabInCell(r, winId, "t1");
    expect(result.windows[0].grid.placements[0].tabIds[0]).toBe("t1");
  });
});

// ─── Composite Actions ─────────────────────────────────────────────────────

describe("actionAddTab", () => {
  test("registers and adds a tab to the grid", () => {
    const ws = types.createWorkspace("ws1");
    const winId = ws.windows[0].id;

    const result = ops.actionAddTab(ws, winId, "p1", "terminal");

    expect(result.editorTabs["p1"]).toBeDefined();
    expect(result.windows[0].grid.placements).toHaveLength(1);
    expect(result.windows[0].grid.placements[0].tabIds.includes("p1")).toBe(true);
  });

  test("adds a row when grid is full", () => {
    const ws = types.createWorkspace("ws1");
    const winId = ws.windows[0].id;

    let r = ops.actionAddTab(ws, winId, "p1", "terminal");
    const result = ops.actionAddTab(r, winId, "p2", "markdown");

    expect(result.windows[0].grid.rows).toBe(2);
    expect(result.windows[0].grid.placements).toHaveLength(2);
  });
});

describe("addColumnTabAt", () => {
  test("places tab at specified column when column is empty", () => {
    const ws = types.createWorkspace("ws1");
    const winId = ws.windows[0].id;
    let r = ops.resizeGrid(ws, winId, 1, 3);

    const result = ops.addColumnTabAt(r, winId, "git-repository", "My Repo", "my-repo", 1);

    expect(result.windows[0].grid.placements).toHaveLength(1);
    expect(result.windows[0].grid.placements[0].position.col).toBe(1);
    const tabId = result.windows[0].grid.placements[0].tabIds[0];
    expect(result.editorTabs[tabId].appType).toBe("git-repository");
    expect(result.editorTabs[tabId].config?.filePath).toBe("my-repo");
  });

  test("expands grid when target column is beyond current grid", () => {
    const ws = types.createWorkspace("ws1");
    const winId = ws.windows[0].id;
    let r = ops.resizeGrid(ws, winId, 1, 2);

    const result = ops.addColumnTabAt(r, winId, "terminal", "Terminal", undefined, 5);

    expect(result.windows[0].grid.cols).toBe(6);
    expect(result.windows[0].grid.placements).toHaveLength(1);
    expect(result.windows[0].grid.placements[0].position.col).toBe(5);
  });

  test("falls back to addColumnTab when targetCol is undefined", () => {
    const ws = types.createWorkspace("ws1");
    const winId = ws.windows[0].id;

    const result = ops.addColumnTabAt(ws, winId, "terminal", "Terminal", undefined, undefined);

    expect(result.windows[0].grid.placements).toHaveLength(1);
    expect(result.windows[0].grid.placements[0].position.col).toBe(0);
  });
});

// ─── Computed properties ──────────────────────────────────────────────────

describe("computeNewActiveId", () => {
  test("active tab moved → uses first remaining", () => {
    expect(ops.computeNewActiveId("t1", "t1", ["t2", "t3"])).toBe("t2");
  });

  test("active tab moved, no remaining → falls back to tabId", () => {
    expect(ops.computeNewActiveId("t1", "t1", [])).toBe("t1");
  });

  test("non-active tab moved → keeps current active", () => {
    expect(ops.computeNewActiveId("t2", "t1", ["t3"])).toBe("t2");
  });

  test("non-active tab moved, active missing → falls back to tabId", () => {
    expect(ops.computeNewActiveId(null, "t1", ["t2"])).toBe("t1");
  });
});

describe("updateTabTitle", () => {
  test("updates a tab title", () => {
    const ws = types.createWorkspace("ws1");
    const tab = types.createTab("t1", "terminal", "Old");
    let r = ops.registerTab(ws, tab);

    const result = ops.updateTabTitle(r, "t1", "New Title");
    expect(result.editorTabs["t1"].title).toBe("New Title");
  });
});

describe("findPreviewTabInCell", () => {
  test("returns null when no preview tab", () => {
    const ws = types.createWorkspace("ws1");
    const winId = ws.windows[0].id;
    const t1 = types.createTab("t1", "terminal", "One");
    let r = ops.addTabToCell(ws, winId, t1, 0, 0);

    const result = ops.findPreviewTabInCell(r, winId, 0);
    expect(result).toBeNull();
  });
});

describe("moveTabBetweenCells", () => {
  test("does nothing when tab not found", () => {
    const ws = types.createWorkspace("ws1");
    const winId = ws.windows[0].id;
    const result = ops.moveTabBetweenCells(ws, winId, "ghost", winId, 0, 0);
    expect(result).toStrictEqual(ws);
  });
});

describe("moveTabToWindow", () => {
  test("does nothing when tab not found", () => {
    const ws = types.createWorkspace("ws1");
    const result = ops.moveTabToWindow(ws, "ghost", "w2", 0, 0);
    expect(result).toStrictEqual(ws);
  });
});

describe("openTabInCell", () => {
  test("opens a file with appType and title", () => {
    const ws = types.createWorkspace("ws1");
    const winId = ws.windows[0].id;

    const result = ops.openTabInCell(ws, winId, "file-viewer", "test.ts", "/test.ts");
    const placement = result.windows[0].grid.placements.find(
      (p: any) => p.position.row === 0 && p.position.col === 0,
    );
    expect(placement).toBeDefined();
    expect(placement.tabIds).toHaveLength(1);
    const tabId = placement.tabIds[0];
    expect(result.editorTabs[tabId].appType).toBe("file-viewer");
  });
});

// ─── System Tab Operations ───────────────────────────────────────────────

describe("system tab operations", () => {
  test("openSystemTab creates and activates a tab in the right sidebar", () => {
    const ws = types.createWorkspace("ws1");
    const winId = ws.windows[0].id;

    const result = ops.openSystemTab(ws, winId, "right", "search", "Search");
    const win = result.windows[0];
    // No default tabs anymore — just the one we opened
    expect(win.sidebar?.rightSidebarTabs).toHaveLength(1);
    expect(win.sidebar?.activeRightTab).toBe(win.sidebar?.rightSidebarTabs[0]);
  });

  test("openSystemTab prevents duplicates (same appType in same sidebar)", () => {
    const ws = types.createWorkspace("ws1");
    const winId = ws.windows[0].id;

    const r1 = ops.openSystemTab(ws, winId, "right", "search", "Search");
    const r2 = ops.openSystemTab(r1, winId, "right", "search", "Search");
    const win = r2.windows[0];
    // Duplicate prevention should keep only 1 tab
    expect(win.sidebar?.rightSidebarTabs).toHaveLength(1);
  });

  test("toggleSidebar toggles the sidebar open state", () => {
    const ws = addDefaultSidebarTabs(types.createWorkspace("ws1"));
    const winId = ws.windows[0].id;

    // Sidebar open with default tabs
    expect(ws.windows[0].sidebar?.rightSidebarOpen).toBe(true);

    // Toggle closed
    const r1 = ops.toggleSidebar(ws, winId, "right");
    expect(r1.windows[0].sidebar?.rightSidebarOpen).toBe(false);

    // Toggle open again
    const r2 = ops.toggleSidebar(r1, winId, "right");
    expect(r2.windows[0].sidebar?.rightSidebarOpen).toBe(true);
  });

  test("openSidebar opens sidebar and activates first tab", () => {
    const ws = addDefaultSidebarTabs(types.createWorkspace("ws1"));
    const winId = ws.windows[0].id;

    // Close sidebar first
    const r0 = ops.closeSidebar(ws, winId, "right");
    expect(r0.windows[0].sidebar?.rightSidebarOpen).toBe(false);

    // Open sidebar (should open and activate first tab)
    const r1 = ops.openSidebar(r0, winId, "right");
    expect(r1.windows[0].sidebar?.rightSidebarOpen).toBe(true);
  });

  test("closeSystemTab removes tab from sidebar and registry", () => {
    const ws = addDefaultSidebarTabs(types.createWorkspace("ws1"));
    const winId = ws.windows[0].id;

    // Add a non-default tab
    const r1 = ops.openSystemTab(ws, winId, "right", "search", "Search", false);
    const tabId = r1.windows[0].sidebar?.rightSidebarTabs[2]!;
    expect(r1.systemTabs[tabId]).toBeDefined();

    const r2 = ops.closeSystemTab(r1, winId, "right", tabId);
    // 2 default tabs remain
    expect(r2.windows[0].sidebar?.rightSidebarTabs).toHaveLength(2);
    expect(r2.systemTabs[tabId]).toBeUndefined();
  });

  test("pinned system tabs propagate to all windows", () => {
    const ws = addDefaultSidebarTabs(types.createWorkspace("ws1"));
    const winId = ws.windows[0].id;
    const ws2 = ops.addWindow(ws, "win-2");

    const r1 = ops.openSystemTab(ws2, winId, "right", "search", "Search", true);
    const tabId = r1.windows[0].sidebar?.rightSidebarTabs[2]!;
    const win2 = r1.windows.find((w) => w.id === "win-2");
    expect(win2?.sidebar?.rightSidebarTabs).toContain(tabId);
  });

  test("reorderSystemTab changes tab order in sidebar", () => {
    const ws = types.createWorkspace("ws1");
    const winId = ws.windows[0].id;

    const r1 = ops.openSystemTab(ws, winId, "right", "explorer", "Explorer", true);
    const r2 = ops.openSystemTab(r1, winId, "right", "git", "Git", true);
    const tabs = r2.windows[0].sidebar?.rightSidebarTabs!;
    expect(tabs).toHaveLength(2);

    // Reorder: move last tab to front
    const r3 = ops.reorderSystemTab(r2, winId, "right", tabs[1], 0);
    expect(r3.windows[0].sidebar?.rightSidebarTabs[0]).toBe(tabs[1]);
    expect(r3.windows[0].sidebar?.rightSidebarTabs[1]).toBe(tabs[0]);
  });
});

// ─── repoRefs management ──────────────────────────────────────────────────

describe("repoRefs management", () => {
  test("addRepoRef adds a repo ref to the window", () => {
    const ws = types.createWorkspace("ws1");
    const winId = ws.windows[0].id;

    const result = ops.addRepoRef(
      ws,
      winId,
      "test-org/repo",
      "https://github.com/test-org/repo.git",
    );

    const repoRefs = result.windows[0].repoRefs;
    expect(repoRefs).toHaveLength(1);
    expect(repoRefs[0].name).toBe("test-org/repo");
  });

  test("addRepoRef does not duplicate existing repo", () => {
    const ws = types.createWorkspace("ws1");
    const winId = ws.windows[0].id;

    let r = ops.addRepoRef(ws, winId, "test-org/repo", "url");
    const result = ops.addRepoRef(r, winId, "test-org/repo", "url");

    expect(result.windows[0].repoRefs).toHaveLength(1);
  });

  test("removeRepoRef removes a repo ref from the window", () => {
    const ws = types.createWorkspace("ws1");
    const winId = ws.windows[0].id;

    let r = ops.addRepoRef(ws, winId, "test-org/repo", "url");
    const result = ops.removeRepoRef(r, winId, "test-org/repo");

    expect(result.windows[0].repoRefs).toHaveLength(0);
  });

  test("addWorktreeToRepoRef adds a worktree to a repo ref", () => {
    const ws = types.createWorkspace("ws1");
    const winId = ws.windows[0].id;

    let r = ops.addRepoRef(ws, winId, "test-org/repo", "url");
    const result = ops.addWorktreeToRepoRef(r, winId, "test-org/repo", "main");

    const repoRef = result.windows[0].repoRefs[0];
    expect(repoRef.worktrees).toContain("main");
  });

  test("hasRepoInWindow returns true when repo exists", () => {
    const ws = types.createWorkspace("ws1");
    const winId = ws.windows[0].id;

    let r = ops.addRepoRef(ws, winId, "test-org/repo", "url");

    expect(ops.hasRepoInWindow(r, winId, "test-org/repo")).toBe(true);
    expect(ops.hasRepoInWindow(r, winId, "other-repo")).toBe(false);
  });
});

// ─── findEmptyCell / compactGrid ──────────────────────────────────────────

describe("findEmptyCell", () => {
  test("returns null for fully occupied grid", () => {
    const ws = types.createWorkspace("ws1");
    const winId = ws.windows[0].id;
    let r = ops.addTabToCell(ws, winId, types.createTab("t1", "terminal", "T1"), 0, 0);
    r = ops.resizeGrid(r, winId, 2, 2);
    r = ops.addTabToCell(r, winId, types.createTab("t2", "terminal", "T2"), 0, 1);
    r = ops.addTabToCell(r, winId, types.createTab("t3", "terminal", "T3"), 1, 0);
    // Fill last cell
    r = ops.addTabToCell(r, winId, types.createTab("t4", "terminal", "T4"), 1, 1);

    const grid = r.windows[0].grid;
    const empty = ops.findEmptyCell(grid);
    expect(empty).toBeNull();
  });
});

describe("findSrcColumn", () => {
  test("returns -1 when page not found", () => {
    const ws = types.createWorkspace("ws1");
    expect(ops.findSrcColumn(ws, "w1", "no-such-page", "t1")).toBe(-1);
  });
});

// ─── System Tab Operations ────────────────────────────────────────────────

describe("moveSystemTabToSidebar", () => {
  test("moves a tab from right to left sidebar and inserts at dropIndex", () => {
    let ws = addDefaultSidebarTabs(types.createWorkspace("ws1"));
    const winId = ws.windows[0].id;

    // Workspace with default tabs: explorer and git on the RIGHT sidebar
    expect((ws.windows[0].sidebar?.rightSidebarTabs ?? []).length).toBe(2);
    expect((ws.windows[0].sidebar?.leftSidebarTabs ?? []).length).toBe(0);

    // Create a new system tab on the right
    ws = ops.openSystemTab(ws, winId, "right", "search", "Search", false);
    const rightTabs = ws.windows[0].sidebar?.rightSidebarTabs ?? [];
    const searchTabId = rightTabs[rightTabs.length - 1];

    // Move it to the left sidebar
    ws = ops.moveSystemTabToSidebar(ws, winId, searchTabId, "left", 0);

    // Verify it's removed from right
    expect(ws.windows[0].sidebar?.rightSidebarTabs ?? []).not.toContain(searchTabId);
    // Verify it's added to left
    expect(ws.windows[0].sidebar?.leftSidebarTabs ?? []).toContain(searchTabId);
    // Verify it's the active tab on left
    expect(ws.windows[0].sidebar?.activeLeftTab).toBe(searchTabId);
    // Verify left sidebar is open
    expect(ws.windows[0].sidebar?.leftSidebarOpen).toBe(true);
  });

  test("inserts at the correct position", () => {
    let ws = addDefaultSidebarTabs(types.createWorkspace("ws1"));
    const winId = ws.windows[0].id;

    // Default right sidebar: explorer, git
    // Add a search tab to right
    ws = ops.openSystemTab(ws, winId, "right", "search", "Search", false);

    // Move the git tab (index 1 on right) to the left sidebar at position 0
    const rightTabs = ws.windows[0].sidebar?.rightSidebarTabs ?? [];
    const gitTabId = rightTabs[1]; // sys-git
    ws = ops.moveSystemTabToSidebar(ws, winId, gitTabId, "left", 0);

    // Verify left sidebar has the git tab at index 0
    const leftTabs = ws.windows[0].sidebar?.leftSidebarTabs ?? [];
    expect(leftTabs[0]).toBe(gitTabId);
    // Verify right no longer has git
    expect(ws.windows[0].sidebar?.rightSidebarTabs ?? []).not.toContain(gitTabId);
  });

  test("reorders within the same sidebar when sourceSide equals targetSide", () => {
    let ws = addDefaultSidebarTabs(types.createWorkspace("ws1"));
    const winId = ws.windows[0].id;

    const rightTabs = ws.windows[0].sidebar?.rightSidebarTabs ?? [];
    // Right tabs: [explorer, git]
    const explorerId = rightTabs[0];
    const gitId = rightTabs[1];

    // Move explorer to index 1 (after git)
    ws = ops.moveSystemTabToSidebar(ws, winId, explorerId, "right", 1);

    const newRightTabs = ws.windows[0].sidebar?.rightSidebarTabs ?? [];
    expect(newRightTabs[0]).toBe(gitId);
    expect(newRightTabs[1]).toBe(explorerId);
  });

  test("does nothing for non-existent tab", () => {
    const ws = addDefaultSidebarTabs(types.createWorkspace("ws1"));
    const winId = ws.windows[0].id;
    const result = ops.moveSystemTabToSidebar(ws, winId, "non-existent", "left", 0);
    expect(result).toBe(ws);
  });

  test("activates the moved tab on the target sidebar", () => {
    let ws = addDefaultSidebarTabs(types.createWorkspace("ws1"));
    const winId = ws.windows[0].id;

    const rightTabs = ws.windows[0].sidebar?.rightSidebarTabs ?? [];
    const explorerTabId = rightTabs[0];

    ws = ops.moveSystemTabToSidebar(ws, winId, explorerTabId, "left", 0);

    // The moved tab should be the active tab on the left
    expect(ws.windows[0].sidebar?.activeLeftTab).toBe(explorerTabId);
    // The right sidebar should still have git as the active tab
    expect(ws.windows[0].sidebar?.activeRightTab).toBeTruthy();
  });
});
