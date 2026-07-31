/**
 * Worktree controller — sidebar state derived from workspace, toggling via event router.
 *
 * Separate from <openp41ge-worktree-tree> so that keyboard shortcuts and imports
 * can reference the controller without importing the web component.
 *
 * Sidebar state is stored on the Window model using the new system tab fields
 * (rightSidebarOpen, activeRightTab, rightSidebarTabs).
 */

import type { Openp41geWorktreeTreeElement } from "../interfaces/element-guards";
import { getWorkspace, emitEvent } from "../app";

/**
 * Get whether the explorer sidebar is open for the current window.
 * Checks the new system tab sidebar state (right sidebar open + explorer tab active).
 */
/** @public */
export function isWorktreeOpen(): boolean {
  const ws = getWorkspace();
  if (!ws) return false;
  const myWindowId = window.openp41ge?.workspace?.getWindowId?.();
  if (!myWindowId) return false;
  const win = ws.windows.find((w) => w.id === myWindowId);
  if (!win) return false;
  return (win.sidebar?.rightSidebarOpen ?? false) && win.sidebar?.activeRightTab != null;
}

/**
 * Toggle the right sidebar open/closed.
 * Uses the new toggleSidebar operation.
 */
export function toggleWorktree(): void {
  const ws = getWorkspace();
  if (!ws) return;
  const myWindowId = window.openp41ge?.workspace?.getWindowId?.();
  if (!myWindowId) return;
  const win = ws.windows.find((w) => w.id === myWindowId);
  if (!win) return;

  emitEvent("sidebar-toggle", { windowId: win.id, side: "right" });
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
        if (win && !(win.sidebar?.rightSidebarOpen ?? false)) {
          // Open the right sidebar with explorer tab
          emitEvent("tab-open-system", { windowId: win.id, side: "right", appType: "explorer", title: "Explorer" });
        }
      }
    }
    el._showCloneDialog();
  }
}
