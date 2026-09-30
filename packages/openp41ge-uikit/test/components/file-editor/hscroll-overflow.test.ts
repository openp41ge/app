// @ts-nocheck
/**
 * Custom horizontal .fe-hscroll bar behavior on the file editor:
 *   - spans the FULL editor width (left:0 / right:0, running under the pinned
 *     line-number gutter and the floating vertical bar)
 *   - while the content overflows horizontally it reserves bottom padding equal
 *     to the bar height below the last line, so the bottom-most line is never
 *     covered when the user scrolls to the end of the file.
 *
 * jsdom does no layout, so overflow is simulated by stubbing the viewport's
 * scrollWidth / clientWidth and re-running the scroll sync.
 */
import { describe, test, expect, beforeEach } from "vitest";
import { PieceTreeTextContentModel } from "openp41ge-editor-engine/model/piece-tree-text-content-model";
import "../../../src/components/file-editor/file-editor";

const CONTENT = "const alpha = 1;\nconst beta = 2;\nconsole.log(alpha, beta);\n";

async function mountEditor(): Promise<HTMLElement> {
  const el = document.createElement("file-editor") as HTMLElement & {
    filePath: string;
    fileName: string;
    textContentModel: unknown;
    _viewportEl: HTMLElement;
    _scrollContentEl: HTMLElement;
    _updateHScroll: () => void;
  };
  el.filePath = `/repo/app.ts`;
  el.fileName = "app.ts";
  el.textContentModel = new PieceTreeTextContentModel("file:///app.ts", CONTENT);
  document.body.appendChild(el);
  await new Promise((r) => setTimeout(r, 40));
  return el;
}

/** Stub the viewport scroll metrics that drive the overflow calculation. */
function setViewport(vp: HTMLElement, scrollWidth: number, clientWidth: number): void {
  Object.defineProperty(vp, "scrollWidth", { configurable: true, value: scrollWidth });
  Object.defineProperty(vp, "clientWidth", { configurable: true, value: clientWidth });
}

describe("file-editor horizontal scrollbar", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  test("track spans the full editor width (left:0 / right:0) when overflowing", async () => {
    const el = await mountEditor();
    const track = el.querySelector(".fe-hscroll") as HTMLElement;
    setViewport(el._viewportEl, 1600, 800);
    el._updateHScroll();

    expect(track.style.display).toBe("");
    expect(track.style.left).toBe("0px");
    expect(track.style.right).toBe("0px");
  });

  test("content gets bottom padding equal to the bar height while overflowing", async () => {
    const el = await mountEditor();
    setViewport(el._viewportEl, 1600, 800);
    el._updateHScroll();

    expect(el._scrollContentEl.style.paddingBottom).toBe("10px");

    // Once the content no longer overflows horizontally, the padding goes away.
    setViewport(el._viewportEl, 800, 800);
    el._updateHScroll();
    expect(el._scrollContentEl.style.paddingBottom).toBe("");
    expect((el.querySelector(".fe-hscroll") as HTMLElement).style.display).toBe("none");
  });
});
