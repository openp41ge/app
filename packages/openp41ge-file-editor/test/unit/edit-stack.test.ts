/**
 * Tests for EditStack (undo/redo with delta compression).
 */
import { describe, it, expect } from "vitest";
import { EditStack } from "@openp41ge-file-editor/model/edit-stack";
import { TextChange } from "@openp41ge-file-editor/model/text-change";

describe("EditStack", () => {
  it("starts empty", () => {
    const stack = new EditStack();
    expect(stack.canUndo).toBe(false);
    expect(stack.canRedo).toBe(false);
    expect(stack.size).toBe(0);
  });

  it("pushes and pops a single change", () => {
    const stack = new EditStack();
    const element = {
      changes: [new TextChange(2, "bc", 2, "BC")],
      beforeCursorState: null,
      afterCursorState: null,
      beforeEOL: "\n" as const,
      afterEOL: "\n" as const,
      beforeVersionId: 0,
      afterVersionId: 1,
    };
    stack.pushElement(element);
    expect(stack.canUndo).toBe(true);
    const popped = stack.popUndo();
    expect(popped).not.toBeNull();
    expect(popped!.changes[0].originalText).toBe("bc");
    expect(popped!.changes[0].modifiedText).toBe("BC");
  });

  it("popUndo returns null when nothing to undo", () => {
    const stack = new EditStack();
    expect(stack.popUndo()).toBeNull();
  });

  it("popRedo returns null when nothing to redo", () => {
    const stack = new EditStack();
    expect(stack.popRedo()).toBeNull();
  });

  it("undo then redo round-trips", () => {
    const stack = new EditStack();
    const element = {
      changes: [new TextChange(0, "", 0, "hello")],
      beforeCursorState: null,
      afterCursorState: null,
      beforeEOL: "\n" as const,
      afterEOL: "\n" as const,
      beforeVersionId: 0,
      afterVersionId: 1,
    };
    stack.pushElement(element);
    const undone = stack.popUndo();
    expect(undone).not.toBeNull();
    expect(stack.canRedo).toBe(true);
    const redone = stack.popRedo();
    expect(redone).not.toBeNull();
    expect(redone!.changes[0].modifiedText).toBe("hello");
  });

  it("pushElement clears redo stack", () => {
    const stack = new EditStack();
    stack.pushElement({
      changes: [new TextChange(0, "", "a")],
      beforeCursorState: null,
      afterCursorState: null,
      beforeEOL: "\n" as const,
      afterEOL: "\n" as const,
      beforeVersionId: 0,
      afterVersionId: 1,
    });
    stack.popUndo();
    expect(stack.canRedo).toBe(true);
    stack.pushElement({
      changes: [new TextChange(0, "", "b")],
      beforeCursorState: null,
      afterCursorState: null,
      beforeEOL: "\n" as const,
      afterEOL: "\n" as const,
      beforeVersionId: 1,
      afterVersionId: 2,
    });
    expect(stack.canRedo).toBe(false);
  });

  it("clear resets both stacks", () => {
    const stack = new EditStack();
    stack.pushElement({
      changes: [new TextChange(0, "", "hello")],
      beforeCursorState: null,
      afterCursorState: null,
      beforeEOL: "\n" as const,
      afterEOL: "\n" as const,
      beforeVersionId: 0,
      afterVersionId: 1,
    });
    stack.popUndo();
    expect(stack.canRedo).toBe(true);
    stack.clear();
    expect(stack.canUndo).toBe(false);
    expect(stack.canRedo).toBe(false);
    expect(stack.size).toBe(0);
  });

  it("pushElement truncates future history", () => {
    const stack = new EditStack();
    stack.pushElement({
      changes: [new TextChange(0, "", "a")],
      beforeCursorState: null,
      afterCursorState: null,
      beforeEOL: "\n" as const,
      afterEOL: "\n" as const,
      beforeVersionId: 0,
      afterVersionId: 1,
    });
    stack.pushElement({
      changes: [new TextChange(1, "", "b")],
      beforeCursorState: null,
      afterCursorState: null,
      beforeEOL: "\n" as const,
      afterEOL: "\n" as const,
      beforeVersionId: 1,
      afterVersionId: 2,
    });
    stack.popUndo(); // back to state 1
    // Now push a new element — should discard redo history
    stack.pushElement({
      changes: [new TextChange(1, "", "c")],
      beforeCursorState: null,
      afterCursorState: null,
      beforeEOL: "\n" as const,
      afterEOL: "\n" as const,
      beforeVersionId: 1,
      afterVersionId: 2,
    });
    expect(stack.canRedo).toBe(false);
    expect(stack.size).toBe(2); // a + c, b is gone
  });
});
