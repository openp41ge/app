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
import { Openp41geTabsEventHandler } from "@openp41ge/renderer/services/openp41ge-tabs-event-handler";
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

/** Open a plain column/tab at the given column for grid-placement tests. */
function openColumn(bus: TestCommandBus, windowId: string, appType: string, col: number): void {
  bus.dispatch("addColumnTabAt", windowId, appType, `${appType}-${col}`, "", col);
}

/** Find the placement (cell) whose tab stack contains a tab of the given appType. */
function findPlacement(
  ws: ReturnType<OperationDispatcher["getWorkspace"]>,
  appType: string,
): { position: { row: number; col: number }; tabIds: string[] } | undefined {
  const win = ws.windows[0];
  return win.grid.placements.find((pl) =>
    pl.tabIds.some((tid) => ws.editorTabs[tid]?.appType === appType),
  );
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
    // Reset the shared last-focused-column record between tests.
    delete Openp41geTabsEventHandler.lastFocusedCol["win-ws1-0"];
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

  it("opens in a new column when only one tab is open in the grid", () => {
    openColumn(dispatch, "win-ws1-0", "terminal", 0);
    dispatchOpenSettings(handler, "file-editor-settings", "Editor");

    const ws = dispatcher.getWorkspace();
    const settings = findPlacement(ws, "file-editor-settings");
    const terminal = findPlacement(ws, "terminal");
    expect(settings).toBeDefined();
    expect(terminal).toBeDefined();
    expect(settings!.position.col).not.toBe(terminal!.position.col);
    expect(ws.windows[0].grid.placements).toHaveLength(2);
  });

  it("opens a new column even when the current column holds a file-viewer tab", () => {
    // Common layout: a single column holding a file editor + an agent chat.
    // Regression: `actionOpenFile` re-routes `targetCol === undefined` into any
    // cell containing a `file-viewer` tab, which used to stack settings into
    // this column instead of opening a fresh grid tab.
    dispatch.dispatch("actionOpenFile", "win-ws1-0", "file-viewer", "a.ts", "/a.ts", 0, true);
    dispatch.dispatch("actionOpenFile", "win-ws1-0", "agents", "Agent", "chat-1", 0, false, {
      chatId: "chat-1",
    });
    dispatchOpenSettings(handler, "agent", "Agent");

    const ws = dispatcher.getWorkspace();
    const settings = findPlacement(ws, "agent");
    const editor = findPlacement(ws, "file-viewer");
    expect(settings).toBeDefined();
    expect(editor).toBeDefined();
    expect(settings!.position.col).not.toBe(editor!.position.col);
    expect(ws.windows[0].grid.placements).toHaveLength(2);
  });

  it("opens in the next tab over when there is a tab to the right", () => {
    openColumn(dispatch, "win-ws1-0", "terminal", 0);
    openColumn(dispatch, "win-ws1-0", "terminal", 1);
    // Current tab is the left column; the next tab over is the right column.
    Openp41geTabsEventHandler.lastFocusedCol["win-ws1-0"] = 0;
    dispatchOpenSettings(handler, "file-editor-settings", "Editor");

    const ws = dispatcher.getWorkspace();
    const settings = findPlacement(ws, "file-editor-settings");
    expect(settings).toBeDefined();
    expect(settings!.position.col).toBe(1);
  });

  it("opens in the current tab when there is no next tab", () => {
    openColumn(dispatch, "win-ws1-0", "terminal", 0);
    openColumn(dispatch, "win-ws1-0", "terminal", 1);
    // Current tab is the right-most column; there is no tab after it.
    Openp41geTabsEventHandler.lastFocusedCol["win-ws1-0"] = 1;
    dispatchOpenSettings(handler, "file-editor-settings", "Editor");

    const ws = dispatcher.getWorkspace();
    const settings = findPlacement(ws, "file-editor-settings");
    expect(settings).toBeDefined();
    expect(settings!.position.col).toBe(1);
  });

  it("ignores an event with no appType", () => {
    handler.handleOpenSettings(new CustomEvent("openp41ge:open-settings", { detail: {} }));
    const ws = dispatcher.getWorkspace();
    expect(ws.windows[0].grid.placements).toHaveLength(0);
  });
});
