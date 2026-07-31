// @vitest-environment node
/**
 * Integration tests for window operations — creating, closing, moving windows,
 * detaching tabs to new windows, and verifying multi-window workspace state.
 */

import { describe, it, expect } from "vitest";
import * as types from "@openp41ge/layout/types";
import * as ops from "@openp41ge/layout/operations";

describe("Window operations — integration", () => {
  describe("Multi-window state", () => {
    it("creates multiple windows with distinct IDs", () => {
      const ws = types.createWorkspace("ws-mw");

      let r = ops.addWindow(ws, "w2");
      r = ops.addWindow(r, "w3");

      expect(r.windows).toHaveLength(3);
      expect(r.windows[0].id).toBe(ws.windows[0].id);
      expect(r.windows[1].id).toBe("w2");
      expect(r.windows[2].id).toBe("w3");
    });

    it("each window has its own independent grid", () => {
      const ws = types.createWorkspace("ws-indep-grid");
      let r = ops.addWindow(ws, "w2");

      // Add tab to first window
      const t1 = types.createTab("t1", "terminal", "T1");
      r = ops.addTabToCell(r, r.windows[0].id, t1, 0, 0);

      // Add tab to second window
      const t2 = types.createTab("t2", "markdown", "T2");
      r = ops.addTabToCell(r, "w2", t2, 0, 0);

      expect(r.windows[0].grid.placements).toHaveLength(1);
      expect(r.windows[0].grid.placements[0].tabIds).toContain("t1");

      expect(r.windows[1].grid.placements).toHaveLength(1);
      expect(r.windows[1].grid.placements[0].tabIds).toContain("t2");
    });
  });

  describe("Window closing behavior", () => {
    it("closing a window removes its tabs from the visible grid", () => {
      const ws = types.createWorkspace("ws-close");
      let r = ops.addWindow(ws, "w2");
      const winId1 = r.windows[0].id;

      const t1 = types.createTab("t1", "terminal", "T1");
      r = ops.addTabToCell(r, winId1, t1, 0, 0);
      const t2 = types.createTab("t2", "markdown", "T2");
      r = ops.addTabToCell(r, "w2", t2, 0, 0);

      r = ops.closeWindow(r, "w2");

      expect(r.windows).toHaveLength(1);
      expect(r.windows[0].id).toBe(winId1);
      // Tab t1 should still exist in workspace tabs
      expect(r.editorTabs["t1"]).toBeDefined();
      // Tab t2 should still exist in workspace tabs (just not visible)
      expect(r.editorTabs["t2"]).toBeDefined();
    });

    it("closing all windows still preserves workspace", () => {
      const ws = types.createWorkspace("ws-close-all");

      // Create a second window
      let r = ops.addWindow(ws, "w2");
      r = ops.closeWindow(r, r.windows[0].id);
      r = ops.closeWindow(r, r.windows.find((w) => w.id !== undefined)?.id ?? "w2");

      // Should not error — just empty windows array
      expect(r.windows).toHaveLength(0);
      expect(r.id).toBe("ws-close-all");
    });
  });

  describe("Tab-to-window operations", () => {
    it("creates a new window with a single detached tab", () => {
      const ws = types.createWorkspace("ws-detach-tab");
      const winId = ws.windows[0].id;

      const t1 = types.createTab("t1", "terminal", "Terminal");
      let r = ops.addTabToCell(ws, winId, t1, 0, 0);

      r = ops.detachTabToWindow(r, winId, "t1");

      expect(r.windows).toHaveLength(2);
      const newWin = r.windows.find((w) => w.id !== winId)!;
      expect(newWin.grid.placements).toHaveLength(1);
      expect(newWin.grid.placements[0].tabIds).toContain("t1");

      // Original window should be empty (but still exist)
      const origWin = r.windows.find((w) => w.id === winId)!;
      expect(origWin.grid.placements).toHaveLength(0);
    });

    it("moves a tab between windows (moveTabToWindow)", () => {
      const ws = types.createWorkspace("ws-move-to-win");
      const winId1 = ws.windows[0].id;

      let r = ops.addWindow(ws, "w2");
      const winId2 = "w2";

      // Add tab to window 1
      const t1 = types.createTab("t1", "terminal", "T1");
      r = ops.addTabToCell(r, winId1, t1, 0, 0);

      // Add a tab to window 2 so it has a cell
      const t2 = types.createTab("t2", "markdown", "T2");
      r = ops.addTabToCell(r, winId2, t2, 0, 0);

      // Move t1 from window 1 to window 2
      r = ops.moveTabToWindow(r, "t1", winId2, 0, 0);

      // t1 should be in window 2
      const win2 = r.windows.find((w) => w.id === winId2)!;
      expect(win2.grid.placements[0].tabIds).toContain("t1");
      expect(win2.grid.placements[0].tabIds).toContain("t2");

      // Window 1 should be empty (compacted since no tabs left)
      const win1 = r.windows.find((w) => w.id === winId1)!;
      expect(win1.grid.placements).toHaveLength(0);
    });
  });

  describe("Window move and bounds", () => {
    it("updates bounds for a specific window while others remain unchanged", () => {
      const ws = types.createWorkspace("ws-bounds");
      let r = ops.addWindow(ws, "w2");

      // Move first window
      r = ops.moveWindow(r, r.windows[0].id, { x: 0, y: 0, width: 1920, height: 1080 }, 0);

      // Move second window
      r = ops.moveWindow(r, "w2", { x: 100, y: 50, width: 800, height: 600 }, 1);

      const w1 = r.windows[0];
      const w2 = r.windows[1];
      expect(w1.bounds).toEqual({ x: 0, y: 0, width: 1920, height: 1080 });
      expect(w1.monitor).toBe(0);
      expect(w2.bounds).toEqual({ x: 100, y: 50, width: 800, height: 600 });
      expect(w2.monitor).toBe(1);
    });
  });

  describe("Window level operations preserve tabs registry", () => {
    it("workspace tabs registry survives window create/close cycles", () => {
      const ws = types.createWorkspace("ws-registry-survive");
      const winId = ws.windows[0].id;

      const t1 = types.createTab("t1", "terminal", "T1");
      let r = ops.addTabToCell(ws, winId, t1, 0, 0);

      // Detach tab to new window
      r = ops.detachTabToWindow(r, winId, "t1");
      const newWin = r.windows.find((w) => w.id !== winId)!;

      // Close the new window
      r = ops.closeWindow(r, newWin.id);

      // Tab should still exist in the workspace registry
      expect(r.editorTabs["t1"]).toBeDefined();
      expect(r.editorTabs["t1"].title).toBe("T1");
    });
  });
});
