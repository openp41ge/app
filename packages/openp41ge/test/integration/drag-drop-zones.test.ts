/**
 * Comprehensive grid drop-zone tests.
 *
 * Verifies every possible drop position for single-cell, 2-cell, and 3-cell
 * grids. For N columns there are 3N drop options:
 *   - N cell centers
 *   - 2N boundary zones (each boundary can split left or right except
 *     the extreme edges which have only one valid direction)
 *
 * Each test verifies:
 *   1. computeDropTarget returns the correct col/isBoundary/boundaryIndex
 *   2. GridDropTarget.onHover returns the correct ghostConfig (splitCol, splitLeft, type)
 *   3. GridDropTarget.onDrop dispatches the correct command with the right args
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { computeDropTarget } from "@openp41ge/renderer/services/boundary/detection";
import { FileDragSource } from "@openp41ge/renderer/services/drag-sources/file-drag-source";
import { GridDropTarget } from "@openp41ge/renderer/services/drop-targets/grid-drop-target";

// ─── Helpers ──────────────────────────────────────────────────────────────

function makeGridEl(cols: number, totalWidth = 900): HTMLElement {
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

function makeFileSource(): FileDragSource {
  return new FileDragSource("/home/user/test.ts", "test.ts");
}

/**
 * Run all three checks for a single (x, cols, width) position.
 * Returns a promise because onDrop is async.
 */
async function probePosition(
  gridEl: HTMLElement,
  cols: number,
  clientX: number,
  totalWidth: number,
) {
  const commandBus = { dispatch: vi.fn() };
  const target = new GridDropTarget(gridEl, { dispatch: commandBus.dispatch });
  const source = makeFileSource();

  const pos = computeDropTarget(gridEl, clientX, totalWidth, cols);
  const feedback = target.onHover(source, clientX, 200);
  const dropResult = await target.onDrop(source, clientX, 200);

  return {
    pos,
    feedback,
    drop: {
      result: dropResult,
      dispatched: (commandBus.dispatch as ReturnType<typeof vi.fn>).mock.calls.map((call: any) => ({
        fn: call[0],
        args: call.slice(1),
      })),
    },
  };
}

// ─── Assertion helpers ────────────────────────────────────────────────────

function assertCellCenter(
  r: Awaited<ReturnType<typeof probePosition>>,
  expectedCol: number,
  label: string,
): void {
  expect(r.pos.col, `${label}: computeDropTarget col`).toBe(expectedCol);
  expect(r.pos.isBoundary, `${label}: computeDropTarget isBoundary`).toBe(false);
  expect(r.feedback, `${label}: feedback`).not.toBeNull();
  expect(r.feedback!.showGhost, `${label}: feedback showGhost`).toBe(true);
  expect(r.feedback!.ghostConfig, `${label}: feedback ghostConfig`).toBeDefined();
  expect(r.feedback!.ghostConfig!.type, `${label}: feedback type`).toBe("cell-highlight");
  expect(r.feedback!.ghostConfig!.col, `${label}: feedback ghostConfig.col`).toBe(expectedCol);
  expect(r.drop.result.success, `${label}: drop success`).toBe(true);
  expect(r.drop.dispatched, `${label}: drop dispatched`).toHaveLength(1);
  expect(r.drop.dispatched[0].fn, `${label}: drop fn`).toBe("openFileInCell");
  expect(r.drop.dispatched[0].args[3], `${label}: drop targetCol`).toBe(expectedCol);
}

function assertBoundaryDrop(
  r: Awaited<ReturnType<typeof probePosition>>,
  expectedBoundaryIndex: number,
  expectedSplitCol: number,
  expectedSplitLeft: boolean,
  label: string,
): void {
  expect(r.pos.isBoundary, `${label}: isBoundary`).toBe(true);
  expect(r.pos.boundaryIndex, `${label}: boundaryIndex`).toBe(expectedBoundaryIndex);
  expect(r.feedback, `${label}: feedback`).not.toBeNull();
  expect(r.feedback!.showGhost, `${label}: feedback showGhost`).toBe(true);
  expect(r.feedback!.ghostConfig, `${label}: feedback ghostConfig`).toBeDefined();
  expect(r.feedback!.ghostConfig!.type, `${label}: feedback type`).toBe("split");
  expect(r.feedback!.ghostConfig!.splitCol, `${label}: splitCol`).toBe(expectedSplitCol);
  expect(r.feedback!.ghostConfig!.splitLeft, `${label}: splitLeft`).toBe(expectedSplitLeft);
  expect(r.feedback!.ghostConfig!.boundaryIndex, `${label}: ghostConfig boundaryIndex`).toBe(
    expectedBoundaryIndex,
  );
  expect(r.feedback!.ghostConfig!.mouseCol, `${label}: ghostConfig mouseCol`).toBeDefined();
  // File drops on boundaries return error
  expect(r.drop.result.success, `${label}: drop success`).toBe(false);
  expect(r.drop.result.reason, `${label}: drop reason`).toContain(
    "boundary drop not yet supported",
  );
}

// ─── 1-CELL GRID (3 drop zones) ──────────────────────────────────────────

describe("1-cell grid — 3 drop zones", () => {
  const COLS = 1;
  const W = 900;

  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("[1/3] Left edge → cell center (cols<=1 has no boundaries)", async () => {
    const r = await probePosition(makeGridEl(COLS, W), COLS, 40, W);
    assertCellCenter(r, 0, "1-col left");
  });

  it("[2/3] Right edge → cell center (cols<=1 has no boundaries)", async () => {
    const r = await probePosition(makeGridEl(COLS, W), COLS, W - 40, W);
    assertCellCenter(r, 0, "1-col right");
  });

  it("[3/3] Cell center → col=0, cell-highlight", async () => {
    const r = await probePosition(makeGridEl(COLS, W), COLS, W / 2, W);
    assertCellCenter(r, 0, "1-col center");
  });
});

// ─── 2-CELL GRID (6 drop zones) ──────────────────────────────────────────

describe("2-cell grid — 6 drop zones", () => {
  const COLS = 2;
  const W = 900;

  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("[1/6] Left boundary (bIdx=0) → splitLeft=true, splitCol=0", async () => {
    const r = await probePosition(makeGridEl(COLS, W), COLS, 40, W);
    assertBoundaryDrop(r, 0, 0, true, "2-col left edge");
  });

  it("[2/6] Interior bIdx=1, mouseCol=0 → splitLeft=false, splitCol=0", async () => {
    const r = await probePosition(makeGridEl(COLS, W), COLS, 410, W);
    assertBoundaryDrop(r, 1, 0, false, "2-col interior, mouse in col 0");
  });

  it("[3/6] Interior bIdx=1, mouseCol=1 → splitLeft=true, splitCol=1", async () => {
    const r = await probePosition(makeGridEl(COLS, W), COLS, 490, W);
    assertBoundaryDrop(r, 1, 1, true, "2-col interior, mouse in col 1");
  });

  it("[4/6] Right boundary (bIdx=2) → splitLeft=false, splitCol=1", async () => {
    const r = await probePosition(makeGridEl(COLS, W), COLS, W - 40, W);
    assertBoundaryDrop(r, 2, 1, false, "2-col right edge");
  });

  it("[5/6] Cell center col 0 → col=0, cell-highlight", async () => {
    const r = await probePosition(makeGridEl(COLS, W), COLS, 225, W);
    assertCellCenter(r, 0, "2-col center col 0");
  });

  it("[6/6] Cell center col 1 → col=1, cell-highlight", async () => {
    const r = await probePosition(makeGridEl(COLS, W), COLS, 675, W);
    assertCellCenter(r, 1, "2-col center col 1");
  });
});

// ─── 3-CELL GRID (9 drop zones) ──────────────────────────────────────────

describe("3-cell grid — 9 drop zones", () => {
  const COLS = 3;
  const W = 900;

  beforeEach(() => {
    document.body.innerHTML = "";
  });

  // Boundaries
  it("[1/9] Left boundary (bIdx=0) → splitLeft=true, splitCol=0", async () => {
    const r = await probePosition(makeGridEl(COLS, W), COLS, 20, W);
    assertBoundaryDrop(r, 0, 0, true, "3-col left edge");
  });

  it("[2/9] Interior bIdx=1, mouseCol=0 → splitLeft=false, splitCol=0", async () => {
    const r = await probePosition(makeGridEl(COLS, W), COLS, 280, W);
    assertBoundaryDrop(r, 1, 0, false, "3-col divider 1, mouse in col 0");
  });

  it("[3/9] Interior bIdx=1, mouseCol=1 → splitLeft=true, splitCol=1", async () => {
    const r = await probePosition(makeGridEl(COLS, W), COLS, 320, W);
    assertBoundaryDrop(r, 1, 1, true, "3-col divider 1, mouse in col 1");
  });

  it("[4/9] Interior bIdx=2, mouseCol=1 → splitLeft=false, splitCol=1", async () => {
    const r = await probePosition(makeGridEl(COLS, W), COLS, 580, W);
    assertBoundaryDrop(r, 2, 1, false, "3-col divider 2, mouse in col 1");
  });

  it("[5/9] Interior bIdx=2, mouseCol=2 → splitLeft=true, splitCol=2", async () => {
    const r = await probePosition(makeGridEl(COLS, W), COLS, 620, W);
    assertBoundaryDrop(r, 2, 2, true, "3-col divider 2, mouse in col 2");
  });

  it("[6/9] Right boundary (bIdx=3) → splitLeft=false, splitCol=2", async () => {
    const r = await probePosition(makeGridEl(COLS, W), COLS, 880, W);
    assertBoundaryDrop(r, 3, 2, false, "3-col right edge");
  });

  // Cell centers
  it("[7/9] Cell center col 0 → col=0, cell-highlight", async () => {
    const r = await probePosition(makeGridEl(COLS, W), COLS, 150, W);
    assertCellCenter(r, 0, "3-col center col 0");
  });

  it("[8/9] Cell center col 1 → col=1, cell-highlight", async () => {
    const r = await probePosition(makeGridEl(COLS, W), COLS, 450, W);
    assertCellCenter(r, 1, "3-col center col 1");
  });

  it("[9/9] Cell center col 2 → col=2, cell-highlight", async () => {
    const r = await probePosition(makeGridEl(COLS, W), COLS, 750, W);
    assertCellCenter(r, 2, "3-col center col 2");
  });
});
