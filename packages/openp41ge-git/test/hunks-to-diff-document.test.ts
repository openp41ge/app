/**
 * Tests for hunksToDiffDocument — converting git hunks (SearchHunk[]) into a
 * renderable DiffDocument with old|new line numbers for the file-editor diff.
 */
import { describe, it, expect } from "vitest";
import { hunksToDiffDocument } from "../src/hunks-to-diff-document";

describe("hunksToDiffDocument", () => {
  it("assigns old/new line numbers from a counted hunk range", () => {
    const doc = hunksToDiffDocument([
      {
        header: "@@ -10,2 +20,3 @@ fn",
        lines: [
          { type: " ", text: "keep" },
          { type: "-", text: "gone" },
          { type: "+", text: "added one" },
          { type: "+", text: "added two" },
        ],
      },
    ]);
    expect(doc.lines).toEqual([
      { type: "header", text: "@@ -10,2 +20,3 @@ fn" },
      { type: "context", text: "keep", oldLine: 10, newLine: 20 },
      { type: "removed", text: "gone", oldLine: 11 },
      { type: "added", text: "added one", newLine: 21 },
      { type: "added", text: "added two", newLine: 22 },
    ]);
  });

  it("handles headers without counts (single-line ranges)", () => {
    const doc = hunksToDiffDocument([
      {
        header: "@@ -1 +1 @@",
        lines: [
          { type: "-", text: "old" },
          { type: "+", text: "new" },
        ],
      },
    ]);
    expect(doc.lines[1]).toEqual({ type: "removed", text: "old", oldLine: 1 });
    expect(doc.lines[2]).toEqual({ type: "added", text: "new", newLine: 1 });
  });

  it("handles a wholly-new file (0,0 old range) — no old numbers", () => {
    const doc = hunksToDiffDocument([
      {
        header: "@@ -0,0 +1,2 @@",
        lines: [
          { type: "+", text: "fresh one" },
          { type: "+", text: "fresh two" },
        ],
      },
    ]);
    expect(doc.lines[1]).toEqual({ type: "added", text: "fresh one", newLine: 1 });
    expect(doc.lines[2]).toEqual({ type: "added", text: "fresh two", newLine: 2 });
    expect(doc.lines.every((l) => l.type !== "removed")).toBe(true);
  });

  it("walks multiple hunks independently and emits a header row per hunk", () => {
    const doc = hunksToDiffDocument([
      { header: "@@ -1,1 +1,1 @@", lines: [{ type: " ", text: "a", }] },
      { header: "@@ -5,1 +5,1 @@", lines: [{ type: " ", text: "b" }] },
    ]);
    expect(doc.lines.map((l) => l.type)).toEqual(["header", "context", "header", "context"]);
    expect(doc.lines[1]).toEqual({ type: "context", text: "a", oldLine: 1, newLine: 1 });
    expect(doc.lines[3]).toEqual({ type: "context", text: "b", oldLine: 5, newLine: 5 });
  });

  it("an empty/really-malformed header still produces rows (defensive)", () => {
    const doc = hunksToDiffDocument([
      { header: "^", lines: [{ type: "+", text: "x" }] },
    ]);
    expect(doc.lines[0].type).toBe("header");
    expect(doc.lines[1]).toEqual({ type: "added", text: "x", newLine: 1 });
  });

  it("empty input yields an empty document", () => {
    expect(hunksToDiffDocument([]).lines).toEqual([]);
  });
});
