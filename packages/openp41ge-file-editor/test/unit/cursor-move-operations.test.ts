/**
 * Tests for cursor move operations (pure functions) with word wrap.
 */
import { describe, it, expect } from "vitest";
import { PieceTreeTextContentModel } from "@openp41ge-file-editor/model/piece-tree-text-content-model";
import { moveUp, moveDown } from "@openp41ge-file-editor/cursor/cursor-move-operations";
import type { CoordinatesConverter } from "@openp41ge-file-editor/model/coordinates-converter";
import type { TextPosition } from "@openp41ge-file-editor/model";

// ─── Helpers ─────────────────────────────────────────────────────────

function model(text: string) {
  return new PieceTreeTextContentModel("test", text);
}

/**
 * Build a mock CoordinatesConverter for a simple test scenario:
 *
 *   Line 1: "abcdefghijklmnopqrstuvwxyzABCDE" (30 chars) → wraps at 20
 *           v1: cols 1-20, v2: cols 21-30
 *   Line 2: "shortlineX" (10 chars) → no wrap
 *           v3: cols 1-10
 *   Line 3: "12345678901234567890ABCDEFGHIJ" (30 chars) → wraps at 20
 *           v4: cols 1-20, v5: cols 21-30
 */
function createMockConverter(wrapColumn = 20): CoordinatesConverter {
  const lines = [
    "abcdefghijklmnopqrstuvwxyzABCDE", // line 1: 30 chars
    "shortlineX", // line 2: 10 chars
    "12345678901234567890ABCDEFGHIJ", // line 3: 30 chars
  ];

  function computeSegments(content: string) {
    const segs: { startCol: number; endCol: number }[] = [];
    let pos = 0;
    while (pos < content.length) {
      const end = Math.min(pos + wrapColumn, content.length);
      segs.push({ startCol: pos + 1, endCol: end + 1 });
      pos = end;
    }
    if (segs.length === 0) {
      segs.push({ startCol: 1, endCol: 1 });
    }
    return segs;
  }

  const segs = lines.map(computeSegments);

  const viewLineBases: number[] = [];
  let viewLine = 1;
  for (let i = 0; i < segs.length; i++) {
    viewLineBases.push(viewLine);
    viewLine += segs[i].length;
  }
  const totalViewLines = viewLine - 1;

  function getModelLineFromViewLine(vl: number): number {
    for (let i = segs.length - 1; i >= 0; i--) {
      if (vl >= viewLineBases[i]) return i + 1;
    }
    return 1;
  }

  function getViewLineFromModelLine(ml: number): number {
    return viewLineBases[ml - 1] ?? 1;
  }

  return {
    isWordWrap: true,
    convertModelToViewPosition(ml: number, mc: number): TextPosition {
      const segments = segs[ml - 1];
      if (!segments) return { lineNumber: ml, column: mc };
      const base = getViewLineFromModelLine(ml);
      for (let s = 0; s < segments.length; s++) {
        if (mc < segments[s].endCol) {
          return { lineNumber: base + s, column: Math.max(1, mc - segments[s].startCol + 1) };
        }
      }
      const lastSeg = segments[segments.length - 1];
      return { lineNumber: base + segments.length - 1, column: mc - lastSeg.startCol + 1 };
    },
    convertViewToModelPosition(vl: number, vc: number): TextPosition {
      const ml = getModelLineFromViewLine(vl) - 1;
      if (ml < 0) return { lineNumber: 1, column: vc };
      const segments = segs[ml];
      if (!segments || segments.length <= 1) {
        return { lineNumber: ml + 1, column: vc };
      }
      const base = viewLineBases[ml];
      const si = vl - base;
      if (si >= 0 && si < segments.length) {
        const seg = segments[si];
        return { lineNumber: ml + 1, column: seg.startCol + Math.max(0, vc - 1) };
      }
      return { lineNumber: ml + 1, column: vc };
    },
    getTotalViewLineCount: () => totalViewLines,
    getViewLineCount: (ml: number) => segs[ml - 1]?.length ?? 1,
    getViewLineFromModelLine,
    getModelLineFromViewLine,
    markDirty: () => {},
    setWordWrap: () => {},
  } as CoordinatesConverter;
}

describe("CursorMoveOperations with word wrap", () => {
  describe("moveDown", () => {
    it("moves to next view line within the same model line (wrapped navigation)", () => {
      const m = model(
        "abcdefghijklmnopqrstuvwxyzABCDE\nshortlineX\n12345678901234567890ABCDEFGHIJ",
      );
      const cc = createMockConverter(20);

      // Line 1, col 10 is on view line 1 (segment 0). Move down to view line 2 (segment 1).
      const r = moveDown(m, { lineNumber: 1, column: 10 }, 10, cc);

      // Same model line, no clamping → modelPos from converter
      expect(r.position.lineNumber).toBe(1);
      // converter maps view line 2, col 10 to: seg[1].startCol=21, modelCol=21+10-1=30
      expect(r.position.column).toBe(30);
      expect(r.goalColumn).toBe(10);
    });

    it("clamps column to line end when moving to a shorter model line", () => {
      const m = model(
        "abcdefghijklmnopqrstuvwxyzABCDE\nshortlineX\n12345678901234567890ABCDEFGHIJ",
      );
      const cc = createMockConverter(20);

      // Line 1, col 22 → view line 2 (seg 1), view col = 22-21+1 = 2
      // Move down to view line 3 = model line 2 (10 chars)
      const r = moveDown(m, { lineNumber: 1, column: 22 }, 22, cc);

      // Crossed to model line 2: clamp column to min(goal=22, line2.length+1=11) = 10... wait
      // "shortlineX" is 10 chars, so length+1 = 11, min(22,11) = 10? No, min(22,11) = 11.
      expect(r.position.lineNumber).toBe(2);
      expect(r.position.column).toBe(11); // end of short line
      expect(r.goalColumn).toBe(22); // goal preserved
    });

    it("remembers goal column across multiple model lines", () => {
      const m = model(
        "abcdefghijklmnopqrstuvwxyzABCDE\nshortlineX\n12345678901234567890ABCDEFGHIJ",
      );
      const cc = createMockConverter(20);

      // 1) Move from line 1, col 22 to line 2 (short)
      const r1 = moveDown(m, { lineNumber: 1, column: 22 }, 22, cc);
      expect(r1.position.lineNumber).toBe(2);
      expect(r1.position.column).toBe(11); // min(22, 11) = 11
      expect(r1.goalColumn).toBe(22);

      // 2) Move from line 2, col 11 with goal=22 to line 3 (long)
      const r2 = moveDown(m, r1.position, r1.goalColumn, cc);
      expect(r2.position.lineNumber).toBe(3);
      expect(r2.position.column).toBe(22); // min(22, 31) = 22
      expect(r2.goalColumn).toBe(22);
    });

    it("applies updated goal column after horizontal move", () => {
      const m = model(
        "abcdefghijklmnopqrstuvwxyzABCDE\nshortlineX\n12345678901234567890ABCDEFGHIJ",
      );
      const cc = createMockConverter(20);

      // Start: line 1, col 22, goal=22 → move to line 2 (short)
      const r1 = moveDown(m, { lineNumber: 1, column: 22 }, 22, cc);
      expect(r1.position).toEqual({ lineNumber: 2, column: 11 });

      // Simulate left arrow: user presses Left, cursor goes to col 10, goal becomes 10
      const newGoal = 10;
      const r2 = moveDown(m, { lineNumber: 2, column: 10 }, newGoal, cc);
      expect(r2.position.lineNumber).toBe(3);
      expect(r2.position.column).toBe(10); // min(10, 31) = 10
      expect(r2.goalColumn).toBe(10);
    });

    it("stays at last view line", () => {
      const m = model("a\nb");
      const simpleCC = {
        isWordWrap: true,
        convertModelToViewPosition: () => ({ lineNumber: 2, column: 1 }),
        getTotalViewLineCount: () => 2,
      } as CoordinatesConverter;

      const r = moveDown(m, { lineNumber: 2, column: 1 }, 1, simpleCC);
      expect(r.position.lineNumber).toBe(2);
      expect(r.position.column).toBe(2);
    });
  });

  describe("moveUp", () => {
    it("moves up to previous view line within same model line", () => {
      const m = model(
        "abcdefghijklmnopqrstuvwxyzABCDE\nshortlineX\n12345678901234567890ABCDEFGHIJ",
      );
      const cc = createMockConverter(20);

      // Line 3, col 5 on view line 4. Move up to view line 3 = model line 2
      const r = moveUp(m, { lineNumber: 3, column: 5 }, 5, cc);

      expect(r.position.lineNumber).toBe(2);
      expect(r.position.column).toBe(5);
      expect(r.goalColumn).toBe(5);
    });

    it("clamps column to line end when moving up to a shorter model line", () => {
      const m = model(
        "abcdefghijklmnopqrstuvwxyzABCDE\nshortlineX\n12345678901234567890ABCDEFGHIJ",
      );
      const cc = createMockConverter(20);

      // Line 3, col 22 with goal=22. Line 3 wraps at 20, so col 22 is in seg 1.
      // Move up: goes to seg 0 (same model line). Second move up crosses to line 2.
      const r1 = moveUp(m, { lineNumber: 3, column: 22 }, 22, cc);
      expect(r1.position.lineNumber).toBe(3);

      const r2 = moveUp(m, r1.position, r1.goalColumn, cc);
      expect(r2.position.lineNumber).toBe(2);
      expect(r2.position.column).toBe(11); // min(22, 11) = 11
      expect(r2.goalColumn).toBe(22);
    });

    it("stays at first view line", () => {
      const m = model("abcdefghijklmnopqrstuvwxyzABCDE\nshortlineX");
      const simpleCC = {
        isWordWrap: true,
        convertModelToViewPosition: () => ({ lineNumber: 1, column: 1 }),
      } as CoordinatesConverter;

      const r = moveUp(m, { lineNumber: 1, column: 1 }, 1, simpleCC);
      expect(r.position.lineNumber).toBe(1);
      expect(r.position.column).toBe(1);
    });

    it("remembers goal column when moving up through short and long lines", () => {
      const m = model(
        "abcdefghijklmnopqrstuvwxyzABCDE\nshortlineX\n12345678901234567890ABCDEFGHIJ",
      );
      const cc = createMockConverter(20);

      // Line 3, col 22, goal=22 → line 3 wraps at 20, so col 22 is in seg 1
      // First move up goes to seg 0 (same model line)
      const r1 = moveUp(m, { lineNumber: 3, column: 22 }, 22, cc);
      expect(r1.position.lineNumber).toBe(3);
      expect(r1.goalColumn).toBe(22);

      // Second move up: cross to line 2 (short), clamp to goal
      const r2 = moveUp(m, r1.position, r1.goalColumn, cc);
      expect(r2.position.lineNumber).toBe(2);
      expect(r2.position.column).toBe(11); // min(22, 11) = 11
      expect(r2.goalColumn).toBe(22);

      // Third move up: from line 2, col 11 with goal=22 → line 1 (long)
      const r3 = moveUp(m, r2.position, r2.goalColumn, cc);
      expect(r3.position.lineNumber).toBe(1);
      expect(r3.position.column).toBe(22); // goal=22, line1=30 chars → min(22,31) = 22
      expect(r3.goalColumn).toBe(22);
    });

    it("resets goal column via horizontal move, then moves up", () => {
      const m = model(
        "abcdefghijklmnopqrstuvwxyzABCDE\nshortlineX\n12345678901234567890ABCDEFGHIJ",
      );
      const cc = createMockConverter(20);

      // Line 3, col 22, goal=22 → line 3 wraps, so first move up stays within model line 3
      const r1 = moveUp(m, { lineNumber: 3, column: 22 }, 22, cc);
      expect(r1.position.lineNumber).toBe(3);
      expect(r1.position.column).toBe(2); // view line 4, seg 0, view col 2 → model col 2
      expect(r1.goalColumn).toBe(22);

      // Second move up: now cross to model line 2 (short), clamp to goal
      const r2 = moveUp(m, r1.position, r1.goalColumn, cc);
      expect(r2.position).toEqual({ lineNumber: 2, column: 11 });

      // Simulate left arrow: position becomes col 10, goal becomes 10
      const r3 = moveUp(m, { lineNumber: 2, column: 10 }, 10, cc);
      expect(r3.position.lineNumber).toBe(1);
      expect(r3.position.column).toBe(10); // min(10, 31) = 10
      expect(r3.goalColumn).toBe(10);
    });
  });

  describe("edge cases", () => {
    it("works without CoordinatesConverter (non-wrap path)", () => {
      const m = model("abc\ndef\nghi");

      const r = moveDown(m, { lineNumber: 1, column: 2 }, 2, null);
      expect(r.position).toEqual({ lineNumber: 2, column: 2 });
      expect(r.goalColumn).toBe(2);

      const r2 = moveDown(m, r.position, r.goalColumn, null);
      expect(r2.position).toEqual({ lineNumber: 3, column: 2 });
      expect(r2.goalColumn).toBe(2);
    });

    it("non-wrap path clamps to line length with goal column", () => {
      const m = model("abc\nde");

      const r = moveDown(m, { lineNumber: 1, column: 4 }, 4, null);
      expect(r.position).toEqual({ lineNumber: 2, column: 3 }); // min(4, 3) = 3
      expect(r.goalColumn).toBe(4);
    });

    it("returns goalColumn from position.column when goalColumn is undefined", () => {
      const m = model("abc\ndef");
      const cc = createMockConverter(20);

      const r = moveUp(m, { lineNumber: 1, column: 1 }, undefined, cc);
      expect(r.goalColumn).toBe(1);
    });

    it("handles last-view-line case returning end of model", () => {
      const m = model("hello");
      const simpleCC = {
        isWordWrap: true,
        convertModelToViewPosition: () => ({ lineNumber: 1, column: 1 }),
        getTotalViewLineCount: () => 1,
      } as CoordinatesConverter;

      const r = moveDown(m, { lineNumber: 1, column: 1 }, 1, simpleCC);
      expect(r.position).toEqual({ lineNumber: 1, column: 6 });
    });
  });
});
