// @ts-nocheck
/**
 * Tests for InlineDiffGutterColumns — the extra BEFORE line-number column in
 * the inline commit-diff view.
 *
 * Contracts pinned here:
 *  - Labels sit at ABSOLUTE document positions `(line - 1) * lineHeight`,
 *    regardless of the rendered band (regression: they were band-relative, so
 *    numbers misplaced once scrolled).
 *  - The column is position:sticky + left:0 INSIDE the viewport's scroll
 *    container — native vertical scroll, pinned horizontally (no transform
 *    follower; that is what keeps it lockstep with the compositor).
 *  - A removed row's label carries the red cell class (fe-inline-removed-cell);
 *    there is no +/- sign column anymore.
 *  - setScrollOffset is a no-op (native scroll owns the offset now).
 */
import { describe, test, expect, beforeEach } from "vitest";
import { InlineDiffGutterColumns } from "../../../src/components/file-editor/inline-diff-gutter-columns";

const LH = 20;

function setup() {
  const content = document.createElement("div");
  content.id = "content";
  const gutter = document.createElement("div");
  gutter.id = "gutter";
  content.appendChild(gutter);
  document.body.appendChild(content);
  const cols = new InlineDiffGutterColumns(content, gutter, LH);
  return { content, gutter, cols };
}

function leftLabels(): HTMLElement[] {
  return [
    ...document.querySelectorAll("#content .fe-inline-left .fe-inline-left-label"),
  ];
}

function leftTops(): string[] {
  return leftLabels().map((n) => n.style.top);
}

describe("InlineDiffGutterColumns", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  test("labels sit at absolute document positions regardless of the rendered band", () => {
    const { cols } = setup();
    cols.setSizes(LH, 50);
    cols.setRows({ infoFor: (line) => ({ leftLabel: String(line), cls: "" }) });

    cols.setVisibleRange(3, 5);
    expect(leftTops()).toEqual(["40px", "60px", "80px"]); // (line-1)*20

    cols.setVisibleRange(7, 9);
    expect(leftTops()).toEqual(["120px", "140px", "160px"]);
  });

  test("the column is relative: pinning is owned by the sticky .fe-gutter-group", () => {
    const { cols } = setup();
    const outer = document.querySelector(".fe-inline-left");
    // The BEFORE column itself is plain (relative) — it must NOT be sticky:
    // horizontal pinning is owned by the .fe-gutter-group wrapper the editor
    // places both number columns in, so they pin together and never overlap.
    expect(outer.style.position).toBe("relative");
    expect(outer.style.left).toBe("");
    // setScrollOffset used to drive a per-frame transform; it must now be a
    // no-op so only NATIVE scrolling moves the numbers (no harness lag).
    cols.setSizes(LH, 50);
    cols.setScrollOffset(9999);
    expect(outer.querySelector(".fe-inline-left-label")).toBeNull(); // nothing moved
    expect(outer.firstElementChild.style.transform).toBe("");
  });

  test("labels are FULL-WIDTH + flex-end so numbers are right-aligned (place values line up)", () => {
    const { cols } = setup();
    cols.setSizes(LH, 50);
    cols.setRows({ infoFor: (line) => ({ leftLabel: String(line), cls: "" }) });
    cols.setVisibleRange(9, 10); // forces a 2-digit "10" next to "9"

    const labels = leftLabels();
    for (const l of labels) {
      // Shrink-to-fit absolute boxes ignore flex-end; full column width is
      // required for the right-alignment the normal gutter already has.
      expect(l.style.left).toBe("0px");
      expect(l.style.right).toBe("0px");
      expect(l.style.justifyContent).toBe("flex-end");
      expect(l.style.boxSizing).toBe("border-box");
      // Clickable, so it needs the same pointer cursor as the AFTER column.
      expect(l.style.cursor).toBe("pointer");
    }
  });

  test("setActiveLines highlights only the selected rows' left cells", () => {
    const { cols } = setup();
    cols.setSizes(LH, 50);
    cols.setRows({ infoFor: (line) => ({ leftLabel: String(line), cls: "" }) });
    cols.setVisibleRange(1, 4);

    // A single cursor line.
    cols.setActiveLines([2]);
    let labels = leftLabels();
    expect(labels[1].classList.contains("fe-inline-left-active")).toBe(true);
    expect(labels[0].classList.contains("fe-inline-left-active")).toBe(false);
    expect(labels[2].classList.contains("fe-inline-left-active")).toBe(false);

    // A multi-row selection highlights every covered line.
    cols.setActiveLines([1, 2, 3]);
    labels = leftLabels();
    expect(labels[0].classList.contains("fe-inline-left-active")).toBe(true);
    expect(labels[1].classList.contains("fe-inline-left-active")).toBe(true);
    expect(labels[2].classList.contains("fe-inline-left-active")).toBe(true);
    expect(labels[3].classList.contains("fe-inline-left-active")).toBe(false);

    // A repaint keeps the selected rows highlighted (fresh labels get the
    // class).
    cols.setVisibleRange(1, 4);
    const after = leftLabels();
    expect(after[0].classList.contains("fe-inline-left-active")).toBe(true);
    expect(after[2].classList.contains("fe-inline-left-active")).toBe(true);

    // Clearing removes it everywhere.
    cols.setActiveLines(null);
    for (const l of leftLabels()) {
      expect(l.classList.contains("fe-inline-left-active")).toBe(false);
    }
  });

  test("clicking a left number invokes the injected onLineClick with the line", () => {
    const clicks: number[] = [];
    const content = document.createElement("div");
    const gutter = document.createElement("div");
    content.appendChild(gutter);
    document.body.appendChild(content);
    const cols = new InlineDiffGutterColumns(content, gutter, LH, (ln) => clicks.push(ln));
    cols.setRows({ infoFor: (line) => ({ leftLabel: String(line), cls: "" }) });
    cols.setVisibleRange(5, 5);

    (document.querySelector(".fe-inline-left .fe-inline-left-label") as HTMLElement).dispatchEvent(
      new MouseEvent("click", { bubbles: true }),
    );
    expect(clicks).toEqual([5]);
  });

  test("word wrap: labels anchor at the first view segment and span the wrapped height", () => {
    const { cols } = setup();
    cols.setSizes(LH, 50);
    cols.setRows({ infoFor: (line) => ({ leftLabel: String(line), cls: "" }) });

    // Fake wrap mapping: line 1 -> view 1 (1 segment), line 2 -> view 2
    // spanning THREE segments, line 3 -> view 5 (1 segment).
    const viewStart = (m: number) => ({ 1: 1, 2: 2, 3: 5 }[m] ?? m);
    const viewCount = (m: number) => (m === 2 ? 3 : 1);
    cols.setVisibleRange(1, 3, viewStart, viewCount);

    const labels = leftLabels();
    expect(labels[0].style.top).toBe("0px");
    expect(labels[0].style.height).toBe("20px");
    expect(labels[1].style.top).toBe("20px"); // (vStart 2 - 1)*20
    expect(labels[1].style.height).toBe("60px"); // 3 segments
    expect(labels[2].style.top).toBe("80px"); // (vStart 5 - 1)*20
    expect(labels[2].style.height).toBe("20px");

    // The number text is top-aligned within its (possibly tall) cell so it
    // sits on the first segment, matching the normal gutter.
    expect(labels[1].style.alignItems).toBe("flex-start");
  });

  test("removed rows get the red cell class; there is no sign column", () => {
    const { cols } = setup();
    cols.setSizes(LH, 50);
    cols.setRows({
      infoFor: (line) =>
        line === 2
          ? { leftLabel: "99", cls: "fe-inline-removed-cell" }
          : { leftLabel: String(line), cls: "" },
    });
    cols.setVisibleRange(1, 3);

    const labels = leftLabels();
    expect(labels[1].classList.contains("fe-inline-removed-cell")).toBe(true);
    expect(labels[0].classList.contains("fe-inline-removed-cell")).toBe(false);
    expect(labels[2].classList.contains("fe-inline-removed-cell")).toBe(false);
    // No sign/glyph column anywhere.
    expect(document.querySelector(".fe-inline-sign")).toBeNull();
    expect(document.querySelector(".fe-sign-add")).toBeNull();
    expect(document.querySelector(".fe-sign-rem")).toBeNull();
  });

  test("columns are hidden until rows are attached, then visible", () => {
    const { cols } = setup();
    expect(document.querySelector(".fe-inline-left").style.display).toBe("none");
    cols.setRows({ infoFor: () => ({ leftLabel: "", cls: "" }) });
    expect(document.querySelector(".fe-inline-left").style.display).not.toBe("none");
  });

  test("dispose removes the extra column from the content row", () => {
    const { cols } = setup();
    cols.setRows({ infoFor: () => ({ leftLabel: "", cls: "" }) });
    cols.dispose();
    expect(document.querySelector(".fe-inline-left")).toBeNull();
  });

  test("re-painting the same band range is a no-op (no style/text/class writes)", async () => {
    const { cols } = setup();
    cols.setSizes(LH, 50);
    cols.setRows({ infoFor: (line) => ({ leftLabel: String(line), cls: line % 2 === 0 ? "fe-inline-removed-cell" : "" }) });
    cols.setVisibleRange(3, 7);

    const container = document.querySelector(".fe-inline-left")!;
    const records: MutationRecord[] = [];
    const mo = new MutationObserver((rs) => records.push(...rs));
    mo.observe(container, { subtree: true, childList: true, attributes: true, characterData: true });

    cols.setVisibleRange(3, 7);
    await new Promise((r) => setTimeout(r, 0));
    mo.disconnect();

    expect(records).toEqual([]);
  });

  test("a shifted band only adds the entering cell, keeps reused cells untouched", async () => {
    const { cols } = setup();
    cols.setSizes(LH, 50);
    cols.setRows({ infoFor: (line) => ({ leftLabel: String(line), cls: "" }) });
    cols.setVisibleRange(3, 6);
    const container = document.querySelector(".fe-inline-left")!;
    const preExisting = new Set(container.querySelectorAll("*"));

    const records: MutationRecord[] = [];
    const mo = new MutationObserver((rs) => records.push(...rs));
    mo.observe(container, { subtree: true, childList: true, attributes: true, characterData: true });

    cols.setVisibleRange(4, 7);
    await new Promise((r) => setTimeout(r, 0));
    mo.disconnect();

    const attrMutations = records.filter(
      (r) => r.type === "attributes" && r.target instanceof Element && preExisting.has(r.target),
    );
    // Count CELL-level additions/removals (textContent of the fresh cell also
    // produces a childList record on that same new element — allowed).
    const isCell = (n: Node) => n instanceof Element && n.classList.contains("fe-inline-left-label");
    const cellAdds = records.filter((r) => r.type === "childList" && [...r.addedNodes].some(isCell));
    const cellRemoves = records.filter((r) => r.type === "childList" && [...r.removedNodes].some(isCell));
    expect(attrMutations).toEqual([]); // existing cells untouched
    expect(cellAdds.length).toBe(1); // line 7 entered
    expect(cellRemoves.length).toBe(1); // line 3 left
    const labels = leftLabels().map((n) => n.textContent);
    expect(labels).toEqual(["4", "5", "6", "7"]);
    expect(leftLabels()[1].style.top).toBe("80px"); // (5-1)*20, unchanged
  });

  test("setActiveLines updates the cache so a later band repaint stays quiet", async () => {
    const { cols } = setup();
    cols.setSizes(LH, 50);
    cols.setRows({ infoFor: () => ({ leftLabel: "", cls: "" }) });
    cols.setVisibleRange(1, 4);
    cols.setActiveLines(new Set([2]));

    // First repaint after the selection change must not re-write anything.
    const container = document.querySelector(".fe-inline-left")!;
    const records: MutationRecord[] = [];
    const mo = new MutationObserver((rs) => records.push(...rs));
    mo.observe(container, { subtree: true, childList: true, attributes: true, characterData: true });

    cols.setVisibleRange(1, 4);
    await new Promise((r) => setTimeout(r, 0));
    mo.disconnect();
    expect(records).toEqual([]);

    // And the active class is genuinely present.
    expect(leftLabels()[1].classList.contains("fe-inline-left-active")).toBe(true);
    expect(leftLabels()[0].classList.contains("fe-inline-left-active")).toBe(false);
  });
});
