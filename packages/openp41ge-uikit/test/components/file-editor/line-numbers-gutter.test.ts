// @ts-nocheck
/**
 * Tests for the line-numbers gutter (backed by the shared
 * `openp41ge-editor-gutter` host):
 *   1. The AFTER (line-number) column width is decided by the file's line
 *      count (right-aligned numbers only need room for the widest number).
 *   2. Toggling word wrap OFF re-syncs the gutter band to the current visible
 *      model range (the old code kept the wrapped range, leaving the bottom of
 *      the viewport without numbers until the next scroll).
 */
import { describe, test, expect, beforeEach } from "vitest";
import "../../../src/components/file-editor/file-editor";
import { PieceTreeTextContentModel } from "../../../src/file-editor";

const LH = 20;
// A line long enough to wrap into 5 view lines at the default wrap column.
const LONG_LINE = "x".repeat(200);

function makeViewport(el, { clientHeight = 400, scrollTop = 0 } = {}) {
  const vp = el._viewportEl;
  Object.defineProperty(vp, "clientHeight", { value: clientHeight, configurable: true });
  Object.defineProperty(vp, "clientWidth", { value: 600, configurable: true });
  vp.scrollTop = scrollTop;
  return vp;
}

async function mount(file = "app.ts", path = `/repo/${file}`): Promise<HTMLElement & any> {
  const el = document.createElement("file-editor");
  el.filePath = path;
  el.fileName = file;
  document.body.appendChild(el);
  await new Promise((r) => setTimeout(r, 30));
  return el;
}

async function loadFile(el, content, uri = "file:///app.ts", name = "app.ts") {
  const model = new PieceTreeTextContentModel(uri, content);
  el.textContentModel = model;
  await el.loadFile(uri, name);
  await new Promise((r) => setTimeout(r, 30));
  return el;
}

/** The AFTER (line-number) column root element. */
function afterCol(el) {
  return el.querySelector(".eg-col--fe-number");
}

function bandKeys(el) {
  return (el._gutter?._rows ?? []).map((r) => r.key);
}

describe("line-numbers gutter width", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  test("gutter width is decided by the number of lines in the file", async () => {
    const el = await mount();
    (el as unknown as { _charWidth: number })._charWidth = 8;
    // 120 lines → 3 digits → 3*8 + 16 = 40px.
    const content = Array.from({ length: 120 }, (_, i) => `line ${i + 1}`).join("\n");
    await loadFile(el, content);
    await new Promise((r) => setTimeout(r, 20));
    expect(el._gutterRightWidth).toBe(40);
    // The host reflows the AFTER (line-number) column to that width.
    expect(afterCol(el).style.width).toBe("40px");
    // The AFTER column is the only column (no diff) — it sizes the host group.
    expect(el.querySelector(".fe-gutter").style.width).toBe("");
  });

  test("a wider (fewer-digit) file gets a narrower gutter and grows after a line-count increase", async () => {
    const el = await mount();
    (el as unknown as { _charWidth: number })._charWidth = 8;
    await loadFile(el, "a\nb\nc"); // 3 lines → 1 digit → 1*8 + 16 = 24px
    await new Promise((r) => setTimeout(r, 20));
    expect(afterCol(el).style.width).toBe("24px");

    // Insert enough lines to cross the 99→100 digit boundary.
    const many = Array.from({ length: 100 }, (_, i) => `l${i + 1}`).join("\n");
    el.textContentModel.pushEditOperations([
      {
        range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 5 },
        text: many,
      },
    ]);
    await new Promise((r) => setTimeout(r, 30));
    expect(afterCol(el).style.width).toBe("40px"); // 225 digits now
  });

  test("glyph width scales the gutter", async () => {
    const el = await mount();
    (el as unknown as { _charWidth: number })._charWidth = 20;
    const content = Array.from({ length: 120 }, (_, i) => `line ${i + 1}`).join("\n");
    await loadFile(el, content);
    await new Promise((r) => setTimeout(r, 20));
    // 3 digits * 20 + 16 = 76px.
    expect(afterCol(el).style.width).toBe("76px");
  });
});

describe("line numbers re-sync when toggling word wrap off", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  test("after disabling word wrap the overlay covers the current visible model range", async () => {
    const el = await mount();
    (el as unknown as { _charWidth: number })._charWidth = 8;
    // 200 model lines; each LONG_LINE wraps into several view lines when on.
    const content = Array.from({ length: 200 }, () => LONG_LINE).join("\n");
    // Mock a real viewport before load so the initial visible band is nonzero.
    const vp = makeViewport(el, { clientHeight: 400, scrollTop: 0 });
    await loadFile(el, content);
    await new Promise((r) => setTimeout(r, 20));

    // Turn wrapping ON, then scroll far down. In wrapped view-line space the
    // window covers a SMALL model range (67..74) because each model line wraps
    // into several view lines.
    el._toggleWordWrap(true);
    await new Promise((r) => setTimeout(r, 20));
    vp.scrollTop = 199 * LH;
    el._viewportEl.dispatchEvent(new Event("scroll"));
    el._reRenderAll();
    await new Promise((r) => setTimeout(r, 20));
    expect(el._viewLines.startLineNumber).toBeGreaterThan(1); // scrolled down

    // Turn wrapping OFF. Without the fix the overlay kept the wrapped range
    // (67..74) and the view's own range was reset to the top (rebuildAll());
    // with the fix `onScroll` re-syncs both to the real scrolled range.
    el._toggleWordWrap(false);
    await new Promise((r) => setTimeout(r, 20));

    const viewStart = el._viewLines.startLineNumber;
    const viewEnd = el._viewLines.endLineNumber;
    expect(viewStart).toBeGreaterThan(100); // near the bottom, not reset to 1
    expect(viewEnd).toBeGreaterThanOrEqual(viewStart);
    const keys = bandKeys(el);
    // The gutter band must EXACTLY match the view's visible model range
    // (every visible model line has a number; nothing stale is kept).
    expect(Math.min(...keys)).toBe(viewStart);
    expect(Math.max(...keys)).toBe(viewEnd);
  });
});

describe("gutter drag-to-select", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  test("mousedown on a number cell then dragging extends the selection across lines", async () => {
    const el = await mount();
    (el as unknown as { _charWidth: number })._charWidth = 8;
    // Give the viewport a real height so the visible band spans the whole
    // file (jsdom defaults to 0, which would collapse the band after the
    // cursor moves and hide the drag target row).
    makeViewport(el, { clientHeight: 30 * LH });
    const content = Array.from({ length: 30 }, (_, i) => `line ${i + 1}`).join("\n");
    await loadFile(el, content);
    await new Promise((r) => setTimeout(r, 20));

    const after = afterCol(el);
    // Mousedown on line 5's number cell → selects line 5.
    const cell5 = after.querySelector('[data-key="5"]');
    expect(cell5).not.toBeNull();
    cell5.dispatchEvent(
      new MouseEvent("mousedown", { button: 0, clientX: 0, clientY: 4 * 20, bubbles: true, cancelable: true }),
    );
    expect(el._cursorController.selection.selectionStartLineNumber).toBe(5);
    expect(el._cursorController.selection.positionLineNumber).toBe(5);

    // Drag down to line 12 (top = (12-1)*20 = 220; a point inside it = 230).
    document.dispatchEvent(
      new MouseEvent("mousemove", { clientX: 0, clientY: 11 * 20 + 10, buttons: 1, bubbles: true }),
    );
    expect(el._cursorController.selection.positionLineNumber).toBe(12);

    // Every line between the anchor and the drag point is selected, so all
    // of their number cells get the active highlight.
    for (let l = 5; l <= 12; l++) {
      expect(after.querySelector(`[data-key="${l}"]`)?.classList.contains("active-line-number")).toBe(true);
    }
    expect(after.querySelector('[data-key="20"]')?.classList.contains("active-line-number")).toBe(false);

    document.dispatchEvent(new MouseEvent("mouseup", { buttons: 0, bubbles: true }));
  });

  test("dragging upward extends the selection from the anchor line to the higher line", async () => {
    const el = await mount();
    (el as unknown as { _charWidth: number })._charWidth = 8;
    makeViewport(el, { clientHeight: 30 * LH });
    const content = Array.from({ length: 30 }, (_, i) => `line ${i + 1}`).join("\n");
    await loadFile(el, content);
    await new Promise((r) => setTimeout(r, 20));

    const after = afterCol(el);
    after.querySelector('[data-key="10"]').dispatchEvent(
      new MouseEvent("mousedown", { button: 0, clientX: 0, clientY: 9 * 20, bubbles: true, cancelable: true }),
    );
    // Drag UP to line 3.
    document.dispatchEvent(
      new MouseEvent("mousemove", { clientX: 0, clientY: 2 * 20 + 10, buttons: 1, bubbles: true }),
    );
    const sel = el._cursorController.selection;
    expect(Math.min(sel.selectionStartLineNumber, sel.positionLineNumber)).toBe(3);
    expect(Math.max(sel.selectionStartLineNumber, sel.positionLineNumber)).toBe(10);

    document.dispatchEvent(new MouseEvent("mouseup", { buttons: 0, bubbles: true }));
  });
});
