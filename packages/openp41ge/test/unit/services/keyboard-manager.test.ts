/**
 * Tests for KeyboardManager service — modal lockdown and shortcut registration.
 */

import { KeyboardManager } from "@openp41ge/renderer/services/keyboard-manager";
import type { IKeyboardBinding } from "@openp41ge/renderer/interfaces/keyboard-manager";

describe("KeyboardManager", () => {
  let km: KeyboardManager;

  beforeEach(() => {
    km = new KeyboardManager();
  });

  function makeBinding(overrides: Partial<IKeyboardBinding> = {}): IKeyboardBinding {
    return {
      modifiers: 8, // Meta
      key: "t",
      code: "KeyT",
      handler: vi.fn(),
      description: "Test binding",
      category: "Test",
      ...overrides,
    };
  }

  function dispatchKeyEvent(
    key: string,
    code: string,
    opts: { metaKey?: boolean; ctrlKey?: boolean; altKey?: boolean; shiftKey?: boolean } = {},
  ): KeyboardEvent {
    return new KeyboardEvent("keydown", {
      key,
      code,
      metaKey: opts.metaKey ?? false,
      ctrlKey: opts.ctrlKey ?? false,
      altKey: opts.altKey ?? false,
      shiftKey: opts.shiftKey ?? false,
      bubbles: true,
      cancelable: true,
    });
  }

  // ── Modal lockdown ──────────────────────────────────────────────

  describe("modal lockdown", () => {
    test("pushModal increments modal count and isModalActive is true", () => {
      expect(km.isModalActive).toBe(false);
      km.pushModal();
      expect(km.isModalActive).toBe(true);
    });

    test("popModal decrements modal count and isModalActive becomes false", () => {
      km.pushModal();
      km.pushModal();
      expect(km.isModalActive).toBe(true);
      km.popModal();
      expect(km.isModalActive).toBe(true);
      km.popModal();
      expect(km.isModalActive).toBe(false);
    });

    test("popModal never goes below 0", () => {
      km.popModal();
      expect(km.isModalActive).toBe(false);
      km.popModal();
      expect(km.isModalActive).toBe(false);
    });

    test("shortcuts are suppressed when modal is active", () => {
      const handler = vi.fn();
      km.register(makeBinding({ handler }));

      km.pushModal();
      const result = km.handleKeyDown(dispatchKeyEvent("t", "KeyT", { metaKey: true }));
      expect(result).toBe(false);
      expect(handler).not.toHaveBeenCalled();
    });

    test("shortcuts are restored after modal is dismissed", () => {
      const handler = vi.fn();
      km.register(makeBinding({ handler }));

      km.pushModal();
      km.popModal();
      const result = km.handleKeyDown(dispatchKeyEvent("t", "KeyT", { metaKey: true }));
      expect(result).toBe(true);
      expect(handler).toHaveBeenCalledTimes(1);
    });

    test("nested modals: shortcuts suppressed after first pop if count > 0", () => {
      const handler = vi.fn();
      km.register(makeBinding({ handler }));

      km.pushModal(); // modal 1 opens
      km.pushModal(); // modal 2 opens
      km.popModal(); // modal 2 closes (count = 1)
      // Shortcuts should still be suppressed
      const result = km.handleKeyDown(dispatchKeyEvent("t", "KeyT", { metaKey: true }));
      expect(result).toBe(false);
      expect(handler).not.toHaveBeenCalled();

      km.popModal(); // modal 1 closes (count = 0)
      const result2 = km.handleKeyDown(dispatchKeyEvent("t", "KeyT", { metaKey: true }));
      expect(result2).toBe(true);
      expect(handler).toHaveBeenCalledTimes(1);
    });

    test("handleKeyDown returns false for non-matching keys when modal is active (no crash)", () => {
      km.pushModal();
      const result = km.handleKeyDown(dispatchKeyEvent("z", "KeyZ", { metaKey: true }));
      expect(result).toBe(false);
    });
  });

  // ── Basic functionality (regression) ────────────────────────────

  describe("basic registration and matching", () => {
    test("registers and matches a binding", () => {
      const handler = vi.fn();
      km.register(makeBinding({ handler }));
      const result = km.handleKeyDown(dispatchKeyEvent("t", "KeyT", { metaKey: true }));
      expect(result).toBe(true);
      expect(handler).toHaveBeenCalledTimes(1);
    });

    test("does not match when modifiers differ", () => {
      const handler = vi.fn();
      km.register(makeBinding({ handler }));
      const result = km.handleKeyDown(dispatchKeyEvent("t", "KeyT", { ctrlKey: true }));
      expect(result).toBe(false);
      expect(handler).not.toHaveBeenCalled();
    });

    test("unregister removes a binding", () => {
      const handler = vi.fn();
      const binding = makeBinding({ handler });
      km.register(binding);
      km.unregister(binding);
      const result = km.handleKeyDown(dispatchKeyEvent("t", "KeyT", { metaKey: true }));
      expect(result).toBe(false);
      expect(handler).not.toHaveBeenCalled();
    });

    test("getBindings returns a copy of registered bindings", () => {
      const b1 = makeBinding({ key: "a", code: "KeyA" });
      km.register(b1);
      const all = km.getBindings();
      expect(all).toHaveLength(1);
      expect(all[0]).toBe(b1);
      // Mutating the returned copy doesn't affect internals
      all.pop();
      expect(km.getBindings()).toHaveLength(1);
    });
  });
});
