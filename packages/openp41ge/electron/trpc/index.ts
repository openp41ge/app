/**
 * tRPC main-process handler.
 *
 * Registers a single ipcMain.handle("rpc:call") that routes typed calls
 * to the appropriate handler based on { domain, method, input }.
 *
 * This replaces the individual ipcMain.handle registrations in
 * electron/ipc-handlers/*.ts over time.
 */

import { ipcMain } from "electron";
import type { RpcProcedures } from "../../src/trpc/types";

// ─── Handler registry ────────────────────────────────────────────────────

type RpcProc<
  D extends keyof RpcProcedures,
  M extends keyof RpcProcedures[D],
> = RpcProcedures[D][M] extends { input: unknown; output: unknown } ? RpcProcedures[D][M] : never;

type HandlerFn<D extends keyof RpcProcedures, M extends keyof RpcProcedures[D]> = (
  input: RpcProc<D, M>["input"],
) => RpcProc<D, M>["output"] | Promise<RpcProc<D, M>["output"]>;

const handlers = new Map<string, HandlerFn<any, any>>();

function register<D extends keyof RpcProcedures, M extends keyof RpcProcedures[D]>(
  domain: D,
  method: M,
  fn: HandlerFn<D, M>,
) {
  handlers.set(`${String(domain)}.${String(method)}`, fn);
}

/**
 * Get a handler by domain.method key.
 * Returns undefined if not found.
 */
function getHandler(domain: string, method: string): HandlerFn<any, any> | undefined {
  return handlers.get(`${domain}.${method}`);
}

// ─── Register handlers ───────────────────────────────────────────────────

// These are thin wrappers that delegate to existing services.
// As we migrate, the actual logic moves here and the old ipc-handlers/*.ts
// files are removed.

import { reposHandlers } from "./repos-handlers";
import { fileHandlers } from "./file-handlers";
import { configHandlers } from "./config-handlers";

// Workspace domain
register("workspace", "listRepos", () => reposHandlers.listRepos());
register("workspace", "getRepo", (input) => reposHandlers.getRepo(input.name));
register("workspace", "listWorktrees", (input) => reposHandlers.listWorktrees(input.repoName));
register("workspace", "checkoutWorktree", (input) =>
  reposHandlers.checkoutWorktree(input.repoName, input.branch),
);
register("workspace", "deleteWorktree", (input) =>
  reposHandlers.deleteWorktree(input.repoName, input.branch),
);
register("workspace", "pullBranch", (input) =>
  reposHandlers.pullBranch(input.repoName, input.branch),
);
register("workspace", "fetch", (input) => reposHandlers.fetch(input.repoName));
register("workspace", "listBranches", (input) => reposHandlers.listBranches(input.repoName));
register("workspace", "getDefaultBranch", (input) => reposHandlers.getDefaultBranch(input.name));

// File domain
register("file", "readdir", (input) => fileHandlers.readdir(input.dirPath));
register("file", "readRange", (input) =>
  fileHandlers.readRange(input.filePath, input.offset, input.length),
);
register("file", "writeFile", (input) => fileHandlers.writeFile(input.filePath, input.content));
register("file", "stat", (input) => fileHandlers.stat(input.filePath));

// Config domain
register("config", "get", (input) => configHandlers.get(input.key));
register("config", "getAll", () => configHandlers.getAll());

// ─── IPC handler registration ────────────────────────────────────────────

/**
 * Register the main-process IPC handler for typed RPC calls.
 * Call this during app initialization.
 */
export function registerRpcIpcHandler(): void {
  ipcMain.handle(
    "rpc:call",
    async (_event, payload: { domain: string; method: string; input: unknown }) => {
      const { domain, method, input } = payload;
      const handler = getHandler(domain, method);
      if (!handler) {
        throw new Error(`Unknown RPC procedure: ${domain}.${method}`);
      }
      return handler(input);
    },
  );
}
