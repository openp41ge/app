/**
 * Full pipeline integration test.
 *
 * Tests the complete flow from cursor position → boundary detection →
 * drop zone → ghost layout → ghost overlay DOM, all using production
 * code paths. This catches integration bugs between layers.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { ghostManager } from "@openp41ge/renderer/services/drag/ghost-manager";
import { computeDropTarget } from "@openp41ge/renderer/services/boundary/detection";
import { computeGhostLayout } from "@openp41ge/renderer/services/drag/ghost-layout";

// ─── Helpers ──────────────────────────────────────────────────────────────

/**
 * Create a mock grid element suitable for computeDropTarget and ghost overlay.
 * Uses a plain div (not <openp41ge-grid>) to avoid jsdom custom element issues.
 */
function makeGridEl(cols: number, totalWidth = 900): HTMLElement {
  const el = document.createElement("div") as any;
  el.style.display = "flex";
  el.style.flexDirection = "row";
  el.style.position = "relative";
  el.style.width = totalWidth + "px";
  el.style.height = "600px";

  // Match the real grid's column ratio calculation
  const colWidth = 1 / cols;
  for (let i = 0; i < cols; i++) {
    const cell = document.createElement("div");
    cell.classList.add("openp41ge-grid-cell");
    cell.style.flex = String(colWidth);
    el.appendChild(cell);
  }

  el.getBoundingClientRect = () =>
    ({
      left: 0,
      top: 0,
      width: totalWidth,
      height: 600,
      right: totalWidth,
      bottom: 600,
    }) as DOMRect;

  el.querySelectorAll = (sel: string) =>
    sel === ".openp41ge-grid-cell" ? Array.from(el.children) : [];
  return el as HTMLElement;
}

/**
 * Simulate the orchestrator's _applyFeedback:
 * given a cursor position and a grid element, update the ghost overlay.
 * Returns a description string of the overlay columns.
 */
function applyGhostForPosition(
  gridEl: HTMLElement,
  cols: number,
  width: number,
  clientX: number,
): string {
  // Step 1: Compute drop target from cursor position
  const pos = computeDropTarget(gridEl, clientX, width, cols);

  // Step 2: Derive ghostConfig (same logic as GridDropTarget.onHover)
  if (!pos.isBoundary) {
    // Cell-center drop
    ghostManager.showGhost(gridEl, {
      cols,
      activeCol: pos.col,
    });
    return describeOverlay(gridEl);
  }

  const mouseCol = pos.col;
  const splitLeft =
    pos.boundaryIndex === 0
      ? true
      : pos.boundaryIndex >= cols
        ? false
        : mouseCol >= pos.boundaryIndex;
  const splitCol = pos.boundaryIndex === 0 ? 0 : pos.boundaryIndex >= cols ? cols - 1 : mouseCol;

  // Step 3: Render ghost overlay (same logic as orchestrator._applyFeedback)
  ghostManager.showGhost(gridEl, {
    cols,
    boundaryIndex: pos.boundaryIndex,
    splitCol,
    splitLeft,
    splitHighlightCol: splitLeft ? splitCol : undefined,
    columnFlex: ghostManager.flexCache.get(gridEl, cols),
  } as any);

  return describeOverlay(gridEl);
}

function overlayColumns(gridEl: HTMLElement): HTMLElement[] {
  const overlay = gridEl.querySelector(".openp41ge-ghost-overlay");
  if (!overlay) return [];
  return Array.from(overlay.children) as HTMLElement[];
}

function describeOverlay(gridEl: HTMLElement): string {
  return overlayColumns(gridEl)
    .map((c, i) => {
      const bg = c.style.background;
      const shadow = c.style.boxShadow;
      const flex = parseFloat(c.style.flex).toFixed(3);
      let label = `flex=${flex}`;
      if (bg.includes("0.12")) label += " ★HIGHLIGHTED";
      else if (bg.includes("0.06") && shadow.includes("inset")) label += " ▲ACTIVE";
      else if (bg.includes("0.06")) label += " ○SPLIT-PAIR";
      else if (bg.includes("0.04")) label += " ·normal";
      return `[${i}:${label}]`;
    })
    .join(" ");
}

function overlayCellAt(gridEl: HTMLElement, index: number): HTMLElement {
  return overlayColumns(gridEl)[index];
}

function expectHighlighted(gridEl: HTMLElement, index: number): void {
  const col = overlayCellAt(gridEl, index);
  expect(col.style.background).toContain("0.12");
}

function expectSplitPair(gridEl: HTMLElement, index: number): void {
  const col = overlayCellAt(gridEl, index);
  expect(col.style.background).toContain("0.06");
  expect(col.style.boxShadow).toBe("");
}

function expectNormal(gridEl: HTMLElement, index: number): void {
  const col = overlayCellAt(gridEl, index);
  expect(col.style.background).toContain("0.04");
  expect(col.style.boxShadow).toBe("");
}

function expectActive(gridEl: HTMLElement, index: number): void {
  const col = overlayCellAt(gridEl, index);
  expect(col.style.background).toContain("0.06");
  expect(col.style.boxShadow).toContain("inset 0 0 0 1px");
}

// ─── 2-CELL GRID ──────────────────────────────────────────────────────────

describe("2-cell grid full pipeline", () => {
  const COLS = 2;
  const W = 900;

  beforeEach(() => {
    document.body.innerHTML = "";
    ghostManager.dispose();
  });

  it("probes all positions around each boundary", () => {
    const gridEl = makeGridEl(COLS, W);
    document.body.appendChild(gridEl);

    console.log("Ghost overlay at positions around boundaries:");
    // Left boundary zone: 0-135px (15% of total width = 900*0.15)
    // Divider zone: 315-585px (center ± 900*0.15)
    // Right boundary zone: 765-900px
    for (const x of [
      10, 50, 100, 150, 200, 300, 400, 430, 450, 470, 500, 550, 600, 700, 800, 850, 890,
    ]) {
      const overlay = applyGhostForPosition(gridEl, COLS, W, x);
      console.log(`  x=${x.toString().padStart(3)}: ${overlay}`);
    }

    ghostManager.hideGhost(gridEl);
  });

  // ── Cell 1 (col 0) scenarios ──────────────────────────────────

  it("cell 1: far left (x=10) → splitLeft=true, new tab on far LEFT", () => {
    const gridEl = makeGridEl(COLS, W);
    document.body.appendChild(gridEl);
    applyGhostForPosition(gridEl, COLS, W, 10);

    const cols = overlayColumns(gridEl);
    expect(cols).toHaveLength(3);
    // [new tab ★] [col0-right-half ○] [col1 ·]
    expectHighlighted(gridEl, 0);
    expectSplitPair(gridEl, 1);
    expectNormal(gridEl, 2);

    ghostManager.hideGhost(gridEl);
  });

  it("cell 1 left-middle (x=100) → still boundary zone, splitLeft=true", () => {
    const gridEl = makeGridEl(COLS, W);
    document.body.appendChild(gridEl);
    applyGhostForPosition(gridEl, COLS, W, 100);

    const cols = overlayColumns(gridEl);
    expect(cols).toHaveLength(3);
    expectHighlighted(gridEl, 0);
    expectSplitPair(gridEl, 1);
    expectNormal(gridEl, 2);

    ghostManager.hideGhost(gridEl);
  });

  it("cell 1 center (x=200) → cell-center, col 0 active", () => {
    const gridEl = makeGridEl(COLS, W);
    document.body.appendChild(gridEl);
    applyGhostForPosition(gridEl, COLS, W, 200);

    const cols = overlayColumns(gridEl);
    expect(cols).toHaveLength(2);
    expectActive(gridEl, 0);
    expectNormal(gridEl, 1);

    ghostManager.hideGhost(gridEl);
  });

  it("cell 1 right side (x=430) → splitLeft=false, new tab between cells", () => {
    const gridEl = makeGridEl(COLS, W);
    document.body.appendChild(gridEl);
    applyGhostForPosition(gridEl, COLS, W, 430);

    const cols = overlayColumns(gridEl);
    expect(cols).toHaveLength(3);
    // [col0-left-half ○] [new tab ★] [col1 ·]
    expectSplitPair(gridEl, 0);
    expectHighlighted(gridEl, 1);
    expectNormal(gridEl, 2);

    ghostManager.hideGhost(gridEl);
  });

  // ── Cell 2 (col 1) scenarios ──────────────────────────────────

  it("cell 2 left side (x=470) → splitLeft=true, new tab on LEFT of col 1", () => {
    const gridEl = makeGridEl(COLS, W);
    document.body.appendChild(gridEl);
    applyGhostForPosition(gridEl, COLS, W, 470);

    const cols = overlayColumns(gridEl);
    expect(cols).toHaveLength(3);
    // [col0 ·] [new tab ★] [col1-right-half ○]
    expectNormal(gridEl, 0);
    expectHighlighted(gridEl, 1);
    expectSplitPair(gridEl, 2);

    ghostManager.hideGhost(gridEl);
  });

  it("cell 2 center (x=650) → cell-center, col 1 active", () => {
    const gridEl = makeGridEl(COLS, W);
    document.body.appendChild(gridEl);
    applyGhostForPosition(gridEl, COLS, W, 650);

    const cols = overlayColumns(gridEl);
    expect(cols).toHaveLength(2);
    expectNormal(gridEl, 0);
    expectActive(gridEl, 1);

    ghostManager.hideGhost(gridEl);
  });

  it("cell 2 right side (x=850) → splitLeft=false, new tab on far RIGHT", () => {
    const gridEl = makeGridEl(COLS, W);
    document.body.appendChild(gridEl);
    applyGhostForPosition(gridEl, COLS, W, 850);

    const cols = overlayColumns(gridEl);
    expect(cols).toHaveLength(3);
    // [col0 ·] [col1-left-half ○] [new tab ★]
    expectNormal(gridEl, 0);
    expectSplitPair(gridEl, 1);
    expectHighlighted(gridEl, 2);

    ghostManager.hideGhost(gridEl);
  });
});
