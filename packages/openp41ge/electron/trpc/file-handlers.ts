/**
 * File system RPC handlers.
 */

import type { FileEntry, ReadRangeResult, WriteFileResult } from "../../src/trpc/types";

export interface FileService {
  readdir(dirPath: string): Promise<FileEntry[]>;
  readRange(filePath: string, offset: number, length: number): Promise<ReadRangeResult>;
  writeFile(filePath: string, content: string): Promise<WriteFileResult>;
  stat(filePath: string): Promise<FileEntry | null>;
}

class ProductionFileService implements FileService {
  async readdir(_dirPath: string): Promise<FileEntry[]> {
    throw new Error("Not yet implemented");
  }

  async readRange(_filePath: string, _offset: number, _length: number): Promise<ReadRangeResult> {
    throw new Error("Not yet implemented");
  }

  async writeFile(_filePath: string, _content: string): Promise<WriteFileResult> {
    throw new Error("Not yet implemented");
  }

  async stat(_filePath: string): Promise<FileEntry | null> {
    throw new Error("Not yet implemented");
  }
}

let _service: FileService = new ProductionFileService();

export function setFileService(service: FileService): void {
  _service = service;
}

export function getFileService(): FileService {
  return _service;
}

export const fileHandlers = {
  readdir: (dirPath: string) => _service.readdir(dirPath),
  readRange: (filePath: string, offset: number, length: number) =>
    _service.readRange(filePath, offset, length),
  writeFile: (filePath: string, content: string) => _service.writeFile(filePath, content),
  stat: (filePath: string) => _service.stat(filePath),
};
