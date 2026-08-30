/**
 * Tests for buildInlineDiffDocument — merging full file content with git hunks
 * into a DiffDocument that shows the ENTIRE file with additions/deletions
 * injected inline (VS Code inline-diff style, nothing cropped).
 */
import { describe, it, expect } from "vitest";
import { buildInlineDiffDocument } from "../src/build-inline-diff-document";

describe("buildInlineDiffDocument", () => {
  it("injects a single change and keeps the full file tail", () => {
    // Post-commit file (line 2 became "BETA").
    const content = "alpha\nBETA\ngamma\ndelta\nepsilon\n";
    const doc = buildInlineDiffDocument(content, [
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
    expect(doc.lines.map((l) => l.type)).toEqual([
      "header",
      "context",
      "removed",
      "added",
      "context",
      "context",
      "context",
    ]);
    // Injected change:
    expect(doc.lines[1]).toEqual({ type: "context", text: "alpha", oldLine: 1, newLine: 1 });
    expect(doc.lines[2]).toEqual({ type: "removed", text: "beta", oldLine: 2 });
    expect(doc.lines[3]).toEqual({ type: "added", text: "BETA", newLine: 2 });
    expect(doc.lines[4]).toEqual({ type: "context", text: "gamma", oldLine: 3, newLine: 3 });
    // Tail lines are present — the full file, not a cropped context window.
    expect(doc.lines[5]).toEqual({ type: "context", text: "delta", oldLine: undefined, newLine: 4 });
    expect(doc.lines[6]).toEqual({ type: "context", text: "epsilon", newLine: 5});
  });

  it("keeps the ENTIRE gap between hunks (no 3-line context cropping)", () => {
    const content = "l1\nl2\nl3\nl4\nl5\nl6\nl7\nl8\nl9\nl10\n";
    const doc = buildInlineDiffDocument(content, [
      { header: "@@ -1,2 +1,2 @@", lines: [{ type: "-", text: "l1" }, { type: "+", text: "L1" }, { type: " ", text: "l2" }] },
      { header: "@@ -9,2 +9,2 @@", lines: [{ type: "-", text: "l9" }, { type: "+", text: "L9" }, { type: " ", text: "l10" }] },
    ]);
    const contexts = doc.lines.filter((l) => l.type === "context").map((l) => l.text);
    // Everything from l2..l10 is present, including the long unchanged run
    // l3..l8 between the two hunks.
    expect(contexts).toEqual(["l2", "l3", "l4", "l5", "l6", "l7", "l8", "l10"]);
    expect(doc.lines.map((l) => l.type)).toEqual([
      "header", "removed", "added", "context",
      "context", "context", "context", "context", "context", "context",
      "header", "removed", "added", "context",
    ]);
  });

  it("handles a wholly-new file (0,0 old range) with no old numbers", () => {
    const doc = buildInlineDiffDocument("fresh one\nfresh two\n", [
      { header: "@@ -0,0 +1,2 @@", lines: [{ type: "+", text: "fresh one" }, { type: "+", text: "fresh two" }] },
    ]);
    expect(doc.lines.map((l) => l.type)).toEqual(["header", "added", "added"]);
    expect(doc.lines[1]).toEqual({ type: "added", text: "fresh one", newLine: 1 });
    expect(doc.lines[2]).toEqual({ type: "added", text: "fresh two", newLine: 2 });
  });

  it("empty hunks still yield the full file as plain context", () => {
    const doc = buildInlineDiffDocument("a\nb\nc\n", []);
    expect(doc.lines.map((l) => l.type)).toEqual(["context", "context", "context"]);
    expect(doc.lines.map((l) => l.newLine)).toEqual([1, 2, 3]);
  });

  it("empty content yields an empty document", () => {
    expect(buildInlineDiffDocument("", []).lines).toEqual([]);
  });
});
