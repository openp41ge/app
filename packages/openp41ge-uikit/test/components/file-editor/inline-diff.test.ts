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
 * shows exactly one side. The NUMBER CELL carries the colour: the BEFORE cell
 * of a deleted row is red, the AFTER cell of an added row is green — coloured
 * all the way across, no +/− sign column. Red/green row tints stay on the text.
 * NO @@ headers; real buffer (syntax highlighting etc.).
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
function cellCounts(el): { removed: number; added: number } {
  return {
    removed: el.querySelectorAll(".fe-inline-removed-cell").length,
    added: el.querySelectorAll(".line-number.fe-inline-added-cell").length,
  };
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

  test("both number columns live in a sticky-left .fe-gutter-group (horizontal pinning)", async () => {
    const el = await mount();

    // Pinning is OWNED by a sticky-left group wrapper: both the BEFORE column
    // and the AFTER gutter are children of it, so a horizontal scroll pins the
    // two columns together at the left edge while only the text scrolls. The
    // columns themselves are plain (relative) — vertical scroll stays native.
    const group = el.querySelector(".fe-gutter-group");
    expect(group).not.toBeNull();
    const gs = getComputedStyle(group);
    expect(gs.position).toBe("sticky");
    expect(gs.left).toBe("0px");
    expect(group.contains(el.querySelector(".fe-gutter"))).toBe(true);
    expect(group.contains(el.querySelector(".fe-inline-left"))).toBe(true);
    expect(el.querySelector(".fe-gutter").style.position).toBe("relative");
    expect(el.querySelector(".fe-inline-left").style.position).toBe("relative");
    // The row is floored to the viewport height so the number columns always
    // stretch to the BOTTOM of the view — never empty space beneath them on a
    // short file (align-items:stretch + min-height:100%).
    expect(el.querySelector(".fe-scroll-content").style.minHeight).toBe("100%");

    await loadInlineDiff(el);
    // The BEFORE column is inserted into the group (not beside it).
    expect(el.querySelector(".fe-inline-left").parentElement.className).toBe("fe-gutter-group");
  });

  test("BEFORE and AFTER columns: context in both, deleted before-only, gap rules", async () => {
    const el = await mount();

    // Extra columns start hidden.
    expect(el.querySelector(".fe-inline-left").style.display).toBe("none");

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

    // Band = lines 1..2 in jsdom:
    //   line 1 (context) — number in BOTH columns,
    //   line 2 (deleted) — number ONLY in the before column.
    expect(leftLabels(el)).toEqual(["1", "2"]);
    expect(middleLabels(el)).toEqual(["1", ""]);
    // Coloured number cells: the deleted line's BEFORE cell is red (its
    // AFTER cell is blank); the context line carries no cell colour.
    expect(cellCounts(el).removed).toBeGreaterThanOrEqual(1);
    const leftEls = [...el.querySelectorAll(".fe-inline-left .fe-inline-left-label")];
    expect(leftEls[1].classList.contains("fe-inline-removed-cell")).toBe(true);
    expect(leftEls[0].classList.contains("fe-inline-removed-cell")).toBe(false);
    // No sign/glyph column exists anymore.
    expect(el.querySelector(".fe-inline-sign")).toBeNull();
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
    // The added line's AFTER cell (normal gutter label, line 1) is green; its
    // BEFORE cell is a gap. The context line's cells carry no colour.
    const midEls = [...el.querySelectorAll(".fe-gutter .line-number")];
    expect(midEls[0].classList.contains("fe-inline-added-cell")).toBe(true);
    expect(midEls[1].classList.contains("fe-inline-added-cell")).toBe(false);
    // The full-height wrapper carries the tint too, so a WRAPPED added row
    // stays green down every segment (not just the first line row).
    expect(midEls[0].parentElement.classList.contains("fe-inline-added-cell")).toBe(true);
    expect(getComputedStyle(midEls[0].parentElement).backgroundColor).toBe(
      "rgba(46, 160, 67, 0.24)",
    );
    const leftAddedEls = [...el.querySelectorAll(".fe-inline-left .fe-inline-left-label")];
    expect(leftAddedEls[0].classList.contains("fe-inline-removed-cell")).toBe(false);
    // The added line's green tint IS in-band here.
    expect(tintCounts(el).added).toBeGreaterThanOrEqual(1);
  });

  test("selected rows highlight their number cells in BOTH columns", async () => {
    const el = await mount();
    await loadInlineDiff(el); // line 1 context, 2 removed, 3 added

    // Drive the highlight path directly: the overlay repaints from
    // getLabelDecoration (via setActiveLine -> _updateAll), and the BEFORE
    // column toggles its own entries.
    el._selectedDiffLines = new Set([2]);
    el._lineNumbersOverlay.setActiveLine(2);
    el._inlineColumns.setActiveLines([2]);
    let mids = [...el.querySelectorAll(".fe-gutter .line-number")];
    let lefts = [...el.querySelectorAll(".fe-inline-left .fe-inline-left-label")];
    expect(mids[1].classList.contains("active-line-number")).toBe(true);
    expect(mids[0].classList.contains("active-line-number")).toBe(false);
    // The wrapper also carries the decoration, so a selected WRAPPED row
    // highlights every segment in the AFTER column, not just its first row.
    expect(mids[1].parentElement.classList.contains("active-line-number")).toBe(true);
    expect(mids[0].parentElement.classList.contains("active-line-number")).toBe(false);
    expect(lefts[1].classList.contains("fe-inline-left-active")).toBe(true);
    expect(lefts[0].classList.contains("fe-inline-left-active")).toBe(false);
    // The active background composes with the deleted-row red cell, not
    // replaces it.
    expect(lefts[1].classList.contains("fe-inline-removed-cell")).toBe(true);

    // A MULTI-ROW selection highlights every covered line in both columns.
    el._selectedDiffLines = new Set([1, 2]);
    el._lineNumbersOverlay.setActiveLine(1);
    el._inlineColumns.setActiveLines([1, 2]);
    mids = [...el.querySelectorAll(".fe-gutter .line-number")];
    lefts = [...el.querySelectorAll(".fe-inline-left .fe-inline-left-label")];
    expect(mids[0].classList.contains("active-line-number")).toBe(true);
    expect(mids[1].classList.contains("active-line-number")).toBe(true);
    expect(lefts[0].classList.contains("fe-inline-left-active")).toBe(true);
    expect(lefts[1].classList.contains("fe-inline-left-active")).toBe(true);

    // Shrinking the selection back clears the second row.
    el._selectedDiffLines = new Set([1]);
    el._lineNumbersOverlay.setActiveLine(1);
    el._inlineColumns.setActiveLines([1]);
    mids = [...el.querySelectorAll(".fe-gutter .line-number")];
    lefts = [...el.querySelectorAll(".fe-inline-left .fe-inline-left-label")];
    expect(mids[0].classList.contains("active-line-number")).toBe(true);
    expect(mids[1].classList.contains("active-line-number")).toBe(false);
    expect(lefts[0].classList.contains("fe-inline-left-active")).toBe(true);
    expect(lefts[1].classList.contains("fe-inline-left-active")).toBe(false);
  });

  test("the grey selection background does NOT replace green/red tinted cells", async () => {
    const el = await mount();
    await loadInlineDiff(el); // line 1 context, 2 removed, 3 added

    // Select the REMOVED row (line 2): its BEFORE cell keeps the red tint.
    el._selectedDiffLines = new Set([2]);
    el._lineNumbersOverlay.setActiveLine(2);
    el._inlineColumns.setActiveLines([2]);
    const removedLeft = [...el.querySelectorAll(".fe-inline-left .fe-inline-left-label")][1];
    expect(getComputedStyle(removedLeft).backgroundColor).toBe("rgba(248, 81, 73, 0.24)");
    // The AFTER cell of the deleted row stays NUMBERLESS but is ALSO tinted
    // red, so the row reads as one continuous red block across the gutter.
    const removedMid = [...el.querySelectorAll(".fe-gutter .line-number")][1];
    expect(removedMid.textContent).toBe("");
    expect(removedMid.classList.contains("fe-inline-removed-cell")).toBe(true);
    expect(getComputedStyle(removedMid).backgroundColor).toBe("rgba(248, 81, 73, 0.24)");
    // Wrapped removed row: the full-height wrapper stays red across all
    // segments (selection must not grey it out either).
    expect(removedMid.parentElement.classList.contains("fe-inline-removed-cell")).toBe(true);
    expect(getComputedStyle(removedMid.parentElement).backgroundColor).toBe(
      "rgba(248, 81, 73, 0.24)",
    );

    // An ADDED row keeps its green AFTER cell when selected.
    await loadInlineDiff(el, TEXT_SLICE, [
      { kind: "added", oldLine: null, newLine: 1 },
      { kind: "context", oldLine: 1, newLine: 2 },
    ]);
    el._selectedDiffLines = new Set([1]);
    el._lineNumbersOverlay.setActiveLine(1);
    el._inlineColumns.setActiveLines([1]);
    const addedMid = [...el.querySelectorAll(".fe-gutter .line-number")][0];
    expect(getComputedStyle(addedMid).backgroundColor).toBe("rgba(46, 160, 67, 0.24)");

    // A neutral (context) selected row gets the grey background, not a tint.
    await loadInlineDiff(el);
    el._selectedDiffLines = new Set([1]);
    el._lineNumbersOverlay.setActiveLine(1);
    el._inlineColumns.setActiveLines([1]);
    const ctxMid = [...el.querySelectorAll(".fe-gutter .line-number")][0];
    const bg = getComputedStyle(ctxMid).backgroundColor;
    expect(bg).not.toBe("rgba(248, 81, 73, 0.24)");
    expect(bg).not.toBe("rgba(46, 160, 67, 0.24)");
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
    expect(cellCounts(el).removed).toBe(0);
    expect(cellCounts(el).added).toBe(0);
    // Default numbers are back: 1, 2 (visible band).
    expect(middleLabels(el)).toEqual(["1", "2"]);
  });

  test("an empty body of rows is harmless (no decorations)", async () => {
    const el = await mount();
    await loadInlineDiff(el, TEXT, []);
    expect(el.hasInlineDiff).toBeFalsy();
  });

  test("hovering a number cell highlights that row's cell in BOTH columns", async () => {
    const el = await mount();
    await loadInlineDiff(el);

    const before1 = el.querySelector('.fe-inline-left-label[data-line="1"]');
    const gutter1 = el.querySelector('.fe-gutter .line-number[data-line="1"]');
    expect(before1).not.toBeNull();
    expect(gutter1).not.toBeNull();

    // Hover the BEFORE (left) cell of line 1 → both columns' line-1 cells light up.
    before1.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 0));
    expect(before1.classList.contains("fe-inline-left-hover")).toBe(true);
    expect(gutter1.classList.contains("line-number-hover")).toBe(true);

    // Hover the AFTER (right) cell of line 2 → line 2 highlights in BOTH columns,
    // line 1 clears (hover follows the pointer).
    const gutter2 = el.querySelector('.fe-gutter .line-number[data-line="2"]');
    gutter2.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 0));
    const before2 = el.querySelector('.fe-inline-left-label[data-line="2"]');
    expect(before2.classList.contains("fe-inline-left-hover")).toBe(true);
    expect(before1.classList.contains("fe-inline-left-hover")).toBe(false);

    // Leaving the gutter entirely clears the highlight in both columns.
    gutter2.dispatchEvent(
      new MouseEvent("mouseout", { bubbles: true, relatedTarget: document.body }),
    );
    await new Promise((r) => setTimeout(r, 0));
    expect(before2.classList.contains("fe-inline-left-hover")).toBe(false);
    expect(gutter2.classList.contains("line-number-hover")).toBe(false);
  });

  test("the custom horizontal scrollbar lives OUTSIDE the scroll viewport (so it stays pinned), hidden until content overflows", async () => {
    const el = await mount();
    const vp = el._viewportEl;
    const track = el.querySelector(".fe-hscroll");
    expect(track).not.toBeNull();
    // It is NOT a child of the scrolling viewport — an absolute child there
    // would slide with the content. It must live in the non-scrolling
    // container so it stays pinned to the viewport's bottom edge.
    expect(vp.querySelector(".fe-hscroll")).toBeNull();
    expect(track.querySelector(".fe-hscroll-thumb")).not.toBeNull();
    // Square thumb (no rounded corners), matching the native bar.
    expect((track.querySelector(".fe-hscroll-thumb") as HTMLElement).style.borderRadius).toBe("");
    // Hidden by default (jsdom has no layout → no overflow).
    expect(track.style.display).toBe("none");
    // The NATIVE horizontal scrollbar is disabled in CSS; the custom bar is styled.
    const themeStyle = [...document.head.querySelectorAll("style[data-fe-theme]")]
      .map((s) => s.textContent ?? "")
      .join("\n");
    expect(themeStyle).toContain(".fe-viewport::-webkit-scrollbar:horizontal");
    expect(themeStyle).toContain(".fe-hscroll-thumb");
  });

  test("BEFORE and AFTER columns always share one content-derived width — a fully-deleted file leaves the AFTER column with the BEFORE column's width", async () => {
    const el = await mount();
    (el as unknown as { _charWidth: number })._charWidth = 20; // widen so content beats the 48px min

    // A fully-deleted file: every row removed, old numbers 1..120 (3 digits),
    // NO new-side content at all (AFTER column would render empty). The shared
    // width must come from the BEFORE column's content.
    const lineCount = 120;
    const text = Array.from({ length: lineCount }, (_, i) => `old deleted line ${i + 1}`).join(
      "\n",
    );
    const rows = Array.from({ length: lineCount }, (_, i) => ({
      kind: "removed" as const,
      oldLine: i + 1,
      newLine: null,
    }));
    await loadInlineDiff(el, text, rows);

    const expected = 3 * 20 + 16; // 3 digits * charW + padding = 76
    expect(el.querySelector(".fe-inline-left").style.width).toBe(`${expected}px`);
    expect(el.querySelector(".fe-gutter").style.width).toBe(`${expected}px`);
    // The AFTER column is BLANK (no new side) yet stays as wide as the BEFORE.
    expect(middleLabels(el).every((t) => t === "")).toBe(true);
    expect(leftLabels(el)[0]).toBe("1");
  });

  test("BEFORE and AFTER columns share the same width even when only one side has digit-heavy content", async () => {
    const el = await mount();
    (el as unknown as { _charWidth: number })._charWidth = 20;

    // A wholly-NEW file: no BEFORE content (every row added), AFTER numbers up
    // to 3 digits. The empty BEFORE column must still reserve the AFTER width.
    const rows = [
      { kind: "added" as const, oldLine: null, newLine: 1 },
      { kind: "added" as const, oldLine: null, newLine: 2 },
      { kind: "added" as const, oldLine: null, newLine: 999 },
    ];
    await loadInlineDiff(el, "fresh one\nfresh two\nfresh three", rows);

    const expected = 3 * 20 + 16; // 3 digits * charW + padding = 76
    expect(el.querySelector(".fe-inline-left").style.width).toBe(`${expected}px`);
    expect(el.querySelector(".fe-gutter").style.width).toBe(`${expected}px`);
  });
});
