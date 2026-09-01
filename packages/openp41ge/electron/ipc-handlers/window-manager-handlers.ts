/**
 * Window-manager IPC handlers — open/focus the Window Manager window, list open
 * windows, and open a workspace-bound window from the Window Manager.
 */

import { ipcMain, BrowserWindow } from "electron";
import {
  openWindowManager,
  getOpenWindowSummaries,
  openWorkspaceWindow,
} from "../window-manager.js";

export function registerWindowManagerHandlers(): void {
  ipcMain.on("window-manager:open", (event) => {
    openWindowManager(BrowserWindow.fromWebContents(event.sender) ?? undefined);
  });

  ipcMain.handle("window-manager:open-window-summaries", () => {
    return getOpenWindowSummaries();
  });

  ipcMain.on("window-manager:open-workspace-window", (event, workspacePath: string) => {
    if (typeof workspacePath !== "string" || workspacePath.length === 0) return;
    openWorkspaceWindow(workspacePath, BrowserWindow.fromWebContents(event.sender) ?? undefined);
  });
}
