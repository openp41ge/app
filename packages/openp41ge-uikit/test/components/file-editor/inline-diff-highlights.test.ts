// @ts-nocheck
/**
 * InlineDiffHighlightsRenderer — full-content-width red/green row bands.
 *
 * Regression: bands were left:0;right:0 inside the VIEWPORT, so they stopped
 * at the viewport width. With one very long line the file has scrollable empty
 * space to the right that the tint must also cover. The renderer now sizes
 * each band to the passed CONTENT width (scroll width), which is >= viewport.
 */
import { describe, test, expect, beforeEach } from "vitest";
import { InlineDiffHighlightsRenderer } from "../../../src/components/file-editor/inline-diff-highlights";

const ROWS = [
  { kind: "added", oldLine: null, newLine: 1 },
  { kind: "removed", oldLine: 1, newLine: null },
  { kind: "context", oldLine: 2, newLine: 2 },
];

let parent: HTMLElement;

function bands(): HTMLElement[] {
  return [...parent.querySelectorAll(".fe-inline-diff-added, .fe-inline-diff-removed")];
}

beforeEach(() => {
  document.body.innerHTML = "";
  parent = document.createElement("div");
  document.body.appendChild(parent);
});

describe("InlineDiffHighlightsRenderer", () => {
  test("bands span the full CONTENT width when it exceeds the viewport", () => {
    const r = new InlineDiffHighlightsRenderer(parent);
    r.render(ROWS, 1, 3, 20, 5000);

    const els = bands();
    expect(els).toHaveLength(2); // added + removed; context is skipped
    expect(els[0].className).toBe("fe-inline-diff-added");
    expect(els[1].className).toBe("fe-inline-diff-removed");
    for (const el of els) {
      expect(el.style.width).toBe("5000px");
      expect(el.style.left).toBe("0px");
      expect(el.style.right).toBe(""); // sized by width, not right:0
      expect(el.style.top).not.toBe("");
    }
  });

  test("without a content width the bands default to full parent width", () => {
    const r = new InlineDiffHighlightsRenderer(parent);
    r.render(ROWS, 1, 3, 20);
    for (const el of bands()) {
      expect(el.style.width).toBe("100%");
    }
  });

  test("clear() and dispose() remove every band", () => {
    const r = new InlineDiffHighlightsRenderer(parent);
    r.render(ROWS, 1, 3, 20, 400);
    expect(bands().length).toBeGreaterThan(0);
    r.clear();
    expect(bands()).toHaveLength(0);

    r.render(ROWS, 1, 3, 20, 400);
    expect(bands()).toHaveLength(2);
    r.dispose();
    expect(bands()).toHaveLength(0);
  });

  test("word wrap: a wrapped added row's tint spans ALL its view segments", () => {
    const r = new InlineDiffHighlightsRenderer(parent);
    // Model line 1 (the added row) wraps to 2 view segments starting at view
    // line 4. Its band must cover view rows 4-5 => top = (4-1)*20 = 60px,
    // height = 2*20 = 40px.
    const startOf = (m) => (m === 1 ? 4 : m);
    const countOf = (m) => (m === 1 ? 2 : 1);
    r.render(ROWS, 1, 3, 20, 500, startOf, countOf);

    const els = bands();
    expect(els).toHaveLength(2);
    const added = els.find((e) => e.className === "fe-inline-diff-added")!;
    const removed = els.find((e) => e.className === "fe-inline-diff-removed")!;
    expect(added.style.top).toBe("60px");
    expect(added.style.height).toBe("40px");
    // Non-wrapped rows are single-row bands at their model-line position.
    expect(removed.style.top).toBe("20px"); // model line 2
    expect(removed.style.height).toBe("20px");
  });

  test("wrap mapping returning identity behaves exactly like the old single-row path", () => {
    const r = new InlineDiffHighlightsRenderer(parent);
    const same = (m) => m;
    const one = () => 1;
    r.render(ROWS, 1, 3, 20, 500, same, one);
    const els = bands();
    expect(els).toHaveLength(2);
    expect(els[0].style.top).toBe("0px");
    expect(els[0].style.height).toBe("20px");
    expect(els[1].style.top).toBe("20px");
    expect(els[1].style.height).toBe("20px");
  });
});
