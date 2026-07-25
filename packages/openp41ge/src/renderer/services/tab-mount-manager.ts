/**
 * TabMountManager — manages controller lifecycle for tab content.
 *
 * Controllers are mounted into `<tab-grid>` via its built-in `mountController`
 * API, which places them into `<tab-content>` controller slots. The
 * `<tab-content>` component handles show/hide based on `activeTabId`, so
 * no MutationObserver or manual injection is needed.
 *
 * Lifecycle per tab:
 *   createController → grid.mountController(tabId, container) → sync shows/hides
 */

import { getAppTypeRegistration } from "../apps/app-registry";
import type { TabController } from "../controllers/types";
import type { Workspace, Tab } from "../../layout/types";
import type { TabGrid } from "../openp41ge-tabs-adapter";

interface MountEntry {
  controller: TabController;
  container: HTMLElement;
}

export class TabMountManager {
  /** tabId → controller + container */
  private _mounts = new Map<string, MountEntry>();

  /** Lookup function imported directly — reads from window-shared Map. */
  private _getRegistration = getAppTypeRegistration;

  /**
   * Sync controller containers with the current workspace state.
   * Call after every grid render (from SubscribeStateUpdatesStep).
   */
  sync(workspace: Workspace, windowId: string): void {
    const win = workspace.windows.find((w) => w.id === windowId);
    if (!win) return;

    const grid = this._findGrid();

    const allCurrentTabIds = new Set<string>();

    // Track which columns have active controllers (for legacy tab-view hiding)
    const controlledCols = new Set<number>();

    for (const placement of win.grid.placements) {
      const col = placement.position.col;
      const activeTabId = placement.activeTabId ?? placement.tabIds[0] ?? "";

      for (const tabId of placement.tabIds) {
        allCurrentTabIds.add(tabId);
        const tab = workspace.tabs[tabId as keyof typeof workspace.tabs] as Tab | undefined;
        if (!tab) continue;

        const entry = this._getOrCreateEntry(tab, workspace);
        if (!entry) continue;

        // Mount the controller container
        if (grid) {
          grid.mountController(tabId, entry.container);
        } else {
          // Legacy: inject into grid cell directly
          this._injectIntoCell(entry.container, col);
        }

        // Show/hide based on active state
        const isActive = tabId === activeTabId;
        entry.container.style.display = isActive ? "" : "none";
        if (isActive) {
          entry.controller.setVisible(true);
          controlledCols.add(col);
        } else {
          entry.controller.setVisible(false);
        }
      }
    }

    // Legacy: hide tab-view for columns with controllers
    if (!grid) {
      for (const col of controlledCols) {
        const cell = this._findGridCell(col);
        if (!cell) continue;
        const tabView = cell.querySelector(":scope > tab-view");
        if (tabView instanceof HTMLElement) {
          tabView.style.display = "none";
        }
      }
    }

    // Remove tabs that no longer exist
    this._removeOrphans(allCurrentTabIds);
  }

  /**
   * Get a controller for a tab ID, creating it if needed.
   */
  getController(tabId: string): TabController | undefined {
    return this._mounts.get(tabId)?.controller;
  }

  /**
   * Show the container for a specific tab (called on grid-activate).
   * Hides siblings in the same parent, shows the target tab.
   * The <tab-content> handles this via activeTabId when available,
   * but this method provides immediate feedback before the next sync.
   */
  activateTab(tabId: string): void {
    const entry = this._mounts.get(tabId);
    if (!entry) return;

    // Hide siblings in the same parent
    const parent = entry.container.parentElement;
    if (parent) {
      for (const child of parent.children) {
        if (child instanceof HTMLElement && child !== entry.container) {
          child.style.display = "none";
        }
      }
    }

    entry.container.style.display = "";
    entry.controller.setVisible(true);
  }

  /**
   * Clean up all mounts (on destroy).
   */
  destroy(): void {
    for (const [, entry] of this._mounts) {
      entry.controller.unmount();
      entry.container.remove();
    }
    this._mounts.clear();
  }

  // ── Private helpers ─────────────────────────────────────────────

  /** Legacy: inject container into a grid cell. Used when <tab-grid> isn't available. */
  private _injectIntoCell(container: HTMLElement, col: number): void {
    const cell = this._findGridCell(col);
    if (!cell) return;
    if (container.parentElement !== cell) {
      cell.appendChild(container);
    }
  }

  /** Legacy: find a grid cell element. */
  private _findGridCell(col: number): HTMLElement | null {
    const gridArea = document.querySelector(".openp41ge-grid-area");
    if (!gridArea) return null;
    const grid = gridArea.querySelector("tab-grid");
    if (!grid) return null;
    return grid.querySelector(`.grid-cell[data-cell-col="${col}"]`);
  }

  private _findGrid(): TabGrid | null {
    const grid = document.querySelector("tab-grid");
    if (!grid) return null;
    // Verify the grid supports controller mounting
    const tg = grid as unknown as TabGrid;
    if (typeof tg.mountController !== "function") return null;
    return tg;
  }

  private _getOrCreateEntry(tab: Tab, _workspace: Workspace): MountEntry | undefined {
    const existing = this._mounts.get(tab.id);
    if (existing) return existing;

    const reg = this._getRegistration(tab.appType);
    if (!reg) return undefined;

    const controller = reg.createController(tab.id);

    // Restore saved state if available
    if (tab.config && typeof tab.config === "object") {
      const config = tab.config as Record<string, unknown>;
      controller.restore({ ...config });
    }

    const container = document.createElement("div");
    container.dataset.tabId = tab.id;
    container.style.cssText = [
      "flex:1",
      "min-height:0",
      "overflow:hidden",
      "position:relative",
    ].join(";");

    controller.mount(container);

    const entry: MountEntry = { controller, container };
    this._mounts.set(tab.id, entry);
    return entry;
  }

  private _removeOrphans(currentTabIds: Set<string>): void {
    for (const [tabId, entry] of this._mounts) {
      if (!currentTabIds.has(tabId)) {
        entry.controller.unmount();
        entry.container.remove();
        this._mounts.delete(tabId);
      }
    }
  }
}
