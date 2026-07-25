/**
 * Worktree controller — sidebar state derived from workspace, toggling via dispatch.
 *
 * Separate from <openp41ge-worktree-tree> so that keyboard shortcuts and imports
 * can reference the controller without importing the web component.
 *
 * The sidebar open/closed state is stored on the Window model (sidebar.activeViewId).
 * Worksets have been removed — each window has its own sidebar state.
 */

import type { Openp41geWorktreeTreeElement } from "../interfaces/element-guards";
import { getWorkspace, dispatch } from "../app";

/**
 * Get the sidebar open state for the current window.
 * Returns false if no workspace or no active window.
 */
/** @public */
export function isWorktreeOpen(): boolean {
  const ws = getWorkspace();
  if (!ws) return false;
  const myWindowId = window.openp41ge?.workspace?.getWindowId?.();
  if (!myWindowId) return false;
  const win = ws.windows.find((w) => w.id === myWindowId);
  if (!win) return false;
  return win.sidebar?.activeViewId === "explorer";
}

/**
 * Toggle the explorer sidebar open/closed for the current window.
 * Dispatches toggleSidebarViewOp to persist the state change.
 */
export function toggleWorktree(): void {
  const ws = getWorkspace();
  if (!ws) return;
  const myWindowId = window.openp41ge?.workspace?.getWindowId?.();
  if (!myWindowId) return;
  const win = ws.windows.find((w) => w.id === myWindowId);
  if (!win) return;

  dispatch("toggleSidebarViewOp", win.id, "explorer");
}

interface WorktreeTreeWithDialog extends Openp41geWorktreeTreeElement {
  _showCloneDialog(): void;
}

/** Show the clone dialog (if component is loaded). */
export function showCloneDialog(): void {
  const el = document.querySelector("openp41ge-worktree-tree") as WorktreeTreeWithDialog | null;
  if (el && typeof el._showCloneDialog === "function") {
    const ws = getWorkspace();
    if (ws) {
      const myWindowId = window.openp41ge?.workspace?.getWindowId?.();
      if (myWindowId) {
        const win = ws.windows.find((w) => w.id === myWindowId);
        if (win && win.sidebar?.activeViewId !== "explorer") {
          dispatch("setSidebarViewOp", win.id, "explorer");
        }
      }
    }
    el._showCloneDialog();
  }
}
