/**
 * Integration tests for LogOpenHandler — connects the `openp41ge:open-log-system`
 * event (Logs sidebar rows) to workspace dispatch.
 *
 * Wires the real LogOpenHandler, CommandBus, and OperationDispatcher to verify a
 * system opens a system-scoped log-viewer tab, and that the same system isn't
 * duplicated (open-once within a window).
 */

import { describe, it, expect, beforeEach } from "vitest";
import { LogOpenHandler } from "@openp41ge/renderer/services/log-open-handler";
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
    // Mirror the live app: keep the workspace state manager in sync so the
    // handler's open-once lookup sees tabs created by earlier dispatches.
    this._workspaceState.setState(this._dispatcher.getWorkspace());
  }
}

function dispatchOpenSystem(handler: LogOpenHandler, system: string, pinned = true): void {
  handler.handleOpenLogSystem(
    new CustomEvent("openp41ge:open-log-system", {
      detail: { system, title: system, pinned },
    }),
  );
}

function findLogTabs(ws: ReturnType<OperationDispatcher["getWorkspace"]>): string[] {
  const win = ws.windows[0];
  const tabs: string[] = [];
  for (const pl of win.grid.placements) {
    for (const tabId of pl.tabIds) {
      if (ws.editorTabs[tabId]?.appType === "log-viewer") tabs.push(tabId);
    }
  }
  return tabs;
}

describe("LogOpenHandler wiring", () => {
  let handler: LogOpenHandler;
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
    handler = new LogOpenHandler();
    handler.init(dispatch, workspaceState);
  });

  it("opens a system-scoped log-viewer tab", () => {
    dispatchOpenSystem(handler, "openp41ge");

    const ws = dispatcher.getWorkspace();
    const tabIds = findLogTabs(ws);
    expect(tabIds).toHaveLength(1);
    const tab = ws.editorTabs[tabIds[0]];
    expect(tab.appType).toBe("log-viewer");
    expect(tab.config?.system).toBe("openp41ge");
    expect(tab.title).toBe("openp41ge");
    expect(tab.isPreview).toBe(false); // pinned per-system tab
  });

  it("opens a separate tab for a second system (does not replace the first)", () => {
    dispatchOpenSystem(handler, "openp41ge");
    dispatchOpenSystem(handler, "openp41ge-terminal");

    const ws = dispatcher.getWorkspace();
    const tabIds = findLogTabs(ws);
    const systems = tabIds.map((id) => ws.editorTabs[id].config?.system);
    expect(systems).toEqual(["openp41ge", "openp41ge-terminal"]);
  });

  it("activates an existing tab instead of duplicating the same system", () => {
    dispatchOpenSystem(handler, "openp41ge");
    dispatchOpenSystem(handler, "openp41ge");

    const ws = dispatcher.getWorkspace();
    expect(findLogTabs(ws)).toHaveLength(1);
  });
});
