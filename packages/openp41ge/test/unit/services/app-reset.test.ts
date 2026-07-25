/**
 * Unit tests for unmountAllControllers (controller registry).
 *
 * The other reset functions (resetTabDragState, resetGridDragState, resetApp)
 * are tested via integration tests because they have circular import dependencies
 * with app.ts that make isolated unit testing impractical.
 */

import { describe, test, expect, vi } from "vitest";

// ── Mock TabController ─────────────────────────────────────────────────

class MockController {
  readonly tabId: string;
  readonly appType = "test";
  readonly unmount = vi.fn();
  readonly mount = vi.fn();
  readonly setVisible = vi.fn();
  readonly snapshot = vi.fn(() => ({}));
  readonly restore = vi.fn();

  constructor(tabId: string) {
    this.tabId = tabId;
  }
}

// ─── unmountAllControllers ───────────────────────────────────────────────

describe("unmountAllControllers", () => {
  test("unmounts all registered controllers and clears the registry", async () => {
    const registry = await import("@openp41ge/renderer/controllers/registry");

    const ctrl1 = new MockController("tab-1");
    const ctrl2 = new MockController("tab-2");

    registry.registerController(ctrl1);
    registry.registerController(ctrl2);

    expect(registry.getController("tab-1")).toBe(ctrl1);
    expect(registry.getController("tab-2")).toBe(ctrl2);

    registry.unmountAllControllers();

    // Both controllers should have been unmounted
    expect(ctrl1.unmount).toHaveBeenCalledOnce();
    expect(ctrl2.unmount).toHaveBeenCalledOnce();

    // Registry should be empty
    expect(registry.getController("tab-1")).toBeUndefined();
    expect(registry.getController("tab-2")).toBeUndefined();
  });

  test("is safe to call when registry is empty", async () => {
    const registry = await import("@openp41ge/renderer/controllers/registry");

    // Should not throw
    expect(() => registry.unmountAllControllers()).not.toThrow();
  });

  test("continues unmounting remaining controllers if one throws", async () => {
    const registry = await import("@openp41ge/renderer/controllers/registry");

    const ctrl1 = new MockController("tab-1");
    const ctrl2 = new MockController("tab-2");
    ctrl2.unmount.mockImplementation(() => {
      throw new Error("unmount failed");
    });
    const ctrl3 = new MockController("tab-3");

    registry.registerController(ctrl1);
    registry.registerController(ctrl2);
    registry.registerController(ctrl3);

    // Should not throw — errors during unmount are caught and logged
    expect(() => registry.unmountAllControllers()).not.toThrow();

    // All controllers should have been attempted
    expect(ctrl1.unmount).toHaveBeenCalledOnce();
    expect(ctrl2.unmount).toHaveBeenCalledOnce();
    expect(ctrl3.unmount).toHaveBeenCalledOnce();

    // Registry should be cleared regardless
    expect(registry.getController("tab-1")).toBeUndefined();
    expect(registry.getController("tab-3")).toBeUndefined();
  });
});
