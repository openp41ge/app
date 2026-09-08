/**
 * Unit tests for the pure full-text content matching util.
 */
import { describe, it, expect } from "vitest";
import { findMatchesInText } from "../../../src/main/services/content-search";

describe("findMatchesInText", () => {
  it("matches a literal query case-insensitively by default", () => {
    const text = "Alpha\nbeta\nALPHA";
    const matches = findMatchesInText(text, "alpha");
    expect(matches).toHaveLength(2);
    expect(matches[0]).toMatchObject({ lineNumber: 1, column: 1, lineText: "Alpha" });
    expect(matches[1]).toMatchObject({ lineNumber: 3, column: 1, lineText: "ALPHA" });
  });

  it("honours the case-sensitive option", () => {
    const text = "alpha\nAlpha";
    const matches = findMatchesInText(text, "Alpha", { caseSensitive: true });
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({ lineNumber: 2, column: 1 });
  });

  it("returns every match instance on a line with correct column and end index", () => {
    const text = "abc abc abc";
    const matches = findMatchesInText(text, "abc");
    expect(matches).toHaveLength(3);
    expect(matches[0]).toMatchObject({ column: 1, startIndex: 0, endIndex: 3 });
    expect(matches[1]).toMatchObject({ column: 5, startIndex: 4, endIndex: 7 });
    expect(matches[2]).toMatchObject({ column: 9, startIndex: 8, endIndex: 11 });
  });

  it("computes line numbers across several lines", () => {
    const text = "zero\none\nmatch here\ntwo";
    const matches = findMatchesInText(text, "match");
    expect(matches).toHaveLength(1);
    expect(matches[0].lineNumber).toBe(3);
    expect(matches[0].column).toBe(1);
    expect(matches[0].lineText).toBe("match here");
  });

  it("supports regex queries", () => {
    const text = "foo123\nbar456\nfoo789";
    const matches = findMatchesInText(text, "foo\\d+", { regex: true });
    expect(matches).toHaveLength(2);
    expect(matches[0].lineText).toBe("foo123");
  });

  it("returns [] for an invalid regex instead of throwing", () => {
    expect(findMatchesInText("content", "(", { regex: true })).toEqual([]);
  });

  it("returns [] for an empty query", () => {
    expect(findMatchesInText("content", "")).toEqual([]);
  });

  it("skips zero-length regex matches without looping forever", () => {
    const matches = findMatchesInText("aaa", "a*", { regex: true });
    // a* matches 'aaa' once at index 0 (length 3), then zero-length at each
    // position is skipped; the only non-empty match is the whole run.
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({ column: 1, startIndex: 0, endIndex: 3 });
  });

  it("treats a literal query with regex metacharacters literally", () => {
    const text = "a.b\naxb";
    const matches = findMatchesInText(text, "a.b");
    expect(matches).toHaveLength(1);
    expect(matches[0].lineText).toBe("a.b");
  });
});
