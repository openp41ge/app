// @vitest-environment node
/**
 * Integration tests for command dispatch — the OperationDispatcher wiring
 * that maps named operations (strings) to layout functions from operations.ts.
 *
 * These tests exercise the real OperationDispatcher class with real layout
 * operations, verifying that dispatch routing, state mutation, and error
 * handling work end-to-end without Electron.
 */

import { describe, it, expect, vi } from "vitest";
import { OperationDispatcher } from "@openp41ge/main/services/operation-dispatcher";
import { createWorkspace } from "@openp41ge/layout/types";

describe("Command dispatch — OperationDispatcher", () => {
  describe("Basic dispatch", () => {
    it("applies addTabToCell operation and updates workspace state", () => {
      const dispatcher = new OperationDispatcher();
      const ws = dispatcher.getWorkspace();
      const winId = ws.windows[0].id;

      const result = dispatcher.apply("addTabToCell", [
        winId,
        { id: "t1", appType: "terminal", title: "Terminal", config: {}, isPreview: false },
        0,
        0,
      ]);

      expect(result).toBe(true);
      const state = dispatcher.getWorkspace();
      expect(state.windows[0].grid.placements).toHaveLength(1);
      expect(state.tabs["t1"]).toBeDefined();
      expect(state.tabs["t1"].title).toBe("Terminal");
    });

    it("applies multiple operations in sequence", () => {
      const dispatcher = new OperationDispatcher();
      const ws = dispatcher.getWorkspace();
      const winId = ws.windows[0].id;

      // Add first tab
      dispatcher.apply("addTabToCell", [
        winId,
        { id: "t1", appType: "terminal", title: "T1", config: {}, isPreview: false },
        0,
        0,
      ]);

      // Add second tab in another column
      dispatcher.apply("resizeGrid", [winId, 1, 2]);
      dispatcher.apply("addTabToCell", [
        winId,
        { id: "t2", appType: "markdown", title: "T2", config: {}, isPreview: false },
        0,
        1,
      ]);

      const state = dispatcher.getWorkspace();
      expect(state.windows[0].grid.placements).toHaveLength(2);
      expect(state.tabs["t1"]).toBeDefined();
      expect(state.tabs["t2"]).toBeDefined();
    });

    it("returns false for unknown operation name", () => {
      const dispatcher = new OperationDispatcher();
      const result = dispatcher.apply("nonExistentOperation", []);
      expect(result).toBe(false);
    });
  });

  describe("Remove and close operations", () => {
    it("removes a tab and triggers no broadcast (no callback set)", () => {
      const dispatcher = new OperationDispatcher();
      const ws = dispatcher.getWorkspace();
      const winId = ws.windows[0].id;

      dispatcher.apply("addTabToCell", [
        winId,
        { id: "t1", appType: "terminal", title: "T1", config: {}, isPreview: false },
        0,
        0,
      ]);

      const result = dispatcher.apply("removeTabFromCell", [winId, "t1"]);
      expect(result).toBe(true);
      const state = dispatcher.getWorkspace();
      expect(state.windows[0].grid.placements).toHaveLength(0);
    });

    it("closes a window with tabs", () => {
      const dispatcher = new OperationDispatcher();
      const ws = dispatcher.getWorkspace();
      const winId = ws.windows[0].id;

      dispatcher.apply("addTabToCell", [
        winId,
        { id: "t1", appType: "terminal", title: "T1", config: {}, isPreview: false },
        0,
        0,
      ]);

      // Add a second window, add a tab to it
      dispatcher.apply("addWindow", ["w2"]);
      dispatcher.apply("addTabToCell", [
        "w2",
        { id: "t2", appType: "terminal", title: "T2", config: {}, isPreview: false },
        0,
        0,
      ]);

      expect(dispatcher.getWorkspace().windows).toHaveLength(2);

      // Close the second window
      const result = dispatcher.apply("closeWindow", ["w2"]);
      expect(result).toBe(true);
      expect(dispatcher.getWorkspace().windows).toHaveLength(1);
    });
  });

  describe("Sidebar and window operations", () => {
    it("applies sidebar set/toggle operations", () => {
      const dispatcher = new OperationDispatcher();
      const ws = dispatcher.getWorkspace();
      const winId = ws.windows[0].id;

      dispatcher.apply("setSidebarViewOp", [winId, "worktree"]);
      expect(dispatcher.getWorkspace().windows[0].sidebar.activeViewId).toBe("worktree");

      dispatcher.apply("toggleSidebarViewOp", [winId, "worktree"]);
      expect(dispatcher.getWorkspace().windows[0].sidebar.activeViewId).toBeNull();
    });

    it("applies moveWindow to update bounds", () => {
      const dispatcher = new OperationDispatcher();
      const ws = dispatcher.getWorkspace();
      const winId = ws.windows[0].id;

      dispatcher.apply("moveWindow", [winId, { x: 0, y: 0, width: 1920, height: 1080 }, 0]);
      const state = dispatcher.getWorkspace();
      expect(state.windows[0].bounds.width).toBe(1920);
      expect(state.windows[0].bounds.height).toBe(1080);
    });
  });

  describe("Save handler and terminal cleanup callbacks", () => {
    it("invokes save handler after every successful apply", () => {
      const dispatcher = new OperationDispatcher();
      const ws = dispatcher.getWorkspace();
      const winId = ws.windows[0].id;
      const saveHandler = vi.fn();

      dispatcher.setSaveHandler(saveHandler);

      dispatcher.apply("addTabToCell", [
        winId,
        { id: "t1", appType: "terminal", title: "T1", config: {}, isPreview: false },
        0,
        0,
      ]);

      expect(saveHandler).toHaveBeenCalledTimes(1);
      // The handler receives the workspace
      const savedWs = saveHandler.mock.calls[0][0];
      expect(savedWs.windows[0].grid.placements).toHaveLength(1);
    });

    it("does not invoke save handler when apply fails", () => {
      const dispatcher = new OperationDispatcher();
      const saveHandler = vi.fn();
      dispatcher.setSaveHandler(saveHandler);

      dispatcher.apply("nonExistentOperation", []);
      expect(saveHandler).not.toHaveBeenCalled();
    });

    it("calls terminal cleanup when removing via removeColumnTab", () => {
      const dispatcher = new OperationDispatcher();
      const ws = dispatcher.getWorkspace();
      const winId = ws.windows[0].id;
      const cleanup = vi.fn();

      dispatcher.setTerminalCleanup(cleanup);

      dispatcher.apply("addTabToCell", [
        winId,
        { id: "t1", appType: "terminal", title: "T1", config: {}, isPreview: false },
        0,
        0,
      ]);

      // removeColumnTab triggers terminal cleanup (by design)
      dispatcher.apply("removeColumnTab", [winId, "t1"]);
      expect(cleanup).toHaveBeenCalledWith("t1");
    });
  });

  describe("Broadcast callback", () => {
    it("broadcasts are NOT automatically called by apply — they need explicit broadcast()", () => {
      const dispatcher = new OperationDispatcher();
      const ws = dispatcher.getWorkspace();
      const winId = ws.windows[0].id;
      const broadcastFn = vi.fn();

      dispatcher.setBroadcast(broadcastFn);

      dispatcher.apply("addTabToCell", [
        winId,
        { id: "t1", appType: "terminal", title: "T1", config: {}, isPreview: false },
        0,
        0,
      ]);

      // broadcast() is separate from apply() — it's called by the IPC handler
      expect(broadcastFn).not.toHaveBeenCalled();

      dispatcher.broadcast();
      expect(broadcastFn).toHaveBeenCalledTimes(1);
    });
  });

  describe("Workspace state mutation and getter", () => {
    it("returns the current workspace state", () => {
      const dispatcher = new OperationDispatcher();
      const ws = dispatcher.getWorkspace();

      expect(ws.id).toBeDefined();
      expect(ws.windows).toHaveLength(1);
    });

    it("can set workspace state directly", () => {
      const dispatcher = new OperationDispatcher();
      const newWs = dispatcher.getWorkspace(); // Clone the default workspace
      const winId = newWs.windows[0].id;

      const fresh = createWorkspace("fresh");
      dispatcher.setWorkspace(fresh);

      expect(dispatcher.getWorkspace().id).toBe("fresh");
      expect(dispatcher.getWorkspace().windows).toHaveLength(1);
    });
  });
});
