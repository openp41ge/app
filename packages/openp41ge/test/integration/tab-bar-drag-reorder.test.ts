/**
 * Integration tests for tab bar drag-drop reorder — verifying that
 * TabBarDropTarget correctly dispatches reorderTabsInCell when a tab
 * is dropped at different positions in the tab bar.
 *
 * These tests wire the real TabBarDropTarget with a real dispatch path
 * (CommandBus + OperationDispatcher) to verify that dragging a tab to
 * a new position in the tab bar correctly reorders tabs in the workspace.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { TabBarDropTarget } from "@openp41ge/renderer/services/drop-targets/tab-bar-drop-target";
import { TabDragSource } from "@openp41ge/renderer/services/drag-sources/tab-drag-source";
import { OperationDispatcher } from "@openp41ge/main/services/operation-dispatcher";
import * as types from "@openp41ge/layout/types";
import * as ops from "@openp41ge/layout/operations";

// ─── Test helpers ─────────────────────────────────────────────────────────

/**
 * Create a tab bar element with child tab buttons, simulating
 * the DOM structure created by openp41ge-cell-tabbar.
 */
function createTabBar(tabIds: string[], offsetX = 0): HTMLElement {
  const bar = document.createElement("div");
  bar.className = "cell-tab-bar";
  bar.style.cssText = "display:flex;position:relative;width:300px;";
  // Mock getBoundingClientRect so layout is predictable in jsdom
  bar.getBoundingClientRect = () => ({
    x: offsetX,
    y: 0,
    width: 300,
    height: 30,
    top: 0,
    right: offsetX + 300,
    bottom: 30,
    left: offsetX,
  });

  let cumLeft = offsetX;
  tabIds.forEach((id, i) => {
    const btn = document.createElement("span");
    btn.className = "tab-btn";
    btn.textContent = `Tab ${i}`;
    btn.setAttribute("data-tab-id", id);
    btn.style.cssText = "display:inline-block;";
    const btnWidth = 80 + i * 10;
    btn.getBoundingClientRect = () => ({
      x: cumLeft,
      y: 0,
      width: btnWidth,
      height: 30,
      top: 0,
      right: cumLeft + btnWidth,
      bottom: 30,
      left: cumLeft,
    });
    cumLeft += btnWidth;
    bar.appendChild(btn);
  });

  return bar;
}

/**
 * Compute the clientX value that corresponds to dropping at a given
 * index in a tab bar (midpoint between the children's centers).
 */
function dropPositionForIndex(bar: HTMLElement, index: number): number {
  const children = Array.from(bar.children).filter(
    (c) => c instanceof HTMLElement,
  ) as HTMLElement[];
  const barRect = bar.getBoundingClientRect();

  if (children.length === 0) return barRect.left + 10;
  if (index <= 0) return barRect.left + 5;
  if (index >= children.length) {
    const last = children[children.length - 1];
    return last.getBoundingClientRect().right + 5;
  }

  const child = children[index];
  const childRect = child.getBoundingClientRect();
  // Position at the midpoint of the gap before this child
  const prevChild = children[index - 1];
  const prevRect = prevChild.getBoundingClientRect();
  return (prevRect.right + childRect.left) / 2;
}

function getTabOrderFromPlacements(placements: any[]): string[] {
  // Flatten all tabIds from placements in column order
  return placements
    .sort((a: any, b: any) => a.position.col - b.position.col)
    .flatMap((p: any) => (p.position.row === 0 ? p.tabIds : []));
}

// ─── Tests ────────────────────────────────────────────────────────────────

describe("Tab bar drag-reorder — integration", () => {
  let dispatcher: OperationDispatcher;

  beforeEach(() => {
    dispatcher = new OperationDispatcher();
  });

  describe("Same-cell reorder via TabBarDropTarget", () => {
    it("reorders tabs when dropping at a different index", async () => {
      // Set up workspace with 3 tabs in one cell
      const ws = dispatcher.getWorkspace();
      const winId = ws.windows[0].id;

      dispatcher.apply("addTabToCell", [
        winId,
        { id: "t1", appType: "terminal", title: "Alpha", config: {}, isPreview: false },
        0,
        0,
      ]);
      dispatcher.apply("addTabToCell", [
        winId,
        { id: "t2", appType: "markdown", title: "Beta", config: {}, isPreview: false },
        0,
        0,
      ]);
      dispatcher.apply("addTabToCell", [
        winId,
        { id: "t3", appType: "video", title: "Gamma", config: {}, isPreview: false },
        0,
        0,
      ]);

      const tabBar = createTabBar(["t1", "t2", "t3"]);

      const dropTarget = new TabBarDropTarget(tabBar, winId, ws.id, 0, {
        dispatch: (fn: string, ...args: unknown[]) => dispatcher.apply(fn, args),
      });

      // Create drag source for tab "t3" (last, index 2)
      const tabBtn = tabBar.children[2] as HTMLElement;
      const source = new TabDragSource(tabBtn, "t3", winId, ws.id, "Gamma");

      // Drop at index 0 (before first tab)
      const clientX = dropPositionForIndex(tabBar, 0);
      const result = await dropTarget.onDrop(source, clientX, 0);

      expect(result.success).toBe(true);
      const state = dispatcher.getWorkspace();
      const order = getTabOrderFromPlacements(state.windows[0].grid.placements);
      expect(order).toEqual(["t3", "t1", "t2"]);
    });

    it("does nothing when dropping at the same index", async () => {
      const ws = dispatcher.getWorkspace();
      const winId = ws.windows[0].id;

      dispatcher.apply("addTabToCell", [
        winId,
        { id: "t1", appType: "terminal", title: "A", config: {}, isPreview: false },
        0,
        0,
      ]);
      dispatcher.apply("addTabToCell", [
        winId,
        { id: "t2", appType: "markdown", title: "B", config: {}, isPreview: false },
        0,
        0,
      ]);

      const tabBar = createTabBar(["t1", "t2"]);
      const dropTarget = new TabBarDropTarget(tabBar, winId, ws.id, 0, {
        dispatch: (fn: string, ...args: unknown[]) => dispatcher.apply(fn, args),
      });

      // Drop index 1 (t2 is at index 1, dropping back at index 1 is a no-op)
      const tabBtn = tabBar.children[1] as HTMLElement;
      const source = new TabDragSource(tabBtn, "t2", winId, ws.id, "B");
      const clientX = dropPositionForIndex(tabBar, 1);
      const result = await dropTarget.onDrop(source, clientX, 0);

      expect(result.success).toBe(true);
      const state = dispatcher.getWorkspace();
      const order = getTabOrderFromPlacements(state.windows[0].grid.placements);
      expect(order).toEqual(["t1", "t2"]); // unchanged
    });

    it("moves tab to the end when dropping at the last position", async () => {
      const ws = dispatcher.getWorkspace();
      const winId = ws.windows[0].id;

      dispatcher.apply("addTabToCell", [
        winId,
        { id: "t1", appType: "terminal", title: "A", config: {}, isPreview: false },
        0,
        0,
      ]);
      dispatcher.apply("addTabToCell", [
        winId,
        { id: "t2", appType: "markdown", title: "B", config: {}, isPreview: false },
        0,
        0,
      ]);
      dispatcher.apply("addTabToCell", [
        winId,
        { id: "t3", appType: "video", title: "C", config: {}, isPreview: false },
        0,
        0,
      ]);

      const tabBar = createTabBar(["t1", "t2", "t3"]);

      // Drop index 2 (end of bar), moving t1 to the end
      const tabBtn = tabBar.children[0] as HTMLElement;
      const source = new TabDragSource(tabBtn, "t1", winId, ws.id, "A");
      const dropTarget = new TabBarDropTarget(tabBar, winId, ws.id, 0, {
        dispatch: (fn: string, ...args: unknown[]) => dispatcher.apply(fn, args),
      });

      const clientX = dropPositionForIndex(tabBar, 3); // after the last child
      const result = await dropTarget.onDrop(source, clientX, 0);

      expect(result.success).toBe(true);
      const state = dispatcher.getWorkspace();
      const order = getTabOrderFromPlacements(state.windows[0].grid.placements);
      expect(order).toEqual(["t2", "t3", "t1"]);
    });
  });

  describe("Reject invalid drops", () => {
    it("rejects drops with wrong source type", async () => {
      const tabBar = createTabBar(["t1"]);
      const dropTarget = new TabBarDropTarget(tabBar, "win1", "ws1", 0, { dispatch: vi.fn() });

      // Create a minimal source with wrong type
      const fakeSource = {
        type: "file", // not "tab" — should be rejected
        getDragData: () => ({ type: "file", filePath: "/test.ts" }),
        onDragStart: vi.fn(),
        onDragEnd: vi.fn(),
        createGhost: vi.fn(),
      };

      const result = await dropTarget.onDrop(fakeSource as any, 100, 0);
      expect(result.success).toBe(false);
      expect(result.reason).toContain("only tabs");
    });
  });

  describe("Cross-cell drops via TabBarDropTarget", () => {
    it("drop tab from col 0 into col 1's tab bar → dispatches moveTabBetweenCells", async () => {
      const dispatcher = new OperationDispatcher();
      const ws = dispatcher.getWorkspace();
      const winId = ws.windows[0].id;

      // Create 2 cells: col 0 has tab-1, col 1 has tab-2
      dispatcher.apply("resizeGrid", [winId, 1, 2]);
      dispatcher.apply("addTabToCell", [
        winId,
        { id: "tab-1", appType: "terminal", title: "Tab A", config: {}, isPreview: false },
        0,
        0,
      ]);
      dispatcher.apply("addTabToCell", [
        winId,
        { id: "tab-2", appType: "markdown", title: "Tab B", config: {}, isPreview: false },
        0,
        1,
      ]);

      // Create tab bar for col 1 (target) — contains tab-2 only
      const targetBar = document.createElement("div");
      targetBar.className = "cell-tab-bar";
      targetBar.style.cssText = "display:flex;position:relative;width:300px;";
      const t2Btn = document.createElement("span");
      t2Btn.setAttribute("data-tab-id", "tab-2");
      t2Btn.textContent = "Tab B";
      t2Btn.style.cssText = "display:inline-block;";
      t2Btn.getBoundingClientRect = () =>
        ({
          x: 0,
          y: 0,
          width: 80,
          height: 30,
          top: 0,
          right: 80,
          bottom: 30,
          left: 0,
        }) as DOMRect;
      targetBar.appendChild(t2Btn);
      targetBar.getBoundingClientRect = () =>
        ({
          x: 0,
          y: 0,
          width: 300,
          height: 30,
          top: 0,
          right: 300,
          bottom: 30,
          left: 0,
        }) as DOMRect;

      const dispatched: string[] = [];
      const dropTarget = new TabBarDropTarget(
        targetBar,
        winId,
        ws.id,
        1, // col 1
        {
          dispatch: (fn: string, ...args: unknown[]) => {
            dispatched.push(fn);
            dispatcher.apply(fn, args);
          },
        },
      );

      // Drag source for tab-1 (which is in col 0)
      const srcBtn = document.createElement("span");
      srcBtn.setAttribute("data-tab-id", "tab-1");
      document.body.appendChild(srcBtn);
      const source = new TabDragSource(srcBtn, "tab-1", winId, ws.id, "Tab A");

      // Drop at start of col 1's tab bar
      const result = await dropTarget.onDrop(source, 20, 0);

      expect(result.success).toBe(true);
      expect(dispatched).toContain("moveTabBetweenCells");
    });

    it("drop tab from col 1 into col 0's tab bar → dispatches moveTabBetweenCells", async () => {
      const dispatcher = new OperationDispatcher();
      const ws = dispatcher.getWorkspace();
      const winId = ws.windows[0].id;

      dispatcher.apply("resizeGrid", [winId, 1, 2]);
      dispatcher.apply("addTabToCell", [
        winId,
        { id: "tab-1", appType: "terminal", title: "Tab A", config: {}, isPreview: false },
        0,
        0,
      ]);
      dispatcher.apply("addTabToCell", [
        winId,
        { id: "tab-2", appType: "markdown", title: "Tab B", config: {}, isPreview: false },
        0,
        1,
      ]);

      // Create tab bar for col 0 (target) — contains tab-1 only
      const targetBar = document.createElement("div");
      targetBar.className = "cell-tab-bar";
      targetBar.style.cssText = "display:flex;position:relative;width:300px;";
      const t1Btn = document.createElement("span");
      t1Btn.setAttribute("data-tab-id", "tab-1");
      t1Btn.textContent = "Tab A";
      t1Btn.style.cssText = "display:inline-block;";
      t1Btn.getBoundingClientRect = () =>
        ({
          x: 0,
          y: 0,
          width: 80,
          height: 30,
          top: 0,
          right: 80,
          bottom: 30,
          left: 0,
        }) as DOMRect;
      targetBar.appendChild(t1Btn);
      targetBar.getBoundingClientRect = () =>
        ({
          x: 0,
          y: 0,
          width: 300,
          height: 30,
          top: 0,
          right: 300,
          bottom: 30,
          left: 0,
        }) as DOMRect;

      const dispatched: string[] = [];
      const dropTarget = new TabBarDropTarget(
        targetBar,
        winId,
        ws.id,
        0, // col 0
        {
          dispatch: (fn: string, ...args: unknown[]) => {
            dispatched.push(fn);
            dispatcher.apply(fn, args);
          },
        },
      );

      // Drag source for tab-2 (which is in col 1)
      const srcBtn = document.createElement("span");
      srcBtn.setAttribute("data-tab-id", "tab-2");
      document.body.appendChild(srcBtn);
      const source = new TabDragSource(srcBtn, "tab-2", winId, ws.id, "Tab B");

      const result = await dropTarget.onDrop(source, 20, 0);

      expect(result.success).toBe(true);
      expect(dispatched).toContain("moveTabBetweenCells");
    });

    it("drop tab into its own cell's tab bar at different index → dispatches reorderTabsInCell", async () => {
      const dispatcher = new OperationDispatcher();
      const ws = dispatcher.getWorkspace();
      const winId = ws.windows[0].id;

      dispatcher.apply("addTabToCell", [
        winId,
        { id: "t1", appType: "terminal", title: "A", config: {}, isPreview: false },
        0,
        0,
      ]);
      dispatcher.apply("addTabToCell", [
        winId,
        { id: "t2", appType: "markdown", title: "B", config: {}, isPreview: false },
        0,
        0,
      ]);

      const bar = document.createElement("div");
      bar.className = "cell-tab-bar";
      bar.style.cssText = "display:flex;position:relative;width:300px;";
      // Add t1
      const btn1 = document.createElement("span");
      btn1.setAttribute("data-tab-id", "t1");
      btn1.textContent = "A";
      btn1.style.cssText = "display:inline-block;";
      btn1.getBoundingClientRect = () =>
        ({
          x: 0,
          y: 0,
          width: 80,
          height: 30,
          top: 0,
          right: 80,
          bottom: 30,
          left: 0,
        }) as DOMRect;
      bar.appendChild(btn1);
      // Add t2
      const btn2 = document.createElement("span");
      btn2.setAttribute("data-tab-id", "t2");
      btn2.textContent = "B";
      btn2.style.cssText = "display:inline-block;";
      btn2.getBoundingClientRect = () =>
        ({
          x: 80,
          y: 0,
          width: 80,
          height: 30,
          top: 0,
          right: 160,
          bottom: 30,
          left: 80,
        }) as DOMRect;
      bar.appendChild(btn2);
      bar.getBoundingClientRect = () =>
        ({
          x: 0,
          y: 0,
          width: 300,
          height: 30,
          top: 0,
          right: 300,
          bottom: 30,
          left: 0,
        }) as DOMRect;

      const dispatched: string[] = [];
      const dropTarget = new TabBarDropTarget(bar, winId, ws.id, 0, {
        dispatch: (fn: string, ...args: unknown[]) => {
          dispatched.push(fn);
          dispatcher.apply(fn, args);
        },
      });

      // Drag t2 to position before t1 (clientX < 40)
      const srcBtn = document.createElement("span");
      srcBtn.setAttribute("data-tab-id", "t2");
      document.body.appendChild(srcBtn);
      const source = new TabDragSource(srcBtn, "t2", winId, ws.id, "B");

      const result = await dropTarget.onDrop(source, 20, 0);

      expect(result.success).toBe(true);
      expect(dispatched).toContain("reorderTabsInCell");
    });
  });
});
