// @vitest-environment node
/**
 * Integration tests for IPC handler registration and wiring.
 *
 * These tests verify that the OperationDispatcher, when wired to a
 * simulated IPC dispatch path (the same pattern as the Electron ipcMain
 * handlers), correctly routes operations and produces state changes.
 *
 * We cannot test actual Electron IPC (ipcMain/ipcRenderer) in vitest,
 * so we test the underlying wiring: calling dispatcher.apply() with
 * the same payloads that the IPC handler would pass through.
 */

import { describe, it, expect, vi } from "vitest";
import { OperationDispatcher } from "@openp41ge/main/services/operation-dispatcher";

describe("IPC wiring simulation", () => {
  /**
   * Simulates the core dispatch path that the Electron IPC handler uses:
   *
   *   ipcMain.on("openp41ge:dispatch", (event, payload) => {
   *     const { fn, args } = JSON.parse(payload);
   *     if (dispatcher.apply(fn, args)) {
   *       dispatcher.broadcast();
   *     }
   *   });
   */

  function simulateIpcDispatch(
    dispatcher: OperationDispatcher,
    fn: string,
    ...args: unknown[]
  ): boolean {
    const result = dispatcher.apply(fn, args);
    if (result) {
      dispatcher.broadcast();
    }
    return result;
  }

  describe("core dispatch wiring", () => {
    it("routes workspace operations through simulated IPC path", () => {
      const dispatcher = new OperationDispatcher();
      const broadcastFn = vi.fn();
      dispatcher.setBroadcast(broadcastFn);

      const ws = dispatcher.getWorkspace();
      const winId = ws.windows[0].id;

      // Simulate IPC dispatch
      const result = simulateIpcDispatch(
        dispatcher,
        "addTabToCell",
        winId,
        { id: "t1", appType: "terminal", title: "Terminal", config: {}, isPreview: false },
        0,
        0,
      );

      expect(result).toBe(true);
      expect(broadcastFn).toHaveBeenCalledTimes(1);

      const state = dispatcher.getWorkspace();
      expect(state.editorTabs["t1"]).toBeDefined();
    });

    it("does not broadcast on failed operation", () => {
      const dispatcher = new OperationDispatcher();
      const broadcastFn = vi.fn();
      dispatcher.setBroadcast(broadcastFn);

      const result = simulateIpcDispatch(dispatcher, "nonExistentOp");
      expect(result).toBe(false);
      expect(broadcastFn).not.toHaveBeenCalled();
    });
  });

  describe("window operations through dispatch", () => {
    it("creates and closes windows via dispatch", () => {
      const dispatcher = new OperationDispatcher();

      // Create a window via dispatch
      const result = dispatcher.apply("addWindow", ["w2"]);
      expect(result).toBe(true);
      expect(dispatcher.getWorkspace().windows).toHaveLength(2);

      // Close it
      dispatcher.apply("closeWindow", ["w2"]);
      expect(dispatcher.getWorkspace().windows).toHaveLength(1);
    });

    it("detaches a tab to a new window via dispatch", () => {
      const dispatcher = new OperationDispatcher();
      const ws = dispatcher.getWorkspace();
      const winId = ws.windows[0].id;

      dispatcher.apply("addTabToCell", [
        winId,
        { id: "t1", appType: "terminal", title: "T1", config: {}, isPreview: false },
        0,
        0,
      ]);

      const result = dispatcher.apply("detachTabToWindow", [winId, "t1"]);
      expect(result).toBe(true);
      expect(dispatcher.getWorkspace().windows).toHaveLength(2);

      const newWin = dispatcher.getWorkspace().windows.find((w: any) => w.id !== winId);
      expect(newWin).toBeDefined();
      expect(newWin.grid.placements[0]?.tabIds).toContain("t1");
    });
  });

  describe("grid operations through dispatch", () => {
    it("resizes grid and adds tabs via dispatch", () => {
      const dispatcher = new OperationDispatcher();
      const ws = dispatcher.getWorkspace();
      const winId = ws.windows[0].id;

      dispatcher.apply("resizeGrid", [winId, 1, 3]);
      expect(dispatcher.getWorkspace().windows[0].grid.cols).toBe(3);

      dispatcher.apply("addTabToCell", [
        winId,
        { id: "t1", appType: "terminal", title: "T1", config: {}, isPreview: false },
        0,
        0,
      ]);
      dispatcher.apply("addTabToCell", [
        winId,
        { id: "t2", appType: "markdown", title: "T2", config: {}, isPreview: false },
        0,
        1,
      ]);
      dispatcher.apply("addTabToCell", [
        winId,
        { id: "t3", appType: "video", title: "T3", config: {}, isPreview: false },
        0,
        2,
      ]);

      expect(dispatcher.getWorkspace().windows[0].grid.placements).toHaveLength(3);
    });

    it("moves tabs between cells via dispatch (source cell retains a tab)", () => {
      const dispatcher = new OperationDispatcher();
      const ws = dispatcher.getWorkspace();
      const winId = ws.windows[0].id;

      dispatcher.apply("resizeGrid", [winId, 1, 2]);
      // Add two tabs to col 0 (so source cell keeps one after move)
      dispatcher.apply("addTabToCell", [
        winId,
        { id: "t1", appType: "terminal", title: "T1", config: {}, isPreview: false },
        0,
        0,
      ]);
      dispatcher.apply("addTabToCell", [
        winId,
        { id: "t3", appType: "markdown", title: "T3", config: {}, isPreview: false },
        0,
        0,
      ]);
      // Add one tab to col 1
      dispatcher.apply("addTabToCell", [
        winId,
        { id: "t2", appType: "video", title: "T2", config: {}, isPreview: false },
        0,
        1,
      ]);

      // Move t1 from col 0 to col 1 — col 0 still has t3 so it doesn't compact
      dispatcher.apply("moveTabBetweenCells", [winId, "t1", winId, 0, 1]);
      const placements = dispatcher.getWorkspace().windows[0].grid.placements;
      const targetCell = placements.find((p: any) => p.position.col === 1);
      expect(targetCell).toBeDefined();
      expect(targetCell?.tabIds).toContain("t1");
      expect(targetCell?.tabIds).toContain("t2");
    });
  });

  describe("sidebar operations through dispatch", () => {
    it("sets, toggles, and checks sidebar state via dispatch", () => {
      const dispatcher = new OperationDispatcher();
      const ws = dispatcher.getWorkspace();
      const winId = ws.windows[0].id;

      dispatcher.apply("openSystemTab", [winId, "right", "explorer", "Explorer"]);
      const state = dispatcher.getWorkspace();
      expect(state.windows[0].sidebar?.activeRightTab).toBeDefined();

      dispatcher.apply("closeSidebar", [winId, "right"]);
      expect(dispatcher.getWorkspace().windows[0].sidebar?.rightSidebarOpen).toBe(false);
    });
  });

  describe("error handling", () => {
    it("gracefully handles malformed arguments", () => {
      const dispatcher = new OperationDispatcher();

      // Missing required args
      const result = dispatcher.apply("addTabToCell", []);
      // addTabToCell requires (workspace, windowId, tab, row, col) — called with only []
      // Should return false because we passed insufficient args
      // The workspace is prepended by OperationDispatcher, so it gets called as
      // fn(workspace, undefined, undefined, undefined, undefined) which may throw
      expect(result).toBe(false);
    });
  });
});
