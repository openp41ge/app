// @ts-nocheck
/**
 * Tests for the line-numbers gutter:
 *   1. The gutter width is decided by the file's line count (right-aligned
 *      numbers only need room for the widest number).
 *   2. Toggling word wrap OFF re-syncs the line-number overlay to the current
 *      visible model range (the old code kept the wrapped range, leaving the
 *      bottom of the viewport without numbers until the next scroll).
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
    expect(el._lineNumbersOverlay._config.gutterWidth).toBe(40);
    expect(el.querySelector(".fe-gutter").style.width).toBe("40px");
    // The overlay's config is what the label wrappers use.
    expect(el._gutterEl.style.width).toBe("40px");
  });

  test("a wider (fewer-digit) file gets a narrower gutter and grows after a line-count increase", async () => {
    const el = await mount();
    (el as unknown as { _charWidth: number })._charWidth = 8;
    await loadFile(el, "a\nb\nc"); // 3 lines → 1 digit → 1*8 + 16 = 24px
    await new Promise((r) => setTimeout(r, 20));
    expect(el.querySelector(".fe-gutter").style.width).toBe("24px");

    // Insert enough lines to cross the 99→100 digit boundary.
    const many = Array.from({ length: 100 }, (_, i) => `l${i + 1}`).join("\n");
    el.textContentModel.pushEditOperations([
      {
        range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 5 },
        text: many,
      },
    ]);
    await new Promise((r) => setTimeout(r, 30));
    expect(el.querySelector(".fe-gutter").style.width).toBe("40px"); // 3 digits now
  });

  test("glyph width scales the gutter", async () => {
    const el = await mount();
    (el as unknown as { _charWidth: number })._charWidth = 20;
    const content = Array.from({ length: 120 }, (_, i) => `line ${i + 1}`).join("\n");
    await loadFile(el, content);
    await new Promise((r) => setTimeout(r, 20));
    // 3 digits * 20 + 16 = 76px.
    expect(el.querySelector(".fe-gutter").style.width).toBe("76px");
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
    const entries = [...el._lineNumbersOverlay._entries.keys()];
    // The overlay's entry set must EXACTLY match the view's visible model range
    // (every visible model line has a number; nothing stale is kept).
    expect(Math.min(...entries)).toBe(viewStart);
    expect(Math.max(...entries)).toBe(viewEnd);
  });
});
