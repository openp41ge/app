/**
 * Unit tests for CursorController deleteLeft / deleteRight cross-line behaviour.
 */
import { describe, test, expect } from "vitest";
import { PieceTreeTextContentModel } from "@openp41ge-file-editor/model/piece-tree-text-content-model";
import { CursorController } from "@openp41ge-file-editor/cursor/cursor-controller";

function createModel(text: string): PieceTreeTextContentModel {
  return new PieceTreeTextContentModel("test.ts", text, {
    fileReader: {
      readRange: async () => ({ data: "", totalSize: 0 }),
      writeFile: async () => ({ success: true }),
    },
  });
}

describe("CursorController deleteLeft", () => {
  test("backspace at column 1 joins line with previous line", () => {
    const model = createModel("hello\nworld");
    const cc = new CursorController(model);

    // Place cursor at start of line 2
    cc.moveTo(2, 1);
    expect(cc.position).toEqual({ lineNumber: 2, column: 1 });

    cc.deleteLeft();

    // Line 1 should now be "helloworld", cursor at end of former line 1
    expect(model.lineCount).toBe(1);
    expect(model.getLineContent(1)).toBe("helloworld");
    expect(cc.position).toEqual({ lineNumber: 1, column: 6 });
  });

  test("backspace at column 1 on first line does nothing", () => {
    const model = createModel("hello\nworld");
    const cc = new CursorController(model);

    cc.moveTo(1, 1);
    cc.deleteLeft();

    expect(model.lineCount).toBe(2);
    expect(model.getLineContent(1)).toBe("hello");
    expect(cc.position).toEqual({ lineNumber: 1, column: 1 });
  });

  test("backspace in middle of line deletes single character", () => {
    const model = createModel("hello\nworld");
    const cc = new CursorController(model);

    cc.moveTo(1, 3); // cursor at position "he|llo"
    cc.deleteLeft();

    expect(model.getLineContent(1)).toBe("hllo");
    expect(cc.position).toEqual({ lineNumber: 1, column: 2 });
  });

  test("backspace at column 1 joins multi-line", () => {
    const model = createModel("line one\nline two\nline three");
    const cc = new CursorController(model);

    // Delete newline between line 2 and line 3
    cc.moveTo(3, 1);
    cc.deleteLeft();

    expect(model.lineCount).toBe(2);
    expect(model.getLineContent(2)).toBe("line twoline three");
    expect(cc.position).toEqual({ lineNumber: 2, column: 9 });
  });
});

describe("CursorController deleteRight", () => {
  test("delete at end of line joins with next line", () => {
    const model = createModel("hello\nworld\nend");
    const cc = new CursorController(model);

    // Move cursor past end of line 1 (at the newline position)
    cc.moveTo(1, 6);
    cc.deleteRight();

    expect(model.lineCount).toBe(2);
    expect(model.getLineContent(1)).toBe("helloworld");
    expect(cc.position).toEqual({ lineNumber: 1, column: 6 });
  });
});
