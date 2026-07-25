/**
 * Tests for bracket matching.
 */
import { describe, it, expect } from "vitest";
import { PieceTreeTextContentModel } from "@openp41ge-file-editor/model/piece-tree-text-content-model";
import { findMatchingBracket } from "@openp41ge-file-editor/rendering/bracket-matching";

function model(text: string) {
  return new PieceTreeTextContentModel("test", text);
}

describe("findMatchingBracket", () => {
  it("finds matching close paren", () => {
    const m = model("hello (world)");
    const r = findMatchingBracket(m, { lineNumber: 1, column: 7 });
    expect(r).not.toBeNull();
    expect(r!.open).toEqual({ lineNumber: 1, column: 7 });
    expect(r!.close).toEqual({ lineNumber: 1, column: 13 });
  });

  it("finds matching open paren from close", () => {
    const m = model("hello (world)");
    const r = findMatchingBracket(m, { lineNumber: 1, column: 13 });
    expect(r).not.toBeNull();
    expect(r!.open).toEqual({ lineNumber: 1, column: 7 });
    expect(r!.close).toEqual({ lineNumber: 1, column: 13 });
  });

  it("finds matching close bracket when cursor before char", () => {
    const m = model("hello [world]");
    const r = findMatchingBracket(m, { lineNumber: 1, column: 8 });
    expect(r).not.toBeNull();
    expect(r!.open).toEqual({ lineNumber: 1, column: 7 });
  });

  it("returns null for unmatched bracket", () => {
    const m = model("hello (world");
    const r = findMatchingBracket(m, { lineNumber: 1, column: 7 });
    expect(r).toBeNull();
  });

  it("handles nested brackets", () => {
    const m = model("a(b(c)d)e");
    // a(1) ((2) b(3) ((4) c(5) )(6) d(7) )(8) e(9)
    // Outer ( at col 3 matches ) at col 8
    const r1 = findMatchingBracket(m, { lineNumber: 1, column: 3 });
    expect(r1).not.toBeNull();
    expect(r1!.close).toEqual({ lineNumber: 1, column: 8 });
    // Inner ( at col 5 matches ) at col 6
    const r2 = findMatchingBracket(m, { lineNumber: 1, column: 5 });
    expect(r2).not.toBeNull();
    expect(r2!.close).toEqual({ lineNumber: 1, column: 6 });
  });

  it("finds matching bracket across lines", () => {
    const m = model("if (a\n    && b) {");
    const r = findMatchingBracket(m, { lineNumber: 1, column: 5 });
    expect(r).not.toBeNull();
    expect(r!.close).toEqual({ lineNumber: 2, column: 9 });
  });

  it("returns null for non-bracket position", () => {
    const m = model("hello world");
    const r = findMatchingBracket(m, { lineNumber: 1, column: 2 });
    expect(r).toBeNull();
  });

  it("handles curly braces", () => {
    const m = model("function foo() { return 1; }");
    const r = findMatchingBracket(m, { lineNumber: 1, column: 16 });
    expect(r).not.toBeNull();
    expect(r!.open).toEqual({ lineNumber: 1, column: 16 });
    expect(r!.close.column).toBeGreaterThan(r!.open.column);
  });

  it("handles square brackets", () => {
    const m = model("const arr = [1, 2, 3];");
    const r = findMatchingBracket(m, { lineNumber: 1, column: 13 });
    expect(r).not.toBeNull();
    expect(r!.open).toEqual({ lineNumber: 1, column: 13 });
    expect(r!.close).toEqual({ lineNumber: 1, column: 21 });
  });
});
