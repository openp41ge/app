/**
 * LogOpenHandler — handles opening a log system into the grid for the
 * `openp41ge:open-log-system` event (Logs sidebar rows).
 *
 * Mirrors FileOpenHandler/AgentsOpenHandler's preview model:
 *   - unpinned: single-click opens an unpinned preview log-viewer tab.
 *   - pinned: second click / double-click pins it (permanent).
 *   - An existing log-viewer tab for the same system in the target cell is
 *     activated instead of duplicating (open-once within a window).
 *
 * The opened tab gets `config.system = <system>` so LogViewerController
 * scopes the rendered output to that system (and groups its streams).
 */

import type { ICommandBus } from "../interfaces/command-bus";
import type { IWorkspaceStateManager } from "../interfaces/workspace-state-manager";
import type { Tab } from "../../layout/types";
import { createLogger } from "openp41ge-logger";
import { Openp41geTabsEventHandler } from "./openp41ge-tabs-event-handler";

const log = createLogger("openp41ge", "log-open-handler");

export class LogOpenHandler {
  private _commandBus: ICommandBus | null = null;
  private _workspaceState: IWorkspaceStateManager | null = null;

  init(commandBus: ICommandBus, workspaceState: IWorkspaceStateManager): void {
    this._commandBus = commandBus;
    this._workspaceState = workspaceState;
  }

  handleOpenLogSystem(e: CustomEvent): void {
    const detail = (e.detail ?? {}) as {
      system?: string;
      title?: string;
      pinned?: boolean;
      mode?: string;
      col?: number;
    };
    const system = detail.system;
    if (!system) return;

    let pinned: boolean;
    if (typeof detail.pinned === "boolean") {
      pinned = detail.pinned;
    } else {
      pinned = (detail.mode || "preview") !== "preview";
    }

    const myWindowId = window.openp41ge.workspace.getWindowId();
    if (!myWindowId) {
      log.warn("open-log-system skipped — no window context");
      return;
    }
    const targetCol = detail.col !== undefined ? detail.col : this._getLastActiveCellCol();

    // Step 1: an existing log-viewer tab for this system in the target cell →
    // activate it; a second click on the same preview promotes it to pinned.
    const existingTabId = this._findLogTabInCell(system, targetCol);
    if (existingTabId) {
      const tab = this._getTab(existingTabId);
      if (tab && tab.isPreview && pinned) {
        log.info("pin log preview via second click", existingTabId);
        this._commandBus!.dispatch("pinTabInCell", myWindowId, targetCol, existingTabId);
      } else {
        log.info("activate existing log tab", existingTabId);
        this._commandBus!.dispatch("activateTabInCell", myWindowId, existingTabId);
      }
      return;
    }

    // Step 2: open a preview (replaces the cell's preview slot when unpinned)
    // or a permanent log-viewer tab scoped to the system.
    const title = detail.title || system;
    log.info("open log tab", system, pinned ? "pinned" : "unpinned");
    this._commandBus!.dispatch(
      "actionOpenFile",
      myWindowId,
      "log-viewer",
      title,
      "",
      targetCol,
      pinned,
      { system },
    );
  }

  private _getLastActiveCellCol(): number {
    const myWindowId = window.openp41ge.workspace.getWindowId();
    if (!myWindowId) return 0;
    const col = Openp41geTabsEventHandler.getLastFocusedCol(myWindowId);
    const ws = this._workspaceState?.getWorkspace();
    if (ws) {
      const win = ws.windows.find((w) => w.id === myWindowId);
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

  private _findLogTabInCell(system: string, col: number): string | null {
    const ws = this._workspaceState?.getWorkspace();
    if (!ws) return null;
    const myWindowId = window.openp41ge.workspace.getWindowId();
    const win = ws.windows.find((w) => w.id === myWindowId);
    if (!win) return null;

    const pl = win.grid.placements.find((p) => p.position.row === 0 && p.position.col === col);
    if (!pl) return null;

    const tabs = ws.editorTabs as Record<string, Tab | undefined>;
    for (const tabId of pl.tabIds) {
      const tab = tabs[tabId];
      if (tab && tab.appType === "log-viewer" && tab.config?.system === system) {
        return tabId;
      }
    }
    return null;
  }

  private _getTab(tabId: string): Tab | null {
    const ws = this._workspaceState?.getWorkspace();
    if (!ws) return null;
    const tabs = ws.editorTabs as Record<string, Tab | undefined>;
    return tabs[tabId] ?? null;
  }
}
