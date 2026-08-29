/**
 * Regression tests for Phase 1B of the large-file-performance plan.
 *
 * The plan replaces the full-string dirty check (`getValue() === savedContent`)
 * with a version comparison. That is only correct if `versionId` identifies the
 * *document state*, not the number of edits performed. This requires undo/redo
 * to RESTORE the pre/post edit version (Monaco semantics) instead of always
 * incrementing `_versionId`.
 *
 * Before the fix, undo()/redo() incremented `_versionId`, so undoing back to
 * the saved content left `versionId` at a value != the saved version — the
 * file would be reported dirty forever. These tests pin the restore behaviour.
 */
import { describe, test, expect } from "vitest";
import { PieceTreeTextContentModel } from "openp41ge-editor-engine/model/piece-tree-text-content-model";

function insert(line: number, column: number, text: string) {
  return {
    range: { startLineNumber: line, startColumn: column, endLineNumber: line, endColumn: column },
    text,
  };
}

describe("model versionId/undo semantics (Phase 1B prerequisite)", () => {
  test("a single edit increments versionId", () => {
    const m = new PieceTreeTextContentModel("file:///a.txt", "hello\n");
    const before = m.versionId;
    m.pushEditOperations([insert(1, 6, "!")]);
    expect(m.versionId).toBe(before + 1);
  });

  test("undo() RESTORES the pre-edit version instead of incrementing", () => {
    const m = new PieceTreeTextContentModel("file:///a.txt", "hello\n");
    const v0 = m.versionId;
    m.pushEditOperations([insert(1, 6, "!")]);
    const v1 = m.versionId;
    m.undo();
    expect(m.versionId).toBe(v0);
    // redo restores the post-edit version
    m.redo();
    expect(m.versionId).toBe(v1);
  });

  test("undo-to-saved-state leaves versionId equal to the saved version", () => {
    const m = new PieceTreeTextContentModel("file:///a.txt", "hello\n");
    const saved = m.versionId; // document as loaded = clean baseline
    m.pushEditOperations([insert(1, 2, "X")]);
    expect(m.versionId).not.toBe(saved);
    expect(m.getValue()).toBe("hXello\n");
    m.undo(); // back to the clean document
    expect(m.versionId).toBe(saved);
    expect(m.getValue()).toBe("hello\n");
  });

  test("multiple edits then undos: versionId tracks the document state", () => {
    const m = new PieceTreeTextContentModel("file:///a.txt", "a\n");
    const v0 = m.versionId;
    m.pushEditOperations([insert(1, 2, "b")]); // v0+1
    m.pushEditOperations([insert(1, 3, "c")]); // v0+2
    expect(m.versionId).toBe(v0 + 2);
    m.undo(); // back to "ab\n" -> v0+1
    expect(m.versionId).toBe(v0 + 1);
    m.undo(); // back to "a\n" -> v0
    expect(m.versionId).toBe(v0);
    expect(m.getValue()).toBe("a\n");
    m.redo(); // "ab\n" -> v0+1
    expect(m.versionId).toBe(v0 + 1);
    m.redo(); // "abc\n" -> v0+2
    expect(m.versionId).toBe(v0 + 2);
  });

  test("an edit after undo uses the restored version as its baseline (parity preserved)", () => {
    const m = new PieceTreeTextContentModel("file:///a.txt", "a\n");
    const v0 = m.versionId;
    m.pushEditOperations([insert(1, 2, "b")]); // v1
    m.undo(); // v0
    m.pushEditOperations([insert(1, 2, "c")]); // must be v0+1
    expect(m.versionId).toBe(v0 + 1);
    expect(m.getValue()).toBe("ac\n");
  });

  test("setValue bumps versionId and clears the undo stack", () => {
    const m = new PieceTreeTextContentModel("file:///a.txt", "a\n");
    const before = m.versionId;
    m.setValue("b\n");
    expect(m.versionId).toBeGreaterThan(before);
    expect(m.canUndo()).toBe(false);
    expect(m.getValue()).toBe("b\n");
  });
});
