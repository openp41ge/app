/**
 * Integration tests for per-tab settings registration.
 *
 * Every sidebar tab owns its own settings surface. registerSystemTabType() must
 * also register that settings surface as a grid app type, so opening a tab's
 * settings grid tab works without a separate global settings registry.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  registerSystemTabType,
  getAppTypeRegistration,
  getSystemTabRegistration,
} from "@openp41ge/renderer/apps/app-registry";
import type {
  SystemTabRegistration,
  TabController,
  SystemTabController,
} from "@openp41ge/renderer/controllers/types";

/** Minimal system-tab controller used only in this test. */
class TestSystemController implements SystemTabController {
  readonly tabId: string;
  readonly appType = "test-tab";
  constructor(tabId: string) {
    this.tabId = tabId;
  }
  mount(_container: HTMLElement): void {}
  unmount(): void {}
}

/** Minimal settings controller used only in this test. */
class TestSettingsController implements TabController {
  readonly tabId: string;
  readonly appType = "test-settings";
  private _container: HTMLElement | null = null;
  constructor(tabId: string) {
    this.tabId = tabId;
  }
  mount(container: HTMLElement): void {
    this._container = container;
    const el = document.createElement("div");
    el.textContent = "test settings panel";
    container.appendChild(el);
  }
  unmount(): void {
    if (this._container) this._container.innerHTML = "";
    this._container = null;
  }
  setVisible(_visible: boolean): void {}
  snapshot(): Record<string, unknown> {
    return {};
  }
  restore(_state: Record<string, unknown>): void {}
}

const registration: SystemTabRegistration = {
  id: "test-tab",
  label: "Test Tab",
  icon: "T",
  description: "A tab with its own settings",
  defaultSide: "left",
  createController: (tabId) => new TestSystemController(tabId),
  settings: {
    appType: "test-settings",
    label: "Test Settings",
    icon: "S",
    description: "Test tab's settings",
    openEvent: "openp41ge:open-test-settings",
    createController: (tabId) => new TestSettingsController(tabId),
  },
};

describe("System tab settings registration — integration", () => {
  beforeEach(() => {
    registerSystemTabType(registration);
  });

  it("registers the settings surface as a grid app type", () => {
    const gridReg = getAppTypeRegistration("test-settings");
    expect(gridReg).toBeTruthy();
    expect(gridReg?.id).toBe("test-settings");
    expect(gridReg?.label).toBe("Test Settings");
    expect(gridReg?.icon).toBe("S");
    expect(gridReg?.description).toBe("Test tab's settings");
  });

  it("keeps the settings on the system tab registration", () => {
    const sysTab = getSystemTabRegistration("test-tab");
    expect(sysTab?.settings?.appType).toBe("test-settings");
    expect(sysTab?.settings?.openEvent).toBe("openp41ge:open-test-settings");
  });

  it("the settings grid controller mounts and renders", () => {
    const gridReg = getAppTypeRegistration("test-settings");
    const ctrl = gridReg?.createController("settings-tab-1");
    expect(ctrl).toBeTruthy();
    const container = document.createElement("div");
    ctrl!.mount(container);
    expect(container.textContent).toContain("test settings panel");
    ctrl!.unmount();
  });

  it("defaults the settings icon to a gear when not provided", () => {
    const bare: SystemTabRegistration = {
      id: "bare-tab",
      label: "Bare",
      icon: "B",
      description: "no icon",
      defaultSide: "right",
      createController: (tabId) => new TestSystemController(tabId),
      settings: {
        appType: "bare-settings",
        label: "Bare Settings",
        openEvent: "openp41ge:open-bare-settings",
        createController: (tabId) => new TestSettingsController(tabId),
      },
    };
    registerSystemTabType(bare);
    expect(getAppTypeRegistration("bare-settings")?.icon).toBe("⚙");
  });
});
