/**
 * Dialog IPC handlers — native file dialogs for workspace file management.
 */

import { ipcMain, dialog } from "electron";
import fs from "fs";
import path from "path";
import os from "os";

const WORKSPACE_EXT = "openp41ge-workspace";

/** Read and parse a .openp41ge-workspace file, return its data. */
function readWorkspaceFile(filePath: string): WorkspaceFileData {
  const raw = fs.readFileSync(filePath, "utf-8");
  const data = JSON.parse(raw);
  return {
    name: String(data.name ?? "unnamed"),
    version: Number(data.version ?? 1),
    createdAt: String(data.createdAt ?? new Date().toISOString()),
    dataDir: String(data.dataDir ?? ""),
    repos: Array.isArray(data.repos) ? data.repos : [],
  };
}

export interface WorkspaceFileData {
  name: string;
  version: number;
  createdAt: string;
  dataDir: string;
  repos: Array<{ url: string; worktrees: string[] }>;
}

export function registerDialogHandlers(): void {
  // ── Open workspace file ──────────────────────────────────────────────

  ipcMain.handle("dialog:openWorkspaceFile", async () => {
    const result = await dialog.showOpenDialog({
      properties: ["openFile"],
      filters: [{ name: "Openp41ge Workspace", extensions: [WORKSPACE_EXT] }],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    const filePath = result.filePaths[0];
    try {
      const data = readWorkspaceFile(filePath);
      return { filePath, data };
    } catch (err) {
      console.error("Failed to read workspace file:", err);
      return null;
    }
  });

  // ── Save workspace file ──────────────────────────────────────────────

  ipcMain.handle("dialog:saveWorkspaceFile", async (_event, data: WorkspaceFileData, defaultPath?: string) => {
    const result = await dialog.showSaveDialog({
      defaultPath: defaultPath ?? path.join(os.homedir(), ".openp41ge", "workspaces"),
      filters: [{ name: "Openp41ge Workspace", extensions: [WORKSPACE_EXT] }],
    });
    if (result.canceled || !result.filePath) return null;
    const filePath = result.filePath;
    // Ensure the extension is present
    const finalPath = filePath.endsWith(`.${WORKSPACE_EXT}`) ? filePath : `${filePath}.${WORKSPACE_EXT}`;
    try {
      fs.mkdirSync(path.dirname(finalPath), { recursive: true });
      fs.writeFileSync(finalPath, JSON.stringify(data, null, 2), "utf-8");
      return finalPath;
    } catch (err) {
      console.error("Failed to write workspace file:", err);
      return null;
    }
  });

  // ── Pick folder (for data dir) ───────────────────────────────────────

  ipcMain.handle("dialog:pickFolder", async () => {
    const result = await dialog.showOpenDialog({ properties: ["openDirectory"] });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  // ── Direct read (no dialog — known path) ───────────────────────────────

  ipcMain.handle("dialog:readWorkspaceFile", async (_event, filePath: string) => {
    try {
      const data = readWorkspaceFile(filePath);
      return { filePath, data };
    } catch (err) {
      console.error("Failed to read workspace file:", err);
      return null;
    }
  });

  // ── Direct write (no dialog — known path) ──────────────────────────────

  ipcMain.handle("dialog:writeWorkspaceFile", async (_event, filePath: string, data: WorkspaceFileData) => {
    try {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
      return true;
    } catch (err) {
      console.error("Failed to write workspace file:", err);
      return false;
    }
  });

  // ── Create draft directory (create dataDir) ────────────────────────────

  ipcMain.handle("dialog:ensureDir", async (_event, dirPath: string) => {
    try {
      fs.mkdirSync(dirPath, { recursive: true });
      return true;
    } catch {
      return false;
    }
  });
}
