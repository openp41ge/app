// @ts-nocheck
/**
 * Tests for <file-editor> read-only diff document mode (setDiffDocument).
 *
 * A commit's file diff is passed in as a DiffDocument (converted from git
 * hunks) and rendered VS Code-style: header/context rows plus green ADDED and
 * red REMOVED rows with old|new line numbers and +/− glyphs. The editor is
 * read-only by construction — no textarea, no caret surface. clearDiffDocument
 * restores normal buffer mode.
 */
import { describe, test, expect, beforeEach } from "vitest";
import "../../../src/components/file-editor/file-editor";

const DOC = {
  lines: [
    { type: "header", text: "@@ -1,2 +1,3 @@" },
    { type: "context", text: "import x from 'y'", oldLine: 1, newLine: 1 },
    { type: "removed", text: "old line", oldLine: 2 },
    { type: "added", text: "new line", newLine: 2 },
    { type: "added", text: "another new", newLine: 3 },
  ],
};

async function mount(): Promise<HTMLElement & any> {
  const el = document.createElement("file-editor");
  el.filePath = "/repo/app.ts";
  el.fileName = "app.ts";
  document.body.appendChild(el);
  // Let Lit mount + firstUpdated create the viewport.
  await new Promise((r) => setTimeout(r, 30));
  return el;
}

function diffRows(el): HTMLElement[] {
  const host = el.querySelector("[data-commit-diff]");
  return host ? [...host.querySelectorAll("[data-diff-line]")] : [];
}

describe("file-editor diff document mode", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  test("renders rows with correct types, line numbers and glyphs; read-only", async () => {
    const el = await mount();
    el.setDiffDocument(DOC);
    await new Promise((r) => setTimeout(r, 30));

    expect(el.isDiffMode).toBe(true);
    expect(el.diffDocument).toBe(DOC);
    expect(el.isReadOnly).toBe(true);

    const rows = diffRows(el);
    expect(rows).toHaveLength(5);
    expect(rows.map((r) => r.getAttribute("data-diff-line"))).toEqual([
      "header",
      "context",
      "removed",
      "added",
      "added",
    ]);

    const removed = rows.find((r) => r.getAttribute("data-diff-line") === "removed");
    expect(removed.textContent).toContain("old line");
    expect(removed.textContent).toContain("−"); // red glyph
    expect(removed.textContent).toContain("2");
    expect(removed.classList.contains("fe-diff-removed")).toBe(true);

    const added = rows.find(
      (r) => r.getAttribute("data-diff-line") === "added" && r.textContent.includes("new line"),
    );
    expect(added.textContent).toContain("+"); // green glyph
    expect(added.textContent).toContain("2");
    expect(added.classList.contains("fe-diff-added")).toBe(true);

    // No caret / textarea surface — nothing to edit in a commit.
    expect(el.querySelector("textarea")).toBeNull();
  });

  test("background classes are applied per row type", async () => {
    const el = await mount();
    el.setDiffDocument(DOC);
    await new Promise((r) => setTimeout(r, 30));

    const byType = (t) => diffRows(el).find((r) => r.getAttribute("data-diff-line") === t);
    expect(byType("added").className).toContain("fe-diff-added");
    expect(byType("removed").className).toContain("fe-diff-removed");
    expect(byType("context").className).toContain("fe-diff-context");
    expect(byType("header").className).toContain("fe-diff-header");
  });

  test("setDiffDocument before mount paints in firstUpdated (no viewport yet)", async () => {
    const el = document.createElement("file-editor");
    el.setDiffDocument(DOC); // viewport does not exist yet
    document.body.appendChild(el);
    await new Promise((r) => setTimeout(r, 30));
    expect(diffRows(el)).toHaveLength(5);
  });

  test("clearDiffDocument returns to normal mode and restores prior read-only state", async () => {
    const el = await mount();
    expect(el.isReadOnly).toBe(false);
    el.setDiffDocument(DOC);
    await new Promise((r) => setTimeout(r, 20));
    expect(diffRows(el)).toHaveLength(5);

    el.clearDiffDocument();
    await new Promise((r) => setTimeout(r, 20));
    expect(el.isDiffMode).toBe(false);
    expect(diffRows(el)).toHaveLength(0);
    expect(el.isReadOnly).toBe(false); // restored
  });

  test("empty document renders no rows (harmless)", async () => {
    const el = await mount();
    el.setDiffDocument({ lines: [] });
    await new Promise((r) => setTimeout(r, 20));
    expect(diffRows(el)).toHaveLength(0);
    expect(el.isDiffMode).toBe(true);
  });
});
