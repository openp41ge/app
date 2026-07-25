/**
 * Tests for the piece tree data structure.
 */
import { describe, it, expect } from "vitest";
import { PieceTreeTextContentModel } from "@openp41ge-file-editor/model/piece-tree-text-content-model";

function createModel(text: string): PieceTreeTextContentModel {
  return new PieceTreeTextContentModel("test://file.ts", text);
}

describe("PieceTreeTextContentModel", () => {
  describe("initial state", () => {
    it("creates empty model", () => {
      const m = createModel("");
      expect(m.lineCount).toBe(1);
      expect(m.getLineContent(1)).toBe("");
      expect(m.length).toBe(0);
    });

    it("creates single-line model", () => {
      const m = createModel("hello");
      expect(m.lineCount).toBe(1);
      expect(m.getLineContent(1)).toBe("hello");
      expect(m.length).toBe(5);
    });

    it("creates multi-line model", () => {
      const m = createModel("line1\nline2\nline3");
      expect(m.lineCount).toBe(3);
      expect(m.getLineContent(1)).toBe("line1");
      expect(m.getLineContent(2)).toBe("line2");
      expect(m.getLineContent(3)).toBe("line3");
    });
  });

  describe("getLineContent", () => {
    it("returns empty string for empty buffer", () => {
      const m = createModel("");
      expect(m.getLineContent(1)).toBe("");
    });

    it("returns content for each line", () => {
      const m = createModel("a\nb\nc");
      expect(m.getLineContent(1)).toBe("a");
      expect(m.getLineContent(2)).toBe("b");
      expect(m.getLineContent(3)).toBe("c");
    });

    it("handles trailing newline (last line is empty)", () => {
      const m = createModel("a\nb\n");
      expect(m.lineCount).toBe(3);
      expect(m.getLineContent(1)).toBe("a");
      expect(m.getLineContent(2)).toBe("b");
      expect(m.getLineContent(3)).toBe("");
    });

    it("returns empty string for out-of-range line", () => {
      const m = createModel("hello");
      expect(m.getLineContent(0)).toBe("");
      expect(m.getLineContent(2)).toBe("");
    });
  });

  describe("getValueInRange", () => {
    it("returns single character", () => {
      const m = createModel("hello");
      const v = m.getValueInRange({
        startLineNumber: 1,
        startColumn: 2,
        endLineNumber: 1,
        endColumn: 3,
      });
      expect(v).toBe("e");
    });

    it("returns across lines", () => {
      const m = createModel("ab\ncd");
      const v = m.getValueInRange({
        startLineNumber: 1,
        startColumn: 2,
        endLineNumber: 2,
        endColumn: 2,
      });
      expect(v).toBe("b\nc");
    });

    it("returns entire content", () => {
      const m = createModel("hello\nworld");
      const v = m.getValueInRange({
        startLineNumber: 1,
        startColumn: 1,
        endLineNumber: 2,
        endColumn: 6,
      });
      expect(v).toBe("hello\nworld");
    });
  });

  describe("getOffsetAt / getPositionAt", () => {
    it("getPositionAt returns correct positions", () => {
      const m = createModel("hello");
      expect(m.getPositionAt(0)).toEqual({ lineNumber: 1, column: 1 });
      expect(m.getPositionAt(2)).toEqual({ lineNumber: 1, column: 3 });
      expect(m.getPositionAt(5)).toEqual({ lineNumber: 1, column: 6 });
    });

    it("getOffsetAt returns correct offsets", () => {
      const m = createModel("hello");
      expect(m.getOffsetAt({ lineNumber: 1, column: 1 })).toBe(0);
      expect(m.getOffsetAt({ lineNumber: 1, column: 3 })).toBe(2);
      expect(m.getOffsetAt({ lineNumber: 1, column: 6 })).toBe(5);
    });

    it("getPositionAt for multi-line", () => {
      const m = createModel("ab\ncd");
      expect(m.getPositionAt(0)).toEqual({ lineNumber: 1, column: 1 });
      expect(m.getPositionAt(2)).toEqual({ lineNumber: 1, column: 3 });
      expect(m.getPositionAt(3)).toEqual({ lineNumber: 2, column: 1 });
      expect(m.getPositionAt(5)).toEqual({ lineNumber: 2, column: 3 });
    });
  });

  describe("pushEditOperations — insert", () => {
    it("inserts text at position", () => {
      const m = createModel("ab");
      m.pushEditOperations([
        {
          range: { startLineNumber: 1, startColumn: 2, endLineNumber: 1, endColumn: 2 },
          text: "XY",
        },
      ]);
      expect(m.getLineContent(1)).toBe("aXYb");
    });

    it("inserts newline", () => {
      const m = createModel("ab");
      m.pushEditOperations([
        {
          range: { startLineNumber: 1, startColumn: 2, endLineNumber: 1, endColumn: 2 },
          text: "\n",
        },
      ]);
      expect(m.lineCount).toBe(2);
      expect(m.getLineContent(1)).toBe("a");
      expect(m.getLineContent(2)).toBe("b");
    });
  });

  describe("pushEditOperations — delete", () => {
    it("deletes single character", () => {
      const m = createModel("hello");
      m.pushEditOperations([
        { range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 2 }, text: "" },
      ]);
      expect(m.getLineContent(1)).toBe("ello");
    });

    it("deletes across lines", () => {
      const m = createModel("ab\ncd");
      m.pushEditOperations([
        { range: { startLineNumber: 1, startColumn: 3, endLineNumber: 2, endColumn: 1 }, text: "" },
      ]);
      expect(m.lineCount).toBe(1);
      expect(m.getLineContent(1)).toBe("abcd");
    });
  });

  describe("pushEditOperations — replace", () => {
    it("replaces text", () => {
      const m = createModel("hello world");
      m.pushEditOperations([
        {
          range: { startLineNumber: 1, startColumn: 7, endLineNumber: 1, endColumn: 12 },
          text: "there",
        },
      ]);
      expect(m.getLineContent(1)).toBe("hello there");
    });

    it("replaces multiple lines", () => {
      const m = createModel("a\nb\nc");
      m.pushEditOperations([
        {
          range: { startLineNumber: 1, startColumn: 1, endLineNumber: 3, endColumn: 2 },
          text: "x\ny",
        },
      ]);
      expect(m.getLineContent(1)).toBe("x");
      expect(m.getLineContent(2)).toBe("y");
      expect(m.lineCount).toBe(2);
    });
  });

  describe("undo / redo", () => {
    it("undoes insert", () => {
      const m = createModel("ab");
      m.pushEditOperations([
        {
          range: { startLineNumber: 1, startColumn: 2, endLineNumber: 1, endColumn: 2 },
          text: "XY",
        },
      ]);
      expect(m.getLineContent(1)).toBe("aXYb");
      const sel = m.undo();
      expect(m.getLineContent(1)).toBe("ab");
    });

    it("redoes insert after undo", () => {
      const m = createModel("ab");
      m.pushEditOperations([
        {
          range: { startLineNumber: 1, startColumn: 2, endLineNumber: 1, endColumn: 2 },
          text: "XY",
        },
      ]);
      m.undo();
      const sel = m.redo();
      expect(m.getLineContent(1)).toBe("aXYb");
    });

    it("canUndo/canRedo are correct", () => {
      const m = createModel("ab");
      expect(m.canUndo()).toBe(false);
      expect(m.canRedo()).toBe(false);
      m.pushEditOperations([
        {
          range: { startLineNumber: 1, startColumn: 2, endLineNumber: 1, endColumn: 2 },
          text: "X",
        },
      ]);
      expect(m.canUndo()).toBe(true);
      expect(m.canRedo()).toBe(false);
      m.undo();
      expect(m.canUndo()).toBe(false);
      expect(m.canRedo()).toBe(true);
    });
  });

  describe("multiple edits", () => {
    it("applies sequential edits", () => {
      const m = createModel("");
      m.pushEditOperations([
        {
          range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 },
          text: "a",
        },
      ]);
      m.pushEditOperations([
        {
          range: { startLineNumber: 1, startColumn: 2, endLineNumber: 1, endColumn: 2 },
          text: "b",
        },
      ]);
      m.pushEditOperations([
        {
          range: { startLineNumber: 1, startColumn: 3, endLineNumber: 1, endColumn: 3 },
          text: "c",
        },
      ]);
      expect(m.getLineContent(1)).toBe("abc");
      m.undo();
      expect(m.getLineContent(1)).toBe("ab");
      m.pushEditOperations([
        {
          range: { startLineNumber: 1, startColumn: 3, endLineNumber: 1, endColumn: 3 },
          text: "d",
        },
      ]);
      expect(m.getLineContent(1)).toBe("abd");
      // Redo should be cleared after push
      expect(m.canRedo()).toBe(false);
    });
  });
});
