/**
 * Tests for OutputBuffer — fixed-capacity ring buffer for streaming output.
 *
 * Covers:
 * - Basic write/read with under-capacity buffer
 * - Wraparound behavior (write more than capacity)
 * - Edge cases: empty, single write, capacity=1, zero count reads
 * - Clear and re-use
 * - getLine() with in-range and out-of-range indices
 * - Validation: non-positive capacity throws
 */

import { OutputBuffer } from "@openp41ge/renderer/controllers/output-buffer";

describe("OutputBuffer", () => {
  // ── Construction ─────────────────────────────────────────────────────────

  describe("constructor", () => {
    it("creates an empty buffer with default capacity", () => {
      const buf = new OutputBuffer();
      expect(buf.totalLines).toBe(0);
      expect(buf.capacity).toBe(1000);
    });

    it("creates an empty buffer with custom capacity", () => {
      const buf = new OutputBuffer(50);
      expect(buf.totalLines).toBe(0);
      expect(buf.capacity).toBe(50);
    });

    it("throws for non-positive capacity", () => {
      expect(() => new OutputBuffer(0)).toThrow("OutputBuffer capacity must be positive");
      expect(() => new OutputBuffer(-1)).toThrow("OutputBuffer capacity must be positive");
    });
  });

  // ── write + read ────────────────────────────────────────────────────────

  describe("write and read", () => {
    it("reads back what was written (under capacity)", () => {
      const buf = new OutputBuffer(10);
      buf.write("a");
      buf.write("b");
      buf.write("c");
      expect(buf.totalLines).toBe(3);
      expect(buf.read(0, 10)).toEqual(["a", "b", "c"]);
    });

    it("overwrites oldest lines when at capacity", () => {
      const buf = new OutputBuffer(3);
      buf.write("1");
      buf.write("2");
      buf.write("3");
      buf.write("4"); // '1' is overwritten
      expect(buf.totalLines).toBe(3);
      expect(buf.read(0, 10)).toEqual(["2", "3", "4"]);
    });

    it("handles multiple wraparounds", () => {
      const buf = new OutputBuffer(4);
      for (let i = 0; i < 10; i++) {
        buf.write(String(i));
      }
      expect(buf.totalLines).toBe(4);
      // Only the last 4 lines remain: 6, 7, 8, 9
      expect(buf.read(0, 10)).toEqual(["6", "7", "8", "9"]);
    });

    it("reads partial ranges", () => {
      const buf = new OutputBuffer(10);
      for (let i = 0; i < 5; i++) {
        buf.write(String(i));
      }
      expect(buf.read(1, 2)).toEqual(["1", "2"]);
      expect(buf.read(0, 3)).toEqual(["0", "1", "2"]);
    });

    it("clamps read beyond available lines", () => {
      const buf = new OutputBuffer(10);
      buf.write("a");
      buf.write("b");
      // Only 2 lines available, request 10
      expect(buf.read(0, 10)).toEqual(["a", "b"]);
      // Start beyond end
      expect(buf.read(5, 3)).toEqual([]);
    });

    it("returns empty array for zero count read", () => {
      const buf = new OutputBuffer(10);
      buf.write("a");
      expect(buf.read(0, 0)).toEqual([]);
    });

    it("reads successfully after wraparound with partial range", () => {
      const buf = new OutputBuffer(5);
      for (let i = 0; i < 7; i++) {
        buf.write(String(i));
      }
      // After 7 writes to capacity 5, we have [2, 3, 4, 5, 6]
      expect(buf.read(0, 3)).toEqual(["2", "3", "4"]);
      expect(buf.read(2, 2)).toEqual(["4", "5"]);
      expect(buf.read(4, 1)).toEqual(["6"]);
    });
  });

  // ── getLine ─────────────────────────────────────────────────────────────

  describe("getLine", () => {
    it("returns the line at the given index", () => {
      const buf = new OutputBuffer(10);
      buf.write("first");
      buf.write("second");
      buf.write("third");
      expect(buf.getLine(0)).toBe("first");
      expect(buf.getLine(1)).toBe("second");
      expect(buf.getLine(2)).toBe("third");
    });

    it("returns undefined for indices out of range", () => {
      const buf = new OutputBuffer(10);
      buf.write("only");
      expect(buf.getLine(-1)).toBeUndefined();
      expect(buf.getLine(1)).toBeUndefined();
      expect(buf.getLine(100)).toBeUndefined();
    });

    it("returns undefined on empty buffer", () => {
      const buf = new OutputBuffer(10);
      expect(buf.getLine(0)).toBeUndefined();
    });

    it("works correctly after wraparound", () => {
      const buf = new OutputBuffer(3);
      buf.write("a");
      buf.write("b");
      buf.write("c");
      buf.write("d"); // 'a' is gone
      expect(buf.getLine(0)).toBe("b");
      expect(buf.getLine(1)).toBe("c");
      expect(buf.getLine(2)).toBe("d");
      expect(buf.getLine(3)).toBeUndefined();
    });
  });

  // ── clear ───────────────────────────────────────────────────────────────

  describe("clear", () => {
    it("resets the buffer", () => {
      const buf = new OutputBuffer(5);
      buf.write("x");
      buf.write("y");
      expect(buf.totalLines).toBe(2);
      buf.clear();
      expect(buf.totalLines).toBe(0);
      expect(buf.read(0, 10)).toEqual([]);
    });

    it("allows writing after clear", () => {
      const buf = new OutputBuffer(3);
      buf.write("old");
      buf.clear();
      buf.write("new");
      expect(buf.read(0, 10)).toEqual(["new"]);
      expect(buf.totalLines).toBe(1);
    });

    it("preserves capacity after clear", () => {
      const buf = new OutputBuffer(7);
      buf.clear();
      expect(buf.capacity).toBe(7);
    });
  });

  // ── Edge cases ─────────────────────────────────────────────────────────

  describe("edge cases", () => {
    it("handles capacity of 1", () => {
      const buf = new OutputBuffer(1);
      buf.write("only");
      expect(buf.totalLines).toBe(1);
      expect(buf.read(0, 10)).toEqual(["only"]);
      // Overwrite the only slot
      buf.write("replaced");
      expect(buf.totalLines).toBe(1);
      expect(buf.read(0, 10)).toEqual(["replaced"]);
    });

    it("handles single write then read", () => {
      const buf = new OutputBuffer(100);
      buf.write("lonely");
      expect(buf.read(0, 1)).toEqual(["lonely"]);
      expect(buf.read(0, 5)).toEqual(["lonely"]);
    });

    it("handles empty string lines", () => {
      const buf = new OutputBuffer(10);
      buf.write("");
      buf.write("not empty");
      expect(buf.read(0, 10)).toEqual(["", "not empty"]);
    });

    it("handles multi-line strings as single lines", () => {
      const buf = new OutputBuffer(10);
      buf.write("line1\nline2");
      expect(buf.read(0, 1)).toEqual(["line1\nline2"]);
      expect(buf.totalLines).toBe(1);
    });

    it("does not mutate returned arrays", () => {
      const buf = new OutputBuffer(5);
      buf.write("a");
      const result = buf.read(0, 10);
      expect(result).toEqual(["a"]);
      // Mutation should not affect buffer
      (result as string[]).push("b");
      expect(buf.read(0, 10)).toEqual(["a"]);
    });

    it("read returns a new array each time", () => {
      const buf = new OutputBuffer(5);
      buf.write("x");
      const r1 = buf.read(0, 10);
      const r2 = buf.read(0, 10);
      expect(r1).toEqual(["x"]);
      expect(r2).toEqual(["x"]);
      expect(r1).not.toBe(r2);
    });
  });

  // ── Large capacity ──────────────────────────────────────────────────────

  describe("large capacity", () => {
    it("writes and reads at default capacity", () => {
      const buf = new OutputBuffer();
      for (let i = 0; i < 100; i++) {
        buf.write(`line-${i}`);
      }
      expect(buf.totalLines).toBe(100);
      const lines = buf.read(0, 100);
      expect(lines.length).toBe(100);
      expect(lines[0]).toBe("line-0");
      expect(lines[99]).toBe("line-99");
    });

    it("wraps around at default capacity", () => {
      const buf = new OutputBuffer(100);
      for (let i = 0; i < 200; i++) {
        buf.write(`line-${i}`);
      }
      expect(buf.totalLines).toBe(100);
      const lines = buf.read(0, 100);
      expect(lines[0]).toBe("line-100");
      expect(lines[99]).toBe("line-199");
    });
  });
});
