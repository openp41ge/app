/**
 * Editor system tab operations — open, close, activate, reorder.
 *
 * Editor system tabs are built-in main-app features that appear in the
 * editor area and override the grid (workspace manager, settings, etc.).
 * They are hardcoded in the main app — no plugin registration.
 *
 * State is stored per-window:
 *   window.editorSystemTabIds[]        — ordered list of open system tab IDs
 *   window.editorSystemActiveTabId     — the visible system tab (null = none)
 *   window.bottomPaneGrid              — grid layout for bottom pane columns
 *
 * The bottom pane grid is kept in sync with tab open/close/activate:
 * - Opening a tab places it in column 0 of the bottom pane grid
 * - Activating sets its column's activeTabId
 * - Closing removes it from its column's placement
 *
 * Closing all system tabs restores the editor grid.
 */

import type { Workspace, Window, EditorSystemTabId, Grid } from "./types.js";
import { mapWindow } from "./common.js";

// ─── Open ────────────────────────────────────────────────────────────────

/**
 * Open an editor system tab in the given window.
 * If the tab's appType is already open, just activate it.
 * Otherwise, create a new tab ID and add it to the window's list.
 */
export function openEditorSystemTab(
  workspace: Workspace,
  windowId: string,
  appType: string,
): Workspace {
  return mapWindow(workspace, windowId, (win) => _openInWindow(win, appType));
}

function _openInWindow(win: Window, appType: string): Window {
  const prefix = `editor-sys-${appType}`;

  // Check if this appType is already open
  const existingIndex = win.editorSystemTabIds.findIndex((id) =>
    id.startsWith(prefix),
  );

  if (existingIndex >= 0) {
    const existingId = win.editorSystemTabIds[existingIndex];
    // Activate in bottom pane grid
    const bpGrid = _activateInBottomPaneGrid(win.bottomPaneGrid, existingId);
    return {
      ...win,
      editorSystemActiveTabId: existingId,
      bottomPaneGrid: bpGrid,
    };
  }

  // Create a new tab ID
  const id = `${prefix}-${Date.now()}` as EditorSystemTabId;

  // Place the new tab in the bottom pane grid (default: column 0)
  const bpGrid = _placeInBottomPaneGrid(win.bottomPaneGrid, id);

  return {
    ...win,
    editorSystemTabIds: [...win.editorSystemTabIds, id],
    editorSystemActiveTabId: id,
    bottomPaneGrid: bpGrid,
  };
}

// ─── Close ───────────────────────────────────────────────────────────────

/**
 * Close an editor system tab. If it was the active tab, activate the
 * nearest sibling (or null if none remain).
 */
export function closeEditorSystemTab(
  workspace: Workspace,
  windowId: string,
  tabId: string,
): Workspace {
  return mapWindow(workspace, windowId, (win) => _closeInWindow(win, tabId));
}

function _closeInWindow(win: Window, tabId: string): Window {
  const index = win.editorSystemTabIds.indexOf(tabId as EditorSystemTabId);
  if (index < 0) return win;

  const newIds = win.editorSystemTabIds.filter((id) => id !== tabId);
  let newActive = win.editorSystemActiveTabId;

  if (win.editorSystemActiveTabId === tabId) {
    newActive = newIds.length > 0
      ? newIds[Math.min(index, newIds.length - 1)]
      : null;
  }

  // Remove from bottom pane grid
  const bpGrid = _removeFromBottomPaneGrid(win.bottomPaneGrid, tabId);

  return {
    ...win,
    editorSystemTabIds: newIds,
    editorSystemActiveTabId: newActive,
    bottomPaneGrid: bpGrid,
  };
}

// ─── Activate ────────────────────────────────────────────────────────────

/** Set the active editor system tab and update bottom pane grid. */
export function activateEditorSystemTab(
  workspace: Workspace,
  windowId: string,
  tabId: string,
): Workspace {
  return mapWindow(workspace, windowId, (win) => ({
    ...win,
    editorSystemActiveTabId: tabId as EditorSystemTabId,
    bottomPaneGrid: _activateInBottomPaneGrid(win.bottomPaneGrid, tabId),
  }));
}

// ─── Reorder ─────────────────────────────────────────────────────────────

/** Reorder editor system tabs by moving `tabId` to `targetIndex`. */
export function reorderEditorSystemTabs(
  workspace: Workspace,
  windowId: string,
  tabId: string,
  targetIndex: number,
): Workspace {
  return mapWindow(workspace, windowId, (win) => {
    const current = win.editorSystemTabIds;
    const fromIndex = current.indexOf(tabId as EditorSystemTabId);
    if (fromIndex < 0) return win;

    const newIds = [...current];
    newIds.splice(fromIndex, 1);
    newIds.splice(targetIndex, 0, tabId as EditorSystemTabId);

    return { ...win, editorSystemTabIds: newIds };
  });
}

// ─── Has open? ───────────────────────────────────────────────────────────

/** True if any editor system tabs are open in the given window. */
export function hasEditorSystemTabs(win: Window): boolean {
  return win.editorSystemTabIds.length > 0;
}

// ─── Bottom pane grid helpers ─────────────────────────────────────────────

/**
 * Place a tab ID into the bottom pane grid (default: column 0).
 * Creates column 0 placement if none exists.
 */
function _placeInBottomPaneGrid(grid: Grid | undefined, tabId: string): Grid {
  const g = grid ?? { id: "bp", rows: 1, cols: 1, placements: [], dividers: { columns: [], rows: [] } };
  const sid = tabId as any;

  // Check if the tab already exists in a placement
  const existingPlacement = g.placements.find((p) =>
    p.tabIds.includes(sid),
  );
  if (existingPlacement) {
    // Already placed — just ensure it's active
    return {
      ...g,
      placements: g.placements.map((p) =>
        p.tabIds.includes(sid) ? { ...p, activeTabId: sid } : p,
      ),
    };
  }

  // Find or create column 0 placement
  const col0 = g.placements.find(
    (p) => p.position.col === 0 && p.position.row === 0,
  );
  if (col0) {
    return {
      ...g,
      placements: g.placements.map((p) =>
        p === col0
          ? { ...p, tabIds: [...p.tabIds, sid], activeTabId: sid }
          : p,
      ),
    };
  }

  // Create new placement for column 0
  return {
    ...g,
    placements: [
      ...g.placements,
      {
        tabIds: [sid],
        activeTabId: sid,
        position: { col: 0, row: 0 },
        span: { colSpan: 1, rowSpan: 1 },
      },
    ],
  };
}

/**
 * Activate a tab in the bottom pane grid (set its column's activeTabId).
 */
function _activateInBottomPaneGrid(grid: Grid | undefined, tabId: string): Grid {
  if (!grid) return _placeInBottomPaneGrid(grid, tabId);
  const sid = tabId as any;

  const hasTab = grid.placements.some((p) => p.tabIds.includes(sid));
  if (!hasTab) {
    // Tab not in any column yet — place it
    return _placeInBottomPaneGrid(grid, tabId);
  }

  return {
    ...grid,
    placements: grid.placements.map((p) =>
      p.tabIds.includes(sid) ? { ...p, activeTabId: sid } : p,
    ),
  };
}

/**
 * Remove a tab from the bottom pane grid completely.
 * If removing the last tab from a column, the column placement is removed.
 */
function _removeFromBottomPaneGrid(grid: Grid | undefined, tabId: string): Grid {
  if (!grid) return grid!;
  const sid = tabId as any;

  return {
    ...grid,
    placements: grid.placements
      .map((p) => {
        if (p.tabIds.includes(sid)) {
          const remaining = p.tabIds.filter((t) => t !== sid);
          return remaining.length > 0
            ? { ...p, tabIds: remaining, activeTabId: remaining[0] }
            : null;
        }
        return p;
      })
      .filter(Boolean) as typeof grid.placements,
  };
}
