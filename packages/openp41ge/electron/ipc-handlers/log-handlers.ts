/**
 * Log IPC handlers — the log bus ⇄ main-process bridge.
 *
 *   log:append       (fire-and-forget)  renderer → main, batched persisted entries
 *   log:set-debug    (fire-and-forget)  renderer session-debug toggle → main capture level
 *   log:query        (handle)           persisted history query (agent / overlay)
 *   log:path         (handle)           logs directory path
 *   log:files        (handle)           list log files (+ sizes, mtimes)
 */

import { ipcMain, type IpcMainEvent } from "electron";
import { LogLevel, setMinLevel, subscribeLogs } from "openp41ge-logger";
import type { LogFileStore } from "../../src/main/services/log-file-store.js";
import type { StoredLogEntry } from "openp41ge-logger";

export function registerLogHandlers(logStore: LogFileStore): void {
  // Persist main-process log bus output directly to disk.
  subscribeLogs((entry) => {
    if (entry) logStore.append(entry);
  });

  ipcMain.on("log:append", (_event: IpcMainEvent, payload: unknown) => {
    try {
      const entries = payload as StoredLogEntry[];
      if (Array.isArray(entries)) {
        logStore.appendBatch(entries);
      }
    } catch {
      // never let persistence failures propagate to the renderer
    }
  });

  ipcMain.on("log:set-debug", (_event: IpcMainEvent, enabled: unknown) => {
    setMinLevel(enabled === true ? LogLevel.DEBUG : LogLevel.INFO);
  });

  ipcMain.handle("log:query", (_event, filter: unknown) => {
    try {
      return logStore.query((filter ?? {}) as Parameters<LogFileStore["query"]>[0]);
    } catch {
      return [];
    }
  });

  ipcMain.handle("log:path", () => {
    return { logsDir: logStore.logsDir };
  });

  ipcMain.handle("log:files", () => {
    try {
      return logStore.listFiles();
    } catch {
      return [];
    }
  });
}
