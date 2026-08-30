/**
 * Tests for buildInlineDiffFile — merging full post-commit file content with git
 * hunks into ONE loadable document (the whole file, no @@ headers) whose rows
 * carry the added/removed/context kinds + real file line numbers.
 */
import { describe, it, expect } from "vitest";
import { buildInlineDiffFile } from "../src/build-inline-diff-file";

describe("buildInlineDiffFile", () => {
  it("returns the FULL file text with removed lines spliced in and no @@ headers", () => {
    // Post-commit file (line 2 became "BETA").
    const content = "alpha\nBETA\ngamma\ndelta\nepsilon\n";
    const file = buildInlineDiffFile(content, [
      {
        header: "@@ -1,3 +1,3 @@",
        lines: [
          { type: " ", text: "alpha" },
          { type: "-", text: "beta" },
          { type: "+", text: "BETA" },
          { type: " ", text: "gamma" },
        ],
      },
    ]);

    // The document is the file read-through: removed line present, replacement
    // in place, tail kept whole — and NO "@@" header text anywhere.
    expect(file.text).toBe("alpha\nbeta\nBETA\ngamma\ndelta\nepsilon");
    expect(file.text).not.toContain("@@");

    expect(file.rows).toEqual([
      { kind: "context", fileLine: 1 },
      { kind: "removed", fileLine: null },
      { kind: "added", fileLine: 2 },
      { kind: "context", fileLine: 3 },
      { kind: "context", fileLine: 4 },
      { kind: "context", fileLine: 5 },
    ]);
  });

  it("keeps the ENTIRE gap between hunks — nothing cropped, one row per line", () => {
    // Post-commit file: line 1 → L1, line 9 → L9.
    const content = "L1\nl2\nl3\nl4\nl5\nl6\nl7\nl8\nL9\nl10\n";
    const file = buildInlineDiffFile(content, [
      { header: "@@ -1,2 +1,2 @@", lines: [{ type: "-", text: "l1" }, { type: "+", text: "L1" }, { type: " ", text: "l2" }] },
      { header: "@@ -9,2 +9,2 @@", lines: [{ type: "-", text: "l9" }, { type: "+", text: "L9" }, { type: " ", text: "l10" }] },
    ]);
    // 10 file lines + 2 spliced removed rows = 12 rows, and every line of the
    // file (l2..l8 between the hunks included) is present verbatim.
    expect(file.rows).toHaveLength(12);
    expect(file.text).toBe("l1\nL1\nl2\nl3\nl4\nl5\nl6\nl7\nl8\nl9\nL9\nl10");
    const kinds = file.rows.map((r) => r.kind);
    expect(kinds).toEqual([
      "removed", "added", "context",
      "context", "context", "context", "context", "context", "context",
      "removed", "added", "context",
    ]);
    // Real new-file numbers survive the inserted rows.
    const fileLines = file.rows.map((r) => r.fileLine);
    expect(fileLines[6]).toBe(6); // l6 keeps its real number despite splices
    expect(fileLines[11]).toBe(10); // l10 real number after the gap
    expect(fileLines[3]).toBe(3); // l3 keeps its real number after the splice
  });

  it("deletion-only hunk (new range 0) splices the removed lines with no added rows", () => {
    // Post-commit file = "keep", "still here" (old lines 2-3 were deleted).
    const content = "keep\nstill here\n";
    const file = buildInlineDiffFile(content, [
      {
        header: "@@ -2,2 +2,0 @@",
        lines: [{ type: "-", text: "remove me" }, { type: "-", text: "remove me two" }],
      },
    ]);
    expect(file.text).toBe("keep\nremove me\nremove me two\nstill here");
    expect(file.rows.map((r) => r.kind)).toEqual(["context", "removed", "removed", "context"]);
    expect(file.rows.map((r) => r.fileLine)).toEqual([1, null, null, 2]);
  });

  it("adds rows keep their newFile number in a wholly-new file block", () => {
    const file = buildInlineDiffFile("fresh one\nfresh two\n", [
      { header: "@@ -0,0 +1,2 @@", lines: [{ type: "+", text: "fresh one" }, { type: "+", text: "fresh two" }] },
    ]);
    expect(file.rows).toEqual([
      { kind: "added", fileLine: 1 },
      { kind: "added", fileLine: 2 },
    ]);
    expect(file.text).not.toContain("@@");
  });

  it("empty hunks still yield the full file as plain context", () => {
    const file = buildInlineDiffFile("a\nb\nc\n", []);
    expect(file.rows).toEqual([
      { kind: "context", fileLine: 1 },
      { kind: "context", fileLine: 2 },
      { kind: "context", fileLine: 3 },
    ]);
    expect(file.text).toBe("a\nb\nc");
  });

  it("null/empty content with only removals still renders the deleted lines (file deleted)", () => {
    const file = buildInlineDiffFile("", [
      { header: "@@ -1,2 +0,0 @@", lines: [{ type: "-", text: "gone" }, { type: "-", text: "gone two" }] },
    ]);
    expect(file.rows.map((r) => r.kind)).toEqual(["removed", "removed"]);
    expect(file.text).toBe("gone\ngone two");
  });

  it("empty content and no hunks yields an empty document", () => {
    expect(buildInlineDiffFile("", []).rows).toEqual([]);
  });
});
