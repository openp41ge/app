// @ts-nocheck
/**
 * <json-editor> component tests: the text-based (file-editor style) JSON
 * editor — raw text in a hidden-overlay textarea, rendered content view with
 * line numbers + highlighting, auto-closing pairs, auto-indent, auto-format,
 * and live value parsing / change events.
 */
import { describe, test, expect, beforeEach } from "vitest";
import "../src/json-editor";
import { JSON_EDITOR_CHANGE, gutterWidthFor, DEFAULT_DIGIT_PX } from "../src/json-editor";

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
    expect(formatted).toContain("\n  \"a\": 1");
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
    expect(gutterWidthFor(99, DEFAULT_DIGIT_PX)).toBeLessThan(gutterWidthFor(100, DEFAULT_DIGIT_PX));
    expect(gutterWidthFor(100, DEFAULT_DIGIT_PX)).toBe(gutterWidthFor(999, DEFAULT_DIGIT_PX));
    expect(gutterWidthFor(999, DEFAULT_DIGIT_PX)).toBeLessThan(gutterWidthFor(1000, DEFAULT_DIGIT_PX));
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
    ta.setSelectionRange(0, 0);
    document.dispatchEvent(new Event("selectionchange"));
    await el.updateComplete;
    const active = [...el.shadowRoot.querySelectorAll(".eg-col--line-numbers .eg-cell")]
      .filter((c) => c.classList.contains("eg-cell--active"));
    expect(active.length).toBe(1);
    expect(active[0].textContent).toBe("1");
  });

  test("moves the active line-number highlight with the caret", async () => {
    const ta = input(el);
    // Caret at the start of the line that holds "baseUrl".
    const idx = ta.value.indexOf('"baseUrl"');
    ta.setSelectionRange(idx, idx);
    document.dispatchEvent(new Event("selectionchange"));
    await el.updateComplete;
    const active = [...el.shadowRoot.querySelectorAll(".eg-col--line-numbers .eg-cell")]
      .filter((c) => c.classList.contains("eg-cell--active"));
    const expectedLine = ta.value.slice(0, idx).split("\n").length; // 1-based
    expect(active.length).toBe(1);
    expect(active[0].textContent).toBe(String(expectedLine));
  });

  test("no more than one gutter cell is ever active", async () => {
    const ta = input(el);
    ta.setSelectionRange(ta.value.length, ta.value.length);
    document.dispatchEvent(new Event("selectionchange"));
    await el.updateComplete;
    const active = [...el.shadowRoot.querySelectorAll(".eg-col--line-numbers .eg-cell")]
      .filter((c) => c.classList.contains("eg-cell--active"));
    expect(active.length).toBeLessThanOrEqual(1);
  });
});
