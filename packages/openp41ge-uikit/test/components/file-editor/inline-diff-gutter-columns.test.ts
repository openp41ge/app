// @ts-nocheck
/**
 * Regression test for InlineDiffGutterColumns scroll alignment.
 *
 * Bug: the left/sign column labels were positioned relative to the visible
 * band start (`(line - start) * lineHeight`) instead of absolute document
 * positions (`(line - 1) * lineHeight`), so once scrolled the setScrollOffset
 * CSS transform (which assumes document coordinates, like the normal gutter)
 * landed the numbers in the wrong place.
 *
 * Pins the contract: regardless of which band is rendered, every label sits at
 * `(line - 1) * lineHeight`, and the inner containers' transform matches the
 * scroll offset exactly (translate3d(0, -scrollTop, 0)).
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

function leftTops(cols): string[] {
  return [
    ...document
      .querySelectorAll("#content .fe-inline-left .fe-inline-left-label")
  ].map((n) => n.style.top);
}

function innerTransforms(): { left: string; sign: string } {
  const l = document.querySelector("#content .fe-inline-left").firstElementChild;
  const s = document.querySelector("#content .fe-inline-sign").firstElementChild;
  return { left: l.style.transform, sign: s.style.transform };
}

describe("InlineDiffGutterColumns", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  test("labels sit at absolute document positions regardless of the rendered band", () => {
    const { cols } = setup();
    cols.setSizes(LH, 50, 20);
    cols.setRows({
      infoFor: (line) => ({ leftLabel: String(line), sign: "+" }),
    });

    // Render a band starting at line 3.
    cols.setVisibleRange(3, 5);
    expect(leftTops(cols)).toEqual(["40px", "60px", "80px"]); // (line-1)*20

    // Scroll and repaint a deeper band — positions are absolute again.
    cols.setScrollOffset(40);
    cols.setVisibleRange(7, 9);
    expect(leftTops(cols)).toEqual(["120px", "140px", "160px"]);
  });

  test("scroll offset transforms the inner containers exactly like the gutter", () => {
    const { cols } = setup();
    cols.setSizes(LH, 50, 20);
    cols.setRows({ infoFor: () => ({ leftLabel: "", sign: "" }) });
    cols.setVisibleRange(1, 2);

    cols.setScrollOffset(0);
    expect(innerTransforms()).toEqual({ left: "translate3d(0, 0px, 0)", sign: "translate3d(0, 0px, 0)" });

    cols.setScrollOffset(123 * LH);
    expect(innerTransforms()).toEqual({
      left: "translate3d(0, -2460px, 0)",
      sign: "translate3d(0, -2460px, 0)",
    });
  });

  test("columns are hidden until rows are attached, then visible", () => {
    const { cols } = setup();
    expect(document.querySelector(".fe-inline-left").style.display).toBe("none");
    cols.setRows({ infoFor: () => ({ leftLabel: "", sign: "" }) });
    expect(document.querySelector(".fe-inline-left").style.display).not.toBe("none");
  });

  test("dispose removes both extra columns from the content row", () => {
    const { cols } = setup();
    cols.setRows({ infoFor: () => ({ leftLabel: "", sign: "" }) });
    cols.dispose();
    expect(document.querySelector(".fe-inline-left")).toBeNull();
    expect(document.querySelector(".fe-inline-sign")).toBeNull();
  });
});
