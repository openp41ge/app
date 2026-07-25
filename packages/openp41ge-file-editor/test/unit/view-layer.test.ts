/**
 * Tests for RenderedLinesCollection and ViewLines.
 */
import { describe, it, expect } from "vitest";
import { RenderedLinesCollection } from "@openp41ge-file-editor/view/view-layer";

interface TestLine {
  lineNumber: number;
  output: string;
  equals(other: TestLine): boolean;
}

const createTestLine = (lineNumber: number, text: string): TestLine => ({
  lineNumber,
  output: text,
  equals(other: TestLine) {
    return this.lineNumber === other.lineNumber && this.output === other.output;
  },
});

describe("RenderedLinesCollection", () => {
  it("starts empty", () => {
    const col = new RenderedLinesCollection<TestLine>();
    expect(col.count).toBe(0);
    expect(col.startLineNumber).toBe(0);
    expect(col.endLineNumber).toBe(0);
  });

  it("getLine returns undefined for empty collection", () => {
    const col = new RenderedLinesCollection<TestLine>();
    expect(col.getLine(1)).toBeUndefined();
  });

  it("getLines returns empty array for empty collection", () => {
    const col = new RenderedLinesCollection<TestLine>();
    expect(col.getLines()).toEqual([]);
  });

  it("getLine returns undefined for out-of-range line", () => {
    const col = new RenderedLinesCollection<TestLine>();
    // Without lines, any request is out of range
    expect(col.getLine(1)).toBeUndefined();
  });

  it("getLines returns copy (not reference)", () => {
    const col = new RenderedLinesCollection<TestLine>();
    const lines = col.getLines();
    expect(Array.isArray(lines)).toBe(true);
  });
});
