/**
 * Tests for dirty state detection, fe:dirty-changed dispatch, save, and
 * undo-to-clean behaviour.
 *
 * These tests exercise the FileEditorElement directly so that the
 * _onModelContentChange handler, save(), and _savedVersionId tracking
 * are all verified in integration.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import "@openp41ge-file-editor/file-editor.ts";
import { PieceTreeTextContentModel } from "@openp41ge-file-editor/model/piece-tree-text-content-model.ts";
import type { FileEditorElement } from "@openp41ge-file-editor/file-editor.ts";

async function waitForRender(): Promise<void> {
  await new Promise((r) => requestAnimationFrame(r));
  await new Promise((r) => setTimeout(r, 0));
}

const TEST_CONTENT = "hello world";

function createEditor(content: string = TEST_CONTENT): FileEditorElement {
  const el = document.createElement("file-editor") as FileEditorElement;
  document.body.appendChild(el);
  return el;
}

function setModelFromContent(editor: FileEditorElement, content: string = TEST_CONTENT): void {
  const model = new PieceTreeTextContentModel("/test/file.txt", content);
  editor.textContentModel = model;
}

describe("dirty state", () => {
  let editor: FileEditorElement;

  beforeEach(() => {
    // Stub the Electron preload API for save()
    (window as any).openp41ge = {
      file: {
        writeFile: vi.fn().mockResolvedValue({ success: true }),
      },
    };
    editor = createEditor();
  });

  afterEach(() => {
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  it("is not dirty after loading a file", async () => {
    setModelFromContent(editor);
    await editor.loadFile("/test/file.txt", "file.txt");
    await waitForRender();
    expect(editor.getState().isDirty).toBe(false);
  });

  it("becomes dirty after editing content", async () => {
    setModelFromContent(editor);
    await editor.loadFile("/test/file.txt", "file.txt");
    await waitForRender();

    // Simulate a content change by pushing an edit through the model
    const model = editor.textContentModel!;
    model.pushEditOperations([
      {
        range: { startLineNumber: 1, startColumn: 6, endLineNumber: 1, endColumn: 6 },
        text: " XYZ",
      },
    ]);
    await waitForRender();

    expect(editor.getState().isDirty).toBe(true);
  });

  it("dispatches fe:dirty-changed event when dirty state changes", async () => {
    setModelFromContent(editor);
    await editor.loadFile("/test/file.txt", "file.txt");
    await waitForRender();

    const spy = vi.fn();
    editor.addEventListener("fe:dirty-changed", spy);

    const model = editor.textContentModel!;
    model.pushEditOperations([
      {
        range: { startLineNumber: 1, startColumn: 6, endLineNumber: 1, endColumn: 6 },
        text: "!",
      },
    ]);
    await waitForRender();

    expect(spy).toHaveBeenCalledTimes(1);
    const detail = (spy.mock.calls[0][0] as CustomEvent).detail;
    expect(detail.isDirty).toBe(true);
  });

  it("clears dirty state after save", async () => {
    setModelFromContent(editor);
    await editor.loadFile("/test/file.txt", "file.txt");
    await waitForRender();

    const model = editor.textContentModel!;
    model.pushEditOperations([
      {
        range: { startLineNumber: 1, startColumn: 6, endLineNumber: 1, endColumn: 6 },
        text: "!",
      },
    ]);
    await waitForRender();
    expect(editor.getState().isDirty).toBe(true);

    // Save
    await editor.save();
    await waitForRender();
    expect(editor.getState().isDirty).toBe(false);
  });

  it("dispatches fe:dirty-changed(false) after save", async () => {
    setModelFromContent(editor);
    await editor.loadFile("/test/file.txt", "file.txt");
    await waitForRender();

    const model = editor.textContentModel!;
    model.pushEditOperations([
      {
        range: { startLineNumber: 1, startColumn: 6, endLineNumber: 1, endColumn: 6 },
        text: "!",
      },
    ]);
    await waitForRender();

    const spy = vi.fn();
    editor.addEventListener("fe:dirty-changed", spy);

    await editor.save();
    await waitForRender();

    // Should have fired a clean event
    const cleanEvent = spy.mock.calls.find(([e]: [CustomEvent]) => e.detail.isDirty === false);
    expect(cleanEvent).toBeDefined();
  });

  it("detects undo-to-clean (undo all edits back to saved state)", async () => {
    setModelFromContent(editor);
    await editor.loadFile("/test/file.txt", "file.txt");
    await waitForRender();

    const model = editor.textContentModel!;

    // Edit: insert " XYZ"
    model.pushEditOperations([
      {
        range: { startLineNumber: 1, startColumn: 6, endLineNumber: 1, endColumn: 6 },
        text: " XYZ",
      },
    ]);
    await waitForRender();
    expect(editor.getState().isDirty).toBe(true);

    // Undo all the way — should revert to saved state
    model.undo();
    await waitForRender();
    expect(editor.getState().isDirty).toBe(false);
  });

  it("dispatches fe:dirty-changed on undo-to-clean", async () => {
    setModelFromContent(editor);
    await editor.loadFile("/test/file.txt", "file.txt");
    await waitForRender();

    const model = editor.textContentModel!;
    model.pushEditOperations([
      {
        range: { startLineNumber: 1, startColumn: 6, endLineNumber: 1, endColumn: 6 },
        text: "!",
      },
    ]);
    await waitForRender();
    expect(editor.getState().isDirty).toBe(true);

    const spy = vi.fn();
    editor.addEventListener("fe:dirty-changed", spy);

    model.undo();
    await waitForRender();

    expect(spy).toHaveBeenCalled();
    const cleanEvent = spy.mock.calls.find(([e]: [CustomEvent]) => e.detail.isDirty === false);
    expect(cleanEvent).toBeDefined();
  });

  it("cursor does not move when model content changes from another source", async () => {
    setModelFromContent(editor, "multi\nline\ncontent");
    await editor.loadFile("/test/file.txt", "file.txt");
    await waitForRender();

    // Get initial cursor position
    const initialPos = editor.cursorController!.position;
    expect(initialPos.lineNumber).toBe(1);
    expect(initialPos.column).toBe(1);

    // Move cursor to a specific position (simulate user having clicked somewhere)
    editor.cursorController!.moveTo(2, 3);
    await waitForRender();

    const movedPos = editor.cursorController!.position;
    expect(movedPos.lineNumber).toBe(2);
    expect(movedPos.column).toBe(3);

    // Simulate a cross-tab edit: push an edit directly to the shared model
    const model = editor.textContentModel!;
    model.pushEditOperations([
      {
        range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 6 },
        text: "CHANGED ",
      },
    ]);
    await waitForRender();

    // Cursor position should NOT have changed — it was set by user at (2,3)
    // and should stay there even though content changed from another source
    const afterPos = editor.cursorController!.position;
    expect(afterPos.lineNumber).toBe(2);
    expect(afterPos.column).toBe(3);
  });

  it("line numbers update after deleting a line via model edit", async () => {
    setModelFromContent(editor, "line1\nline2\nline3\nline4\nline5");
    await editor.loadFile("/test/file.txt", "file.txt");
    await waitForRender();

    // Helper: read line numbers currently rendered in the gutter
    const getGutterLineNumbers = (): string[] => {
      const gutter = editor.querySelector(".fe-gutter");
      if (!gutter) return [];
      const labels = gutter.querySelectorAll(".line-number");
      return Array.from(labels).map((el) => (el as HTMLElement).textContent || "");
    };

    const model = editor.textContentModel!;
    const initialLabels = getGutterLineNumbers();
    // In jsdom, the viewport may be small so we just check at least 1 label exists
    expect(initialLabels.length).toBeGreaterThanOrEqual(1);

    // Delete line 2: merge line 2 into line 1 by deleting the newline at end of line 1
    model.pushEditOperations([
      {
        range: {
          startLineNumber: 1,
          startColumn: 6, // After "line1"
          endLineNumber: 2,
          endColumn: 1, // Start of "line2"
        },
        text: "",
      },
    ]);
    await waitForRender();

    // The model must reflect the deletion
    expect(model.lineCount).toBe(4);
    expect(model.getValue()).toBe("line1line2\nline3\nline4\nline5");

    // The gutter line numbers should have updated: the first label should still be "1",
    // and subsequent labels should be "2", "3", "4" (not "2", "3", "4", "5")
    const afterLabels = getGutterLineNumbers();
    expect(afterLabels.length).toBeGreaterThanOrEqual(1);
    // The last rendered label should show a number <= 4 (since 4 lines remain)
    const lastNum = parseInt(afterLabels[afterLabels.length - 1], 10);
    expect(lastNum).toBeLessThanOrEqual(4);
  });

  it("line numbers update after inserting a line via model edit", async () => {
    setModelFromContent(editor, "a\nb\nc");
    await editor.loadFile("/test/file.txt", "file.txt");
    await waitForRender();

    const getGutterLineNumbers = (): string[] => {
      const gutter = editor.querySelector(".fe-gutter");
      if (!gutter) return [];
      const labels = gutter.querySelectorAll(".line-number");
      return Array.from(labels).map((el) => (el as HTMLElement).textContent || "");
    };

    const model = editor.textContentModel!;

    // Insert a newline after "a" on line 1
    model.pushEditOperations([
      {
        range: { startLineNumber: 1, startColumn: 2, endLineNumber: 1, endColumn: 2 },
        text: "\n",
      },
    ]);
    await waitForRender();

    // The model must reflect the insertion — 4 lines with "a", empty, "b", "c"
    expect(model.lineCount).toBe(4);
    expect(model.getValue()).toBe("a\n\nb\nc");

    // The rendered line numbers should be consistent with 4 lines.
    // After insert, the visible range may include the new empty line.
    // None of the rendered labels should show a number > 4.
    const afterLabels = getGutterLineNumbers();
    for (const label of afterLabels) {
      const num = parseInt(label, 10);
      if (!isNaN(num)) {
        expect(num).toBeLessThanOrEqual(4);
      }
    }
  });

  it("save writes content to disk via IPC", async () => {
    const writeFileMock = vi.fn().mockResolvedValue({ success: true });
    (window as any).openp41ge.file.writeFile = writeFileMock;

    setModelFromContent(editor, "hello world");
    await editor.loadFile("/test/file.txt", "file.txt");
    await waitForRender();

    // Edit the content so there's something to save
    const model = editor.textContentModel!;
    model.pushEditOperations([
      {
        range: { startLineNumber: 1, startColumn: 6, endLineNumber: 1, endColumn: 6 },
        text: " SAVED",
      },
    ]);
    await waitForRender();

    // Save
    const result = await editor.save();
    expect(result).toBe(true);

    // writeFile should have been called with the correct path and content
    expect(writeFileMock).toHaveBeenCalledWith("/test/file.txt", "hello SAVED world");

    // After save, dirty state should be false
    expect(editor.getState().isDirty).toBe(false);
  });

  it("cursor hidden after textarea blur, shown on focus", async () => {
    setModelFromContent(editor, "test content");
    await editor.loadFile("/test/file.txt", "file.txt");
    await waitForRender();

    // Find the hidden textarea inside the editor
    const textarea = editor.querySelector("textarea");
    expect(textarea).toBeTruthy();
    if (!textarea) return;

    // Find the cursor element
    const cursorEl = editor.querySelector(".cursor-blink") as HTMLElement | null;
    expect(cursorEl).toBeTruthy();
    if (!cursorEl) return;

    // After loadFile, the textarea is focused — cursor should be visible
    expect(cursorEl.style.visibility).not.toBe("hidden");

    // Dispatch blur on the textarea
    textarea.dispatchEvent(new FocusEvent("blur", { bubbles: true }));
    await waitForRender();

    // Cursor should now be hidden
    // (the blur handler calls _cursorRenderer.hide() which sets visibility false)
    // Note: the cursor element's visibility may be controlled via CSS class or inline style
    expect(cursorEl.style.visibility).toBe("hidden");

    // Dispatch focus on the textarea
    textarea.dispatchEvent(new FocusEvent("focus", { bubbles: true }));
    await waitForRender();

    // Cursor should be visible again
    expect(cursorEl.style.visibility).not.toBe("hidden");
  });
});
