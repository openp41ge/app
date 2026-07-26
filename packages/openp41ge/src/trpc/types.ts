/**
 * Shared type definitions for typed IPC between main process and renderer.
 *
 * These types are consumed by both sides:
 * - `electron/trpc/handlers/` — main process handler implementations
 * - `electron/preload.cjs` — contextBridge proxy that wraps ipcRenderer.invoke
 * - `src/renderer/` — renderer code calling window.openp41ge.*
 *
 * Instead of individual ipcMain.handle / ipcRenderer.invoke channels per
 * operation, all typed calls go through a single channel "rpc:call" with
 * { domain, method, input } routing. The types here ensure both sides
 * agree on the request/response shapes at compile time.
 */

// ─── Repo types ──────────────────────────────────────────────────────────

export interface RepoInfo {
  name: string;
  url: string;
}

export interface WorktreeInfo {
  branch: string;
  path: string;
  exists: boolean;
}

// ─── File types ──────────────────────────────────────────────────────────

export interface FileEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  size: number;
  modifiedAt: number;
}

export interface ReadRangeResult {
  data: string;
  totalSize: number;
}

export interface WriteFileResult {
  success: boolean;
}

// ─── Config types ────────────────────────────────────────────────────────

export type ConfigValue = string | number | boolean | null;

// ─── RPC Procedure Map ───────────────────────────────────────────────────

/**
 * Maps (domain, method) → { input, output }.
 *
 * Each entry defines the expected input type (sent as the second argument
 * to ipcRenderer.invoke) and the output type (what the handler returns).
 * Input is `void` when no payload is needed.
 */
export interface RpcProcedures {
  workspace: {
    listRepos: {
      input: void;
      output: RepoInfo[];
    };
    getRepo: {
      input: { name: string };
      output: RepoInfo | null;
    };
    listWorktrees: {
      input: { repoName: string };
      output: WorktreeInfo[];
    };
    checkoutWorktree: {
      input: { repoName: string; branch: string };
      output: WorktreeInfo;
    };
    deleteWorktree: {
      input: { repoName: string; branch: string };
      output: void;
    };
    pullBranch: {
      input: { repoName: string; branch: string };
      output: void;
    };
    fetch: {
      input: { repoName: string };
      output: void;
    };
    listBranches: {
      input: { repoName: string };
      output: string[];
    };
    getDefaultBranch: {
      input: { name: string };
      output: string | null;
    };
  };
  file: {
    readdir: {
      input: { dirPath: string };
      output: FileEntry[];
    };
    readRange: {
      input: { filePath: string; offset: number; length: number };
      output: ReadRangeResult;
    };
    writeFile: {
      input: { filePath: string; content: string };
      output: WriteFileResult;
    };
    stat: {
      input: { filePath: string };
      output: FileEntry | null;
    };
  };
  config: {
    get: {
      input: { key: string };
      output: ConfigValue;
    };
    getAll: {
      input: void;
      output: Record<string, ConfigValue>;
    };
  };
}

// ─── Helper types for indexed access ────────────────────────────────────

type RpcProcedure<
  D extends keyof RpcProcedures,
  M extends keyof RpcProcedures[D],
> = RpcProcedures[D][M];

interface RpcProcedureShape {
  input: unknown;
  output: unknown;
}

// ─── IPC wire format ─────────────────────────────────────────────────────

/**
 * The payload sent over the single "rpc:call" IPC channel.
 */
export type RpcCallPayload<D extends keyof RpcProcedures, M extends keyof RpcProcedures[D]> = {
  domain: D;
  method: M;
  input: RpcProcedure<D, M> extends RpcProcedureShape ? RpcProcedure<D, M>["input"] : never;
};

/**
 * Extract the output type for a given procedure.
 */
export type RpcOutput<D extends keyof RpcProcedures, M extends keyof RpcProcedures[D]> =
  RpcProcedure<D, M> extends RpcProcedureShape ? RpcProcedure<D, M>["output"] : never;
