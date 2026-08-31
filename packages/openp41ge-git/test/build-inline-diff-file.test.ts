/**
 * Tests for buildInlineDiffFile — merging full post-commit file content with git
 * hunks into ONE loadable document (the whole file, no @@ headers) whose rows
 * carry the added/removed/context kind plus the old|new line-number pair.
 */
import { describe, it, expect } from "vitest";
import { buildInlineDiffFile } from "../src/build-inline-diff-file";

describe("buildInlineDiffFile", () => {
  it("returns the FULL file text with removed lines spliced in and no @@ headers", () => {
    // Post-commit file (old "beta" on line 2 became "BETA").
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

    // BEFORE/AFTER numbers: replaced "beta" (removed) has before 2 with no
    // after; its replacement has after 2 with NO before (it didn't exist
    // before). Context lines are present in both columns.
    expect(file.rows).toEqual([
      { kind: "context", oldLine: 1, newLine: 1 },
      { kind: "removed", oldLine: 2, newLine: 2 },
      { kind: "added", oldLine: null, newLine: 2 },
      { kind: "context", oldLine: 3, newLine: 3 },
      { kind: "context", oldLine: 4, newLine: 4 },
      { kind: "context", oldLine: 5, newLine: 5 },
    ]);
  });

  it("keeps the ENTIRE gap between hunks — nothing cropped, one row per line", () => {
    // Post-commit file: line 1 → L1, line 9 → L9.
    const content = "L1\nl2\nl3\nl4\nl5\nl6\nl7\nl8\nL9\nl10\n";
    const file = buildInlineDiffFile(content, [
      { header: "@@ -1,2 +1,2 @@", lines: [{ type: "-", text: "l1" }, { type: "+", text: "L1" }, { type: " ", text: "l2" }] },
      { header: "@@ -9,2 +9,2 @@", lines: [{ type: "-", text: "l9" }, { type: "+", text: "L9" }, { type: " ", text: "l10" }] },
    ]);
    expect(file.rows).toHaveLength(12);
    expect(file.text).toBe("l1\nL1\nl2\nl3\nl4\nl5\nl6\nl7\nl8\nl9\nL9\nl10");

    expect(file.rows.map((r) => r.kind)).toEqual([
      "removed", "added", "context",
      "context", "context", "context", "context", "context", "context",
      "removed", "added", "context",
    ]);
    // Context rows keep honest old|new (both equal on unchanged lines), and the
    // gap lines l3..l8 are all present with their real numbers.
    expect(file.rows[6]).toEqual({ kind: "context", oldLine: 6, newLine: 6 }); // l6
    expect(file.rows[11]).toEqual({ kind: "context", oldLine: 10, newLine: 10 }); // l10
    expect(file.rows[2]).toEqual({ kind: "context", oldLine: 2, newLine: 2 }); // l2
  });

  it("deletion-only hunk (new range 0) splices the removed lines; deletions show old + the new anchor", () => {
    const content = "keep\nstill here\n";
    const file = buildInlineDiffFile(content, [
      {
        header: "@@ -2,2 +2,0 @@",
        lines: [{ type: "-", text: "remove me" }, { type: "-", text: "remove me two" }],
      },
    ]);
    expect(file.text).toBe("keep\nremove me\nremove me two\nstill here");
    // The kept tail line is new line 2 but OLD line 4 (two lines were
    // deleted above it) — its before number drifts by the deletions.
    expect(file.rows).toEqual([
      { kind: "context", oldLine: 1, newLine: 1 },
      { kind: "removed", oldLine: 2, newLine: 2 },
      { kind: "removed", oldLine: 3, newLine: 2 },
      { kind: "context", oldLine: 4, newLine: 2 },
    ]);
  });

  it("wholly-new file rows have a new number but no old line", () => {
    const file = buildInlineDiffFile("fresh one\nfresh two\n", [
      { header: "@@ -0,0 +1,2 @@", lines: [{ type: "+", text: "fresh one" }, { type: "+", text: "fresh two" }] },
    ]);
    expect(file.rows).toEqual([
      { kind: "added", oldLine: null, newLine: 1 },
      { kind: "added", oldLine: null, newLine: 2 },
    ]);
    expect(file.text).not.toContain("@@");
  });

  it("empty hunks still yield the full file as plain context", () => {
    const file = buildInlineDiffFile("a\nb\nc\n", []);
    expect(file.rows).toEqual([
      { kind: "context", oldLine: 1, newLine: 1 },
      { kind: "context", oldLine: 2, newLine: 2 },
      { kind: "context", oldLine: 3, newLine: 3 },
    ]);
    expect(file.text).toBe("a\nb\nc");
  });

  it("a deleted file keeps only its removed rows (no new side)", () => {
    const file = buildInlineDiffFile("", [
      { header: "@@ -1,2 +0,0 @@", lines: [{ type: "-", text: "gone" }, { type: "-", text: "gone two" }] },
    ]);
    expect(file.rows.map((r) => r.kind)).toEqual(["removed", "removed"]);
    // new side is empty → no new number.
    expect(file.rows[0]).toEqual({ kind: "removed", oldLine: 1, newLine: null });
    expect(file.text).toBe("gone\ngone two");
  });

  it("null content (a deleted file) renders the whole previous version as removed rows", () => {
    // The commit diff deleted this file: content at the commit is null, and the
    // hunks carry every - line of the old file — so the merged document is the
    // entire previous version, one big red delete block.
    const file = buildInlineDiffFile(null, [
      {
        header: "@@ -1,3 +0,0 @@",
        lines: [
          { type: "-", text: "line one" },
          { type: "-", text: "line two" },
          { type: "-", text: "line three" },
        ],
      },
    ]);
    expect(file.rows.map((r) => r.kind)).toEqual(["removed", "removed", "removed"]);
    expect(file.rows).toEqual([
      { kind: "removed", oldLine: 1, newLine: null },
      { kind: "removed", oldLine: 2, newLine: null },
      { kind: "removed", oldLine: 3, newLine: null },
    ]);
    expect(file.text).toBe("line one\nline two\nline three");
    expect(file.text).not.toContain("@@");
  });

  it("empty content and no hunks yields an empty document", () => {
    expect(buildInlineDiffFile("", []).rows).toEqual([]);
  });
});
