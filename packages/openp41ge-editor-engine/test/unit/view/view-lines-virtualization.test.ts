// @ts-nocheck
/**
 * ViewLines word-wrap virtualization tests (Phase 2 of the
 * large-file-performance plan).
 *
 * Acceptance criteria pinned here:
 *   - wrapped mode renders ONLY the visible view-line window (+ over-render),
 *     never thousands of static nodes
 *   - scrolling moves the rendered window, keeping the node count bounded
 *   - view-line-keyed rendering is consistent with the model↔view mapping
 *   - model-space accessors/events (startLineNumber, onVisibleRangeChanged)
 *     stay correct while the DOM is virtualized
 *   - toggling word wrap off restores the non-wrapped window
 */
import { describe, test, expect, beforeEach, vi } from "vitest";
import { ViewLines } from "../../../src/view/view-lines";
import { computeWrapSegments } from "../../../src/view/word-wrap-helper";

const LINE_HEIGHT = 20;
const WRAP = 40;

/** 100 model lines, each wrapping into exactly 5 view lines (200 cols @ 40). */
const MODEL_LINES = 100;
const LINE_TEXT = "x".repeat(200);
const SEGMENTS_PER_LINE = computeWrapSegments(LINE_TEXT, WRAP).length; // 5
const TOTAL_VIEW_LINES = MODEL_LINES * SEGMENTS_PER_LINE;

function makeViewport(height = 400) {
  const el = document.createElement("div");
  el.className = "fe-viewport";
  Object.defineProperty(el, "clientHeight", { value: height, configurable: true });
  document.body.appendChild(el);
  return el;
}

function makeViewLines(opts) {
  const viewport = opts?.viewportEl ?? makeViewport(opts?.height ?? 400);
  const vl = new ViewLines(viewport, { lineHeight: LINE_HEIGHT, tabSize: 4 });
  vl.setTotalLineCount(MODEL_LINES);
  vl.lineContentProvider = {
    getLineContent: (line) => LINE_TEXT,
    getLineTokens: () => null,
    tabSize: 4,
  };
  return { viewport, vl };
}

const expectedModelLine = (viewLine: number): number => Math.ceil(viewLine / SEGMENTS_PER_LINE);

describe("ViewLines word-wrap virtualization", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  test("wrapped mode renders ONLY the visible window, not all view lines", () => {
    const { viewport, vl } = makeViewLines();
    vl.setWordWrap(true, WRAP);
    vl.rebuildAll();

    // Document has 500 view lines — but the DOM must hold ~the viewport only.
    expect(vl.getViewLineCount()).toBe(TOTAL_VIEW_LINES);
    expect(vl.renderedLineCount).toBeGreaterThan(0);
    expect(vl.renderedLineCount).toBeLessThan(40); // ~23 lines, not 500
    expect(vl.renderedLineCount).toBeLessThan(TOTAL_VIEW_LINES / 10);
    expect(viewport.querySelectorAll(".view-line").length).toBe(vl.renderedLineCount);
    expect(vl.wrappedStartViewLine).toBe(1);
  });

  test("scrolling in wrapped mode moves the rendered window and keeps nodes bounded", () => {
    const { viewport, vl } = makeViewLines();
    vl.setWordWrap(true, WRAP);
    vl.rebuildAll();
    expect(vl.renderedLineCount).toBeLessThan(40);

    // Scroll to view line ~100.
    const scrollTop = 100 * LINE_HEIGHT;
    vl.onScroll(scrollTop, 400);

    expect(vl.wrappedStartViewLine).toBeGreaterThan(90);
    expect(vl.wrappedStartViewLine).toBeLessThanOrEqual(101);
    expect(vl.renderedLineCount).toBeLessThan(40); // still bounded
    expect(viewport.querySelectorAll(".view-line").length).toBe(vl.renderedLineCount);

    // The first rendered ViewLine is keyed by its VIEW line number.
    const first = vl.getRenderedLines()[0];
    expect(first.lineNumber).toBe(vl.wrappedStartViewLine);
  });

  test("rendered wrapped content matches the model/segment at the window", () => {
    const { viewport, vl } = makeViewLines();
    vl.setWordWrap(true, WRAP);
    vl.rebuildAll();
    vl.onScroll(200 * LINE_HEIGHT, 400); // near view line 200

    const first = vl.getRenderedLines()[0];
    const modelLine = expectedModelLine(first.lineNumber);
    const segIndex = (first.lineNumber - 1) % SEGMENTS_PER_LINE;
    const expectedText = computeWrapSegments(LINE_TEXT, WRAP)[segIndex].text;
    expect(first.domNode.element.textContent).toContain(expectedText);
    expect(viewport.querySelectorAll(".view-line").length).toBe(vl.renderedLineCount);
  });

  test("model-space accessors translate the wrapped window (gutter contract)", () => {
    const { vl } = makeViewLines();
    vl.setWordWrap(true, WRAP);
    vl.rebuildAll();
    vl.onScroll(100 * LINE_HEIGHT, 400);

    const startModel = expectedModelLine(vl.wrappedStartViewLine);
    const endModel = expectedModelLine(vl.wrappedEndViewLine);
    expect(vl.startLineNumber).toBe(startModel);
    expect(vl.endLineNumber).toBe(endModel);
    expect(vl.startLineNumber).toBeGreaterThanOrEqual(1);
    expect(vl.endLineNumber).toBeGreaterThanOrEqual(vl.startLineNumber);
  });

  test("onVisibleRangeChanged fires with model-space range in wrapped mode", () => {
    const { vl } = makeViewLines();
    const listener = vi.fn();
    vl.onVisibleRangeChanged = listener;
    vl.setWordWrap(true, WRAP);
    vl.rebuildAll();

    expect(listener).toHaveBeenCalled();
    const [modelStart, modelEnd] = listener.mock.calls.at(-1);
    expect(Number.isInteger(modelStart)).toBe(true);
    expect(Number.isInteger(modelEnd)).toBe(true);
    expect(modelStart).toBeGreaterThanOrEqual(1);
    expect(modelEnd).toBeGreaterThanOrEqual(modelStart);
  });

  test("toggling word wrap off restores the non-wrapped window", () => {
    const { viewport, vl } = makeViewLines();
    vl.setWordWrap(true, WRAP);
    vl.rebuildAll();
    expect(vl.renderedLineCount).toBeLessThan(40);

    vl.setWordWrap(false);
    vl.rebuildAll();
    expect(vl.getViewLineCount()).toBe(MODEL_LINES);
    if (vl.renderedLineCount > 0) {
      expect(vl.renderedLineCount).toBeLessThanOrEqual(100);
      expect(viewport.querySelectorAll(".view-line").length).toBe(vl.renderedLineCount);
    }
  });

  test("empty wrapped document renders nothing", () => {
    const { vl } = makeViewLines();
    vl.setTotalLineCount(0);
    vl.setWordWrap(true, WRAP);
    vl.rebuildAll();
    expect(vl.getViewLineCount()).toBe(0);
    expect(vl.renderedLineCount).toBe(0);
  });

  test("getViewLine resolves by view line number inside the wrapped window", () => {
    const { vl } = makeViewLines();
    vl.setWordWrap(true, WRAP);
    vl.rebuildAll();
    const firstViewLine = vl.wrappedStartViewLine;
    expect(vl.getViewLine(firstViewLine)).toBeDefined();
    expect(vl.getViewLine(firstViewLine).lineNumber).toBe(firstViewLine);
    // A view line far outside the rendered window is not materialized.
    expect(vl.getViewLine(480)).toBeUndefined();
  });

  test("clearContentCache invalidates the wrap mapping after content changes", () => {
    const { vl } = makeViewLines();
    vl.setWordWrap(true, WRAP);
    vl.rebuildAll();
    expect(vl.getViewLineCount()).toBe(TOTAL_VIEW_LINES); // 500

    // Every line becomes 5 chars — one wrap segment each.
    vl.lineContentProvider = {
      getLineContent: () => "short",
      getLineTokens: () => null,
      tabSize: 4,
    };
    vl.setTotalLineCount(MODEL_LINES);
    vl.clearContentCache(); // must reset the stale wrap mapping
    vl.refresh();

    expect(vl.getViewLineCount()).toBe(MODEL_LINES); // 100 view lines now
    // The visible window resolves against the NEW mapping.
    expect(vl.getViewLine(vl.wrappedStartViewLine)).toBeDefined();
  });
});
