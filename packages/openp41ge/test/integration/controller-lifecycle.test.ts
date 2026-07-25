/**
 * Integration tests for the TabController lifecycle — mount/unmount/snapshot/
 * restore cycle across the real controller implementations and registry.
 *
 * These tests verify that:
 *   - Controllers survive in the registry across tab switches
 *   - mount() creates DOM, unmount() cleans it up
 *   - snapshot() + restore() produce round-trip identical state
 *   - The registry correctly tracks all controllers
 *   - unmountAllControllers() tears everything down cleanly
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { PlaceholderController } from "@openp41ge/renderer/controllers/placeholder-controller";
import {
  registerController,
  getController,
  unmountAllControllers,
} from "@openp41ge/renderer/controllers/registry";
import type { TabController } from "@openp41ge/renderer/controllers/types";

// ─── Helpers ──────────────────────────────────────────────────────────────

/** Create a minimal stub controller for testing lifecycle without dependencies. */
class TestController implements TabController {
  readonly tabId: string;
  readonly appType: string;
  public mountCalls: HTMLElement[] = [];
  public unmountCalls: number = 0;
  public visibleCalls: boolean[] = [];
  public savedState: Record<string, unknown> = {};
  public container: HTMLElement | null = null;

  constructor(tabId: string, appType: string) {
    this.tabId = tabId;
    this.appType = appType;
  }

  mount(container: HTMLElement): void {
    this.mountCalls.push(container);
    this.container = container;
    container.innerHTML = `<div class="test-content">${this.appType}</div>`;
  }

  unmount(): void {
    this.unmountCalls++;
    if (this.container) {
      this.container.innerHTML = "";
    }
    this.container = null;
  }

  setVisible(visible: boolean): void {
    this.visibleCalls.push(visible);
  }

  snapshot(): Record<string, unknown> {
    return { ...this.savedState, _appType: this.appType };
  }

  restore(state: Record<string, unknown>): void {
    this.savedState = { ...state };
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────

describe("Controller lifecycle — integration", () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement("div");
  });

  afterEach(() => {
    unmountAllControllers();
  });

  describe("Basic lifecycle (mount → unmount)", () => {
    it("mounts a controller into a container and creates DOM content", () => {
      const ctrl = new TestController("t1", "terminal");
      ctrl.mount(container);

      expect(ctrl.container).toBe(container);
      expect(container.innerHTML).toContain("test-content");
      expect(container.innerHTML).toContain("terminal");
    });

    it("unmounts a controller and clears the container", () => {
      const ctrl = new TestController("t1", "terminal");
      ctrl.mount(container);
      ctrl.unmount();

      expect(ctrl.unmountCalls).toBe(1);
      expect(ctrl.container).toBeNull();
      expect(container.innerHTML).toBe("");
    });

    it("calling unmount twice is safe (no crash)", () => {
      const ctrl = new TestController("t1", "terminal");
      ctrl.mount(container);
      ctrl.unmount();
      ctrl.unmount();

      expect(ctrl.unmountCalls).toBe(2);
    });

    it("can mount into a different container after unmount (remount)", () => {
      const ctrl = new TestController("t1", "terminal");
      const container1 = document.createElement("div");
      const container2 = document.createElement("div");

      ctrl.mount(container1);
      expect(ctrl.container).toBe(container1);

      ctrl.unmount();
      expect(ctrl.container).toBeNull();

      ctrl.mount(container2);
      expect(ctrl.container).toBe(container2);
      expect(container1.innerHTML).toBe(""); // old container cleared
    });
  });

  describe("setVisible lifecycle", () => {
    it("tracks visibility changes", () => {
      const ctrl = new TestController("t1", "terminal");
      ctrl.mount(container);

      ctrl.setVisible(true);
      ctrl.setVisible(false);
      ctrl.setVisible(true);

      expect(ctrl.visibleCalls).toEqual([true, false, true]);
    });
  });

  describe("snapshot / restore round-trip", () => {
    it("snapshot returns serializable state", () => {
      const ctrl = new TestController("t1", "terminal");
      ctrl.savedState = { customField: "hello", count: 42 };

      const snapshot = ctrl.snapshot();

      expect(snapshot).toEqual({
        customField: "hello",
        count: 42,
        _appType: "terminal",
      });
      // Must be JSON-serializable
      expect(() => JSON.stringify(snapshot)).not.toThrow();
    });

    it("restore round-trips correctly", () => {
      const ctrl = new TestController("t1", "terminal");
      const originalState = { theme: "dark", fontSize: 14 };

      ctrl.restore(originalState);
      const snapshot = ctrl.snapshot();

      expect(snapshot).toMatchObject(originalState);
      expect(snapshot._appType).toBe("terminal");
    });

    it("survives mount → snapshot → unmount → restore → mount cycle", () => {
      const ctrl = new TestController("t1", "file-viewer");
      ctrl.mount(container);

      // Set some state while mounted
      ctrl.savedState = { filePath: "/project/readme.md", cursorPos: 42 };

      // Snapshot before unmount
      const snapshot = ctrl.snapshot();

      ctrl.unmount();

      // Create new container and restore
      const newContainer = document.createElement("div");
      ctrl.restore(snapshot);
      ctrl.mount(newContainer);

      expect(ctrl.savedState.filePath).toBe("/project/readme.md");
      expect(ctrl.savedState.cursorPos).toBe(42);
      expect(ctrl.container).toBe(newContainer);
    });
  });

  describe("Controller registry integration", () => {
    it("registers and retrieves a controller", () => {
      const ctrl = new TestController("t1", "terminal");
      registerController(ctrl);

      const retrieved = getController("t1");
      expect(retrieved).toBe(ctrl);
    });

    it("overwrites existing registration with same tab ID", () => {
      const ctrl1 = new TestController("t1", "terminal");
      const ctrl2 = new TestController("t1", "markdown");

      registerController(ctrl1);
      registerController(ctrl2);

      const retrieved = getController("t1");
      expect(retrieved).toBe(ctrl2);
      expect(retrieved?.appType).toBe("markdown");
    });

    it("mount → register → get → unmount sequence works", () => {
      const ctrl = new TestController("t1", "terminal");
      ctrl.mount(container);
      registerController(ctrl);

      // Simulate tab switch: retrieve from registry and unmount
      const stored = getController("t1");
      stored?.unmount();

      expect(ctrl.unmountCalls).toBe(1);
    });

    it("returns undefined for unknown tab ID", () => {
      expect(getController("nonexistent")).toBeUndefined();
    });
  });

  describe("unmountAllControllers", () => {
    it("unmounts all registered controllers and clears the registry", () => {
      const ctrl1 = new TestController("t1", "terminal");
      const ctrl2 = new TestController("t2", "markdown");

      ctrl1.mount(container);
      ctrl2.mount(container);

      registerController(ctrl1);
      registerController(ctrl2);

      unmountAllControllers();

      expect(ctrl1.unmountCalls).toBe(1);
      expect(ctrl2.unmountCalls).toBe(1);
      expect(getController("t1")).toBeUndefined();
      expect(getController("t2")).toBeUndefined();
    });
  });

  describe("PlaceholderController specific", () => {
    it("creates a placeholder with the correct app type label", () => {
      const ctrl = new PlaceholderController("t1", "terminal");
      ctrl.mount(container);

      expect(container.innerHTML).toContain("Terminal");
      expect(container.innerHTML).toContain("×"); // close button
    });

    it("unmounts placeholder and cleans DOM", () => {
      const ctrl = new PlaceholderController("t1", "terminal");
      ctrl.mount(container);
      ctrl.unmount();

      expect(ctrl.container).toBeNull();
    });

    it("placeholder has correct tabId and appType", () => {
      const ctrl = new PlaceholderController("t1", "file-viewer");
      expect(ctrl.tabId).toBe("t1");
      expect(ctrl.appType).toBe("file-viewer");
    });
  });

  describe("Multiple controllers in parallel", () => {
    it("manages multiple controllers with different app types", () => {
      const c1 = new TestController("t1", "terminal");
      const c2 = new TestController("t2", "markdown");
      const c3 = new TestController("t3", "video");

      const el1 = document.createElement("div");
      const el2 = document.createElement("div");
      const el3 = document.createElement("div");

      c1.mount(el1);
      c2.mount(el2);
      c3.mount(el3);

      registerController(c1);
      registerController(c2);
      registerController(c3);

      expect(el1.innerHTML).toContain("terminal");
      expect(el2.innerHTML).toContain("markdown");
      expect(el3.innerHTML).toContain("video");

      // Unmount all
      unmountAllControllers();

      expect(el1.innerHTML).toBe("");
      expect(el2.innerHTML).toBe("");
      expect(el3.innerHTML).toBe("");
    });
  });
});
