/**
 * CommitOpenHandler — handles git commit-result preview opens for the
 * `openp41ge:open-commit` event (Git sidebar commit search).
 *
 * Operates at the window level, mirroring FileOpenHandler's VS Code preview
 * model for `git-repository` tabs:
 *   - pinned=false (unpinned): single-click opens a preview git-repository tab.
 *   - pinned=true: second click / double-click pins it (permanent).
 *   - An existing git-repository tab for the same repo in the target cell is
 *     activated instead of duplicating.
 *
 * After the pending repo (and optional branch) is set, the tab opens via
 * actionOpenFile(winId, "git-repository", title, repoName, col, pinned) — the
 * same call grid drops use, so GitRepositoryController picks up the payload.
 */

import type { ICommandBus } from "../interfaces/command-bus";
import type { IWorkspaceStateManager } from "../interfaces/workspace-state-manager";

import type { Tab } from "../../layout/types";

import { createLogger } from "openp41ge-logger";
import { Openp41geTabsEventHandler } from "./openp41ge-tabs-event-handler";

const log = createLogger("openp41ge", "commit-open-handler");

export class CommitOpenHandler {
  private _commandBus: ICommandBus | null = null;
  private _workspaceState: IWorkspaceStateManager | null = null;

  init(commandBus: ICommandBus, workspaceState: IWorkspaceStateManager): void {
    this._commandBus = commandBus;
    this._workspaceState = workspaceState;
  }

  handleOpenCommit(e: CustomEvent): void {
    const detail = (e.detail ?? {}) as {
      repoName?: string;
      hash?: string;
      branch?: string;
      pinned?: boolean;
      mode?: string;
      col?: number;
    };
    const repoName = detail.repoName;
    if (!repoName) return;

    const branch = detail.branch;
    const title = branch || repoName;

    let pinned: boolean;
    if (typeof detail.pinned === "boolean") {
      pinned = detail.pinned;
    } else {
      pinned = (detail.mode || "preview") !== "preview";
    }

    const myWindowId = window.openp41ge.workspace.getWindowId();
    if (!myWindowId) {
      log.warn("open-commit skipped — no window context");
      return;
    }
    const targetCol = detail.col !== undefined ? detail.col : this._getLastActiveCellCol();

    // Step 1: an existing git-repository tab for this repo in the target cell
    // → activate it; a second click on the same preview pins it.
    const existingTabId = this._findGitTabInCell(repoName, targetCol);
    if (existingTabId) {
      const tab = this._getTab(existingTabId);
      if (tab && tab.isPreview && pinned) {
        log.info("pin git preview via second click", existingTabId);
        this._commandBus!.dispatch("pinTabInCell", myWindowId, targetCol, existingTabId);
      } else {
        log.info("activate existing git tab", existingTabId);
        this._commandBus!.dispatch("activateTabInCell", myWindowId, existingTabId);
      }
      return;
    }

    // Step 2 + 3: set the pending repo so GitRepositoryController mount picks
    // it up, then open a preview (replaces the cell's preview slot when
    // unpinned) or a permanent tab.
    this._setPendingGit(repoName, branch);
    log.info("open git tab", repoName, pinned ? "pinned" : "unpinned");
    this._commandBus!.dispatch(
      "actionOpenFile",
      myWindowId,
      "git-repository",
      title,
      repoName,
      targetCol,
      pinned,
    );
  }

  private _setPendingGit(repoName: string, branch?: string): void {
    const g = window as unknown as Record<string, unknown>;
    g.__pendingGitRepo = repoName;
    g.__pendingGitWorktree = branch ?? null;
  }

  /**
   * Open a read-only diff of one file at a commit (git sidebar file rows).
   * Single-click → unpinned preview; double-click/second click → pinned. An
   * existing commit-file-diff tab for (repo, hash, path) in the cell is
   * activated instead of duplicating.
   */
  handleOpenCommitFile(e: CustomEvent): void {
    const detail = (e.detail ?? {}) as {
      repoName?: string;
      hash?: string;
      path?: string;
      name?: string;
      pinned?: boolean;
      mode?: string;
      col?: number;
    };
    const { repoName, hash, path } = detail;
    if (!repoName || !hash || !path) return;

    let pinned: boolean;
    if (typeof detail.pinned === "boolean") {
      pinned = detail.pinned;
    } else {
      pinned = (detail.mode || "preview") !== "preview";
    }

    const myWindowId = window.openp41ge.workspace.getWindowId();
    if (!myWindowId) {
      log.warn("open-commit-file skipped — no window context");
      return;
    }
    const targetCol = detail.col !== undefined ? detail.col : this._getLastActiveCellCol();

    // Activate (or promote) an existing commit-file-diff tab for this file.
    const existingTabId = this._findCommitFileTabInCell(repoName, hash, path, targetCol);
    if (existingTabId) {
      const tab = this._getTab(existingTabId);
      if (tab && tab.isPreview && pinned) {
        log.info("pin commit-file diff via second click", existingTabId);
        this._commandBus!.dispatch("pinTabInCell", myWindowId, targetCol, existingTabId);
      } else {
        log.info("activate existing commit-file diff", existingTabId);
        this._commandBus!.dispatch("activateTabInCell", myWindowId, existingTabId);
      }
      return;
    }

    const title = `${path.split("/").pop() ?? path} — ${hash.slice(0, 7)}`;
    const config = JSON.stringify({ repoName, hash, path });
    (window as unknown as Record<string, unknown>).__pendingCommitFileDiff = {
      repoName,
      hash,
      path,
    };
    log.info("open commit-file diff", title, pinned ? "pinned" : "unpinned");
    this._commandBus!.dispatch(
      "actionOpenFile",
      myWindowId,
      "commit-file-diff",
      title,
      config,
      targetCol,
      pinned,
    );
  }

  /** Find a commit-file-diff tab in the cell whose JSON config matches. */
  private _findCommitFileTabInCell(
    repoName: string,
    hash: string,
    path: string,
    col: number,
  ): string | null {
    const ws = this._workspaceState?.getWorkspace();
    if (!ws) return null;
    const myWindowId = window.openp41ge.workspace.getWindowId();
    const win = ws.windows.find((w) => w.id === myWindowId);
    if (!win) return null;

    const pl = win.grid.placements.find((p) => p.position.row === 0 && p.position.col === col);
    if (!pl) return null;

    const tabs = ws.editorTabs as Record<string, Tab | undefined>;
    for (const tabId of pl.tabIds) {
      const tab = tabs[tabId];
      if (tab && tab.appType === "commit-file-diff" && typeof tab.config?.filePath === "string") {
        const cfg = safeParseJson(tab.config.filePath);
        if (cfg && cfg.repoName === repoName && cfg.hash === hash && cfg.path === path) {
          return tabId;
        }
      }
    }
    return null;
  }

  private _getLastActiveCellCol(): number {
    const myWindowId = window.openp41ge.workspace.getWindowId();
    if (!myWindowId) return 0;

    const col = Openp41geTabsEventHandler.getLastFocusedCol(myWindowId);

    const ws = this._workspaceState?.getWorkspace();
    if (ws) {
      const win = ws.windows.find((w) => w.id === myWindowId);
      if (win) {
        const hasCol = win.grid.placements.some(
          (p) => p.position.row === 0 && p.position.col === col,
        );
        if (hasCol) return col;
        const fallback = win.grid.placements.find((p) => p.position.row === 0);
        if (fallback) return fallback.position.col;
      }
    }
    return 0;
  }

  /** Find a git-repository tab in the cell whose config path matches repoName. */
  private _findGitTabInCell(repoName: string, col: number): string | null {
    const ws = this._workspaceState?.getWorkspace();
    if (!ws) return null;
    const myWindowId = window.openp41ge.workspace.getWindowId();
    const win = ws.windows.find((w) => w.id === myWindowId);
    if (!win) return null;

    const pl = win.grid.placements.find((p) => p.position.row === 0 && p.position.col === col);
    if (!pl) return null;

    const tabs = ws.editorTabs as Record<string, Tab | undefined>;
    for (const tabId of pl.tabIds) {
      const tab = tabs[tabId];
      if (tab && tab.appType === "git-repository" && tab.config?.filePath === repoName) {
        return tabId;
      }
    }
    return null;
  }

  private _getTab(tabId: string): Tab | null {
    const ws = this._workspaceState?.getWorkspace();
    if (!ws) return null;
    const tabs = ws.editorTabs as Record<string, Tab | undefined>;
    return tabs[tabId] ?? null;
  }
}

function safeParseJson(json: string): { repoName?: string; hash?: string; path?: string } | null {
  try {
    const v = JSON.parse(json) as { repoName?: string; hash?: string; path?: string };
    return v && typeof v === "object" ? v : null;
  } catch {
    return null;
  }
}
