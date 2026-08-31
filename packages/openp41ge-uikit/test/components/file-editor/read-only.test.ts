// @ts-nocheck
/**
 * Regression tests for read-only mode (<file-editor>.setReadOnly).
 *
 * A read-only editor must accept NO edits — typing, paste, delete, new-line,
 * undo/redo all no-op — must never show a caret (even while its textarea is
 * focused for selection/copy), and save()/formatDocument() must be inert.
 * Toggling read-only off must restore normal editing.
 */
import { describe, test, expect, beforeEach } from "vitest";
import { PieceTreeTextContentModel } from "openp41ge-editor-engine/model/piece-tree-text-content-model";
import "../../../src/components/file-editor/file-editor";

const CONTENT = "const x = 1;\n// keep this line\n";

async function mountEditor(readOnly = false, content = CONTENT): Promise<HTMLElement & any> {
  const el = document.createElement("file-editor");
  el.filePath = `/repo/app.ts`;
  el.fileName = "app.ts";
  el.setReadOnly(readOnly);
  el.textContentModel = new PieceTreeTextContentModel(`file:///app.ts`, content);
  document.body.appendChild(el);
  // Let Lit mount + firstUpdated + _initWithModel run.
  await new Promise((r) => setTimeout(r, 30));
  return el;
}

function visibleCaretEls(el): HTMLElement[] {
  const vp = el.querySelector(".fe-text-region") || el.querySelector(".fe-viewport");
  const carets = [...(vp?.children ?? [])].filter((c) => {
    const s = c.style;
    return s.position === "absolute" && s.width === "2px";
  });
  return carets.filter((c) => c.style.visibility !== "hidden");
}

function typeChar(el, value) {
  const ta = el.querySelector("textarea");
  ta.value = value;
  ta.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
}

function keyOn(el, init: KeyboardEventInit) {
  const ta = el.querySelector("textarea");
  ta.dispatchEvent(new KeyboardEvent("keydown", init));
}

function modelValue(el): string {
  return el.textContentModel.getValue();
}

describe("file-editor read-only mode", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  test("read-only hides the caret even while the textarea is focused", async () => {
    const el = await mountEditor(true);
    const ta = el.querySelector("textarea");
    ta.focus();
    await new Promise((r) => setTimeout(r, 20));
    // Focus normally shows a caret (asserted in caret-focus.test.ts); in
    // read-only it must stay hidden so the editor reads as view-only.
    expect(visibleCaretEls(el)).toHaveLength(0);
    expect(el.isReadOnly).toBe(true);
  });

  test("typing does not change the model in read-only", async () => {
    const el = await mountEditor(true);
    typeChar(el, "const");
    expect(modelValue(el)).toBe(CONTENT);
    const state = el.getState();
    expect(state.isDirty).toBe(false);
  });

  test("Enter/Backspace/Delete keydown do not change the model in read-only", async () => {
    const el = await mountEditor(true);
    keyOn(el, { key: "Enter", bubbles: true });
    keyOn(el, { key: "Backspace", bubbles: true });
    keyOn(el, { key: "Delete", bubbles: true });
    expect(modelValue(el)).toBe(CONTENT);
  });

  test("undo/redo are blocked in read-only", async () => {
    const el = await mountEditor(true);
    keyOn(el, { key: "z", metaKey: true, bubbles: true });
    keyOn(el, { key: "Z", metaKey: true, shiftKey: true, bubbles: true });
    expect(modelValue(el)).toBe(CONTENT);
  });

  test("save() returns false and never writes in read-only", async () => {
    const el = await mountEditor(true);
    await expect(el.save()).resolves.toBe(false);
  });

  test("toggling read-only off restores editing", async () => {
    const el = await mountEditor(true);
    typeChar(el, "a");
    expect(modelValue(el)).toBe(CONTENT);

    el.setReadOnly(false);
    // Append to the previously-typed value so TextAreaInput sees a new char.
    const ta = el.querySelector("textarea");
    ta.value = "ab";
    ta.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    ta.focus();
    await new Promise((r) => setTimeout(r, 20));
    expect(visibleCaretEls(el).length).toBeGreaterThan(0);
    expect(modelValue(el)).not.toBe(CONTENT);
    expect(el.isReadOnly).toBe(false);
  });

  test("getState().isDirty stays false across blocked edits", async () => {
    const el = await mountEditor(true);
    typeChar(el, "abc");
    keyOn(el, { key: "Backspace", bubbles: true });
    const state = el.getState();
    expect(state.isDirty).toBe(false);
  });
});
