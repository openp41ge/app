/**
 * RepoRef management IPC handlers — add/remove/has/addWorktree/getRepoRefs.
 *
 * Operates at the window level. Each window has its own repoRefs list.
 */

import { ipcMain, BrowserWindow } from "electron";
import type { OperationDispatcher } from "../../src/main/index.js";
import { openp41geWindows } from "../window-manager.js";

export function registerRepoRefHandlers(dispatcher: OperationDispatcher): void {
  /**
   * Broadcast that repo refs have changed to all windows.
   */
  function broadcastRepoRefsChanged(): void {
    for (const [, bw] of openp41geWindows) {
      try {
        bw.webContents.send("workset:repo-refs-changed");
      } catch {
        // window might be closing
      }
    }
  }

  /**
   * Add a repo to a window's repoRefs.
   */
  ipcMain.handle("workset:addRepo", async (_event, data: string) => {
    const { name, url, worktrees } = JSON.parse(data);
    const ws = dispatcher.getWorkspace();

    // Add to the focused window (first window with matching sender)
    for (const win of ws.windows) {
      if (win.repoRefs.some((r) => r.name === name)) {
        // Already added to some window — broadcast and return
        broadcastRepoRefsChanged();
        return true;
      }
    }

    const focusedWindow = BrowserWindow?.getFocusedWindow();
    let targetWinId: string | null = null;
    for (const [sid, bw] of openp41geWindows) {
      if (bw === focusedWindow) {
        targetWinId = sid;
        break;
      }
    }

    if (!targetWinId && ws.windows.length > 0) {
      targetWinId = ws.windows[0].id;
    }

    if (targetWinId) {
      dispatcher.apply("addRepoRef", [targetWinId, name, url, worktrees ?? []]);
      dispatcher.broadcast();
      broadcastRepoRefsChanged();
      return true;
    }
    return false;
  });

  /**
   * Remove a repo from a window's repoRefs.
   */
  ipcMain.handle("workset:removeRepo", async (_event, data: string) => {
    const { name } = JSON.parse(data);
    const ws = dispatcher.getWorkspace();

    for (const win of ws.windows) {
      if (win.repoRefs.some((r) => r.name === name)) {
        dispatcher.apply("removeRepoRef", [win.id, name]);
        dispatcher.broadcast();
        broadcastRepoRefsChanged();
        return true;
      }
    }
    return false;
  });

  /**
   * Check if a repo is in any window's repoRefs.
   */
  ipcMain.handle("workset:hasRepo", async (_event, data: string) => {
    const { name } = JSON.parse(data);
    const ws = dispatcher.getWorkspace();
    for (const win of ws.windows) {
      if (win.repoRefs.some((r) => r.name === name)) return true;
    }
    return false;
  });

  /**
   * Add a worktree to a repo ref.
   */
  ipcMain.handle("workset:addWorktreeToRepo", async (_event, data: string) => {
    const { repoName, branch } = JSON.parse(data);
    const ws = dispatcher.getWorkspace();

    const focusedWindow = BrowserWindow?.getFocusedWindow();
    let targetWinId: string | null = null;
    for (const [sid, bw] of openp41geWindows) {
      if (bw === focusedWindow) {
        targetWinId = sid;
        break;
      }
    }

    if (!targetWinId && ws.windows.length > 0) {
      targetWinId = ws.windows[0].id;
    }

    if (targetWinId) {
      dispatcher.apply("addWorktreeToRepoRef", [targetWinId, repoName, branch]);
      dispatcher.broadcast();
      broadcastRepoRefsChanged();
      return true;
    }
    return false;
  });

  /**
   * Get repoRefs for all windows.
   */
  ipcMain.handle("workset:getRepoRefs", async () => {
    const ws = dispatcher.getWorkspace();
    // Return the first window's repoRefs (for backward compat with worktree tree)
    if (ws.windows.length > 0) {
      return JSON.stringify(ws.windows[0].repoRefs);
    }
    return "[]";
  });
}
