// @ts-nocheck
/**
 * Tests for indentation-based fold-region detection (`fe-fold.ts`).
 */
import { describe, test, expect } from "vitest";
import { computeFoldRegions } from "../../../src/components/file-editor/fe-fold";

/** Build a provider from an array of lines (indent measured in leading spaces). */
function providerOf(lines: string[]) {
  return {
    lineCount: lines.length,
    indentOf(line: number) {
      const s = lines[line - 1] ?? "";
      const m = /^[ \t]*/.exec(s);
      if (!m || !m[0]) return 0;
      // count leading tabs as 4 (matches the editor's tabSize default).
      let cols = 0;
      for (const ch of m[0]) cols += ch === "\t" ? 4 : 1;
      return cols;
    },
    isBlank(line: number) {
      return /^\s*$/.test(lines[line - 1] ?? "");
    },
  };
}

describe("computeFoldRegions", () => {
  test("no regions for flat, unindented content", () => {
    expect(computeFoldRegions(providerOf(["a", "b", "c"]))).toEqual([]);
  });

  test("a single nested block yields one region", () => {
    const regions = computeFoldRegions(providerOf(["const x = {", "  a: 1,", "  b: 2", "};"]));
    expect(regions).toEqual([{ startLine: 1, endLine: 3 }]);
  });

  test("nested blocks produce nested (smaller) regions after the header", () => {
    const regions = computeFoldRegions(providerOf(["a", "  b", "    c", "  d", "e"]));
    // Outer block [1,4] and inner block [2,3].
    expect(regions).toEqual([
      { startLine: 1, endLine: 4 },
      { startLine: 2, endLine: 3 },
    ]);
  });

  test("siblings under one parent are separate regions", () => {
    const regions = computeFoldRegions(providerOf(["a", "  b", "    c", "  d", "    e"]));
    // `a` folds its whole body [1,5]; `b`'s child block folds [2,3]; `d`'s
    // child block folds [4,5] — the two inner blocks are separate regions.
    expect(regions).toEqual([
      { startLine: 1, endLine: 5 },
      { startLine: 2, endLine: 3 },
      { startLine: 4, endLine: 5 },
    ]);
  });

  test("blank lines are ignored for the header/child decision", () => {
    const regions = computeFoldRegions(providerOf(["a", "  b", "", "  c", "d"]));
    expect(regions).toEqual([{ startLine: 1, endLine: 4 }]);
  });

  test("a block is closed by the next line at the header's indent", () => {
    const regions = computeFoldRegions(
      providerOf(["function f() {", "  if (x) {", "    return 1;", "  }", "  return 2;", "}"]),
    );
    // function header folds [2,5] (the whole body); the inner if folds [3,3].
    expect(regions).toEqual([
      { startLine: 1, endLine: 5 },
      { startLine: 2, endLine: 3 },
    ]);
  });

  test("tabs count as indent", () => {
    const regions = computeFoldRegions(providerOf(["a", "\tb", "\tc"]));
    expect(regions).toEqual([{ startLine: 1, endLine: 3 }]);
  });

  test("no region when the next non-blank line is not deeper", () => {
    expect(computeFoldRegions(providerOf(["a", "b", "  c", "d"]))).toEqual([
      { startLine: 2, endLine: 3 },
    ]);
  });

  test("empty buffer yields no regions", () => {
    expect(computeFoldRegions(providerOf([]))).toEqual([]);
  });
});
