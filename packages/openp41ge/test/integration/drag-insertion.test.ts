/**
 * Integration tests for drag insertion — verifying that drag coordinates
 * map to correct insertion positions (left/right/bottom of cell, new column).
 *
 * The boundary-detector, computeDropTarget, and GhostPreview are pure functions
 * that compute drop targets from coordinates and grid state. These tests
 * exercise them with real production logic.
 *
 * For DOM-based tests (jsdom), we test the GridDropTarget's onHover/onDrop
 * logic. For pure-logic tests, we test computeDropTarget directly.
 */

import { describe, it, expect } from "vitest";
import {
  computeDropTarget,
  INSERT_BOUNDARY_THRESHOLD,
} from "@openp41ge/renderer/services/boundary/detection";
import { GhostPreview, computeGhostPreview } from "@openp41ge/renderer/services/ghost-preview";
import * as types from "@openp41ge/layout/types";

// ─── Pure logic tests (node environment) ──────────────────────────────────

describe("computeDropTarget (pure logic)", () => {
  /**
   * In the pure logic path (no DOM), computeDropTarget falls back to
   * equal-width dividers since there are no .openp41ge-grid-cell elements.
   */
  describe("Single column grid (no dividers)", () => {
    it("returns col 0 for any position in a 1-column grid", () => {
      // Mock gridEl with no .openp41ge-grid-cell children
      const gridEl = document.createElement("div");
      const result = computeDropTarget(gridEl, 100, 1000, 1);
      expect(result.col).toBe(0);
      expect(result.isBoundary).toBe(false);
      expect(result.boundaryIndex).toBe(0);
    });
  });

  describe("Two-column grid (equal width)", () => {
    it("returns col 0 for positions in the left half", () => {
      const gridEl = document.createElement("div");
      // When no flex values are available, cells default to 1 each → equal widths
      const result = computeDropTarget(gridEl, 200, 1000, 2);
      expect(result.col).toBe(0);
      expect(result.isBoundary).toBe(false);
    });

    it("returns col 0 for positions near the left margin", () => {
      const gridEl = document.createElement("div");
      const result = computeDropTarget(gridEl, 10, 1000, 2);
      expect(result.col).toBe(0);
    });

    it("returns col 1 for positions in the right half", () => {
      const gridEl = document.createElement("div");
      const result = computeDropTarget(gridEl, 800, 1000, 2);
      expect(result.col).toBe(1);
    });
  });

  describe("Boundary detection", () => {
    it("detects boundary near the center divider of a 2-column grid", () => {
      const gridEl = document.createElement("div");
      // Mock .openp41ge-grid-cell flex values for equal width
      const cell1 = document.createElement("div");
      cell1.className = "openp41ge-grid-cell";
      cell1.style.flex = "1";
      const cell2 = document.createElement("div");
      cell2.className = "openp41ge-grid-cell";
      cell2.style.flex = "1";
      gridEl.appendChild(cell1);
      gridEl.appendChild(cell2);

      // Position near the center (500px out of 1000)
      const result = computeDropTarget(gridEl, 485, 1000, 2);
      expect(result.isBoundary).toBe(true);
      expect(result.boundaryIndex).toBe(1); // The single divider (index 1 in 0=left, 1=divider, 2=right)
    });

    it("does NOT detect boundary when far from any edge or divider", () => {
      const gridEl = document.createElement("div");
      const cell1 = document.createElement("div");
      cell1.className = "openp41ge-grid-cell";
      cell1.style.flex = "1";
      const cell2 = document.createElement("div");
      cell2.className = "openp41ge-grid-cell";
      cell2.style.flex = "1";
      gridEl.appendChild(cell1);
      gridEl.appendChild(cell2);

      // Position 250px / 1000px = 0.25 — far from left edge (0), divider (0.5), and right edge (1)
      // All boundaries are >= 0.25 away, which is > 0.15 threshold
      const result = computeDropTarget(gridEl, 250, 1000, 2);
      expect(result.isBoundary).toBe(false);
    });
  });

  describe("Three-column grid (equal width)", () => {
    it("returns col 0 for left third", () => {
      const gridEl = document.createElement("div");
      const result = computeDropTarget(gridEl, 150, 900, 3);
      expect(result.col).toBe(0);
    });

    it("returns col 1 for middle third", () => {
      const gridEl = document.createElement("div");
      const result = computeDropTarget(gridEl, 450, 900, 3);
      expect(result.col).toBe(1);
    });

    it("returns col 2 for right third", () => {
      const gridEl = document.createElement("div");
      const result = computeDropTarget(gridEl, 750, 900, 3);
      expect(result.col).toBe(2);
    });
  });

  describe("INSERT_BOUNDARY_THRESHOLD constant", () => {
    it("has the expected value", () => {
      expect(INSERT_BOUNDARY_THRESHOLD).toBe(0.15);
    });
  });
});

// ─── Ghost preview computation (pure logic) ───────────────────────────────

describe("computeGhostPreview (pure logic)", () => {
  it("computes a ghost preview for a single-col grid", () => {
    const grid = types.createGrid("g1", 1, 1);
    const preview = computeGhostPreview(grid, "t1", {}, 0);

    expect(preview.cols).toBe(1);
    expect(preview.highlightedCol).toBe(0);
  });

  it("computes ghost preview for a multi-col grid adding a column", () => {
    const grid = types.createGrid("g1", 1, 2);
    const t1 = types.createTab("t1", "terminal", "T1");
    const t2 = types.createTab("t2", "markdown", "T2");
    grid.placements = [
      {
        tabIds: ["t1"],
        position: { row: 0, col: 0 },
        span: { rowSpan: 1, colSpan: 1 },
      },
    ];
    const tabMap = { t1, t2 };

    const preview = computeGhostPreview(grid, "t2", tabMap, 1, undefined, true);

    // When addColumn is true, cols increase by 1
    expect(preview.cols).toBe(3);
    expect(preview.highlightedCol).toBe(1);
  });

  it("highlights the correct column when dropping in an occupied cell", () => {
    const grid = types.createGrid("g1", 1, 2);
    const t1 = types.createTab("t1", "terminal", "T1");
    const t2 = types.createTab("t2", "markdown", "T2");
    grid.placements = [
      {
        tabIds: ["t1"],
        position: { row: 0, col: 0 },
        span: { rowSpan: 1, colSpan: 1 },
      },
    ];
    const tabMap = { t1, t2 };

    const preview = computeGhostPreview(grid, "t2", tabMap, 0);
    expect(preview.cols).toBe(2);
    expect(preview.highlightedCol).toBe(0);
  });
});
