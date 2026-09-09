/**
 * Unit tests for the pure full-text content matching util.
 */
import { describe, it, expect } from "vitest";
import { findMatchesInText, countMatchesInText } from "../../../src/main/services/content-search";

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

  it("handles a long single-line file with many matches without stalling", () => {
    // Regression: a short query matching thousands of times on one giant line
    // used to be O(n²) because each match re-scanned for the next newline.
    const line = `xdr${"y".repeat(50)}dr z`;
    const text = Array.from({ length: 3000 }, () => line).join("");
    const matches = findMatchesInText(text, "dr");
    expect(matches.length).toBe(3000 * 2);
    // The text has no newlines, so every match reports the full line content.
    expect(matches.every((m) => m.lineText === text)).toBe(true);
    expect(matches.every((m) => m.lineNumber === 1)).toBe(true);
  });

  it("caps the returned matches at maxMatches", () => {
    const text = Array.from({ length: 500 }, (_, i) => `line ${i} dr`).join("\n");
    const matches = findMatchesInText(text, "dr", { maxMatches: 50 });
    expect(matches).toHaveLength(50);
    // The cap keeps the earliest matches, in order.
    expect(matches[0].lineNumber).toBe(1);
    expect(matches[49].lineNumber).toBe(50);
  });

  it("stops scanning once maxMatches is reached", () => {
    // Regression: a 2-character query on a huge minified file collected every
    // instance, producing a payload the Explorer could never render. With a cap
    // the scan is bounded by the cap, not by the size of the file.
    const text = "dr".repeat(2_000_000);
    const t0 = performance.now();
    const matches = findMatchesInText(text, "dr", { maxMatches: 50 });
    expect(matches).toHaveLength(50);
    expect(performance.now() - t0).toBeLessThan(200);
  });

  it("returns every match when maxMatches is absent or zero", () => {
    const text = "dr dr dr";
    expect(findMatchesInText(text, "dr")).toHaveLength(3);
    expect(findMatchesInText(text, "dr", { maxMatches: 0 })).toHaveLength(3);
  });

  it("crops long lines to maxLineChars around the match", () => {
    // Regression: `lineText` carried the whole source line, so a minified file
    // (one line, ~1 MB) shipped a megabyte per match across IPC to render a
    // ~44-character row.
    const line = `${"a".repeat(5000)}dr${"b".repeat(5000)}`;
    const matches = findMatchesInText(line, "dr", { maxLineChars: 400 });
    expect(matches).toHaveLength(1);
    expect(matches[0].lineText).toHaveLength(400);
    // The offsets are rebased onto the cropped text and still frame the match.
    const { lineText, startIndex, endIndex } = matches[0];
    expect(lineText.slice(startIndex, endIndex)).toBe("dr");
    // `column` stays relative to the original line, for jump-to-match.
    expect(matches[0].column).toBe(5001);
  });

  it("keeps short lines untouched when maxLineChars is set", () => {
    const matches = findMatchesInText("const dr = 1;", "dr", { maxLineChars: 400 });
    expect(matches[0].lineText).toBe("const dr = 1;");
    expect(matches[0].startIndex).toBe(6);
    expect(matches[0].endIndex).toBe(8);
  });

  it("clips a match longer than the whole line budget", () => {
    const line = "x".repeat(1000);
    const matches = findMatchesInText(line, "x+", { regex: true, maxLineChars: 100 });
    expect(matches[0].lineText).toHaveLength(100);
    expect(matches[0].startIndex).toBe(0);
    expect(matches[0].endIndex).toBe(100);
  });

  it("counts matches without materialising them", () => {
    const text = "dr\nxdry\nno match here";
    expect(countMatchesInText(text, "dr")).toBe(2);
    expect(countMatchesInText(text, "DR")).toBe(2);
    expect(countMatchesInText(text, "DR", { caseSensitive: true })).toBe(0);
    expect(countMatchesInText(text, "d.", { regex: true })).toBe(2);
    expect(countMatchesInText(text, "")).toBe(0);
    expect(countMatchesInText(text, "[", { regex: true })).toBe(0);
  });

  it("stops counting at maxMatches", () => {
    const text = "dr".repeat(1000);
    expect(countMatchesInText(text, "dr")).toBe(1000);
    expect(countMatchesInText(text, "dr", { maxMatches: 200 })).toBe(200);
  });

  it("counts the same matches findMatchesInText would return", () => {
    const text = "alpha dr\r\nbeta dr\r\ndr dr dr";
    expect(countMatchesInText(text, "dr")).toBe(findMatchesInText(text, "dr").length);
  });

  it("skips zero-length regex matches when counting", () => {
    // A pattern that can match empty must not spin or inflate the count.
    expect(countMatchesInText("abc", "x*", { regex: true })).toBe(0);
  });

  it("strips a trailing CR on CRLF lines", () => {
    const text = "alpha dr\r\nbeta dr\r\n";
    const matches = findMatchesInText(text, "dr");
    expect(matches).toHaveLength(2);
    expect(matches[0].lineText).toBe("alpha dr");
    expect(matches[1].lineText).toBe("beta dr");
  });
});
