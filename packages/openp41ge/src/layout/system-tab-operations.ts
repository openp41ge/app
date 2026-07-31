/**
 * System tab operations — open, close, pin, reorder system tabs in sidebars.
 *
 * System tabs are sidebar-based app panels (Explorer, Git, Search, Projects).
 * They live in `workspace.systemTabs` and each window has ordered lists of
 * system tab IDs for left and right sidebars.
 *
 * Pinned system tabs are project-wide (visible in all windows).
 * Unpinned system tabs are per-window (only exist in the originating window).
 */

import type { Workspace, SystemTab, SystemTabId } from "./types.js";
import { createSystemTab as makeSystemTab } from "./types.js";
import { mapWindow } from "./common.js";

// ─── System Tab Registry ─────────────────────────────────────────────────

export function registerSystemTab(workspace: Workspace, tab: SystemTab): Workspace {
  return {
    ...workspace,
    systemTabs: { ...workspace.systemTabs, [tab.id]: tab },
  };
}

// ─── Open ─────────────────────────────────────────────────────────────────

/**
 * Open a system tab in a sidebar. If the `appType` already exists in the
 * sidebar's tab list, it activates the existing tab instead of creating a duplicate.
 *
 * When pinned, the tab propagates to all windows' same-sidebar tab lists.
 */
export function openSystemTab(
  workspace: Workspace,
  winId: string,
  side: "left" | "right",
  appType: string,
  title: string,
  pinned: boolean = false,
): Workspace {
  // Check if appType already exists in this sidebar
  const win = workspace.windows.find((w) => w.id === winId);
  if (!win) return workspace;

  const sidebarTabs = side === "left" ? (win.sidebar?.leftSidebarTabs ?? []) : (win.sidebar?.rightSidebarTabs ?? []);
  const activeKey = side === "left" ? "activeLeftTab" as const : "activeRightTab" as const;
  const tabsKey = side === "left" ? "leftSidebarTabs" as const : "rightSidebarTabs" as const;
  const openKey = side === "left" ? "leftSidebarOpen" as const : "rightSidebarOpen" as const;

  // Search for existing tab with same appType
  for (const tabId of sidebarTabs) {
    const existingTab = workspace.systemTabs[tabId as SystemTabId];
    if (existingTab && existingTab.appType === appType) {
      // Already exists — just activate it and ensure sidebar is open
      return mapWindow(workspace, winId, (w) => ({
        ...w,
        sidebar: {
          ...w.sidebar!,
          [activeKey]: tabId as SystemTabId,
          [openKey]: true,
        },
      }));
    }
  }

  // Create new system tab
  const tabId = `sys-${Date.now()}-${Math.random().toString(36).slice(2, 6)}` as SystemTabId;
  const tab = makeSystemTab(tabId, appType, title, pinned);
  let result = registerSystemTab(workspace, tab);

  // Add to this window's sidebar tab list
  const newTabs = [...sidebarTabs, tabId];
  const sidebarUpdate = {
    [tabsKey]: newTabs,
    [activeKey]: tabId,
    [openKey]: true,
  };

  result = mapWindow(result, winId, (w) => ({
    ...w,
    sidebar: { ...w.sidebar!, ...sidebarUpdate },
  }));

  // Propagate pinned tabs to all windows' same-sidebar tab lists
  if (pinned) {
    for (const otherWin of result.windows) {
      if (otherWin.id === winId) continue;
      const otherSidebarTabs = side === "left" ? (otherWin.sidebar?.leftSidebarTabs ?? []) : (otherWin.sidebar?.rightSidebarTabs ?? []);
      if (!otherSidebarTabs.includes(tabId)) {
        const updatedSidebar = {
          ...otherWin.sidebar,
          [tabsKey]: [...otherSidebarTabs, tabId],
        };
        result = mapWindow(result, otherWin.id, (w) => ({
          ...w,
          sidebar: updatedSidebar,
        }));
      }
    }
  }

  return result;
}

// ─── Close ────────────────────────────────────────────────────────────────

/**
 * Close a system tab. If pinned, removes from ALL windows' sidebar tab lists.
 * If unpinned, removes only from the originating window. Deletes the system tab
 * from registry if no window references it.
 */
export function closeSystemTab(
  workspace: Workspace,
  winId: string,
  side: "left" | "right",
  tabId: string,
): Workspace {
  const sid = tabId as SystemTabId;
  const tabsKey = side === "left" ? "leftSidebarTabs" as const : "rightSidebarTabs" as const;
  const activeKey = side === "left" ? "activeLeftTab" as const : "activeRightTab" as const;

  const systemTab = workspace.systemTabs[sid];
  if (!systemTab) return workspace;

  let result: Workspace = workspace;

  if (systemTab.pinned) {
    // Remove from ALL windows
    for (const win of result.windows) {
      const sidebarTabs = side === "left" ? (win.sidebar?.leftSidebarTabs ?? []) : (win.sidebar?.rightSidebarTabs ?? []);
      const filtered = sidebarTabs.filter((id: string) => id !== tabId);
      const hadTab = filtered.length !== sidebarTabs.length;
      if (hadTab) {
        const newActive = (activeKey === "activeLeftTab" ? win.sidebar?.activeLeftTab : win.sidebar?.activeRightTab);
        const activeNeedsReset = newActive === tabId;
        result = mapWindow(result, win.id, (w) => ({
          ...w,
          sidebar: {
            ...w.sidebar!,
            [tabsKey]: filtered,
            [activeKey]: activeNeedsReset ? null : (activeKey === "activeLeftTab" ? w.sidebar?.activeLeftTab : w.sidebar?.activeRightTab),
          },
        }));
      }
    }

    // Delete from systemTabs registry
    const { [sid]: _removed, ...remainingSysTabs } = result.systemTabs;
    result = { ...result, systemTabs: remainingSysTabs };
  } else {
    // Remove only from this window
    const sidebarTabs = side === "left"
      ? (result.windows.find((w) => w.id === winId)?.sidebar?.leftSidebarTabs ?? [])
      : (result.windows.find((w) => w.id === winId)?.sidebar?.rightSidebarTabs ?? []);
    const filtered = sidebarTabs.filter((id: string) => id !== tabId);
    const win = result.windows.find((w) => w.id === winId);
    const activeNeedsReset = (side === "left" ? win?.sidebar?.activeLeftTab : win?.sidebar?.activeRightTab) === tabId;

    result = mapWindow(result, winId, (w) => ({
      ...w,
      sidebar: {
        ...w.sidebar!,
        [tabsKey]: filtered,
        [activeKey]: activeNeedsReset ? null : (side === "left" ? w.sidebar?.activeLeftTab : w.sidebar?.activeRightTab),
      },
    }));

    // Check if any other window still references this tab; if not, delete from registry
    let refCount = 0;
    for (const w of result.windows) {
      const leftTabs = w.sidebar?.leftSidebarTabs ?? [];
      const rightTabs = w.sidebar?.rightSidebarTabs ?? [];
      if (leftTabs.includes(sid) || rightTabs.includes(sid)) {
        refCount++;
      }
    }
    if (refCount === 0) {
      const { [sid]: _removed, ...remainingSysTabs } = result.systemTabs;
      result = { ...result, systemTabs: remainingSysTabs };
    }
  }

  return result;
}

// ─── Pin / Unpin ──────────────────────────────────────────────────────────

/**
 * Toggle the pinned state of a system tab. When pinned, the tab propagates
 * to all windows' same-sidebar tab lists. When unpinned, it becomes per-window.
 */
export function pinSystemTab(
  workspace: Workspace,
  tabId: string,
  pinned: boolean,
): Workspace {
  const sid = tabId as SystemTabId;
  const tab = workspace.systemTabs[sid];
  if (!tab) return workspace;
  if (tab.pinned === pinned) return workspace;

  // Update the tab's pinned state
  let result: Workspace = {
    ...workspace,
    systemTabs: {
      ...workspace.systemTabs,
      [sid]: { ...tab, pinned },
    },
  };

  if (pinned) {
    // Propagate to all windows (add to all same-sidebar lists)
    const side = _findSystemTabSide(result, tabId);
    if (side) {
      const tabsKey = side === "left" ? "leftSidebarTabs" as const : "rightSidebarTabs" as const;
      for (const win of result.windows) {
        const sidebarTabs = side === "left" ? (win.sidebar?.leftSidebarTabs ?? []) : (win.sidebar?.rightSidebarTabs ?? []);
        if (!sidebarTabs.includes(sid)) {
          result = mapWindow(result, win.id, (w) => ({
            ...w,
            sidebar: {
              ...w.sidebar!,
              [tabsKey]: [...(side === "left" ? (w.sidebar?.leftSidebarTabs ?? []) : (w.sidebar?.rightSidebarTabs ?? [])), sid],
            },
          }));
        }
      }
    }
  }

  return result;
}

/**
 * Find which side a system tab belongs to in any window (for propagation).
 * Returns "left", "right", or null if not found in any sidebar.
 */
function _findSystemTabSide(workspace: Workspace, tabId: string): "left" | "right" | null {
  for (const win of workspace.windows) {
    if ((win.sidebar?.leftSidebarTabs ?? []).includes(tabId as SystemTabId)) return "left";
    if ((win.sidebar?.rightSidebarTabs ?? []).includes(tabId as SystemTabId)) return "right";
  }
  return null;
}

// ─── Reorder ──────────────────────────────────────────────────────────────

/**
 * Reorder a system tab within a sidebar's tab list.
 */
export function reorderSystemTab(
  workspace: Workspace,
  winId: string,
  side: "left" | "right",
  tabId: string,
  newIndex: number,
): Workspace {
  const tabsKey = side === "left" ? "leftSidebarTabs" as const : "rightSidebarTabs" as const;
  const win = workspace.windows.find((w) => w.id === winId);
  if (!win) return workspace;

  const sidebarTabs = [...(side === "left" ? (win.sidebar?.leftSidebarTabs ?? []) : (win.sidebar?.rightSidebarTabs ?? []))] as SystemTabId[];
  const oldIndex = sidebarTabs.indexOf(tabId as SystemTabId);
  if (oldIndex === -1) return workspace;

  const [moved] = sidebarTabs.splice(oldIndex, 1);
  const clampedIndex = Math.max(0, Math.min(newIndex, sidebarTabs.length));
  sidebarTabs.splice(clampedIndex, 0, moved);

  return mapWindow(workspace, winId, (w) => ({
    ...w,
    sidebar: {
      ...w.sidebar!,
      [tabsKey]: sidebarTabs,
    },
  }));
}

// ─── Activate ─────────────────────────────────────────────────────────────

/**
 * Activate a system tab in a sidebar (set it as the active tab).
 */
export function activateSystemTab(
  workspace: Workspace,
  winId: string,
  side: "left" | "right",
  tabId: string,
): Workspace {
  const activeKey = side === "left" ? "activeLeftTab" as const : "activeRightTab" as const;

  return mapWindow(workspace, winId, (w) => ({
    ...w,
    sidebar: {
      ...w.sidebar!,
      [activeKey]: tabId as SystemTabId,
    },
  }));
}

// ─── Toggle Sidebar ───────────────────────────────────────────────────────

/**
 * Toggle a sidebar open/closed. If toggling open and there is no active tab,
 * activates the first tab in the sidebar's tab list (if any).
 */
export function toggleSidebar(
  workspace: Workspace,
  winId: string,
  side: "left" | "right",
): Workspace {
  const openKey = side === "left" ? "leftSidebarOpen" as const : "rightSidebarOpen" as const;
  const activeKey = side === "left" ? "activeLeftTab" as const : "activeRightTab" as const;
  const tabsKey = side === "left" ? "leftSidebarTabs" as const : "rightSidebarTabs" as const;

  const win = workspace.windows.find((w) => w.id === winId);
  if (!win) return workspace;

  const isOpen = side === "left" ? (win.sidebar?.leftSidebarOpen ?? false) : (win.sidebar?.rightSidebarOpen ?? false);
  const sidebarTabs = side === "left" ? (win.sidebar?.leftSidebarTabs ?? []) : (win.sidebar?.rightSidebarTabs ?? []);
  const activeTab = side === "left" ? win.sidebar?.activeLeftTab : win.sidebar?.activeRightTab;

  const newIsOpen = !isOpen;

  // If opening and no active tab, activate the first tab in the list
  let newActiveTab = activeTab;
  if (newIsOpen && !newActiveTab && sidebarTabs.length > 0) {
    newActiveTab = sidebarTabs[0] as SystemTabId;
  }

  return mapWindow(workspace, winId, (w) => ({
    ...w,
    sidebar: {
      ...w.sidebar!,
      [openKey]: newIsOpen,
      [activeKey]: newActiveTab,
    },
  }));
}

/**
 * Open a sidebar and set the active tab. If no tabId is given and the sidebar
 * has tabs, activates the first one.
 */
export function openSidebar(
  workspace: Workspace,
  winId: string,
  side: "left" | "right",
  tabId?: string,
): Workspace {
  const openKey = side === "left" ? "leftSidebarOpen" as const : "rightSidebarOpen" as const;
  const activeKey = side === "left" ? "activeLeftTab" as const : "activeRightTab" as const;
  const tabsKey = side === "left" ? "leftSidebarTabs" as const : "rightSidebarTabs" as const;

  const win = workspace.windows.find((w) => w.id === winId);
  if (!win) return workspace;

  const sidebarTabs = side === "left" ? (win.sidebar?.leftSidebarTabs ?? []) : (win.sidebar?.rightSidebarTabs ?? []);

  let activeTab: SystemTabId | null = tabId ? tabId as SystemTabId : null;
  if (!activeTab && sidebarTabs.length > 0) {
    activeTab = sidebarTabs[0] as SystemTabId;
  }

  return mapWindow(workspace, winId, (w) => ({
    ...w,
    sidebar: {
      ...w.sidebar!,
      [openKey]: true,
      [activeKey]: activeTab,
    },
  }));
}

/**
 * Close a sidebar.
 */
export function closeSidebar(
  workspace: Workspace,
  winId: string,
  side: "left" | "right",
): Workspace {
  const openKey = side === "left" ? "leftSidebarOpen" as const : "rightSidebarOpen" as const;

  return mapWindow(workspace, winId, (w) => ({
    ...w,
    sidebar: {
      ...w.sidebar!,
      [openKey]: false,
    },
  }));
}
