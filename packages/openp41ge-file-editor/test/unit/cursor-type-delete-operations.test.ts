/**
 * Tests for cursor type operations (pure functions).
 */
import { describe, it, expect } from "vitest";
import { PieceTreeTextContentModel } from "@openp41ge-file-editor/model/piece-tree-text-content-model";
import {
  insertChar,
  insertNewLine,
  insertTab,
} from "@openp41ge-file-editor/cursor/cursor-type-operations";
import { deleteLeft, deleteRight } from "@openp41ge-file-editor/cursor/cursor-delete-operations";
import type { TextSelection } from "@openp41ge-file-editor/model";

function model(text: string) {
  return new PieceTreeTextContentModel("test", text);
}

describe("CursorTypeOperations", () => {
  describe("insertChar", () => {
    it("inserts character at position", () => {
      const m = model("ab");
      const pos = insertChar(m, "X", { lineNumber: 1, column: 2 }, null);
      expect(m.getLineContent(1)).toBe("aXb");
      expect(pos).toEqual({ lineNumber: 1, column: 3 });
    });

    it("inserts at end of line", () => {
      const m = model("ab");
      const pos = insertChar(m, "C", { lineNumber: 1, column: 3 }, null);
      expect(m.getLineContent(1)).toBe("abC");
      expect(pos).toEqual({ lineNumber: 1, column: 4 });
    });

    it("replaces selection with character", () => {
      const m = model("hello");
      const sel: TextSelection = {
        selectionStartLineNumber: 1,
        selectionStartColumn: 2,
        positionLineNumber: 1,
        positionColumn: 5,
      };
      const pos = insertChar(m, "X", { lineNumber: 1, column: 5 }, sel);
      expect(m.getLineContent(1)).toBe("hXo");
      expect(pos.lineNumber).toBe(1);
      expect(pos.column).toBe(3);
    });

    it("inserts newline character", () => {
      const m = model("ab");
      const pos = insertChar(m, "\n", { lineNumber: 1, column: 2 }, null);
      expect(m.lineCount).toBe(2);
      expect(m.getLineContent(1)).toBe("a");
      expect(m.getLineContent(2)).toBe("b");
      expect(pos).toEqual({ lineNumber: 2, column: 1 });
    });
  });

  describe("insertNewLine", () => {
    it("inserts newline at position", () => {
      const m = model("abc\ndef");
      const pos = insertNewLine(m, { lineNumber: 1, column: 3 }, null);
      expect(m.lineCount).toBe(3);
      expect(m.getLineContent(1)).toBe("ab");
      expect(m.getLineContent(2)).toBe("c");
      expect(m.getLineContent(3)).toBe("def");
    });

    it("handles insertNewLine from selection", () => {
      const m = model("hello");
      const sel: TextSelection = {
        selectionStartLineNumber: 1,
        selectionStartColumn: 2,
        positionLineNumber: 1,
        positionColumn: 5,
      };
      // Selection (1,2)-(1,5) = "ell". Replacing with newline gives "h\no"
      const pos = insertNewLine(m, { lineNumber: 1, column: 5 }, sel);
      expect(m.getLineContent(1)).toBe("h");
      expect(m.getLineContent(2)).toBe("o");
      expect(pos).toEqual({ lineNumber: 2, column: 1 });
    });
  });

  describe("insertTab", () => {
    it("inserts tab at position", () => {
      const m = model("ab");
      const pos = insertTab(m, { lineNumber: 1, column: 2 }, 4);
      expect(m.getLineContent(1)).toBe("a    b");
      expect(pos).toEqual({ lineNumber: 1, column: 6 });
    });

    it("inserts tab at start of line", () => {
      const m = model("hello");
      const pos = insertTab(m, { lineNumber: 1, column: 1 }, 4);
      expect(m.getLineContent(1)).toBe("    hello");
    });
  });
});

describe("CursorDeleteOperations", () => {
  describe("deleteLeft", () => {
    it("deletes character before cursor", () => {
      const m = model("hello");
      // At column 3, char before cursor is 'e' at column 2
      const pos = deleteLeft(m, { lineNumber: 1, column: 3 }, null);
      expect(m.getLineContent(1)).toBe("hllo");
      expect(pos).toEqual({ lineNumber: 1, column: 2 });
    });

    it("deletes selection", () => {
      const m = model("hello");
      const sel: TextSelection = {
        selectionStartLineNumber: 1,
        selectionStartColumn: 2,
        positionLineNumber: 1,
        positionColumn: 5,
      };
      const pos = deleteLeft(m, { lineNumber: 1, column: 5 }, sel);
      expect(m.getLineContent(1)).toBe("ho");
      expect(pos).toEqual({ lineNumber: 1, column: 2 });
    });

    it("merges lines at line start", () => {
      const m = model("ab\ncd");
      const pos = deleteLeft(m, { lineNumber: 2, column: 1 }, null);
      expect(m.getLineContent(1)).toBe("abcd");
      expect(pos).toEqual({ lineNumber: 1, column: 3 });
    });

    it("does nothing at start of file", () => {
      const m = model("hello");
      const pos = deleteLeft(m, { lineNumber: 1, column: 1 }, null);
      expect(m.getLineContent(1)).toBe("hello");
      expect(pos).toEqual({ lineNumber: 1, column: 1 });
    });
  });

  describe("deleteRight", () => {
    it("deletes character at cursor", () => {
      const m = model("hello");
      const pos = deleteRight(m, { lineNumber: 1, column: 2 }, null);
      expect(m.getLineContent(1)).toBe("hllo");
      expect(pos).toEqual({ lineNumber: 1, column: 2 });
    });

    it("deletes selection", () => {
      const m = model("hello");
      const sel: TextSelection = {
        selectionStartLineNumber: 1,
        selectionStartColumn: 2,
        positionLineNumber: 1,
        positionColumn: 5,
      };
      const pos = deleteRight(m, { lineNumber: 1, column: 5 }, sel);
      expect(m.getLineContent(1)).toBe("ho");
      expect(pos).toEqual({ lineNumber: 1, column: 2 });
    });

    it("merges lines at end of line", () => {
      const m = model("ab\ncd");
      const pos = deleteRight(m, { lineNumber: 1, column: 3 }, null);
      expect(m.getLineContent(1)).toBe("abcd");
      expect(pos).toEqual({ lineNumber: 1, column: 3 });
    });

    it("does nothing at end of file", () => {
      const m = model("hello");
      const pos = deleteRight(m, { lineNumber: 1, column: 6 }, null);
      expect(m.getLineContent(1)).toBe("hello");
      expect(pos).toEqual({ lineNumber: 1, column: 6 });
    });
  });
});
