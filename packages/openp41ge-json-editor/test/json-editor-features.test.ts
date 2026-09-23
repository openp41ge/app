// @ts-nocheck
/**
 * Structure-aware editor behaviours: code folding (with metadata), subtree
 * delete + hover highlighting, syntax-error line flags, editing while folded
 * (so the hidden content is never lost), and click-to-select tokens.
 */
import { describe, test, expect, beforeEach } from "vitest";
import "../src/json-editor";
import { JSON_EDITOR_CHANGE } from "../src/json-editor";

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

async function mount(value = CONFIG) {
  const el = document.createElement("json-editor");
  el.value = value;
  document.body.appendChild(el);
  await new Promise((r) => setTimeout(r, 20));
  return el;
}

function input(el) {
  return el.shadowRoot.querySelector("textarea.je-input");
}

function gutterRow(el, lineNum) {
  return [...el.shadowRoot.querySelectorAll(".eg-col--line-numbers .eg-cell")].find(
    (c) => c.textContent.trim() === String(lineNum),
  );
}

function chevronFor(el, lineNum) {
  const foldCell = [...el.shadowRoot.querySelectorAll(".eg-col--fold .eg-cell")][lineNum - 1];
  return foldCell?.querySelector(".eg-fold-chevron");
}

describe("json-editor structure features", () => {
  let el;

  beforeEach(async () => {
    el = await mount();
  });

  test("folding collapses an object into a single metadata row", async () => {
    const before = el.shadowRoot.querySelectorAll(".eg-col--line-numbers .eg-cell").length;
    expect(before).toBeGreaterThan(4);

    // Fold the `providers` object (line 3, 1-based).
    chevronFor(el, 3).click();
    await new Promise((r) => setTimeout(r, 20));

    const after = el.shadowRoot.querySelectorAll(".eg-col--line-numbers .eg-cell").length;
    expect(after).toBeLessThan(before);
    // The hidden content is gone from the visible buffer / textarea.
    expect(input(el).value.includes("baseUrl")).toBe(false);
    // The folded row shows metadata.
    const meta = el.shadowRoot.querySelector(".je-fold-meta");
    expect(meta).toBeTruthy();
    expect(meta.textContent).toContain("property");

    // Expand restores it.
    chevronFor(el, 3).click();
    await new Promise((r) => setTimeout(r, 20));
    expect(input(el).value.includes("baseUrl")).toBe(true);
    expect(el.shadowRoot.querySelectorAll(".eg-col--line-numbers .eg-cell").length).toBe(before);
  });

  test("a folded row shows only the fold-meta opening brace, not the original one", async () => {
    chevronFor(el, 3).click();
    await new Promise((r) => setTimeout(r, 20));
    const row = el.shadowRoot.querySelector('.je-row[data-line="2"]');
    const text = row.textContent;
    // The property key prefix is preserved for context.
    expect(text).toContain('"providers"');
    // The metadata now lives INSIDE the braces: `{ 1 property · 1 object }`.
    expect(text).toMatch(/\{ \d+ propert(?:y|ies) · /);
    // The original `{` from the open line is gone — the ONLY opening brace
    // in the folded row is the fold-meta label.
    expect((text.match(/\{/g) || []).length).toBe(1);
  });

  test("editing while folded reconciles to the full text without losing content", async () => {
    chevronFor(el, 3).click();
    await new Promise((r) => setTimeout(r, 20));

    const ta = input(el);
    ta.value = ta.value.replace('"providerId": "vllm"', '"providerId": "vllm2"');
    ta.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    await new Promise((r) => setTimeout(r, 20));

    expect(el.editedValue.providerId).toBe("vllm2");
    // The folded subtree is intact.
    expect(el.editedValue.providers.vllm.baseUrl).toBe("http://localhost:8000/v1");
  });

  test("delete on an object row removes the whole subtree", async () => {
    el.shadowRoot.querySelector('.je-row[data-line="2"] .je-del').click();
    await new Promise((r) => setTimeout(r, 20));
    expect(el.editedValue.providers).toBeUndefined();
    expect(el.editedValue.providerId).toBe("vllm");
  });

  test("delete on a primitive row removes just that member", async () => {
    el.shadowRoot.querySelector('.je-row[data-line="1"] .je-del').click();
    await new Promise((r) => setTimeout(r, 20));
    expect(el.editedValue.providerId).toBeUndefined();
    expect(el.editedValue.providers).toBeTruthy();
  });

  test("hovering delete highlights the affected subtree rows", async () => {
    const del = el.shadowRoot.querySelector('.je-row[data-line="2"] .je-del');
    del.dispatchEvent(new Event("mouseenter"));
    await new Promise((r) => setTimeout(r, 20));
    const danger = el.shadowRoot.querySelectorAll(".je-row--danger");
    expect(danger.length).toBeGreaterThan(1);
  });

  test("a missing comma flags the offending line number red", async () => {
    const ta = input(el);
    ta.value = ta.value.replace('"providerId": "vllm",', '"providerId": "vllm"');
    ta.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    await new Promise((r) => setTimeout(r, 20));

    const err = el.shadowRoot.querySelectorAll(".eg-col--line-numbers .eg-cell--err");
    expect(err.length).toBeGreaterThan(0);
    // The error is reported on the line after the `providerId` member (line 3).
    expect(err[0].textContent.trim()).toBe("3");
  });

  test("clicking a key selects the whole key for replacement", () => {
    const ta = input(el);
    const idx = ta.value.indexOf("providerId");
    ta.selectionStart = idx;
    ta.selectionEnd = idx;
    ta.dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true }));
    expect(ta.selectionStart).toBe(idx);
    expect(ta.selectionEnd - ta.selectionStart).toBe("providerId".length);
  });

  test("clicking a string value selects its inner text", () => {
    const ta = input(el);
    const idx = ta.value.indexOf("localhost:8000");
    ta.selectionStart = idx;
    ta.selectionEnd = idx;
    ta.dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true }));
    expect(ta.selectionEnd - ta.selectionStart).toBe("http://localhost:8000/v1".length);
  });

  test("close-brace rows get no delete button", () => {
    // The object/array closing lines (0-based) must not get a delete button;
    // the opening row owns the whole subtree.
    for (const line of [10, 11, 12, 13, 14]) {
      expect(el.shadowRoot.querySelector(`.je-row[data-line="${line}"] .je-del`)).toBeNull();
    }
    // Opening / member rows still do.
    expect(el.shadowRoot.querySelector('.je-row[data-line="2"] .je-del')).toBeTruthy();
  });

  test("delete buttons stay hidden until their row is hovered", async () => {
    expect(el.shadowRoot.querySelectorAll(".je-del--show").length).toBe(0);
    const ta = input(el);
    ta.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, composed: true }));
    await new Promise((r) => setTimeout(r, 20));
    expect(el.shadowRoot.querySelectorAll(".je-del--show").length).toBe(1);
  });

  test("the delete button stays visible while hovering it", async () => {
    const ta = input(el);
    ta.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, composed: true }));
    await new Promise((r) => setTimeout(r, 20));
    // Leaving the textarea (e.g. moving onto the button) hides the row hover…
    let del = el.shadowRoot.querySelector('.je-row[data-line="0"] .je-del');
    ta.dispatchEvent(new MouseEvent("mouseleave", { bubbles: false }));
    await new Promise((r) => setTimeout(r, 20));
    expect(del.classList.contains("je-del--show")).toBe(false);
    // …but entering the button itself must restore it so the cross stays usable.
    del = el.shadowRoot.querySelector('.je-row[data-line="0"] .je-del');
    del.dispatchEvent(new MouseEvent("mouseenter", { bubbles: false }));
    await new Promise((r) => setTimeout(r, 20));
    const fresh = el.shadowRoot.querySelector('.je-row[data-line="0"] .je-del');
    expect(fresh.classList.contains("je-del--show")).toBe(true);
  });

  test("clicking a line number selects the whole row", () => {
    const ta = input(el);
    gutterRow(el, 2).dispatchEvent(new MouseEvent("mousedown", { bubbles: true, composed: true }));
    const selText = ta.value.slice(ta.selectionStart, ta.selectionEnd);
    expect(selText).toBe('  "providerId": "vllm",');
  });

  test("clicking an empty fold cell selects the whole row", () => {
    const ta = input(el);
    // Line 2 is an object key/row (no chevron); its fold cell must behave
    // like the line-number column and select the line content.
    const emptyCell = [...el.shadowRoot.querySelectorAll(".eg-col--fold .eg-cell")].find(
      (c) => !c.classList.contains("eg-cell--fold"),
    );
    expect(emptyCell.querySelector(".eg-fold-chevron")).toBeNull();
    emptyCell.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, composed: true }));
    const selText = ta.value.slice(ta.selectionStart, ta.selectionEnd);
    expect(selText).toBe('  "providerId": "vllm",');
  });

  test("hovering a fold chevron does not light the line-number cell", async () => {
    const numCell = gutterRow(el, 3);
    // Light the row via its line-number cell first.
    numCell.dispatchEvent(new MouseEvent("mouseover", { bubbles: true, composed: true }));
    await new Promise((r) => setTimeout(r, 20));
    expect(numCell.classList.contains("eg-cell--hover")).toBe(true);
    // Moving the pointer onto the chevron must clear the number highlight.
    const chevron = chevronFor(el, 3);
    chevron.dispatchEvent(new MouseEvent("mouseover", { bubbles: true, composed: true }));
    await new Promise((r) => setTimeout(r, 20));
    expect(numCell.classList.contains("eg-cell--hover")).toBe(false);
  });

  test("hovering an empty fold cell lights both gutter columns", async () => {
    const foldCells = [...el.shadowRoot.querySelectorAll(".eg-col--fold .eg-cell")];
    const numCells = [...el.shadowRoot.querySelectorAll(".eg-col--line-numbers .eg-cell")];
    // Pick a non-foldable row (empty fold cell) on the SAME index in both gutters.
    const idx = foldCells.findIndex((c) => !c.classList.contains("eg-cell--fold"));
    const empty = foldCells[idx];
    empty.dispatchEvent(new MouseEvent("mouseover", { bubbles: true, composed: true }));
    await new Promise((r) => setTimeout(r, 20));
    expect(empty.classList.contains("eg-cell--hover")).toBe(true);
    expect(numCells[idx].classList.contains("eg-cell--hover")).toBe(true);
    // Symmetric: hovering the number cell lights the empty fold cell too.
    empty.dispatchEvent(new MouseEvent("mouseout", { bubbles: true, composed: true }));
    numCells[idx].dispatchEvent(new MouseEvent("mouseover", { bubbles: true, composed: true }));
    await new Promise((r) => setTimeout(r, 20));
    expect(numCells[idx].classList.contains("eg-cell--hover")).toBe(true);
    expect(empty.classList.contains("eg-cell--hover")).toBe(true);
    // Leaving clears both.
    numCells[idx].dispatchEvent(new MouseEvent("mouseout", { bubbles: true, composed: true }));
    await new Promise((r) => setTimeout(r, 20));
    expect(numCells[idx].classList.contains("eg-cell--hover")).toBe(false);
    expect(empty.classList.contains("eg-cell--hover")).toBe(false);
  });

  test("gutter hover box is full-width on non-foldable rows, number-only on foldable rows", async () => {
    const foldCells = [...el.shadowRoot.querySelectorAll(".eg-col--fold .eg-cell")];
    const numCells = [...el.shadowRoot.querySelectorAll(".eg-col--line-numbers .eg-cell")];
    const emptyIdx = foldCells.findIndex((c) => !c.classList.contains("eg-cell--fold"));
    const chevIdx = foldCells.findIndex((c) => c.classList.contains("eg-cell--fold"));
    const numW = parseFloat(numCells[emptyIdx].parentElement.style.width);
    const foldW = parseFloat(foldCells[emptyIdx].parentElement.style.width);
    // Non-foldable row: overlay spans both columns.
    numCells[emptyIdx].dispatchEvent(new MouseEvent("mouseover", { bubbles: true, composed: true }));
    await new Promise((r) => setTimeout(r, 20));
    const hl = el.shadowRoot.querySelector(".eg-hoverbox");
    expect(hl.style.display).not.toBe("none");
    expect(parseFloat(hl.style.width)).toBeCloseTo(numW + foldW);
    // Foldable row: overlay is number-only.
    numCells[emptyIdx].dispatchEvent(new MouseEvent("mouseout", { bubbles: true, composed: true }));
    numCells[chevIdx].dispatchEvent(new MouseEvent("mouseover", { bubbles: true, composed: true }));
    await new Promise((r) => setTimeout(r, 16));
    expect(parseFloat(hl.style.width)).toBeCloseTo(numW);
  });

  test("dragging across line numbers selects multiple lines", async () => {
    const ta = input(el);
    // Mousedown on line 2 (index 1), drag to line 5 (index 4).
    gutterRow(el, 2).dispatchEvent(new MouseEvent("mousedown", { bubbles: true, composed: true }));
    document.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, buttons: 1, clientY: 4 * 20 + 10 }));
    await new Promise((r) => setTimeout(r, 20));
    document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    const selText = ta.value.slice(ta.selectionStart, ta.selectionEnd);
    expect(selText.split("\n").length).toBeGreaterThan(1);
    expect(selText).toContain('"baseUrl"');
  });

  test("hovering the content does NOT light the gutter line numbers", async () => {
    const ta = input(el);
    ta.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, composed: true }));
    await new Promise((r) => setTimeout(r, 20));
    const hovered = el.shadowRoot.querySelectorAll(".eg-col--line-numbers .eg-cell--hover");
    expect(hovered.length).toBe(0);
    // ...but hovering the gutter DOES light the hovered row's number.
    gutterRow(el, 2).dispatchEvent(new MouseEvent("mouseover", { bubbles: true, composed: true }));
    await new Promise((r) => setTimeout(r, 20));
    const hover = el.shadowRoot.querySelector(".eg-col--line-numbers .eg-cell--hover");
    expect(hover).toBeTruthy();
    expect(hover.textContent.trim()).toBe("2");
  });

  test("a single-line selection gets all four rounded corners", () => {
    const ta = input(el);
    gutterRow(el, 2).dispatchEvent(new MouseEvent("mousedown", { bubbles: true, composed: true }));
    const seg = el.shadowRoot.querySelector(".je-selection .je-segment");
    expect(seg).toBeTruthy();
    expect(seg.className).toContain("top-left-radius");
    expect(seg.className).toContain("top-right-radius");
    expect(seg.className).toContain("bottom-left-radius");
    expect(seg.className).toContain("bottom-right-radius");
  });

  test("a multi-line selection renders inner-corner notches", async () => {
    const ta = input(el);
    gutterRow(el, 2).dispatchEvent(new MouseEvent("mousedown", { bubbles: true, composed: true }));
    document.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, buttons: 1, clientY: 4 * 20 + 10 }));
    await new Promise((r) => setTimeout(r, 20));
    document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 20));
    const sel = el.shadowRoot.querySelector(".je-selection");
    expect(sel.querySelectorAll(".je-segment").length).toBeGreaterThan(1);
    expect(sel.querySelectorAll(".je-corner-piece").length).toBeGreaterThan(0);
    expect(sel.querySelectorAll(".je-notch").length).toBeGreaterThan(0);
  });

  test("a clean click on a key string auto-selects the whole string", async () => {
    const ta = input(el);
    const r = el._selectables.find((x) => x.kind === "key");
    ta.setSelectionRange(r.start, r.start);
    ta.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, composed: true, buttons: 1 }));
    ta.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, composed: true, buttons: 0 }));
    ta.dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true }));
    await new Promise((r2) => setTimeout(r2, 20));
    expect(ta.selectionStart).toBe(r.start);
    expect(ta.selectionEnd).toBe(r.end);
  });

  test("a drag (general highlight) disables the click-to-select of strings", async () => {
    const ta = input(el);
    const r = el._selectables.find((x) => x.kind === "key");
    // Start a drag (button held) on the string, move beyond the threshold.
    ta.setSelectionRange(r.start, r.start);
    ta.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, composed: true, buttons: 1, clientX: 5, clientY: 5 }));
    ta.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, composed: true, buttons: 1, clientX: 400, clientY: 60 }));
    await new Promise((r2) => setTimeout(r2, 20));
    // The drag produces a general selection, then the user releases/click.
    ta.setSelectionRange(2, 30);
    ta.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, composed: true, buttons: 0 }));
    ta.dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true }));
    await new Promise((r2) => setTimeout(r2, 20));
    const sel = el.shadowRoot.querySelector(".je-selection .je-segment");
    expect(sel).toBeTruthy();
    // The general highlight must not be replaced by the whole string.
    expect(ta.selectionStart).toBe(2);
    expect(ta.selectionEnd).toBe(30);
  });

  test("the selection highlight follows the cursor during a drag", async () => {
    const ta = input(el);
    // Start a drag, then move the selection/extent while the button is held,
    // before releasing. The overlay should repaint on mousemove.
    ta.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, composed: true, buttons: 1, clientX: 5, clientY: 5 }));
    ta.setSelectionRange(2, 12);
    ta.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, composed: true, buttons: 1, clientX: 400, clientY: 12 }));
    await new Promise((r2) => setTimeout(r2, 20));
    const one = el.shadowRoot.querySelectorAll(".je-selection .je-segment").length;
    // Extend into a second line and keep dragging (button still held).
    ta.setSelectionRange(2, 30);
    ta.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, composed: true, buttons: 1, clientX: 410, clientY: 40 }));
    await new Promise((r2) => setTimeout(r2, 20));
    const two = el.shadowRoot.querySelectorAll(".je-selection .je-segment").length;
    expect(two).toBeGreaterThan(one); // overlay repainted mid-drag, before mouseup
  });

  test("the caret on a bracket highlights its matching pair", async () => {
    const ta = input(el);
    const brace = ta.value.indexOf("{", ta.value.indexOf('"providers"'));
    ta.selectionStart = brace;
    ta.selectionEnd = brace;
    ta.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, composed: true }));
    await new Promise((r) => setTimeout(r, 20));
    const matched = el.shadowRoot.querySelectorAll(".je-brace--match");
    expect(matched.length).toBe(2);
    const texts = [...matched].map((n) => n.textContent.trim());
    expect(texts).toContain("{");
    expect(texts).toContain("}");
  });

  test("the brace highlight clears away from any bracket", async () => {
    const ta = input(el);
    const brace = ta.value.indexOf("{", ta.value.indexOf('"providers"'));
    ta.selectionStart = brace;
    ta.selectionEnd = brace;
    ta.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, composed: true }));
    await new Promise((r) => setTimeout(r, 20));
    expect(el.shadowRoot.querySelectorAll(".je-brace--match").length).toBe(2);

    // Move the caret into a string value, far from any bracket.
    const inStr = ta.value.indexOf('"vllm",') + 3;
    ta.selectionStart = inStr;
    ta.selectionEnd = inStr;
    ta.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, composed: true }));
    await new Promise((r) => setTimeout(r, 20));
    expect(el.shadowRoot.querySelectorAll(".je-brace--match").length).toBe(0);
  });
});

describe("json-editor caret style + multi-caret", () => {
  let el;
  let ta;

  beforeEach(async () => {
    el = await mount();
    ta = input(el);
    ta.focus();
    document.dispatchEvent(new Event("selectionchange"));
    await new Promise((r) => setTimeout(r, 20));
  });

  function beforeinput(inputType, data) {
    const ev = new InputEvent("beforeinput", {
      inputType,
      data,
      bubbles: true,
      cancelable: true,
    });
    ta.dispatchEvent(ev);
  }

  test("renders a 2px custom caret at the caret position and hides the native one", () => {
    ta.setSelectionRange(0, 0);
    document.dispatchEvent(new Event("selectionchange"));
    const caret = el.shadowRoot.querySelector(".je-caret");
    expect(caret).toBeTruthy();
    expect(caret.style.left).toBe("10px");
    expect(caret.style.top).toBe("0px");
    expect(caret.style.height).toBe("20px");
    const styles = [...el.shadowRoot.querySelectorAll("style")]
      .map((s) => s.textContent)
      .join("");
    expect(styles).toContain("caret-color: transparent");
  });

  test("Alt+Click adds a caret without moving the primary", () => {
    ta.setSelectionRange(1, 1);
    ta.dispatchEvent(
      new MouseEvent("mousedown", { bubbles: true, composed: true, altKey: true, button: 0 }),
    );
    expect(el._carets.some((c) => c.position === 0)).toBe(true);
    expect(ta.selectionStart).toBe(1); // primary untouched
    expect(el.shadowRoot.querySelectorAll(".je-caret").length).toBe(2);
  });

  test("typing inserts the character at every caret", async () => {
    const l2 = el._visibleLines[1].start; // start of line 2
    ta.setSelectionRange(0, 0);
    el._carets = [{ anchor: l2, position: l2 }];
    el._renderCarets();
    expect(el.shadowRoot.querySelectorAll(".je-caret").length).toBe(2);

    beforeinput("insertText", "X");
    await new Promise((r) => setTimeout(r, 20));

    const val = ta.value;
    expect(val[0]).toBe("X"); // primary caret got it
    expect((val.match(/X/g) || []).length).toBe(2); // second caret got it too
    expect(ta.selectionStart).toBe(1);
    expect(el._carets).toEqual([{ anchor: l2 + 1, position: l2 + 1 }]);
  });

  test("typing an auto-paired brace inserts the pair at every caret", async () => {
    const l2 = el._visibleLines[1].start;
    ta.setSelectionRange(0, 0);
    el._carets = [{ anchor: l2, position: l2 }];
    el._renderCarets();
    const openBefore = (ta.value.match(/\{/g) || []).length;
    const closeBefore = (ta.value.match(/\}/g) || []).length;
    beforeinput("insertText", "{");
    await new Promise((r) => setTimeout(r, 20));
    expect((ta.value.match(/\{/g) || []).length).toBe(openBefore + 2); // one pair per caret
    expect((ta.value.match(/\}/g) || []).length).toBe(closeBefore + 2); // auto-closed
    expect(ta.selectionStart).toBe(1); // caret sits between { and }
  });

  test("backspace deletes the char before every caret", async () => {
    const l2 = el._visibleLines[1].start + 2; // mid-line-2
    const before = ta.value.length;
    ta.setSelectionRange(1, 1);
    el._primaryAnchor = 1;
    el._primaryPosition = 1;
    el._carets = [{ anchor: l2, position: l2 }];
    el._renderCarets();
    beforeinput("deleteContentBackward", null);
    await new Promise((r) => setTimeout(r, 20));
    expect(ta.value.length).toBe(before - 2);
    expect(ta.selectionStart).toBe(0);
    expect(el._carets).toEqual([{ anchor: l2 - 1, position: l2 - 1 }]);
  });

  test("Escape clears the extra carets", () => {
    ta.setSelectionRange(0, 0);
    el._carets = [{ anchor: 5, position: 5 }];
    el._renderCarets();
    expect(el.shadowRoot.querySelectorAll(".je-caret").length).toBeGreaterThan(1);
    ta.dispatchEvent(
      new KeyboardEvent("keydown", { bubbles: true, composed: true, key: "Escape" }),
    );
    expect(el._carets).toEqual([]);
    expect(el.shadowRoot.querySelectorAll(".je-caret").length).toBe(1);
  });

  test("Ctrl+Alt+ArrowUp adds a caret on the line above", () => {
    ta.setSelectionRange(el._visibleLines[1].start + 4, el._visibleLines[1].start + 4);
    ta.dispatchEvent(
      new KeyboardEvent("keydown", {
        bubbles: true,
        composed: true,
        key: "ArrowUp",
        ctrlKey: true,
        altKey: true,
      }),
    );
    expect(el._carets.length).toBe(1);
    // The new caret is on line 1, at the same clamped column.
    const c = el._carets[0];
    expect(c.position).toBeLessThan(el._visibleLines[1].start);
  });

  test("Shift+ArrowRight extends the selection at every caret", () => {
    const l2 = el._visibleLines[1].start;
    ta.setSelectionRange(0, 0);
    el._primaryAnchor = 0;
    el._primaryPosition = 0;
    el._carets = [{ anchor: l2, position: l2 }];
    el._renderCarets();
    ta.dispatchEvent(
      new KeyboardEvent("keydown", {
        bubbles: true,
        composed: true,
        key: "ArrowRight",
        shiftKey: true,
      }),
    );
    // Primary extended to [0,1).
    expect(ta.selectionStart).toBe(0);
    expect(ta.selectionEnd).toBe(1);
    // Extra caret extended to [l2, l2+1).
    expect(el._carets).toEqual([{ anchor: l2, position: l2 + 1 }]);
    // BOTH ranges are highlighted.
    expect(el.shadowRoot.querySelectorAll(".je-segment").length).toBeGreaterThan(1);
  });

  test("overlapping carets merge into a single continuous highlight", () => {
    const l2 = el._visibleLines[1].start;
    ta.setSelectionRange(l2, l2 + 8);
    el._primaryAnchor = l2;
    el._primaryPosition = l2 + 8;
    el._carets = [{ anchor: l2 + 4, position: l2 + 12 }];
    el._renderCarets();
    el._updateSelectionHighlight();
    // Both carets overlap on line 2 => merged into ONE segment (no double paint).
    expect(el.shadowRoot.querySelectorAll(".je-segment").length).toBe(1);
  });

  test("disjoint carets stay as separate highlights", () => {
    const l2 = el._visibleLines[1].start;
    const l3 = el._visibleLines[2].start;
    ta.setSelectionRange(l2, l2 + 3);
    el._primaryAnchor = l2;
    el._primaryPosition = l2 + 3;
    el._carets = [{ anchor: l3, position: l3 + 3 }];
    el._renderCarets();
    el._updateSelectionHighlight();
    // Non-overlapping ranges on different lines => two separate segments.
    expect(el.shadowRoot.querySelectorAll(".je-segment").length).toBe(2);
  });

  test("ArrowRight moves every caret without extending", () => {
    const l2 = el._visibleLines[1].start;
    ta.setSelectionRange(0, 0);
    el._primaryAnchor = 0;
    el._primaryPosition = 0;
    el._carets = [{ anchor: l2, position: l2 }];
    el._renderCarets();
    ta.dispatchEvent(
      new KeyboardEvent("keydown", {
        bubbles: true,
        composed: true,
        key: "ArrowRight",
      }),
    );
    expect(ta.selectionStart).toBe(1);
    expect(ta.selectionEnd).toBe(1); // collapsed
    expect(el._carets).toEqual([{ anchor: l2 + 1, position: l2 + 1 }]);
  });

  test("typing replaces every caret's selection", async () => {
    const l2 = el._visibleLines[1].start;
    ta.setSelectionRange(0, 2);
    el._primaryAnchor = 0;
    el._primaryPosition = 2;
    el._carets = [{ anchor: l2, position: l2 + 2 }];
    el._renderCarets();
    const lenBefore = ta.value.length;
    beforeinput("insertText", "Z");
    await new Promise((r) => setTimeout(r, 20));
    // Two 2-char selections replaced by one char each.
    expect(ta.value.length).toBe(lenBefore - 2);
    expect((ta.value.match(/Z/g) || []).length).toBe(2);
    expect(ta.selectionStart).toBe(1); // collapsed to after the inserted char
  });

  test("Cmd+ArrowUp moves every caret to the top of the document, keeping both", () => {
    const l2 = el._visibleLines[1].start;
    ta.setSelectionRange(l2, l2);
    el._primaryAnchor = l2;
    el._primaryPosition = l2;
    el._carets = [{ anchor: l2 + 3, position: l2 + 3 }];
    el._renderCarets();
    ta.dispatchEvent(
      new KeyboardEvent("keydown", {
        bubbles: true,
        composed: true,
        key: "ArrowUp",
        metaKey: true,
      }),
    );
    // Both carets converge to file start; neither is dropped.
    expect(ta.selectionStart).toBe(0);
    expect(el._carets.length).toBe(1);
    expect(el._carets[0].position).toBe(0);
    expect(el.shadowRoot.querySelectorAll(".je-caret").length).toBe(2);
  });

  test("Cmd+ArrowRight jumps every caret to the end of its own line", () => {
    const l2 = el._visibleLines[1].start;
    const l2End = l2 + el._visibleLines[1].text.length;
    ta.setSelectionRange(l2 + 2, l2 + 2);
    el._primaryAnchor = l2 + 2;
    el._primaryPosition = l2 + 2;
    el._carets = [{ anchor: l2 + 5, position: l2 + 5 }];
    el._renderCarets();
    ta.dispatchEvent(
      new KeyboardEvent("keydown", {
        bubbles: true,
        composed: true,
        key: "ArrowRight",
        metaKey: true,
      }),
    );
    expect(ta.selectionStart).toBe(l2End);
    expect(el._carets[0].position).toBe(l2End);
  });

  test("Cmd+Shift+ArrowUp extends both selections to the top, keeping the merged highlight", () => {
    const l2 = el._visibleLines[1].start;
    ta.setSelectionRange(l2, l2 + 8);
    el._primaryAnchor = l2;
    el._primaryPosition = l2 + 8;
    el._carets = [{ anchor: l2 + 5, position: l2 + 13 }];
    el._renderCarets();
    ta.dispatchEvent(
      new KeyboardEvent("keydown", {
        bubbles: true,
        composed: true,
        key: "ArrowUp",
        metaKey: true,
        shiftKey: true,
      }),
    );
    // Both positions converge to file start; each keeps its own anchor.
    const ranges = el._allCarets();
    expect(ranges.length).toBe(2);
    expect(ranges[0].pos).toBe(0);
    expect(ranges[1].pos).toBe(0);
    // Each caret keeps its own anchor (the selections extend to the top).
    expect(ranges[0].e).toBe(l2);
    expect(ranges[1].e).toBe(l2 + 5);
    // The two overlapping selections merge into ONE range, so the 2-line
    // span paints exactly one segment per line (not two stacked on line 1).
    el._updateSelectionHighlight();
    expect(el.shadowRoot.querySelectorAll(".je-segment").length).toBe(2);
    // Both carets render at the top.
    expect(el.shadowRoot.querySelectorAll(".je-caret").length).toBe(2);
  });

  test("typing after carets converge inserts once but keeps both carets", async () => {
    const l2 = el._visibleLines[1].start;
    ta.setSelectionRange(l2, l2);
    el._primaryAnchor = l2;
    el._primaryPosition = l2;
    el._carets = [{ anchor: l2 + 3, position: l2 + 3 }];
    el._renderCarets();
    ta.dispatchEvent(
      new KeyboardEvent("keydown", {
        bubbles: true,
        composed: true,
        key: "ArrowUp",
        metaKey: true,
      }),
    );
    beforeinput("insertText", "X");
    await new Promise((r) => setTimeout(r, 20));
    // Both carets were at the same position => a single insert.
    expect((ta.value.match(/X/g) || []).length).toBe(1);
    // Both carets persist, now at position 1.
    expect(el._carets.length).toBe(1);
    expect(el._carets[0].position).toBe(1);
    expect(ta.selectionStart).toBe(1);
  });
});

describe("json-editor enter-in-empty-pair expansion", () => {
  let el;
  let ta;

  beforeEach(async () => {
    el = await mount({ list: [] });
    ta = input(el);
    ta.focus();
    document.dispatchEvent(new Event("selectionchange"));
    await new Promise((r) => setTimeout(r, 20));
  });

  test("Enter inside an empty array expands into 3 lines with an aligned ] and indented caret", () => {
    const idx = ta.value.indexOf("[]");
    expect(idx).toBeGreaterThan(-1);
    const caret = idx + 1; // between [ and ]
    ta.setSelectionRange(caret, caret);
    ta.dispatchEvent(
      new KeyboardEvent("keydown", { bubbles: true, composed: true, key: "Enter" }),
    );
    // The closing ] moves onto its own line aligned with the member line;
    // the caret sits on a freshly-indented middle line ready for a value.
    expect(ta.value).toBe('{\n  "list": [\n    \n  ]\n}');
    expect(ta.selectionStart).toBe(caret + 5);
  });

  test("Enter inside an empty object expands into 3 lines with an aligned }", async () => {
    const el2 = await mount({ item: {} });
    const ta2 = input(el2);
    const idx = ta2.value.indexOf("{}");
    const caret = idx + 1;
    ta2.setSelectionRange(caret, caret);
    ta2.dispatchEvent(
      new KeyboardEvent("keydown", { bubbles: true, composed: true, key: "Enter" }),
    );
    expect(ta2.value).toBe('{\n  "item": {\n    \n  }\n}');
    expect(ta2.selectionStart).toBe(caret + 5);
  });

  test("Enter with content between brackets does not expand", async () => {
    const el2 = await mount({ list: [1] });
    const ta2 = input(el2);
    const caret = ta2.value.indexOf("[") + 1; // between [ and the element
    ta2.setSelectionRange(caret, caret);
    // A non-empty pair declines the expansion — the default newline + indent
    // path applies instead.
    expect(el2._enterEmptyPair(ta2)).toBe(false);
  });
});

describe("json-editor caret tracks the active end of a selection", () => {
  let el;
  let ta;

  beforeEach(async () => {
    el = await mount();
    ta = input(el);
    ta.focus();
    document.dispatchEvent(new Event("selectionchange"));
    await new Promise((r) => setTimeout(r, 100));
  });

  test("a backward selection keeps the caret at the moving (start) end", () => {
    const a = 8;
    const z = 22;
    ta.setSelectionRange(a, z, "backward"); // active end at `a`
    const ranges = el._allCarets();
    // The highlight spans [a, z]...
    expect(ranges[0].s).toBe(a);
    expect(ranges[0].e).toBe(z);
    // ...BUT the caret sits at `a`, the end the user is dragging toward.
    expect(ranges[0].pos).toBe(a);
  });

  test("a forward selection keeps the caret at the moving (end) end", () => {
    ta.setSelectionRange(3, 19, "forward");
    const ranges = el._allCarets();
    expect(ranges[0].s).toBe(3);
    expect(ranges[0].e).toBe(19);
    expect(ranges[0].pos).toBe(19);
  });

  test("collapsed caret sits at the single position", () => {
    ta.setSelectionRange(7, 7);
    const ranges = el._allCarets();
    expect(ranges[0].s).toBe(7);
    expect(ranges[0].e).toBe(7);
    expect(ranges[0].pos).toBe(7);
  });
});

describe("json-editor single-caret Cmd+Arrow", () => {
  let el;
  let ta;

  beforeEach(async () => {
    el = await mount();
    ta = input(el);
    ta.focus();
  });

  test("Cmd+Shift+ArrowRight extends a backward multi-row selection to the top row's line end", () => {
    const l2 = el._visibleLines[1];
    const topStart = l2.start;
    const topEnd = l2.start + l2.text.length;
    const l3 = el._visibleLines[2];
    const anchor = l3.start + 1;
    // Active end on the TOP row, anchor deeper down (backward selection).
    ta.setSelectionRange(topStart, anchor, "backward");
    el._singleCmdArrow(ta, "ArrowRight", true);
    // The active end jumps to the top row's line end...
    expect(ta.selectionStart).toBe(topEnd);
    expect(ta.selectionDirection).toBe("backward");
    // ...while the anchor (the bottom of the highlight block) is preserved.
    expect(ta.selectionEnd).toBe(anchor);
    // The caret bar sits at the top line's end.
    expect(el._allCarets()[0].pos).toBe(topEnd);
  });

  test("Cmd+ArrowRight moves a collapsed caret to the end of its line", () => {
    const l2 = el._visibleLines[1];
    const start = l2.start;
    const end = l2.start + l2.text.length;
    ta.setSelectionRange(start, start);
    el._singleCmdArrow(ta, "ArrowRight", false);
    expect(ta.selectionStart).toBe(end);
    expect(ta.selectionEnd).toBe(end);
  });

  test("Cmd+Shift+ArrowLeft on a forward selection extends to its own line's start", () => {
    const l2 = el._visibleLines[1];
    const topStart = l2.start;
    const l3 = el._visibleLines[2];
    const anchor = topStart;            // anchor at top row start
    const active = l3.start + 4;        // active end deeper down (forward)
    ta.setSelectionRange(anchor, active, "forward");
    el._singleCmdArrow(ta, "ArrowLeft", true);
    // The active end collapses to the START of its own line (line 2)...
    expect(ta.selectionStart).toBe(anchor);
    expect(ta.selectionEnd).toBe(l3.start);
    expect(ta.selectionDirection).toBe("forward");
    // ...while the anchor (top of the highlight block) is preserved.
    expect(ta.selectionStart).toBe(topStart);
  });
});
