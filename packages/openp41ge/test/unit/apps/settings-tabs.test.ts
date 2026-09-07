/**
 * Unit tests for the settings grid tab controllers.
 *
 * Verifies each settings tab mounts the correct settings custom element and
 * exposes the TabController lifecycle (snapshot `{}`, safe restore).
 */

import { describe, it, expect } from "vitest";
import { FileEditorSettingsTabController } from "@openp41ge/renderer/apps/settings/file-editor-settings-tab";
import { AgentSettingsTabController } from "@openp41ge/renderer/apps/settings/agent-settings-tab";
import { LogsSettingsTabController } from "@openp41ge/renderer/apps/settings/logs-settings-tab";

describe("settings tab controllers", () => {
  it("mounts the file-editor settings element", () => {
    const ctrl = new FileEditorSettingsTabController("t1");
    const container = document.createElement("div");
    ctrl.mount(container);
    expect(container.querySelector("openp41ge-file-editor-settings")).not.toBeNull();
    ctrl.unmount();
    expect((ctrl as unknown as { _container: HTMLElement | null })._container).toBeNull();
  });

  it("mounts the agent settings element", () => {
    const ctrl = new AgentSettingsTabController("t2");
    const container = document.createElement("div");
    ctrl.mount(container);
    expect(container.querySelector("openp41ge-agent-settings")).not.toBeNull();
    ctrl.unmount();
  });

  it("mounts the logs settings element", () => {
    const ctrl = new LogsSettingsTabController("t4");
    const container = document.createElement("div");
    ctrl.mount(container);
    expect(container.querySelector("openp41ge-logs-settings")).not.toBeNull();
    ctrl.unmount();
  });

  it("exposes empty snapshot and safe restore (settings live in config, not the tab)", () => {
    const ctrl = new FileEditorSettingsTabController("t3");
    expect(ctrl.appType).toBe("file-editor-settings");
    expect(ctrl.snapshot()).toEqual({});
    expect(() => ctrl.restore({})).not.toThrow();
    expect(() => ctrl.setVisible(false)).not.toThrow();
  });
});
