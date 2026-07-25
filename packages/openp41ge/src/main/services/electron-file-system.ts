import fs from "fs";
import path from "path";
import type {
  IFileSystemService,
  FileEntryInfo,
  ChunkedReadResult,
} from "../interfaces/file-system-service.js";

/**
 * Electron main-process file system service.
 *
 * Wraps Node.js fs operations with proper error handling.
 * All paths should be absolute.
 */
export class ElectronFileSystem implements IFileSystemService {
  async readdir(dirPath: string): Promise<FileEntryInfo[]> {
    const resolved = path.resolve(dirPath);
    if (!fs.existsSync(resolved)) return [];

    const entries = fs.readdirSync(resolved, { withFileTypes: true });
    const result: FileEntryInfo[] = [];

    for (const entry of entries) {
      const fullPath = path.join(resolved, entry.name);
      let size = 0;
      let modifiedAt = 0;
      try {
        const stat = fs.statSync(fullPath);
        size = entry.isFile() ? stat.size : 0;
        modifiedAt = stat.mtimeMs;
      } catch {
        // Permission denied or broken symlink — skip
        continue;
      }
      result.push({
        name: entry.name,
        path: fullPath,
        isDirectory: entry.isDirectory(),
        size,
        modifiedAt,
      });
    }

    // Sort: directories first, then by name (case-insensitive)
    result.sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
      return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    });

    return result;
  }

  async stat(filePath: string): Promise<FileEntryInfo | null> {
    try {
      const resolved = path.resolve(filePath);
      const stat = fs.statSync(resolved);
      return {
        name: path.basename(resolved),
        path: resolved,
        isDirectory: stat.isDirectory(),
        size: stat.size,
        modifiedAt: stat.mtimeMs,
      };
    } catch {
      return null;
    }
  }

  async readRange(
    filePath: string,
    offset: number,
    length: number,
  ): Promise<{ data: string; totalSize: number }> {
    try {
      const resolved = path.resolve(filePath);
      const fd = await fs.promises.open(resolved, "r");
      const stats = await fd.stat();
      const totalSize = stats.size;
      const buf = Buffer.alloc(Math.min(length, Math.max(0, totalSize - offset)));
      const { bytesRead } = await fd.read(buf, 0, buf.length, offset);
      await fd.close();
      const data = buf.toString("utf-8", 0, bytesRead);
      return { data, totalSize };
    } catch {
      return { data: "", totalSize: 0 };
    }
  }

  async readChunked(
    filePath: string,
    chunkSize: number,
    onProgress: (progress: { loaded: number; total: number; chunk: string }) => void,
  ): Promise<ChunkedReadResult> {
    try {
      const resolved = path.resolve(filePath);
      const fd = await fs.promises.open(resolved, "r");
      const stats = await fd.stat();
      const totalSize = stats.size;
      let offset = 0;
      const chunks: string[] = [];

      while (offset < totalSize) {
        const toRead = Math.min(chunkSize, totalSize - offset);
        const buf = Buffer.alloc(toRead);
        const { bytesRead } = await fd.read(buf, 0, toRead, offset);
        if (bytesRead === 0) break;
        const chunkStr = buf.toString("utf-8", 0, bytesRead);
        chunks.push(chunkStr);
        offset += bytesRead;
        onProgress({ loaded: offset, total: totalSize, chunk: chunkStr });
        // Yield to the event loop every 4 chunks
        if (chunks.length % 4 === 0) {
          await new Promise((resolve) => setImmediate(resolve));
        }
      }
      await fd.close();
      return { data: chunks.join(""), totalSize };
    } catch {
      return { data: "", totalSize: 0 };
    }
  }

  async writeFile(filePath: string, content: string): Promise<{ success: boolean }> {
    try {
      const resolved = path.resolve(filePath);
      fs.mkdirSync(path.dirname(resolved), { recursive: true });
      fs.writeFileSync(resolved, content, "utf-8");
      return { success: true };
    } catch {
      return { success: false };
    }
  }

  async exists(filePath: string): Promise<boolean> {
    try {
      return fs.existsSync(path.resolve(filePath));
    } catch {
      return false;
    }
  }

  async mkdir(dirPath: string): Promise<void> {
    fs.mkdirSync(path.resolve(dirPath), { recursive: true });
  }

  async remove(filePath: string): Promise<void> {
    const resolved = path.resolve(filePath);
    if (fs.existsSync(resolved)) {
      fs.rmSync(resolved, { recursive: false });
    }
  }

  async removeRecursive(dirPath: string): Promise<void> {
    const resolved = path.resolve(dirPath);
    if (fs.existsSync(resolved)) {
      fs.rmSync(resolved, { recursive: true, force: true });
    }
  }
}
