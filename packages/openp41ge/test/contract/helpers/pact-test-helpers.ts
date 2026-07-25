/**
 * Test helpers for Pact contract tests.
 *
 * Provides:
 * - createMockIpcBridge: an HTTP adapter that maps Pact mock server calls
 *   to the shapes expected by IPC consumers
 * - Provider state setup functions for provider verification tests
 */

import type { V3MockServer } from "@pact-foundation/pact/src/v3/types";

// ─── IPC Bridge HTTP Adapter ─────────────────────────────────────────────

/**
 * Thin HTTP client that calls the Pact mock server as if it were the
 * main-process IPC handler.
 *
 * Each IPC method maps to a POST at `/{namespace}.{method}`. The mock
 * server returns the agreed response shape, and the test verifies the
 * production consumer code (e.g., IpcRepoService) can parse it.
 *
 * Usage in consumer tests:
 * ```
 * const bridge = createMockIpcBridge(mockServer.url);
 * const repos = await bridge.listRepos();
 * ```
 */
export function createMockIpcBridge(baseUrl: string) {
  async function post<T>(path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      throw new Error(`IPC mock returned ${res.status} for ${path}`);
    }

    const text = await res.text();
    // Pact returns empty body for null responses; treat as null
    if (!text || text === "") return null as unknown as T;
    return JSON.parse(text) as T;
  }

  return {
    // ── RepoService ─────────────────────────────────────────────
    listRepos: () => post<{ name: string; url: string }[]>("/workspaceController.listRepos"),

    getRepo: (name: string) =>
      post<{ name: string; url: string } | null>("/workspaceController.getRepo", { name }),

    // ── RepositoryModel ─────────────────────────────────────────
    listWorktrees: (repoName: string) =>
      post<{ branch: string; path: string; exists: boolean }[]>(
        "/workspaceController.listWorktrees",
        { repoName },
      ),

    checkoutWorktree: (repoName: string, branch: string) =>
      post<{ branch: string; path: string; exists: boolean }>(
        "/workspaceController.checkoutWorktree",
        { repoName, branch },
      ),

    deleteWorktree: (repoName: string, branch: string) =>
      post<void>("/workspaceController.deleteWorktree", { repoName, branch }),

    pullBranch: (repoName: string, branch: string) =>
      post<void>("/workspaceController.pullBranch", { repoName, branch }),

    fetch: (repoName: string) => post<void>("/workspaceController.fetch", { repoName }),

    listBranches: (repoName: string) =>
      post<string[]>("/workspaceController.listBranches", { repoName }),

    getDefaultBranch: (repoName: string) =>
      post<string | null>("/workspaceController.getDefaultBranch", { repoName }),

    clone: (url: string) =>
      post<{ path: string; success: boolean }>("/workspaceController.clone", { url }),

    // ── File operations ──────────────────────────────────────────
    readdir: (dirPath: string) =>
      post<
        { name: string; path: string; isDirectory: boolean; size: number; modifiedAt: string }[]
      >("/file.readdir", { dirPath }),

    readRange: (filePath: string, offset: number, length: number) =>
      post<{ data: string; totalSize: number }>("/file.readRange", { filePath, offset, length }),

    writeFile: (filePath: string, content: string) =>
      post<{ success: boolean }>("/file.writeFile", { filePath, content }),

    stat: (filePath: string) =>
      post<{
        name: string;
        path: string;
        isDirectory: boolean;
        size: number;
        modifiedAt: string;
      } | null>("/file.stat", { filePath }),

    // ── Config operations ───────────────────────────────────────
    configGet: (key: string) => post<unknown>("/config.get", { key }),
    configGetAll: () => post<Record<string, unknown>>("/config.getAll"),

    // ── Project operations ──────────────────────────────────────
    projectList: () => post<{ name: string; path: string }[]>("/project.list"),
    projectCurrent: () => post<{ name: string; path: string } | null>("/project.current"),
  };
}

export type MockIpcBridge = ReturnType<typeof createMockIpcBridge>;

// ─── Provider State Setup ───────────────────────────────────────────────

/**
 * Provider state handler definitions.
 *
 * Each function sets up a specific provider state for verification.
 * Provider tests register these with the Pact Verifier.
 */
export const providerStateHandlers: Record<string, () => Promise<void>> = {
  "repositories exist": async () => {
    // In provider verification, this sets up the test repo state.
    // For now, a no-op — the verifier asserts the handler can be called.
  },
  "no worktrees exist": async () => {
    // No-op for verification
  },
  "worktrees exist": async () => {
    // No-op for verification
  },
  "grid is empty": async () => {
    // No-op for verification
  },
  "grid has tabs": async () => {
    // No-op for verification
  },
};

/**
 * Get a provider state setup function by name.
 */
export function getProviderStateHandler(name: string): () => Promise<void> {
  return providerStateHandlers[name] ?? (async () => {});
}
