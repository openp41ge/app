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

import type { Workspace, SystemTab, SystemTabId, TabId, TabGroupId } from "./types.js";
import { createSystemTab as makeSystemTab } from "./types.js";
import { mapWindow } from "./common.js";
import { removeTabFromCell } from "./tab-operations.js";

// ─── System Tab Registry ─────────────────────────────────────────────────

export function registerSystemTab(workspace: Workspace, tab: SystemTab): Workspace {
  return {
    ...workspace,
    systemTabs: { ...workspace.systemTabs, [tab.id]: tab },
  };
}

// ─── Default sidebar for system tab types ───────────────────────────────

/**
 * Map of system tab appType → default sidebar side.
 * Used when `openSystemTab` is called without an explicit side.
 */
const DEFAULT_SYSTEM_TAB_SIDES: Record<string, "left" | "right"> = {
  explorer: "right",
  git: "right",
  projects: "left",
  search: "left",
};

// ─── Open ─────────────────────────────────────────────────────────────────

/**
 * Open a system tab. If `side` is not provided, the default side for the
 * appType is used. If a tab with the same `appType` already exists in ANY
 * sidebar (left or right) of the current window, it activates the existing
 * tab and opens that sidebar instead of creating a duplicate.
 *
 * The tab is always added to ALL windows (sidebar layout is shared across
 * all windows in a project).
 */
export function openSystemTab(
  workspace: Workspace,
  winId: string,
  side: "left" | "right" | null = null,
  appType?: string,
  title?: string,
  pinned: boolean = false,
): Workspace {
  // Support both old (5-arg) and new (optional-side) calling conventions.
  // When called via dispatch, JS doesn't have overloading — the function
  // receives the raw positional args. If `side` looks like an appType
  // (not a known side), treat it as the appType.
  const actualSide = (side === "left" || side === "right") ? side : null;
  const actualAppType = actualSide ? (appType ?? "") : (side ?? "");
  const actualTitle = actualSide ? (title ?? "") : (appType ?? "");
  const actualPinned = actualSide ? pinned : (typeof appType === "boolean" ? appType : false);

  // Look up default side from type
  const resolvedSide = actualSide ?? DEFAULT_SYSTEM_TAB_SIDES[actualAppType] ?? "right";

  let win = workspace.windows.find((w) => w.id === winId);
  if (!win) return workspace;

  // Close any unpinned active tab across ALL sidebars before opening a new one,
  // unless the unpinned tab has associated editor tabs still open (e.g. a
  // project-detail tab opened from the Projects sidebar).
  for (const s of ["left" as const, "right" as const]) {
    const activeTabId = s === "left" ? win.sidebar?.activeLeftTab : win.sidebar?.activeRightTab;
    if (activeTabId) {
      const prevTab = workspace.systemTabs[activeTabId as SystemTabId];
      if (prevTab && !prevTab.pinned && !_hasOpenChildren(workspace, activeTabId)) {
        workspace = closeSystemTab(workspace, winId, s, activeTabId);
        const w = workspace.windows.find((w) => w.id === winId);
        if (!w) return workspace;
        win = w;
      }
    }
  }

  // Check if appType already exists in ANY sidebar of this window
  const leftSidebarTabs = win.sidebar?.leftSidebarTabs ?? [];
  const rightSidebarTabs = win.sidebar?.rightSidebarTabs ?? [];
  const allTabIds = [...leftSidebarTabs, ...rightSidebarTabs];

  for (const tabId of allTabIds) {
    const existingTab = workspace.systemTabs[tabId as SystemTabId];
    if (existingTab && existingTab.appType === actualAppType) {
      // Already exists — activate its current sidebar
      const existingSide = leftSidebarTabs.includes(tabId as SystemTabId) ? "left" : "right";
      const activeKey = existingSide === "left" ? "activeLeftTab" as const : "activeRightTab" as const;
      const openKey = existingSide === "left" ? "leftSidebarOpen" as const : "rightSidebarOpen" as const;
      let result = mapWindow(workspace, winId, (w) => ({
        ...w,
        sidebar: {
          ...w.sidebar!,
          [activeKey]: tabId as SystemTabId,
          [openKey]: true,
        },
      }));
      // Ensure a tab group exists for this system tab (backwards compat)
      if (!_getTabGroupIdByParent(result, tabId)) {
        result = (() => {
          const { workspace: r } = createTabGroup(result, tabId);
          return r;
        })();
      }
      return result;
    }
  }

  // Create new system tab
  const tabId = `sys-${Date.now()}-${Math.random().toString(36).slice(2, 6)}` as SystemTabId;
  const tab = makeSystemTab(tabId, actualAppType, actualTitle, actualPinned);
  let result = registerSystemTab(workspace, tab);

  // Add to ALL windows' sidebar tab lists on the resolved side
  const tabsKey = resolvedSide === "left" ? "leftSidebarTabs" as const : "rightSidebarTabs" as const;
  const activeKey = resolvedSide === "left" ? "activeLeftTab" as const : "activeRightTab" as const;
  const openKey = resolvedSide === "left" ? "leftSidebarOpen" as const : "rightSidebarOpen" as const;

  for (const w of result.windows) {
    const currentTabs = resolvedSide === "left"
      ? (w.sidebar?.leftSidebarTabs ?? [])
      : (w.sidebar?.rightSidebarTabs ?? []);

    const updatedSidebar = {
      ...w.sidebar,
      [tabsKey]: [...currentTabs, tabId],
      [activeKey]: tabId,
      [openKey]: true,
    };

    result = mapWindow(result, w.id, (win) => ({
      ...win,
      sidebar: updatedSidebar,
    }));
  }

  // Create a tab group for the new system tab (children can be added later)
  result = (() => {
    const { workspace: w, groupId: _gid } = createTabGroup(result, tabId);
    return w;
  })();

  return result;
}

// ─── Tab Groups ─────────────────────────────────────────────────────────

/**
 * Create a TabGroup for a parent tab and add it to the workspace.
 * The group starts with no children.
 */
export function createTabGroup(workspace: Workspace, parentTabId: string): { workspace: Workspace; groupId: TabGroupId } {
  const groupId = `tg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}` as TabGroupId;
  return {
    workspace: {
      ...workspace,
      tabGroups: {
        ...workspace.tabGroups,
        [groupId]: { id: groupId, parentTabId, childTabIds: [] },
      },
    },
    groupId,
  };
}

/**
 * Add a child tab ID to an existing tab group.
 */
export function addToTabGroup(workspace: Workspace, groupId: string, childTabId: string): Workspace {
  const gid = groupId as TabGroupId;
  const group = workspace.tabGroups[gid];
  if (!group) return workspace;
  if (group.childTabIds.includes(childTabId)) return workspace;
  return {
    ...workspace,
    tabGroups: {
      ...workspace.tabGroups,
      [gid]: { ...group, childTabIds: [...group.childTabIds, childTabId] },
    },
  };
}

/**
 * Find the TabGroup ID that contains the given tab (either as parent or child).
 */
/**
 * Add a child tab to the group whose parent tab matches hostTabId.
 * If no group exists, creates one. Returns the updated workspace.
 */
export function addChildToParentTab(workspace: Workspace, hostTabId: string, childTabId: string): Workspace {
  let result = workspace;
  const gid = _getTabGroupIdByParent(result, hostTabId);
  if (gid) {
    result = addToTabGroup(result, gid, childTabId);
  } else {
    // No group yet — create one (e.g. if openSystemTab wasn't the path used)
    const { workspace: w } = createTabGroup(result, hostTabId);
    result = w;
    const newGid = _getTabGroupIdByParent(result, hostTabId);
    if (newGid) {
      result = addToTabGroup(result, newGid, childTabId);
    }
  }
  return result;
}

/**
 * Find the TabGroup ID that contains the given tab (either as parent or child).
 */
export function getTabGroupIdByTab(workspace: Workspace, tabId: string): TabGroupId | null {
  for (const group of Object.values(workspace.tabGroups)) {
    if (!group) continue;
    if (group.parentTabId === tabId || group.childTabIds.includes(tabId)) {
      return group.id;
    }
  }
  return null;
}

/**
 * Find the TabGroup ID whose parent tab matches the given ID.
 */
function _getTabGroupIdByParent(workspace: Workspace, parentTabId: string): TabGroupId | null {
  for (const group of Object.values(workspace.tabGroups)) {
    if (!group) continue;
    if (group.parentTabId === parentTabId) {
      return group.id;
    }
  }
  return null;
}

/**
 * Check if a tab's group has any open children (children that still exist
 * in editorTabs). Used to prevent closing an unpinned parent tab on defocus.
 */
export function _hasOpenChildren(workspace: Workspace, tabId: string): boolean {
  for (const group of Object.values(workspace.tabGroups)) {
    if (!group) continue;
    if (group.parentTabId === tabId || group.childTabIds.includes(tabId)) {
      // Check if any children still exist in editorTabs
      for (const childId of group.childTabIds) {
        if (workspace.editorTabs[childId as unknown as TabId]) {
          return true;
        }
      }
      return false;
    }
  }
  return false;
}

/**
 * Close a tab group: remove all child tabs from their grid cells and delete
 * the group from the workspace.
 */
export function closeTabGroup(workspace: Workspace, groupId: string): Workspace {
  const gid = groupId as TabGroupId;
  const group = workspace.tabGroups[gid];
  if (!group) return workspace;

  let result = workspace;

  // Remove each child tab from its cell
  for (const childId of group.childTabIds) {
    for (const win of result.windows) {
      const branded = childId as unknown as TabId;
      const placement = win.grid.placements.find((p) => p.tabIds.includes(branded));
      if (placement) {
        result = removeTabFromCell(result, win.id, branded);
      }
    }
  }

  // Delete the group
  const { [gid]: _removed, ...remainingGroups } = result.tabGroups;
  result = { ...result, tabGroups: remainingGroups };

  return result;
}

// ─── Close ────────────────────────────────────────────────────────────────

/**
 * Close a system tab. If pinned, removes from ALL windows' sidebar tab lists.
 * If unpinned, removes only from the originating window. Deletes the system tab
 * from registry if no window references it. Also closes any associated editor
 * tabs that were opened from this system tab.
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

  // Close any child tabs in this system tab's group
  const groupId = _getTabGroupIdByParent(result, tabId);
  if (groupId) {
    result = closeTabGroup(result, groupId);
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

// ─── Move system tab between sidebars ────────────────────────────────────

/**
 * Move a system tab from one sidebar to the other (or reorder within the same
 * sidebar). Sidebar layout is shared across ALL windows, so the change is
 * applied to every window. Removes the tab from the source sidebar's tab list,
 * inserts it at `dropIndex` in the target sidebar's tab list, activates it,
 * and ensures the target sidebar is open.
 */
export function moveSystemTabToSidebar(
  workspace: Workspace,
  _winId: string,
  tabId: string,
  targetSide: "left" | "right",
  dropIndex: number,
): Workspace {
  const sid = tabId as SystemTabId;
  if (!workspace.systemTabs[sid]) return workspace;

  // Determine which side the tab is on — check each window to handle edge
  // cases where a window might be out of sync. Use the first window found.
  let sourceSide: "left" | "right" | null = null;
  for (const win of workspace.windows) {
    const leftTabs = win.sidebar?.leftSidebarTabs ?? [];
    const rightTabs = win.sidebar?.rightSidebarTabs ?? [];
    if (leftTabs.includes(sid)) { sourceSide = "left"; break; }
    if (rightTabs.includes(sid)) { sourceSide = "right"; break; }
  }
  if (!sourceSide) return workspace;

  // Apply the move to ALL windows
  let result: Workspace = workspace;
  for (const win of result.windows) {
    const sidebar = win.sidebar ?? { activeViewId: null, width: 280 };

    const newLeftTabs = [...(sidebar.leftSidebarTabs ?? [])] as SystemTabId[];
    const newRightTabs = [...(sidebar.rightSidebarTabs ?? [])] as SystemTabId[];

    // Remove from source side
    if (sourceSide === "left") {
      const idx = newLeftTabs.indexOf(sid);
      if (idx !== -1) newLeftTabs.splice(idx, 1);
    } else {
      const idx = newRightTabs.indexOf(sid);
      if (idx !== -1) newRightTabs.splice(idx, 1);
    }

    // Insert into target side at dropIndex
    const targetList = targetSide === "left" ? newLeftTabs : newRightTabs;
    const clampedIndex = Math.max(0, Math.min(dropIndex, targetList.length));
    targetList.splice(clampedIndex, 0, sid);

    result = mapWindow(result, win.id, (w) => ({
      ...w,
      sidebar: {
        ...w.sidebar!,
        leftSidebarTabs: newLeftTabs,
        rightSidebarTabs: newRightTabs,
        // Clear active tab on source side if it was the moved tab
        ...(sourceSide === "left" && w.sidebar?.activeLeftTab === sid
          ? { activeLeftTab: null }
          : {}),
        ...(sourceSide === "right" && w.sidebar?.activeRightTab === sid
          ? { activeRightTab: null }
          : {}),
        // Set active tab on target side and ensure it's open
        [targetSide === "left" ? "activeLeftTab" : "activeRightTab"]: sid,
        [targetSide === "left" ? "leftSidebarOpen" : "rightSidebarOpen"]: true,
      },
    }));
  }

  return result;
}
