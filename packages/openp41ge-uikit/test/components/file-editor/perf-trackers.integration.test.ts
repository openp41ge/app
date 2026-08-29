// @ts-nocheck
/**
 * Integration tests for Phase 1 (large-file performance) at the component level.
 *
 * Verifies the `file-editor` element uses the injected trackers end-to-end:
 *   - dirty state rides on the VersionBasedDirtyTracker + model version IDs,
 *     including the undo-to-clean case that replaces the old full-string compare.
 *   - content width is derived from LazyLineWidthTracker, which must NOT measure
 *     every line synchronously when a large model mounts.
 */
import { describe, test, expect, beforeEach, vi } from "vitest";
import { PieceTreeTextContentModel } from "openp41ge-editor-engine/model/piece-tree-text-content-model";
import { LazyLineWidthTracker } from "../../../src/components/file-editor/line-width-tracker";
import { VersionBasedDirtyTracker } from "../../../src/components/file-editor/dirty-state-tracker";
import "../../../src/components/file-editor/file-editor";

async function mountEditor({
  content,
  lineWidthTracker,
  dirtyTracker,
  file = "app.ts",
}: {
  content: string;
  lineWidthTracker?: unknown;
  dirtyTracker?: unknown;
  file?: string;
}): Promise<HTMLElement> {
  const el = document.createElement("file-editor") as HTMLElement;
  if (lineWidthTracker) el._lineWidthTracker = lineWidthTracker;
  if (dirtyTracker) el._dirtyTracker = dirtyTracker;
  (el as any).filePath = `/repo/${file}`;
  (el as any).fileName = file;
  (el as any).textContentModel = new PieceTreeTextContentModel(`file:///${file}`, content);
  document.body.appendChild(el);
  // Let Lit mount + firstUpdated + _initWithModel run.
  await new Promise((r) => setTimeout(r, 30));
  return el;
}

function typeText(el: HTMLElement, chars: string): void {
  const ta = el.querySelector("textarea") as HTMLTextAreaElement;
  // The browser APPENDS real keystrokes to the textarea's current value, and
  // TextAreaInput diffs against its previous value — simulate that (this is
  // how the caret-focus harness types "q" then "qq").
  ta.value += chars;
  ta.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
}

describe("file-editor Phase 1 trackers (integration)", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    (globalThis as any).document.body.innerHTML = "";
  });

  test("dirty: clean on load, dirty after typing, clean after save", async () => {
    const el = await mountEditor({ content: "const a = 1;\n" });
    expect((el as any).getState().isDirty).toBe(false);

    typeText(el, "q");
    await new Promise((r) => setTimeout(r, 0));
    expect((el as any).getState().isDirty).toBe(true);

    await (el as any).save();
    expect((el as any).getState().isDirty).toBe(false);
  });

  test("undo-to-clean: undoing back to the saved document reports clean (regression)", async () => {
    const el = await mountEditor({ content: "const a = 1;\n" });
    expect((el as any).getState().isDirty).toBe(false);

    typeText(el, "q");
    await new Promise((r) => setTimeout(r, 0));
    expect((el as any).getState().isDirty).toBe(true);

    // Undo back to the pristine document. With the old `_savedContent` string
    // compare this is detected via full-string equality; with the new
    // version-based tracker it relies on undo() restoring versionId.
    // Use the CursorController path (Cmd+Z) so the textarea stays in sync.
    (el as any).cursorController.undo();
    await new Promise((r) => setTimeout(r, 0));
    expect((el as any).getState().isDirty).toBe(false);
    expect((el as any).textContentModel.getValue()).toBe("const a = 1;\n");
  });

  test("typing again after undo-to-clean marks the editor dirty once more", async () => {
    const el = await mountEditor({ content: "hello\n" });
    typeText(el, "x");
    await new Promise((r) => setTimeout(r, 0));
    (el as any).cursorController.undo();
    await new Promise((r) => setTimeout(r, 0));
    expect((el as any).getState().isDirty).toBe(false);

    typeText(el, "y");
    await new Promise((r) => setTimeout(r, 0));
    expect((el as any).getState().isDirty).toBe(true);
  });

  test("large model: NOT every line is measured synchronously on mount", async () => {
    // A 20k-line document. The old `_updateContentWidth` looped ALL lines on
    // load. The new tracker must only measure the first batch synchronously.
    const lineCount = 20000;
    const content = Array.from({ length: lineCount }, (_, i) => `line ${i}`).join("\n");

    const measure = vi.fn((line: number) => line);
    const noIdle = () => {}; // never run the background scan during the test
    const tracker = new LazyLineWidthTracker(measure, {
      batchSize: 1000,
      scheduleIdle: () => noIdle(),
    });

    await mountEditor({ content, lineWidthTracker: tracker });
    const measured = measure.mock.calls.length;
    expect(measured).toBeGreaterThan(0);
    expect(measured).toBeLessThan(lineCount); // nowhere near one call per line
    expect(measured).toBeLessThanOrEqual(2000); // first batch + a small allowance
  });
});
