/**
 * Dialog IPC handlers — native file dialogs for workspace file management.
 */

import { ipcMain, dialog, shell } from "electron";
import fs from "fs";
import path from "path";
import os from "os";

const WORKSPACE_EXT = "openp41ge-workspace";

/** Resolve a path starting with ~/ to the user's home directory. */
function resolveTilde(filePath: string): string {
  if (filePath.startsWith("~")) {
    return path.join(os.homedir(), filePath.slice(1));
  }
  return filePath;
}

/** Read and parse a .openp41ge-workspace file, return its data. */
function readWorkspaceFile(filePath: string): WorkspaceFileData {
  const raw = fs.readFileSync(filePath, "utf-8");
  const data = JSON.parse(raw);
  return {
    id: String(data.id ?? ""),
    name: data.name ? String(data.name) : undefined,
    version: Number(data.version ?? 1),
    createdAt: String(data.createdAt ?? new Date().toISOString()),
    dataDir: String(data.dataDir ?? ""),
    repos: Array.isArray(data.repos) ? data.repos : [],
  };
}

export interface WorkspaceFileData {
  id: string;
  name?: string;
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
    const result = await dialog.showOpenDialog({ properties: ["openDirectory", "createDirectory"] });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  // ── Direct read (no dialog — known path) ───────────────────────────────

  ipcMain.handle("dialog:readWorkspaceFile", async (_event, filePath: string) => {
    try {
      const resolved = resolveTilde(filePath);
      const data = readWorkspaceFile(resolved);
      return { filePath, data };
    } catch (err) {
      console.error("Failed to read workspace file:", err);
      return null;
    }
  });

  // ── Direct write (no dialog — known path) ──────────────────────────────

  ipcMain.handle("dialog:writeWorkspaceFile", async (_event, filePath: string, data: WorkspaceFileData) => {
    try {
      const resolved = resolveTilde(filePath);
      fs.mkdirSync(path.dirname(resolved), { recursive: true });
      fs.writeFileSync(resolved, JSON.stringify(data, null, 2), "utf-8");
      return true;
    } catch (err) {
      console.error("Failed to write workspace file:", err);
      return false;
    }
  });

  // ── Create draft directory (create dataDir) ────────────────────────────

  ipcMain.handle("dialog:ensureDir", async (_event, dirPath: string) => {
    try {
      const resolved = resolveTilde(dirPath);
      fs.mkdirSync(resolved, { recursive: true });
      return true;
    } catch {
      return false;
    }
  });

  // ── Reveal in Finder ────────────────────────────────────────────────

  ipcMain.handle("dialog:revealInFinder", async (_event, filePath: string) => {
    try {
      const resolved = filePath.startsWith("~") ? path.join(os.homedir(), filePath.slice(1)) : filePath;
      shell.showItemInFolder(resolved);
      return true;
    } catch {
      return false;
    }
  });

  // ── List all workspace files in ~/.openp41ge/workspaces/ ───────────

  ipcMain.handle("dialog:listWorkspaces", async () => {
    const dir = path.join(os.homedir(), ".openp41ge", "workspaces");
    try {
      if (!fs.existsSync(dir)) return [];
      const files = fs.readdirSync(dir);
      const workspaces: Array<{ filePath: string; data: WorkspaceFileData }> = [];
      for (const file of files) {
        if (!file.endsWith(`.${WORKSPACE_EXT}`)) continue;
        const filePath = path.join(dir, file);
        try {
          const data = readWorkspaceFile(filePath);
          workspaces.push({ filePath, data });
        } catch {
          // skip unparseable files
        }
      }
      // Sort by name (or id if no name), case-insensitive
      workspaces.sort((a, b) => {
        const na = (a.data.name ?? a.data.id).toLowerCase();
        const nb = (b.data.name ?? b.data.id).toLowerCase();
        return na.localeCompare(nb);
      });
      return workspaces;
    } catch {
      return [];
    }
  });
}
