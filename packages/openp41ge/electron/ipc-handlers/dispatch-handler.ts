/**
 * Dispatch handler — core workspace dispatch, state queries, confirm modals.
 */

import { ipcMain, BrowserWindow, type IpcMainEvent } from "electron";
import type { OperationDispatcher } from "../../src/main/index.js";
import {
  openp41geWindows,
  createOpenp41geWindow,
  closeOrphanedWindows,
  handleConfirmResponse,
  showConfirmViaIPC,
} from "../window-manager.js";

export function registerDispatchHandlers(dispatcher: OperationDispatcher): void {
  ipcMain.handle("openp41ge:get-state", () => {
    return JSON.stringify(dispatcher.getWorkspace());
  });

  ipcMain.on("openp41ge:confirm-response", (_event, result: unknown) => {
    handleConfirmResponse(result);
  });

  ipcMain.on("openp41ge:dispatch", (event: IpcMainEvent, payload: string) => {
    const { fn, args } = JSON.parse(payload);
    if (dispatcher.apply(fn, args)) {
      dispatcher.broadcast();
      closeOrphanedWindows();

      if (fn === "detachTabToWindow") {
        const ws = dispatcher.getWorkspace();
        const existingIds = new Set<string>();
        for (const [id] of openp41geWindows) existingIds.add(id);
        const newWin = ws.windows.find((w) => !existingIds.has(w.id));
        if (newWin) {
          const src = BrowserWindow.fromWebContents(event.sender);
          createOpenp41geWindow(newWin.id, false, src ?? undefined);
        }
      }
    }
  });

  ipcMain.on("openp41ge:create-window", (event: IpcMainEvent, data: string) => {
    const { type: _type, windowId, _paneId, tabId, bounds } = JSON.parse(data);
    dispatcher.apply("detachTabToWindow", [windowId, tabId, bounds]);
    const ws = dispatcher.getWorkspace();
    const newWin = ws.windows[ws.windows.length - 1];
    if (newWin) {
      dispatcher.broadcast();
      closeOrphanedWindows();
      const src = BrowserWindow.fromWebContents(event.sender);
      createOpenp41geWindow(newWin.id, false, src ?? undefined, bounds?.x, bounds?.y);
    }
  });

  ipcMain.handle("openp41ge:confirm-remove-tab", async (event, data: string) => {
    const { windowId, tabId } = JSON.parse(data);
    const ws = dispatcher.getWorkspace();
    const win = ws.windows.find((w) => w.id === windowId);
    const hasTab = win?.grid.placements.some((pl) => pl.tabIds.includes(tabId));

    if (process.env.OPENP41GE_E2E_TEST) {
      if (hasTab) {
        dispatcher.apply("removeTabFromCell", [windowId, tabId]);
        dispatcher.broadcast();
      }
      return true;
    }

    const bw = BrowserWindow.fromWebContents(event.sender);
    if (!bw || !hasTab) return false;
    const confirmed = await showConfirmViaIPC(bw, {
      title: "Close tab?",
      message: "Are you sure you want to close this tab?",
      confirmLabel: "Close Tab",
    });

    if (confirmed) {
      dispatcher.apply("removeTabFromCell", [windowId, tabId]);
      dispatcher.broadcast();
      return true;
    }
    return false;
  });
}
