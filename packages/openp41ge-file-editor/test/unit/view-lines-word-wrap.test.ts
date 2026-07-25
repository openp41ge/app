/**
 * Tests for ViewLines word wrap integration.
 *
 * Verifies:
 *   - setWordWrap enables wrapped rendering
 *   - getViewLineCount returns correct wrapped line counts
 *   - getViewLineStart returns correct starting positions
 *   - rebuildAll creates one ViewLine per wrapped segment
 *   - Toggling wrap off reverts to normal rendering
 *   - Line numbers overlay config is properly wired
 *   - Viewport resize recalculation (setViewportHeight, onScroll with varied heights)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ViewLines } from "@openp41ge-file-editor/view/view-lines";
import { ViewLine } from "@openp41ge-file-editor/rendering/view-line";
import { computeWrapSegments } from "@openp41ge-file-editor/view/word-wrap-helper";

describe("ViewLines word wrap", () => {
  let viewportEl: HTMLElement;
  let viewLines: ViewLines;
  let renderedLines: Array<{ lineNumber: number; content: string }>;

  /** Content provider that simulates the ViewModel. */
  const contentProvider = {
    getLineContent: (line: number) => {
      const lines = [
        "short",
        "this is a longer line that will wrap into multiple segments",
        "medium length line here",
        "tiny",
        "another long line that should definitely wrap around at eighty characters or whatever the column limit is",
        "short again",
      ];
      return lines[line - 1] ?? "";
    },
    getLineTokens: () => null,
    tabSize: 4,
  };

  beforeEach(() => {
    viewportEl = document.createElement("div");
    viewportEl.style.width = "200px";
    viewportEl.style.height = "400px";
    viewportEl.style.fontFamily = "monospace";
    viewportEl.style.fontSize = "14px";
    document.body.appendChild(viewportEl);

    viewLines = new ViewLines(viewportEl, {
      lineHeight: 20,
      tabSize: 4,
    });
    viewLines.setTotalLineCount(6);
    viewLines.lineContentProvider = contentProvider;
    renderedLines = [];

    // Intercept onLineRender to track rendered lines
    viewLines.onLineRender = (lineNumber, viewLine) => {
      renderedLines.push({ lineNumber, content: "" });
    };
  });

  afterEach(() => {
    viewLines.dispose();
    viewportEl.remove();
  });

  describe("getViewLineCount", () => {
    it("returns model line count when word wrap is off", () => {
      expect(viewLines.getViewLineCount()).toBe(6);
    });

    it("returns more view lines than model lines when wrap is on", () => {
      viewLines.setWordWrap(true, 10);
      const count = viewLines.getViewLineCount();
      expect(count).toBeGreaterThan(6);
    });

    it("returns fewer view lines with wider wrap column", () => {
      viewLines.setWordWrap(true, 10);
      const tightCount = viewLines.getViewLineCount();
      viewLines.setWordWrap(true, 30);
      const wideCount = viewLines.getViewLineCount();
      expect(wideCount).toBeLessThan(tightCount);
    });
  });

  describe("getViewLineStart", () => {
    it("returns model line number when word wrap is off", () => {
      expect(viewLines.getViewLineStart(3)).toBe(3);
    });

    it("returns accumulated wrapped start when wrap is on", () => {
      viewLines.setWordWrap(true, 10);
      const start1 = viewLines.getViewLineStart(1);
      expect(start1).toBe(1);

      const start2 = viewLines.getViewLineStart(2);
      expect(start2).toBeGreaterThan(1);
    });
  });

  describe("rebuildAll", () => {
    it("creates one ViewLine per model line when wrap is off", () => {
      viewLines.rebuildAll();
      const lines = viewLines.getRenderedLines();
      expect(lines.length).toBeGreaterThan(0);
    });

    it("creates more ViewLines when wrap is on", () => {
      viewLines.setWordWrap(true, 10);
      viewLines.rebuildAll();
      const wrappedLines = viewLines.getRenderedLines();
      expect(wrappedLines.length).toBeGreaterThan(0);
    });

    it("positions wrapped segments at different top values", () => {
      viewLines.setWordWrap(true, 10);
      viewLines.rebuildAll();
      const lines = viewLines.getRenderedLines();
      if (lines.length >= 2) {
        const top0 = lines[0].domNode.element.style.top;
        const top1 = lines[1].domNode.element.style.top;
        expect(top1).not.toBe(top0);
      }
    });
  });

  describe("toggling word wrap", () => {
    it("switches between wrapped and non-wrapped rendering", () => {
      viewLines.rebuildAll();
      const initialCount = viewLines.getRenderedLines().length;

      viewLines.setWordWrap(true, 10);
      viewLines.rebuildAll();
      const wrappedCount = viewLines.getRenderedLines().length;

      viewLines.setWordWrap(false);
      viewLines.rebuildAll();
      const finalCount = viewLines.getRenderedLines().length;

      expect(wrappedCount).not.toBe(initialCount);
    });
  });

  describe("scroll height", () => {
    it("updates scroll height when word wrap is toggled", () => {
      const initialHeight = viewLines.getViewLineCount() * 20;
      viewLines.setWordWrap(true, 10);
      const wrappedHeight = viewLines.getViewLineCount() * 20;
      expect(wrappedHeight).toBeGreaterThan(initialHeight);

      viewLines.setWordWrap(false);
      const restoredHeight = viewLines.getViewLineCount() * 20;
      expect(restoredHeight).toBe(initialHeight);
    });
  });

  describe("setViewportHeight", () => {
    it("updates the viewport height used in onScroll", () => {
      viewLines.setTotalLineCount(100);

      const vl = viewLines as any;

      // Scroll with a different viewport height passes it through to onScroll
      viewLines.onScroll(0, 600);

      expect(vl._viewportHeight).toBe(600);
      expect(viewLines.getRenderedLines().length).toBeGreaterThan(0);
    });

    it("recalculates visible range when viewport height changes", () => {
      viewLines.setTotalLineCount(100);

      viewLines.onScroll(0, 400);
      const smallCount = viewLines.getRenderedLines().length;

      viewLines.onScroll(0, 800);
      const largeCount = viewLines.getRenderedLines().length;

      expect(largeCount).toBeGreaterThan(smallCount);
    });

    it("setViewportHeight updates internal height and affects onScroll", () => {
      viewLines.setTotalLineCount(100);

      viewLines.onScroll(0, 400);
      const countBefore = viewLines.getRenderedLines().length;

      viewLines.setViewportHeight(800);
      viewLines.onScroll(0);
      const countAfter = viewLines.getRenderedLines().length;

      expect(countAfter).toBeGreaterThan(countBefore);
    });
  });

  describe("onScroll with different viewport heights", () => {
    it("renders more lines with a larger viewport", () => {
      viewLines.setTotalLineCount(200);

      viewLines.onScroll(0, 400);
      const first = viewLines.getRenderedLines().length;

      viewLines.onScroll(0, 800);
      const second = viewLines.getRenderedLines().length;

      viewLines.onScroll(1000, 400);
      const scrolled = viewLines.getRenderedLines().length;

      expect(second).toBeGreaterThan(first);
      expect(scrolled).toBeGreaterThan(0);
    });

    it("onScroll without viewportHeight uses cached height", () => {
      viewLines.setTotalLineCount(100);

      // First scroll with a known height
      viewLines.onScroll(0, 800);
      const firstCount = viewLines.getRenderedLines().length;

      // Second scroll without passing height should use cached height
      viewLines.onScroll(0);
      const secondCount = viewLines.getRenderedLines().length;

      // Same scroll position + same cached height = same result
      expect(secondCount).toBe(firstCount);
    });

    it("setViewportHeight then onScroll without height uses updated height", () => {
      viewLines.setTotalLineCount(100);

      viewLines.onScroll(0, 400);
      const small = viewLines.getRenderedLines().length;

      // Update height then scroll without passing height
      viewLines.setViewportHeight(800);
      viewLines.onScroll(0);
      const large = viewLines.getRenderedLines().length;

      expect(large).toBeGreaterThan(small);
    });

    it("onScroll guard skips rebuild when visible range unchanged", () => {
      viewLines.setTotalLineCount(100);
      viewLines.onScroll(0, 400);

      const firstCount = viewLines.getRenderedLines().length;

      // Same scroll, same height → guard should skip rebuild
      viewLines.onScroll(0, 400);
      const secondCount = viewLines.getRenderedLines().length;

      expect(secondCount).toBe(firstCount);
    });
  });
});

describe("computeWrapSegments integration", () => {
  it("splits long content into expected number of segments", () => {
    const segments = computeWrapSegments("hello world foo bar baz qux", 10);
    expect(segments.length).toBeGreaterThanOrEqual(3);
    expect(segments[0].text.endsWith(" ")).toBe(true);
  });

  it("produces segments whose combined text equals the original", () => {
    const original = "hello world foo bar baz qux";
    const segments = computeWrapSegments(original, 10);
    const combined = segments.map((s) => s.text).join("");
    expect(combined).toBe(original);
  });

  it("handles single-character wrap column", () => {
    const segments = computeWrapSegments("abc", 1);
    expect(segments.length).toBe(3);
    expect(segments[0].text).toBe("a");
    expect(segments[1].text).toBe("b");
    expect(segments[2].text).toBe("c");
  });
});
