/**
 * Tests for CursorController.setCursorStates — the host-facing API that lets a
 * host (e.g. the JSON editor, which keeps its own folding-aware offset model)
 * seed the controller with arbitrary caret states before delegating a
 * movement/selection command, and read them back afterwards.
 */
import { describe, test, expect } from "vitest";
import { CursorController } from "openp41ge-editor-engine/cursor/cursor-controller";
import { PieceTreeTextContentModel } from "openp41ge-editor-engine/model/piece-tree-text-content-model";
import type { TextPosition } from "openp41ge-editor-engine/model";

const p = (lineNumber: number, column: number): TextPosition => ({ lineNumber, column });

describe("CursorController.setCursorStates", () => {
  test("seeds a single collapsed caret", () => {
    const m = new PieceTreeTextContentModel("json", "{\n  \"a\": 1\n}");
    const cc = new CursorController(m);
    cc.setCursorStates([{ position: p(2, 3), selectionAnchor: p(2, 3) }]);
    expect(cc.cursorCount).toBe(1);
    expect(cc.position).toEqual(p(2, 3));
    expect(cc.selection.positionLineNumber).toBe(2);
    expect(cc.selection.positionColumn).toBe(3);
  });

  test("seeds a primary selection plus a secondary caret", () => {
    const m = new PieceTreeTextContentModel("json", "{\n  \"a\": 1\n}");
    const cc = new CursorController(m);
    cc.setCursorStates([
      { position: p(2, 7), selectionAnchor: p(2, 3) },
      { position: p(1, 1), selectionAnchor: p(1, 1) },
    ]);
    expect(cc.cursorCount).toBe(2);
    const all = cc.getAllCursors();
    expect(all[0].selectionAnchor).toEqual(p(2, 3));
    expect(all[0].position).toEqual(p(2, 7));
    expect(all[1].position).toEqual(p(1, 1));
    expect(cc.hasMultipleCursors).toBe(true);
  });

  test("preserves sibling cursors that share the same position (no dedup)", () => {
    const m = new PieceTreeTextContentModel("json", "{\n  \"a\": 1\n}");
    const cc = new CursorController(m);
    cc.setCursorStates([
      { position: p(1, 1), selectionAnchor: p(1, 1) },
      { position: p(1, 1), selectionAnchor: p(1, 1) },
      { position: p(1, 1), selectionAnchor: p(1, 1) },
    ]);
    expect(cc.cursorCount).toBe(3);
  });

  test("moveToFileStart applies a converge-to-top command to all seeded cursors, keeping each selection anchor", () => {
    const m = new PieceTreeTextContentModel("json", "{\n  \"a\": 1\n}");
    const cc = new CursorController(m);
    cc.setCursorStates([
      { position: p(2, 7), selectionAnchor: p(2, 3) },
      { position: p(3, 1), selectionAnchor: p(3, 1) },
    ]);
    cc.selectToFileStart();
    const all = cc.getAllCursors();
    // Both positions converge to the file start; anchors are preserved.
    expect(all[0].position).toEqual(p(1, 1));
    expect(all[0].selectionAnchor).toEqual(p(2, 3));
    expect(all[1].position).toEqual(p(1, 1));
    expect(all[1].selectionAnchor).toEqual(p(3, 1));
  });
});
