// @ts-nocheck
/**
 * Integration tests for Phase 1 (large-file performance) at the component level.
 *
 * Verifies the `file-editor` element uses the injected trackers end-to-end:
 *   - dirty state rides on the VersionBasedDirtyTracker + model version IDs,
 *     including the undo-to-clean case that replaces the old full-string compare.
 *   - content width is derived from LineWidthTracker, which measures ALL lines
 *     synchronously on load so the scrollbar is exact from the start, then
 *     re-measures only edited lines.
 */
import { describe, test, expect, beforeEach, vi } from "vitest";
import { PieceTreeTextContentModel } from "openp41ge-editor-engine/model/piece-tree-text-content-model";
import { LineWidthTracker } from "../../../src/components/file-editor/line-width-tracker";
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

  test("correct from the start: every line is measured synchronously on mount", async () => {
    // Product requirement: the horizontal scrollbar must be the exact size
    // from the start — no lazy/approximate width that widens as measurement
    // completes. The tracker must measure ALL 20k lines before first paint.
    const lineCount = 20000;
    const content = Array.from({ length: lineCount }, (_, i) => `line ${i}`).join("\n");

    const measure = vi.fn((line: number) => line);
    const tracker = new LineWidthTracker(measure);

    await mountEditor({ content, lineWidthTracker: tracker });
    expect(measure).toHaveBeenCalledTimes(lineCount); // full exact scan on load
    expect(tracker.maxColumns).toBe(lineCount);
  });

  test("edits re-measure only touched lines, never the whole file", async () => {
    const lineCount = 5000;
    const content = Array.from({ length: lineCount }, (_, i) => `line ${i}`).join("\n");
    const measure = vi.fn((line: number) => line);
    const tracker = new LineWidthTracker(measure);
    const el = await mountEditor({ content, lineWidthTracker: tracker });
    const callsAfterLoad = measure.mock.calls.length;
    expect(callsAfterLoad).toBe(lineCount);

    // Type a single character on the first line — only that line remeasured.
    typeText(el, "q");
    await new Promise((r) => setTimeout(r, 0));
    const callsAfterEdit = measure.mock.calls.length;
    expect(callsAfterEdit - callsAfterLoad).toBeLessThanOrEqual(2);
  });

  test("wrap on + content change keeps the vertical scrollbar exact from the start (regression)", async () => {
    // Mount a tiny document with wrap ON so the wrap index caches per-line
    // segment counts of 1 for the original lines ("a" and "b" don't wrap at the
    // jsdom column of 10). Then reload the document with content that wraps
    // into 6 segments per line. _onViewModelChange must invalidate the wrap
    // index BEFORE _updateScrollHeight recomputes the wrapper height, or the
    // scrollbar comes out short by the stale lines' segment-count delta.
    // (Live repro was 71 short lines -> wrapped content: 7787 view lines
    // instead of 8000, i.e. 155740px instead of 160000px.)
    const el = await mountEditor({ content: "a\nb\n" });
    (el as any)._wordWrapEnabled = true;
    (el as any)._applyWordWrap(); // wrap index built for the 2 short lines
    const vl = (el as any)._viewLines;
    const lineHeight = vl._config.lineHeight;
    const index = vl._wrappedIndex;
    // Instrument the height path BEFORE the content change.
    const log: any[] = [];
    const oush = vl._updateScrollHeight.bind(vl);
    vl._updateScrollHeight = function () {
      log.push({
        tlc: this._totalLineCount,
        idxTotal: this.wrappedIndex().totalViewLineCount,
      });
      return oush();
    };

    // 20 lines each wrapping into 6 segments at the jsdom wrap column (10:
    // viewport width 0 + char-width fallback 8 -> calculator minimum 10).
    // With the old ordering the index reuses the cached 1-segment counts for
    // the two original lines, so totalViewLineCount() = 2 + 18*6 = 110 and
    // the height comes out short; with the fix every call resolves to 120.
    const wrapped = Array.from({ length: 20 }, () => "x".repeat(60)).join("\n");
    (el as any).textContentModel.setValue(wrapped);
    await new Promise((r) => setTimeout(r, 40));

    const expectedPx = index.totalViewLineCount * lineHeight;
    const actualPx = parseFloat(vl._linesWrapper.element.style.height);
    expect(index.totalViewLineCount).toBe(120); // 20 lines x 6 segments @ col 10
    expect(actualPx).toBe(expectedPx); // not the stale 2 + 18*6 = 110-line height
    // Every height computation during the change already used the fresh total.
    const stale = log.filter((e) => e.idxTotal !== 120);
    expect(stale).toHaveLength(0);
  });
});

