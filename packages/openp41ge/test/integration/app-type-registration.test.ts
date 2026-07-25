/**
 * Integration tests for app type registration — verifying that
 * AppTypeRegistration entries correctly map type IDs to controller
 * factories, and that created controllers conform to the TabController
 * interface.
 */

import { describe, it, expect } from "vitest";
import { APP_TYPES, type AppTypeInfo } from "@openp41ge/renderer/app-types";
import { PlaceholderController } from "@openp41ge/renderer/controllers/placeholder-controller";
import type { TabController } from "@openp41ge/renderer/controllers/types";

// ─── Test helpers ─────────────────────────────────────────────────────────

/**
 * Simulates how the bootstrap step creates controllers:
 * Each app type ID maps to a CreateController function.
 * For now, all types use PlaceholderController.
 */
function createControllerForAppType(appTypeId: string, tabId: string): TabController {
  // This mirrors the logic in register-app-types.step.ts
  // In production, some types have dedicated controllers.
  // For now, all use PlaceholderController which proves lifecycle works.
  return new PlaceholderController(tabId, appTypeId);
}

describe("App type registration — integration", () => {
  describe("APP_TYPES registry contains expected entries", () => {
    it("has all required app types", () => {
      const ids = APP_TYPES.map((t) => t.id).sort();
      expect(ids).toContain("terminal");
      expect(ids).toContain("file-explorer");
      expect(ids).toContain("file-viewer");
      expect(ids).toContain("markdown");
      expect(ids).toContain("table");
      expect(ids).toContain("video");
    });

    it("each app type has all required fields", () => {
      for (const t of APP_TYPES) {
        expect(t.id).toBeTruthy();
        expect(t.label).toBeTruthy();
        expect(t.icon).toBeTruthy();
        expect(typeof t.description).toBe("string");
      }
    });

    it("has no duplicate IDs", () => {
      const ids = APP_TYPES.map((t) => t.id);
      const unique = new Set(ids);
      expect(unique.size).toBe(ids.length);
    });
  });

  describe("Controller factory from app type", () => {
    it("creates a PlaceholderController for terminal type", () => {
      const ctrl = createControllerForAppType("terminal", "t1");
      expect(ctrl).toBeInstanceOf(PlaceholderController);
      expect(ctrl.tabId).toBe("t1");
      expect(ctrl.appType).toBe("terminal");
    });

    it("created controller implements full TabController interface", () => {
      const ctrl = createControllerForAppType("file-viewer", "t2");
      const container = document.createElement("div");

      // mount
      ctrl.mount(container);
      expect(container.innerHTML).not.toBe("");

      // setVisible
      expect(() => ctrl.setVisible(true)).not.toThrow();
      expect(() => ctrl.setVisible(false)).not.toThrow();

      // snapshot
      const state = ctrl.snapshot();
      expect(typeof state).toBe("object");

      // restore
      expect(() => ctrl.restore({ restored: true })).not.toThrow();

      // unmount — controller clears its container reference
      // (DOM cleanup is managed by the grid, not the controller)
      ctrl.unmount();
      expect((ctrl as any).container).toBeNull();
    });

    it("all app types can produce working controllers", () => {
      for (const appType of APP_TYPES) {
        const ctrl = createControllerForAppType(appType.id, `tab-${appType.id}`);
        const container = document.createElement("div");

        expect(() => ctrl.mount(container)).not.toThrow();
        expect(container.innerHTML).not.toBe("");

        ctrl.unmount();
        expect((ctrl as any).container).toBeNull();
      }
    });
  });

  describe("App type label and icon rendering", () => {
    it("placeholder controller renders the correct label", () => {
      for (const appType of APP_TYPES) {
        const ctrl = createControllerForAppType(appType.id, "t1");
        const container = document.createElement("div");
        ctrl.mount(container);

        // The label should appear in the rendered output
        expect(container.textContent).toContain(appType.label);

        ctrl.unmount();
      }
    });

    it("controller mounts produce container with flex layout", () => {
      const ctrl = createControllerForAppType("terminal", "t-flex");
      const container = document.createElement("div");
      ctrl.mount(container);

      const innerDiv = container.firstElementChild as HTMLElement;
      expect(innerDiv).toBeDefined();
      expect(innerDiv.style.display).toBe("flex");

      ctrl.unmount();
    });
  });

  describe("App type info metadata", () => {
    it("file-viewer has the correct description", () => {
      const fv = APP_TYPES.find((t) => t.id === "file-viewer");
      expect(fv?.description).toContain("View file");
    });

    it("terminal has the correct label", () => {
      const term = APP_TYPES.find((t) => t.id === "terminal");
      expect(term?.label).toBe("Terminal");
    });
  });
});
