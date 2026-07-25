/**
 * Tests for <file-editor> component — rendering, lifecycle, and
 * ensuring no unwanted overlays appear during file loading.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import "@openp41ge-file-editor/file-editor.ts";
import { PieceTreeTextContentModel } from "@openp41ge-file-editor/model/piece-tree-text-content-model.ts";
import type { FileEditorElement } from "@openp41ge-file-editor/file-editor.ts";

// ── Helpers ───────────────────────────────────────────────────────────────

/**
 * Wait for Lit to render and for the firstUpdated lifecycle to complete.
 */
async function waitForRender(): Promise<void> {
  await new Promise((r) => requestAnimationFrame(r));
  await new Promise((r) => setTimeout(r, 0));
}

/**
 * Create and attach a <file-editor> to the test DOM, returning the element.
 */
function createFileEditor(): FileEditorElement {
  const el = document.createElement("file-editor") as FileEditorElement;
  document.body.appendChild(el);
  return el;
}

/**
 * Check whether any element in the DOM has fixed/full-screen overlay styling
 * that would block interaction (like the <openp41ge-confirm-modal> did).
 */
function hasUnwantedOverlay(): boolean {
  const all = document.querySelectorAll("*");
  for (const el of all) {
    const htmlEl = el as HTMLElement;
    const style = getComputedStyle(htmlEl);
    if (style.position === "fixed" && style.inset === "0px" && style.zIndex === "99999") {
      return true;
    }
  }
  return false;
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe("file-editor component", () => {
  beforeEach(() => {
    // Stub the Electron preload API so _readFile doesn't fail
    (window as any).openp41ge = {
      file: {
        readRange: vi.fn().mockResolvedValue({ data: "hello world\nline 2\nline 3" }),
      },
    };
  });

  afterEach(() => {
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  it("renders without any full-screen overlay elements", async () => {
    const editor = createFileEditor();
    await editor.updateComplete;
    await waitForRender();

    const slottedModals = editor.querySelectorAll("openp41ge-confirm-modal");
    expect(slottedModals.length).toBe(0);

    expect(hasUnwantedOverlay()).toBe(false);
  });

  it("renders the shell template on creation", async () => {
    const editor = createFileEditor();
    await editor.updateComplete;
    await waitForRender();

    // Core structural elements should exist
    expect(editor.querySelector(".fe-root")).toBeTruthy();
    expect(editor.querySelector(".fe-content")).toBeTruthy();
    expect(editor.querySelector(".fe-gutter")).toBeTruthy();
    expect(editor.querySelector("fe-status-bar")).toBeTruthy();
  });

  it("creates viewport on first updated", async () => {
    const editor = createFileEditor();
    await editor.updateComplete;
    await waitForRender();

    const viewport = editor.querySelector(".fe-viewport");
    expect(viewport).toBeTruthy();
    expect(viewport).toBeInstanceOf(HTMLElement);
  });

  it("loadFile initializes with pre-set model", async () => {
    const editor = createFileEditor();
    await editor.updateComplete;
    await waitForRender();

    const model = new PieceTreeTextContentModel("/test/file.txt", "hello world\nline 2\nline 3");
    editor.textContentModel = model;
    await editor.loadFile("/test/file.txt", "file.txt");

    expect(editor.textContentModel).toBe(model);
    expect(editor.filePath).toBe("/test/file.txt");
  });

  it("loadFile with externally injected model", async () => {
    const editor = createFileEditor();
    await editor.updateComplete;
    await waitForRender();

    const model = new PieceTreeTextContentModel("/test/test.txt", "test content\nsecond line");
    editor.textContentModel = model;

    await editor.loadFile("/test/test.txt", "test.txt");

    expect(editor.textContentModel).toBe(model);
  });

  it("still has no overlay after loading a file", async () => {
    const editor = createFileEditor();
    await editor.updateComplete;
    await waitForRender();

    const model = new PieceTreeTextContentModel("/test/file.txt", "hello world\nline 2\nline 3");
    editor.textContentModel = model;
    await editor.loadFile("/test/file.txt", "file.txt");
    await waitForRender();

    const slottedModals = editor.querySelectorAll("openp41ge-confirm-modal");
    expect(slottedModals.length).toBe(0);
    expect(hasUnwantedOverlay()).toBe(false);
  });

  it("normal click removes secondary cursors", async () => {
    const editor = createFileEditor();
    await editor.updateComplete;
    await waitForRender();

    const model = new PieceTreeTextContentModel(
      "/test/file.txt",
      "line one\nline two\nline three\n",
    );
    editor.textContentModel = model;
    await editor.loadFile("/test/file.txt", "file.txt");
    await waitForRender();

    const cc = editor.cursorController!;
    // Add a secondary cursor via API
    cc.addCursor({ lineNumber: 2, column: 5 });
    expect(cc.hasMultipleCursors).toBe(true);
    expect(cc.cursorCount).toBe(2);

    // Dispatch a normal mousedown (no altKey) on the viewport
    const viewport = editor.querySelector(".fe-viewport")!;

    viewport.dispatchEvent(
      new MouseEvent("mousedown", {
        bubbles: true,
        clientX: 8,
        clientY: 40,
        altKey: false,
      }),
    );
    await waitForRender();

    // Secondary cursors should be gone
    expect(cc.hasMultipleCursors).toBe(false);
    expect(cc.cursorCount).toBe(1);
  });

  it("mousedown inside editor does not bubble past .fe-root", async () => {
    const editor = createFileEditor();
    await editor.updateComplete;
    await waitForRender();

    const root = editor.querySelector(".fe-root")!;
    const viewport = editor.querySelector(".fe-viewport")!;

    // Track if event reaches the editor's parentNode (simulates tab-content-wrapper)
    let reachedParent = false;
    const handler = () => {
      reachedParent = true;
    };
    if (editor.parentNode) {
      editor.parentNode.addEventListener("mousedown", handler);
    }

    // Dispatch mousedown on the viewport (it bubbles up inside the editor)
    viewport.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));

    // The event should NOT have reached outside .fe-root
    expect(reachedParent).toBe(false);

    if (editor.parentNode) {
      editor.parentNode.removeEventListener("mousedown", handler);
    }
  });
});
