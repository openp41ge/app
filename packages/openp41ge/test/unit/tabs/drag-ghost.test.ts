/**
 * Tests for drag ghost creation and positioning.
 *
 * Verifies:
 *   1. TabDragSource.createGhost() produces a ghost with correct styles,
 *      dataset attributes, and text centering
 *   2. RealDragHandler positions the ghost at the cursor (not off-screen)
 *      and re-applies centering styles on every mousemove
 */

import { vi, describe, test, expect, beforeEach } from "vitest";
import { TabDragSource } from "@openp41ge/renderer/services/drag-sources/tab-drag-source";

// RealDragHandler imports app.ts (which constructs the handler at module init
// via AppServices). Avoid the import chain by using dynamic import with mock.
let RealDragHandler: typeof import("@openp41ge/renderer/services/real-drag-handler").RealDragHandler;

vi.mock("@openp41ge/renderer/app", () => ({
  getWorkspace: vi.fn(() => null),
  appServices: {
    tabDragHandler: { init: vi.fn(), createDragStarter: vi.fn(), cancelDrag: vi.fn() },
    gridDragHandler: { init: vi.fn(), handlePaneMouseDown: vi.fn(), cancelDrag: vi.fn() },
    ghostRenderer: {
      showGhost: vi.fn(),
      hideGhost: vi.fn(),
      showCellOverlay: vi.fn(),
      hideCellOverlay: vi.fn(),
    },
    fileDropHandler: { handleDragOver: vi.fn(), handleDragLeave: vi.fn(), handleDrop: vi.fn() },
    quoteController: { start: vi.fn() },
    modelRegistry: vi.fn(),
  },
}));

beforeAll(async () => {
  const mod = await import("@openp41ge/renderer/services/real-drag-handler");
  RealDragHandler = mod.RealDragHandler;
});

// ─── Helpers ──────────────────────────────────────────────────────────────

function createMockTabBtn(
  overrides?: Partial<{ height: number; width: number; title: string }>,
): HTMLElement {
  const h = overrides?.height ?? 32;
  const w = overrides?.width ?? 160;
  const btn = document.createElement("div");
  btn.style.cssText = [
    "display:flex",
    "align-items:stretch",
    `height:${h}px`,
    `width:${w}px`,
    "font-size:12px",
    "flex-shrink:0",
  ].join(";");
  // jsdom returns 0 for offsetWidth/offsetHeight. Mock them so the drag
  // source can read the dimensions it needs for the ghost.
  Object.defineProperty(btn, "offsetHeight", { get: () => h, configurable: true });
  Object.defineProperty(btn, "offsetWidth", { get: () => w, configurable: true });
  btn.innerHTML = [
    '<div class="tab-text-container" style="flex:1;display:flex;align-items:center;padding:0 0 0 14px;">',
    `  <span class="tab-text-inner" style="white-space:nowrap;display:inline-block;overflow:hidden;text-overflow:ellipsis;">${overrides?.title ?? "test.txt"}</span>`,
    "</div>",
    '<span data-close-btn="" style="width:22px;height:22px;flex-shrink:0;margin:auto 6px auto 0;">×</span>',
  ].join("");
  return btn;
}

// ─── TabDragSource.createGhost() ─────────────────────────────────────────

describe("TabDragSource.createGhost()", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  test("creates a ghost element with padding-based vertical centering", () => {
    const btn = createMockTabBtn({ title: "hello.ts", height: 32 });
    document.body.appendChild(btn);

    const source = new TabDragSource(btn, "tab-1", "win-1", "page-1", "hello.ts");
    const ghost = source.createGhost();

    // Text is centered via explicit padding-top/padding-bottom
    // (32px height - ~14px line-height) / 2 = ~9px
    const padMatch = ghost.style.padding.match(/^(\d+)px/);
    expect(padMatch).not.toBeNull();
    if (padMatch) {
      const padTop = parseInt(padMatch[1], 10);
      expect(padTop).toBeGreaterThan(5);
      expect(padTop).toBeLessThan(12);
    }
    expect(ghost.style.display).toBe("block");
  });

  test("ghost has preread dimensions in dataset attributes", () => {
    const btn = createMockTabBtn({ height: 32, width: 160 });
    document.body.appendChild(btn);

    const source = new TabDragSource(btn, "tab-1", "win-1", "page-1", "test.txt");
    const ghost = source.createGhost();

    expect(ghost.dataset.dragGhostWidth).toBe("160");
    expect(ghost.dataset.dragGhostHeight).toBe("32");
  });

  test("ghost dimensions match source tab button", () => {
    const btn = createMockTabBtn({ height: 28, width: 200 });
    document.body.appendChild(btn);

    const source = new TabDragSource(btn, "tab-1", "win-1", "page-1", "test.txt");
    const ghost = source.createGhost();

    expect(ghost.style.height).toBe("28px");
    expect(ghost.style.width).toBe("200px");
  });

  test("ghost has blue focus outline", () => {
    const btn = createMockTabBtn();
    document.body.appendChild(btn);

    const source = new TabDragSource(btn, "tab-1", "win-1", "page-1", "test.txt");
    const ghost = source.createGhost();

    expect(ghost.style.outline).toContain("rgba(74,158,255");
    expect(ghost.style.outlineOffset).toBe("2px");
  });

  test("ghost contains child span with the tab title", () => {
    const btn = createMockTabBtn({ title: "hello.ts" });
    document.body.appendChild(btn);

    const source = new TabDragSource(btn, "tab-1", "win-1", "page-1", "hello.ts");
    const ghost = source.createGhost();

    const span = ghost.querySelector("span");
    expect(span).not.toBeNull();
    expect(span?.textContent).toBe("hello.ts");
  });

  test("ghost is position:fixed with pointer-events:none", () => {
    const btn = createMockTabBtn();
    document.body.appendChild(btn);

    const source = new TabDragSource(btn, "tab-1", "win-1", "page-1", "test.txt");
    const ghost = source.createGhost();

    expect(ghost.style.position).toBe("fixed");
    expect(ghost.style.pointerEvents).toBe("none");
    expect(ghost.style.zIndex).toBe("99999");
  });

  test("ghost has a child span with the label text", () => {
    const btn = createMockTabBtn({ title: "hello.ts" });
    document.body.appendChild(btn);

    const source = new TabDragSource(btn, "tab-1", "win-1", "page-1", "hello.ts");
    const ghost = source.createGhost();

    const label = ghost.querySelector("span");
    expect(label).not.toBeNull();
    expect(label?.textContent).toBe("hello.ts");
  });

  test("ghost has overflow hidden and text-overflow ellipsis", () => {
    const btn = createMockTabBtn();
    document.body.appendChild(btn);

    const source = new TabDragSource(btn, "tab-1", "win-1", "page-1", "test.txt");
    const ghost = source.createGhost();

    expect(ghost.style.overflow).toBe("hidden");
    expect(ghost.style.whiteSpace).toBe("nowrap");
    expect(ghost.style.textOverflow).toBe("ellipsis");
  });

  test("ghost dimensions read from source tab even when not in DOM", () => {
    // TabDragSource reads dimensions in createGhost, not constructor.
    // The tab button must be in the DOM for offsetHeight/offsetWidth.
    const btn = createMockTabBtn({ height: 32, width: 160 });
    // Do NOT append to body — test that dimensions are read when called.
    document.body.appendChild(btn);

    const source = new TabDragSource(btn, "tab-1", "win-1", "page-1", "test.txt");

    // Remove from DOM before createGhost — dimensions read at call time
    document.body.removeChild(btn);
    const ghost = source.createGhost();

    // Dimensions were read at createGhost time and stored in instance
    expect(ghost.dataset.dragGhostWidth).toBe("160");
    expect(ghost.dataset.dragGhostHeight).toBe("32");
  });
});

// ─── RealDragHandler ghost positioning ───────────────────────────────────

describe("RealDragHandler ghost positioning", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    // jsdom does not implement elementFromPoint. Mock it so _resolveTarget
    // doesn't crash — returning null is fine since these tests only verify
    // ghost creation and positioning, not drop target resolution.
    document.elementFromPoint = vi.fn(() => null);
  });

  test("startDrag stores session and defers visual changes", () => {
    const btn = createMockTabBtn();
    document.body.appendChild(btn);

    const handler = new RealDragHandler();
    // RealDragHandler requires init for commandBus, but startDrag doesn't use it
    handler.init({ dispatch: vi.fn() } as any);

    const source = new TabDragSource(btn, "tab-1", "win-1", "page-1", "test.txt");
    handler.startDrag(source, 100, 200);

    // Ghost should NOT be created yet (threshold not met)
    const ghost = document.body.querySelector(".openp41ge-drag-ghost");
    expect(ghost).toBeNull();

    // Session should be active
    expect(handler.isDragging).toBe(true);

    // Clean up
    handler.cancelDrag();
  });

  test("cancelDrag cleans up without error when drag not initiated", () => {
    const btn = createMockTabBtn();
    document.body.appendChild(btn);

    const handler = new RealDragHandler();
    handler.init({ dispatch: vi.fn() } as any);

    const source = new TabDragSource(btn, "tab-1", "win-1", "page-1", "test.txt");
    handler.startDrag(source, 100, 200);

    // Cancel before threshold met
    expect(() => handler.cancelDrag()).not.toThrow();
    expect(handler.isDragging).toBe(false);
  });

  test("initiateDrag positions ghost directly at cursor (not off-screen)", () => {
    const btn = createMockTabBtn({ height: 32, width: 160 });
    document.body.appendChild(btn);

    const handler = new RealDragHandler();
    handler.init({ dispatch: vi.fn() } as any);

    const source = new TabDragSource(btn, "tab-1", "win-1", "page-1", "test.txt");
    handler.startDrag(source, 100, 200);

    // Simulate mousemove crossing the 4px threshold
    const mouseEvent = new MouseEvent("mousemove", {
      clientX: 110,
      clientY: 210,
      screenX: 110,
      screenY: 210,
      bubbles: true,
    });
    document.dispatchEvent(mouseEvent);

    // Ghost should now be in the DOM and positioned at the cursor
    const ghost = document.body.querySelector(".openp41ge-drag-ghost") as HTMLElement | null;
    expect(ghost).not.toBeNull();

    if (ghost) {
      // Ghost should be at cursor position (not -9999px)
      // left = clientX - width/2 = 110 - 80 = 30
      // top = clientY - height/2 = 210 - 16 = 194
      expect(ghost.style.left).toBe("30px");
      expect(ghost.style.top).toBe("194px");

      // Clean up
      handler.cancelDrag();
    }
  });

  test("initiateDrag does NOT position ghost at -9999px", () => {
    const btn = createMockTabBtn({ height: 32, width: 160 });
    document.body.appendChild(btn);

    const handler = new RealDragHandler();
    handler.init({ dispatch: vi.fn() } as any);

    const source = new TabDragSource(btn, "tab-1", "win-1", "page-1", "test.txt");
    handler.startDrag(source, 100, 200);

    // Simulate mousemove crossing the 4px threshold
    const mouseEvent = new MouseEvent("mousemove", {
      clientX: 110,
      clientY: 210,
      screenX: 110,
      screenY: 210,
      bubbles: true,
    });
    document.dispatchEvent(mouseEvent);

    const ghost = document.body.querySelector(".openp41ge-drag-ghost") as HTMLElement | null;
    expect(ghost).not.toBeNull();

    if (ghost) {
      expect(ghost.style.left).not.toBe("-9999px");
      expect(ghost.style.top).not.toBe("-9999px");

      handler.cancelDrag();
    }
  });

  test("ghost uses preread dimensions from dataset, not offsetHeight", () => {
    const btn = createMockTabBtn({ height: 32, width: 160 });
    document.body.appendChild(btn);

    const handler = new RealDragHandler();
    handler.init({ dispatch: vi.fn() } as any);

    const source = new TabDragSource(btn, "tab-1", "win-1", "page-1", "test.txt");
    handler.startDrag(source, 100, 200);

    // Simulate mousemove crossing the 4px threshold
    const mouseEvent = new MouseEvent("mousemove", {
      clientX: 200,
      clientY: 300,
      screenX: 200,
      screenY: 300,
      bubbles: true,
    });
    document.dispatchEvent(mouseEvent);

    const ghost = document.body.querySelector(".openp41ge-drag-ghost") as HTMLElement | null;
    expect(ghost).not.toBeNull();

    if (ghost) {
      // 200 - 160/2 = 120, 300 - 32/2 = 284
      expect(ghost.style.left).toBe("120px");
      expect(ghost.style.top).toBe("284px");

      handler.cancelDrag();
    }
  });

  test("ghost position updates on subsequent mousemove", () => {
    const btn = createMockTabBtn({ height: 32, width: 160 });
    document.body.appendChild(btn);

    const handler = new RealDragHandler();
    handler.init({ dispatch: vi.fn() } as any);

    const source = new TabDragSource(btn, "tab-1", "win-1", "page-1", "test.txt");
    handler.startDrag(source, 100, 200);

    // Trigger threshold crossing
    const mouseEvent1 = new MouseEvent("mousemove", {
      clientX: 110,
      clientY: 210,
      screenX: 110,
      screenY: 210,
      bubbles: true,
    });
    document.dispatchEvent(mouseEvent1);

    const ghost = document.body.querySelector(".openp41ge-drag-ghost") as HTMLElement | null;
    expect(ghost).not.toBeNull();

    if (ghost) {
      // First position: startX - gw/2 = 100 - 80 = 20, startY - gh/2 = 200 - 16 = 184
      // But then immediately repositioned to 110 - 80 = 30, 210 - 16 = 194
      expect(ghost.style.left).toBe("30px");
      expect(ghost.style.top).toBe("194px");

      // Second mousemove updates position
      const mouseEvent2 = new MouseEvent("mousemove", {
        clientX: 200,
        clientY: 300,
        screenX: 200,
        screenY: 300,
        bubbles: true,
      });
      document.dispatchEvent(mouseEvent2);

      expect(ghost.style.left).toBe("120px");
      expect(ghost.style.top).toBe("284px");

      handler.cancelDrag();
    }
  });

  test("mousemove does not crash when ghost has no dataset attributes", () => {
    const btn = createMockTabBtn({ height: 32, width: 160 });
    document.body.appendChild(btn);

    const handler = new RealDragHandler();
    handler.init({ dispatch: vi.fn() } as any);

    const source = new TabDragSource(btn, "tab-1", "win-1", "page-1", "test.txt");
    handler.startDrag(source, 100, 200);

    // Trigger threshold crossing
    const mouseEvent1 = new MouseEvent("mousemove", {
      clientX: 110,
      clientY: 210,
      screenX: 110,
      screenY: 210,
      bubbles: true,
    });
    document.dispatchEvent(mouseEvent1);

    const ghost = document.body.querySelector(".openp41ge-drag-ghost") as HTMLElement | null;
    expect(ghost).not.toBeNull();

    if (ghost) {
      // Remove dataset attributes (simulating a ghost from an older version)
      delete ghost.dataset.dragGhostWidth;
      delete ghost.dataset.dragGhostHeight;

      // Should not crash — uses defaults 160/32
      expect(() => {
        const mouseEvent2 = new MouseEvent("mousemove", {
          clientX: 120,
          clientY: 220,
          screenX: 120,
          screenY: 220,
          bubbles: true,
        });
        document.dispatchEvent(mouseEvent2);
      }).not.toThrow();

      handler.cancelDrag();
    }
  });

  test("mouseup without threshold met → cleans up without dispatch", () => {
    const dispatched: string[] = [];
    const btn = createMockTabBtn({ height: 32, width: 160 });
    document.body.appendChild(btn);

    const handler = new RealDragHandler();
    handler.init({
      dispatch: vi.fn((...args: unknown[]) => dispatched.push(args[0] as string)),
    } as any);

    const source = new TabDragSource(btn, "tab-1", "win-1", "page-1", "test.txt");
    handler.startDrag(source, 100, 200);

    // Mouseup BEFORE crossing the 4px threshold (no mousemove)
    const mouseUp = new MouseEvent("mouseup", {
      clientX: 102,
      clientY: 202,
      bubbles: true,
    });
    document.dispatchEvent(mouseUp);

    // No dispatch should have occurred
    expect(dispatched).toHaveLength(0);
    expect(handler.isDragging).toBe(false);

    handler.cancelDrag();
  });

  test("mouseup outside drag start region → cleans up without dispatch", () => {
    const dispatched: string[] = [];
    const btn = createMockTabBtn({ height: 32, width: 160 });
    document.body.appendChild(btn);

    const handler = new RealDragHandler();
    handler.init({
      dispatch: vi.fn((...args: unknown[]) => dispatched.push(args[0] as string)),
    } as any);

    const source = new TabDragSource(btn, "tab-1", "win-1", "page-1", "test.txt");
    handler.startDrag(source, 100, 200);

    // Move slightly (still within 4px threshold)
    const mouseMove = new MouseEvent("mousemove", {
      clientX: 103,
      clientY: 202,
      bubbles: true,
    });
    document.dispatchEvent(mouseMove);

    // Still within threshold, mouseup should clean up without dispatch
    const mouseUp = new MouseEvent("mouseup", {
      clientX: 103,
      clientY: 202,
      bubbles: true,
    });
    document.dispatchEvent(mouseUp);

    expect(dispatched).toHaveLength(0);
    expect(handler.isDragging).toBe(false);

    handler.cancelDrag();
  });
});

// ─── GridDropTarget._handleCellDrop — tab already in target cell ────

describe("GridDropTarget._handleCellDrop — tab already in target cell", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  function makeGridEl(placements: Array<{ col: number; tabIds: string[] }>): HTMLElement {
    const el = document.createElement("openp41ge-grid") as any;
    el.pageData = {
      id: "openp41ge-1",
      grid: {
        cols: placements.length,
        placements: placements.map((p) => ({
          position: { row: 0, col: p.col },
          tabIds: p.tabIds,
          activeTabId: p.tabIds[0],
        })),
      },
    };
    el.winId = "win-1";
    el.getTab = vi.fn();
    el._getNextTabForCell = vi.fn();
    el._lastActiveCellCol = 0;
    el._focusedCol = 0;
    el.getBoundingClientRect = () =>
      ({
        left: 0,
        top: 0,
        width: 800,
        height: 600,
        right: 800,
        bottom: 600,
      }) as DOMRect;
    // Mock grid cells so onDrop can read flex values
    const cellEls = placements.map((p) => {
      const cell = document.createElement("div");
      cell.classList.add("openp41ge-grid-cell");
      cell.style.flex = "1";
      return cell;
    });
    el.querySelectorAll = (sel: string) => {
      if (sel === ".openp41ge-grid-cell") return cellEls;
      return [];
    };
    // Add cells as children so getBoundingClientRect can find them
    for (const c of cellEls) el.appendChild(c);
    return el;
  }

  test("dispatches activateTabInCell (not moveTabBetweenCells) when tab is already in the target placement", async () => {
    const dispatched: Array<{ fn: string; args: unknown[] }> = [];
    const mockDispatch = vi.fn((...args: unknown[]) => {
      dispatched.push({ fn: args[0] as string, args: args.slice(1) });
    });

    const gridEl = makeGridEl([{ col: 0, tabIds: ["tab-1"] }]);

    const { GridDropTarget } =
      await import("@openp41ge/renderer/services/drop-targets/grid-drop-target");
    const target = new GridDropTarget(gridEl as any, { dispatch: mockDispatch });

    const btn = createMockTabBtn({ title: "test", height: 32 });
    document.body.appendChild(btn);
    const source = new TabDragSource(btn, "tab-1", "win-1", "openp41ge-1", "test");

    // Drop at center of 800px grid → relX=400, which is outside the 15%
    // boundary zone (0..120 and 680..800), so it's a cell-center drop.
    const result = await target.onDrop(source, 400, 200);

    expect(result.success).toBe(true);
    const activateCall = dispatched.find((d) => d.fn === "activateTabInCell");
    expect(activateCall).toBeDefined();
    // activateTabInCell(winId, tabId) — no worksetId in operation args
    expect(activateCall!.args).toEqual(["win-1", "tab-1"]);

    const moveCall = dispatched.find((d) => d.fn === "moveTabBetweenCells");
    expect(moveCall).toBeUndefined();
  });

  test("dispatches moveTabBetweenCells when tab is NOT already in the target placement", async () => {
    const dispatched: Array<{ fn: string; args: unknown[] }> = [];
    const mockDispatch = vi.fn((...args: unknown[]) => {
      dispatched.push({ fn: args[0] as string, args: args.slice(1) });
    });

    const gridEl = makeGridEl([
      { col: 0, tabIds: ["tab-1"] },
      { col: 1, tabIds: ["tab-2"] },
    ]);

    const { GridDropTarget } =
      await import("@openp41ge/renderer/services/drop-targets/grid-drop-target");
    const target = new GridDropTarget(gridEl as any, { dispatch: mockDispatch });

    const btn = createMockTabBtn({ title: "test", height: 32 });
    document.body.appendChild(btn);
    const source = new TabDragSource(btn, "tab-1", "win-1", "openp41ge-1", "test");

    // Drop on col 1 — tab-1 is in col 0, so this should be a cross-cell move
    const result = await target.onDrop(source, 600, 200);

    expect(result.success).toBe(true);
    const moveCall = dispatched.find((d) => d.fn === "moveTabBetweenCells");
    expect(moveCall).toBeDefined();
  });
});

// ─── GridDropTarget boundary drop ─────────────────────────────────────────

describe("GridDropTarget.onDrop — boundary drop path", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  /**
   * Create a 2-col grid (800px wide, each cell 400px).
   * Boundaries at: 0px (left), 400px (center), 800px (right).
   */
  function makeTwoColGrid(): HTMLElement {
    const el = document.createElement("openp41ge-grid") as any;
    el.pageData = {
      id: "openp41ge-1",
      grid: {
        cols: 2,
        placements: [
          { position: { row: 0, col: 0 }, tabIds: ["tab-1", "tab-2"], activeTabId: "tab-1" },
          { position: { row: 0, col: 1 }, tabIds: ["tab-3"], activeTabId: "tab-3" },
        ],
      },
    };
    el.winId = "win-1";
    el.getTab = vi.fn();
    el._getNextTabForCell = vi.fn(() => null);
    el._lastActiveCellCol = 0;
    el._focusedCol = 0;
    el.getBoundingClientRect = () =>
      ({
        left: 0,
        top: 0,
        width: 800,
        height: 600,
        right: 800,
        bottom: 600,
        x: 0,
        y: 0,
      }) as DOMRect;

    // Two equal-width cells
    const cell1 = document.createElement("div");
    cell1.classList.add("openp41ge-grid-cell");
    cell1.style.flex = "1 1 0%";
    const cell2 = document.createElement("div");
    cell2.classList.add("openp41ge-grid-cell");
    cell2.style.flex = "1 1 0%";
    el.appendChild(cell1);
    el.appendChild(cell2);

    el.querySelectorAll = (sel: string) => {
      if (sel === ".openp41ge-grid-cell") return el.children;
      return [];
    };
    return el as HTMLElement;
  }

  test("drop at left boundary of 2-col grid → dispatches splitTabFromCell with splitLeft=true", async () => {
    const dispatched: Array<{ fn: string; args: unknown[] }> = [];
    const mockDispatch = vi.fn((...args: unknown[]) => {
      dispatched.push({ fn: args[0] as string, args: args.slice(1) });
    });

    const gridEl = makeTwoColGrid();
    const { GridDropTarget } =
      await import("@openp41ge/renderer/services/drop-targets/grid-drop-target");
    const target = new GridDropTarget(gridEl as any, { dispatch: mockDispatch });

    const btn = createMockTabBtn({ title: "tab-1", height: 32 });
    document.body.appendChild(btn);
    const source = new TabDragSource(btn, "tab-1", "win-1", "openp41ge-1", "tab-1");

    // Drop at 50px (within left 15% boundary zone of col 0)
    const result = await target.onDrop(source, 50, 200);

    expect(result.success).toBe(true);
    const splitCall = dispatched.find((d) => d.fn === "splitTabFromCell");
    expect(splitCall).toBeDefined();
    if (splitCall) {
      // splitTabFromCell(winId, tabId, splitCol, splitLeft, focusTabId)
      expect(splitCall.args[0]).toBe("win-1");
      expect(splitCall.args[1]).toBe("tab-1");
      expect(splitCall.args[2]).toBe(0); // splitCol=0
      expect(splitCall.args[3]).toBe(true); // splitLeft=true
    }
  });

  test("drop at right boundary of 2-col grid → dispatches splitTabFromCell with splitLeft=false", async () => {
    const dispatched: Array<{ fn: string; args: unknown[] }> = [];
    const mockDispatch = vi.fn((...args: unknown[]) => {
      dispatched.push({ fn: args[0] as string, args: args.slice(1) });
    });

    const gridEl = makeTwoColGrid();
    const { GridDropTarget } =
      await import("@openp41ge/renderer/services/drop-targets/grid-drop-target");
    const target = new GridDropTarget(gridEl as any, { dispatch: mockDispatch });

    const btn = createMockTabBtn({ title: "tab-1", height: 32 });
    document.body.appendChild(btn);
    const source = new TabDragSource(btn, "tab-1", "win-1", "openp41ge-1", "tab-1");

    // Drop at 780px (within right 15% boundary zone of col 1)
    const result = await target.onDrop(source, 780, 200);

    expect(result.success).toBe(true);
    const splitCall = dispatched.find((d) => d.fn === "splitTabFromCell");
    expect(splitCall).toBeDefined();
    if (splitCall) {
      expect(splitCall.args[2]).toBe(1); // splitCol=1 (last col)
      expect(splitCall.args[3]).toBe(false); // splitLeft=false
    }
  });

  test("drop at interior boundary (400px) of 2-col grid → dispatches splitTabFromCell at mouse col", async () => {
    const dispatched: Array<{ fn: string; args: unknown[] }> = [];
    const mockDispatch = vi.fn((...args: unknown[]) => {
      dispatched.push({ fn: args[0] as string, args: args.slice(1) });
    });

    const gridEl = makeTwoColGrid();
    const { GridDropTarget } =
      await import("@openp41ge/renderer/services/drop-targets/grid-drop-target");
    const target = new GridDropTarget(gridEl as any, { dispatch: mockDispatch });

    const btn = createMockTabBtn({ title: "tab-1", height: 32 });
    document.body.appendChild(btn);
    const source = new TabDragSource(btn, "tab-1", "win-1", "openp41ge-1", "tab-1");

    // Drop at 400px (center divider). For 2 equal cols:
    // boundaryIndex=1, adjWidth = 400
    // |relX - 400|/400 = 0 < 0.15 → boundary
    // At exactly 400px: relX >= 400 && < 800 → mouseCol=1
    // boundaryIndex=1, mouseCol=1 (>=1) → splitCol=mouseCol=1, splitLeft=true
    const result = await target.onDrop(source, 400, 200);

    expect(result.success).toBe(true);
    const splitCall = dispatched.find((d) => d.fn === "splitTabFromCell");
    expect(splitCall).toBeDefined();
    if (splitCall) {
      // boundaryIndex=1, mouseCol=1 → splitCol=1, splitLeft=true
      expect(splitCall.args[2]).toBe(1); // splitCol
      expect(splitCall.args[3]).toBe(true); // splitLeft
    }
  });

  test("drop at interior boundary near right (410px) → dispatches splitTabFromCell with correct splitCol", async () => {
    const dispatched: Array<{ fn: string; args: unknown[] }> = [];
    const mockDispatch = vi.fn((...args: unknown[]) => {
      dispatched.push({ fn: args[0] as string, args: args.slice(1) });
    });

    const gridEl = makeTwoColGrid();
    const { GridDropTarget } =
      await import("@openp41ge/renderer/services/drop-targets/grid-drop-target");
    const target = new GridDropTarget(gridEl as any, { dispatch: mockDispatch });

    const btn = createMockTabBtn({ title: "tab-1", height: 32 });
    document.body.appendChild(btn);
    const source = new TabDragSource(btn, "tab-1", "win-1", "openp41ge-1", "tab-1");

    // Drop at 410px (just right of the center divider, in col 1)
    // For equal cols of 400px each:
    // dividerPositions = [400]
    // mouseCol: prevDiv(1)=400, thisDiv(1)=800. relX=410 >= 400 && < 800 → mouseCol=1
    // boundaryIndex=1: |410-400|/400 = 10/400 = 0.025 < 0.15 → boundary
    // mouseCol=1 >= boundaryIndex=1 → splitCol=mouseCol=1, splitLeft=true
    const result = await target.onDrop(source, 410, 200);

    expect(result.success).toBe(true);
    const splitCall = dispatched.find((d) => d.fn === "splitTabFromCell");
    expect(splitCall).toBeDefined();
    if (splitCall) {
      // boundaryIndex=1, mouseCol=1 → splitCol=1, splitLeft=true
      expect(splitCall.args[2]).toBe(1); // splitCol
      expect(splitCall.args[3]).toBe(true); // splitLeft
    }
  });
});
