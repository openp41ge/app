// @ts-nocheck
/**
 * <json-editor> component tests: the text-based (file-editor style) JSON
 * editor — raw text in a hidden-overlay textarea, rendered content view with
 * line numbers + highlighting, auto-closing pairs, auto-indent, auto-format,
 * and live value parsing / change events.
 */
import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import "../src/json-editor";
import {
  JSON_EDITOR_CHANGE,
  gutterWidthFor,
  DEFAULT_DIGIT_PX,
  TOOLTIP_DELAY_MS,
} from "../src/json-editor";

const CONFIG = {
  providerId: "vllm",
  providers: {
    vllm: {
      baseUrl: "http://localhost:8000/v1",
      model: "Qwen2.5-Coder-7B-Instruct",
      models: [{ id: "Qwen2.5-Coder", maxTokens: 2048 }],
    },
  },
};

async function mount(value = CONFIG, readonly = false) {
  const el = document.createElement("json-editor");
  el.value = value;
  el.readonly = readonly;
  document.body.appendChild(el);
  await new Promise((r) => setTimeout(r, 20));
  return el;
}

/** The editor's hidden textarea (the actual edit surface). */
function hoverRow(el, rowIdx) {
  const ta = input(el);
  const ev = new MouseEvent("mousemove", {
    bubbles: true,
    composed: true,
    clientX: 100,
    clientY: 100,
  });
  Object.defineProperty(ev, "offsetX", { value: 40 });
  Object.defineProperty(ev, "offsetY", { value: rowIdx * 20 + 10 });
  ta.dispatchEvent(ev);
}

function input(el) {
  return el.shadowRoot.querySelector("textarea.je-input");
}

/** Set the textarea content and dispatch an input event. */
function type(el, text) {
  const ta = input(el);
  ta.value = text;
  ta.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
}

describe("json-editor", () => {
  let el;

  beforeEach(async () => {
    el = await mount();
  });

  test("renders the whole JSON as a text area with line numbers + highlighting", () => {
    const ta = input(el);
    expect(ta).toBeTruthy();
    expect(ta.value.includes('"baseUrl"')).toBe(true);
    expect(ta.value.includes("http://localhost:8000/v1")).toBe(true);
    // Content view renders the highlighted lines beneath the textarea.
    const lineCount = el.shadowRoot.querySelectorAll(".je-line").length;
    expect(lineCount).toBeGreaterThan(3);
    expect(el.shadowRoot.querySelectorAll(".eg-col--line-numbers .eg-cell").length).toBe(lineCount);
    expect(el.shadowRoot.querySelectorAll(".s-var").length).toBeGreaterThan(0);
    expect(el.shadowRoot.querySelectorAll(".s-str").length).toBeGreaterThan(0);
    expect(el.shadowRoot.querySelectorAll(".s-num").length).toBeGreaterThan(0);
  });

  test("editedValue reflects the configured value", () => {
    expect(el.editedValue).toEqual(CONFIG);
  });

  test("typing in the textarea updates editedValue", () => {
    const ta = input(el);
    const next = ta.value.replace("localhost:8000", "localhost:9000");
    type(el, next);
    expect(el.editedValue.providers.vllm.baseUrl).toBe("http://localhost:9000/v1");
  });

  test("emits json-editor-change with the parsed value on a valid edit", async () => {
    let detail = null;
    el.addEventListener(JSON_EDITOR_CHANGE, (e) => (detail = e.detail));
    const ta = input(el);
    type(el, ta.value.replace("localhost:8000", "localhost:9000"));
    await el.updateComplete;
    expect(detail).toBeTruthy();
    expect(detail.value.providers.vllm.baseUrl).toBe("http://localhost:9000/v1");
  });

  test("does not emit change while the text is transiently invalid", () => {
    let count = 0;
    el.addEventListener(JSON_EDITOR_CHANGE, () => count++);
    type(el, '{ "providers": { "vllm": { oops }');
    expect(el.editedValue).toEqual(CONFIG); // last valid value carried
    expect(count).toBe(0);
  });

  test("auto-closes braces and brackets and steps over the closing one", () => {
    const ta = input(el);
    const len = ta.value.length;
    ta.setSelectionRange(len, len);
    ta.dispatchEvent(new KeyboardEvent("keydown", { key: "{", bubbles: true }));
    expect(ta.value.endsWith("{}")).toBe(true);
    expect(ta.selectionStart).toBe(len + 1);
    ta.dispatchEvent(new KeyboardEvent("keydown", { key: "}", bubbles: true }));
    expect(ta.value.endsWith("{}")).toBe(true);
    expect(ta.selectionStart).toBe(len + 2);
  });

  test("auto-closes a quote and steps over an auto-closed quote", () => {
    const ta = input(el);
    const len = ta.value.length;
    ta.setSelectionRange(len, len);
    ta.dispatchEvent(new KeyboardEvent("keydown", { key: '"', bubbles: true }));
    expect(ta.value.slice(len, len + 2)).toBe('""');
    expect(ta.selectionStart).toBe(len + 1);
  });

  test("backspace removes an empty auto-closed pair", () => {
    const ta = input(el);
    const len = ta.value.length;
    ta.setSelectionRange(len, len);
    ta.dispatchEvent(new KeyboardEvent("keydown", { key: "{", bubbles: true }));
    ta.setSelectionRange(len + 1, len + 1);
    ta.dispatchEvent(new KeyboardEvent("keydown", { key: "Backspace", bubbles: true }));
    expect(ta.value.endsWith("{}")).toBe(false);
    expect(ta.selectionStart).toBe(len);
  });

  test("Enter auto-indents to the current brace depth", async () => {
    const el2 = await mount({ a: 1 });
    const ta = input(el2);
    // Value is `{` then `\n  "a": 1\n}`. Caret right after the root `{`.
    const pos = 1;
    ta.setSelectionRange(pos, pos);
    ta.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    // Enter inserted a newline + one indent level (2 spaces) at depth 1.
    expect(ta.value.slice(pos, pos + 3)).toBe("\n  ");
  });

  test("typing a closing brace when it already follows simply steps over", () => {
    const ta = input(el);
    const len = ta.value.length;
    ta.setSelectionRange(len, len);
    ta.dispatchEvent(new KeyboardEvent("keydown", { key: "[", bubbles: true }));
    ta.setSelectionRange(len + 1, len + 1);
    ta.dispatchEvent(new KeyboardEvent("keydown", { key: "]", bubbles: true }));
    expect(ta.value.endsWith("[]")).toBe(true);
  });

  test("auto-formats (pretty-prints) the text on blur", async () => {
    const ta = input(el);
    type(el, '{"a":1,"b":{"c":2}}');
    expect(ta.value).not.toContain("\n");
    ta.dispatchEvent(new Event("blur", { bubbles: true }));
    await el.updateComplete;
    const formatted = input(el).value;
    expect(formatted).toContain('\n  "a": 1');
    expect(el.editedValue).toEqual({ a: 1, b: { c: 2 } });
  });

  test("readonly mode disables the textarea", async () => {
    const ro = await mount(CONFIG, true);
    expect(input(ro).hasAttribute("readonly")).toBe(true);
  });

  test("setting value after mount re-renders the text", async () => {
    el.value = { hello: "world" };
    await el.updateComplete;
    expect(input(el).value).toContain('"hello"');
    expect(input(el).value).toContain('"world"');
  });

  test("gutter width adapts to the number of row-number columns", () => {
    expect(gutterWidthFor(1, DEFAULT_DIGIT_PX)).toBe(gutterWidthFor(5, DEFAULT_DIGIT_PX));
    expect(gutterWidthFor(9, DEFAULT_DIGIT_PX)).toBeLessThan(gutterWidthFor(10, DEFAULT_DIGIT_PX));
    expect(gutterWidthFor(10, DEFAULT_DIGIT_PX)).toBe(gutterWidthFor(99, DEFAULT_DIGIT_PX));
    expect(gutterWidthFor(99, DEFAULT_DIGIT_PX)).toBeLessThan(
      gutterWidthFor(100, DEFAULT_DIGIT_PX),
    );
    expect(gutterWidthFor(100, DEFAULT_DIGIT_PX)).toBe(gutterWidthFor(999, DEFAULT_DIGIT_PX));
    expect(gutterWidthFor(999, DEFAULT_DIGIT_PX)).toBeLessThan(
      gutterWidthFor(1000, DEFAULT_DIGIT_PX),
    );
    expect(gutterWidthFor(0, DEFAULT_DIGIT_PX)).toBe(gutterWidthFor(1, DEFAULT_DIGIT_PX));
  });

  test("the editor applies the adaptive gutter width", async () => {
    const lineCount = el.shadowRoot.querySelectorAll(".je-line").length;
    const expected = gutterWidthFor(lineCount, DEFAULT_DIGIT_PX);
    const col = el.shadowRoot.querySelector(".eg-col--line-numbers");
    expect(parseFloat(col.style.width)).toBe(expected);
  });

  test("highlights the caret's line-number cell (only one at a time)", async () => {
    const ta = input(el);
    ta.dispatchEvent(new Event("focus"));
    ta.setSelectionRange(0, 0);
    document.dispatchEvent(new Event("selectionchange"));
    await el.updateComplete;
    const active = [...el.shadowRoot.querySelectorAll(".eg-col--line-numbers .eg-cell")].filter(
      (c) => c.classList.contains("eg-cell--active"),
    );
    expect(active.length).toBe(1);
    expect(active[0].textContent).toBe("1");
  });

  test("moves the active line-number highlight with the caret", async () => {
    const ta = input(el);
    ta.dispatchEvent(new Event("focus"));
    // Caret at the start of the line that holds "baseUrl".
    const idx = ta.value.indexOf('"baseUrl"');
    ta.setSelectionRange(idx, idx);
    document.dispatchEvent(new Event("selectionchange"));
    await el.updateComplete;
    const active = [...el.shadowRoot.querySelectorAll(".eg-col--line-numbers .eg-cell")].filter(
      (c) => c.classList.contains("eg-cell--active"),
    );
    const expectedLine = ta.value.slice(0, idx).split("\n").length; // 1-based
    expect(active.length).toBe(1);
    expect(active[0].textContent).toBe(String(expectedLine));
  });

  test("does not auto-highlight the bottom line until the editor is focused", async () => {
    const el2 = await mount();
    await el2.updateComplete;
    const ta = input(el2);
    // On open the value setter parks the caret at the end (last line) — but
    // the editor is not focused, so no gutter cell should be active.
    ta.setSelectionRange(ta.value.length, ta.value.length);
    document.dispatchEvent(new Event("selectionchange"));
    await el2.updateComplete;
    const active = [...el2.shadowRoot.querySelectorAll(".eg-col--line-numbers .eg-cell")].filter(
      (c) => c.classList.contains("eg-cell--active"),
    );
    expect(active.length).toBe(0);

    // Focusing the editor brings the caret's row highlight back.
    ta.dispatchEvent(new Event("focus"));
    document.dispatchEvent(new Event("selectionchange"));
    await el2.updateComplete;
    const active2 = [...el2.shadowRoot.querySelectorAll(".eg-col--line-numbers .eg-cell")].filter(
      (c) => c.classList.contains("eg-cell--active"),
    );
    expect(active2.length).toBe(1);
  });

  test("no more than one gutter cell is ever active", async () => {
    const ta = input(el);
    ta.setSelectionRange(ta.value.length, ta.value.length);
    document.dispatchEvent(new Event("selectionchange"));
    await el.updateComplete;
    const active = [...el.shadowRoot.querySelectorAll(".eg-col--line-numbers .eg-cell")].filter(
      (c) => c.classList.contains("eg-cell--active"),
    );
    expect(active.length).toBeLessThanOrEqual(1);
  });
});

describe("json-editor schema tooltips", () => {
  const SCHEMA = {
    type: "object",
    properties: {
      providerId: { type: "string", description: "Active provider id." },
      providers: {
        type: "object",
        additionalProperties: {
          type: "object",
          properties: {
            baseUrl: { type: "string", description: "The endpoint URL." },
            model: { type: "string", description: "Default model id." },
          },
        },
      },
    },
  };

  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  /** Mount a schema-present editor without relying on real timers. */
  async function mountSchemed() {
    const el = document.createElement("json-editor");
    el.value = CONFIG;
    el.schema = SCHEMA;
    document.body.appendChild(el);
    vi.advanceTimersByTime(1);
    await el.updateComplete;
    return el;
  }

  /** Dispatch a mousemove on the textarea at a given row/column, matching the
   *  real interaction (pointer events land on the overlay, not the spans). */
  function hover(el, rowIdx, offsetX) {
    const ta = input(el);
    const ev = new MouseEvent("mousemove", {
      bubbles: true,
      composed: true,
      clientX: 100,
      clientY: 100,
    });
    Object.defineProperty(ev, "offsetX", { value: offsetX });
    Object.defineProperty(ev, "offsetY", { value: rowIdx * 20 + 10 });
    ta.dispatchEvent(ev);
  }

  function rowOf(el, needle) {
    return el._visibleLines.findIndex((v) => v.text.includes(needle));
  }

  test("renders a hidden tooltip element", async () => {
    const el = await mountSchemed();
    const tip = el.shadowRoot.querySelector(".je-tooltip");
    expect(tip).toBeTruthy();
    expect(tip.style.display).not.toBe("block");
  });

  test("shows the schema description only after the hover delay", async () => {
    const el = await mountSchemed();
    const row = rowOf(el, '"baseUrl"');
    expect(row).toBeGreaterThanOrEqual(0);
    hover(el, row, 60);
    const tip = el.shadowRoot.querySelector(".je-tooltip");
    // Not shown yet (delay pending).
    expect(tip.style.display).not.toBe("block");
    vi.advanceTimersByTime(TOOLTIP_DELAY_MS);
    expect(tip.style.display).toBe("block");
    expect(tip.textContent).toBe("The endpoint URL.");
  });

  test("does not show if the cursor leaves the key before the delay", async () => {
    const el = await mountSchemed();
    const row = rowOf(el, '"baseUrl"');
    hover(el, row, 60);
    // Leave the key (move far right) before the delay elapses.
    hover(el, row, 4000);
    vi.advanceTimersByTime(TOOLTIP_DELAY_MS);
    expect(el.shadowRoot.querySelector(".je-tooltip").style.display).not.toBe("block");
  });

  test("centers the tooltip on the key and clamps it within the viewport", async () => {
    const el = await mountSchemed();
    // Deterministic layout: content is 50px right of the viewport origin and
    // the viewport is 600px wide. The 20px-wide tooltip should be centered on
    // the key (shifted right/left of the key's first column).
    const content = el.shadowRoot.querySelector(".je-content");
    const viewport = el.shadowRoot.querySelector(".je-viewport");
    content.getBoundingClientRect = () => ({
      left: 50,
      top: 0,
      right: 650,
      bottom: 400,
      width: 600,
      height: 400,
      x: 50,
      y: 0,
    });
    viewport.getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      right: 600,
      bottom: 400,
      width: 600,
      height: 400,
      x: 0,
      y: 0,
    });
    const row = rowOf(el, '"baseUrl"');
    hover(el, row, 60);
    const p = el._tooltipPending;
    const tip = el.shadowRoot.querySelector(".je-tooltip");
    Object.defineProperty(tip, "offsetWidth", { value: 20, configurable: true });
    vi.advanceTimersByTime(TOOLTIP_DELAY_MS);
    const left = Number.parseFloat(tip.style.left);
    const top = Number.parseFloat(tip.style.top);
    const cw = el._measureCharW() > 0 ? el._measureCharW() : 8;
    const idealCentered = 10 + p.start * cw + (p.keyLen * cw - 20) / 2;
    expect(left).toBeCloseTo(idealCentered, 0);
    expect(top).toBeCloseTo((row + 1) * 20 + 2, 0);
  });

  test("clamps the tooltip so it never clips past the viewport right edge", async () => {
    const el = await mountSchemed();
    // A narrow viewport (content starts 50px into a 100px-wide viewport). The
    // centered tooltip would reach past the right edge, so it clamps to it.
    const content = el.shadowRoot.querySelector(".je-content");
    const viewport = el.shadowRoot.querySelector(".je-viewport");
    content.getBoundingClientRect = () => ({
      left: 50,
      top: 0,
      right: 650,
      bottom: 400,
      width: 600,
      height: 400,
      x: 50,
      y: 0,
    });
    viewport.getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      right: 100,
      bottom: 400,
      width: 100,
      height: 400,
      x: 0,
      y: 0,
    });
    const row = rowOf(el, '"baseUrl"');
    hover(el, row, 60);
    const tip = el.shadowRoot.querySelector(".je-tooltip");
    Object.defineProperty(tip, "offsetWidth", { value: 20, configurable: true });
    vi.advanceTimersByTime(TOOLTIP_DELAY_MS);
    const left = Number.parseFloat(tip.style.left);
    const vpRight = 100 - 50; // viewport right edge in content coords
    expect(left).toBeCloseTo(vpRight - 20 - 4, 0);
  });

  test("hides the tooltip when moving off the key", async () => {
    const el = await mountSchemed();
    const row = rowOf(el, '"baseUrl"');
    hover(el, row, 60);
    vi.advanceTimersByTime(TOOLTIP_DELAY_MS);
    expect(el.shadowRoot.querySelector(".je-tooltip").style.display).toBe("block");
    // Move off the key → hides immediately.
    hover(el, row, 4000);
    expect(el.shadowRoot.querySelector(".je-tooltip").style.display).not.toBe("block");
  });

  test("keeps the tooltip hidden when the key has no description", async () => {
    const el = await mountSchemed();
    const row = rowOf(el, '"maxTokens"');
    hover(el, row, 60);
    vi.advanceTimersByTime(TOOLTIP_DELAY_MS);
    expect(el.shadowRoot.querySelector(".je-tooltip").style.display).not.toBe("block");
  });

  test("does not show a tooltip without a schema", async () => {
    const el = document.createElement("json-editor");
    el.value = CONFIG;
    document.body.appendChild(el);
    vi.advanceTimersByTime(1);
    await el.updateComplete;
    const row = rowOf(el, '"baseUrl"');
    hover(el, row, 60);
    vi.advanceTimersByTime(TOOLTIP_DELAY_MS);
    expect(el.shadowRoot.querySelector(".je-tooltip").style.display).not.toBe("block");
  });
});

describe("json-editor defaults overlay", () => {
  test("show-defaults off shows only the raw value (no fade)", async () => {
    const el = await mount({ lineHeight: 24, fontSize: 14 }, false);
    el.value = { lineHeight: 24, fontSize: 14 };
    el.defaults = { lineHeight: 20, fontSize: 14 };
    await new Promise((r) => setTimeout(r, 20));
    expect(el.shadowRoot.querySelectorAll(".je-row--faded").length).toBe(0);
  });

  test("show-defaults fades default-valued lines and keeps overrides", async () => {
    const el = await mount({ lineHeight: 24, fontSize: 14 }, false);
    el.value = { lineHeight: 24, fontSize: 14 };
    el.defaults = { lineHeight: 20, fontSize: 14 };
    el.showDefaults = true;
    await new Promise((r) => setTimeout(r, 20));
    const faded = el.shadowRoot.querySelectorAll(".je-row--faded");
    expect(faded.length).toBeGreaterThan(0);
    // fontSize is at its default (14) → faded; lineHeight is overridden → not.
    const text = [...faded].map((r) => r.textContent).join("\n");
    expect(text).toContain("fontSize");
    expect(text).not.toContain("lineHeight");
  });

  test("no overrides at all → default-value lines fade but the top-level object does not", async () => {
    const el = await mount({ lineHeight: 20, fontSize: 14 }, false);
    el.value = { lineHeight: 20, fontSize: 14 };
    el.defaults = { lineHeight: 20, fontSize: 14 };
    el.showDefaults = true;
    await new Promise((r) => setTimeout(r, 20));
    const faded = el.shadowRoot.querySelectorAll(".je-row--faded");
    expect(faded.length).toBeGreaterThan(0);
    // The top-level object always exists — its opening brace is never faded
    // and never gets a delete/overwrite action.
    const rootRow = el.shadowRoot.querySelector('.je-row[data-line="0"]');
    expect(rootRow.classList.contains("je-row--faded")).toBe(false);
    expect(rootRow.querySelector(".je-ow")).toBeNull();
    expect(rootRow.querySelector(".je-del")).toBeNull();
    // The fully-default value lines below it are still faded.
    expect(el.shadowRoot.querySelector('.je-row--faded[data-line="1"]')).toBeTruthy();
  });

  test("toggling show-defaults back off clears the fade", async () => {
    const el = await mount({ lineHeight: 24, fontSize: 14 }, false);
    el.value = { lineHeight: 24, fontSize: 14 };
    el.defaults = { lineHeight: 20, fontSize: 14 };
    el.showDefaults = true;
    await new Promise((r) => setTimeout(r, 20));
    expect(el.shadowRoot.querySelectorAll(".je-row--faded").length).toBeGreaterThan(0);
    el.showDefaults = false;
    await new Promise((r) => setTimeout(r, 20));
    expect(el.shadowRoot.querySelectorAll(".je-row--faded").length).toBe(0);
  });
});

describe("json-editor overwrite / pinned-default rows", () => {
  async function setup(value, defaults, showDefaults = true) {
    const el = await mount(value, false);
    el.defaults = defaults;
    el.showDefaults = showDefaults;
    await new Promise((r) => setTimeout(r, 20));
    return el;
  }

  // Row layout for `{ lineHeight: 24, fontSize: 14 }`:
  //   0: {      1: "lineHeight": 24,   2: "fontSize": 14,   3: }
  test("faded default rows get an overwrite button and NO delete button", async () => {
    const el = await setup({ lineHeight: 24, fontSize: 14 }, { lineHeight: 20, fontSize: 14 });
    // fontSize row (line 2) is at its default → faded → offer overwrite, no delete.
    const fadedRow = el.shadowRoot.querySelector('.je-row--faded[data-line="2"]');
    expect(fadedRow).toBeTruthy();
    expect(fadedRow.querySelector(".je-ow")).toBeTruthy();
    expect(fadedRow.querySelector(".je-del")).toBeNull();
    // The overridden lineHeight row (line 1) keeps its delete button.
    const overrideRow = el.shadowRoot.querySelector('.je-row[data-line="1"]');
    expect(overrideRow.querySelector(".je-del")).toBeTruthy();
    expect(overrideRow.querySelector(".je-ow")).toBeNull();
  });

  test("clicking the overwrite button emits json-editor-overwrite with path+value", async () => {
    const el = await setup({ lineHeight: 24, fontSize: 14 }, { lineHeight: 20, fontSize: 14 });
    let received = null;
    el.addEventListener("json-editor-overwrite", (e) => {
      received = e.detail;
    });
    hoverRow(el, 2);
    await new Promise((r) => setTimeout(r, 20));
    el.shadowRoot.querySelector('.je-row--faded[data-line="2"] .je-ow').click();
    await new Promise((r) => setTimeout(r, 20));
    expect(received).toEqual({ path: ["fontSize"], value: 14 });
  });

  test("hovering the overwrite button highlights the whole row in blue (like delete does red)", async () => {
    const el = await setup({ lineHeight: 24, fontSize: 14 }, { lineHeight: 20, fontSize: 14 });
    const ow = el.shadowRoot.querySelector('.je-row--faded[data-line="2"] .je-ow');
    ow.dispatchEvent(new Event("mouseenter"));
    await new Promise((r) => setTimeout(r, 20));
    // The default row (line 2) is highlighted blue, NOT red.
    const row = el.shadowRoot.querySelector('.je-row[data-line="2"]');
    expect(row.classList.contains("je-row--overwrite")).toBe(true);
    expect(row.classList.contains("je-row--danger")).toBe(false);
    // The delete button still uses the red danger highlight.
    const del = el.shadowRoot.querySelector('.je-row[data-line="1"] .je-del');
    del.dispatchEvent(new Event("mouseenter"));
    await new Promise((r) => setTimeout(r, 20));
    const delRow = el.shadowRoot.querySelector('.je-row[data-line="1"]');
    expect(delRow.classList.contains("je-row--danger")).toBe(true);
    expect(delRow.classList.contains("je-row--overwrite")).toBe(false);
    // Moving over off clears the highlight.
    ow.dispatchEvent(new Event("mouseleave"));
    await new Promise((r) => setTimeout(r, 20));
    expect(el.shadowRoot.querySelectorAll(".je-row--danger, .je-row--overwrite").length).toBe(0);
  });

  test("hovering the overwrite button draws a blue accent border with corner overdraws", async () => {
    const el = await setup({ lineHeight: 24, fontSize: 14 }, { lineHeight: 20, fontSize: 14 });
    const ow = el.shadowRoot.querySelector('.je-row--faded[data-line="2"] .je-ow');
    ow.dispatchEvent(new Event("mouseenter"));
    await new Promise((r) => setTimeout(r, 20));
    const border = el.shadowRoot.querySelector(".je-hl-border");
    expect(border).toBeTruthy();
    expect(border.style.getPropertyValue("--je-hl")).toBe("#58a6ff");
    expect(border.querySelectorAll(".je-hl-ac").length).toBe(8);
    // The block is a single line, so the border is exactly one row tall.
    expect(parseFloat(border.style.height)).toBeCloseTo(20, 0);
    // Clearing the highlight removes the accent border.
    ow.dispatchEvent(new Event("mouseleave"));
    await new Promise((r) => setTimeout(r, 20));
    expect(el.shadowRoot.querySelector(".je-hl-border")).toBeNull();
  });

  test("explicitPaths keeps a pinned default from fading", async () => {
    const el = await setup({ lineHeight: 20, fontSize: 14 }, { lineHeight: 20, fontSize: 14 });
    // Pin fontSize (still at its default) — it must NOT be faded.
    el.explicitPaths = ["fontSize"];
    await new Promise((r) => setTimeout(r, 20));
    const fadedText = [...el.shadowRoot.querySelectorAll(".je-row--faded")]
      .map((r) => r.textContent)
      .join("\n");
    expect(fadedText).not.toContain("fontSize");
    // It should be a normal (delete-capable) row now.
    expect(el.shadowRoot.querySelector('.je-row[data-line="2"] .je-del')).toBeTruthy();
  });

  test("overwrite button also works on nested default subtrees", async () => {
    const el = await setup(
      { lineHeight: 24, nested: { value: 7 } },
      { lineHeight: 20, nested: { value: 7 } },
    );
    let received = null;
    el.addEventListener("json-editor-overwrite", (e) => {
      received = e.detail;
    });
    // The `nested` subtree (line 2) is entirely at default → faded; click overwrite.
    hoverRow(el, 2);
    await new Promise((r) => setTimeout(r, 20));
    el.shadowRoot.querySelector('.je-row--faded[data-line="2"] .je-ow').click();
    await new Promise((r) => setTimeout(r, 20));
    // The entry path points at the whole default subtree.
    expect(received?.path).toEqual(["nested"]);
  });
});
