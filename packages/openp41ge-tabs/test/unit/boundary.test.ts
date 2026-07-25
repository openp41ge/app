/**
 * Unit tests for boundary.ts — pure position computation functions.
 */
import { describe, it, expect } from "vitest";
import {
  classifyGridPosition,
  splitCellForBoundary,
  isSameFilePathInCell,
  INSERT_BOUNDARY_THRESHOLD,
} from "openp41ge-tabs/boundary";

// ─── classifyGridPosition ─────────────────────────────────────────────────

describe("classifyGridPosition", () => {
  const defaultDividers = [0.33, 0.67]; // 3 equal columns

  it("classifies position in the first column", () => {
    // Cell 0 width = 0.33, left-edge threshold = min(0.15, 0.33/3) = 0.11
    // Position 0.2 is clearly inside the cell
    const result = classifyGridPosition(0.2, defaultDividers, 3);
    expect(result.col).toBe(0);
    expect(result.isBoundary).toBe(false);
  });

  it("classifies position in the middle column", () => {
    const result = classifyGridPosition(0.5, defaultDividers, 3);
    expect(result.col).toBe(1);
    expect(result.isBoundary).toBe(false);
  });

  it("classifies position in the last column", () => {
    // Cell 2 width = 0.33, right-edge threshold = min(0.15, 0.33/3) = 0.11
    // Position 0.85 is clearly inside the cell
    const result = classifyGridPosition(0.85, defaultDividers, 3);
    expect(result.col).toBe(2);
    expect(result.isBoundary).toBe(false);
  });

  it("detects left-edge boundary", () => {
    const result = classifyGridPosition(0.01, defaultDividers, 3);
    expect(result.isBoundary).toBe(true);
    expect(result.boundaryIndex).toBe(0);
  });

  it("detects right-edge boundary", () => {
    const result = classifyGridPosition(0.99, defaultDividers, 3);
    expect(result.isBoundary).toBe(true);
    expect(result.boundaryIndex).toBe(3);
  });

  it("detects interior divider boundary", () => {
    const result = classifyGridPosition(0.33, defaultDividers, 3);
    expect(result.isBoundary).toBe(true);
    expect(result.boundaryIndex).toBe(1);
  });

  it("returns col 0 for single-column grid", () => {
    const result = classifyGridPosition(0.5, [], 1);
    expect(result.col).toBe(0);
    expect(result.isBoundary).toBe(false);
    expect(result.boundaryIndex).toBe(0);
  });

  it("handles zero cols gracefully", () => {
    const result = classifyGridPosition(0.5, [], 0);
    expect(result.col).toBe(0);
    expect(result.isBoundary).toBe(false);
  });

  it("left-edge threshold is capped at cellWidth/3 for narrow columns", () => {
    // Very narrow first cell (dividers = [0.15, 0.5])
    const narrowDividers = [0.15, 0.5];
    // At position 0.04: distance to left edge is 0.04
    // Cell 0 width = 0.15, so threshold = min(0.15, 0.15/3) = 0.05
    // 0.04 < 0.05 → boundary
    const result = classifyGridPosition(0.04, narrowDividers, 3);
    expect(result.isBoundary).toBe(true);
    expect(result.boundaryIndex).toBe(0);

    // At position 0.06: 0.06 > 0.05 → not a boundary
    const farResult = classifyGridPosition(0.06, narrowDividers, 3);
    expect(farResult.isBoundary).toBe(false);
  });
});

// ─── splitCellForBoundary ─────────────────────────────────────────────────

describe("splitCellForBoundary", () => {
  it("splits left when boundary is at index 0", () => {
    const result = splitCellForBoundary(3, 0, 0);
    expect(result.col).toBe(0);
    expect(result.splitLeft).toBe(true);
  });

  it("splits right when boundary is at last index", () => {
    const result = splitCellForBoundary(3, 3, 2);
    expect(result.col).toBe(2);
    expect(result.splitLeft).toBe(false);
  });

  it("splits left when mouse is right of interior boundary", () => {
    // boundaryIndex=1 (divider between col 0 and col 1), mouseCol=1 → right of boundary
    const result = splitCellForBoundary(3, 1, 1);
    expect(result.col).toBe(1);
    expect(result.splitLeft).toBe(true);
  });

  it("splits right when mouse is left of interior boundary", () => {
    // boundaryIndex=1, mouseCol=0 → left of boundary
    const result = splitCellForBoundary(3, 1, 0);
    expect(result.col).toBe(0);
    expect(result.splitLeft).toBe(false);
  });
});

// ─── isSameFilePathInCell ─────────────────────────────────────────────────

describe("isSameFilePathInCell", () => {
  const ws = {
    tabs: {
      "tab-a": { config: { filePath: "/src/app.ts" } },
      "tab-b": { config: { filePath: "/src/utils.ts" } },
      "tab-c": { config: {} },
      "tab-d": {},
    },
  };

  it("returns true when file path matches a tab in the cell", () => {
    const result = isSameFilePathInCell(ws, "tab-a", ["tab-b", "tab-c"]);
    expect(result).toBe(false);
  });

  it("returns false when no tab in the cell has the same file path", () => {
    const result = isSameFilePathInCell(ws, "tab-a", ["tab-c", "tab-d"]);
    expect(result).toBe(false);
  });

  it("returns true when matching file path exists", () => {
    // Add a tab with matching path to the cell
    const result = isSameFilePathInCell(ws, "tab-a", ["tab-b", "tab-a"]);
    expect(result).toBe(true);
  });

  it("returns false when dragged tab has no file path", () => {
    const result = isSameFilePathInCell(ws, "tab-c", ["tab-a"]);
    expect(result).toBe(false);
  });

  it("returns false when dragged tab config is missing", () => {
    const result = isSameFilePathInCell(ws, "tab-d", ["tab-a"]);
    expect(result).toBe(false);
  });
});
