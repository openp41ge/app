/**
 * Tests for LineNumbersOverlay — line number rendering and scroll offset.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { LineNumbersOverlay } from "@openp41ge-file-editor/rendering/line-numbers-overlay";

describe("LineNumbersOverlay", () => {
  let gutterEl: HTMLElement;
  let overlay: LineNumbersOverlay;

  beforeEach(() => {
    gutterEl = document.createElement("div");
    gutterEl.style.position = "relative";
    gutterEl.style.width = "48px";
    gutterEl.style.height = "400px";
    gutterEl.style.overflow = "hidden";
    document.body.appendChild(gutterEl);

    overlay = new LineNumbersOverlay(gutterEl, {
      gutterWidth: 48,
      lineHeight: 20,
    });
  });

  afterEach(() => {
    overlay.dispose();
    document.body.innerHTML = "";
  });

  it("renders line numbers for the visible range", () => {
    overlay.setVisibleRange(1, 10);

    const lineNumbers = gutterEl.querySelectorAll(".line-number");
    expect(lineNumbers.length).toBe(10);
    expect(lineNumbers[0].textContent).toBe("1");
    expect(lineNumbers[9].textContent).toBe("10");
  });

  it("creates an inner scroll container for transform-based positioning", () => {
    // The overlay should create a container div inside the gutter
    const container = gutterEl.querySelector(":scope > div");
    expect(container).toBeTruthy();
    expect(container!.style.position).toBe("absolute");
    expect(container!.style.top).toBe("0px");
  });

  it("line number wrappers are children of the scroll container", () => {
    overlay.setVisibleRange(1, 5);
    const container = gutterEl.querySelector(":scope > div");
    const wrappers = container!.querySelectorAll(".line-number");
    expect(wrappers.length).toBe(5);
  });

  it("setScrollOffset applies CSS transform to the container", () => {
    overlay.setVisibleRange(1, 10);

    // Find the inner container
    const container = gutterEl.querySelector(":scope > div") as HTMLElement;

    overlay.setScrollOffset(50);
    expect(container.style.transform).toBe("translateY(-50px)");

    overlay.setScrollOffset(200);
    expect(container.style.transform).toBe("translateY(-200px)");

    overlay.setScrollOffset(0);
    expect(container.style.transform).toBe("translateY(-0px)");
  });

  it("line number elements have class 'line-number' not a wrapper class", () => {
    overlay.setVisibleRange(1, 3);

    // The inner label has class "line-number", the wrapper has no class
    const wrappers = gutterEl.querySelectorAll(":scope > div > div") as NodeListOf<HTMLElement>;
    expect(wrappers.length).toBe(3);

    // Each wrapper should be at (lineNum-1) * lineHeight
    expect(wrappers[0].style.top).toBe("0px"); // line 1
    expect(wrappers[1].style.top).toBe("20px"); // line 2
    expect(wrappers[2].style.top).toBe("40px"); // line 3
  });

  it("removes line numbers outside the visible range", () => {
    overlay.setVisibleRange(1, 10);
    expect(gutterEl.querySelectorAll(".line-number").length).toBe(10);

    overlay.setVisibleRange(5, 8);
    expect(gutterEl.querySelectorAll(".line-number").length).toBe(4);
    expect(gutterEl.querySelectorAll(".line-number")[0].textContent).toBe("5");
  });

  it("clear removes all line numbers and resets transform", () => {
    overlay.setVisibleRange(1, 10);
    overlay.setScrollOffset(100);
    overlay.clear();

    expect(gutterEl.querySelectorAll(".line-number").length).toBe(0);
    const container = gutterEl.querySelector(":scope > div") as HTMLElement;
    expect(container.style.transform).toBe("");
  });

  it("dispose prevents further updates", () => {
    overlay.dispose();

    // setVisibleRange should be a no-op after dispose
    overlay.setVisibleRange(1, 5);
    expect(gutterEl.querySelectorAll(".line-number").length).toBe(0);
  });
});
