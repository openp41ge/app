// @ts-nocheck
/**
 * Tests for <file-editor> inline commit-diff mode (setInlineDiff).
 *
 * An inline diff is a REAL loaded buffer (the file at the commit, with its
 * removed lines spliced back in) decorated per row with THREE parallel gutter
 * columns:
 *   left   → the OLD line number (editor background, a separate group),
 *   middle → the normal line-number column with the NEW file number,
 *   sign   → a transparent column whose only visible content is the green `+`
 *            (added) / red `−` (removed) glyph,
 * plus red/green full-width row tints. NO @@ headers; real buffer so syntax
 * highlighting and normal editing behaviour are preserved. setInlineDiff(null)
 * removes everything and restores the default gutter.
 */
import { describe, test, expect, beforeEach } from "vitest";
import "../../../src/components/file-editor/file-editor";
import { PieceTreeTextContentModel } from "../../../src/file-editor";

// Old line 1 "OLD_GONE" became "NEW_HERE"; the merged buffer splices OLD_GONE
// (removed, red) back above NEW_HERE (added, green). No trailing newline.
const TEXT = "OLD_GONE\nNEW_HERE\nstill here";
const ROWS = [
  { kind: "removed", oldLine: 1, newLine: 1 },
  { kind: "added", oldLine: 1, newLine: 1 },
  { kind: "context", oldLine: 2, newLine: 2 },
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

  test("three parallel gutter columns: old | new | sign, colored glyphs", async () => {
    const el = await mount();

    // Extra columns start hidden; middle gutter is the default width.
    expect(el.querySelector(".fe-inline-left").style.display).toBe("none");
    expect(el.querySelector(".fe-inline-sign").style.display).toBe("none");

    await loadInlineDiff(el);

    // Real buffer (removed line spliced in, textarea present, no @@).
    expect(el.textContentModel).toBeTruthy();
    expect(el.textContentModel.lineCount).toBe(3);
    expect(el.querySelector("textarea")).not.toBeNull();
    expect(el.hasInlineDiff).toBe(true);

    const t = tintCounts(el);
    expect(t.removed).toBeGreaterThanOrEqual(1);
    expect(t.added).toBeGreaterThanOrEqual(1);

    // Columns visible now.
    expect(el.querySelector(".fe-inline-left").style.display).not.toBe("none");
    expect(el.querySelector(".fe-inline-sign").style.display).not.toBe("none");

    // middle = NEW file numbers; left = OLD numbers on changed rows; sign =
    // colored glyphs on changed rows only. (jsdom paints the visible band = 2
    // lines, so the context row of the fixture is off-screen here.)
    expect(middleLabels(el)).toEqual(["1", "1"]);
    expect(leftLabels(el)).toEqual(["1", "1"]);
    const signs = signGlyphs(el);
    expect(signs).toHaveLength(2);
    expect(signs[0].text).toBe("−");
    expect(signs[0].cls).toContain("fe-sign-rem");
    expect(signs[1].text).toBe("+");
    expect(signs[1].cls).toContain("fe-sign-add");

    // The leftmost column shares the EDITOR background (a separate group from
    // the gutter), and the sign column has none (transparent).
    const leftStyle = el.querySelector(".fe-inline-left").style;
    expect(leftStyle.background).toContain("var(--fe-bg");
    const leftBg = getComputedStyle(el.querySelector(".fe-inline-left")).backgroundColor;
    const rootBg = getComputedStyle(el.querySelector(".fe-root")).backgroundColor;
    if (leftBg && rootBg) expect(leftBg).toBe(rootBg);
  });

  test("the visible text is the file itself — NO @@ headers", async () => {
    const el = await mount();
    await loadInlineDiff(el);

    const visible = [...el.querySelectorAll(".view-line")].map((v) => v.textContent ?? "").join("\n");
    expect(visible).toContain("OLD_GONE"); // deleted line present (red)
    expect(visible).toContain("NEW_HERE"); // its green replacement
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
