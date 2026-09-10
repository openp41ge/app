/**
 * SettingsOpenHandler — handles opening a settings surface into the grid for
 * the `openp41ge:open-settings` event (sidebar gear menu).
 *
 * A settings tab is a pinned grid tab. Open-once: if a settings tab for the
 * same appType is already open in the window, it is activated instead of
 * duplicated.
 *
 * Placement follows three grid-state rules (single-row, column-based grid):
 *   - Only 1 tab (occupied column) open in the grid → open in a new tab.
 *   - A next tab exists (next occupied column to the right) → open in it.
 *   - No next tab (current column is the right-most) → open in the current tab.
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

    const targetCol = this._resolveTargetCol(myWindowId);
    const title = detail.title || appType.replace("-", " ");
    if (targetCol === undefined) {
      // Opening in a brand-new grid tab. Dispatch `addColumnTab` directly so we
      // don't go through `actionOpenFile`'s `undefined`-target fallback, which
      // would re-route the settings tab into an existing file-viewer column
      // (stacking it) instead of creating a fresh column.
      this._commandBus!.dispatch("addColumnTab", myWindowId, appType, title, "");
    } else {
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

  /**
   * Decide which grid column a settings tab should open in, per the sidebar-
   * gear placement rules:
   *   - Only 1 tab (occupied column) open in the grid → open in a new tab.
   *   - A next tab exists (next occupied column to the right of the current
   *     one) → open in that next tab over.
   *   - No next tab (current column is the right-most occupied one) → open in
   *     the current tab.
   *
   * Returns `undefined` to mean "open in a fresh grid tab" (the caller
   * dispatches `addColumnTab` to create a brand-new column), or a concrete
   * column index to open in.
   */
  private _resolveTargetCol(windowId: string): number | undefined {
    const ws = this._workspaceState?.getWorkspace();
    if (!ws) return undefined;
    const win = ws.windows.find((w) => w.id === windowId);
    if (!win) return undefined;

    // Single-row, column-based grid: collect the occupied columns in order.
    const occupiedCols = win.grid.placements
      .filter((p) => p.position.row === 0 && p.tabIds.length > 0)
      .map((p) => p.position.col)
      .sort((a, b) => a - b);

    // Only 1 tab (or none) open in the grid → open in a brand-new tab.
    if (occupiedCols.length <= 1) return undefined;

    // The current tab is the last-focused column, validated against the grid
    // and falling back to the first occupied column if it is stale.
    let currentCol = Openp41geTabsEventHandler.getLastFocusedCol(windowId);
    if (!occupiedCols.includes(currentCol)) {
      currentCol = occupiedCols[0];
    }

    // There is a next tab over → open in it.
    const nextCol = occupiedCols.find((c) => c > currentCol);
    if (nextCol !== undefined) return nextCol;

    // No next tab → open in the current tab.
    return currentCol;
  }
}
