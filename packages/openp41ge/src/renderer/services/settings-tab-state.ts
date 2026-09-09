/**
 * Settings tab state helpers.
 *
 * A sidebar tab's settings button should stay "lit" (white) while its own
 * settings grid tab is open. These helpers let any component check that state
 * and subscribe to workspace changes so the icon stays in sync.
 */

import { appServices } from "../app";
import type { Workspace, Tab } from "../../layout/types";

/** Resolve the current window id defensively. */
function _windowId(): string | null {
  try {
    return window.openp41ge?.workspace?.getWindowId?.() ?? null;
  } catch {
    return null;
  }
}

/** True if a tab with `appType` is currently pinned in this window's grid. */
function _findOpenSettingsTab(ws: Workspace, appType: string, windowId: string): boolean {
  const win = ws.windows.find((w) => w.id === windowId);
  if (!win) return false;
  const tabs = ws.editorTabs as Record<string, Tab | undefined>;
  for (const placement of win.grid?.placements ?? []) {
    for (const tabId of placement.tabIds ?? []) {
      const tab = tabs[tabId];
      if (tab && tab.appType === appType) return true;
    }
  }
  return false;
}

/** Whether the settings grid tab for `appType` is open in the current window. */
export function isSettingsTabOpen(appType: string): boolean {
  try {
    const ws = appServices?.workspaceState?.getWorkspace?.();
    if (!ws) return false;
    const windowId = _windowId();
    if (!windowId) return false;
    return _findOpenSettingsTab(ws, appType, windowId);
  } catch {
    return false;
  }
}

/**
 * Subscribe to workspace changes that could alter whether a settings grid tab
 * is open. Calls `cb` immediately with the current state, then whenever the
 * workspace updates. Returns an unsubscribe function.
 */
export function subscribeSettingsTabState(
  appType: string,
  cb: (open: boolean) => void,
): () => void {
  try {
    const unsub = appServices?.workspaceState?.subscribe?.((ws) => {
      const windowId = _windowId();
      cb(windowId ? _findOpenSettingsTab(ws, appType, windowId) : false);
    });
    cb(isSettingsTabOpen(appType));
    return unsub ?? (() => {});
  } catch {
    return () => {};
  }
}
