// @vitest-environment node
/**
 * Integration tests for layout operations — sequences of operations
 * across the real production code paths.
 *
 * Unlike unit tests (test/unit/layout/operations.test.ts) which test
 * individual operations in isolation, these tests exercise **sequences**
 * of operations and verify cross-system invariants hold.
 */

import { describe, it, expect } from "vitest";
import * as types from "@openp41ge/layout/types";
import * as ops from "@openp41ge/layout/operations";

// ─── Test Scenarios ────────────────────────────────────────────────────────

describe("Layout operations — integration", () => {
  describe("Tab lifecycle (create → add → remove → compact)", () => {
    it("creates a workspace, adds tabs to multiple columns, removes one, and verifies compaction", () => {
      // Start with empty workspace
      const ws = types.createWorkspace("ws-lifecycle");
      const winId = ws.windows[0].id;

      // Add three tabs to three columns
      const t1 = types.createTab("t1", "terminal", "Terminal");
      const t2 = types.createTab("t2", "markdown", "Markdown");
      const t3 = types.createTab("t3", "video", "Video");

      let r = ops.resizeGrid(ws, winId, 1, 3);
      r = ops.addTabToCell(r, winId, t1, 0, 0);
      r = ops.addTabToCell(r, winId, t2, 0, 1);
      r = ops.addTabToCell(r, winId, t3, 0, 2);

      // Verify all three tabs placed
      expect(r.windows[0].grid.placements).toHaveLength(3);
      expect(r.windows[0].grid.cols).toBe(3);

      // Remove the middle tab (col 1)
      r = ops.removeTabFromCell(r, winId, "t2");

      // Verify compaction: 2 columns, 2 placements, shifted positions
      const grid = r.windows[0].grid;
      expect(grid.cols).toBe(2);
      expect(grid.placements).toHaveLength(2);

      const p1 = grid.placements.find((p) => p.tabIds.includes("t1"));
      const p3 = grid.placements.find((p) => p.tabIds.includes("t3"));
      expect(p1?.position.col).toBe(0);
      expect(p3?.position.col).toBe(1);
    });

    it("preserves tab registry after remove", () => {
      const ws = types.createWorkspace("ws-registry");
      const winId = ws.windows[0].id;

      const t1 = types.createTab("t1", "terminal", "Terminal");
      let r = ops.addTabToCell(ws, winId, t1, 0, 0);
      r = ops.removeTabFromCell(r, winId, "t1");

      // Tab should still exist in workspace.tabs even after removal from grid
      expect(r.editorTabs["t1"]).toBeDefined();
      expect(r.editorTabs["t1"].title).toBe("Terminal");
    });

    it("handles multiple tabs in a single cell (stacked tabs)", () => {
      const ws = types.createWorkspace("ws-stack");
      const winId = ws.windows[0].id;

      const t1 = types.createTab("t1", "terminal", "Terminal");
      const t2 = types.createTab("t2", "markdown", "Markdown");
      const t3 = types.createTab("t3", "video", "Video");

      let r = ops.addTabToCell(ws, winId, t1, 0, 0);
      r = ops.addTabToCell(r, winId, t2, 0, 0);
      r = ops.addTabToCell(r, winId, t3, 0, 0);

      const placement = r.windows[0].grid.placements[0];
      expect(placement.tabIds).toEqual(["t1", "t2", "t3"]);

      // Remove middle tab
      r = ops.removeTabFromCell(r, winId, "t2");
      expect(r.windows[0].grid.placements).toHaveLength(1);
      expect(r.windows[0].grid.placements[0].tabIds).toEqual(["t1", "t3"]);
    });
  });

  describe("Grid expansion and compaction sequences", () => {
    it("fills all cells then adds a new column", () => {
      const ws = types.createWorkspace("ws-grid-expand");
      const winId = ws.windows[0].id;

      // Start with 1×2 grid
      let r = ops.resizeGrid(ws, winId, 1, 2);
      const t1 = types.createTab("t1", "terminal", "Terminal");
      const t2 = types.createTab("t2", "markdown", "Markdown");
      r = ops.addTabToCell(r, winId, t1, 0, 0);
      r = ops.addTabToCell(r, winId, t2, 0, 1);

      // Grid is full — next tab should trigger addColumnTab behavior
      const t3 = types.createTab("t3", "video", "Video");
      r = ops.addColumnTab(r, winId, "terminal", "Another Terminal");

      // addColumnTab creates a new column when grid is full
      const grid = r.windows[0].grid;
      expect(grid.cols).toBe(3);
      expect(grid.placements).toHaveLength(3);

      // The new tab should be in column 2 (the first empty cell)
      const newPlacement = grid.placements.find((p) => p.position.col === 2);
      expect(newPlacement).toBeDefined();
    });

    it("compacts grid when a middle column becomes empty", () => {
      const ws = types.createWorkspace("ws-compact");
      const winId = ws.windows[0].id;

      let r = ops.resizeGrid(ws, winId, 1, 4);
      const tabs = ["t1", "t2", "t3", "t4"].map((id, i) =>
        types.createTab(id, "terminal", `Tab ${i}`),
      );
      tabs.forEach((t, i) => {
        r = ops.addTabToCell(r, winId, t, 0, i);
      });
      expect(r.windows[0].grid.cols).toBe(4);

      // Remove column 1 (middle)
      r = ops.removeTabFromCell(r, winId, "t2");

      const grid = r.windows[0].grid;
      expect(grid.cols).toBe(3);
      // t3 moves from col 2 to col 1, t4 from col 3 to col 2
      const t3p = grid.placements.find((p) => p.tabIds.includes("t3"));
      const t4p = grid.placements.find((p) => p.tabIds.includes("t4"));
      expect(t3p?.position.col).toBe(1);
      expect(t4p?.position.col).toBe(2);
    });

    it("removing the first column shifts all columns left", () => {
      const ws = types.createWorkspace("ws-compact-first");
      const winId = ws.windows[0].id;

      let r = ops.resizeGrid(ws, winId, 1, 3);
      const t1 = types.createTab("t1", "terminal", "T1");
      const t2 = types.createTab("t2", "terminal", "T2");
      const t3 = types.createTab("t3", "terminal", "T3");
      r = ops.addTabToCell(r, winId, t1, 0, 0);
      r = ops.addTabToCell(r, winId, t2, 0, 1);
      r = ops.addTabToCell(r, winId, t3, 0, 2);

      // Remove first column
      r = ops.removeTabFromCell(r, winId, "t1");

      const grid = r.windows[0].grid;
      expect(grid.cols).toBe(2);
      const t2p = grid.placements.find((p) => p.tabIds.includes("t2"));
      const t3p = grid.placements.find((p) => p.tabIds.includes("t3"));
      expect(t2p?.position.col).toBe(0);
      expect(t3p?.position.col).toBe(1);
    });
  });

  describe("Tab reorder and switching sequences", () => {
    it("reorders tabs then activates a specific tab", () => {
      const ws = types.createWorkspace("ws-reorder");
      const winId = ws.windows[0].id;

      const t1 = types.createTab("t1", "a", "Alpha");
      const t2 = types.createTab("t2", "b", "Beta");
      const t3 = types.createTab("t3", "c", "Gamma");

      let r = ops.addTabToCell(ws, winId, t1, 0, 0);
      r = ops.addTabToCell(r, winId, t2, 0, 0);
      r = ops.addTabToCell(r, winId, t3, 0, 0);

      // Active tab is t3 (last added)
      expect(r.windows[0].grid.placements[0].activeTabId).toBe("t3");

      // Activate t1
      r = ops.activateTabInCell(r, winId, "t1");
      expect(r.windows[0].grid.placements[0].activeTabId).toBe("t1");
      // activeTabId is separate from tabIds[0] — activation just sets the ID
      expect(r.windows[0].grid.placements[0].tabIds).toEqual(["t1", "t2", "t3"]);
    });

    it("reorders tabs and places the moved tab at the new index", () => {
      const ws = types.createWorkspace("ws-reorder-idx");
      const winId = ws.windows[0].id;

      const t1 = types.createTab("t1", "a", "Alpha");
      const t2 = types.createTab("t2", "b", "Beta");
      const t3 = types.createTab("t3", "c", "Gamma");

      let r = ops.addTabToCell(ws, winId, t1, 0, 0);
      r = ops.addTabToCell(r, winId, t2, 0, 0);
      r = ops.addTabToCell(r, winId, t3, 0, 0);

      // Move t1 (idx 0) to idx 2
      r = ops.reorderTabsInCell(r, winId, 0, 0, 0, 2);
      expect(r.windows[0].grid.placements[0].tabIds).toEqual(["t2", "t3", "t1"]);
    });
  });

  describe("Tab move between cells", () => {
    it("moves a tab from one cell to another cell in the same window (source retains a tab)", () => {
      const ws = types.createWorkspace("ws-move");
      const winId = ws.windows[0].id;

      let r = ops.resizeGrid(ws, winId, 1, 2);
      // Put two tabs in col 0 so source cell doesn't become empty after move
      const t1 = types.createTab("t1", "terminal", "Terminal");
      const t3 = types.createTab("t3", "markdown", "Extra");
      const t2 = types.createTab("t2", "video", "Video");
      r = ops.addTabToCell(r, winId, t1, 0, 0);
      r = ops.addTabToCell(r, winId, t3, 0, 0);
      r = ops.addTabToCell(r, winId, t2, 0, 1);

      // Move t1 to cell at (0, 1) — should join with t2; t3 stays at col 0
      r = ops.moveTabBetweenCells(r, winId, "t1", winId, 0, 1);

      const placements = r.windows[0].grid.placements;
      expect(placements).toHaveLength(2); // Both cells still exist
      const targetCell = placements.find((p) => p.position.col === 1);
      expect(targetCell).toBeDefined();
      expect(targetCell?.tabIds).toContain("t1");
      expect(targetCell?.tabIds).toContain("t2");

      // Source cell still has t3
      const sourceCell = placements.find((p) => p.position.col === 0);
      expect(sourceCell?.tabIds).toEqual(["t3"]);
    });

    it("removes tab from source cell when moving to a different column", () => {
      const ws = types.createWorkspace("ws-move-remove");
      const winId = ws.windows[0].id;

      let r = ops.resizeGrid(ws, winId, 1, 3);
      const t1 = types.createTab("t1", "terminal", "T1");
      const t2 = types.createTab("t2", "terminal", "T2");
      r = ops.addTabToCell(r, winId, t1, 0, 0);
      r = ops.addTabToCell(r, winId, t2, 0, 1);

      // Move t2 from col 1 to col 0
      r = ops.moveTabBetweenCells(r, winId, "t2", winId, 0, 0);

      const placements = r.windows[0].grid.placements;
      const sourceCell = placements.find((p) => p.position.col === 0);
      expect(sourceCell?.tabIds).toContain("t1");
      expect(sourceCell?.tabIds).toContain("t2");

      // Column 1 should be gone (compacted since it's now empty)
      expect(placements.find((p) => p.position.col === 1)).toBeUndefined();
    });
  });

  describe("Split tab from cell sequences", () => {
    it("splits a single tab from a cell with multiple tabs, creating a new column", () => {
      const ws = types.createWorkspace("ws-split");
      const winId = ws.windows[0].id;

      const t1 = types.createTab("t1", "terminal", "Terminal");
      const t2 = types.createTab("t2", "markdown", "Markdown");
      let r = ops.addTabToCell(ws, winId, t1, 0, 0);
      r = ops.addTabToCell(r, winId, t2, 0, 0);

      // Split t2 into a new column to the right (splitLeft=false)
      r = ops.splitTabFromCell(r, winId, "t2", 0, false);

      const grid = r.windows[0].grid;
      expect(grid.cols).toBe(2);
      expect(grid.placements).toHaveLength(2);

      const col0 = grid.placements.find((p) => p.position.col === 0);
      const col1 = grid.placements.find((p) => p.position.col === 1);
      expect(col0?.tabIds).toEqual(["t1"]);
      expect(col1?.tabIds).toEqual(["t2"]);
    });

    it("splits tab to the left (insert before)", () => {
      const ws = types.createWorkspace("ws-split-left");
      const winId = ws.windows[0].id;

      const t1 = types.createTab("t1", "terminal", "One");
      const t2 = types.createTab("t2", "markdown", "Two");
      let r = ops.addTabToCell(ws, winId, t1, 0, 0);
      r = ops.addTabToCell(r, winId, t2, 0, 0);

      // Split t1 into a new column to the left of col 0
      r = ops.splitTabFromCell(r, winId, "t1", 0, true);

      const grid = r.windows[0].grid;
      expect(grid.cols).toBe(2);
      const col0 = grid.placements.find((p) => p.position.col === 0);
      const col1 = grid.placements.find((p) => p.position.col === 1);
      expect(col0?.tabIds).toEqual(["t1"]);
      expect(col1?.tabIds).toEqual(["t2"]);
    });
  });

  describe("Window operations sequences", () => {
    it("creates a second window, adds a tab to it, then closes it", () => {
      const ws = types.createWorkspace("ws-windows");
      const winId1 = ws.windows[0].id;

      let r = ops.addWindow(ws, "w2");
      expect(r.windows).toHaveLength(2);

      const t1 = types.createTab("t1", "terminal", "Terminal");
      r = ops.addTabToCell(r, "w2", t1, 0, 0);
      expect(r.windows[1].grid.placements).toHaveLength(1);

      r = ops.closeWindow(r, "w2");
      expect(r.windows).toHaveLength(1);
      expect(r.windows[0].id).toBe(winId1);
    });

    it("detaches a tab to a new window and verifies both windows", () => {
      const ws = types.createWorkspace("ws-detach");
      const winId = ws.windows[0].id;

      const t1 = types.createTab("t1", "terminal", "Terminal");
      const t2 = types.createTab("t2", "markdown", "Markdown");
      let r = ops.addTabToCell(ws, winId, t1, 0, 0);
      r = ops.addTabToCell(r, winId, t2, 0, 0);

      // Detach t1 to a new window
      r = ops.detachTabToWindow(r, winId, "t1");

      expect(r.windows).toHaveLength(2);
      const newWin = r.windows.find((w) => w.id !== winId)!;
      expect(newWin.grid.placements).toHaveLength(1);
      expect(newWin.grid.placements[0].tabIds).toContain("t1");

      // Original window should still have t2
      const origWin = r.windows.find((w) => w.id === winId)!;
      expect(origWin.grid.placements[0].tabIds).toContain("t2");
    });

    it("moves a window and updates its bounds", () => {
      const ws = types.createWorkspace("ws-move-window");
      const winId = ws.windows[0].id;

      const result = ops.moveWindow(ws, winId, { x: 100, y: 200, width: 800, height: 600 }, 1);

      expect(result.windows[0].bounds).toEqual({ x: 100, y: 200, width: 800, height: 600 });
      expect(result.windows[0].monitor).toBe(1);
    });
  });

  describe("Overlay lifecycle with grid tabs", () => {
    it("creates overlay, positions it, then removes it alongside grid tabs", () => {
      const ws = types.createWorkspace("ws-overlay");
      const winId = ws.windows[0].id;

      // Add a grid tab
      const t1 = types.createTab("t1", "terminal", "Terminal");
      let r = ops.addTabToCell(ws, winId, t1, 0, 0);

      // Add an overlay
      const oTab = types.createTab("o1", "video", "Video");
      r = ops.createOverlay(r, winId, oTab, "top-left");
      expect(r.windows[0].overlays).toHaveLength(1);
      expect(r.windows[0].overlays[0].position).toBe("top-left");

      // Move the overlay
      const overlayId = r.windows[0].overlays[0].id;
      r = ops.moveOverlay(r, winId, overlayId, { x: 50, y: 50 });
      expect(r.windows[0].overlays[0].position).toEqual({ x: 50, y: 50 });

      // Remove the overlay
      r = ops.removeOverlay(r, winId, overlayId);
      expect(r.windows[0].overlays).toHaveLength(0);

      // Grid tab should still be intact
      expect(r.windows[0].grid.placements).toHaveLength(1);
    });
  });

  describe("Sidebar + tab sequences", () => {
    it("sets sidebar view, adds tabs, toggles sidebar, and maintains state", () => {
      const ws = types.createWorkspace("ws-sidebar");
      const winId = ws.windows[0].id;

      // Open explorer system tab in right sidebar
      let r = ops.openSystemTab(ws, winId, "right", "explorer", "Explorer");
      expect(r.windows[0].sidebar?.rightSidebarTabs).toHaveLength(1);
      expect(r.windows[0].sidebar?.rightSidebarOpen).toBe(true);

      // Add a tab
      const t1 = types.createTab("t1", "terminal", "Terminal");
      r = ops.addTabToCell(r, winId, t1, 0, 0);
      expect(r.windows[0].grid.placements).toHaveLength(1);

      // Toggle sidebar off
      r = ops.toggleSidebar(r, winId, "right");
      expect(r.windows[0].sidebar?.rightSidebarOpen).toBe(false);

      // Tab should still be there
      expect(r.windows[0].grid.placements).toHaveLength(1);

      // Reopen sidebar
      r = ops.openSidebar(r, winId, "right");
      expect(r.windows[0].sidebar?.rightSidebarOpen).toBe(true);
    });
  });

  describe("Column tab management sequences", () => {
    it("fill grid with addColumnTab then remove and verify compaction", () => {
      const ws = types.createWorkspace("ws-col-mgmt");
      const winId = ws.windows[0].id;

      // Fill to 3 columns
      let r = ops.resizeGrid(ws, winId, 1, 3);
      const t1 = types.createTab("t1", "a", "A");
      const t2 = types.createTab("t2", "b", "B");
      const t3 = types.createTab("t3", "c", "C");
      r = ops.addTabToCell(r, winId, t1, 0, 0);
      r = ops.addTabToCell(r, winId, t2, 0, 1);
      r = ops.addTabToCell(r, winId, t3, 0, 2);

      // Remove middle
      r = ops.removeColumnTab(r, winId, "t2");

      const grid = r.windows[0].grid;
      expect(grid.cols).toBe(2);
      const p1 = grid.placements.find((p) => p.tabIds.includes("t1"));
      const p2 = grid.placements.find((p) => p.tabIds.includes("t3"));
      expect(p1?.position.col).toBe(0);
      expect(p2?.position.col).toBe(1);
    });

    it("defaults appType to terminal when addColumnTab has no type", () => {
      const ws = types.createWorkspace("ws-col-default");
      const winId = ws.windows[0].id;

      const result = ops.addColumnTab(ws, winId);
      const tabId = result.windows[0].grid.placements[0].tabIds[0];
      expect(result.editorTabs[tabId].appType).toBe("terminal");
    });
  });
});
