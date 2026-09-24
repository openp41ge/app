// @ts-nocheck
/**
 * ViewLines folding tests: when lines are hidden by a collapsed fold they
 * contribute zero visible lines — the rendered window skips them, the `top` of
 * later lines compacts, the visible line count drops and the model-space
 * visible range skips the hidden band. Wrapped mode composes (a hidden model
 * line adds no view lines).
 */
import { describe, test, expect, beforeEach } from "vitest";
import { ViewLines } from "../../../src/view/view-lines";

const LINE_HEIGHT = 20;

function makeViewport(height = 400) {
  const el = document.createElement("div");
  el.className = "fe-viewport";
  Object.defineProperty(el, "clientHeight", { value: height, configurable: true });
  document.body.appendChild(el);
  return el;
}

function makeViewLines(count = 10, { height = 400, wrap = false } = {}) {
  const viewport = makeViewport(height);
  const vl = new ViewLines(viewport, { lineHeight: LINE_HEIGHT, tabSize: 4 });
  vl.setTotalLineCount(count);
  vl.lineContentProvider = {
    getLineContent: () => "abc",
    getLineTokens: () => null,
    tabSize: 4,
  };
  if (wrap) vl.setWordWrap(true, 80);
  return { viewport, vl };
}

describe("ViewLines folding", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  test("hidden (folded) lines are skipped and later lines compact upward", () => {
    const { vl } = makeViewLines(8);
    vl.setHiddenLines(new Set([2, 3]));
    vl.rebuildAll();

    expect(vl.getVisibleLineCount()).toBe(6);
    const rendered = vl.getRenderedLines();
    const nums = rendered.map((l) => l.lineNumber).sort((a, b) => a - b);
    expect(nums).not.toContain(2);
    expect(nums).not.toContain(3);

    // Line 4 is the 2nd visible line → top = (2-1)*20 = 20.
    const line4 = rendered.find((l) => l.lineNumber === 4);
    expect(line4.domNode.element.style.top).toBe("20px");
    // Line 5 is the 3rd visible line → top = 40.
    const line5 = rendered.find((l) => l.lineNumber === 5);
    expect(line5.domNode.element.style.top).toBe("40px");
  });

  test("the visible model range skips the hidden band when scrolling", () => {
    const { viewport, vl } = makeViewLines(10);
    vl.setHiddenLines(new Set([4, 5, 6]));
    const events = [];
    vl.onVisibleRangeChanged = (s, e) => events.push([s, e]);
    // Several scroll positions — the rendered window must never contain a
    // hidden line, whether it is above, straddling or below the fold.
    for (const st of [0, 40, 120, 200]) {
      vl.onScroll(st, 400);
      const nums = vl.getRenderedLines().map((l) => l.lineNumber);
      expect(nums).not.toContain(4);
      expect(nums).not.toContain(5);
      expect(nums).not.toContain(6);
    }
    expect(events.length).toBeGreaterThan(0);
  });

  test("unfolding restores the full line set", () => {
    const { vl } = makeViewLines(6);
    vl.setHiddenLines(new Set([2]));
    vl.rebuildAll();
    expect(vl.getVisibleLineCount()).toBe(5);
    vl.setHiddenLines(null);
    vl.rebuildAll();
    expect(vl.getVisibleLineCount()).toBe(6);
    const nums = vl.getRenderedLines().map((l) => l.lineNumber).sort((a, b) => a - b);
    expect(nums).toEqual([1, 2, 3, 4, 5, 6]);
  });

  test("wrapped mode: a hidden model line contributes zero view lines", () => {
    const viewport = makeViewport();
    const vl = new ViewLines(viewport, { lineHeight: LINE_HEIGHT, tabSize: 4 });
    vl.setTotalLineCount(5);
    vl.lineContentProvider = {
      getLineContent: (line) => (line === 2 ? "x".repeat(300) : "abc"),
      getLineTokens: () => null,
      tabSize: 4,
    };
    vl.setWordWrap(true, 80);
    // Line 2 wraps into 4 segments: total = 1+4+1+1+1 = 8 view lines.
    expect(vl.getViewLineCount()).toBe(8);
    vl.setHiddenLines(new Set([2]));
    // Hiding line 2 removes its segments: total = 1+0+1+1+1 = 4.
    expect(vl.getVisibleLineCount()).toBe(4);
    expect(vl.getViewLineCount()).toBe(4);
  });
});
