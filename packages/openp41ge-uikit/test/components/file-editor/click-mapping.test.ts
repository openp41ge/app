// @ts-nocheck
/**
 * Regression test for the click→column mapping in the file editor.
 *
 * The viewport's scroll area includes the pinned line-number gutter (one or
 * two columns for diff views) to the LEFT of the text region. A mouse click is
 * measured from the viewport's left edge, so it must be shifted in by the
 * pinned gutter width before the column is computed — otherwise the caret and
 * selection land a whole gutter-width to the RIGHT of the glyph the user
 * clicked. That offset grows with the line-number digit count (larger files)
 * and doubles for diff views.
 */
import { describe, test, expect, beforeEach } from "vitest";
import "../../../src/components/file-editor/file-editor";
import { PieceTreeTextContentModel } from "../../../src/file-editor";

const LH = 20;
const CW = 8;

async function mount(file = "app.ts", path = `/repo/${file}`): Promise<HTMLElement & any> {
  const el = document.createElement("file-editor") as HTMLElement & any;
  el.filePath = path;
  el.fileName = file;
  document.body.appendChild(el);
  await new Promise((r) => setTimeout(r, 30));
  return el;
}

async function loadFile(el, content) {
  const model = new PieceTreeTextContentModel("file:///app.ts", content);
  el.textContentModel = model;
  await el.loadFile("file:///app.ts", "app.ts");
  await new Promise((r) => setTimeout(r, 30));
  return el;
}

/** Force a nonzero pinned gutter group and a zero-scroll viewport. */
function setupGeometry(el, gutterWidth) {
  el._charWidth = CW;
  el._lineHeight = LH;
  const vp = el._viewportEl;
  Object.defineProperty(vp, "clientWidth", { value: 600, configurable: true });
  Object.defineProperty(vp, "scrollLeft", { value: 0, configurable: true });
  Object.defineProperty(vp, "scrollTop", { value: 0, configurable: true });
  Object.defineProperty(el._gutterGroupEl, "offsetWidth", { value: gutterWidth, configurable: true });
}

describe("file-editor click → column mapping (gutter offset)", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  /** Click at the START of a given column's glyph and assert the mapped column. */
  function assertColumnForGlyph(el, col, gutterWidth) {
    setupGeometry(el, gutterWidth);
    // textRegion x of the glyph start = leftOffset(8) + (col-1)*cw.
    // viewport x = gutterWidth + textRegion x.
    const textX = 8 + (col - 1) * CW;
    const clickX = gutterWidth + textX;
    const clickY = 5; // on line 1
    return el._viewportPosToLineCol(clickX, clickY);
  }

  test("column 3 is mapped correctly even with a 3-digit gutter", async () => {
    const el = await mount();
    await loadFile(el, "abcd\nEFGH\nijkl\n");
    // 120+ line file → 3 digit gutter → 40px. Click the start of glyph col 3.
    const pos = assertColumnForGlyph(el, 3, 40);
    expect(pos.line).toBe(1);
    expect(pos.col).toBe(3);
  });

  test("the mapping is insensitive to the gutter width (not shifted right by it)", async () => {
    const el = await mount();
    await loadFile(el, "abcd\nEFGH\nijkl\n");
    // Same glyph (col 3) with different gutter widths must map to the SAME column.
    const narrow = assertColumnForGlyph(el, 3, 24);
    const wide = assertColumnForGlyph(el, 3, 72);
    expect(narrow.col).toBe(wide.col);
    expect(narrow.col).toBe(3);
  });

  test("diff view (two number columns) still maps to the correct column", async () => {
    const el = await mount();
    await loadFile(el, "abcd\nEFGH\nijkl\n");
    // Two 40px columns side-by-side → 80px pinned gutter group.
    const pos = assertColumnForGlyph(el, 2, 80);
    expect(pos.line).toBe(1);
    expect(pos.col).toBe(2);
  });
});
