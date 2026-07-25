/**
 * Tests for KeyboardHandler — mapping keyboard events to cursor commands.
 *
 * This test verifies that Cmd+S is NOT consumed by the keyboard handler,
 * so the event can propagate to the platform-level save handler.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { KeyboardHandler } from "@openp41ge-file-editor/input/keyboard-handler";
import { CursorController } from "@openp41ge-file-editor/cursor/cursor-controller";
import { PieceTreeTextContentModel } from "@openp41ge-file-editor/model/piece-tree-text-content-model";
import { TextAreaInput } from "@openp41ge-file-editor/input/text-area-input";

/**
 * Create a minimal mock CursorController that doesn't actually connect to a model.
 * We only need it to construct KeyboardHandler.
 */
function createMockCursorController(): CursorController {
  const model = new PieceTreeTextContentModel("/test/file.txt", "hello world");
  return new CursorController(model);
}

describe("KeyboardHandler", () => {
  let handler: KeyboardHandler;
  let cc: CursorController;

  beforeEach(() => {
    cc = createMockCursorController();
    handler = new KeyboardHandler(cc);
  });

  it("returns false for Cmd+S so event propagates to document handler", () => {
    const event = new KeyboardEvent("keydown", {
      key: "s",
      code: "KeyS",
      metaKey: true,
      ctrlKey: false,
      altKey: false,
      shiftKey: false,
      bubbles: true,
      cancelable: true,
    });

    const result = handler.handleKeyDown(event);
    expect(result).toBe(false);
  });

  it("returns false for Ctrl+S so event propagates to document handler", () => {
    const event = new KeyboardEvent("keydown", {
      key: "s",
      code: "KeyS",
      metaKey: false,
      ctrlKey: true,
      altKey: false,
      shiftKey: false,
      bubbles: true,
      cancelable: true,
    });

    const result = handler.handleKeyDown(event);
    expect(result).toBe(false);
  });

  it("returns false for Cmd+Shift+S so event propagates", () => {
    const event = new KeyboardEvent("keydown", {
      key: "S",
      code: "KeyS",
      metaKey: true,
      ctrlKey: false,
      altKey: false,
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });

    const result = handler.handleKeyDown(event);
    expect(result).toBe(false);
  });

  it("returns true for Cmd+Z (undo) so keyboard handler does consume it", () => {
    const event = new KeyboardEvent("keydown", {
      key: "z",
      code: "KeyZ",
      metaKey: true,
      ctrlKey: false,
      altKey: false,
      shiftKey: false,
      bubbles: true,
      cancelable: true,
    });

    const result = handler.handleKeyDown(event);
    expect(result).toBe(true);
  });

  it("returns true for Cmd+A (select all) so keyboard handler does consume it", () => {
    const event = new KeyboardEvent("keydown", {
      key: "a",
      code: "KeyA",
      metaKey: true,
      ctrlKey: false,
      altKey: false,
      shiftKey: false,
      bubbles: true,
      cancelable: true,
    });

    const result = handler.handleKeyDown(event);
    expect(result).toBe(true);
  });

  it("TextAreaInput does not stopPropagation when onKey returns false", () => {
    // Create a TextAreaInput with an onKey that returns false (like our Cmd+S handler)
    const parent = document.createElement("div");
    document.body.appendChild(parent);

    const onKeySpy = vi.fn().mockReturnValue(false);

    const input = new TextAreaInput({
      parentElement: parent,
      cursorController: cc,
      onKey: onKeySpy,
    });

    // Get the hidden textarea that TextAreaInput created inside parent
    const textarea = parent.querySelector("textarea");
    expect(textarea).toBeTruthy();

    const stopPropagationSpy = vi.fn();
    const preventDefaultSpy = vi.fn();

    // Create a synthetic keydown event
    const event = new KeyboardEvent("keydown", {
      key: "s",
      code: "KeyS",
      metaKey: true,
      bubbles: true,
      cancelable: true,
    });

    // Spy on the event's methods
    event.preventDefault = preventDefaultSpy;
    event.stopPropagation = stopPropagationSpy;

    // Dispatch on the textarea — this triggers TextAreaInput._onKeyDown directly
    textarea!.dispatchEvent(event);

    // onKey should have been called
    expect(onKeySpy).toHaveBeenCalled();

    // Since onKey returned false, neither preventDefault nor stopPropagation should be called
    expect(preventDefaultSpy).not.toHaveBeenCalled();
    expect(stopPropagationSpy).not.toHaveBeenCalled();

    // Clean up
    input.dispose();
    document.body.removeChild(parent);
  });

  it("TextAreaInput calls stopPropagation when onKey returns true", () => {
    const parent = document.createElement("div");
    document.body.appendChild(parent);

    const onKeySpy = vi.fn().mockReturnValue(true);

    const input = new TextAreaInput({
      parentElement: parent,
      cursorController: cc,
      onKey: onKeySpy,
    });

    const textarea = parent.querySelector("textarea");
    expect(textarea).toBeTruthy();

    const stopPropagationSpy = vi.fn();
    const preventDefaultSpy = vi.fn();

    const event = new KeyboardEvent("keydown", {
      key: "z",
      code: "KeyZ",
      metaKey: true,
      bubbles: true,
      cancelable: true,
    });
    event.preventDefault = preventDefaultSpy;
    event.stopPropagation = stopPropagationSpy;

    textarea!.dispatchEvent(event);

    expect(onKeySpy).toHaveBeenCalled();

    // Since onKey returned true, both preventDefault and stopPropagation should be called
    expect(preventDefaultSpy).toHaveBeenCalled();
    expect(stopPropagationSpy).toHaveBeenCalled();

    input.dispose();
    document.body.removeChild(parent);
  });
});
