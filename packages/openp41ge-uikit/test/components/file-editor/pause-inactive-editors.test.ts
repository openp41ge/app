// @ts-nocheck
/**
 * Regression tests for pausing inactive file editors.
 *
 * FileEditorElement.setActive(visible) suspends an editor whose tab is not the
 * active tab in its cell. While suspended, edits to the shared model must NOT
 * re-render the hidden editor (that work is wasted), dirty state must still be
 * tracked, and showing the tab again must refresh the visible window.
 */
import { describe, test, expect, beforeEach } from "vitest";
import { PieceTreeTextContentModel } from "openp41ge-editor-engine/model/piece-tree-text-content-model";
import "../../../src/components/file-editor/file-editor";

const CONTENT = "line one;\nline two;\nline three;\n";
const CHANGED = "changed first;\nline two;\nline three;\n";

async function mountEditor(content = CONTENT): Promise<HTMLElement> {
  const el = document.createElement("file-editor");
  el.filePath = "/repo/app.ts";
  el.fileName = "app.ts";
  el.textContentModel = new PieceTreeTextContentModel("file:///app.ts", content);
  document.body.appendChild(el);
  // Let Lit mount + firstUpdated + _initWithModel run.
  await new Promise((r) => setTimeout(r, 30));
  return el;
}

/** Text of the top-most rendered view line (or null if none rendered). */
function firstLineText(el: HTMLElement): string | null {
  const line = el.querySelector(".fe-viewport .view-line");
  return line ? line.textContent : null;
}

describe("pause inactive file editors", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  test("a hidden editor does not re-render on model changes but keeps dirty state", async () => {
    const el = await mountEditor();
    expect(firstLineText(el)).toBe("line one;");

    el.setActive(false); // tab deactivated — pause

    // Another tab edits the shared model.
    el.textContentModel.setValue(CHANGED);
    await new Promise((r) => setTimeout(r, 0));

    // The hidden editor's view is NOT re-rendered...
    expect(firstLineText(el)).toBe("line one;");
    // ...but its dirty state still tracks the change.
    expect(el.getState().isDirty).toBe(true);
  });

  test("reactivation refreshes the visible window when content changed while hidden", async () => {
    const el = await mountEditor();
    el.setActive(false);
    el.textContentModel.setValue(CHANGED);
    await new Promise((r) => setTimeout(r, 0));
    expect(firstLineText(el)).toBe("line one;"); // still stale

    el.setActive(true); // tab activated — resume
    await new Promise((r) => setTimeout(r, 0));

    expect(firstLineText(el)).toBe("changed first;");
  });

  test("reactivation with no content change leaves the already-correct view intact", async () => {
    const el = await mountEditor();
    el.setActive(false);
    await new Promise((r) => setTimeout(r, 0));
    el.setActive(true);
    await new Promise((r) => setTimeout(r, 0));
    expect(firstLineText(el)).toBe("line one;");
  });

  test("pause and resume are idempotent", async () => {
    const el = await mountEditor();
    el.setActive(false);
    el.setActive(false); // repeated pause is a no-op
    el.textContentModel.setValue(CHANGED);
    await new Promise((r) => setTimeout(r, 0));
    expect(firstLineText(el)).toBe("line one;");

    el.setActive(true);
    el.setActive(true); // repeated resume is a no-op
    await new Promise((r) => setTimeout(r, 0));
    expect(firstLineText(el)).toBe("changed first;");
  });
});
