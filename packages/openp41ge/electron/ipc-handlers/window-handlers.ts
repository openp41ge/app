/**
 * Window control IPC handlers — new-tab, close-tab, add-column, new-window,
 * minimize, maximize, close, isMaximized.
 */

import { ipcMain, BrowserWindow, type IpcMainEvent } from "electron";
import type { OperationDispatcher } from "../../src/main/index.js";
import type { TabNameGenerator } from "../../src/main/index.js";
import {
  openp41geWindows,
  createOpenp41geWindow,
  handleCloseCurrentTab,
  handleNewColumn,
} from "../window-manager.js";

export function registerWindowHandlers(
  dispatcher: OperationDispatcher,
  _tabNames: TabNameGenerator,
): void {
  ipcMain.on("openp41ge:new-tab", (_event) => {
    // Cmd+T new-tab is removed — will be replaced with something else.
  });

  ipcMain.on("openp41ge:close-tab", (event) => {
    const bw = BrowserWindow.fromWebContents(event.sender);
    if (!bw) return;
    for (const [id, existing] of openp41geWindows) {
      if (existing === bw) {
        handleCloseCurrentTab(id);
        return;
      }
    }
  });

  ipcMain.on("openp41ge:add-column", (event) => {
    const bw = BrowserWindow.fromWebContents(event.sender);
    if (!bw) return;
    for (const [id, existing] of openp41geWindows) {
      if (existing === bw) {
        handleNewColumn(id);
        return;
      }
    }
  });

  ipcMain.on("openp41ge:new-window", (event: IpcMainEvent) => {
    dispatcher.apply("newWindow", []);
    const ws = dispatcher.getWorkspace();
    const newWin = ws.windows[ws.windows.length - 1];
    if (newWin) {
      dispatcher.broadcast();
      const src = BrowserWindow.fromWebContents(event.sender);
      createOpenp41geWindow(newWin.id, false, src ?? undefined);
    }
  });

  // ── Window controls ──────────────────────────────────────────────────────

  ipcMain.on("window:minimize", (event) => {
    BrowserWindow.fromWebContents(event.sender)?.minimize();
  });

  ipcMain.on("window:maximize", (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) {
      if (win.isMaximized()) win.unmaximize();
      else win.maximize();
    }
  });

  ipcMain.on("window:close", (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close();
  });

  ipcMain.handle("window:isMaximized", (event) => {
    return BrowserWindow.fromWebContents(event.sender)?.isMaximized() ?? false;
  });

  ipcMain.on("window:open-dev-tools", (event) => {
    BrowserWindow.fromWebContents(event.sender)?.webContents.openDevTools({ mode: "detach" });
  });
}
