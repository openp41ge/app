/**
 * SettingsOpenHandler — handles opening a settings surface into the grid for
 * the `openp41ge:open-settings` event (sidebar gear menu).
 *
 * A settings tab is a pinned grid tab. Open-once: if a settings tab for the
 * same appType is already open in the window, it is activated instead of
 * duplicated; otherwise it opens in the last-active cell.
 */

import type { ICommandBus } from "../interfaces/command-bus";
import type { IWorkspaceStateManager } from "../interfaces/workspace-state-manager";
import type { Tab } from "../../layout/types";
import { createLogger } from "openp41ge-logger";
import { Openp41geTabsEventHandler } from "./openp41ge-tabs-event-handler";

const log = createLogger("openp41ge", "settings-open-handler");

export class SettingsOpenHandler {
  private _commandBus: ICommandBus | null = null;
  private _workspaceState: IWorkspaceStateManager | null = null;

  init(commandBus: ICommandBus, workspaceState: IWorkspaceStateManager): void {
    this._commandBus = commandBus;
    this._workspaceState = workspaceState;
  }

  handleOpenSettings(e: CustomEvent): void {
    const detail = (e.detail ?? {}) as { appType?: string; title?: string };
    const appType = detail.appType;
    if (!appType) return;

    const myWindowId = window.openp41ge.workspace.getWindowId();
    if (!myWindowId) {
      log.warn("open-settings skipped — no window context");
      return;
    }

    // Open-once: an existing settings tab for this appType is activated.
    const existingTabId = this._findSettingsTab(appType, myWindowId);
    if (existingTabId) {
      this._commandBus!.dispatch("activateTabInCell", myWindowId, existingTabId);
      return;
    }

    const targetCol = this._getLastActiveCellCol(myWindowId);
    const title = detail.title || appType.replace("-", " ");
    this._commandBus!.dispatch(
      "actionOpenFile",
      myWindowId,
      appType,
      title,
      "",
      targetCol,
      true,
      {},
    );
  }

  private _findSettingsTab(appType: string, windowId: string): string | null {
    const ws = this._workspaceState?.getWorkspace();
    if (!ws) return null;
    const win = ws.windows.find((w) => w.id === windowId);
    if (!win) return null;
    const tabs = ws.editorTabs as Record<string, Tab | undefined>;
    for (const placement of win.grid.placements) {
      for (const tabId of placement.tabIds) {
        const tab = tabs[tabId];
        if (tab && tab.appType === appType) return tabId;
      }
    }
    return null;
  }

  private _getLastActiveCellCol(windowId: string): number {
    const col = Openp41geTabsEventHandler.getLastFocusedCol(windowId);
    const ws = this._workspaceState?.getWorkspace();
    if (ws) {
      const win = ws.windows.find((w) => w.id === windowId);
      if (win) {
        const hasCol = win.grid.placements.some(
          (p) => p.position.row === 0 && p.position.col === col,
        );
        if (hasCol) return col;
        const fallback = win.grid.placements.find((p) => p.position.row === 0);
        if (fallback) return fallback.position.col;
      }
    }
    return 0;
  }
}
