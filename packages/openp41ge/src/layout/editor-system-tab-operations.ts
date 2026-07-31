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
 *
 * Closing all system tabs restores the editor grid.
 */

import type { Workspace, Window, EditorSystemTabId } from "./types.js";
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
    // Just activate the existing tab
    return {
      ...win,
      editorSystemActiveTabId: win.editorSystemTabIds[existingIndex],
    };
  }

  // Create a new tab ID
  const id = `${prefix}-${Date.now()}` as EditorSystemTabId;

  return {
    ...win,
    editorSystemTabIds: [...win.editorSystemTabIds, id],
    editorSystemActiveTabId: id,
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

  return {
    ...win,
    editorSystemTabIds: newIds,
    editorSystemActiveTabId: newActive,
  };
}

// ─── Activate ────────────────────────────────────────────────────────────

/** Set the active editor system tab. */
export function activateEditorSystemTab(
  workspace: Workspace,
  windowId: string,
  tabId: string,
): Workspace {
  return mapWindow(workspace, windowId, (win) => ({
    ...win,
    editorSystemActiveTabId: tabId as EditorSystemTabId,
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
