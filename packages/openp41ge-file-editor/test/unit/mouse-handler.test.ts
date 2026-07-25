/**
 * Tests for MouseHandler and related utilities (findWordBounds, selectWordAt).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { PieceTreeTextContentModel } from "@openp41ge-file-editor/model/piece-tree-text-content-model";
import { findWordBounds } from "@openp41ge-file-editor/cursor/cursor-utils";
import { CursorController } from "@openp41ge-file-editor/cursor/cursor-controller";

// ── Helpers ──

function model(text: string) {
  return new PieceTreeTextContentModel("test", text);
}

// ── findWordBounds tests ─────────────────────────────────────────────────

describe("findWordBounds", () => {
  it("selects a word in the middle of a line", () => {
    const m = model("hello world foo");
    // Column 8 is the 'o' in 'world' (1-based: h=1, e=2, l=3, l=4, o=5, ' '=6, w=7, o=8, r=9, l=10, d=11)
    const bounds = findWordBounds(m, 1, 8);
    expect(bounds).toEqual({ start: 7, end: 12 });
  });

  it("selects word at line start", () => {
    const m = model("hello world");
    // Column 1 is 'h'
    const bounds = findWordBounds(m, 1, 1);
    expect(bounds).toEqual({ start: 1, end: 6 });
  });

  it("selects word at line end", () => {
    const m = model("hello world");
    // Column 10 is 'l' in 'world' (h=1, e=2, l=3, l=4, o=5, ' '=6, w=7, o=8, r=9, l=10, d=11)
    const bounds = findWordBounds(m, 1, 10);
    expect(bounds).toEqual({ start: 7, end: 12 });
  });

  it("returns null on empty line", () => {
    const m = model("hello\n\nworld");
    const bounds = findWordBounds(m, 2, 1);
    expect(bounds).toBeNull();
  });

  it("returns null on whitespace-only line", () => {
    const m = model("hello\n   \nworld");
    const bounds = findWordBounds(m, 2, 2);
    expect(bounds).toBeNull();
  });

  it("selects a single separator character", () => {
    const m = model("hello(world)");
    // Column 6 is '('
    const bounds = findWordBounds(m, 1, 6);
    expect(bounds).toEqual({ start: 6, end: 7 });
  });

  it("selects a closing separator", () => {
    const m = model("hello(world)");
    // Column 12 is ')'
    const bounds = findWordBounds(m, 1, 12);
    expect(bounds).toEqual({ start: 12, end: 13 });
  });

  it("selects a period (dot) separator", () => {
    const m = model("foo.bar");
    // Column 4 is '.'
    const bounds = findWordBounds(m, 1, 4);
    expect(bounds).toEqual({ start: 4, end: 5 });
  });

  it("selects last word when clicking trailing whitespace", () => {
    const m = model("hello world   ");
    // Column 15 is whitespace after 'world'
    const bounds = findWordBounds(m, 1, 15);
    expect(bounds).toEqual({ start: 7, end: 12 });
  });

  it("selects last word when clicking past the end of line", () => {
    const m = model("hello world");
    // Column 20 is past the end of line (past 'world')
    const bounds = findWordBounds(m, 1, 20);
    expect(bounds).toEqual({ start: 7, end: 12 });
  });

  it("selects a word adjacent to a separator", () => {
    const m = model("if (true) {");
    // Column 4 is '(' separator - returns just the separator
    const bounds = findWordBounds(m, 1, 4);
    expect(bounds).toEqual({ start: 4, end: 5 });
  });

  it("selects a word adjacent to separator - start of word", () => {
    const m = model("if(true)");
    // Column 4 is 't' in 'true' (col 3 is '(')
    const bounds = findWordBounds(m, 1, 4);
    expect(bounds).toEqual({ start: 4, end: 8 });
  });

  it("handles single-word line", () => {
    const m = model("word");
    const bounds = findWordBounds(m, 1, 2);
    expect(bounds).toEqual({ start: 1, end: 5 });
  });

  it("walks forward from leading whitespace to find next word", () => {
    const m = model("  hello world");
    // Col 2 is leading whitespace — should find 'hello'
    const bounds = findWordBounds(m, 1, 2);
    expect(bounds).toEqual({ start: 3, end: 8 });
  });

  it("walks forward from whitespace between separator and word", () => {
    // Separator list: ( ) . , ; : [ ] { } " ' — not +, -, >, =
    // ';' IS a separator. So ';; hello' has two separators then space then 'hello'
    // Col 3 is space (index 2) — walks forward past separators, finds 'hello'
    const m = model(";; hello");
    const bounds = findWordBounds(m, 1, 3);
    expect(bounds).toEqual({ start: 4, end: 9 });
  });

  it("handles line with only separators", () => {
    const m = model(".,;");
    // Col 2 is ',' — selects just that separator
    const bounds = findWordBounds(m, 1, 2);
    expect(bounds).toEqual({ start: 2, end: 3 });
  });

  it("clamps column 0 to column 1", () => {
    const m = model("hello");
    const bounds = findWordBounds(m, 1, 0);
    expect(bounds).toEqual({ start: 1, end: 6 });
  });

  it("selects separator at start of line", () => {
    const m = model("(foo");
    // Col 1 is '(' — '(' IS a word separator
    const bounds = findWordBounds(m, 1, 1);
    expect(bounds).toEqual({ start: 1, end: 2 });
  });

  it("selects word after separator at line start when on word char", () => {
    const m = model("(foo");
    // Col 2 is 'f' — expand left stops at '(' (separator)
    const bounds = findWordBounds(m, 1, 2);
    expect(bounds).toEqual({ start: 2, end: 5 });
  });

  it("handles line with separator-only content", () => {
    const m = model("([{");
    // Col 2 is '[' — selects just '['
    const bounds = findWordBounds(m, 1, 2);
    expect(bounds).toEqual({ start: 2, end: 3 });
  });

  it("returns null when clicking whitespace-only line at non-start position", () => {
    const m = model("hello\n    \nworld");
    const bounds = findWordBounds(m, 2, 3);
    expect(bounds).toBeNull();
  });

  it("selects only the separator in middle of words", () => {
    // . IS a word separator
    const m = model("a.b");
    // Col 2 is '.'
    const bounds = findWordBounds(m, 1, 2);
    expect(bounds).toEqual({ start: 2, end: 3 });
  });

  it("walks forward past separators from whitespace to find word", () => {
    const m = model("   .foo");
    // Click on col 2 (whitespace) — walks forward, skips '.' separator at col 4, finds 'foo'
    const bounds = findWordBounds(m, 1, 2);
    expect(bounds).toEqual({ start: 5, end: 8 });
  });
});

// ── selectWordAt tests (CursorController) ────────────────────────────────

describe("CursorController.selectWordAt", () => {
  it("selects the word at the given position", () => {
    const m = model("hello world foo");
    const cc = new CursorController(m);

    // Select 'world' (columns 7-12, end is exclusive past the word)
    cc.selectWordAt({ lineNumber: 1, column: 8 });

    const sel = cc.selection;
    expect(sel.selectionStartLineNumber).toBe(1);
    expect(sel.selectionStartColumn).toBe(7);
    expect(sel.positionLineNumber).toBe(1);
    expect(sel.positionColumn).toBe(12); // past 'd' → col 12
  });

  it("selects the first word on the line", () => {
    const m = model("hello world");
    const cc = new CursorController(m);

    cc.selectWordAt({ lineNumber: 1, column: 1 });

    const sel = cc.selection;
    expect(sel.selectionStartColumn).toBe(1);
    expect(sel.positionColumn).toBe(6);
  });

  it("moves cursor to column 1 on empty line", () => {
    const m = model("hello\n\nworld");
    const cc = new CursorController(m);

    cc.selectWordAt({ lineNumber: 2, column: 1 });

    const sel = cc.selection;
    expect(sel.selectionStartLineNumber).toBe(2);
    expect(sel.selectionStartColumn).toBe(1);
    expect(sel.positionLineNumber).toBe(2);
    expect(sel.positionColumn).toBe(1);
  });

  it("fires selection-changed event", () => {
    const m = model("hello world");
    const cc = new CursorController(m);
    const handler = vi.fn();
    cc.onDidChange = handler;

    cc.selectWordAt({ lineNumber: 1, column: 3 });

    expect(handler).toHaveBeenCalledWith({ type: "selection-changed" });
  });
});

// ── MouseHandler tests ───────────────────────────────────────────────────

describe("MouseHandler", () => {
  let MouseHandlerClass: typeof import("@openp41ge-file-editor/input/mouse-handler").MouseHandler;

  beforeEach(async () => {
    vi.resetModules();
    const mod = await import("@openp41ge-file-editor/input/mouse-handler");
    MouseHandlerClass = mod.MouseHandler;
  });

  it("binds dblclick listener on construction", () => {
    const viewport = document.createElement("div");
    const addEventListenerSpy = vi.spyOn(viewport, "addEventListener");
    const m = model("hello world");
    const cc = new CursorController(m);

    const handler = new MouseHandlerClass({
      viewportEl: viewport,
      cursorController: cc,
      lineHeight: 20,
      charWidth: 8,
      wordWrapEnabled: false,
      getCharacterMapping: () => null,
      convertViewToModelPosition: null,
    });

    expect(addEventListenerSpy).toHaveBeenCalledWith("dblclick", expect.any(Function));
    handler.dispose();
  });

  it("unbinds dblclick listener on dispose", () => {
    const viewport = document.createElement("div");
    const removeEventListenerSpy = vi.spyOn(viewport, "removeEventListener");
    const m = model("hello world");
    const cc = new CursorController(m);

    const handler = new MouseHandlerClass({
      viewportEl: viewport,
      cursorController: cc,
      lineHeight: 20,
      charWidth: 8,
      wordWrapEnabled: false,
      getCharacterMapping: () => null,
      convertViewToModelPosition: null,
    });

    handler.dispose();

    expect(removeEventListenerSpy).toHaveBeenCalledWith("dblclick", expect.any(Function));
  });

  it("selects word on double-click over text", async () => {
    const viewport = document.createElement("div");
    const m = model("hello world foo");
    const cc = new CursorController(m);

    document.body.appendChild(viewport);
    viewport.style.width = "500px";
    viewport.style.height = "300px";
    viewport.style.position = "absolute";
    viewport.style.top = "0";
    viewport.style.left = "0";

    const handler = new MouseHandlerClass({
      viewportEl: viewport,
      cursorController: cc,
      lineHeight: 20,
      charWidth: 8,
      wordWrapEnabled: false,
      getCharacterMapping: (viewLine: number) => {
        // Simulate character mapping for "hello world foo"
        if (viewLine === 1) {
          return new Uint32Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
        }
        return null;
      },
      convertViewToModelPosition: null,
    });

    // Simulate dblclick on "world" (col 7-11)
    // 'w' is at col 7. Left offset is 8px. Char width is 8px.
    // To click 'w' (col 7), relativeX = (7-1) * 8 = 48
    const clickX = 8 + 48; // left offset 8 + (col 7 - 1) * 8px
    const clickY = 10; // middle of first line (20px line height / 2)

    viewport.dispatchEvent(
      new MouseEvent("dblclick", {
        bubbles: true,
        clientX: viewport.getBoundingClientRect().left + clickX,
        clientY: viewport.getBoundingClientRect().top + clickY,
      }),
    );

    await new Promise((r) => setTimeout(r, 0));

    // Should have selected "world" (col 7-12)
    const sel = cc.selection;
    expect(sel.selectionStartColumn).toBe(7);
    expect(sel.positionColumn).toBe(12);

    handler.dispose();
    document.body.removeChild(viewport);
  });

  it("moves cursor to column 1 on empty line double-click", async () => {
    const viewport = document.createElement("div");
    const m = model("hello\n\nworld");
    const cc = new CursorController(m);

    document.body.appendChild(viewport);
    viewport.style.width = "500px";
    viewport.style.height = "300px";
    viewport.style.position = "absolute";
    viewport.style.top = "0";
    viewport.style.left = "0";

    const handler = new MouseHandlerClass({
      viewportEl: viewport,
      cursorController: cc,
      lineHeight: 20,
      charWidth: 8,
      wordWrapEnabled: false,
      getCharacterMapping: () => null,
      convertViewToModelPosition: null,
    });

    // Click on line 2 (empty line), Y = 20px (1 line) + 10px (middle)
    const clickX = 8 + 8; // left offset + 1 char width
    const clickY = 20 + 10; // line 2 (1 line gap)

    viewport.dispatchEvent(
      new MouseEvent("dblclick", {
        bubbles: true,
        clientX: viewport.getBoundingClientRect().left + clickX,
        clientY: viewport.getBoundingClientRect().top + clickY,
      }),
    );

    await new Promise((r) => setTimeout(r, 0));

    const sel = cc.selection;
    expect(sel.selectionStartLineNumber).toBe(2);
    expect(sel.selectionStartColumn).toBe(1);
    expect(sel.positionLineNumber).toBe(2);
    expect(sel.positionColumn).toBe(1);

    handler.dispose();
    document.body.removeChild(viewport);
  });

  it("selects last word when double-clicking trailing whitespace", async () => {
    const viewport = document.createElement("div");
    const m = model("hello world   ");
    const cc = new CursorController(m);

    document.body.appendChild(viewport);
    viewport.style.width = "500px";
    viewport.style.height = "300px";
    viewport.style.position = "absolute";
    viewport.style.top = "0";
    viewport.style.left = "0";

    const handler = new MouseHandlerClass({
      viewportEl: viewport,
      cursorController: cc,
      lineHeight: 20,
      charWidth: 8,
      wordWrapEnabled: false,
      getCharacterMapping: (viewLine: number) => {
        if (viewLine === 1) {
          // "hello world   " -- 14 chars
          return new Uint32Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 11, 11]);
        }
        return null;
      },
      convertViewToModelPosition: null,
    });

    // Click on trailing whitespace area (after col 11)
    const clickX = 8 + 12 * 8; // left offset + 12 chars wide
    const clickY = 10;

    viewport.dispatchEvent(
      new MouseEvent("dblclick", {
        bubbles: true,
        clientX: viewport.getBoundingClientRect().left + clickX,
        clientY: viewport.getBoundingClientRect().top + clickY,
      }),
    );

    await new Promise((r) => setTimeout(r, 0));

    // Should select "world" (cols 7-12)
    const sel = cc.selection;
    expect(sel.selectionStartColumn).toBe(7);
    expect(sel.positionColumn).toBe(12);

    handler.dispose();
    document.body.removeChild(viewport);
  });

  it("selects a single separator character on double-click", async () => {
    const viewport = document.createElement("div");
    const m = model("hello(world)");
    const cc = new CursorController(m);

    document.body.appendChild(viewport);
    viewport.style.width = "500px";
    viewport.style.height = "300px";
    viewport.style.position = "absolute";
    viewport.style.top = "0";
    viewport.style.left = "0";

    const handler = new MouseHandlerClass({
      viewportEl: viewport,
      cursorController: cc,
      lineHeight: 20,
      charWidth: 8,
      wordWrapEnabled: false,
      getCharacterMapping: (viewLine: number) => {
        if (viewLine === 1) {
          // "hello(world)" -- 11 chars
          return new Uint32Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
        }
        return null;
      },
      convertViewToModelPosition: null,
    });

    // Click on '(' (col 6 in "hello(world)"), pixel X = left offset + (6-1)*8 = 40
    const clickX = 8 + 40; // left offset + (col 6 - 1) * 8
    const clickY = 10;

    viewport.dispatchEvent(
      new MouseEvent("dblclick", {
        bubbles: true,
        clientX: viewport.getBoundingClientRect().left + clickX,
        clientY: viewport.getBoundingClientRect().top + clickY,
      }),
    );

    await new Promise((r) => setTimeout(r, 0));

    // Should select just '(' (cols 6-7)
    const sel = cc.selection;
    expect(sel.selectionStartColumn).toBe(6);
    expect(sel.positionColumn).toBe(7);

    handler.dispose();
    document.body.removeChild(viewport);
  });

  it("uses convertViewToModelPosition when word wrap is enabled", async () => {
    const viewport = document.createElement("div");
    const m = model("hello world foo");
    const cc = new CursorController(m);
    const convertSpy = vi.fn((vl: number, vc: number) => ({
      lineNumber: vl + 5, // Simulate wrapping: view line 1 → model line 6
      column: vc,
    }));

    document.body.appendChild(viewport);
    viewport.style.width = "500px";
    viewport.style.height = "300px";
    viewport.style.position = "absolute";
    viewport.style.top = "0";
    viewport.style.left = "0";

    const handler = new MouseHandlerClass({
      viewportEl: viewport,
      cursorController: cc,
      lineHeight: 20,
      charWidth: 8,
      wordWrapEnabled: true,
      getCharacterMapping: () => null,
      convertViewToModelPosition: convertSpy,
    });

    const clickX = 8 + 16; // col 3
    const clickY = 10;

    viewport.dispatchEvent(
      new MouseEvent("dblclick", {
        bubbles: true,
        clientX: viewport.getBoundingClientRect().left + clickX,
        clientY: viewport.getBoundingClientRect().top + clickY,
      }),
    );

    await new Promise((r) => setTimeout(r, 0));

    expect(convertSpy).toHaveBeenCalled();

    handler.dispose();
    document.body.removeChild(viewport);
  });

  it("handles single-character line", async () => {
    const viewport = document.createElement("div");
    const m = model("a");
    const cc = new CursorController(m);

    document.body.appendChild(viewport);
    viewport.style.width = "500px";
    viewport.style.height = "300px";
    viewport.style.position = "absolute";
    viewport.style.top = "0";
    viewport.style.left = "0";

    const handler = new MouseHandlerClass({
      viewportEl: viewport,
      cursorController: cc,
      lineHeight: 20,
      charWidth: 8,
      wordWrapEnabled: false,
      getCharacterMapping: (viewLine: number) => {
        if (viewLine === 1) return new Uint32Array([0]);
        return null;
      },
      convertViewToModelPosition: null,
    });

    // Click on the single char
    const clickX = 8 + 0; // left offset + col 1 - 1
    const clickY = 10;

    viewport.dispatchEvent(
      new MouseEvent("dblclick", {
        bubbles: true,
        clientX: viewport.getBoundingClientRect().left + clickX,
        clientY: viewport.getBoundingClientRect().top + clickY,
      }),
    );

    await new Promise((r) => setTimeout(r, 0));

    // Should select "a" (cols 1-2)
    const sel = cc.selection;
    expect(sel.selectionStartColumn).toBe(1);
    expect(sel.positionColumn).toBe(2);

    handler.dispose();
    document.body.removeChild(viewport);
  });

  it("setCharWidth updates internal char width", () => {
    const viewport = document.createElement("div");
    const m = model("hello");
    const cc = new CursorController(m);

    const handler = new MouseHandlerClass({
      viewportEl: viewport,
      cursorController: cc,
      lineHeight: 20,
      charWidth: 8,
      wordWrapEnabled: false,
      getCharacterMapping: () => null,
      convertViewToModelPosition: null,
    });

    handler.setCharWidth(12);
    handler.setLineHeight(24);
    handler.dispose();
  });

  it("double-click after dispose is a no-op", async () => {
    const viewport = document.createElement("div");
    const m = model("hello world");
    const cc = new CursorController(m);

    document.body.appendChild(viewport);
    viewport.style.width = "500px";
    viewport.style.height = "300px";
    viewport.style.position = "absolute";
    viewport.style.top = "0";
    viewport.style.left = "0";

    const handler = new MouseHandlerClass({
      viewportEl: viewport,
      cursorController: cc,
      lineHeight: 20,
      charWidth: 8,
      wordWrapEnabled: false,
      getCharacterMapping: () => null,
      convertViewToModelPosition: null,
    });

    const cursorSpy = vi.spyOn(cc, "selectWordAt");

    handler.dispose();

    const clickX = 8 + 16;
    const clickY = 10;

    viewport.dispatchEvent(
      new MouseEvent("dblclick", {
        bubbles: true,
        clientX: viewport.getBoundingClientRect().left + clickX,
        clientY: viewport.getBoundingClientRect().top + clickY,
      }),
    );

    await new Promise((r) => setTimeout(r, 0));

    expect(cursorSpy).not.toHaveBeenCalled();

    document.body.removeChild(viewport);
  });
});
