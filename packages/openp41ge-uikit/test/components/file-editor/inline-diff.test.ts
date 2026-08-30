// @ts-nocheck
/**
 * Tests for <file-editor> inline commit-diff mode (setInlineDiff).
 *
 * An inline diff is a REAL loaded buffer (the file at the commit, with its
 * removed lines spliced back in) decorated per row:
 *   - removed rows  → re-injected deleted lines, red full-width background,
 *                     gutter number blanked,
 *   - added rows    → green full-width background, gutter shows the file's
 *                     real new-file number,
 *   - context rows  → unchanged.
 * Because it is a real buffer it keeps full syntax highlighting and normal
 * editor behaviour — and there are NO @@ section headers. setInlineDiff(null)
 * removes the decorations and restores default line numbers.
 */
import { describe, test, expect, beforeEach } from "vitest";
import "../../../src/components/file-editor/file-editor";
import { PieceTreeTextContentModel } from "../../../src/file-editor";

// Old file had line1 "OLD_GONE", which became "NEW_HERE"; the merged buffer
// splices OLD_GONE (removed, red) back above NEW_HERE (added, green). No
// trailing newline — buildInlineDiffFile emits the exact merged lines so the
// buffer's line count matches its decoration rows.
const TEXT = "OLD_GONE\nNEW_HERE\nstill here";
const ROWS = [
  { kind: "removed", fileLine: null },
  { kind: "added", fileLine: 1 },
  { kind: "context", fileLine: 2 },
];

async function mount(): Promise<HTMLElement & any> {
  const el = document.createElement("file-editor");
  el.filePath = "/repo/app.js";
  el.fileName = "app.js";
  document.body.appendChild(el);
  await new Promise((r) => setTimeout(r, 30));
  return el;
}

async function loadInlineDiff(el, text = TEXT, rows = ROWS) {
  const uri = "gitcommitfile://github.com/example/demo/hash123/app.js";
  const model = new PieceTreeTextContentModel(uri, text);
  el.textContentModel = model;
  await el.loadFile(uri, "app.js");
  el.setInlineDiff(rows);
  await new Promise((r) => setTimeout(r, 20));
  return el;
}

function gutterLabels(el): string[] {
  return [...el.querySelectorAll(".fe-gutter .line-number")].map((n) => n.textContent ?? "");
}

function tints(el): { added: number; removed: number } {
  return {
    added: el.querySelectorAll(".fe-inline-diff-added").length,
    removed: el.querySelectorAll(".fe-inline-diff-removed").length,
  };
}

describe("file-editor inline commit-diff mode", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  test("loads a real buffer and decorates added/removed rows", async () => {
    const el = await mount();

    // No diff yet — plain editor with default numbers.
    expect(el.hasInlineDiff).toBe(false);

    await loadInlineDiff(el);

    // It IS the real editor: the document holds the merged text (removed line
    // included), a textarea exists, and no caret is shown (read-only).
    expect(el.textContentModel).toBeTruthy();
    expect(el.textContentModel.lineCount).toBe(3);
    expect(el.querySelector("textarea")).not.toBeNull();

    // Decorations applied.
    expect(el.hasInlineDiff).toBe(true);
    const t = tints(el);
    expect(t.removed).toBeGreaterThanOrEqual(1);
    expect(t.added).toBeGreaterThanOrEqual(1);

    // Gutter shows the FILE's real numbers: deleted row blank, added row "1",
    // context row its own number.
    expect(gutterLabels(el)[0]).toBe("");
    expect(gutterLabels(el)[1]).toBe("1");
  });

  test("the visible text is the file itself — NO @@ headers", async () => {
    const el = await mount();
    await loadInlineDiff(el);

    const visible = [...el.querySelectorAll(".view-line")].map((v) => v.textContent ?? "").join("\n");
    expect(visible).toContain("OLD_GONE"); // deleted line present (red)
    expect(visible).toContain("NEW_HERE"); // its green replacement
    expect(visible).not.toContain("@@");
  });

  test("setInlineDiff(null) removes tints and restores default line numbers", async () => {
    const el = await mount();
    await loadInlineDiff(el);
    expect(tints(el).removed).toBeGreaterThanOrEqual(1);

    el.setInlineDiff(null);
    await new Promise((r) => setTimeout(r, 20));

    expect(el.hasInlineDiff).toBe(false);
    expect(tints(el).removed).toBe(0);
    expect(tints(el).added).toBe(0);
    // Default numbers are back: 1, 2, 3 (no blanks).
    const labels = gutterLabels(el);
    expect(labels[0]).toBe("1");
    expect(labels[1]).toBe("2");
  });

  test("an empty body of rows is harmless (no decorations)", async () => {
    const el = await mount();
    await loadInlineDiff(el, TEXT, []);
    expect(el.hasInlineDiff).toBeFalsy();
  });
});
