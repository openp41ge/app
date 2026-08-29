// @ts-nocheck
/**
 * Regression tests for caret focus visibility.
 *
 * Only the FOCUSED file editor may show its caret. An unfocused editor's caret
 * must stay hidden even when a cursor view sync runs (initial render, cursor
 * moves in a background tab, etc.), and refocusing must restore caret placement
 * — including secondary (multi) carets — without destroying them.
 */
import { describe, test, expect, beforeEach } from "vitest";
import { PieceTreeTextContentModel } from "openp41ge-editor-engine/model/piece-tree-text-content-model";
import "../../../src/components/file-editor/file-editor";

const CONTENT = "const x = 1;\nconsole.log(x);\n";

async function mountEditor(file = "app.ts"): Promise<HTMLElement> {
  const el = document.createElement("file-editor") as HTMLElement & {
    filePath: string;
    fileName: string;
    textContentModel: unknown;
    cursorController: {
      moveTo(l: number, c: number): void;
      addCursorAt(l: number, c: number): void;
      getAllCursors(): unknown[];
    };
  };
  el.filePath = `/repo/${file}`;
  el.fileName = file;
  el.textContentModel = new PieceTreeTextContentModel(`file:///${file}`, CONTENT);
  document.body.appendChild(el);
  // Let Lit mount + firstUpdated + _initWithModel run.
  await new Promise((r) => setTimeout(r, 30));
  return el;
}

function caretEls(el: HTMLElement): HTMLElement[] {
  // Primary caret carries the `.cursor-blink` class; secondary carets are
  // created without a class (see CursorRenderer._createCursorEl), so select
  // both by their common inline style (absolute, 2px wide) inside the viewport.
  const vp = el.querySelector(".fe-viewport");
  return [...(vp?.children ?? [])].filter((c) => {
    const s = (c as HTMLElement).style;
    return s.position === "absolute" && s.width === "2px";
  }) as HTMLElement[];
}

function visibleEls(el: HTMLElement): HTMLElement[] {
  return caretEls(el).filter((c) => c.style.visibility !== "hidden");
}

/** Simulate typing through the textarea — triggers onType → cursor sync. */
function typeChar(el: HTMLElement, value: string): void {
  const ta = el.querySelector("textarea") as HTMLTextAreaElement;
  ta.value = value; // cumulative value so the diff is a strict prefix append
  ta.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
}

describe("caret focus visibility", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  test("unfocused editor keeps its caret hidden", async () => {
    const el = await mountEditor();
    // No editor focused; requirement: no caret should be visible.
    expect(document.activeElement).not.toBe(el.querySelector("textarea"));
    expect(visibleEls(el)).toHaveLength(0);
  });

  test("focusing the editor shows the caret", async () => {
    const el = await mountEditor();
    (el.querySelector("textarea") as HTMLTextAreaElement).focus();
    expect(visibleEls(el)).toHaveLength(1);
  });

  test("blur hides the caret and a later cursor sync does NOT resurrect it", async () => {
    const el = await mountEditor();
    const ta = el.querySelector("textarea") as HTMLTextAreaElement;
    ta.focus();
    expect(visibleEls(el)).toHaveLength(1);

    (ta as HTMLTextAreaElement).blur();
    expect(visibleEls(el)).toHaveLength(0);

    // The regression: any sync while blurred (e.g. typing into a background tab,
    // a model update, a cursor move) used to force the caret visible again.
    typeChar(el, "q");
    typeChar(el, "qq");
    expect(visibleEls(el)).toHaveLength(0);
  });

  test("refocusing restores the caret (not destroyed by blur)", async () => {
    const el = await mountEditor();
    const ta = el.querySelector("textarea") as HTMLTextAreaElement;
    ta.focus();
    const before = caretEls(el).length;
    expect(before).toBeGreaterThan(0);
    ta.blur();
    expect(visibleEls(el)).toHaveLength(0);
    ta.focus();
    expect(caretEls(el).length).toBe(before);
    expect(visibleEls(el)).toHaveLength(before);
  });

  test("multi-carets: hidden through syncs while blurred, both restored on refocus", async () => {
    const el = await mountEditor();
    const ta = el.querySelector("textarea") as HTMLTextAreaElement;
    ta.focus();

    // Add a secondary cursor (Alt+Click equivalent) and let a sync run so the
    // renderer materialises the second caret element.
    (el as any).cursorController.addCursorAt(2, 3);
    typeChar(el, "q"); // triggers _syncCursorView → syncCursorCount(2)
    expect(caretEls(el)).toHaveLength(2);
    expect(visibleEls(el)).toHaveLength(2);

    // Blur hides both…
    ta.blur();
    expect(visibleEls(el)).toHaveLength(0);

    // …and a cursor sync while blurred must not resurrect either caret
    // (the regression: sync forces show() on all carets).
    typeChar(el, "qy");
    expect(visibleEls(el)).toHaveLength(0);

    // Refocus shows both again (nothing destroyed, positions preserved).
    ta.focus();
    expect(caretEls(el)).toHaveLength(2);
    expect(visibleEls(el)).toHaveLength(2);
  });

  test("two editors: only the focused one shows a caret", async () => {
    const a = await mountEditor("a.ts");
    const b = await mountEditor("b.ts");
    const taA = a.querySelector("textarea") as HTMLTextAreaElement;
    const taB = b.querySelector("textarea") as HTMLTextAreaElement;

    taA.focus();
    expect(visibleEls(a)).toHaveLength(1);
    expect(visibleEls(b)).toHaveLength(0);

    taB.focus();
    expect(visibleEls(a)).toHaveLength(0);
    expect(visibleEls(b)).toHaveLength(1);

    taB.blur(); // nothing focused → no carets anywhere
    expect(visibleEls(a)).toHaveLength(0);
    expect(visibleEls(b)).toHaveLength(0);
  });
});
