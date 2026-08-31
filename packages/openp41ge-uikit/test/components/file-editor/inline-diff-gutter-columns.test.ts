// @ts-nocheck
/**
 * Tests for InlineDiffGutterColumns — the extra BEFORE line-number column in
 * the inline commit-diff view.
 *
 * Contracts pinned here:
 *  - Labels sit at ABSOLUTE document positions `(line - 1) * lineHeight`,
 *    regardless of the rendered band (regression: they were band-relative, so
 *    numbers misplaced once scrolled).
 *  - The inner container's transform tracks setScrollOffset exactly (same
 *    convention as the normal gutter).
 *  - A removed row's label carries the red cell class (fe-inline-removed-cell);
 *    there is no +/- sign column anymore.
 *  - Wheel events over the column scroll the editor viewport (hovering the
 *    line numbers scrolls normally).
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
  const viewport = document.createElement("div");
  viewport.style.overflowY = "auto";
  content.appendChild(viewport);
  document.body.appendChild(content);
  const cols = new InlineDiffGutterColumns(content, gutter, LH, viewport);
  return { content, gutter, viewport, cols };
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

    cols.setScrollOffset(40);
    cols.setVisibleRange(7, 9);
    expect(leftTops()).toEqual(["120px", "140px", "160px"]);
  });

  test("scroll offset transforms the inner container exactly like the gutter", () => {
    const { cols } = setup();
    cols.setSizes(LH, 50);
    cols.setRows({ infoFor: () => ({ leftLabel: "", cls: "" }) });
    cols.setVisibleRange(1, 2);

    cols.setScrollOffset(0);
    expect(
      document.querySelector("#content .fe-inline-left").firstElementChild.style
        .transform,
    ).toBe("translate3d(0, 0px, 0)");

    cols.setScrollOffset(123 * LH);
    expect(
      document.querySelector("#content .fe-inline-left").firstElementChild.style
        .transform,
    ).toBe("translate3d(0, -2460px, 0)");
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

  test("wheel over the column scrolls the editor viewport", () => {
    const { cols, viewport } = setup();
    cols.setRows({ infoFor: () => ({ leftLabel: "", cls: "" }) });
    viewport.scrollTop = 120;

    const ev = new WheelEvent("wheel", { deltaY: 90, cancelable: true });
    let defaultPrevented = false;
    Object.defineProperty(ev, "preventDefault", {
      value: () => {
        defaultPrevented = true;
      },
    });
    document.querySelector(".fe-inline-left").dispatchEvent(ev);

    expect(defaultPrevented).toBe(true);
    expect(viewport.scrollTop).toBe(210);
  });

  test("dispose removes the extra column from the content row", () => {
    const { cols } = setup();
    cols.setRows({ infoFor: () => ({ leftLabel: "", cls: "" }) });
    cols.dispose();
    expect(document.querySelector(".fe-inline-left")).toBeNull();
  });
});
