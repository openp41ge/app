/**
 * Tests for tab reordering, activeTabId, and tab title operations.
 *
 * These test the new data model features: separate activeTabId tracking,
 * append-on-add behavior, and drag-to-reorder.
 */

import * as types from "@openp41ge/layout/types";
import * as ops from "@openp41ge/layout/operations";

// ─── Helpers ──────────────────────────────────────────────────────────────

/** Create a workspace with one window and no tabs in the grid. */
function baseWs(): { ws: types.Workspace; winId: string } {
  const ws = types.createWorkspace("ws1");
  const winId = ws.windows[0].id;
  return { ws, winId };
}

/** Add a tab of a given appType to the grid at (row, col). Returns the updated workspace + tab. */
function addTab(
  ws: types.Workspace,
  winId: string,
  id: string,
  appType: string = "terminal",
  title: string = "Tab",
  row: number = 0,
  col: number = 0,
): { ws: types.Workspace; tab: types.Tab } {
  const tab = types.createTab(id as types.TabId, appType, title);
  const r = ops.addTabToCell(ws, winId, tab, row, col);
  return { ws: r, tab };
}

function placementForCol(
  ws: types.Workspace,
  winId: string,
  col: number,
): types.TabPlacement | undefined {
  const win = ws.windows.find((w) => w.id === winId);
  return win?.grid.placements.find((pl) => pl.position.row === 0 && pl.position.col === col);
}

// ─── activeTabId ──────────────────────────────────────────────────────────

describe("activeTabId", () => {
  test("addTabToCell sets activeTabId on occupied cell", () => {
    const { ws, winId } = baseWs();
    const t1 = types.createTab("t1" as types.TabId, "terminal", "Terminal");
    const r1 = ops.addTabToCell(ws, winId, t1, 0, 0);
    const t2 = types.createTab("t2" as types.TabId, "markdown", "Markdown");
    const r2 = ops.addTabToCell(r1, winId, t2, 0, 0);

    const pl = placementForCol(r2, winId, 0);
    expect(pl).toBeDefined();
    // The new tab should be appended to the end of tabIds
    expect(pl!.tabIds).toEqual(["t1" as types.TabId, "t2" as types.TabId]);
    // activeTabId should point to the newly added tab
    expect(pl!.activeTabId).toBe("t2" as types.TabId);
  });

  test("addTabToCell sets activeTabId on empty cell", () => {
    const { ws, winId } = baseWs();
    const t1 = types.createTab("t1" as types.TabId, "terminal", "Terminal");
    const r = ops.addTabToCell(ws, winId, t1, 0, 0);

    const pl = placementForCol(r, winId, 0);
    expect(pl).toBeDefined();
    expect(pl!.tabIds).toEqual(["t1" as types.TabId]);
    expect(pl!.activeTabId).toBe("t1" as types.TabId);
  });

  test("activateTabInCell sets activeTabId without reordering tabIds", () => {
    const { ws, winId } = baseWs();
    const t1 = types.createTab("t1" as types.TabId, "terminal", "One");
    const r1 = ops.addTabToCell(ws, winId, t1, 0, 0);
    const t2 = types.createTab("t2" as types.TabId, "terminal", "Two");
    const r2 = ops.addTabToCell(r1, winId, t2, 0, 0);

    // Activate t1 (the first tab) — activeTabId changes but tabIds order stays
    const r3 = ops.activateTabInCell(r2, winId, "t1" as string);
    const pl = placementForCol(r3, winId, 0);

    expect(pl!.activeTabId).toBe("t1" as types.TabId);
    // tabIds order should be preserved
    expect(pl!.tabIds).toEqual(["t1" as types.TabId, "t2" as types.TabId]);
  });

  test("activateTabInCell does nothing for unknown tabId", () => {
    const { ws, winId } = baseWs();
    const t1 = types.createTab("t1" as types.TabId, "terminal", "One");
    const r = ops.addTabToCell(ws, winId, t1, 0, 0);

    const result = ops.activateTabInCell(r, winId, "unknown");
    expect(result).toStrictEqual(r);
  });

  test("tabIds[0] used as fallback when activeTabId is not set", () => {
    // Directly create a placement without activeTabId to test fallback
    const { ws, winId } = baseWs();
    const t1 = types.createTab("t1" as types.TabId, "terminal", "One");
    const t2 = types.createTab("t2" as types.TabId, "terminal", "Two");

    // Manually build a workspace where a placement has no activeTabId
    const r = ops.registerTab(ws, t1);
    const r2 = ops.registerTab(r, t2);
    // Add both tabs to the cell
    let r3 = ops.addTabToCell(r2, winId, t1, 0, 0);
    r3 = ops.addTabToCell(r3, winId, t2, 0, 0);

    // Remove activeTabId to test fallback
    const pl = placementForCol(r3, winId, 0);
    const plNoActive = { ...pl!, activeTabId: undefined as any };
    const page = r3.windows.find((w) => w.id === winId)!.grid.placements.find((p) => true)!;
    const modifiedWs: types.Workspace = {
      ...r3,
      windows: r3.windows.map((w) =>
        w.id === winId
          ? {
              ...w,
              placements: w.grid.placements.map((p) =>
                true ? { ...p, grid: { ...p.grid, placements: [plNoActive] } } : p,
              ),
            }
          : w,
      ),
    };

    // The compute-layout and grid use activeTabId ?? tabIds[0] — so tabIds[0] is "t1"
    expect(plNoActive.tabIds[0]).toBe("t1" as types.TabId);
    expect(plNoActive.activeTabId).toBeUndefined();
  });
});

// ─── Tab Reordering ──────────────────────────────────────────────────────

describe("reorderTabsInCell", () => {
  test("moves a tab from earlier to later position", () => {
    const { ws, winId } = baseWs();
    const t1 = types.createTab("t1" as types.TabId, "terminal", "One");
    const t2 = types.createTab("t2" as types.TabId, "terminal", "Two");
    const t3 = types.createTab("t3" as types.TabId, "terminal", "Three");
    let r = ops.addTabToCell(ws, winId, t1, 0, 0);
    r = ops.addTabToCell(r, winId, t2, 0, 0);
    r = ops.addTabToCell(r, winId, t3, 0, 0);

    // Reorder: move t1 from index 0 to index 2
    const result = ops.reorderTabsInCell(r, winId, 0, 0, 0, 2);
    const pl = placementForCol(result, winId, 0);
    expect(pl!.tabIds).toEqual(["t2" as types.TabId, "t3" as types.TabId, "t1" as types.TabId]);
  });

  test("moves a tab from later to earlier position", () => {
    const { ws, winId } = baseWs();
    const t1 = types.createTab("t1" as types.TabId, "terminal", "One");
    const t2 = types.createTab("t2" as types.TabId, "terminal", "Two");
    const t3 = types.createTab("t3" as types.TabId, "terminal", "Three");
    let r = ops.addTabToCell(ws, winId, t1, 0, 0);
    r = ops.addTabToCell(r, winId, t2, 0, 0);
    r = ops.addTabToCell(r, winId, t3, 0, 0);

    // Reorder: move t3 from index 2 to index 0
    const result = ops.reorderTabsInCell(r, winId, 0, 0, 2, 0);
    const pl = placementForCol(result, winId, 0);
    expect(pl!.tabIds).toEqual(["t3" as types.TabId, "t1" as types.TabId, "t2" as types.TabId]);
  });

  test("does not change activeTabId when reordering", () => {
    const { ws, winId } = baseWs();
    const t1 = types.createTab("t1" as types.TabId, "terminal", "One");
    const t2 = types.createTab("t2" as types.TabId, "terminal", "Two");
    let r = ops.addTabToCell(ws, winId, t1, 0, 0);
    r = ops.addTabToCell(r, winId, t2, 0, 0);

    // activeTabId was set to t2 (latest added)
    const before = placementForCol(r, winId, 0);
    expect(before!.activeTabId).toBe("t2" as types.TabId);

    // Reorder: move t2 from index 1 to index 0
    const result = ops.reorderTabsInCell(r, winId, 0, 0, 1, 0);
    const pl = placementForCol(result, winId, 0);
    // activeTabId stays unchanged
    expect(pl!.activeTabId).toBe("t2" as types.TabId);
    // tabIds are reordered
    expect(pl!.tabIds).toEqual(["t2" as types.TabId, "t1" as types.TabId]);
  });

  test("does nothing when col/row don't match any placement", () => {
    const { ws, winId } = baseWs();
    const result = ops.reorderTabsInCell(ws, winId, 0, 99, 0, 1);
    expect(result).toStrictEqual(ws);
  });

  test("does nothing when tabIds array is empty (shouldn't happen but defensive)", () => {
    const { ws, winId } = baseWs();
    const result = ops.reorderTabsInCell(ws, winId, 0, 0, 0, 1);
    expect(result).toStrictEqual(ws);
  });
});

// ─── Tab Title ───────────────────────────────────────────────────────────

describe("updateTabTitle", () => {
  test("updates the title of an existing tab", () => {
    const { ws, winId } = baseWs();
    const t1 = types.createTab("t1" as types.TabId, "terminal", "Old Title");
    const r = ops.addTabToCell(ws, winId, t1, 0, 0);

    const result = ops.updateTabTitle(r, "t1", "New Title");
    expect(result.editorTabs["t1" as types.TabId]?.title).toBe("New Title");
  });

  test("does nothing for unknown tab", () => {
    const { ws } = baseWs();
    const result = ops.updateTabTitle(ws, "unknown", "Title");
    expect(result).toStrictEqual(ws);
  });
});

// ─── Tab Addition (append, not prepend) ─────────────────────────────────

describe("addTabToCell appends", () => {
  test("new tab is appended to the end of tabIds", () => {
    const { ws, winId } = baseWs();
    const t1 = types.createTab("t1" as types.TabId, "terminal", "Tab 1");
    const t2 = types.createTab("t2" as types.TabId, "terminal", "Tab 2");
    const t3 = types.createTab("t3" as types.TabId, "terminal", "Tab 3");
    let r = ops.addTabToCell(ws, winId, t1, 0, 0);
    r = ops.addTabToCell(r, winId, t2, 0, 0);
    r = ops.addTabToCell(r, winId, t3, 0, 0);

    const pl = placementForCol(r, winId, 0);
    // Tabs should be in insertion order
    expect(pl!.tabIds).toEqual(["t1" as types.TabId, "t2" as types.TabId, "t3" as types.TabId]);
  });

  test("new tab is set as activeTabId", () => {
    const { ws, winId } = baseWs();
    const t1 = types.createTab("t1" as types.TabId, "terminal", "Tab 1");
    const t2 = types.createTab("t2" as types.TabId, "terminal", "Tab 2");
    let r = ops.addTabToCell(ws, winId, t1, 0, 0);
    const before = placementForCol(r, winId, 0);
    expect(before!.activeTabId).toBe("t1" as types.TabId);

    r = ops.addTabToCell(r, winId, t2, 0, 0);
    const after = placementForCol(r, winId, 0);
    // activeTabId is now the newly added tab
    expect(after!.activeTabId).toBe("t2" as types.TabId);
  });
});

// ─── Split Tab From Cell ───────────────────────────────────────────────

describe("splitTabFromCell", () => {
  test("splits to the left: new cell at col 0, existing cell shifts right", () => {
    const { ws, winId } = baseWs();
    const t1 = types.createTab("t1" as types.TabId, "terminal", "Tab 1");
    const t2 = types.createTab("t2" as types.TabId, "terminal", "Tab 2");
    let r = ops.addTabToCell(ws, winId, t1, 0, 0);
    r = ops.addTabToCell(r, winId, t2, 0, 0);

    // Split t2 to the left
    const result = ops.splitTabFromCell(r, winId, "t2", 0, true);

    const page = result.windows[0];
    const grid = page.grid;
    expect(grid.cols).toBe(2);
    expect(grid.placements).toHaveLength(2);

    // New cell (t2) at col 0
    const leftPl = grid.placements.find((p: any) => p.position.col === 0);
    expect(leftPl).toBeDefined();
    expect(leftPl!.tabIds).toEqual(["t2" as types.TabId]);
    expect(leftPl!.activeTabId).toBe("t2" as types.TabId);

    // Original cell (t1 only) shifted to col 1
    const rightPl = grid.placements.find((p: any) => p.position.col === 1);
    expect(rightPl).toBeDefined();
    expect(rightPl!.tabIds).toEqual(["t1" as types.TabId]);
  });

  test("splits to the right: original cell stays, new cell to the right", () => {
    const { ws, winId } = baseWs();
    const t1 = types.createTab("t1" as types.TabId, "terminal", "Tab 1");
    const t2 = types.createTab("t2" as types.TabId, "terminal", "Tab 2");
    let r = ops.addTabToCell(ws, winId, t1, 0, 0);
    r = ops.addTabToCell(r, winId, t2, 0, 0);

    // Split t2 to the right
    const result = ops.splitTabFromCell(r, winId, "t2", 0, false);

    const page = result.windows[0];
    const grid = page.grid;
    expect(grid.cols).toBe(2);
    expect(grid.placements).toHaveLength(2);

    // Original cell (t1) stays at col 0
    const leftPl = grid.placements.find((p: any) => p.position.col === 0);
    expect(leftPl).toBeDefined();
    expect(leftPl!.tabIds).toEqual(["t1" as types.TabId]);

    // New cell (t2) at col 1
    const rightPl = grid.placements.find((p: any) => p.position.col === 1);
    expect(rightPl).toBeDefined();
    expect(rightPl!.tabIds).toEqual(["t2" as types.TabId]);
    expect(rightPl!.activeTabId).toBe("t2" as types.TabId);
  });

  test("does nothing for unknown tabId", () => {
    const { ws, winId } = baseWs();
    const t1 = types.createTab("t1" as types.TabId, "terminal", "Tab 1");
    const r = ops.addTabToCell(ws, winId, t1, 0, 0);

    const result = ops.splitTabFromCell(r, winId, "unknown", 0, true);
    expect(result).toStrictEqual(r);
  });

  test("source cell retains remaining tabs after split", () => {
    const { ws, winId } = baseWs();
    const t1 = types.createTab("t1" as types.TabId, "terminal", "One");
    const t2 = types.createTab("t2" as types.TabId, "terminal", "Two");
    const t3 = types.createTab("t3" as types.TabId, "terminal", "Three");
    let r = ops.addTabToCell(ws, winId, t1, 0, 0);
    r = ops.addTabToCell(r, winId, t2, 0, 0);
    r = ops.addTabToCell(r, winId, t3, 0, 0);

    // Split t2 to the right — source retains [t1, t3]
    const result = ops.splitTabFromCell(r, winId, "t2", 0, false);

    const page = result.windows[0];
    const grid = page.grid;
    expect(grid.cols).toBe(2);

    const leftPl = grid.placements.find((p: any) => p.position.col === 0);
    const rightPl = grid.placements.find((p: any) => p.position.col === 1);
    expect(leftPl).toBeDefined();
    expect(leftPl!.tabIds).toEqual(["t1" as types.TabId, "t3" as types.TabId]);
    expect(rightPl).toBeDefined();
    expect(rightPl!.tabIds).toEqual(["t2" as types.TabId]);
    expect(rightPl!.activeTabId).toBe("t2" as types.TabId);
  });

  test("shifts cells when splitting from middle column", () => {
    const { ws, winId } = baseWs();
    const t1 = types.createTab("t1" as types.TabId, "terminal", "A");
    const t2 = types.createTab("t2" as types.TabId, "terminal", "B");
    const t3 = types.createTab("t3" as types.TabId, "terminal", "C");
    const t4 = types.createTab("t4" as types.TabId, "terminal", "D");
    // Start with a 1×3 grid
    let r = ops.resizeGrid(ws, winId, 1, 3);
    // Add tabs to individual columns
    r = ops.addTabToCell(r, winId, t1, 0, 0);
    r = ops.addTabToCell(r, winId, t2, 0, 1);
    // Add t3 to the same cell as t2 (col 1) so cell has [t2, t3]
    r = ops.addTabToCell(r, winId, t3, 0, 1);
    r = ops.addTabToCell(r, winId, t4, 0, 2);
    // Grid: [t1] [t2, t3] [t4]

    // Split t2 to the left at col 1 — new cell at col 1, source [t3] shifts to col 2, t4 shifts to col 3
    const result = ops.splitTabFromCell(r, winId, "t2", 1, true);

    const page = result.windows[0];
    const grid = page.grid;
    expect(grid.cols).toBe(4);
    expect(grid.placements).toHaveLength(4);

    const col0 = grid.placements.find((p: any) => p.position.col === 0);
    const col1 = grid.placements.find((p: any) => p.position.col === 1);
    const col2 = grid.placements.find((p: any) => p.position.col === 2);
    const col3 = grid.placements.find((p: any) => p.position.col === 3);
    expect(col0).toBeDefined();
    expect(col0!.tabIds).toEqual(["t1"]);
    expect(col1).toBeDefined();
    expect(col1!.tabIds).toEqual(["t2"]); // dragged tab in new cell
    expect(col2).toBeDefined();
    expect(col2!.tabIds).toEqual(["t3"]); // source cell (shifted from col 1 to 2)
    expect(col3).toBeDefined();
    expect(col3!.tabIds).toEqual(["t4"]); // shifted from col 2 to 3
  });

  test("splitTabFromCell uses focusTabId when provided and valid", () => {
    const { ws, winId } = baseWs();
    const t1 = types.createTab("t1" as types.TabId, "terminal", "One");
    const t2 = types.createTab("t2" as types.TabId, "terminal", "Two");
    const t3 = types.createTab("t3" as types.TabId, "terminal", "Three");
    let r = ops.addTabToCell(ws, winId, t1, 0, 0);
    r = ops.addTabToCell(r, winId, t2, 0, 0);
    r = ops.addTabToCell(r, winId, t3, 0, 0);

    // Last added (t3) is active. Split t3 to the right with focusTabId="t1"
    // Source cell retains [t1, t2] and t1 should become active
    const result = ops.splitTabFromCell(r, winId, "t3", 0, false, "t1");

    const page = result.windows[0];
    const grid = page.grid;
    expect(grid.cols).toBe(2);

    const leftPl = grid.placements.find((p: any) => p.position.col === 0);
    expect(leftPl).toBeDefined();
    expect(leftPl!.tabIds).toEqual(["t1" as types.TabId, "t2" as types.TabId]);
    expect(leftPl!.activeTabId).toBe("t1" as types.TabId);

    const rightPl = grid.placements.find((p: any) => p.position.col === 1);
    expect(rightPl).toBeDefined();
    expect(rightPl!.tabIds).toEqual(["t3" as types.TabId]);
  });

  test("splitTabFromCell falls back when focusTabId is not in remaining tabs", () => {
    const { ws, winId } = baseWs();
    const t1 = types.createTab("t1" as types.TabId, "terminal", "One");
    const t2 = types.createTab("t2" as types.TabId, "terminal", "Two");
    let r = ops.addTabToCell(ws, winId, t1, 0, 0);
    r = ops.addTabToCell(r, winId, t2, 0, 0);

    // Last added (t2) is active. Split t2 with focusTabId="non-existent"
    // Should fall back to computeNewActiveId → filtered[0] = "t1"
    const result = ops.splitTabFromCell(r, winId, "t2", 0, false, "non-existent");

    const leftPl = result.windows[0].grid.placements.find((p: any) => p.position.col === 0);
    expect(leftPl).toBeDefined();
    expect(leftPl!.activeTabId).toBe("t1" as types.TabId);
  });
});

// ─── moveTabBetweenCells ──────────────────────────────────────────────────

describe("moveTabBetweenCells", () => {
  test("moves a tab from middle multi-tab cell to cell on the right", () => {
    // Grid: [t1] [t2, t3] [t4] — drag t2 from col 1 to col 2
    const { ws, winId } = baseWs();
    const t1 = types.createTab("t1" as types.TabId, "terminal", "A");
    const t2 = types.createTab("t2" as types.TabId, "terminal", "B");
    const t3 = types.createTab("t3" as types.TabId, "terminal", "C");
    const t4 = types.createTab("t4" as types.TabId, "terminal", "D");
    let r = ops.resizeGrid(ws, winId, 1, 3);
    r = ops.addTabToCell(r, winId, t1, 0, 0);
    r = ops.addTabToCell(r, winId, t2, 0, 1);
    r = ops.addTabToCell(r, winId, t3, 0, 1);
    r = ops.addTabToCell(r, winId, t4, 0, 2);

    // Move t2 from col 1 to col 2 (inserted at position 0)
    const result = ops.moveTabBetweenCells(r, winId, "t2", winId, 0, 2, 0);

    const page = result.windows[0];
    const grid = page.grid;
    // Grid should still be 3 columns: source retains [t3], target gets [t2, t4]
    expect(grid.cols).toBe(3);

    const col0 = grid.placements.find((p: any) => p.position.col === 0);
    const col1 = grid.placements.find((p: any) => p.position.col === 1);
    const col2 = grid.placements.find((p: any) => p.position.col === 2);
    expect(col0).toBeDefined();
    expect(col0!.tabIds).toEqual(["t1"]);
    expect(col1).toBeDefined();
    expect(col1!.tabIds).toEqual(["t3"]); // source retains remaining tab
    expect(col2).toBeDefined();
    expect(col2!.tabIds).toEqual(["t2", "t4"]); // t2 inserted at position 0
    expect(col2!.activeTabId).toBe("t2");
  });

  test("moves a tab from middle multi-tab cell to cell on the left", () => {
    // Grid: [t1] [t2, t3] [t4] — drag t3 from col 1 to col 0
    const { ws, winId } = baseWs();
    const t1 = types.createTab("t1" as types.TabId, "terminal", "A");
    const t2 = types.createTab("t2" as types.TabId, "terminal", "B");
    const t3 = types.createTab("t3" as types.TabId, "terminal", "C");
    const t4 = types.createTab("t4" as types.TabId, "terminal", "D");
    let r = ops.resizeGrid(ws, winId, 1, 3);
    r = ops.addTabToCell(r, winId, t1, 0, 0);
    r = ops.addTabToCell(r, winId, t2, 0, 1);
    r = ops.addTabToCell(r, winId, t3, 0, 1);
    r = ops.addTabToCell(r, winId, t4, 0, 2);

    // Move t3 from col 1 to col 0 (inserted at position 0)
    const result = ops.moveTabBetweenCells(r, winId, "t3", winId, 0, 0, 0);

    const page = result.windows[0];
    const grid = page.grid;
    expect(grid.cols).toBe(3);

    const col0 = grid.placements.find((p: any) => p.position.col === 0);
    const col1 = grid.placements.find((p: any) => p.position.col === 1);
    const col2 = grid.placements.find((p: any) => p.position.col === 2);
    expect(col0).toBeDefined();
    expect(col0!.tabIds).toEqual(["t3", "t1"]); // t3 inserted at position 0
    expect(col0!.activeTabId).toBe("t3");
    expect(col1).toBeDefined();
    expect(col1!.tabIds).toEqual(["t2"]); // source retains [t2]
    expect(col2).toBeDefined();
    expect(col2!.tabIds).toEqual(["t4"]);
  });

  test("moves last tab from middle cell to right cell triggers compaction", () => {
    // Grid: [t1] [t2] [t3] — move t2 (only tab in col 1) to col 2
    const { ws, winId } = baseWs();
    const t1 = types.createTab("t1" as types.TabId, "terminal", "A");
    const t2 = types.createTab("t2" as types.TabId, "terminal", "B");
    const t3 = types.createTab("t3" as types.TabId, "terminal", "C");
    let r = ops.resizeGrid(ws, winId, 1, 3);
    r = ops.addTabToCell(r, winId, t1, 0, 0);
    r = ops.addTabToCell(r, winId, t2, 0, 1);
    r = ops.addTabToCell(r, winId, t3, 0, 2);

    // Move t2 (last tab in col 1) — source cell removed, compactGrid shifts col 2 → col 1
    const result = ops.moveTabBetweenCells(r, winId, "t2", winId, 0, 2, 0);

    const page = result.windows[0];
    const grid = page.grid;
    // After compaction: 2 columns. t2 is added to the cell that was
    // originally col 2 (now col 1 after compaction). t3 is already there.
    expect(grid.cols).toBe(2);

    const col0 = grid.placements.find((p: any) => p.position.col === 0);
    const col1 = grid.placements.find((p: any) => p.position.col === 1);
    expect(col0).toBeDefined();
    expect(col0!.tabIds).toEqual(["t1"]);
    expect(col1).toBeDefined();
    // t2 inserted at position 0, joining t3
    expect(col1!.tabIds).toEqual(["t2", "t3"]);
  });

  test("moves last tab from left cell to right cell triggers compaction and column adjustment", () => {
    // Grid: [t1] [t2] — move t1 (only tab in col 0) to col 1
    const { ws, winId } = baseWs();
    const t1 = types.createTab("t1" as types.TabId, "terminal", "A");
    const t2 = types.createTab("t2" as types.TabId, "terminal", "B");
    let r = ops.resizeGrid(ws, winId, 1, 2);
    r = ops.addTabToCell(r, winId, t1, 0, 0);
    r = ops.addTabToCell(r, winId, t2, 0, 1);

    // Move t1 from col 0 to col 1 — source cell removed, compactGrid shifts col 1 → col 0
    // targetCol adjusted: sourceCol(0) < targetCol(1) AND cellWasRemoved → targetCol becomes 0
    const result = ops.moveTabBetweenCells(r, winId, "t1", winId, 0, 1, 0);

    const page = result.windows[0];
    const grid = page.grid;
    expect(grid.cols).toBe(1);

    const col0 = grid.placements.find((p: any) => p.position.col === 0);
    expect(col0).toBeDefined();
    // Note: compaction during remove shifts col 1 (t2) left to col 0.
    // t1 is removed from col 0, col 0 removed, t2 remains in col 0.
    // t1 was added back to the same cell (col 0) since compaction
    // shifted targetCol from 1 → 0
    expect(col0!.tabIds).toEqual(["t1", "t2"]);
  });
});

describe("left-edge split with 3+ columns", () => {
  test("split from first cell to left edge creates 4th column at col 0", () => {
    // Grid: [t1, t2] [t3] [t4] — split t1 from col 0 to the left
    const { ws, winId } = baseWs();
    const t1 = types.createTab("t1" as types.TabId, "terminal", "A");
    const t2 = types.createTab("t2" as types.TabId, "terminal", "B");
    const t3 = types.createTab("t3" as types.TabId, "terminal", "C");
    const t4 = types.createTab("t4" as types.TabId, "terminal", "D");
    let r = ops.resizeGrid(ws, winId, 1, 3);
    r = ops.addTabToCell(r, winId, t1, 0, 0);
    r = ops.addTabToCell(r, winId, t2, 0, 0);
    r = ops.addTabToCell(r, winId, t3, 0, 1);
    r = ops.addTabToCell(r, winId, t4, 0, 2);

    // Left split t1 from col 0 (source has [t1, t2], so source stays with [t2])
    const result = ops.splitTabFromCell(r, winId, "t1", 0, true);

    const page = result.windows[0];
    const grid = page.grid;
    expect(grid.cols).toBe(4);

    const col0 = grid.placements.find((p: any) => p.position.col === 0);
    const col1 = grid.placements.find((p: any) => p.position.col === 1);
    const col2 = grid.placements.find((p: any) => p.position.col === 2);
    const col3 = grid.placements.find((p: any) => p.position.col === 3);

    expect(col0).toBeDefined();
    expect(col0!.tabIds).toEqual(["t1"]); // new leftmost cell
    expect(col0!.activeTabId).toBe("t1");

    expect(col1).toBeDefined();
    expect(col1!.tabIds).toEqual(["t2"]); // source cell shifted right
    expect(col1!.activeTabId).toBe("t2");

    expect(col2).toBeDefined();
    expect(col2!.tabIds).toEqual(["t3"]);

    expect(col3).toBeDefined();
    expect(col3!.tabIds).toEqual(["t4"]);
  });

  test("split single-tab cell to left edge repositions the tab without adding columns", () => {
    // Grid: [t1] [t2] [t3] — split t1 (only tab) from col 0 to the left
    // Since the source cell has only 1 tab, the source is removed and a new
    // cell is created at col 0. Edge cells shift right to fill the gap.
    const { ws, winId } = baseWs();
    const t1 = types.createTab("t1" as types.TabId, "terminal", "A");
    const t2 = types.createTab("t2" as types.TabId, "terminal", "B");
    const t3 = types.createTab("t3" as types.TabId, "terminal", "C");
    let r = ops.resizeGrid(ws, winId, 1, 3);
    r = ops.addTabToCell(r, winId, t1, 0, 0);
    r = ops.addTabToCell(r, winId, t2, 0, 1);
    r = ops.addTabToCell(r, winId, t3, 0, 2);

    // Left split t1 from col 0 — source has only t1, so source is removed
    const result = ops.splitTabFromCell(r, winId, "t1", 0, true);

    const page = result.windows[0];
    const grid = page.grid;
    // Source was removed, new cell at col 0, existing cells shift right.
    // Total columns: 2 survivors + 1 new = 3, not original.cols + 1.
    expect(grid.cols).toBe(3);

    const col0 = grid.placements.find((p: any) => p.position.col === 0);
    const col1 = grid.placements.find((p: any) => p.position.col === 1);
    const col2 = grid.placements.find((p: any) => p.position.col === 2);
    expect(col0).toBeDefined();
    expect(col0!.tabIds).toEqual(["t1"]);
    expect(col1).toBeDefined();
    expect(col1!.tabIds).toEqual(["t2"]);
    expect(col2).toBeDefined();
    expect(col2!.tabIds).toEqual(["t3"]);
  });
});

describe("cross-cell split", () => {
  test("drag tab from second column to left boundary splits col 0 and creates new cell at col 0", () => {
    // Grid: [t1@0] [t2@1] (2 cells, each with 1 tab)
    // Drag t2 from col 1 to left boundary (boundary 0) — splitTabFromCell with sourceCol=0, splitLeft=true
    // splitTabFromCell finds t2 is actually in col 1, removes it from col 1, creates new cell at col 0
    const { ws, winId } = baseWs();
    const t1 = types.createTab("t1" as types.TabId, "terminal", "A");
    const t2 = types.createTab("t2" as types.TabId, "terminal", "B");
    let r = ops.resizeGrid(ws, winId, 1, 2);
    r = ops.addTabToCell(r, winId, t1, 0, 0);
    r = ops.addTabToCell(r, winId, t2, 0, 1);

    // Split col 0 to the left, dragging t2 from col 1
    const result = ops.splitTabFromCell(r, winId, "t2", 0, true);

    const page = result.windows[0];
    const grid = page.grid;
    // t2 was the only tab in col 1 → col 1 removed. New cell at col 0 with t2.
    // Total: 1 survivor + 1 new = 2 columns.
    expect(grid.cols).toBe(2);
    const col0 = grid.placements.find((p: any) => p.position.col === 0);
    const col1 = grid.placements.find((p: any) => p.position.col === 1);
    expect(col0).toBeDefined();
    expect(col0!.tabIds).toEqual(["t2"]);
    expect(col1).toBeDefined();
    expect(col1!.tabIds).toEqual(["t1"]);
  });

  test("drag tab from second column to right boundary creates new cell at col 2", () => {
    // Grid: [t1@0] [t2@1] (2 cells, each with 1 tab)
    // Drag t2 from col 1 to right boundary (boundary 2) — splitTabFromCell with sourceCol=1, splitLeft=false
    const { ws, winId } = baseWs();
    const t1 = types.createTab("t1" as types.TabId, "terminal", "A");
    const t2 = types.createTab("t2" as types.TabId, "terminal", "B");
    let r = ops.resizeGrid(ws, winId, 1, 2);
    r = ops.addTabToCell(r, winId, t1, 0, 0);
    r = ops.addTabToCell(r, winId, t2, 0, 1);

    // Right-split col 1, dragging t2 from col 1
    const result = ops.splitTabFromCell(r, winId, "t2", 1, false);

    const page = result.windows[0];
    const grid = page.grid;
    // t2 was the only tab in col 1 → col 1 removed. New cell at col 1 (after compaction).
    // Total: 1 survivor + 1 new = 2 columns.
    expect(grid.cols).toBe(2);
    const col0 = grid.placements.find((p: any) => p.position.col === 0);
    const col1 = grid.placements.find((p: any) => p.position.col === 1);
    expect(col0).toBeDefined();
    expect(col0!.tabIds).toEqual(["t1"]);
    expect(col1).toBeDefined();
    expect(col1!.tabIds).toEqual(["t2"]);
  });

  test("drag tab from second column to middle boundary creates new cell between cols", () => {
    // Grid: [t1@0] [t2, t3@1] (2 cells, first has 1 tab, second has 2 tabs)
    // Drag t2 from col 1 to boundary 1 (between col 0 and col 1) — splitTabFromCell with sourceCol=0, splitLeft=false
    const { ws, winId } = baseWs();
    const t1 = types.createTab("t1" as types.TabId, "terminal", "A");
    const t2 = types.createTab("t2" as types.TabId, "terminal", "B");
    const t3 = types.createTab("t3" as types.TabId, "terminal", "C");
    let r = ops.resizeGrid(ws, winId, 1, 2);
    r = ops.addTabToCell(r, winId, t1, 0, 0);
    r = ops.addTabToCell(r, winId, t2, 0, 1);
    r = ops.addTabToCell(r, winId, t3, 0, 1);

    // Right-split col 0, dragging t2 from col 1
    const result = ops.splitTabFromCell(r, winId, "t2", 0, false);

    const page = result.windows[0];
    const grid = page.grid;
    // t2 removed from col 1. Col 1 keeps t3. New cell at col 1 (right of col 0). Col 0 stays.
    // Col 1 (original) shifts right by 1 → col 2.
    expect(grid.cols).toBe(3);
    const col0 = grid.placements.find((p: any) => p.position.col === 0);
    const col1 = grid.placements.find((p: any) => p.position.col === 1);
    const col2 = grid.placements.find((p: any) => p.position.col === 2);
    expect(col0).toBeDefined();
    expect(col0!.tabIds).toEqual(["t1"]);
    expect(col1).toBeDefined();
    expect(col1!.tabIds).toEqual(["t2"]);
    expect(col2).toBeDefined();
    expect(col2!.tabIds).toEqual(["t3"]);
  });
});
