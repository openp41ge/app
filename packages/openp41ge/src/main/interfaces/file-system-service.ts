/**
 * Low-level file system operations for the main process.
 *
 * Thin wrappers around Node.js fs operations. All paths are absolute.
 * All methods are async and throw on error (callers handle errors).
 */

export interface FileEntryInfo {
  name: string;
  path: string;
  isDirectory: boolean;
  size: number;
  modifiedAt: number;
}

export interface ChunkedReadResult {
  data: string;
  totalSize: number;
}

export interface IFileSystemService {
  /** Read a directory, returning sorted entries (directories first, then alphabetical). */
  readdir(dirPath: string): Promise<FileEntryInfo[]>;

  /** Stat a single file or directory path. Returns null if not found. */
  stat(filePath: string): Promise<FileEntryInfo | null>;

  /** Read a range of bytes from a file (for virtualized viewing). */
  readRange(
    filePath: string,
    offset: number,
    length: number,
  ): Promise<{ data: string; totalSize: number }>;

  /** Read a file in chunks, invoking onProgress for each chunk. */
  readChunked(
    filePath: string,
    chunkSize: number,
    onProgress: (progress: { loaded: number; total: number; chunk: string }) => void,
  ): Promise<ChunkedReadResult>;

  /** Write content to a file. */
  writeFile(filePath: string, content: string): Promise<{ success: boolean }>;

  /** Check if a path exists. */
  exists(filePath: string): Promise<boolean>;

  /** Create a directory (including parents). Throws on failure. */
  mkdir(dirPath: string): Promise<void>;

  /** Remove a file or empty directory. Throws on failure. */
  remove(filePath: string): Promise<void>;

  /** Remove a directory and all its contents. Throws on failure. */
  removeRecursive(dirPath: string): Promise<void>;
}
