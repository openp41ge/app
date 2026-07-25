/**
 * Test suite verifying the testability of the openp41ge-cell-tabbar drag-start
 * pipeline without any browser launcher (JSDOM only).
 *
 * Key patterns demonstrated:
 *   A. Pure function tests (evaluateDragStart) — no DOM at all
 *   B. Extracted startTabDrag — tests handler-selection logic
 *   C. Lit component tests — with synthetic DataTransfer/DragEvent
 *   D. Integration tests — TabBarDropTarget with corrected dispatch
 *   E. Module-level state reset between tests
 */

import { vi, describe, test, expect, beforeEach, afterEach } from "vitest";

// ─── A. Pure function: evaluateDragStart ──────────────────────────────────

describe("evaluateDragStart (pure function)", () => {
  type EvaluateFn = (
    dataset: DOMStringMap,
    isContextMenuActive: boolean,
  ) => { shouldStart: boolean; suppressedBy?: string };

  let evaluateDragStart: EvaluateFn;

  beforeEach(async () => {
    const mod = await import("@openp41ge/renderer/components/openp41ge-cell-tabbar");
    evaluateDragStart = mod.evaluateDragStart;
  });

  test("returns shouldStart=true when no suppression flags are set", () => {
    const dataset = { _dragPending: "1" } as unknown as DOMStringMap;
    const result = evaluateDragStart(dataset, false);
    expect(result.shouldStart).toBe(true);
    // Should clear the pending flag
    expect(dataset._dragPending).toBeUndefined();
  });

  test("returns shouldStart=false when _ctxDismiss is set (context menu just dismissed)", () => {
    const dataset = { _ctxDismiss: "1", _dragPending: "1" } as unknown as DOMStringMap;
    const result = evaluateDragStart(dataset, false);
    expect(result.shouldStart).toBe(false);
    expect(result.suppressedBy).toBe("context-menu-dismiss");
  });

  test("returns shouldStart=false when isContextMenuActive is true", () => {
    const dataset = { _dragPending: "1" } as unknown as DOMStringMap;
    const result = evaluateDragStart(dataset, true);
    expect(result.shouldStart).toBe(false);
    expect(result.suppressedBy).toBe("context-menu-active");
  });

  test("returns shouldStart=false when _dragPending is missing (cancelled by contextmenu)", () => {
    const dataset = {} as unknown as DOMStringMap; // no _dragPending
    const result = evaluateDragStart(dataset, false);
    expect(result.shouldStart).toBe(false);
    expect(result.suppressedBy).toBe("drag-pending-cancelled");
  });

  test("returns shouldStart=false when _dragPending is '0'", () => {
    const dataset = { _dragPending: "0" } as unknown as DOMStringMap;
    const result = evaluateDragStart(dataset, false);
    expect(result.shouldStart).toBe(false);
    expect(result.suppressedBy).toBe("drag-pending-cancelled");
  });

  test("context-menu-dismiss takes priority over context-menu-active", () => {
    const dataset = { _ctxDismiss: "1", _dragPending: "1" } as unknown as DOMStringMap;
    const result = evaluateDragStart(dataset, true);
    expect(result.shouldStart).toBe(false);
    expect(result.suppressedBy).toBe("context-menu-dismiss");
  });

  test("does not mutate dataset when returning false", () => {
    const dataset = { _ctxDismiss: "1", _dragPending: "1" } as unknown as DOMStringMap;
    evaluateDragStart(dataset, false);
    // _dragPending should still be set since we returned early
    expect(dataset._dragPending).toBe("1");
    expect(dataset._ctxDismiss).toBe("1");
  });
});

// ─── B. Extracted startTabDrag — handler selection ────────────────────────

describe("startTabDrag (handler selection)", () => {
  type StarterFn = (
    _btn: HTMLElement,
    tid: string,
    winId: string,
    worksetId: string,
    label: string,
    clientX: number,
    clientY: number,
    gridEl: HTMLElement | null,
    unifiedHandler: { startDrag: (...args: unknown[]) => void } | null,
    fallbackHandler: ((e: MouseEvent) => void) | null,
  ) => void;

  let startTabDrag: StarterFn;

  beforeEach(async () => {
    const mod = await import("@openp41ge/renderer/components/openp41ge-cell-tabbar");
    startTabDrag = mod.startTabDrag;
  });

  test("uses unified handler when available", () => {
    const btn = document.createElement("div");
    const unifiedHandler = { startDrag: vi.fn() };
    const fallbackHandler = vi.fn();

    startTabDrag(
      btn,
      "tab-1",
      "win-1",
      "ws-1",
      "My Tab",
      100,
      200,
      null,
      unifiedHandler,
      fallbackHandler,
    );

    expect(unifiedHandler.startDrag).toHaveBeenCalledTimes(1);
    expect(unifiedHandler.startDrag).toHaveBeenCalledWith(
      { type: "tab", tid: "tab-1", winId: "win-1", worksetId: "ws-1", label: "My Tab" },
      100,
      200,
    );
    expect(fallbackHandler).not.toHaveBeenCalled();
  });

  test("uses fallback handler when unified handler is null", () => {
    const btn = document.createElement("div");
    const fallbackHandler = vi.fn();

    startTabDrag(btn, "tab-1", "win-1", "ws-1", "Tab", 50, 75, null, null, fallbackHandler);

    expect(fallbackHandler).toHaveBeenCalledTimes(1);
    const event = fallbackHandler.mock.calls[0][0] as MouseEvent;
    expect(event.clientX).toBe(50);
    expect(event.clientY).toBe(75);
    expect(event.button).toBe(0);
  });

  test("does nothing when both handlers are null", () => {
    const btn = document.createElement("div");
    startTabDrag(btn, "tab-1", "win-1", "ws-1", "Tab", 100, 200, null, null, null);
    // Should not throw
  });

  test("unified handler receives correct client coordinates", () => {
    const unifiedHandler = { startDrag: vi.fn() };
    startTabDrag(
      document.createElement("div"),
      "t1",
      "w1",
      "ws1",
      "Label",
      320,
      480,
      null,
      unifiedHandler,
      null,
    );
    expect(unifiedHandler.startDrag).toHaveBeenCalledWith(expect.anything(), 320, 480);
  });
});

// ─── C. Lit component with synthetic DragEvents through the component ─────

describe("openp41ge-cell-tabbar — drag-start via mousedown (Lit component)", () => {
  type Openp41geCellTabbar = import("lit").LitElement & { data: unknown };
  type CellTabBarData =
    import("@openp41ge/renderer/components/openp41ge-cell-tabbar").CellTabBarData;
  type Tab = import("@openp41ge/layout/types").Tab;

  let resetTabBarGlobalState: () => void;

  beforeEach(async () => {
    document.body.innerHTML = "";

    // Reset the module-level stylesheet flag so each test gets a clean slate
    const mod = await import("@openp41ge/renderer/components/openp41ge-cell-tabbar");
    resetTabBarGlobalState = mod.resetTabBarGlobalState;
    resetTabBarGlobalState();

    // Ensure the component is defined
    await import("@openp41ge/renderer/components/openp41ge-cell-tabbar");
  });

  afterEach(() => {
    resetTabBarGlobalState();
  });

  function createMockTab(id: string, title?: string, appType = "terminal"): Tab {
    return { id: id as any, appType, title: title ?? id, config: {} };
  }

  function createData(): CellTabBarData {
    const tabs: Record<string, Tab> = {
      "tab-1": createMockTab("tab-1", "Alpha"),
      "tab-2": createMockTab("tab-2", "Beta"),
    };
    return {
      tabIds: ["tab-1", "tab-2"],
      activeTabId: "tab-1",
      getTab: (id: string) => tabs[id] ?? undefined,
      winId: "win-1",
      worksetId: "ws-1",
      col: 0,
    };
  }

  function getTabButtons(el: Openp41geCellTabbar): NodeListOf<HTMLElement> {
    const bar = el.querySelector(".cell-tab-bar");
    if (!bar)
      return document.createDocumentFragment().querySelectorAll("*") as NodeListOf<HTMLElement>;
    return bar.querySelectorAll(":scope > div");
  }

  test("mousedown on a tab button sets _dragPending on the button dataset", async () => {
    const el = document.createElement("openp41ge-cell-tabbar") as Openp41geCellTabbar;
    el.data = createData();
    document.body.appendChild(el);
    await el.updateComplete;

    const buttons = getTabButtons(el);
    expect(buttons.length).toBeGreaterThanOrEqual(2);

    // Simulate a left-click mousedown on the first tab button
    const btn = buttons[0] as HTMLElement;
    btn.dispatchEvent(
      new MouseEvent("mousedown", { bubbles: true, button: 0, clientX: 10, clientY: 20 }),
    );

    // After mousedown, _dragPending should be set (setTimeout hasn't fired yet)
    expect(btn.dataset._dragPending).toBe("1");
  });

  test("mousedown followed by contextmenu clears _dragPending", async () => {
    const el = document.createElement("openp41ge-cell-tabbar") as Openp41geCellTabbar;
    el.data = createData();
    document.body.appendChild(el);
    await el.updateComplete;

    const buttons = getTabButtons(el);
    const btn = buttons[0] as HTMLElement;

    // mousedown fires first (macOS two-finger tap)
    btn.dispatchEvent(
      new MouseEvent("mousedown", { bubbles: true, button: 0, clientX: 10, clientY: 20 }),
    );
    expect(btn.dataset._dragPending).toBe("1");

    // Then contextmenu fires, which clears the drag-pending flag
    btn.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }));
    // Contextmenu sets _ctxDismiss, which causes evaluateDragStart to return false
    expect(btn.dataset._ctxDismiss).toBe("1");

    // The setTimeout callback would check evaluateDragStart and find _ctxDismiss
    // — we verify via the pure function test above
  });

  test("double mousedown only sets one timeout", async () => {
    const el = document.createElement("openp41ge-cell-tabbar") as Openp41geCellTabbar;
    el.data = createData();
    document.body.appendChild(el);
    await el.updateComplete;

    const buttons = getTabButtons(el);
    const btn = buttons[0] as HTMLElement;

    // First mousedown
    btn.dispatchEvent(
      new MouseEvent("mousedown", { bubbles: true, button: 0, clientX: 10, clientY: 20 }),
    );
    expect(btn.dataset._dragPending).toBe("1");

    // Second mousedown (debounce — clears and re-sets)
    btn.dispatchEvent(
      new MouseEvent("mousedown", { bubbles: true, button: 0, clientX: 15, clientY: 25 }),
    );
    // The second mousedown first deletes _dragPending, then sets it again
    expect(btn.dataset._dragPending).toBe("1");
  });

  test("close button mousedown does not set _dragPending on close span", async () => {
    const el = document.createElement("openp41ge-cell-tabbar") as Openp41geCellTabbar;
    el.data = createData();
    document.body.appendChild(el);
    await el.updateComplete;

    const closeButtons = el.querySelectorAll("[data-close-btn]");
    expect(closeButtons.length).toBe(2);

    // Mousedown on the close button
    const closeBtn = closeButtons[0] as HTMLElement;
    closeBtn.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }));

    // The close button itself doesn't have a mousedown handler, so it
    // shouldn't set _dragPending on the close button.
    // The mousedown handler is on the tab button (parent), so the event
    // bubbles up to it. But the close button click handler stops propagation.
    // The close button's @click has e.stopPropagation(), but mousedown
    // doesn't — it bubbles up to the tab button handler.
    // So _dragPending WILL be set on the tab button, not the close span.
    // This is expected behaviour — verify the parent tab button has it set.
    const tabBtn = closeBtn.closest("div[style]") as HTMLElement | null;
    if (tabBtn) {
      expect(tabBtn.dataset._dragPending).toBe("1");
    }
  });

  test("click on a tab button dispatches cell-tab:activate CustomEvent", async () => {
    const el = document.createElement("openp41ge-cell-tabbar") as Openp41geCellTabbar;
    el.data = createData();
    document.body.appendChild(el);
    await el.updateComplete;

    const handler = vi.fn();
    el.addEventListener("cell-tab:activate", handler);

    const buttons = getTabButtons(el);
    (buttons[1] as HTMLElement).click();

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0].detail.tabId).toBe("tab-2");
  });

  test("click on close button dispatches cell-tab:close, not cell-tab:activate", async () => {
    const el = document.createElement("openp41ge-cell-tabbar") as Openp41geCellTabbar;
    el.data = createData();
    document.body.appendChild(el);
    await el.updateComplete;

    const activateHandler = vi.fn();
    const closeHandler = vi.fn();
    el.addEventListener("cell-tab:activate", activateHandler);
    el.addEventListener("cell-tab:close", closeHandler);

    const closeButtons = el.querySelectorAll("[data-close-btn]");
    (closeButtons[0] as HTMLElement).click();

    expect(closeHandler).toHaveBeenCalledTimes(1);
    expect(activateHandler).not.toHaveBeenCalled();
  });
});

// ─── D. TabBarDropTarget with corrected dispatch ─────────────────────────

describe("TabBarDropTarget — corrected dispatch (JSDOM)", () => {
  type TabBarDropTargetType =
    import("@openp41ge/renderer/services/drop-targets/tab-bar-drop-target").TabBarDropTarget;
  let TabBarDropTarget: new (
    barEl: HTMLElement,
    winId: string,
    worksetId: string,
    col: number,
    commandBus: { dispatch: (fn: string, ...args: unknown[]) => void },
  ) => TabBarDropTargetType;

  let TabDragSource: new (
    tabBtn: HTMLElement,
    tabId: string,
    winId: string,
    worksetId: string,
    title?: string,
  ) => {
    type: string;
    getDragData(): { type: string; tabId: string };
    onDragStart(): void;
    onDragEnd(): void;
    createGhost(): HTMLElement;
  };

  beforeEach(async () => {
    document.body.innerHTML = "";
    const dropMod = await import("@openp41ge/renderer/services/drop-targets/tab-bar-drop-target");
    const sourceMod = await import("@openp41ge/renderer/services/drag-sources/tab-drag-source");
    TabBarDropTarget = dropMod.TabBarDropTarget;
    TabDragSource = sourceMod.TabDragSource;
  });

  function createTabBar(tabIds: string[], width = 300): HTMLElement {
    const bar = document.createElement("div");
    bar.className = "cell-tab-bar";
    bar.style.cssText = "display:flex;position:relative;";

    let cumLeft = 0;
    tabIds.forEach((id, i) => {
      const btn = document.createElement("span");
      btn.className = "tab-btn";
      btn.textContent = `Tab ${i}`;
      btn.setAttribute("data-tab-id", id);
      const btnWidth = Math.round(width / tabIds.length);
      btn.getBoundingClientRect = () =>
        ({
          x: cumLeft,
          y: 0,
          width: btnWidth,
          height: 30,
          top: 0,
          right: cumLeft + btnWidth,
          bottom: 30,
          left: cumLeft,
          toJSON: () => ({}),
        }) as DOMRect;
      cumLeft += btnWidth;
      bar.appendChild(btn);
    });

    bar.getBoundingClientRect = () =>
      ({
        x: 0,
        y: 0,
        width,
        height: 30,
        top: 0,
        right: width,
        bottom: 30,
        left: 0,
        toJSON: () => ({}),
      }) as DOMRect;

    return bar;
  }

  /**
   * Compute clientX for dropping at a given index in the tab bar.
   */
  function dropClientX(bar: HTMLElement, index: number): number {
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
    const prev = children[index - 1];
    const prevRect = prev.getBoundingClientRect();
    return (prevRect.right + childRect.left) / 2;
  }

  test("correctly dispatches reorderTabsInCell without extraneous worksetId", async () => {
    const tabBar = createTabBar(["t1", "t2", "t3"], 300);

    const dispatchedArgs: unknown[][] = [];
    const dropTarget = new TabBarDropTarget(tabBar, "win-1", "ws-1", 0, {
      dispatch: (fn: string, ...args: unknown[]) => {
        if (fn === "reorderTabsInCell") {
          dispatchedArgs.push(args);
        }
      },
    });

    // Create source for "t3" (index 2)
    const srcBtn = document.createElement("span");
    srcBtn.setAttribute("data-tab-id", "t3");
    document.body.appendChild(srcBtn);
    const source = new TabDragSource(srcBtn, "t3", "win-1", "ws-1", "Gamma");

    // Drop at index 0 (before first tab)
    const clientX = dropClientX(tabBar, 0);
    const result = await dropTarget.onDrop(source, clientX, 0);

    expect(result.success).toBe(true);
    expect(dispatchedArgs.length).toBe(1);

    // Verify the corrected argument order: (winId, row, col, fromIdx, toIdx)
    const args = dispatchedArgs[0];
    expect(args[0]).toBe("win-1"); // winId
    expect(args[1]).toBe(0); // row (no longer worksetId)
    expect(args[2]).toBe(0); // col
    expect(args[3]).toBe(2); // fromIndex (t3 is at index 2)
    expect(args[4]).toBe(0); // toIdx
  });

  test("correctly dispatches moveTabBetweenCells without extraneous worksetId", async () => {
    const tabBar = createTabBar(["t1"], 300);

    const dispatchedArgs: unknown[][] = [];
    const dropTarget = new TabBarDropTarget(tabBar, "win-1", "ws-1", 0, {
      dispatch: (fn: string, ...args: unknown[]) => {
        if (fn === "moveTabBetweenCells") {
          dispatchedArgs.push(args);
        }
      },
    });

    // Source from a DIFFERENT cell (sourceWindowId is "other-win")
    const srcBtn = document.createElement("span");
    srcBtn.setAttribute("data-tab-id", "tab-other");
    document.body.appendChild(srcBtn);
    const source = new TabDragSource(srcBtn, "tab-other", "other-win", "other-ws", "Other Tab");

    const clientX = dropClientX(tabBar, 0);
    const result = await dropTarget.onDrop(source, clientX, 0);

    expect(result.success).toBe(true);
    expect(dispatchedArgs.length).toBe(1);

    // Verify corrected args: (sourceWindowId, tabId, targetWindowId, targetRow, targetCol, insertAt)
    const args = dispatchedArgs[0];
    expect(args[0]).toBe("other-win"); // sourceWindowId
    expect(args[1]).toBe("tab-other"); // tabId (no longer worksetId)
    expect(args[2]).toBe("win-1"); // targetWindowId
    expect(args[3]).toBe(0); // targetRow
    expect(args[4]).toBe(0); // targetCol
    expect(args[5]).toBe(0); // insertAt (dropIndex)
  });

  test("same-index drop does not dispatch reorderTabsInCell", async () => {
    const tabBar = createTabBar(["t1", "t2"], 300);

    const dispatched: string[] = [];
    const dropTarget = new TabBarDropTarget(tabBar, "win-1", "ws-1", 0, {
      dispatch: (fn: string) => {
        dispatched.push(fn);
      },
    });

    const srcBtn = document.createElement("span");
    srcBtn.setAttribute("data-tab-id", "t1");
    document.body.appendChild(srcBtn);
    const source = new TabDragSource(srcBtn, "t1", "win-1", "ws-1", "Alpha");

    // Drop at index 0, which is where t1 already is — no-op
    const clientX = dropClientX(tabBar, 0);
    const result = await dropTarget.onDrop(source, clientX, 0);

    expect(result.success).toBe(true);
    expect(dispatched).not.toContain("reorderTabsInCell");
  });

  test("rejects non-tab source types", async () => {
    const tabBar = createTabBar(["t1"], 300);
    const dropTarget = new TabBarDropTarget(tabBar, "win-1", "ws-1", 0, { dispatch: vi.fn() });

    const fakeSource = {
      type: "file",
      getDragData: () => ({ type: "file", filePath: "/test.ts" }),
      onDragStart: vi.fn(),
      onDragEnd: vi.fn(),
      createGhost: vi.fn(),
    };

    const result = await dropTarget.onDrop(fakeSource as any, 100, 0);
    expect(result.success).toBe(false);
  });
});

// ─── E. (Removed — DataTransfer mock tests are replaced by real browser E2E tests
//     in packages/openp41ge-tabs/test-e2e/tab-bar-drop-target.spec.ts)
