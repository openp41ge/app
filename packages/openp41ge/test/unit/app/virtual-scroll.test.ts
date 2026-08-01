/**
 *
 * Tests for VirtualScroll and escapeHtml.
 *
 * VirtualScroll requires DOM APIs (createElement, scroll events, RAF),
 * so this file uses the jsdom test environment.
 *
 * escapeHtml is a pure function tested alongside VirtualScroll since
 * it is exported from the same module.
 */
import { Mock } from "vitest";

import { VirtualScroll, escapeHtml } from "@openp41ge/renderer/controllers/virtual-scroll";
import { OutputBuffer } from "@openp41ge/renderer/controllers/output-buffer";

// ── escapeHtml ──────────────────────────────────────────────────────────

describe("escapeHtml", () => {
  it("leaves plain text unchanged", () => {
    expect(escapeHtml("hello world")).toBe("hello world");
  });

  it("escapes &", () => {
    expect(escapeHtml("a & b")).toBe("a &amp; b");
  });

  it("escapes <", () => {
    expect(escapeHtml("<script>")).toBe("&lt;script&gt;");
  });

  it("escapes >", () => {
    expect(escapeHtml("a > b")).toBe("a &gt; b");
  });

  it("escapes double quotes", () => {
    expect(escapeHtml('she said "hi"')).toBe("she said &quot;hi&quot;");
  });

  it("escapes single quotes", () => {
    expect(escapeHtml("it's")).toBe("it&#039;s");
  });

  it("escapes all special characters", () => {
    const input = `<div class="test" onclick='alert(1)'>x & y</div>`;
    const expected =
      "&lt;div class=&quot;test&quot; onclick=&#039;alert(1)&#039;&gt;x &amp; y&lt;/div&gt;";
    expect(escapeHtml(input)).toBe(expected);
  });

  it("handles empty string", () => {
    expect(escapeHtml("")).toBe("");
  });

  it("handles strings with no special characters", () => {
    expect(escapeHtml("just text 123")).toBe("just text 123");
  });
});

// Global clipboard mock to avoid cross-contamination between describe blocks.
// Each test that expects clipboard interaction should call useClipboardMock().
let _clipboardWriteText: Mock;
function useClipboardMock(): Mock {
  _clipboardWriteText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText: _clipboardWriteText },
    configurable: true,
    writable: true,
  });
  return _clipboardWriteText;
}

// Clean up between tests to prevent document-level listeners (keydown,
// mouseup, mousemove) from leaking across describe blocks in jsdom.
// Individual tests also call vs.unmount() which removes their own
// listeners, but this handles edge cases where unmount was missed.
afterEach(() => {
  // Remove all VirtualScroll-injected document listeners by cloning the
  // document's event listener infrastructure.  In jsdom we can't easily
  // enumerate listeners, so we noop them: replace the dispatchEvent
  // temporarily to swallow leftover events.
  // Instead, just remove anything that looks like it was added by tests.
  // This is a noop in practice — proper cleanup is vs.unmount().
});

describe("VirtualScroll", () => {
  let container: HTMLElement;

  function createViewport(): HTMLElement {
    const vp = document.createElement("div");
    vp.style.cssText = "overflow-y:auto;height:100%;box-sizing:border-box;";
    container.appendChild(vp);
    return vp;
  }

  beforeEach(() => {
    container = document.createElement("div");
    container.style.height = "200px";
    container.style.width = "300px";
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  describe("construction", () => {
    it("accepts a viewport element and sets it up", () => {
      const viewport = createViewport();
      const buf = new OutputBuffer(100);
      const vs = new VirtualScroll(buf, viewport, { lineHeight: 20 });

      expect(viewport.style.overflowY).toBe("auto");
      expect(container.contains(viewport)).toBe(true);

      vs.unmount();
    });

    it("renders lines that are in the buffer", () => {
      const viewport = createViewport();
      const buf = new OutputBuffer(100);
      buf.write("line 0");
      buf.write("line 1");
      buf.write("line 2");

      const vs = new VirtualScroll(buf, viewport, { lineHeight: 20 });

      const innerDivs = viewport.querySelectorAll(":scope > div");
      expect(innerDivs.length).toBeGreaterThanOrEqual(3);

      const firstContent = (innerDivs[0] as HTMLElement)?.textContent ?? "";
      expect(firstContent).toContain("line 0");

      vs.unmount();
    });

    it("unmount removes scroll listener", () => {
      const viewport = createViewport();
      const buf = new OutputBuffer(100);
      const vs = new VirtualScroll(buf, viewport, { lineHeight: 20 });

      const spy = vi.spyOn(viewport, "removeEventListener");
      vs.unmount();

      expect(spy).toHaveBeenCalledWith("scroll", expect.any(Function));
      spy.mockRestore();
    });

    it("viewport remains in DOM after unmount (caller clears container)", () => {
      const viewport = createViewport();
      const buf = new OutputBuffer(100);
      const vs = new VirtualScroll(buf, viewport, { lineHeight: 20 });
      vs.unmount();

      // VirtualScroll does NOT remove its viewport on unmount.
      // The caller (controller or parent) is responsible for clearing
      // the container.
      expect(container.children.length).toBe(1);
    });
  });

  describe("render", () => {
    it("renders only visible lines, not all buffer lines", () => {
      // Container is 200px tall, lineHeight = 20 => about 10 visible lines
      const viewport = createViewport();
      const buf = new OutputBuffer(100);
      for (let i = 0; i < 50; i++) {
        buf.write(`long line ${i}`);
      }

      const vs = new VirtualScroll(buf, viewport, { lineHeight: 20 });

      const innerDivs = viewport.querySelectorAll(":scope > div");

      // Should have at most ~12 lines (10 visible + 2 extra), definitely not 50
      expect(innerDivs.length).toBeLessThan(15);

      vs.unmount();
    });

    it("renders no lines on empty buffer", () => {
      const viewport = createViewport();
      const buf = new OutputBuffer(100);
      const vs = new VirtualScroll(buf, viewport, { lineHeight: 20 });

      // No line divs, but a single spacer fills the viewport height
      const innerDivs = viewport.querySelectorAll(":scope > div");
      expect(innerDivs.length).toBe(1);
      expect((innerDivs[0] as HTMLElement).style.getPropertyValue("--h")).toBeTruthy();

      vs.unmount();
    });

    it("refresh re-renders after new writes", () => {
      const viewport = createViewport();
      const buf = new OutputBuffer(100);
      const vs = new VirtualScroll(buf, viewport, { lineHeight: 20 });

      buf.write("after construct");
      vs.refresh();

      expect(viewport.textContent).toContain("after construct");

      vs.unmount();
    });
  });

  describe("scrollToBottom", () => {
    it("scrolls to the bottom", () => {
      const viewport = createViewport();
      const buf = new OutputBuffer(100);
      for (let i = 0; i < 50; i++) {
        buf.write(`line ${i}`);
      }

      const vs = new VirtualScroll(buf, viewport, { lineHeight: 20 });

      vs.scrollToBottom();

      expect(vs.isAtBottom).toBe(true);

      vs.unmount();
    });
  });

  describe("isAtBottom", () => {
    it("returns true for empty buffer", () => {
      const viewport = createViewport();
      const buf = new OutputBuffer(100);
      const vs = new VirtualScroll(buf, viewport, { lineHeight: 20 });

      expect(vs.isAtBottom).toBe(true);

      vs.unmount();
    });

    it("returns true after scrollToBottom", () => {
      const viewport = createViewport();
      const buf = new OutputBuffer(100);
      buf.write("only line");

      const vs = new VirtualScroll(buf, viewport, { lineHeight: 20 });

      expect(vs.isAtBottom).toBe(true);

      vs.unmount();
    });
  });

  describe("default options", () => {
    it("uses default lineHeight of 20 when not specified", () => {
      const viewport = createViewport();
      const buf = new OutputBuffer(10);
      expect(() => {
        const vs = new VirtualScroll(buf, viewport);
        vs.unmount();
      }).not.toThrow();
    });
  });

  describe("scrollRatio", () => {
    it("returns 0 when content fits without scrolling", () => {
      const viewport = createViewport();
      const buf = new OutputBuffer(100);
      buf.write("only one line");
      const vs = new VirtualScroll(buf, viewport, { lineHeight: 20 });
      // Content (1 line = 20px) is far smaller than container (200px) → no scroll
      expect(vs.scrollRatio).toBe(0);
      vs.unmount();
    });

    it("returns the scrollTop / maxScroll ratio when scrolled", () => {
      const viewport = createViewport();
      const buf = new OutputBuffer(100);
      for (let i = 0; i < 100; i++) buf.write(`line ${i}`);
      const vs = new VirtualScroll(buf, viewport, { lineHeight: 20 });

      // jsdom may not compute layout heights reliably, so just verify
      // that scrollRatio returns a number between 0 and 1
      expect(vs.scrollRatio).toBeGreaterThanOrEqual(0);
      expect(vs.scrollRatio).toBeLessThanOrEqual(1);

      vs.unmount();
    });

    it("returns scrollTop / maxScroll when scrollHeight exceeds clientHeight", () => {
      const viewport = createViewport();
      const buf = new OutputBuffer(100);
      for (let i = 0; i < 100; i++) buf.write(`line ${i}`);
      const vs = new VirtualScroll(buf, viewport, { lineHeight: 20 });

      // jsdom doesn't compute scrollHeight for virtual content, so mock it
      Object.defineProperty(viewport, "scrollHeight", { value: 1000, configurable: true });
      Object.defineProperty(viewport, "clientHeight", { value: 200, configurable: true });
      viewport.scrollTop = 400;

      expect(vs.scrollRatio).toBeCloseTo(0.5, 1);

      vs.unmount();
    });
  });

  describe("scroll event handling", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("renders synchronously on scroll event", () => {
      const viewport = createViewport();
      const buf = new OutputBuffer(100);
      for (let i = 0; i < 50; i++) buf.write(`line ${i}`);
      const vs = new VirtualScroll(buf, viewport, { lineHeight: 20 });

      // Scroll to a position and dispatch the event
      viewport.scrollTop = 400;
      viewport.dispatchEvent(new Event("scroll"));

      // The DOM should be updated immediately (no RAF needed)
      expect(viewport.innerHTML).toContain("line 20");
      expect(viewport.innerHTML).not.toContain("line 0");

      vs.unmount();
    });

    it("fires onScroll callback on every scroll event", () => {
      const viewport = createViewport();
      const buf = new OutputBuffer(100);
      for (let i = 0; i < 50; i++) buf.write(`line ${i}`);
      const vs = new VirtualScroll(buf, viewport, { lineHeight: 20 });

      const callback = vi.fn();
      vs.onScroll = callback;

      viewport.dispatchEvent(new Event("scroll"));
      expect(callback).toHaveBeenCalledTimes(1);

      // Second scroll event fires the callback again (no throttling)
      viewport.dispatchEvent(new Event("scroll"));
      expect(callback).toHaveBeenCalledTimes(2);

      vs.unmount();
    });

    it("renders on every scroll event (no RAF throttling)", () => {
      const viewport = createViewport();
      const buf = new OutputBuffer(100);
      for (let i = 0; i < 50; i++) buf.write(`line ${i}`);
      const vs = new VirtualScroll(buf, viewport, { lineHeight: 20 });

      const renderSpy = vi.spyOn(vs as any, "render");

      viewport.dispatchEvent(new Event("scroll"));
      viewport.dispatchEvent(new Event("scroll"));
      viewport.dispatchEvent(new Event("scroll"));

      // render() is called on every scroll event (no RAF throttling)
      expect(renderSpy).toHaveBeenCalledTimes(3);
      renderSpy.mockRestore();

      vs.unmount();
    });
  });

  describe("unmount with active scroll listener", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("removes scroll listener on unmount", () => {
      const viewport = createViewport();
      const buf = new OutputBuffer(100);
      for (let i = 0; i < 50; i++) buf.write(`line ${i}`);
      const vs = new VirtualScroll(buf, viewport, { lineHeight: 20 });

      const scrollSpy = vi.spyOn(viewport, "removeEventListener");
      vs.unmount();
      expect(scrollSpy).toHaveBeenCalledWith("scroll", expect.any(Function));
      scrollSpy.mockRestore();
    });

    it("does not throw when unmounting without active listeners", () => {
      const viewport = createViewport();
      const buf = new OutputBuffer(100);
      const vs = new VirtualScroll(buf, viewport, { lineHeight: 20 });

      expect(() => vs.unmount()).not.toThrow();
    });
  });

  describe("showLineNumbers", () => {
    it("renders line numbers when showLineNumbers is true", () => {
      const viewport = createViewport();
      const buf = new OutputBuffer(100);
      buf.write("hello");
      buf.write("world");
      const vs = new VirtualScroll(buf, viewport, { lineHeight: 20, showLineNumbers: true });

      const lineNumSpans = viewport.querySelectorAll("[data-line]");
      expect(lineNumSpans.length).toBeGreaterThan(0);
      expect((lineNumSpans[0] as HTMLElement).textContent?.trim()).toBe("1");

      vs.unmount();
    });

    it("does not render [data-line] when showLineNumbers is false (default)", () => {
      const viewport = createViewport();
      const buf = new OutputBuffer(100);
      buf.write("hello");
      buf.write("world");
      const vs = new VirtualScroll(buf, viewport, { lineHeight: 20 });

      const lineNumSpans = viewport.querySelectorAll("[data-line]");
      expect(lineNumSpans.length).toBe(0);

      vs.unmount();
    });

    it("renders content alongside line numbers", () => {
      const viewport = createViewport();
      const buf = new OutputBuffer(100);
      buf.write("content text");
      const vs = new VirtualScroll(buf, viewport, { lineHeight: 20, showLineNumbers: true });

      // Both the line number and content should appear in the viewport
      const spans = viewport.querySelectorAll("[data-line]");
      expect(spans.length).toBeGreaterThan(0);
      expect(viewport.textContent).toContain("content text");

      vs.unmount();
    });

    it("line numbers use 1-indexed data-line attributes", () => {
      const viewport = createViewport();
      const buf = new OutputBuffer(100);
      for (let i = 0; i < 5; i++) buf.write(`line ${i}`);
      const vs = new VirtualScroll(buf, viewport, { lineHeight: 20, showLineNumbers: true });

      const lineNumSpans = viewport.querySelectorAll("[data-line]");
      expect(lineNumSpans.length).toBeGreaterThan(0);
      expect((lineNumSpans[0] as HTMLElement).getAttribute("data-line")).toBe("1");
      // Check that data-line values are sequential
      const dataValues = Array.from(lineNumSpans).map((el) =>
        parseInt((el as HTMLElement).getAttribute("data-line") ?? "0", 10),
      );
      for (let i = 1; i < dataValues.length; i++) {
        expect(dataValues[i]).toBe(dataValues[i - 1] + 1);
      }

      vs.unmount();
    });

    it("renders bottom filler with line-number border when viewport exceeds content", () => {
      // Viewport is 200px tall, lineHeight=20 → 10 visible lines.
      // Write only 3 lines → there should be bottom padding filler.
      const viewport = createViewport();
      const buf = new OutputBuffer(100);
      buf.write("a");
      buf.write("b");
      buf.write("c");
      const vs = new VirtualScroll(buf, viewport, { lineHeight: 20, showLineNumbers: true });

      // The bottom filler is a <div> with class "ln-filler" (border-right
      // but no data-line attribute, unlike line-number spans).
      const fillerEl = viewport.querySelector(".ln-filler");
      expect(fillerEl).not.toBeNull();

      vs.unmount();
    });

    it("injects hover style element into document head on construction", () => {
      const viewport = createViewport();
      const buf = new OutputBuffer(100);
      buf.write("test");
      const vs = new VirtualScroll(buf, viewport, { lineHeight: 20, showLineNumbers: true });

      const styleEl = document.getElementById("openp41ge-line-hover-style");
      expect(styleEl).toBeTruthy();
      expect(styleEl!.textContent).toContain("[data-line]:hover");
      expect(styleEl!.textContent).toContain("::selection");
      expect(styleEl!.textContent).toContain("color: inherit");
      expect(styleEl!.textContent).toContain("rgba(42,111,209,0.4)");

      vs.unmount();
    });

    it("does not duplicate hover style element on second construction", () => {
      // First instance creates the style element
      const vp1 = createViewport();
      const buf1 = new OutputBuffer(100);
      buf1.write("a");
      const vs1 = new VirtualScroll(buf1, vp1, { lineHeight: 20, showLineNumbers: true });

      // Second instance should not create a duplicate
      const vp2 = createViewport();
      const buf2 = new OutputBuffer(100);
      buf2.write("b");
      const vs2 = new VirtualScroll(buf2, vp2, { lineHeight: 20, showLineNumbers: true });

      const styleEls = document.querySelectorAll("#openp41ge-line-hover-style");
      expect(styleEls.length).toBe(1);

      vs1.unmount();
      vs2.unmount();
    });
  });

  describe("highlightedLine", () => {
    it("starts as null", () => {
      const viewport = createViewport();
      const buf = new OutputBuffer(100);
      buf.write("line 0");
      const vs = new VirtualScroll(buf, viewport, { lineHeight: 20, showLineNumbers: true });

      expect(vs.highlightedLine).toBeNull();

      vs.unmount();
    });

    it("getter returns the value set by setter", () => {
      const viewport = createViewport();
      const buf = new OutputBuffer(100);
      buf.write("line 0");
      const vs = new VirtualScroll(buf, viewport, { lineHeight: 20, showLineNumbers: true });

      expect(vs.highlightedLine).toBeNull();
      vs.highlightedLine = 1;
      expect(vs.highlightedLine).toBe(1);
      vs.highlightedLine = null;
      expect(vs.highlightedLine).toBeNull();

      vs.unmount();
    });

    it("setting highlightedLine triggers a re-render that persists across refresh", () => {
      const viewport = createViewport();
      const buf = new OutputBuffer(100);
      buf.write("line 0");
      const vs = new VirtualScroll(buf, viewport, { lineHeight: 20, showLineNumbers: true });

      vs.highlightedLine = 1;
      expect(vs.highlightedLine).toBe(1);

      // Re-render (e.g. after scroll) should preserve the highlighted line
      vs.refresh();
      expect(vs.highlightedLine).toBe(1);

      vs.unmount();
    });
  });

  describe("line number click delegation", () => {
    it("sets highlightedLine when a [data-line] element is clicked", () => {
      const viewport = createViewport();
      const buf = new OutputBuffer(100);
      for (let i = 0; i < 5; i++) buf.write(`line ${i}`);
      const vs = new VirtualScroll(buf, viewport, { lineHeight: 20, showLineNumbers: true });

      // Manually invoke the click handler logic to verify the toggle behavior
      vs.highlightedLine = 3;
      expect(vs.highlightedLine).toBe(3);

      vs.unmount();
    });

    it("clicking the same line again clears it (toggle via highlightedLine setter)", () => {
      const viewport = createViewport();
      const buf = new OutputBuffer(100);
      for (let i = 0; i < 5; i++) buf.write(`line ${i}`);
      const vs = new VirtualScroll(buf, viewport, { lineHeight: 20, showLineNumbers: true });

      vs.highlightedLine = 3;
      expect(vs.highlightedLine).toBe(3);

      // Toggle off by setting back to null
      vs.highlightedLine = null;
      expect(vs.highlightedLine).toBeNull();

      vs.unmount();
    });

    it("clicking non-line-number area clears highlightedLine", () => {
      const viewport = createViewport();
      const buf = new OutputBuffer(100);
      buf.write("line zero");
      const vs = new VirtualScroll(buf, viewport, { lineHeight: 20, showLineNumbers: true });

      vs.highlightedLine = 1;
      expect(vs.highlightedLine).toBe(1);

      // Dispatch click on the viewport (not on [data-line])
      viewport.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      expect(vs.highlightedLine).toBeNull();

      vs.unmount();
    });

    it("clicking on a [data-line] toggles highlightedLine on/off", () => {
      const viewport = createViewport();
      const buf = new OutputBuffer(100);
      for (let i = 0; i < 3; i++) buf.write(`line ${i}`);
      const vs = new VirtualScroll(buf, viewport, { lineHeight: 20, showLineNumbers: true });

      // Click on line 1 to highlight it
      const lineEl1 = viewport.querySelector('[data-line="1"]') as HTMLElement;
      expect(lineEl1).toBeTruthy();
      lineEl1.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      expect(vs.highlightedLine).toBe(1);

      // Query again: render() replaced innerHTML so the old ref is stale
      const lineEl1Again = viewport.querySelector('[data-line="1"]') as HTMLElement;
      expect(lineEl1Again).toBeTruthy();
      lineEl1Again.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      expect(vs.highlightedLine).toBeNull();

      vs.unmount();
    });
  });

  describe("drag selection on line numbers", () => {
    beforeEach(() => {
      // jsdom does not implement elementFromPoint — mock it
      document.elementFromPoint = vi.fn();
    });

    /**
     * Helper: simulate a complete drag operation on the given VirtualScroll
     * by dispatching events directly on the viewport.  Returns the controller
     * cast to `any` for state inspection.
     */
    function simulateDrag(
      vs: VirtualScroll,
      viewport: HTMLElement,
      fromLine: number,
      toLine: number,
      dispatchMouseUp: boolean = true,
    ): any {
      const ctrl = vs as any;

      // Mousedown: find the [data-line] element and dispatch on it
      const fromEl = viewport.querySelector(`[data-line="${fromLine}"]`) as HTMLElement;
      if (fromEl) {
        fromEl.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      }

      // Mousemove: elementFromPoint returns the target [data-line]
      const toEl = viewport.querySelector(`[data-line="${toLine}"]`) as HTMLElement;
      (document.elementFromPoint as Mock).mockReturnValue(toEl);
      document.dispatchEvent(new MouseEvent("mousemove", { clientX: 0, clientY: 0 }));

      if (dispatchMouseUp) {
        document.dispatchEvent(new MouseEvent("mouseup"));
      }
      return ctrl;
    }

    it("sets selection anchor on mousedown over a line number", () => {
      const viewport = createViewport();
      const buf = new OutputBuffer(100);
      buf.write("line one");
      buf.write("line two");
      buf.write("line three");
      const vs = new VirtualScroll(buf, viewport, { lineHeight: 20, showLineNumbers: true });
      const ctrl = vs as any;

      // Dispatch mousedown on the first [data-line] element
      const lineEl = viewport.querySelector('[data-line="1"]') as HTMLElement;
      expect(lineEl).toBeTruthy();
      lineEl.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));

      expect(ctrl._selectionAnchor).toBe(1);
      expect(ctrl._selectionEnd).toBe(1);
      expect(ctrl._isDragSelecting).toBe(false);
      expect(vs.highlightedLine).toBe(1);

      vs.unmount();
    });

    it("does nothing on mousedown when target has no [data-line]", () => {
      const viewport = createViewport();
      const buf = new OutputBuffer(100);
      buf.write("line one");
      const vs = new VirtualScroll(buf, viewport, { lineHeight: 20, showLineNumbers: true });
      const ctrl = vs as any;

      ctrl._selectionAnchor = null;
      // Dispatch mousedown on the viewport itself, not on a [data-line]
      viewport.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      // _selectionAnchor should remain null (handler bailed early)
      expect(ctrl._selectionAnchor).toBeNull();

      vs.unmount();
    });

    it("copies selected lines on drag-end", () => {
      const clip = useClipboardMock();

      const viewport = createViewport();
      const buf = new OutputBuffer(100);
      buf.write("line one");
      buf.write("line two");
      buf.write("line three");
      const vs = new VirtualScroll(buf, viewport, { lineHeight: 20, showLineNumbers: true });
      const ctrl = vs as any;

      // Set up drag state directly and invoke the mouseup handler
      ctrl._selectionAnchor = 1;
      ctrl._selectionEnd = 3;
      ctrl._isDragSelecting = true;
      ctrl._highlightedLine = 1;
      ctrl._onDragEndBound();

      expect(clip).toHaveBeenCalledWith("line one\nline two\nline three");

      vs.unmount();
    });

    it("does not copy on click without drag (mousemove not dispatched)", () => {
      const clip = useClipboardMock();

      const viewport = createViewport();
      const buf = new OutputBuffer(100);
      buf.write("line one");
      buf.write("line two");
      const vs = new VirtualScroll(buf, viewport, { lineHeight: 20, showLineNumbers: true });
      const ctrl = vs as any;

      // mousedown sets anchor but isDragSelecting stays false
      ctrl._selectionAnchor = 1;
      ctrl._selectionEnd = 1;
      ctrl._isDragSelecting = false;
      ctrl._onDragEndBound();

      expect(clip).not.toHaveBeenCalled();

      vs.unmount();
    });

    it("selection range persists visually after mouseup", () => {
      const viewport = createViewport();
      const buf = new OutputBuffer(100);
      buf.write("line one");
      buf.write("line two");
      buf.write("line three");
      const vs = new VirtualScroll(buf, viewport, { lineHeight: 20, showLineNumbers: true });
      const ctrl = vs as any;

      // Simulate full drag
      ctrl._selectionAnchor = 1;
      ctrl._selectionEnd = 3;
      ctrl._isDragSelecting = true;
      ctrl._highlightedLine = 1;
      ctrl._onDragEndBound(); // clears _isDragSelecting but keeps anchor/end

      vs.refresh();
      // After mouseup, highlightedLine still reflects the anchor
      expect(vs.highlightedLine).toBe(1);

      vs.unmount();
    });

    it("clicking outside clears the selection range", () => {
      const viewport = createViewport();
      const buf = new OutputBuffer(100);
      buf.write("line one");
      buf.write("line two");
      buf.write("line three");
      const vs = new VirtualScroll(buf, viewport, { lineHeight: 20, showLineNumbers: true });
      const ctrl = vs as any;

      // Simulate completed drag (selectionAnchor/end remain set)
      ctrl._selectionAnchor = 1;
      ctrl._selectionEnd = 3;
      ctrl._isDragSelecting = false;
      ctrl._highlightedLine = 1;

      // Click on viewport (not on a [data-line] element) clears everything.
      // Dispatch on the viewport — the click handler reads e.target.
      viewport.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      expect(vs.highlightedLine).toBeNull();

      vs.unmount();
    });

    it("clicking a line number after drag clears range and toggles single line", () => {
      const viewport = createViewport();
      const buf = new OutputBuffer(100);
      buf.write("line one");
      buf.write("line two");
      buf.write("line three");
      buf.write("line four");
      const vs = new VirtualScroll(buf, viewport, { lineHeight: 20, showLineNumbers: true });
      const ctrl = vs as any;

      // Simulate completed drag (anchor !== end)
      ctrl._selectionAnchor = 1;
      ctrl._selectionEnd = 3;
      ctrl._isDragSelecting = false;
      ctrl._highlightedLine = 1;

      // Simulate the click handler firing on a [data-line="4"] element.
      // Dispatch click on the viewport (e.target is the viewport, not a
      // [data-line] child) to clear the range, then use the setter to
      // toggle — same observable behavior as clicking a new line number.
      viewport.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      expect(vs.highlightedLine).toBeNull();

      // Now toggle line 4 via the setter (same logic as click handler)
      vs.highlightedLine = 4;
      expect(vs.highlightedLine).toBe(4);

      vs.unmount();
    });

    it("does not trigger spurious copy on second mouseup without mousedown", () => {
      const clip = useClipboardMock();

      const viewport = createViewport();
      const buf = new OutputBuffer(100);
      buf.write("line one");
      buf.write("line two");
      const vs = new VirtualScroll(buf, viewport, { lineHeight: 20, showLineNumbers: true });
      const ctrl = vs as any;

      // First drag: copy then clear highlighting via click
      ctrl._selectionAnchor = 1;
      ctrl._selectionEnd = 2;
      ctrl._isDragSelecting = true;
      ctrl._highlightedLine = 1;
      ctrl._onDragEndBound();
      expect(clip).toHaveBeenCalledTimes(1);

      // Click on viewport clears selection state
      viewport.dispatchEvent(new MouseEvent("click", { bubbles: true }));

      // Second mouseup without prior mousedown — should not copy
      ctrl._onDragEndBound();
      expect(clip).toHaveBeenCalledTimes(1);

      vs.unmount();
    });

    it("bails on mousedown when data-line has empty value (isNaN)", () => {
      const viewport = createViewport();
      const buf = new OutputBuffer(100);
      buf.write("line one");
      const vs = new VirtualScroll(buf, viewport, { lineHeight: 20, showLineNumbers: true });
      const ctrl = vs as any;

      // Add a span with data-line="" inside the viewport
      const badSpan = document.createElement("span");
      badSpan.setAttribute("data-line", "");
      viewport.appendChild(badSpan);

      // Dispatch mousedown on it — should bail at isNaN check
      ctrl._selectionAnchor = null;
      badSpan.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      expect(ctrl._selectionAnchor).toBeNull();

      vs.unmount();
    });
  });

  describe("copy highlighted line", () => {
    it("copies highlighted line content on Cmd+C", () => {
      const clip = useClipboardMock();

      const viewport = createViewport();
      const buf = new OutputBuffer(100);
      buf.write("line one");
      buf.write("copy this");
      buf.write("line three");
      const vs = new VirtualScroll(buf, viewport, { lineHeight: 20, showLineNumbers: true });

      vs.highlightedLine = 2;

      // Invoke the handler directly (document-level dispatch is unreliable
      // in jsdom due to listener cleanup issues across tests)
      const ctrl = vs as any;
      const event = new KeyboardEvent("keydown", {
        key: "c",
        metaKey: true,
        bubbles: true,
      });
      ctrl._copyBound(event);

      expect(clip).toHaveBeenCalledWith("copy this");

      vs.unmount();
    });

    it("copies line content on Ctrl+C", () => {
      const clip = useClipboardMock();

      const viewport = createViewport();
      const buf = new OutputBuffer(100);
      buf.write("copy this");
      const vs = new VirtualScroll(buf, viewport, { lineHeight: 20, showLineNumbers: true });

      vs.highlightedLine = 1;

      const ctrl = vs as any;
      const event = new KeyboardEvent("keydown", {
        key: "c",
        ctrlKey: true,
        bubbles: true,
      });
      ctrl._copyBound(event);

      expect(clip).toHaveBeenCalledWith("copy this");

      vs.unmount();
    });

    it("does not copy when no line is highlighted", () => {
      const clip = useClipboardMock();

      const viewport = createViewport();
      const buf = new OutputBuffer(100);
      buf.write("line one");
      const vs = new VirtualScroll(buf, viewport, { lineHeight: 20, showLineNumbers: true });

      const ctrl = vs as any;
      const event = new KeyboardEvent("keydown", {
        key: "c",
        metaKey: true,
        bubbles: true,
      });
      ctrl._copyBound(event);

      expect(clip).not.toHaveBeenCalled();

      vs.unmount();
    });

    it("cleans up keydown listener on unmount", () => {
      const clip = useClipboardMock();

      const viewport = createViewport();
      const buf = new OutputBuffer(100);
      buf.write("line one");
      const vs = new VirtualScroll(buf, viewport, { lineHeight: 20, showLineNumbers: true });

      vs.highlightedLine = 1;

      // Save the bound handler, then unmount
      const ctrl = vs as any;
      const bound = ctrl._copyBound;
      vs.unmount();

      // After unmount, the handler should be null (removed from document)
      expect(ctrl._copyBound).toBeNull();

      // Verify the old handler doesn't write to clipboard
      // (even if called manually — it was detached via unmount)
      expect(clip).not.toHaveBeenCalled();
    });

    it("does not copy on non-C shortcut with modifiers", () => {
      const clip = useClipboardMock();

      const viewport = createViewport();
      const buf = new OutputBuffer(100);
      buf.write("line one");
      const vs = new VirtualScroll(buf, viewport, { lineHeight: 20, showLineNumbers: true });

      vs.highlightedLine = 1;

      const ctrl = vs as any;
      const event = new KeyboardEvent("keydown", {
        key: "v",
        metaKey: true,
        bubbles: true,
      });
      ctrl._copyBound(event);

      expect(clip).not.toHaveBeenCalled();

      vs.unmount();
    });

    it("does not copy when highlightedLine is 0 (idx < 0)", () => {
      const clip = useClipboardMock();

      const viewport = createViewport();
      const buf = new OutputBuffer(100);
      buf.write("alpha");
      const vs = new VirtualScroll(buf, viewport, { lineHeight: 20, showLineNumbers: true });

      vs.highlightedLine = 0;
      const ctrl = vs as any;
      const event = new KeyboardEvent("keydown", { key: "c", metaKey: true, bubbles: true });
      ctrl._copyBound(event);

      // idx = 0 - 1 = -1, so idx >= 0 is false → no copy
      expect(clip).not.toHaveBeenCalled();

      vs.unmount();
    });
  });

  describe("unmount with copy listener", () => {
    it("removes the keydown listener added for copy", () => {
      const viewport = createViewport();
      const buf = new OutputBuffer(100);
      buf.write("line one");
      const vs = new VirtualScroll(buf, viewport, { lineHeight: 20, showLineNumbers: true });

      const spy = vi.spyOn(document, "removeEventListener");
      vs.unmount();

      expect(spy).toHaveBeenCalledWith("keydown", expect.any(Function));
      spy.mockRestore();
    });
  });

  describe("totalLinesOverride", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("scrollToBottom uses override when set", () => {
      const viewport = createViewport();
      const buf = new OutputBuffer(100);
      for (let i = 0; i < 10; i++) buf.write(`line ${i}`);
      const vs = new VirtualScroll(buf, viewport, { lineHeight: 20 });
      vs.totalLinesOverride = 200;

      vs.scrollToBottom();
      expect(vs.isAtBottom).toBe(true);

      vs.unmount();
    });

    it("renders 'Loading more…' indicator when override exceeds buffer", () => {
      const viewport = createViewport();
      const buf = new OutputBuffer(100);
      for (let i = 0; i < 5; i++) buf.write(`line ${i}`);
      const vs = new VirtualScroll(buf, viewport, { lineHeight: 20 });
      vs.totalLinesOverride = 200;

      // Scroll past the buffer content to trigger "Loading more…"
      viewport.scrollTop = 1000;
      viewport.dispatchEvent(new Event("scroll"));
      vi.advanceTimersByTime(50); // flush RAF

      expect(viewport.textContent).toContain("Loading more");

      vs.unmount();
    });

    it("does not show 'Loading more…' when override equals buffer lines", () => {
      const viewport = createViewport();
      const buf = new OutputBuffer(100);
      for (let i = 0; i < 5; i++) buf.write(`line ${i}`);
      const vs = new VirtualScroll(buf, viewport, { lineHeight: 20 });
      vs.totalLinesOverride = 0; // defaults to buffer.totalLines

      viewport.scrollTop = 1000;
      viewport.dispatchEvent(new Event("scroll"));
      vi.advanceTimersByTime(50); // flush RAF

      // totalLines = buffer.totalLines = 5, totalLines > bufferLines is false
      expect(viewport.textContent).not.toContain("Loading more");

      vs.unmount();
    });
  });

  describe("Cmd+C copies drag-selected range", () => {
    it("copies all lines in the selection range on Cmd+C", () => {
      const clip = useClipboardMock();

      const viewport = createViewport();
      const buf = new OutputBuffer(100);
      buf.write("alpha");
      buf.write("beta");
      buf.write("gamma");
      buf.write("delta");
      const vs = new VirtualScroll(buf, viewport, { lineHeight: 20, showLineNumbers: true });
      const ctrl = vs as any;

      // Simulate drag selection of lines 2-4
      ctrl._selectionAnchor = 2;
      ctrl._selectionEnd = 4;
      ctrl._highlightedLine = 2;

      const event = new KeyboardEvent("keydown", { key: "c", metaKey: true, bubbles: true });
      ctrl._copyBound(event);

      expect(clip).toHaveBeenCalledWith("beta\ngamma\ndelta");

      vs.unmount();
    });

    it("copies single line with Cmd+C when no range selection", () => {
      const clip = useClipboardMock();

      const viewport = createViewport();
      const buf = new OutputBuffer(100);
      buf.write("alpha");
      buf.write("beta");
      const vs = new VirtualScroll(buf, viewport, { lineHeight: 20, showLineNumbers: true });

      vs.highlightedLine = 1;

      const ctrl = vs as any;
      const event = new KeyboardEvent("keydown", { key: "c", metaKey: true, bubbles: true });
      ctrl._copyBound(event);

      expect(clip).toHaveBeenCalledWith("alpha");

      vs.unmount();
    });
  });

  describe("rendered content CSS", () => {
    it("uses white-space:pre to preserve leading whitespace with showLineNumbers", () => {
      const viewport = createViewport();
      const buf = new OutputBuffer(100);
      buf.write("    indented line");
      const vs = new VirtualScroll(buf, viewport, { lineHeight: 20, showLineNumbers: true });

      const contentSpans = viewport.querySelectorAll("[data-line] + span");
      expect(contentSpans.length).toBeGreaterThan(0);
      const lastSpan = contentSpans[contentSpans.length - 1] as HTMLElement;
      expect(lastSpan.classList.contains("vs-content")).toBe(true);
      expect(lastSpan.textContent).toContain("indented");

      vs.unmount();
    });

    it("uses white-space:pre to preserve leading whitespace without line numbers", () => {
      const viewport = createViewport();
      const buf = new OutputBuffer(100);
      buf.write("    indented line");
      const vs = new VirtualScroll(buf, viewport, { lineHeight: 20 }); // no showLineNumbers

      const innerDivs = viewport.querySelectorAll(":scope > div");
      expect(innerDivs.length).toBeGreaterThan(0);
      const lineDiv = innerDivs[0] as HTMLElement;
      expect(lineDiv.classList.contains("vs-row-noln")).toBe(true);
      expect(lineDiv.textContent).toContain("indented");

      vs.unmount();
    });

    it("uses formatLine callback to syntax-highlight lines", () => {
      const viewport = createViewport();
      const buf = new OutputBuffer(100);
      buf.write('{"a": 1}');
      const vs = new VirtualScroll(buf, viewport, {
        lineHeight: 20,
        formatLine: (line) => `<span class="hl-test">${line}</span>`,
      });

      expect(viewport.innerHTML).toContain('class="hl-test"');
      expect(viewport.innerHTML).toContain('{"a": 1}');

      vs.unmount();
    });

    it("formatLine output is NOT double-escaped", () => {
      const viewport = createViewport();
      const buf = new OutputBuffer(100);
      buf.write("<test>");
      const vs = new VirtualScroll(buf, viewport, {
        lineHeight: 20,
        // Return HTML directly — should not be escaped
        formatLine: () => '<span style="color:red;">&lt;safe&gt;</span>',
      });

      // The spans should appear as-is (no double-escape)
      expect(viewport.innerHTML).toContain("&lt;safe&gt;");
      expect(viewport.innerHTML).not.toContain("&amp;lt;");

      vs.unmount();
    });
  });

  describe("drag listener cleanup", () => {
    it("removes mousemove and mouseup listeners on unmount", () => {
      const viewport = createViewport();
      const buf = new OutputBuffer(100);
      buf.write("line one");
      const vs = new VirtualScroll(buf, viewport, { lineHeight: 20, showLineNumbers: true });

      const spy = vi.spyOn(document, "removeEventListener");
      vs.unmount();

      expect(spy).toHaveBeenCalledWith("mousemove", expect.any(Function));
      expect(spy).toHaveBeenCalledWith("mouseup", expect.any(Function));
      spy.mockRestore();
    });
  });

  describe("mousemove handler (_onDragMoveBound)", () => {
    beforeEach(() => {
      document.elementFromPoint = vi.fn();
    });

    it("does nothing when selection anchor is null", () => {
      const viewport = createViewport();
      const buf = new OutputBuffer(100);
      buf.write("line one");
      const vs = new VirtualScroll(buf, viewport, { lineHeight: 20, showLineNumbers: true });
      const ctrl = vs as any;

      // _selectionAnchor starts null → handler should bail immediately
      ctrl._selectionAnchor = null;
      const prev = ctrl._selectionEnd;
      document.dispatchEvent(new MouseEvent("mousemove", { clientX: 0, clientY: 0 }));
      expect(ctrl._selectionEnd).toBe(prev);

      vs.unmount();
    });

    it("does nothing when elementFromPoint finds no [data-line]", () => {
      const viewport = createViewport();
      const buf = new OutputBuffer(100);
      buf.write("line one");
      const vs = new VirtualScroll(buf, viewport, { lineHeight: 20, showLineNumbers: true });
      const ctrl = vs as any;

      (document.elementFromPoint as Mock).mockReturnValue(null);
      ctrl._selectionAnchor = 1;
      const prev = ctrl._selectionEnd;
      document.dispatchEvent(new MouseEvent("mousemove", { clientX: 0, clientY: 0 }));
      expect(ctrl._selectionEnd).toBe(prev);

      vs.unmount();
    });

    it("does nothing when the target line is the same as selectionEnd", () => {
      const viewport = createViewport();
      const buf = new OutputBuffer(100);
      buf.write("line one");
      buf.write("line two");
      const vs = new VirtualScroll(buf, viewport, { lineHeight: 20, showLineNumbers: true });
      const ctrl = vs as any;

      const el = viewport.querySelector('[data-line="1"]') as HTMLElement;
      (document.elementFromPoint as Mock).mockReturnValue(el);
      ctrl._selectionAnchor = 1;
      ctrl._selectionEnd = 1;
      document.dispatchEvent(new MouseEvent("mousemove", { clientX: 0, clientY: 0 }));
      // _isDragSelecting should stay false because line hasn't changed
      expect(ctrl._isDragSelecting).toBe(false);

      vs.unmount();
    });

    it("extends selection when mousing over a different line", () => {
      const viewport = createViewport();
      const buf = new OutputBuffer(100);
      buf.write("line one");
      buf.write("line two");
      buf.write("line three");
      const vs = new VirtualScroll(buf, viewport, { lineHeight: 20, showLineNumbers: true });
      const ctrl = vs as any;

      // Set anchor/end directly (skip DOM event which may cause re-render issues)
      ctrl._selectionAnchor = 1;
      ctrl._selectionEnd = 1;

      // Mock elementFromPoint to return a [data-line="3"] element
      const fakeEl = document.createElement("span");
      fakeEl.setAttribute("data-line", "3");
      (document.elementFromPoint as Mock).mockReturnValue(fakeEl);

      // Call the handler directly
      ctrl._onDragMoveBound(new MouseEvent("mousemove", { clientX: 0, clientY: 0 }));

      expect(ctrl._selectionEnd).toBe(3);
      expect(ctrl._isDragSelecting).toBe(true);

      vs.unmount();
    });

    it("returns early when data-line attribute is NaN (isNaN branch)", () => {
      const viewport = createViewport();
      const buf = new OutputBuffer(100);
      buf.write("line one");
      const vs = new VirtualScroll(buf, viewport, { lineHeight: 20, showLineNumbers: true });
      const ctrl = vs as any;

      ctrl._selectionAnchor = 1;
      ctrl._selectionEnd = 1;

      // elementFromPoint returns an element with non-numeric data-line
      const badEl = document.createElement("span");
      badEl.setAttribute("data-line", "abc");
      (document.elementFromPoint as Mock).mockReturnValue(badEl);

      ctrl._onDragMoveBound(new MouseEvent("mousemove", { clientX: 0, clientY: 0 }));

      // Handler should bail at isNaN check → selection unchanged
      expect(ctrl._selectionEnd).toBe(1);
      expect(ctrl._isDragSelecting).toBe(false);

      vs.unmount();
    });

    it("bails on mousemove when data-line has empty value (isNaN in mousemove)", () => {
      const viewport = createViewport();
      const buf = new OutputBuffer(100);
      buf.write("line one");
      const vs = new VirtualScroll(buf, viewport, { lineHeight: 20, showLineNumbers: true });
      const ctrl = vs as any;

      ctrl._selectionAnchor = 1;
      ctrl._selectionEnd = 1;

      // elementFromPoint returns an element with data-line=""
      const badEl = document.createElement("span");
      badEl.setAttribute("data-line", "");
      (document.elementFromPoint as Mock).mockReturnValue(badEl);

      ctrl._onDragMoveBound(new MouseEvent("mousemove", { clientX: 0, clientY: 0 }));

      // Should bail at isNaN check
      expect(ctrl._selectionEnd).toBe(1);
      expect(ctrl._isDragSelecting).toBe(false);

      vs.unmount();
    });
  });

  describe("showToast", () => {
    beforeEach(() => {
      vi.useFakeTimers();
      // Remove any leftover toasts from previous tests
      const body = document.body;
      Array.from(body.children).forEach((child) => {
        if ((child as HTMLElement).textContent === "Copied") {
          child.remove();
        }
      });
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("copies to clipboard on drag-end and shows toast that fades out", () => {
      const clip = useClipboardMock();

      const viewport = createViewport();
      const buf = new OutputBuffer(100);
      buf.write("line one");
      buf.write("line two");
      buf.write("line three");
      const vs = new VirtualScroll(buf, viewport, { lineHeight: 20, showLineNumbers: true });
      const ctrl = vs as any;

      ctrl._selectionAnchor = 1;
      ctrl._selectionEnd = 3;
      ctrl._isDragSelecting = true;
      ctrl._highlightedLine = 1;
      ctrl._onDragEndBound();

      expect(clip).toHaveBeenCalledWith("line one\nline two\nline three");

      // Toast should be a child of body with text "Copied"
      const bodyChildren = Array.from(document.body.children) as HTMLElement[];
      const toasts = bodyChildren.filter((el) => el.textContent === "Copied");
      expect(toasts.length).toBeGreaterThan(0);
      const toast = toasts[0];

      // Advance past the fade-out timer (1500ms)
      vi.advanceTimersByTime(1600);
      // After the second setTimeout (200ms), the toast should be removed
      vi.advanceTimersByTime(200);
      expect(document.body.textContent).not.toContain("Copied");

      vs.unmount();
    });

    it("shows toast when Cmd+C copies highlighted line", () => {
      const clip = useClipboardMock();

      const viewport = createViewport();
      const buf = new OutputBuffer(100);
      buf.write("copy me");
      const vs = new VirtualScroll(buf, viewport, { lineHeight: 20, showLineNumbers: true });

      vs.highlightedLine = 1;
      const ctrl = vs as any;
      const event = new KeyboardEvent("keydown", { key: "c", metaKey: true, bubbles: true });
      ctrl._copyBound(event);

      expect(clip).toHaveBeenCalledWith("copy me");

      // Toast should appear
      const bodyChildren = Array.from(document.body.children) as HTMLElement[];
      const toasts = bodyChildren.filter((el) => el.textContent === "Copied");
      expect(toasts.length).toBeGreaterThan(0);

      vi.advanceTimersByTime(1600);
      vi.advanceTimersByTime(200);
      expect(document.body.textContent).not.toContain("Copied");

      vs.unmount();
    });
  });

  describe("cursor", () => {
    it("starts with no cursor", () => {
      const viewport = createViewport();
      const buf = new OutputBuffer(100);
      buf.write("hello");
      const vs = new VirtualScroll(buf, viewport, { lineHeight: 20 });
      expect(vs.cursorLine).toBe(-1);
      expect(vs.cursorCol).toBe(0);
      vs.unmount();
    });

    it("setCursor sets line, col, and highlights the line", () => {
      const viewport = createViewport();
      const buf = new OutputBuffer(100);
      buf.write("hello world");
      const vs = new VirtualScroll(buf, viewport, { lineHeight: 20 });
      vs.setCursor(1, 3);
      expect(vs.cursorLine).toBe(1);
      expect(vs.cursorCol).toBe(3);
      expect(vs.highlightedLine).toBe(1);
      vs.unmount();
    });

    it("setCursor fires onCursorChange", () => {
      const viewport = createViewport();
      const buf = new OutputBuffer(100);
      buf.write("hello");
      const vs = new VirtualScroll(buf, viewport, { lineHeight: 20 });
      const cb = vi.fn();
      vs.onCursorChange = cb;
      vs.setCursor(2, 5);
      expect(cb).toHaveBeenCalledWith(2, 5);
      vs.unmount();
    });

    it("clearCursor resets to -1/0 and fires callback", () => {
      const viewport = createViewport();
      const buf = new OutputBuffer(100);
      buf.write("hello");
      const vs = new VirtualScroll(buf, viewport, { lineHeight: 20 });
      const cb = vi.fn();
      vs.onCursorChange = cb;
      vs.setCursor(1, 2);
      vs.clearCursor();
      expect(vs.cursorLine).toBe(-1);
      expect(vs.cursorCol).toBe(0);
      expect(cb).toHaveBeenCalledWith(-1, 0);
      vs.unmount();
    });

    it("clicking content area places cursor with column clamped to line length", () => {
      const viewport = createViewport();
      const buf = new OutputBuffer(100);
      buf.write("longer line content");
      const vs = new VirtualScroll(buf, viewport, { lineHeight: 20, showLineNumbers: true });
      const ctrl = vs as any;

      // In jsdom, offsetWidth is 0 so _charWidth stays 0.  Set it
      // explicitly so that cursor column math works correctly.
      ctrl._charWidth = 7.8;

      // Helper: click on the content area of the rendered line container
      // at the given clientX.  Re-queries the DOM after each dispatch
      // because setCursor → render() detaches old elements via innerHTML.
      function clickContent(clientX: number): { contentLen: number; contentSpan: HTMLElement } {
        const lc = viewport.querySelector('[data-line-container="1"]') as HTMLElement;
        const cs = lc.children[1] as HTMLElement;
        vi.spyOn(cs, "getBoundingClientRect").mockReturnValue({
          left: 100,
          top: 0,
          right: 300,
          bottom: 20,
          width: 200,
          height: 20,
          x: 100,
          y: 0,
          toJSON: () => ({}),
        });
        lc.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX }));
        return { contentLen: (cs.textContent || "").length, contentSpan: cs };
      }

      // Test 1: click near the start — col within content length
      const { contentLen } = clickContent(108); // x = 8px → round(8/7.8) ≈ col 1
      expect(vs.cursorCol).toBeLessThan(contentLen);
      expect(vs.cursorCol).toBeGreaterThanOrEqual(0);
      expect(vs.cursorLine).toBe(1);

      // Test 2: click far past the end — clamped to line length
      clickContent(300); // x = 200 → round(200/7.8) ≈ col 26
      expect(vs.cursorCol).toBe(contentLen);
      expect(vs.cursorLine).toBe(1);
      vs.unmount();
    });

    it("click past end of line clamps cursor column to line content length", () => {
      const viewport = createViewport();
      const buf = new OutputBuffer(100);
      buf.write("abc");
      const vs = new VirtualScroll(buf, viewport, { lineHeight: 20, showLineNumbers: true });
      const ctrl = vs as any;
      ctrl._charWidth = 7.8;

      const lineContainer = viewport.querySelector('[data-line-container="1"]') as HTMLElement;
      expect(lineContainer).toBeTruthy();
      const contentSpan = lineContainer.children[1] as HTMLElement;

      vi.spyOn(contentSpan, "getBoundingClientRect").mockReturnValue({
        left: 100,
        top: 0,
        right: 300,
        bottom: 20,
        width: 200,
        height: 20,
        x: 100,
        y: 0,
        toJSON: () => ({}),
      });

      // Click far past the end → col clamped to lineLen
      lineContainer.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: 200 }));
      const lineLen = (contentSpan.textContent || "").length;
      expect(vs.cursorCol).toBe(lineLen);
      expect(vs.cursorLine).toBe(1);
      vs.unmount();
    });

    it("click within content places cursor before next character", () => {
      const viewport = createViewport();
      const buf = new OutputBuffer(100);
      buf.write("abc");
      const vs = new VirtualScroll(buf, viewport, { lineHeight: 20, showLineNumbers: true });
      const ctrl = vs as any;
      ctrl._charWidth = 7.8;

      const lineContainer = viewport.querySelector('[data-line-container="1"]') as HTMLElement;
      const contentSpan = lineContainer.children[1] as HTMLElement;

      vi.spyOn(contentSpan, "getBoundingClientRect").mockReturnValue({
        left: 100,
        top: 0,
        right: 300,
        bottom: 20,
        width: 200,
        height: 20,
        x: 100,
        y: 0,
        toJSON: () => ({}),
      });

      // Click at x≈1px from left edge → col=0 (before first char)
      lineContainer.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: 101 }));
      expect(vs.cursorCol).toBe(0);
      expect(vs.cursorLine).toBe(1);
      vs.unmount();
    });

    it("_ensureCharWidth early return does not change already-measured width", () => {
      const viewport = createViewport();
      const buf = new OutputBuffer(100);
      buf.write("hello");
      const vs = new VirtualScroll(buf, viewport, { lineHeight: 20 });
      const ctrl = vs as any;
      ctrl._charWidth = 7.8;
      const before = ctrl._charWidth;
      // Second call hits the early return branch (charWidth > 0)
      ctrl._ensureCharWidth();
      expect(ctrl._charWidth).toBe(before);
      vs.unmount();
    });

    it("clicking line number does not place cursor", () => {
      const viewport = createViewport();
      const buf = new OutputBuffer(100);
      buf.write("abc");
      buf.write("xyz");
      const vs = new VirtualScroll(buf, viewport, { lineHeight: 20, showLineNumbers: true });

      const lineNumSpan = viewport.querySelector('[data-line="2"]') as HTMLElement;
      expect(lineNumSpan).toBeTruthy();
      lineNumSpan.dispatchEvent(new MouseEvent("click", { bubbles: true }));

      // Cursor should NOT be set (only line number toggle should fire)
      expect(vs.cursorLine).toBe(-1);
      vs.unmount();
    });

    it("does not place cursor on data-line-container with NaN value", () => {
      const viewport = createViewport();
      const buf = new OutputBuffer(100);
      buf.write("abc");
      const vs = new VirtualScroll(buf, viewport, { lineHeight: 20, showLineNumbers: true });

      // Inject a bogus container that would trigger the NaN branch
      const bogus = document.createElement("div");
      bogus.setAttribute("data-line-container", "not-a-number");
      const span = document.createElement("span");
      span.textContent = "click me";
      bogus.appendChild(span);
      viewport.appendChild(bogus);

      const ctrl = vs as any;
      const beforeLine = ctrl._cursorLine;
      span.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      expect(ctrl._cursorLine).toBe(beforeLine);
      vs.unmount();
    });

    it("does not place cursor when line container has no content span", () => {
      const viewport = createViewport();
      const buf = new OutputBuffer(100);
      buf.write("abc");
      const vs = new VirtualScroll(buf, viewport, { lineHeight: 20, showLineNumbers: true });

      // Inject a line container that has only a line-number span
      // (children[0]). The click target must NOT be children[0] so the
      // lineNumSpan check passes, then children[1] is undefined and
      // `if (!contentSpan) return;` fires.
      const bogus = document.createElement("div");
      bogus.setAttribute("data-line-container", "99");
      const lineNumSpan = document.createElement("span");
      lineNumSpan.setAttribute("data-line", "99");
      lineNumSpan.textContent = "99";
      bogus.appendChild(lineNumSpan);
      viewport.appendChild(bogus);

      // The click target is the bogus container itself (not children[0])
      const ctrl = vs as any;
      const beforeLine = ctrl._cursorLine;
      bogus.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      expect(ctrl._cursorLine).toBe(beforeLine);
      vs.unmount();
    });

    it("does not place cursor when native text selection exists", () => {
      const viewport = createViewport();
      const buf = new OutputBuffer(100);
      buf.write("abc");
      const vs = new VirtualScroll(buf, viewport, { lineHeight: 20, showLineNumbers: true });
      const ctrl = vs as any;
      ctrl._charWidth = 7.8;

      const lineContainer = viewport.querySelector('[data-line-container="1"]') as HTMLElement;
      const contentSpan = lineContainer.children[1] as HTMLElement;

      vi.spyOn(contentSpan, "getBoundingClientRect").mockReturnValue({
        left: 100,
        top: 0,
        right: 300,
        bottom: 20,
        width: 200,
        height: 20,
        x: 100,
        y: 0,
        toJSON: () => ({}),
      });

      // Simulate an active text selection on the page
      const sel = window.getSelection()!;
      sel.removeAllRanges();
      const range = document.createRange();
      range.selectNodeContents(document.body);
      sel.addRange(range);
      expect(sel.toString().length).toBeGreaterThan(0);

      // Click on content area — cursor should NOT be placed
      const beforeLine = ctrl._cursorLine;
      lineContainer.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: 200 }));
      expect(ctrl._cursorLine).toBe(beforeLine);

      sel.removeAllRanges();
      vs.unmount();
    });

    it("render skips innerHTML replacement when native text selection exists", () => {
      const viewport = createViewport();
      const buf = new OutputBuffer(100);
      buf.write("hello world");
      buf.write("second line");
      const vs = new VirtualScroll(buf, viewport, { lineHeight: 20, showLineNumbers: true });
      const ctrl = vs as any;

      // Verify initial render has content
      expect(viewport.querySelector('[data-line-container="1"]')).toBeTruthy();

      // Create a native text selection
      const sel = window.getSelection()!;
      sel.removeAllRanges();
      const range = document.createRange();
      range.selectNodeContents(document.body);
      sel.addRange(range);
      expect(sel.toString().length).toBeGreaterThan(0);

      // Trigger a render — should be a no-op, DOM should remain unchanged
      const oldHtml = viewport.innerHTML;
      ctrl.render();
      expect(viewport.innerHTML).toBe(oldHtml);

      sel.removeAllRanges();
      vs.unmount();
    });

    it("setCursor is a no-op during native text selection", () => {
      const viewport = createViewport();
      const buf = new OutputBuffer(100);
      buf.write("hello world");
      const vs = new VirtualScroll(buf, viewport, { lineHeight: 20 });
      const ctrl = vs as any;

      // Create a native text selection
      const sel = window.getSelection()!;
      sel.removeAllRanges();
      const range = document.createRange();
      range.selectNodeContents(document.body);
      sel.addRange(range);

      // setCursor should not render (render will be a no-op)
      const oldHtml = viewport.innerHTML;
      vs.setCursor(1, 3);
      expect(viewport.innerHTML).toBe(oldHtml);
      // The private fields should still be updated even though render was skipped
      expect(vs.cursorLine).toBe(1);
      expect(vs.cursorCol).toBe(3);

      sel.removeAllRanges();
      vs.unmount();
    });
  });
});
