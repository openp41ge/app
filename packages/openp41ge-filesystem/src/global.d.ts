/**
 * Minimal type declarations for the Electron preload bridge.
 *
 * The full declarations live in packages/openp41ge/src/renderer/global.d.ts.
 * This file covers only the APIs used by openp41ge-filesystem services.
 */

import type { FileEntry } from "./types";

interface Openp41geFileAPI {
  readdir(path: string): Promise<FileEntry[]>;
}

interface Openp41geWorkspaceControllerAPI {
  getUntrackedFiles(repoName: string): Promise<string[]>;
}

interface Openp41geAPI {
  file: Openp41geFileAPI;
  workspaceController: Openp41geWorkspaceControllerAPI;
}

export {};

declare global {
  interface Window {
    openp41ge: Openp41geAPI;
  }
}
