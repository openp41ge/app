/**
 * Cell-level tab operations — preview slot management, pinning, preview replacement.
 *
 * Owned by the Openp41ge platform. Preview tab logic lives here, not in individual
 * pane-type packages (openp41ge-file-editor, openp41ge-git-repository, etc.).
 *
 * Key concepts:
 *   - Each cell has at most one preview slot (a tab with isPreview=true)
 *   - Open with pinned=true → creates a regular tab, doesn't touch the preview slot
 *   - Open with pinned=false → interacts with the preview slot (fills or replaces)
 *   - Dragging a tab always pins it (drag = intentional)
 */

import type { Workspace, Tab, TabId } from "./types.js";
import { makeTabId, mapGridInWindow } from "./common.js";
import { registerTab, addTabToCell } from "./tab-operations.js";
import { resizeGrid } from "./grid-operations.js";
import { createTab } from "./types.js";

/**
 * Open a tab in a cell, respecting the preview slot.
 *
 * @param pinned - If true, the tab is added as a regular tab (preview slot untouched).
 *                 If false, the tab replaces the existing preview slot occupant (if any),
 *                 or becomes the new preview slot occupant.
 * @returns The workspace with the tab opened.
 */
export function openTabInCell(
  workspace: Workspace,
  windowId: string,
  appType: string,
  title: string,
  filePath?: string,
  targetCol?: number,
  pinned: boolean = true,
  config?: Record<string, unknown>,
): Workspace {
  const tabId = makeTabId();
  const mergedConfig: Record<string, unknown> = { ...config };
  if (filePath) mergedConfig.filePath = filePath;
  const tab = createTab(tabId, appType, title, mergedConfig, !pinned);
  let result = registerTab(workspace, tab);

  // Determine target column
  const col = targetCol ?? 0;

  // Ensure grid has enough columns
  const win = result.windows.find((w) => w.id === windowId);
  if (win && col >= win.grid.cols) {
    result = resizeGrid(result, windowId, 1, col + 1);
  }

  if (pinned) {
    // Pinned: add as regular tab, don't touch preview slot
    return addTabToCell(result, windowId, tab, 0, col);
  }

  // Unpinned: interact with preview slot
  const existingPreviewTabId = findPreviewTabInCell(result, windowId, col);
  if (existingPreviewTabId) {
    // Replace existing preview tab
    return replaceTabInCell(result, windowId, col, existingPreviewTabId, tab);
  }

  // No preview in this cell — create new tab and mark as preview
  return addTabToCell(result, windowId, tab, 0, col);
}

/**
 * Pin a preview tab — remove its preview status so it becomes a regular tab.
 */
export function pinTabInCell(
  workspace: Workspace,
  windowId: string,
  cellCol: number,
  tabId: string,
): Workspace {
  return updateTabInCell(workspace, windowId, cellCol, tabId, { isPreview: false });
}

/**
 * Find the preview tab in a specific cell, or null if none.
 */
export function findPreviewTabInCell(
  workspace: Workspace,
  windowId: string,
  col: number,
): string | null {
  const win = workspace.windows.find((w) => w.id === windowId);
  if (!win) return null;

  const pl = win.grid.placements.find((p) => p.position.row === 0 && p.position.col === col);
  if (!pl) return null;

  for (const tabId of pl.tabIds) {
    const tab = workspace.tabs[tabId as TabId];
    if (tab && tab.isPreview) {
      return tabId as string;
    }
  }
  return null;
}

// ── Internal helpers ─────────────────────────────────────────────────────

/**
 * Replace a tab in a cell with a new tab. The old tab is removed from
 * the workspace, the new tab is registered and added at the same position.
 */
function replaceTabInCell(
  workspace: Workspace,
  windowId: string,
  col: number,
  oldTabId: string,
  newTab: Tab,
): Workspace {
  // Register the new tab
  let result = workspace;
  if (!result.tabs[newTab.id as TabId]) {
    result = registerTab(result, newTab);
  }

  // Replace in-place in the placement: swap oldTabId for newTab.id.
  // Do NOT use removeTabFromCell which would compact the grid and shift
  // other placements — we just swap the tab ID in the placement directly.
  result = mapGridInWindow(result, windowId, (grid) => ({
    ...grid,
    placements: grid.placements.map((pl) => {
      if ((pl.tabIds as string[]).includes(oldTabId)) {
        return {
          ...pl,
          tabIds: (pl.tabIds as TabId[]).map((id) => (id === oldTabId ? (newTab.id as TabId) : id)),
          activeTabId: newTab.id as TabId,
        };
      }
      return pl;
    }),
  }));

  // Remove the old tab from workspace registry
  const oldTid = oldTabId as TabId;
  if (result.tabs[oldTid]) {
    const { [oldTid]: _removed, ...remainingTabs } = result.tabs;
    result = { ...result, tabs: remainingTabs };
  }

  return result;
}

/**
 * Update a tab's fields in place in the workspace state.
 */
function updateTabInPlace(
  workspace: Workspace,
  tabId: string,
  updates: Partial<Pick<Tab, "isPreview" | "title" | "config">>,
): Workspace {
  const existing = workspace.tabs[tabId as TabId];
  if (!existing) return workspace;
  return {
    ...workspace,
    tabs: {
      ...workspace.tabs,
      [tabId as TabId]: { ...existing, ...updates },
    },
  };
}

/**
 * Update a tab that is in a specific cell.
 */
function updateTabInCell(
  workspace: Workspace,
  windowId: string,
  cellCol: number,
  tabId: string,
  updates: Partial<Pick<Tab, "isPreview" | "title" | "config">>,
): Workspace {
  return updateTabInPlace(workspace, tabId, updates);
}
