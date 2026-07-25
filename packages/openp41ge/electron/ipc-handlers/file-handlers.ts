/**
 * File system IPC handlers.
 */

import { ipcMain, dialog } from "electron";
import fs from "fs";
import path from "path";
import type { OperationDispatcher } from "../../src/main/index.js";
import type { ElectronFileSystem, NodeGitService } from "../../src/main/index.js";

export function registerFileHandlers(
  fileSystem: ElectronFileSystem,
  gitService: NodeGitService,
  dispatcher: OperationDispatcher,
): void {
  ipcMain.handle("file:readdir", async (_event, dirPath: string) => {
    return fileSystem.readdir(dirPath);
  });

  ipcMain.handle("file:stat", async (_event, filePath: string) => {
    return fileSystem.stat(filePath);
  });

  ipcMain.handle(
    "file:readRange",
    async (_event, filePath: string, offset: number, length: number) => {
      return fileSystem.readRange(filePath, offset, length);
    },
  );

  ipcMain.handle("file:startChunkedRead", async (event, filePath: string) => {
    const CHUNK_SIZE = 16 * 1024;
    return fileSystem.readChunked(filePath, CHUNK_SIZE, (progress) => {
      event.sender.send("file:chunkProgress", progress);
    });
  });

  ipcMain.handle("file:writeFile", async (_event, filePath: string, content: string) => {
    return fileSystem.writeFile(filePath, content);
  });

  // ── File scope/search ────────────────────────────────────────────────────

  ipcMain.handle("file:getScope", async () => {
    return dispatcher.getWorkspace().scopedFolders ?? [];
  });

  ipcMain.handle("file:addScope", async (_event, dirPath: string) => {
    const resolved = path.resolve(dirPath);
    try {
      const stat = fs.statSync(resolved);
      if (!stat.isDirectory()) return false;
    } catch {
      return false;
    }
    const ws = dispatcher.getWorkspace();
    if (ws.scopedFolders.includes(resolved)) return true;
    dispatcher.setWorkspace({
      ...ws,
      scopedFolders: [...ws.scopedFolders, resolved],
    });
    dispatcher.broadcast();
    return true;
  });

  ipcMain.handle("file:removeScope", async (_event, dirPath: string) => {
    const resolved = path.resolve(dirPath);
    const ws = dispatcher.getWorkspace();
    dispatcher.setWorkspace({
      ...ws,
      scopedFolders: ws.scopedFolders.filter((f) => f !== resolved),
    });
    dispatcher.broadcast();
    return true;
  });

  /**
   * Search for files matching a query within the given root paths.
   */
  ipcMain.handle("file:search", async (_event, query: string, rootPaths: string[]) => {
    if (!query || query.length < 1) return [];
    const q = query.toLowerCase();
    const results: { path: string; name: string; dir: string }[] = [];
    const maxResults = 50;

    function walk(dir: string, depth: number) {
      if (depth > 5 || results.length >= maxResults) return;
      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        if (results.length >= maxResults) return;
        if (entry.name.startsWith(".") && depth < 2) continue;
        const fullPath = path.join(dir, entry.name);
        if (entry.name.toLowerCase().includes(q)) {
          results.push({ path: fullPath, name: entry.name, dir });
        }
        if (entry.isDirectory()) {
          walk(fullPath, depth + 1);
        }
      }
    }

    for (const root of rootPaths) {
      try {
        walk(path.resolve(root), 0);
      } catch {
        // skip invalid roots
      }
      if (results.length >= maxResults) break;
    }

    return results;
  });

  /**
   * Search for recent/preferred files within the given root paths.
   */
  ipcMain.handle("file:listRecent", async (_event, rootPaths: string[]) => {
    const preferred = [
      "readme",
      "readme.md",
      "readme.txt",
      "makefile",
      "makefile.mk",
      "package.json",
      "index.html",
      "index.js",
      "index.ts",
      ".gitignore",
      "dockerfile",
      "docker-compose.yml",
      "tsconfig.json",
      "vite.config.ts",
      "vite.config.js",
      ".env",
      ".env.example",
      "package-lock.json",
    ];

    interface RecentEntry {
      path: string;
      name: string;
      dir: string;
      mtime: number;
    }
    const results: RecentEntry[] = [];
    const maxResults = 50;

    function walk(dir: string, depth: number) {
      if (depth > 4 || results.length >= maxResults * 2) return;
      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        if (results.length >= maxResults * 2) return;
        if (entry.name.startsWith(".") && depth < 2) continue;
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(fullPath, depth + 1);
        } else {
          try {
            const stat = fs.statSync(fullPath);
            results.push({ path: fullPath, name: entry.name, dir, mtime: stat.mtimeMs });
          } catch {
            // skip unreadable files
          }
        }
      }
    }

    for (const root of rootPaths) {
      try {
        walk(path.resolve(root), 0);
      } catch {
        // skip invalid roots
      }
      if (results.length >= maxResults * 2) break;
    }

    results.sort((a, b) => {
      const aPref = preferred.includes(a.name.toLowerCase());
      const bPref = preferred.includes(b.name.toLowerCase());
      if (aPref && !bPref) return -1;
      if (!aPref && bPref) return 1;
      if (a.mtime !== b.mtime) return b.mtime - a.mtime;
      return a.name.localeCompare(b.name);
    });

    return results.slice(0, maxResults).map(({ mtime: _mtime, ...rest }) => rest);
  });

  ipcMain.handle("file:pickFolder", async () => {
    const result = await dialog.showOpenDialog({ properties: ["openDirectory"] });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  ipcMain.handle("file:gitBranch", async (_event, dirPath: string) => {
    return gitService.getCurrentBranch(dirPath);
  });
}
