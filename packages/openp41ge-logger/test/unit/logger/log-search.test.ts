/**
 * Unit tests for log-search.ts — the pure `findMatchRanges` helper backing the
 * log viewer's find bar. Tests plain substring, case sensitivity, regex,
 * whole-word, empty/invalid input, no-match, and the match cap.
 */
import { describe, it, expect } from "vitest";
import { findMatchRanges, MAX_MATCHES_PER_STRING } from "@openp41ge-logger/log-search";

describe("findMatchRanges", () => {
  it("finds a plain substring (case-insensitive by default)", () => {
    expect(findMatchRanges("hello world", "world")).toEqual([{ start: 6, end: 11 }]);
  });

  it("is case-insensitive by default", () => {
    expect(findMatchRanges("Hello World", "world")).toEqual([{ start: 6, end: 11 }]);
  });

  it("respects caseSensitive", () => {
    expect(findMatchRanges("Hello World", "world", { caseSensitive: true })).toEqual([]);
    expect(findMatchRanges("Hello World", "World", { caseSensitive: true })).toEqual([
      { start: 6, end: 11 },
    ]);
  });

  it("finds multiple non-overlapping matches in read order", () => {
    expect(findMatchRanges("foo foo foo", "foo")).toEqual([
      { start: 0, end: 3 },
      { start: 4, end: 7 },
      { start: 8, end: 11 },
    ]);
  });

  it("treats the query as a literal string unless regex is enabled", () => {
    // "." is a regex wildcard, but as a literal it matches only a period.
    expect(findMatchRanges("a.b", ".")).toEqual([{ start: 1, end: 2 }]);
    expect(findMatchRanges("aXb", ".")).toEqual([]);
  });

  it("supports regex queries", () => {
    expect(findMatchRanges("abc 123 def", "\\d+", { regex: true })).toEqual([{ start: 4, end: 7 }]);
  });

  it("supports whole-word matching", () => {
    // "foo" should not match inside "foobar".
    expect(findMatchRanges("foo bar foobar", "foo", { wholeWord: true })).toEqual([
      { start: 0, end: 3 },
    ]);
  });

  it("returns [] for an empty query", () => {
    expect(findMatchRanges("anything", "")).toEqual([]);
    expect(findMatchRanges("anything", "   ")).toEqual([]);
  });

  it("returns [] for an invalid regular expression", () => {
    expect(findMatchRanges("anything", "(", { regex: true })).toEqual([]);
  });

  it("returns [] when there are no matches", () => {
    expect(findMatchRanges("hello", "zzz")).toEqual([]);
  });

  it("caps the number of matches per string", () => {
    const text = "a".repeat(MAX_MATCHES_PER_STRING + 100);
    expect(findMatchRanges(text, "a")).toHaveLength(MAX_MATCHES_PER_STRING);
  });
});
