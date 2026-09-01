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
  return (ws.sidebar?.rightSidebarOpen ?? false) && win.sidebar?.activeRightTab != null;
}

/** Toggle the right sidebar open/closed.
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

/**
 * Open a system (sidebar) tab.
 *
 * Uses the direct workspace dispatch → openSystemTab operation (the same
 * proven path worktree-tree uses), which:
 *   - if the appType already exists in any sidebar → activates it there and
 *     opens that sidebar;
 *   - otherwise → creates the tab and opens it in the given default sidebar
 *     (explorer/git → right, search → left).
 *
 * Note: the DOM-event route (tab-open-system → graph → handler) was found to
 * drop the positional args before reaching the operation, so we dispatch
 * directly instead.
 */
export function emitOpenSystemTab(winId: string, appType: string, title: string, side?: "left" | "right"): void {
  const defaultSides: Record<string, "left" | "right"> = {
    explorer: "right",
    git: "right",
    projects: "left",
    search: "left",
  };
  const resolvedSide = side ?? defaultSides[appType] ?? "right";
  window.openp41ge?.workspace?.dispatch?.("openSystemTab", winId, resolvedSide, appType, title);
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
        if (win && !(ws.sidebar?.rightSidebarOpen ?? false)) {
          // Open the right sidebar with explorer tab
          emitEvent("tab-open-system", { windowId: win.id, side: "right", appType: "explorer", title: "Explorer" });
        }
      }
    }
    el._showCloneDialog();
  }
}
