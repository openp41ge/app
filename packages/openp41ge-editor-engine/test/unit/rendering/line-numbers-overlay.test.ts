/**
 * Unit tests for LineNumbersOverlay's scroll-band painting.
 *
 * The hot path is `setVisibleRange` — on every scroll that advances the
 * visible band it re-paints the number cells. This file pins the crucial
 * performance contract that keeps the editor feeling smooth:
 *
 *   - Re-painting the SAME visible range must be a no-op: zero DOM mutations
 *     (no style writes, no text changes, no classlist churn).
 *   - A shifted band must only ADD the label that entered and REMOVE the one
 *     that left — every other label is left untouched (no attribute writes).
 *   - Decoration-class changes still apply (and re-applying an unchanged
 *     decoration is again a no-op).
 *
 * Before the write-on-change rewrite each scroll-range-change rebuilt every
 * band label (top/height/text/classes for ~50 lines), which put the main
 * thread behind the compositor and made the number columns visibly lag the
 * content while scrolling.
 */
import { describe, test, expect, beforeEach } from "vitest";
import { LineNumbersOverlay, type LineNumbersOverlayConfig } from "../../../src/rendering/line-numbers-overlay";

const LH = 20;

function setup(config: Partial<LineNumbersOverlayConfig> = {}) {
  const gutter = document.createElement("div");
  document.body.appendChild(gutter);
  const overlay = new LineNumbersOverlay(gutter, {
    gutterWidth: 50,
    lineHeight: LH,
    ...config,
  });
  const container: HTMLElement = (overlay as unknown as { _scrollContainer: { element: HTMLElement } })._scrollContainer.element;
  return { gutter, overlay, container };
}

/** Collect MutationRecords across all mutation kinds for the subtree. */
function observeMutations(root: HTMLElement) {
  const records: MutationRecord[] = [];
  const mo = new MutationObserver((recs) => records.push(...recs));
  mo.observe(root, { subtree: true, childList: true, attributes: true, characterData: true });
  return { records, disconnect: () => mo.disconnect() };
}

describe("LineNumbersOverlay setVisibleRange", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  test("re-painting the same range is a no-op", async () => {
    const { overlay, container } = setup();
    overlay.setVisibleRange(4, 8);
    const before = container.querySelectorAll(".line-number").length;

    const { records, disconnect } = observeMutations(container);
    overlay.setVisibleRange(4, 8);
    disconnect();

    expect(records).toEqual([]); // no childList / no attribute / no text writes
    expect(container.querySelectorAll(".line-number").length).toBe(before);
  });

  test("a shifted band adds the entering label and removes the leaving one only", async () => {
    const { overlay, container } = setup();
    overlay.setVisibleRange(4, 8);
    const preExisting = new Set(container.querySelectorAll("*"));

    const { records, disconnect } = observeMutations(container);
    overlay.setVisibleRange(5, 9);
    await new Promise((r) => setTimeout(r, 0));
    disconnect();

    const isCell = (n: Node) => n instanceof Element && n.classList.contains("line-number-wrapper");
    const childAdds = records.filter((r) => r.type === "childList" && [...r.addedNodes].some(isCell));
    const childRemoves = records.filter((r) => r.type === "childList" && [...r.removedNodes].some(isCell));
    // No attribute/text writes may land on a REUSED (pre-existing) element —
    // only the newly-added label may be written after it is appended.
    const writesOnExisting = records.filter(
      (r) =>
        (r.type === "attributes" || r.type === "characterData") &&
        r.target instanceof Element &&
        preExisting.has(r.target),
    );

    expect(writesOnExisting).toEqual([]);
    // Exactly one label entered (line 9) and one left (line 4).
    expect(childAdds.length).toBe(1);
    expect(childRemoves.length).toBe(1);
    // Reused labels still render the same line numbers.
    const after = Array.from(container.querySelectorAll(".line-number")).map((n) => n.textContent);
    expect(after).toEqual(["5", "6", "7", "8", "9"]);
    // Position of a reused label is unchanged.
    const line6 = Array.from(container.querySelectorAll(".line-number")).find((n) => n.textContent === "6")!;
    expect(line6.parentElement!.style.top).toBe("100px"); // (6-1)*20
  });

  test("decoration classes apply once and re-applying the same decoration is a no-op", async () => {
    let decorationCalls = 0;
    const { overlay, container } = setup({
      getLabelDecoration: (line) => {
        decorationCalls++;
        return line % 2 === 0 ? "fe-inline-added-cell" : "";
      },
    });
    overlay.setVisibleRange(2, 5);
    // Decoration lands on BOTH the one-row label AND its full-height wrapper
    // (so a wrapped row tints every segment) — 2 elements per even line.
    expect(container.querySelectorAll(".fe-inline-added-cell").length).toBe(4);
    expect(container.querySelectorAll(".line-number.fe-inline-added-cell").length).toBe(2);

    const { records, disconnect } = observeMutations(container);
    overlay.setVisibleRange(2, 5);
    await new Promise((r) => setTimeout(r, 0));
    disconnect();

    expect(records).toEqual([]);
    // Decoration provider is still consulted every repaint (it may depend on
    // state), but the DOM goes untouched because the value did not change.
    expect(decorationCalls).toBeGreaterThan(2);
  });

  test("changing a decoration actually repaints that cell", async () => {
    let cls: string | undefined;
    const { overlay, container } = setup({
      getLabelDecoration: (line) => (line === 3 ? (cls ?? "") : ""),
    });
    overlay.setVisibleRange(1, 5);
    expect(container.querySelectorAll(".fe-inline-added-cell").length).toBe(0);

    cls = "fe-inline-added-cell";
    const { records, disconnect } = observeMutations(container);
    overlay.setVisibleRange(1, 5);
    await new Promise((r) => setTimeout(r, 0));
    disconnect();

    const attrMutations = records.filter((r) => r.type === "attributes");
    expect(attrMutations.length).toBeGreaterThan(0);
    const labels = Array.from(container.querySelectorAll(".line-number"));
    expect(labels.filter((l) => l.textContent === "3")[0]!.classList.contains("fe-inline-added-cell")).toBe(true);
  });
});

describe("LineNumbersOverlay hover highlight", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  test("setHoverLine lights the cell (label + wrapper) and clears it", () => {
    const { overlay, container } = setup();
    overlay.setVisibleRange(1, 3);
    expect(container.querySelectorAll(".line-number-hover").length).toBe(0);

    overlay.setHoverLine(2);
    const label2 = container.querySelector('.line-number[data-line="2"]');
    const wrap2 = container.querySelector('.line-number-wrapper[data-line="2"]');
    expect(label2!.classList.contains("line-number-hover")).toBe(true);
    expect(wrap2!.classList.contains("line-number-hover")).toBe(true);
    expect(container.querySelector('.line-number[data-line="1"]')!.classList.contains("line-number-hover")).toBe(false);

    overlay.setHoverLine(null);
    expect(label2!.classList.contains("line-number-hover")).toBe(false);
    expect(wrap2!.classList.contains("line-number-hover")).toBe(false);

    // A band repaint keeps the hover state coherent (no stale class).
    overlay.setHoverLine(2);
    overlay.setVisibleRange(1, 3);
    expect(container.querySelector('.line-number[data-line="2"]')!.classList.contains("line-number-hover")).toBe(true);
    overlay.setHoverLine(null);
  });

  test("cells carry a data-line attribute for cross-column hover resolution", () => {
    const { overlay, container } = setup();
    overlay.setVisibleRange(5, 6);
    expect(container.querySelector('.line-number[data-line="5"]')).not.toBeNull();
    expect(container.querySelector('.line-number-wrapper[data-line="6"]')).not.toBeNull();
  });
});
