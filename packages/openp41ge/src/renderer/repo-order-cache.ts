/**
 * Module-level in-memory cache of repo display order.
 *
 * Both the explorer worktree-tree and the project picker share this cache
 * directly (no IPC latency). When either reorders repos, it updates this
 * cache synchronously, so the other component always reads the latest order
 * immediately — even before the persistent file write completes.
 *
 * The order is also persisted via project:setRepoOrder IPC for reloads.
 */

export const repoOrderCache = new Map<string, string[]>();
