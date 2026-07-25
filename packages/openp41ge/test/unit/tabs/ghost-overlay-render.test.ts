/**
 * Ghost overlay DOM rendering tests.
 *
 * Verifies the actual DOM output of GhostManager.showGhost() for every
 * drop-zone scenario. Unlike the integration tests which verify the logic
 * (computeDropTarget, onHover ghostConfig), these tests verify the rendered
 * visual: how many column divs exist, which one is highlighted, and what
 * styles are applied.
 */

import { describe, test, expect, beforeEach } from "vitest";
import { ghostManager } from "@openp41ge/renderer/services/drag/ghost-manager";

// ─── Helpers ──────────────────────────────────────────────────────────────

function makeGridEl(cols: number): HTMLElement {
  const el = document.createElement("div");
  el.style.position = "relative";
  el.style.width = "900px";
  el.style.height = "600px";

  for (let i = 0; i < cols; i++) {
    const cell = document.createElement("div");
    cell.classList.add("openp41ge-grid-cell");
    cell.style.flex = "1";
    el.appendChild(cell);
  }
  return el;
}

function overlayChildren(gridEl: HTMLElement): HTMLElement[] {
  const overlay = gridEl.querySelector(".openp41ge-ghost-overlay");
  if (!overlay) return [];
  return Array.from(overlay.children) as HTMLElement[];
}

interface OverlayChildInfo {
  index: number;
  flex: string;
  background: string;
  boxShadow: string;
}

function describeChildren(gridEl: HTMLElement): OverlayChildInfo[] {
  return overlayChildren(gridEl).map((child, i) => ({
    index: i,
    flex: child.style.flex,
    background: child.style.background,
    boxShadow: child.style.boxShadow,
  }));
}

// CSS serialization adds spaces after commas; match by alpha value.
const HIGHLIGHT_ALPHA = "0.12";
const SPLIT_PAIR_ALPHA = "0.06";
const NORMAL_ALPHA = "0.04";
const CELL_HIGHLIGHT_ALPHA = "0.06";

/**
 * Check that a specific column div has the "highlighted" styles
 * (the one the tab/file will land in — bright blue with thick border).
 */
function expectHighlighted(col: HTMLElement, label: string): void {
  expect(col.style.background, `${label} bg`).toContain(HIGHLIGHT_ALPHA);
  expect(col.style.boxShadow, `${label} shadow`).toContain("inset 0 0 0 2px");
}

/**
 * Check that a column div has the "split-pair" subtle style
 * (the other half of the split cell, not where the tab goes).
 */
function expectSplitPair(col: HTMLElement, label: string): void {
  expect(col.style.background, `${label} bg`).toContain(SPLIT_PAIR_ALPHA);
  expect(col.style.boxShadow, `${label} shadow`).toBe("");
}

/**
 * Check that a column div has the "normal" subtle background
 * (non-target columns).
 */
function expectNormal(col: HTMLElement, label: string): void {
  expect(col.style.background, `${label} bg`).toContain(NORMAL_ALPHA);
  expect(col.style.boxShadow, `${label} shadow`).toBe("");
}

/**
 * Check that a column div has the "cell-center highlight" style
 * (subtle blue with thin border).
 */
function expectCellHighlight(col: HTMLElement, label: string): void {
  expect(col.style.background, `${label} bg`).toContain(CELL_HIGHLIGHT_ALPHA);
  expect(col.style.boxShadow, `${label} shadow`).toContain("inset 0 0 0 1px");
}

// ─── 1-CELL GRID GHOST OVERLAYS ─────────────────────────────────────────

describe("Ghost overlay — 1-cell grid", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  test("Cell-center highlight -> 1 column, highlighted with border", () => {
    const gridEl = makeGridEl(1);
    document.body.appendChild(gridEl);

    ghostManager.showGhost(gridEl, { cols: 1, activeCol: 0 });

    const children = overlayChildren(gridEl);
    expect(children).toHaveLength(1);
    expectCellHighlight(children[0], "1-col center");
    expect(children[0].style.flex).toContain("1");

    ghostManager.hideGhost(gridEl);
  });

  test("Left boundary split (bIdx=0, col=0, splitLeft=true) -> 2 columns, left highlight", () => {
    const gridEl = makeGridEl(1);
    document.body.appendChild(gridEl);

    ghostManager.showGhost(gridEl, {
      cols: 1,
      boundaryIndex: 0,
      splitCol: 0,
      splitHighlightCol: 0,
      columnFlex: [1],
    });

    const children = overlayChildren(gridEl);
    expect(children).toHaveLength(2);
    const info = describeChildren(gridEl);

    expectHighlighted(children[0], "col 0 (new tab left)");
    expect(parseFloat(info[0].flex)).toBeCloseTo(0.5, 3);

    expectSplitPair(children[1], "col 1 (original right)");
    expect(parseFloat(info[1].flex)).toBeCloseTo(0.5, 3);

    ghostManager.hideGhost(gridEl);
  });

  test("Right boundary split (bIdx=1, col=0, splitLeft=false) -> 2 columns, right highlight", () => {
    const gridEl = makeGridEl(1);
    document.body.appendChild(gridEl);

    ghostManager.showGhost(gridEl, {
      cols: 1,
      boundaryIndex: 1,
      splitCol: 0,
      splitHighlightCol: undefined,
      columnFlex: [1],
    });

    const children = overlayChildren(gridEl);
    expect(children).toHaveLength(2);

    expectSplitPair(children[0], "col 0 (original left)");
    expectHighlighted(children[1], "col 1 (new tab right)");

    ghostManager.hideGhost(gridEl);
  });
});

// ─── 2-CELL GRID GHOST OVERLAYS ─────────────────────────────────────────

describe("Ghost overlay — 2-cell grid", () => {
  const colFlex = [0.5, 0.5];

  beforeEach(() => {
    document.body.innerHTML = "";
  });

  test("Cell-center col 0 -> 2 columns, col 0 highlighted with border", () => {
    const gridEl = makeGridEl(2);
    document.body.appendChild(gridEl);

    ghostManager.showGhost(gridEl, { cols: 2, activeCol: 0 });

    const children = overlayChildren(gridEl);
    expect(children).toHaveLength(2);
    expectCellHighlight(children[0], "col 0");
    expectNormal(children[1], "col 1");

    ghostManager.hideGhost(gridEl);
  });

  test("Cell-center col 1 -> 2 columns, col 1 highlighted with border", () => {
    const gridEl = makeGridEl(2);
    document.body.appendChild(gridEl);

    ghostManager.showGhost(gridEl, { cols: 2, activeCol: 1 });

    const children = overlayChildren(gridEl);
    expect(children).toHaveLength(2);
    expectNormal(children[0], "col 0");
    expectCellHighlight(children[1], "col 1");

    ghostManager.hideGhost(gridEl);
  });

  test("Left boundary (bIdx=0, splitCol=0, splitLeft=true) -> 3 cols, col 0 highlighted, col 1 split-pair", () => {
    const gridEl = makeGridEl(2);
    document.body.appendChild(gridEl);

    ghostManager.showGhost(gridEl, {
      cols: 2,
      boundaryIndex: 0,
      splitCol: 0,
      splitHighlightCol: 0,
      columnFlex: colFlex,
    });

    const children = overlayChildren(gridEl);
    expect(children).toHaveLength(3);
    // [new tab][cell0-right-half][cell1]
    expectHighlighted(children[0], "col 0 (new tab left)");
    expectSplitPair(children[1], "col 1 (cell0-right-half)");
    expectNormal(children[2], "col 2 (cell1)");

    ghostManager.hideGhost(gridEl);
  });

  test("Interior boundary, mouse in col 0 (bIdx=1, splitCol=0, splitLeft=false) -> 3 cols, col 1 highlighted", () => {
    const gridEl = makeGridEl(2);
    document.body.appendChild(gridEl);

    ghostManager.showGhost(gridEl, {
      cols: 2,
      boundaryIndex: 1,
      splitCol: 0,
      splitHighlightCol: undefined,
      columnFlex: colFlex,
    });

    const children = overlayChildren(gridEl);
    expect(children).toHaveLength(3);
    // [cell0-left-half][new tab][cell1]
    expectSplitPair(children[0], "col 0 (cell0-left-half)");
    expectHighlighted(children[1], "col 1 (new tab)");
    expectNormal(children[2], "col 2 (cell1)");

    ghostManager.hideGhost(gridEl);
  });

  test("Interior boundary, mouse in col 1 (bIdx=1, splitCol=1, splitLeft=true) -> 3 cols, col 1 highlighted, col 2 split-pair", () => {
    const gridEl = makeGridEl(2);
    document.body.appendChild(gridEl);

    ghostManager.showGhost(gridEl, {
      cols: 2,
      boundaryIndex: 1,
      splitCol: 1,
      splitHighlightCol: 1,
      columnFlex: colFlex,
    });

    const children = overlayChildren(gridEl);
    expect(children).toHaveLength(3);
    // [cell0][new tab][cell1-right-half]
    expectNormal(children[0], "col 0 (cell0)");
    expectHighlighted(children[1], "col 1 (new tab)");
    expectSplitPair(children[2], "col 2 (cell1-right-half)");

    ghostManager.hideGhost(gridEl);
  });

  test("Right boundary (bIdx=2, splitCol=1, splitLeft=false) -> 3 cols, col 2 highlighted", () => {
    const gridEl = makeGridEl(2);
    document.body.appendChild(gridEl);

    ghostManager.showGhost(gridEl, {
      cols: 2,
      boundaryIndex: 2,
      splitCol: 1,
      splitHighlightCol: undefined,
      columnFlex: colFlex,
    });

    const children = overlayChildren(gridEl);
    expect(children).toHaveLength(3);
    // [cell0][cell1-left-half][new tab]
    expectNormal(children[0], "col 0 (cell0)");
    expectSplitPair(children[1], "col 1 (cell1-left-half)");
    expectHighlighted(children[2], "col 2 (new tab)");

    ghostManager.hideGhost(gridEl);
  });
});

// ─── 3-CELL GRID GHOST OVERLAYS ─────────────────────────────────────────

describe("Ghost overlay — 3-cell grid (spot checks)", () => {
  const colFlex = [1 / 3, 1 / 3, 1 / 3];

  beforeEach(() => {
    document.body.innerHTML = "";
  });

  test("Cell-center col 1 -> 3 columns, col 1 highlighted with border", () => {
    const gridEl = makeGridEl(3);
    document.body.appendChild(gridEl);

    ghostManager.showGhost(gridEl, { cols: 3, activeCol: 1 });

    const children = overlayChildren(gridEl);
    expect(children).toHaveLength(3);
    expectNormal(children[0], "col 0");
    expectCellHighlight(children[1], "col 1");
    expectNormal(children[2], "col 2");

    ghostManager.hideGhost(gridEl);
  });

  test("Left boundary (bIdx=0, splitCol=0, splitLeft=true) -> 4 cols, col 0 highlighted", () => {
    const gridEl = makeGridEl(3);
    document.body.appendChild(gridEl);

    ghostManager.showGhost(gridEl, {
      cols: 3,
      boundaryIndex: 0,
      splitCol: 0,
      splitHighlightCol: 0,
      columnFlex: colFlex,
    });

    const children = overlayChildren(gridEl);
    expect(children).toHaveLength(4);
    expectHighlighted(children[0], "col 0 (new tab)");
    expectSplitPair(children[1], "col 1 (cell0-right-half)");
    expectNormal(children[2], "col 2 (cell1)");
    expectNormal(children[3], "col 3 (cell2)");

    ghostManager.hideGhost(gridEl);
  });

  test("Interior bIdx=1, mouse in col 1 (splitCol=1, splitLeft=true) -> 4 cols, col 1 highlighted", () => {
    const gridEl = makeGridEl(3);
    document.body.appendChild(gridEl);

    ghostManager.showGhost(gridEl, {
      cols: 3,
      boundaryIndex: 1,
      splitCol: 1,
      splitHighlightCol: 1,
      columnFlex: colFlex,
    });

    const children = overlayChildren(gridEl);
    expect(children).toHaveLength(4);
    expectNormal(children[0], "col 0");
    expectHighlighted(children[1], "col 1 (new tab)");
    expectSplitPair(children[2], "col 2 (cell1-right-half)");
    expectNormal(children[3], "col 3 (cell2)");

    ghostManager.hideGhost(gridEl);
  });

  test("Right boundary (bIdx=3, splitCol=2, splitLeft=false) -> 4 cols, col 3 highlighted", () => {
    const gridEl = makeGridEl(3);
    document.body.appendChild(gridEl);

    ghostManager.showGhost(gridEl, {
      cols: 3,
      boundaryIndex: 3,
      splitCol: 2,
      splitHighlightCol: undefined,
      columnFlex: colFlex,
    });

    const children = overlayChildren(gridEl);
    expect(children).toHaveLength(4);
    expectNormal(children[0], "col 0");
    expectNormal(children[1], "col 1");
    expectSplitPair(children[2], "col 2 (cell2-left-half)");
    expectHighlighted(children[3], "col 3 (new tab)");

    ghostManager.hideGhost(gridEl);
  });
});
