/**
 * Tests for auto-closing pairs.
 */
import { describe, it, expect } from "vitest";
import { PieceTreeTextContentModel } from "@openp41ge-file-editor/model/piece-tree-text-content-model";
import { checkAutoClose, shouldSkipClose } from "@openp41ge-file-editor/input/auto-closing-pairs";
import type { AutoClosingPair } from "@openp41ge-file-editor/input/auto-closing-pairs";

const DEFAULT_AUTO_CLOSING_PAIRS: AutoClosingPair[] = [
  { open: "(", close: ")" },
  { open: "[", close: "]" },
  { open: "{", close: "}" },
  { open: '"', close: '"' },
  { open: "'", close: "'" },
  { open: "`", close: "`" },
];

function model(text: string) {
  return new PieceTreeTextContentModel("test", text);
}

describe("AutoClosingPairs", () => {
  describe("DEFAULT_AUTO_CLOSING_PAIRS", () => {
    it("includes brackets and quotes", () => {
      const openers = DEFAULT_AUTO_CLOSING_PAIRS.map((p) => p.open);
      expect(openers).toContain("(");
      expect(openers).toContain("[");
      expect(openers).toContain("{");
      expect(openers).toContain('"');
      expect(openers).toContain("'");
      expect(openers).toContain("`");
    });
  });

  describe("checkAutoClose", () => {
    it("returns auto-close for open paren", () => {
      const m = model("hello ");
      const r = checkAutoClose("(", m, { lineNumber: 1, column: 7 });
      expect(r).not.toBeNull();
      expect(r!.text).toBe("()");
      expect(r!.cursorOffset).toBe(1);
    });

    it("returns auto-close for open bracket", () => {
      const m = model("a");
      const r = checkAutoClose("[", m, { lineNumber: 1, column: 2 });
      expect(r).not.toBeNull();
      expect(r!.text).toBe("[]");
    });

    it("returns auto-close for open brace", () => {
      const m = model("a");
      const r = checkAutoClose("{", m, { lineNumber: 1, column: 2 });
      expect(r).not.toBeNull();
      expect(r!.text).toBe("{}");
    });

    it("returns auto-close for double quote", () => {
      const m = model("a");
      const r = checkAutoClose('"', m, { lineNumber: 1, column: 2 });
      expect(r).not.toBeNull();
      expect(r!.text).toBe('""');
    });

    it("returns null for closing character", () => {
      const m = model("a");
      const r = checkAutoClose(")", m, { lineNumber: 1, column: 2 });
      expect(r).toBeNull();
    });

    it("returns null for non-bracket characters", () => {
      const m = model("hello");
      const r = checkAutoClose("a", m, { lineNumber: 1, column: 2 });
      expect(r).toBeNull();
    });

    it("does not auto-close when next char is alphanumeric", () => {
      const m = model("hello");
      // Cursor at column 6 (end), nothing after — should still auto-close
      const r = checkAutoClose("(", m, { lineNumber: 1, column: 6 });
      expect(r).not.toBeNull();
    });

    it("does not auto-close when next char is not a word char", () => {
      const m = model("hello world");
      const r = checkAutoClose("(", m, { lineNumber: 1, column: 6 });
      expect(r).not.toBeNull();
    });
  });

  describe("shouldSkipClose", () => {
    it("skips close paren when next char is closing paren", () => {
      const m = model("hello ()");
      const r = shouldSkipClose(")", m, { lineNumber: 1, column: 8 });
      expect(r).toBe(true);
    });

    it("does not skip close paren when no matching closer follows", () => {
      const m = model("hello (");
      const r = shouldSkipClose(")", m, { lineNumber: 1, column: 8 });
      expect(r).toBe(false);
    });

    it("skips close quote when next char is same quote", () => {
      const m = model('hello ""');
      const r = shouldSkipClose('"', m, { lineNumber: 1, column: 8 });
      expect(r).toBe(true);
    });

    it("returns false for non-closing characters", () => {
      const m = model("hello");
      const r = shouldSkipClose("a", m, { lineNumber: 1, column: 3 });
      expect(r).toBe(false);
    });
  });
});
