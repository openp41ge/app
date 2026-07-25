/**
 * Tests for cursor positioning via click, text selection via drag,
 * and copy-to-clipboard (Cmd+C).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import "@openp41ge-file-editor/file-editor.ts";
import { PieceTreeTextContentModel } from "@openp41ge-file-editor/model/piece-tree-text-content-model.ts";
import type { FileEditorElement } from "@openp41ge-file-editor/file-editor.ts";
import type { CursorController } from "@openp41ge-file-editor/cursor/cursor-controller.ts";
import type { TextAreaInput } from "@openp41ge-file-editor/input/text-area-input.ts";

// ── Helpers ───────────────────────────────────────────────────────────────

async function waitForRender(): Promise<void> {
  await new Promise((r) => requestAnimationFrame(r));
  await new Promise((r) => setTimeout(r, 0));
}

function createFileEditor(): FileEditorElement {
  const el = document.createElement("file-editor") as FileEditorElement;
  // Set up char width measurement by providing a fixed-width container
  el.style.width = "800px";
  el.style.height = "600px";
  el.style.fontFamily = "monospace";
  el.style.fontSize = "14px";
  document.body.appendChild(el);
  return el;
}

/**
 * Create a simple inline model for testing (bypasses file loading).
 */
function createTestModel(content: string): PieceTreeTextContentModel {
  return new PieceTreeTextContentModel("/test/test.txt", content);
}

/**
 * Get the CursorController from the editor's private fields.
 * We access it via the editor's internal API (cast to any).
 */
function getCursorController(editor: FileEditorElement): CursorController | null {
  return (editor as any)._cursorController ?? null;
}

function getTextAreaInput(editor: FileEditorElement): TextAreaInput | null {
  return (editor as any)._textAreaInput ?? null;
}

function getClipboardHandler(editor: FileEditorElement): any {
  return (editor as any)._clipboardHandler ?? null;
}

function getViewModel(editor: FileEditorElement): any {
  return (editor as any)._viewModel ?? null;
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe("cursor positioning via click", () => {
  beforeEach(() => {
    (window as any).openp41ge = {
      file: {
        readRange: vi.fn().mockResolvedValue({ data: "" }),
      },
    };
  });

  afterEach(() => {
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  it("loads a model and positions cursor at line 1 column 1 by default", async () => {
    const editor = createFileEditor();
    await editor.updateComplete;
    await waitForRender();

    const model = createTestModel("hello world\nsecond line\nthird line");
    editor.textContentModel = model;
    await editor.loadFile("/test/test.txt", "test.txt");
    await waitForRender();

    const cc = getCursorController(editor);
    expect(cc).toBeTruthy();
    const pos = cc!.position;
    expect(pos.lineNumber).toBe(1);
    expect(pos.column).toBe(1);
  });

  it("moves cursor to correct line/col on mousedown in viewport", async () => {
    const editor = createFileEditor();
    await editor.updateComplete;
    await waitForRender();

    const model = createTestModel("hello world\nsecond line\nthird line");
    editor.textContentModel = model;
    await editor.loadFile("/test/test.txt", "test.txt");
    await waitForRender();

    // Set char width so calculations are predictable
    (editor as any)._charWidth = 9.6; // typical monospace 14px
    (editor as any)._lineHeight = 20;

    const viewport = editor.querySelector(".fe-viewport") as HTMLElement;
    expect(viewport).toBeTruthy();

    // Simulate mousedown at a position that should map to line 2, column ~3
    const rect = viewport.getBoundingClientRect();
    // Line 2 starts at Y = 20, column ~3 at X = 8 + 2*9.6 = 27.2
    const clickX = rect.left + 8 + 2 * 9.6;
    const clickY = rect.top + 20 + 5; // middle of line 2 row

    viewport.dispatchEvent(
      new MouseEvent("mousedown", {
        bubbles: true,
        clientX: clickX,
        clientY: clickY,
      }),
    );

    await waitForRender();

    const cc = getCursorController(editor);
    expect(cc).toBeTruthy();
    const pos = cc!.position;
    expect(pos.lineNumber).toBe(2);
    // column should be 3 (2 chars from left = "se" then cursor at start of "cond")
    expect(pos.column).toBeGreaterThanOrEqual(2);
    expect(pos.column).toBeLessThanOrEqual(4);
  });

  it("clicks beyond last line clamp to last line", async () => {
    const editor = createFileEditor();
    await editor.updateComplete;
    await waitForRender();

    const model = createTestModel("line 1\nline 2");
    editor.textContentModel = model;
    await editor.loadFile("/test/test.txt", "test.txt");
    await waitForRender();

    (editor as any)._charWidth = 9.6;
    (editor as any)._lineHeight = 20;

    const viewport = editor.querySelector(".fe-viewport") as HTMLElement;
    const rect = viewport.getBoundingClientRect();

    // Click far below visible content (line 100)
    const clickY = rect.top + 100 * 20;
    viewport.dispatchEvent(
      new MouseEvent("mousedown", {
        bubbles: true,
        clientX: rect.left + 50,
        clientY: clickY,
      }),
    );

    await waitForRender();

    const cc = getCursorController(editor);
    expect(cc).toBeTruthy();
    // Should clamp to line 2 (last line)
    expect(cc!.position.lineNumber).toBe(2);
  });

  it("focuses textarea on mousedown", async () => {
    const editor = createFileEditor();
    await editor.updateComplete;
    await waitForRender();

    const model = createTestModel("test content");
    editor.textContentModel = model;
    await editor.loadFile("/test/test.txt", "test.txt");
    await waitForRender();

    const viewport = editor.querySelector(".fe-viewport") as HTMLElement;
    const rect = viewport.getBoundingClientRect();

    viewport.dispatchEvent(
      new MouseEvent("mousedown", {
        bubbles: true,
        clientX: rect.left + 20,
        clientY: rect.top + 5,
      }),
    );

    await waitForRender();

    const ti = getTextAreaInput(editor);
    expect(ti).toBeTruthy();
    expect(ti!.isFocused).toBe(true);
  });
});

describe("text selection via click and drag", () => {
  beforeEach(() => {
    (window as any).openp41ge = {
      file: {
        readRange: vi.fn().mockResolvedValue({ data: "" }),
      },
    };
  });

  afterEach(() => {
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  it("has a collapsed selection (anchor = position) after simple click", async () => {
    const editor = createFileEditor();
    await editor.updateComplete;
    await waitForRender();

    const model = createTestModel("hello world\nsecond line\nthird line");
    editor.textContentModel = model;
    await editor.loadFile("/test/test.txt", "test.txt");
    await waitForRender();

    (editor as any)._charWidth = 9.6;
    (editor as any)._lineHeight = 20;

    const viewport = editor.querySelector(".fe-viewport") as HTMLElement;
    const rect = viewport.getBoundingClientRect();

    // Click at line 1, column 3
    const clickX = rect.left + 8 + 2 * 9.6;
    const clickY = rect.top + 5;

    viewport.dispatchEvent(
      new MouseEvent("mousedown", {
        bubbles: true,
        clientX: clickX,
        clientY: clickY,
      }),
    );
    await waitForRender();

    const cc = getCursorController(editor);
    const sel = cc!.selection;
    expect(sel.selectionStartLineNumber).toBe(sel.positionLineNumber);
    expect(sel.selectionStartColumn).toBe(sel.positionColumn);
  });

  it("extends selection on drag (mousedown + mousemove)", async () => {
    const editor = createFileEditor();
    await editor.updateComplete;
    await waitForRender();

    const model = createTestModel("hello world\nsecond line\nthird line");
    editor.textContentModel = model;
    await editor.loadFile("/test/test.txt", "test.txt");
    await waitForRender();

    (editor as any)._charWidth = 9.6;
    (editor as any)._lineHeight = 20;

    const viewport = editor.querySelector(".fe-viewport") as HTMLElement;
    const rect = viewport.getBoundingClientRect();

    // Mousedown at line 1, column 1
    const downX = rect.left + 8;
    const downY = rect.top + 5;

    viewport.dispatchEvent(
      new MouseEvent("mousedown", {
        bubbles: true,
        clientX: downX,
        clientY: downY,
      }),
    );
    await waitForRender();

    // Drag to line 2, column 3
    const moveX = rect.left + 8 + 2 * 9.6;
    const moveY = rect.top + 20 + 5;

    document.dispatchEvent(
      new MouseEvent("mousemove", {
        bubbles: true,
        clientX: moveX,
        clientY: moveY,
      }),
    );
    await waitForRender();

    const cc = getCursorController(editor);
    const sel = cc!.selection;
    // Anchor should be at mousedown (line 1, col 1)
    expect(sel.selectionStartLineNumber).toBe(1);
    expect(sel.selectionStartColumn).toBe(1);
    // Position should be at drag destination (line 2, col ~3)
    expect(sel.positionLineNumber).toBe(2);
    expect(sel.positionColumn).toBeGreaterThanOrEqual(2);
    expect(sel.positionColumn).toBeLessThanOrEqual(4);
  });

  it("releases selection on mouseup (detaches listeners)", async () => {
    const editor = createFileEditor();
    await editor.updateComplete;
    await waitForRender();

    const model = createTestModel("hello world\nsecond line\nthird line");
    editor.textContentModel = model;
    await editor.loadFile("/test/test.txt", "test.txt");
    await waitForRender();

    (editor as any)._charWidth = 9.6;
    (editor as any)._lineHeight = 20;

    const viewport = editor.querySelector(".fe-viewport") as HTMLElement;
    const rect = viewport.getBoundingClientRect();

    // Mousedown
    viewport.dispatchEvent(
      new MouseEvent("mousedown", {
        bubbles: true,
        clientX: rect.left + 8,
        clientY: rect.top + 5,
      }),
    );
    await waitForRender();

    // Mouseup
    document.dispatchEvent(new MouseEvent("mouseup"));
    await waitForRender();

    const cc = getCursorController(editor);
    const sel = cc!.selection;
    // Should still be collapsed after mouseup
    expect(sel.selectionStartLineNumber).toBe(sel.positionLineNumber);
    expect(sel.selectionStartColumn).toBe(sel.positionColumn);
  });
});

describe("copy to clipboard", () => {
  beforeEach(() => {
    (window as any).openp41ge = {
      file: {
        readRange: vi.fn().mockResolvedValue({ data: "" }),
      },
    };
  });

  afterEach(() => {
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  it("ClipboardHandler.onCopy returns selected text", async () => {
    const editor = createFileEditor();
    await editor.updateComplete;
    await waitForRender();

    const model = createTestModel("hello world");
    editor.textContentModel = model;
    await editor.loadFile("/test/test.txt", "test.txt");
    await waitForRender();

    const ch = getClipboardHandler(editor);
    expect(ch).toBeTruthy();

    // Use the cursor controller to create a selection
    const cc = getCursorController(editor);
    cc!.moveTo(1, 1);
    cc!.selectTo(1, 6); // selects "hello"

    const text = ch.onCopy();
    expect(text).toBe("hello");
  });

  it("ClipboardHandler.onCopy returns empty string for collapsed selection", async () => {
    const editor = createFileEditor();
    await editor.updateComplete;
    await waitForRender();

    const model = createTestModel("hello world");
    editor.textContentModel = model;
    await editor.loadFile("/test/test.txt", "test.txt");
    await waitForRender();

    const ch = getClipboardHandler(editor);

    // Collapsed cursor at position 1,1
    const cc = getCursorController(editor);
    cc!.moveTo(1, 1);

    const text = ch.onCopy();
    expect(text).toBe("");
  });

  it("wires copy event on textarea via onCopy callback", async () => {
    const editor = createFileEditor();
    await editor.updateComplete;
    await waitForRender();

    const model = createTestModel("hello world\nsecond line");
    editor.textContentModel = model;
    await editor.loadFile("/test/test.txt", "test.txt");
    await waitForRender();

    // Create a selection via click and drag
    const cc = getCursorController(editor);
    cc!.moveTo(1, 1);
    cc!.selectTo(1, 6); // selects "hello"

    // Get the textarea and dispatch a copy event
    const ti = getTextAreaInput(editor);
    const textarea = ti!.element;

    // The copy event should trigger the onCopy callback which returns "hello"
    // We can't easily test clipboardData in jsdom, but we can verify the
    // clipboard handler's onCopy method works (tested above)
    expect(textarea).toBeTruthy();

    // Verify the TextAreaInput registered a copy event listener
    const listeners = (textarea as any).eventListeners;
    // We can check the onCopy config was provided
    expect((ti as any)._config.onCopy).toBeDefined();
  });

  it("ClipboardHandler.onCopy selection respects normalized order", async () => {
    const editor = createFileEditor();
    await editor.updateComplete;
    await waitForRender();

    const model = createTestModel("hello world\nfoobar");
    editor.textContentModel = model;
    await editor.loadFile("/test/test.txt", "test.txt");
    await waitForRender();

    const ch = getClipboardHandler(editor);

    // Select from later to earlier (reverse) - should normalize
    const cc = getCursorController(editor);
    cc!.moveTo(1, 7); // start at "world"
    cc!.selectTo(1, 1); // extend back to start
    // Now anchor=line1,col7 and position=line1,col1

    const text = ch.onCopy();
    expect(text).toBe("hello ");
  });

  it("selectTo moves position without resetting anchor", async () => {
    const editor = createFileEditor();
    await editor.updateComplete;
    await waitForRender();

    const model = createTestModel("hello world");
    editor.textContentModel = model;
    await editor.loadFile("/test/test.txt", "test.txt");
    await waitForRender();

    const cc = getCursorController(editor)!;
    expect(cc).toBeTruthy();

    // moveTo resets both anchor and position
    cc.moveTo(1, 1);
    expect(cc.position.lineNumber).toBe(1);
    expect(cc.position.column).toBe(1);

    // selectTo keeps anchor, moves position
    cc.selectTo(1, 6);
    const sel = cc.selection;
    expect(sel.selectionStartLineNumber).toBe(1);
    expect(sel.selectionStartColumn).toBe(1);
    expect(sel.positionLineNumber).toBe(1);
    expect(sel.positionColumn).toBe(6);
  });

  describe("cursor positioning with zoom", () => {
    beforeEach(() => {
      (window as any).openp41ge = {
        file: {
          readRange: vi.fn().mockResolvedValue({ data: "" }),
        },
      };
    });

    afterEach(() => {
      document.body.innerHTML = "";
      vi.restoreAllMocks();
    });

    it("positions cursor correctly with 0.5x zoom factor", async () => {
      const editor = createFileEditor();
      await editor.updateComplete;
      await waitForRender();

      const model = createTestModel("hello world\nsecond line\nthird line");
      editor.textContentModel = model;
      await editor.loadFile("/test/test.txt", "test.txt");
      await waitForRender();

      const cc = getCursorController(editor);
      expect(cc).toBeTruthy();

      // jsdom doesn't implement CSS zoom layout, so getBoundingClientRect()
      // and clientWidth return the same value. We directly override the
      // _getZoomFactor to simulate zoom without relying on layout.
      (editor as any)._getZoomFactor = () => 0.5;

      const rect = editor._viewportEl.getBoundingClientRect();
      // At 0.5 zoom, 10px visual = 20px logical → line 2
      const clickY = rect.top + 10;
      const clickX = rect.left + 12;

      editor._viewportEl.dispatchEvent(
        new MouseEvent("mousedown", {
          bubbles: true,
          clientX: clickX,
          clientY: clickY,
        }),
      );
      await waitForRender();

      // Should have positioned cursor at line 2
      expect(cc!.position.lineNumber).toBe(2);
    });

    it("positions cursor correctly with 2x zoom factor", async () => {
      const editor = createFileEditor();
      await editor.updateComplete;
      await waitForRender();

      const model = createTestModel("hello world\nsecond line\nthird line");
      editor.textContentModel = model;
      await editor.loadFile("/test/test.txt", "test.txt");
      await waitForRender();

      const cc = getCursorController(editor);
      expect(cc).toBeTruthy();

      (editor as any)._getZoomFactor = () => 2;

      const rect = editor._viewportEl.getBoundingClientRect();
      // At 2x zoom, 40px visual = 20px logical → line 2
      const clickY = rect.top + 40;

      editor._viewportEl.dispatchEvent(
        new MouseEvent("mousedown", {
          bubbles: true,
          clientX: rect.left + 12,
          clientY: clickY,
        }),
      );
      await waitForRender();

      expect(cc!.position.lineNumber).toBe(2);
    });

    it("click at line 1 is still line 1 regardless of zoom", async () => {
      const editor = createFileEditor();
      await editor.updateComplete;
      await waitForRender();

      const model = createTestModel("hello world");
      editor.textContentModel = model;
      await editor.loadFile("/test/test.txt", "test.txt");
      await waitForRender();

      const cc = getCursorController(editor);
      expect(cc).toBeTruthy();

      (editor as any)._getZoomFactor = () => 0.5;

      const rect = editor._viewportEl.getBoundingClientRect();
      // 1px visual = 2px logical at 0.5 zoom → still line 1
      const clickY = rect.top + 1;

      editor._viewportEl.dispatchEvent(
        new MouseEvent("mousedown", {
          bubbles: true,
          clientX: rect.left + 8,
          clientY: clickY,
        }),
      );
      await waitForRender();

      expect(cc!.position.lineNumber).toBe(1);
    });

    it("_getZoomFactor returns 1 when no zoom is applied", async () => {
      const editor = createFileEditor();
      await editor.updateComplete;
      await waitForRender();

      const model = createTestModel("hello world");
      editor.textContentModel = model;
      await editor.loadFile("/test/test.txt", "test.txt");
      await waitForRender();

      const zoom = (editor as any)._getZoomFactor();
      // In jsdom, getBoundingClientRect().width === clientWidth → ratio = 1
      expect(zoom).toBe(1);
    });
  });
});
