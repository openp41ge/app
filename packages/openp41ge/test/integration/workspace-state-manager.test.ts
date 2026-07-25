// @vitest-environment node
/**
 * Integration tests for WorkspaceStateManager — the hub that bridges
 * workspace state changes to layout computation and subscriber notifications.
 *
 * These tests verify that:
 *   - setState() triggers computeLayout() and produces correct rects
 *   - Subscribers are notified on every setState() call
 *   - Unsubscribing stops notifications
 *   - Multiple subscribers work correctly
 *   - Layout maps are correctly keyed by window ID
 */

import { describe, it, expect, vi } from "vitest";
import * as types from "@openp41ge/layout/types";
import * as ops from "@openp41ge/layout/operations";
import { WorkspaceStateManager } from "@openp41ge/renderer/services/workspace-state-manager";

describe("WorkspaceStateManager — integration", () => {
  describe("State management", () => {
    it("setState stores workspace and recomputes layouts", () => {
      const mgr = new WorkspaceStateManager();
      const ws = types.createWorkspace("ws-test");

      mgr.setState(ws);

      expect(mgr.getWorkspace()).toBe(ws);
      expect(mgr.getLayouts().size).toBe(1);
    });

    it("getWorkspace returns null before any setState call", () => {
      const mgr = new WorkspaceStateManager();
      expect(mgr.getWorkspace()).toBeNull();
    });

    it("getLayouts returns empty map before any setState call", () => {
      const mgr = new WorkspaceStateManager();
      expect(mgr.getLayouts().size).toBe(0);
    });

    it("subsequent setState calls replace the workspace", () => {
      const mgr = new WorkspaceStateManager();
      const ws1 = types.createWorkspace("ws-one");
      const ws2 = types.createWorkspace("ws-two");

      mgr.setState(ws1);
      expect(mgr.getWorkspace()?.id).toBe("ws-one");

      mgr.setState(ws2);
      expect(mgr.getWorkspace()?.id).toBe("ws-two");
    });
  });

  describe("Layout computation on setState", () => {
    it("computes layout rects for each window's grid", () => {
      const mgr = new WorkspaceStateManager();
      const ws = types.createWorkspace("ws-layout");
      const winId = ws.windows[0].id;

      const t1 = types.createTab("t1", "terminal", "Terminal");
      const t2 = types.createTab("t2", "markdown", "Markdown");
      let r = ops.resizeGrid(ws, winId, 1, 2);
      r = ops.addTabToCell(r, winId, t1, 0, 0);
      r = ops.addTabToCell(r, winId, t2, 0, 1);

      mgr.setState(r);

      const layouts = mgr.getLayouts();
      expect(layouts.has(winId)).toBe(true);

      const winLayout = layouts.get(winId)!;
      expect(winLayout.size).toBe(2);

      const t1Rect = winLayout.get("t1");
      const t2Rect = winLayout.get("t2");
      expect(t1Rect).toBeDefined();
      expect(t2Rect).toBeDefined();
      // Equal-width columns on 1280×800 viewport
      expect(t1Rect?.width).toBe(640);
      expect(t2Rect?.width).toBe(640);
    });

    it("recomputes layouts when workspace state changes", () => {
      const mgr = new WorkspaceStateManager();
      const ws = types.createWorkspace("ws-recompute");
      const winId = ws.windows[0].id;

      // Initial state: empty grid
      mgr.setState(ws);
      expect(mgr.getLayouts().get(winId)?.size).toBe(0);

      // Add a tab
      const t1 = types.createTab("t1", "terminal", "T1");
      const r = ops.addTabToCell(ws, winId, t1, 0, 0);

      mgr.setState(r);
      expect(mgr.getLayouts().get(winId)?.size).toBe(1);
      expect(mgr.getLayouts().get(winId)?.get("t1")).toBeDefined();
    });

    it("computes layouts for multiple windows", () => {
      const mgr = new WorkspaceStateManager();
      let ws = types.createWorkspace("ws-multiwin");
      const winId1 = ws.windows[0].id;

      ws = ops.addWindow(ws, "w2");
      ws = ops.addWindow(ws, "w3");

      mgr.setState(ws);

      expect(mgr.getLayouts().size).toBe(3);
      expect(mgr.getLayouts().has(winId1)).toBe(true);
      expect(mgr.getLayouts().has("w2")).toBe(true);
      expect(mgr.getLayouts().has("w3")).toBe(true);
    });
  });

  describe("Subscriber notification", () => {
    it("notifies subscribers when setState is called", () => {
      const mgr = new WorkspaceStateManager();
      const listener = vi.fn();
      mgr.subscribe(listener);

      const ws = types.createWorkspace("ws-notify");
      mgr.setState(ws);

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith(ws);
    });

    it("notifies all subscribers on each setState call", () => {
      const mgr = new WorkspaceStateManager();
      const l1 = vi.fn();
      const l2 = vi.fn();
      const l3 = vi.fn();

      mgr.subscribe(l1);
      mgr.subscribe(l2);
      mgr.subscribe(l3);

      const ws = types.createWorkspace("ws-multi-sub");
      mgr.setState(ws);

      expect(l1).toHaveBeenCalledTimes(1);
      expect(l2).toHaveBeenCalledTimes(1);
      expect(l3).toHaveBeenCalledTimes(1);
    });

    it("does not call unsubscribed listeners", () => {
      const mgr = new WorkspaceStateManager();
      const l1 = vi.fn();
      const l2 = vi.fn();

      mgr.subscribe(l1);
      const unsub = mgr.subscribe(l2);
      unsub(); // Unsubscribe l2

      mgr.setState(types.createWorkspace("ws-unsub"));

      expect(l1).toHaveBeenCalledTimes(1);
      expect(l2).not.toHaveBeenCalled();
    });

    it("subscribe returns a function that unsubscribes", () => {
      const mgr = new WorkspaceStateManager();
      const listener = vi.fn();

      const unsub = mgr.subscribe(listener);
      expect(typeof unsub).toBe("function");

      unsub();
      mgr.setState(types.createWorkspace("ws-unsub-fn"));
      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe("State → layout → subscriber pipeline", () => {
    it("subscriber receives the workspace and can access layouts", () => {
      const mgr = new WorkspaceStateManager();
      const ws = types.createWorkspace("ws-pipeline");
      const winId = ws.windows[0].id;

      const t1 = types.createTab("t1", "terminal", "T1");
      const r = ops.addTabToCell(ws, winId, t1, 0, 0);

      const listener = vi.fn(() => {
        // Subscriber accesses layouts after setState
        const layouts = mgr.getLayouts();
        expect(layouts.get(winId)?.get("t1")).toBeDefined();
      });
      mgr.subscribe(listener);

      mgr.setState(r);
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it("multiple setState calls trigger multiple subscriber notifications", () => {
      const mgr = new WorkspaceStateManager();
      const listener = vi.fn();
      mgr.subscribe(listener);

      mgr.setState(types.createWorkspace("ws-a"));
      mgr.setState(types.createWorkspace("ws-b"));
      mgr.setState(types.createWorkspace("ws-c"));

      expect(listener).toHaveBeenCalledTimes(3);
    });
  });
});
