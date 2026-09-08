// @ts-nocheck
/**
 * Tests for the <file-editor> in-editor find bar (Cmd/Ctrl+F) and the external
 * highlight source API (setSearchHighlight / clearSearchHighlight).
 *
 * Match SEMANTICS (query/options → match list) are pinned against the editor's
 * `_findMatches` (computed by FindInEditor). RENDERED spans are asserted only
 * for the visible band — jsdom gives the viewport a tiny/zero height, so the
 * visible window covers just the first ~2 lines; off-window matches exist but
 * are intentionally not painted until they scroll into view.
 *
 * Pins:
 *   - an external highlight source computes matches without opening the bar,
 *     and clearSearchHighlight removes them
 *   - Cmd+F opens the bottom-bar find strip (fe-find-input) which can be typed
 *     into to highlight matches live, and Escape closes + clears
 *   - the whole-word / regex / case options drive the match set the same way
 *     the Git sidebar toggles do
 */
import { describe, test, expect, beforeEach } from "vitest";
import { PieceTreeTextContentModel } from "openp41ge-editor-engine/model/piece-tree-text-content-model";
import "../../../src/components/file-editor/file-editor";

const CONTENT =
  "const alpha = 1;\nconst beta = 2;\nconsole.log(alpha, beta);\nAlpha handled elsewhere.\n";

async function mountEditor(file = "app.ts"): Promise<HTMLElement> {
  const el = document.createElement("file-editor") as HTMLElement & {
    filePath: string;
    fileName: string;
    textContentModel: unknown;
  };
  el.filePath = `/repo/${file}`;
  el.fileName = file;
  el.textContentModel = new PieceTreeTextContentModel(`file:///${file}`, CONTENT);
  document.body.appendChild(el);
  // Let Lit mount + firstUpdated + _initWithModel run.
  await new Promise((r) => setTimeout(r, 30));
  return el;
}

const tick = () => new Promise((r) => setTimeout(r, 5));

/** All rendered match spans (active spans carry both classes). */
function renderedSpans(el: HTMLElement): HTMLElement[] {
  return [...el.querySelectorAll(".find-match, .find-match-active")] as HTMLElement[];
}

describe("file-editor find + external highlight", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  test("external highlight computes matches and renders visible spans", async () => {
    const el = await mountEditor();
    el.setSearchHighlight("alpha");
    await tick();

    // "alpha" (line 1), "alpha" (line 3) and "Alpha" (line 4), case-insensitive.
    expect(el._findMatches.length).toBe(3);
    // Line 1 is inside the jsdom visible window → painted; the active one too.
    expect(renderedSpans(el).length).toBeGreaterThan(0);
    expect(el.querySelectorAll(".find-match-active").length).toBe(1);
  });

  test("clearSearchHighlight removes matches and spans", async () => {
    const el = await mountEditor();
    el.setSearchHighlight("beta");
    await tick();
    expect(el._findMatches.length).toBeGreaterThan(0);

    el.clearSearchHighlight();
    await tick();
    expect(el._findMatches.length).toBe(0);
    expect(renderedSpans(el)).toHaveLength(0);
  });

  test("external highlight options (case-sensitive) narrow the match set", async () => {
    const el = await mountEditor();
    // Case-insensitive: "alpha" (x2) + "Alpha" (x1).
    el.setSearchHighlight("alpha");
    await tick();
    expect(el._findMatches.length).toBe(3);

    // Case-sensitive: only "alpha" (x2), "Alpha" excluded.
    el.setSearchHighlight("alpha", { caseSensitive: true });
    await tick();
    expect(el._findMatches.length).toBe(2);
  });

  test("cmd+f opens the bottom-bar find strip and typing highlights; Escape closes", async () => {
    const el = await mountEditor();
    const ta = el.querySelector("textarea") as HTMLTextAreaElement;
    ta.focus();
    ta.dispatchEvent(
      new KeyboardEvent("keydown", { key: "f", metaKey: true, bubbles: true, cancelable: true }),
    );
    await tick();

    const input = el.querySelector("[data-testid=fe-find-input]") as HTMLInputElement | null;
    expect(input).not.toBeNull();
    expect(document.activeElement).toBe(input);

    // Type a query — matches should be computed.
    (input as HTMLInputElement).value = "alpha";
    input.dispatchEvent(new InputEvent("input", { bubbles: true, composed: true }));
    await tick();
    expect(el._findMatches.length).toBeGreaterThan(0);
    expect(renderedSpans(el).length).toBeGreaterThan(0);
    // The count pill shows "1/N" after the first match run.
    expect(el.querySelector(".fe-find-count")?.textContent).toMatch(/^1\//);

    // Escape closes the bar and clears the highlight.
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
    );
    await tick();
    expect(el.querySelector("[data-testid=fe-find-input]")).toBeNull();
    expect(renderedSpans(el)).toHaveLength(0);
  });

  test("entry icon opens the find bar too", async () => {
    const el = await mountEditor();
    const entry = el.querySelector("[data-testid=fe-find-entry]") as HTMLElement | null;
    expect(entry).not.toBeNull();
    entry.click();
    await tick();
    expect(el.querySelector("[data-testid=fe-find-input]")).not.toBeNull();
  });

  test("whole-word option excludes partial matches", async () => {
    const el = await mountEditor();
    // "hab" is a substring of "handled" — with whole word it must not match.
    el.setSearchHighlight("hab", { wholeWord: true });
    await tick();
    expect(el._findMatches.length).toBe(0);

    // "handled" as a whole word matches once (line 4).
    el.setSearchHighlight("handled", { wholeWord: true });
    await tick();
    expect(el._findMatches.length).toBe(1);
  });

  test("find field lives in the full-width bar above the status bar; icon stays in the bottom bar", async () => {
    const el = await mountEditor();
    // Closed: nothing but the icon is in the bottom bar — no field anywhere yet.
    expect(el.querySelector("[data-testid=fe-find-input]")).toBeNull();

    (el.querySelector("[data-testid=fe-find-entry]") as HTMLElement).click();
    await tick();

    const input = el.querySelector("[data-testid=fe-find-input]") as HTMLInputElement;
    expect(input).not.toBeNull();
    // The field is NOT inside the status row — it sits in the fe-find-bar ABOVE it.
    expect(input.closest(".fe-find-bar")).not.toBeNull();
    expect(input.closest(".sbb-row")).toBeNull();
    // The bottom bar keeps just the icon while find is open.
    expect(el.querySelector("[data-testid=fe-find-entry]")).not.toBeNull();
    // The find bar precedes the status row in DOM order (it is above it).
    const bar = input.closest(".fe-find-bar") as HTMLElement;
    const row = el.querySelector(".sbb-row") as HTMLElement;
    expect(bar.compareDocumentPosition(row) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // The find bar has its top border (separating it from the editor above).
    expect(bar.style.borderTop).toContain("1px solid");
    // Span-all-the-way-across: the input is the flex-grow child.
    expect(input.style.flex).toContain("1");
  });

  test("clicking the bottom-bar find icon while open closes the find bar and clears highlights", async () => {
    const el = await mountEditor();
    (el.querySelector("[data-testid=fe-find-entry]") as HTMLElement).click();
    await tick();
    expect(el.querySelector("[data-testid=fe-find-input]")).not.toBeNull();

    // Same icon toggles it back closed.
    (el.querySelector("[data-testid=fe-find-entry]") as HTMLElement).click();
    await tick();
    expect(el.querySelector("[data-testid=fe-find-input]")).toBeNull();
    expect(renderedSpans(el)).toHaveLength(0);
  });

  test("search-match highlights have rounded corners like the text selection", async () => {
    const el = await mountEditor();
    el.setSearchHighlight("alpha");
    await tick();
    const span = el.querySelector(".find-match") as HTMLElement;
    expect(span).not.toBeNull();
    expect(getComputedStyle(span).borderRadius).toBe("3px");
  });

  test("find input is borderless/transparent so the whole bar reads as the input container", async () => {
    const el = await mountEditor();
    (el.querySelector("[data-testid=fe-find-entry]") as HTMLElement).click();
    await tick();
    const input = el.querySelector("[data-testid=fe-find-input]") as HTMLInputElement;
    const cs = getComputedStyle(input);
    expect(cs.borderStyle).toBe("none");
    expect(["rgba(0, 0, 0, 0)", "transparent"]).toContain(cs.backgroundColor);
    // Input fills the bar (no height/padding inset) — the bar box is the box.
    expect(input.style.padding).toBe("0px");
  });

  test("whole word is a toggle icon at the end of the search bar (no filter strip/dropdown)", async () => {
    const el = await mountEditor();
    (el.querySelector("[data-testid=fe-find-entry]") as HTMLElement).click();
    await tick();

    // The inline filter strip / options dropdown are gone entirely.
    expect(el.querySelector(".fe-find-strip")).toBeNull();
    expect(el.querySelector("[data-testid=fe-find-config]")).toBeNull();

    // Whole-word lives at the END of the search-bar toggles (after regex + case).
    const regexBtn = el.querySelector("[data-testid=fe-find-regex]") as HTMLElement;
    const caseBtn = el.querySelector("[data-testid=fe-find-case]") as HTMLElement;
    const wordBtn = el.querySelector("[data-testid=fe-find-whole-word]") as HTMLElement;
    expect(wordBtn).not.toBeNull();
    expect(wordBtn.closest(".fe-find-bar")).not.toBeNull();
    expect(
      regexBtn.compareDocumentPosition(wordBtn) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      caseBtn.compareDocumentPosition(wordBtn) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    // Toggling it narrows matches: "han" is a substring of "handled", not a word.
    const input = el.querySelector("[data-testid=fe-find-input]") as HTMLInputElement;
    input.value = "han";
    input.dispatchEvent(new InputEvent("input", { bubbles: true, composed: true }));
    await tick();
    expect(el._findMatches.length).toBeGreaterThan(0);

    wordBtn.click();
    await tick();
    expect(el._findMatches.length).toBe(0);
  });
});

describe("file-editor revealLine", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  test("moves the primary cursor to the requested 1-based line/column", async () => {
    const el = await mountEditor();
    el.revealLine(3, 5);
    await tick();
    const pos = (el as any)._cursorController.position;
    expect(pos.lineNumber).toBe(3);
    expect(pos.column).toBe(5);
  });

  test("clamps an out-of-range line to the last line", async () => {
    const el = await mountEditor();
    el.revealLine(999);
    await tick();
    const pos = (el as any)._cursorController.position;
    // The document ends with a trailing newline, so lineCount is 5 (4 content
    // lines + one empty line); moveTo clamps to the last line.
    expect(pos.lineNumber).toBe(5);
  });

  test("clamps an over-long column to the end of the line", async () => {
    const el = await mountEditor();
    el.revealLine(1, 9999);
    await tick();
    const pos = (el as any)._cursorController.position;
    // "const alpha = 1;" is 16 chars → column clamps to 17.
    expect(pos.lineNumber).toBe(1);
    expect(pos.column).toBe(17);
  });
});
