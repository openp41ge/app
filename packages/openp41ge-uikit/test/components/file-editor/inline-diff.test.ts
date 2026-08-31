// @ts-nocheck
/**
 * Tests for <file-editor> inline commit-diff mode (setInlineDiff).
 *
 * An inline diff is a REAL loaded buffer (the file at the commit, with its
 * removed lines spliced back in) decorated with TWO line-number columns:
 *   LEFT  = BEFORE — the old-file line numbers, mostly full: every context
 *           (unchanged) line and every deleted line has a before number. The
 *           only gap is on ADDED lines, which did not exist before.
 *   MIDDLE = AFTER — the new-file line numbers, also mostly full: context and
 *           added lines have an after number; the only gap is on DELETED lines
 *           (they have no new side).
 * So an unchanged line shows the same number in BOTH columns; a changed line
 * shows exactly one side. Plus a transparent sign column (green + / red −) and
 * red/green row tints. NO @@ headers; real buffer (syntax highlighting etc.).
 * setInlineDiff(null) removes everything and restores the default gutter.
 */
import { describe, test, expect, beforeEach } from "vitest";
import "../../../src/components/file-editor/file-editor";
import { PieceTreeTextContentModel } from "../../../src/file-editor";

const TEXT = "ctx one\nOLD_GONE\nNEW_HERE";
// Two-line slice for the ADDED-gap test (rows must equal the line count).
const TEXT_SLICE = "NEW_HERE\nstill here";
// Context at 1 (both sides), deleted old 2 (before only), added new 2
// (after only, no before).
const ROWS = [
  { kind: "context", oldLine: 1, newLine: 1 },
  { kind: "removed", oldLine: 2, newLine: 2 },
  { kind: "added", oldLine: null, newLine: 2 },
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

function middleLabels(el): string[] {
  return [...el.querySelectorAll(".fe-gutter .line-number")].map((n) => n.textContent ?? "");
}
function leftLabels(el): string[] {
  return [...el.querySelectorAll(".fe-inline-left .fe-inline-left-label")].map((n) => n.textContent ?? "");
}
function signGlyphs(el): { text: string; cls: string }[] {
  return [...el.querySelectorAll(".fe-inline-sign .fe-inline-sign-label")].map((n) => ({
    text: n.textContent ?? "",
    cls: n.className,
  }));
}
function tintCounts(el): { added: number; removed: number } {
  return {
    added: el.querySelectorAll(".fe-inline-diff-added").length,
    removed: el.querySelectorAll(".fe-inline-diff-removed").length,
  };
}

describe("file-editor inline commit-diff mode", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  test("BEFORE and AFTER columns: context in both, deleted before-only, gap rules", async () => {
    const el = await mount();

    // Extra columns start hidden.
    expect(el.querySelector(".fe-inline-left").style.display).toBe("none");
    expect(el.querySelector(".fe-inline-sign").style.display).toBe("none");

    await loadInlineDiff(el);

    expect(el.textContentModel).toBeTruthy();
    expect(el.textContentModel.lineCount).toBe(3);
    expect(el.querySelector("textarea")).not.toBeNull();
    expect(el.hasInlineDiff).toBe(true);

    const t = tintCounts(el);
    expect(t.removed).toBeGreaterThanOrEqual(1); // deleted line is in-band (line 2)
    // (the added row is line 3 — off the 2-line jsdom band; its tint is
    // asserted in the dedicated ADDED test below)

    expect(el.querySelector(".fe-inline-left").style.display).not.toBe("none");
    expect(el.querySelector(".fe-inline-sign").style.display).not.toBe("none");

    // Band = lines 1..2 in jsdom:
    //   line 1 (context) — number in BOTH columns,
    //   line 2 (deleted) — number ONLY in the before column.
    expect(leftLabels(el)).toEqual(["1", "2"]);
    expect(middleLabels(el)).toEqual(["1", ""]);
    // sign: none on context, red − on the deleted line.
    const signs = signGlyphs(el);
    expect(signs).toHaveLength(2);
    expect(signs[0].text).toBe("");
    expect(signs[0].cls).toContain("fe-sign-none");
    expect(signs[1].text).toBe("−");
    expect(signs[1].cls).toContain("fe-sign-rem");
  });

  test("an ADDED line shows a gap in the BEFORE column (it did not exist before)", async () => {
    const el = await mount();
    // Two-line buffer so both rows fit the jsdom band.
    await loadInlineDiff(el, TEXT_SLICE, [
      { kind: "added", oldLine: null, newLine: 1 },
      { kind: "context", oldLine: 1, newLine: 2 },
    ]);
    // line 1 added → before empty, after 1; line 2 context → before 1, after 2.
    expect(leftLabels(el)).toEqual(["", "1"]);
    expect(middleLabels(el)).toEqual(["1", "2"]);
    const signs = signGlyphs(el);
    expect(signs[0].text).toBe("+");
    expect(signs[0].cls).toContain("fe-sign-add");
    // The added line's green tint IS in-band here.
    expect(tintCounts(el).added).toBeGreaterThanOrEqual(1);
  });

  test("the visible text is the file itself — NO @@ headers", async () => {
    const el = await mount();
    await loadInlineDiff(el);

    const visible = [...el.querySelectorAll(".view-line")].map((v) => v.textContent ?? "").join("\n");
    // The full buffer holds the spliced deletion AND its replacement; the
    // visible band (2 jsdom lines) shows the deleted line; no @@ anywhere.
    expect(el.textContentModel.getValue()).toContain("OLD_GONE");
    expect(el.textContentModel.getValue()).toContain("NEW_HERE");
    expect(visible).toContain("OLD_GONE");
    expect(visible).not.toContain("@@");
  });

  test("setInlineDiff(null) removes tints, hides the extra columns, restores defaults", async () => {
    const el = await mount();
    await loadInlineDiff(el);
    expect(tintCounts(el).removed).toBeGreaterThanOrEqual(1);
    expect(el.querySelector(".fe-inline-left").style.display).not.toBe("none");

    el.setInlineDiff(null);
    await new Promise((r) => setTimeout(r, 20));

    expect(el.hasInlineDiff).toBe(false);
    expect(tintCounts(el).removed).toBe(0);
    expect(el.querySelector(".fe-inline-left").style.display).toBe("none");
    expect(el.querySelector(".fe-inline-sign").style.display).toBe("none");
    // Default numbers are back: 1, 2 (visible band).
    expect(middleLabels(el)).toEqual(["1", "2"]);
  });

  test("an empty body of rows is harmless (no decorations)", async () => {
    const el = await mount();
    await loadInlineDiff(el, TEXT, []);
    expect(el.hasInlineDiff).toBeFalsy();
  });
});
