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
});
