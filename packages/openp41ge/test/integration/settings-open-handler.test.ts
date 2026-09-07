/**
 * Integration tests for SettingsOpenHandler — connects the `openp41ge:open-settings`
 * event (sidebar gear menu) to workspace dispatch.
 *
 * Wires the real SettingsOpenHandler, CommandBus, and OperationDispatcher to
 * verify a settings surface opens a pinned grid tab, and that the same appType
 * isn't duplicated (open-once within a window).
 */

import { describe, it, expect, beforeEach } from "vitest";
import { SettingsOpenHandler } from "@openp41ge/renderer/services/settings-open-handler";
import { WorkspaceStateManager } from "@openp41ge/renderer/services/workspace-state-manager";
import { OperationDispatcher } from "@openp41ge/main/services/operation-dispatcher";
import type { ICommandBus } from "@openp41ge/renderer/interfaces/command-bus";

class TestCommandBus implements ICommandBus {
  private _dispatcher: OperationDispatcher;
  private _workspaceState: WorkspaceStateManager;
  constructor(dispatcher: OperationDispatcher, workspaceState: WorkspaceStateManager) {
    this._dispatcher = dispatcher;
    this._workspaceState = workspaceState;
  }
  dispatch(fn: string, ...args: unknown[]): void {
    this._dispatcher.apply(fn, args);
    // Keep the workspace state in sync so the handler's open-once lookup sees
    // tabs created by earlier dispatches.
    this._workspaceState.setState(this._dispatcher.getWorkspace());
  }
}

function dispatchOpenSettings(
  handler: SettingsOpenHandler,
  appType: string,
  title: string = appType,
): void {
  handler.handleOpenSettings(
    new CustomEvent("openp41ge:open-settings", { detail: { appType, title } }),
  );
}

function findSettingsTabs(
  ws: ReturnType<OperationDispatcher["getWorkspace"]>,
  appType: string,
): string[] {
  const win = ws.windows[0];
  const tabs: string[] = [];
  for (const pl of win.grid.placements) {
    for (const tabId of pl.tabIds) {
      if (ws.editorTabs[tabId]?.appType === appType) tabs.push(tabId);
    }
  }
  return tabs;
}

describe("SettingsOpenHandler wiring", () => {
  let handler: SettingsOpenHandler;
  let dispatch: TestCommandBus;
  let dispatcher: OperationDispatcher;
  let workspaceState: WorkspaceStateManager;

  beforeEach(() => {
    (window as unknown as Record<string, unknown>).openp41ge = {
      workspace: { getWindowId: () => "win-ws1-0" },
    };
    dispatcher = new OperationDispatcher();
    workspaceState = new WorkspaceStateManager();
    workspaceState.setState(dispatcher.getWorkspace());
    dispatch = new TestCommandBus(dispatcher, workspaceState);
    handler = new SettingsOpenHandler();
    handler.init(dispatch, workspaceState);
  });

  it("opens a pinned settings grid tab", () => {
    dispatchOpenSettings(handler, "file-editor-settings", "Editor");

    const ws = dispatcher.getWorkspace();
    const tabIds = findSettingsTabs(ws, "file-editor-settings");
    expect(tabIds).toHaveLength(1);
    const tab = ws.editorTabs[tabIds[0]];
    expect(tab.appType).toBe("file-editor-settings");
    expect(tab.title).toBe("Editor");
    expect(tab.isPreview).toBe(false); // settings tabs are pinned
  });

  it("opens a separate tab for a different settings surface", () => {
    dispatchOpenSettings(handler, "file-editor-settings", "Editor");
    dispatchOpenSettings(handler, "agent", "Agent");

    const ws = dispatcher.getWorkspace();
    const ids = findSettingsTabs(ws, "file-editor-settings");
    const agentIds = findSettingsTabs(ws, "agent");
    expect(ids).toHaveLength(1);
    expect(agentIds).toHaveLength(1);
  });

  it("activates an existing tab instead of duplicating the same settings", () => {
    dispatchOpenSettings(handler, "file-editor-settings", "Editor");
    dispatchOpenSettings(handler, "file-editor-settings", "Editor");

    const ws = dispatcher.getWorkspace();
    expect(findSettingsTabs(ws, "file-editor-settings")).toHaveLength(1);
  });

  it("ignores an event with no appType", () => {
    handler.handleOpenSettings(new CustomEvent("openp41ge:open-settings", { detail: {} }));
    const ws = dispatcher.getWorkspace();
    expect(ws.windows[0].grid.placements).toHaveLength(0);
  });
});
