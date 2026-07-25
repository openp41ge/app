/**
 * Integration tests for file drops onto the grid.
 *
 * Verifies that:
 *   1. GridDropTarget.onDrop() dispatches the correct command for file data
 *   2. Boundary detection for file drops returns correct results
 *   3. DragOrchestrator._initiateDrag sets ghost dataset dimensions correctly
 *   4. Ghost positioning centers on cursor after DOM append
 *
 * These tests use production code paths — FileDragSource, GridDropTarget,
 * computeDropTarget, and DragOrchestrator — with mocked DOM and dispatch.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { computeDropTarget } from "@openp41ge/renderer/services/boundary/detection";
import { FileDragSource } from "@openp41ge/renderer/services/drag-sources/file-drag-source";
import { GridDropTarget } from "@openp41ge/renderer/services/drop-targets/grid-drop-target";
import { dragOrchestrator } from "@openp41ge/renderer/services/drag/orchestrator";

// ─── Helpers ──────────────────────────────────────────────────────────────

/**
 * Create a mock grid element with the given number of columns.
 * Each cell gets equal flex (1 1 0%).
 */
function makeGridEl(cols: number, totalWidth = 800): HTMLElement {
  const el = document.createElement("openp41ge-grid") as any;
  const placements = Array.from({ length: cols }, (_, i) => ({
    position: { row: 0, col: i },
    tabIds: ["tab-" + i],
    activeTabId: "tab-" + i,
  }));
  el.pageData = {
    id: "openp41ge-1",
    grid: { cols, placements },
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
      width: totalWidth,
      height: 600,
      right: totalWidth,
      bottom: 600,
    }) as DOMRect;

  // Add cell children (needed for getDividerPositions / flex reading)
  for (let i = 0; i < cols; i++) {
    const cell = document.createElement("div");
    cell.classList.add("openp41ge-grid-cell");
    cell.style.flex = "1 1 0%";
    el.appendChild(cell);
  }

  el.querySelectorAll = (sel: string) => {
    if (sel === ".openp41ge-grid-cell") return el.children;
    return [];
  };
  return el as HTMLElement;
}

/**
 * Create a FileDragSource for the given path.
 */
function makeFileSource(filePath: string, fileName?: string): FileDragSource {
  return new FileDragSource(filePath, fileName);
}

// ─── File drop: cell-center scenarios ──────────────────────────────────

describe("File drop — cell center", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    dragOrchestrator.cancelDrag();
  });

  it("single-column grid → dispatches openFileInCell with targetCol=0", async () => {
    const dispatched: Array<{ fn: string; args: unknown[] }> = [];
    const mockDispatch = vi.fn((...args: unknown[]) => {
      dispatched.push({ fn: args[0] as string, args: args.slice(1) });
    });

    const gridEl = makeGridEl(1, 800);
    const target = new GridDropTarget(gridEl, { dispatch: mockDispatch });
    const source = makeFileSource("/home/user/test.ts", "test.ts");

    // Drop at center of 800px grid → relX=400, far from boundaries
    const result = await target.onDrop(source, 400, 200);

    expect(result.success).toBe(true);
    expect(dispatched).toHaveLength(1);
    expect(dispatched[0].fn).toBe("openFileInCell");
    expect(dispatched[0].args[1]).toBe("0"); // column index as string
    expect(dispatched[0].args[2]).toBe("/home/user/test.ts"); // filePath
    expect(dispatched[0].args[3]).toBe(0); // targetCol
  });

  it("two-column grid, drop on col 0 → dispatches openFileInCell with targetCol=0", async () => {
    const dispatched: Array<{ fn: string; args: unknown[] }> = [];
    const mockDispatch = vi.fn((...args: unknown[]) => {
      dispatched.push({ fn: args[0] as string, args: args.slice(1) });
    });

    const gridEl = makeGridEl(2, 800);
    const target = new GridDropTarget(gridEl, { dispatch: mockDispatch });
    const source = makeFileSource("/home/user/data.csv");

    // Drop at 200px (left half, far from boundaries)
    const result = await target.onDrop(source, 200, 200);

    expect(result.success).toBe(true);
    expect(dispatched).toHaveLength(1);
    expect(dispatched[0].fn).toBe("openFileInCell");
    expect(dispatched[0].args[3]).toBe(0);
  });

  it("two-column grid, drop on col 1 → dispatches openFileInCell with targetCol=1", async () => {
    const dispatched: Array<{ fn: string; args: unknown[] }> = [];
    const mockDispatch = vi.fn((...args: unknown[]) => {
      dispatched.push({ fn: args[0] as string, args: args.slice(1) });
    });

    const gridEl = makeGridEl(2, 800);
    const target = new GridDropTarget(gridEl, { dispatch: mockDispatch });
    const source = makeFileSource("/home/user/notes.md");

    // Drop at 600px (right half)
    const result = await target.onDrop(source, 600, 200);

    expect(result.success).toBe(true);
    expect(dispatched[0].fn).toBe("openFileInCell");
    expect(dispatched[0].args[3]).toBe(1);
  });

  it("three-column grid, drop on col 2 → dispatches openFileInCell with targetCol=2", async () => {
    const dispatched: Array<{ fn: string; args: unknown[] }> = [];
    const mockDispatch = vi.fn((...args: unknown[]) => {
      dispatched.push({ fn: args[0] as string, args: args.slice(1) });
    });

    const gridEl = makeGridEl(3, 900);
    const target = new GridDropTarget(gridEl, { dispatch: mockDispatch });
    const source = makeFileSource("/home/user/image.png");

    // Drop at 750px (right third of 900px grid)
    const result = await target.onDrop(source, 750, 200);

    expect(result.success).toBe(true);
    expect(dispatched[0].fn).toBe("openFileInCell");
    expect(dispatched[0].args[3]).toBe(2);
  });
});

// ─── File drop: boundary scenarios ─────────────────────────────────────

describe("File drop — boundary drop returns error", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("near left boundary → returns success:false (boundary drops not yet supported for files)", async () => {
    const mockDispatch = vi.fn();
    const gridEl = makeGridEl(2, 800);
    const target = new GridDropTarget(gridEl, { dispatch: mockDispatch });
    const source = makeFileSource("/home/user/test.ts");

    // Drop at 50px (within left 15% boundary zone of a 2-col, 800px grid)
    const result = await target.onDrop(source, 50, 200);

    expect(result.success).toBe(false);
    expect(result.reason).toContain("boundary drop not yet supported for files");
  });

  it("near right boundary → returns success:false", async () => {
    const mockDispatch = vi.fn();
    const gridEl = makeGridEl(2, 800);
    const target = new GridDropTarget(gridEl, { dispatch: mockDispatch });
    const source = makeFileSource("/home/user/test.ts");

    // Drop at 780px (within right 15% boundary zone)
    const result = await target.onDrop(source, 780, 200);

    expect(result.success).toBe(false);
    expect(result.reason).toContain("boundary drop not yet supported for files");
  });

  it("near interior boundary → returns success:false", async () => {
    const mockDispatch = vi.fn();
    const gridEl = makeGridEl(2, 800);
    const target = new GridDropTarget(gridEl, { dispatch: mockDispatch });
    const source = makeFileSource("/home/user/test.ts");

    // Drop at 400px (center divider of 2 equal cols)
    const result = await target.onDrop(source, 400, 200);

    expect(result.success).toBe(false);
    expect(result.reason).toContain("boundary drop not yet supported for files");
  });

  it("single-column grid, left edge → cell-center drop (not boundary)", async () => {
    const dispatched: Array<{ fn: string; args: unknown[] }> = [];
    const mockDispatch = vi.fn((...args: unknown[]) => {
      dispatched.push({ fn: args[0] as string, args: args.slice(1) });
    });

    const gridEl = makeGridEl(1, 800);
    const target = new GridDropTarget(gridEl, { dispatch: mockDispatch });
    const source = makeFileSource("/home/user/test.ts");

    // Single-col grid always returns cell-center (isBoundary=false)
    const result = await target.onDrop(source, 10, 200);

    expect(result.success).toBe(true);
    expect(dispatched[0].fn).toBe("openFileInCell");
  });
});

// ─── GridDropTarget.onHover — visual feedback for file drops ─────────

describe("GridDropTarget.onHover visual feedback for file drops", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("cell-center hover → returns cell-highlight feedback type", () => {
    const gridEl = makeGridEl(2, 800);
    const target = new GridDropTarget(gridEl, { dispatch: vi.fn() });
    const source = makeFileSource("/home/user/test.ts");

    const feedback = target.onHover(source, 200, 200);

    expect(feedback).not.toBeNull();
    expect(feedback!.showGhost).toBe(true);
    expect(feedback!.ghostConfig).toBeDefined();
    expect(feedback!.ghostConfig.type).toBe("cell-highlight");
    expect(feedback!.ghostConfig.col).toBe(0);
  });

  it("near boundary hover → returns split feedback type", () => {
    const gridEl = makeGridEl(2, 800);
    const target = new GridDropTarget(gridEl, { dispatch: vi.fn() });
    const source = makeFileSource("/home/user/test.ts");

    const feedback = target.onHover(source, 50, 200);

    expect(feedback).not.toBeNull();
    expect(feedback!.showGhost).toBe(true);
    expect(feedback!.ghostConfig.type).toBe("split");
    expect(feedback!.ghostConfig.splitLeft).toBe(true);
    expect(feedback!.ghostConfig.splitCol).toBe(0);
  });

  it("near right boundary → splitLeft=false and splitCol=last col", () => {
    const gridEl = makeGridEl(2, 800);
    const target = new GridDropTarget(gridEl, { dispatch: vi.fn() });
    const source = makeFileSource("/home/user/test.ts");

    const feedback = target.onHover(source, 780, 200);

    expect(feedback).not.toBeNull();
    expect(feedback!.ghostConfig.type).toBe("split");
    expect(feedback!.ghostConfig.splitLeft).toBe(false);
    expect(feedback!.ghostConfig.splitCol).toBe(1);
  });
});

// ─── DragOrchestrator _initiateDrag — ghost dimensions ─────────────

describe("DragOrchestrator ghost dimensions after initiateDrag", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    dragOrchestrator.cancelDrag();
    // jsdom doesn't implement elementFromPoint — mock to return null
    // so the mousemove handler doesn't crash resolving targets
    document.elementFromPoint = vi.fn(() => null);
  });

  it("FileDragSource ghost gets dataset dimensions after _initiateDrag", () => {
    const source = makeFileSource("/home/user/test.ts", "test.ts");
    dragOrchestrator.startDrag(source, 100, 200);

    // Cross the 4px threshold
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
      // After _initiateDrag, the ghost is appended to DOM and its actual
      // dimensions are stored in dataset. In jsdom, offsetWidth/Height are 0,
      // so they fall back to 160/32 defaults.
      expect(ghost.dataset.dragGhostWidth).toBeDefined();
      expect(ghost.dataset.dragGhostHeight).toBeDefined();
      // Default fallback when offsetWidth is 0 in jsdom
      expect(ghost.dataset.dragGhostWidth).toBe("160");
      expect(ghost.dataset.dragGhostHeight).toBe("32");
    }

    dragOrchestrator.cancelDrag();
  });

  it("FileDragSource ghost positioned centered on cursor", () => {
    const source = makeFileSource("/home/user/test.ts", "test.ts");
    dragOrchestrator.startDrag(source, 100, 200);

    // Cross threshold
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
      // Fallback: gw=160, gh=32
      // left = 200 - 160/2 = 120
      // top = 300 - 32/2 = 284
      expect(ghost.style.left).toBe("120px");
      expect(ghost.style.top).toBe("284px");
    }

    dragOrchestrator.cancelDrag();
  });

  it("FileDragSource ghost re-positions on subsequent mousemove", () => {
    const source = makeFileSource("/home/user/test.ts", "test.ts");
    dragOrchestrator.startDrag(source, 100, 200);

    // Cross threshold
    const move1 = new MouseEvent("mousemove", {
      clientX: 110,
      clientY: 210,
      screenX: 110,
      screenY: 210,
      bubbles: true,
    });
    document.dispatchEvent(move1);

    const ghost = document.body.querySelector(".openp41ge-drag-ghost") as HTMLElement | null;
    expect(ghost).not.toBeNull();

    if (ghost) {
      // 110 - 80 = 30, 210 - 16 = 194
      expect(ghost.style.left).toBe("30px");
      expect(ghost.style.top).toBe("194px");

      // Move again
      const move2 = new MouseEvent("mousemove", {
        clientX: 500,
        clientY: 400,
        screenX: 500,
        screenY: 400,
        bubbles: true,
      });
      document.dispatchEvent(move2);

      // 500 - 80 = 420, 400 - 16 = 384
      expect(ghost.style.left).toBe("420px");
      expect(ghost.style.top).toBe("384px");
    }

    dragOrchestrator.cancelDrag();
  });

  it("mousemove without threshold met → no ghost created", () => {
    const source = makeFileSource("/home/user/test.ts", "test.ts");
    dragOrchestrator.startDrag(source, 100, 200);

    // Move within 4px threshold
    const moveEvent = new MouseEvent("mousemove", {
      clientX: 103,
      clientY: 201,
      screenX: 103,
      screenY: 201,
      bubbles: true,
    });
    document.dispatchEvent(moveEvent);

    // Ghost should not appear
    const ghost = document.body.querySelector(".openp41ge-drag-ghost");
    expect(ghost).toBeNull();

    dragOrchestrator.cancelDrag();
  });
});

// ─── Parallel: boundary detection pure logic for file-drop positions ──

describe("computeDropTarget for file-drop positions (pure logic)", () => {
  it("identifies cell-center in left column of 2-col grid", () => {
    const gridEl = makeGridEl(2, 800);
    const result = computeDropTarget(gridEl, 200, 800, 2);
    expect(result.col).toBe(0);
    expect(result.isBoundary).toBe(false);
  });

  it("identifies cell-center in right column of 2-col grid", () => {
    const gridEl = makeGridEl(2, 800);
    const result = computeDropTarget(gridEl, 600, 800, 2);
    expect(result.col).toBe(1);
    expect(result.isBoundary).toBe(false);
  });

  it("identifies boundary near left edge", () => {
    const gridEl = makeGridEl(2, 800);
    const result = computeDropTarget(gridEl, 50, 800, 2);
    expect(result.isBoundary).toBe(true);
    expect(result.boundaryIndex).toBe(0);
  });

  it("identifies boundary near center divider", () => {
    const gridEl = makeGridEl(2, 800);
    const result = computeDropTarget(gridEl, 485, 800, 2);
    expect(result.isBoundary).toBe(true);
    expect(result.boundaryIndex).toBe(1);
  });

  it("identifies boundary near right edge", () => {
    const gridEl = makeGridEl(2, 800);
    const result = computeDropTarget(gridEl, 780, 800, 2);
    expect(result.isBoundary).toBe(true);
    expect(result.boundaryIndex).toBe(2);
  });

  it("single-column grid never reports boundary", () => {
    const gridEl = makeGridEl(1, 800);
    const result = computeDropTarget(gridEl, 10, 800, 1);
    expect(result.isBoundary).toBe(false);
    expect(result.col).toBe(0);
  });
});
