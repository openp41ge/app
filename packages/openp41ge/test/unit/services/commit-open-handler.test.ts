/**
 * Unit tests for CommitOpenHandler — the VS Code-style preview open for
 * `openp41ge:open-commit` from the Git sidebar commit search.
 *
 * Mirrors FileOpenHandler: existing git tab in cell → activate/pin-on-second;
 * else open an unpinned preview (or pinned on double-click) via actionOpenFile
 * after setting __pendingGitRepo (and __pendingGitWorktree for branch rows).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { CommitOpenHandler } from "../../../src/renderer/services/commit-open-handler";
import { Openp41geTabsEventHandler } from "../../../src/renderer/services/openp41ge-tabs-event-handler";

type Tab = {
  appType: string;
  isPreview?: boolean;
  config?: { filePath?: string };
};

function makeWorkspace(tabs: Record<string, Tab>, col = 0) {
  return {
    windows: [
      {
        id: "win-1",
        grid: {
          placements: [{ position: { row: 0, col }, tabIds: Object.keys(tabs) }],
        },
      },
    ],
    editorTabs: tabs,
  };
}

function installBridge(): void {
  (window as unknown as { openp41ge: unknown }).openp41ge = {
    workspace: { getWindowId: () => "win-1" },
  } as unknown as typeof window.openp41ge;
}

describe("CommitOpenHandler", () => {
  let dispatch: ReturnType<typeof vi.fn>;
  let workspace: ReturnType<typeof makeWorkspace>;
  let handler: CommitOpenHandler;

  beforeEach(() => {
    installBridge();
    dispatch = vi.fn();
    handler = new CommitOpenHandler();
    Openp41geTabsEventHandler.lastFocusedCol["win-1"] = 0;
  });

  it("opens a new unpinned preview git tab with the pending repo set", () => {
    workspace = makeWorkspace({});
    handler.init({ dispatch: dispatch as never }, { getWorkspace: () => workspace } as never);

    handler.handleOpenCommit(
      new CustomEvent("openp41ge:open-commit", {
        detail: { repoName: "acme", hash: "abc", pinned: false },
      }),
    );

    expect((window as unknown as { __pendingGitRepo: unknown }).__pendingGitRepo).toBe("acme");
    expect(dispatch).toHaveBeenCalledWith(
      "actionOpenFile",
      "win-1",
      "git-repository",
      "acme",
      "acme",
      0,
      false,
    );
  });

  it("sets __pendingGitWorktree when a branch is provided", () => {
    workspace = makeWorkspace({});
    handler.init({ dispatch: dispatch as never }, { getWorkspace: () => workspace } as never);

    handler.handleOpenCommit(
      new CustomEvent("openp41ge:open-commit", {
        detail: { repoName: "acme", hash: "abc", branch: "main", pinned: true },
      }),
    );

    expect((window as unknown as { __pendingGitWorktree: unknown }).__pendingGitWorktree).toBe(
      "main",
    );
    // Worktree-scoped tabs are titled by the branch.
    expect(dispatch).toHaveBeenCalledWith(
      "actionOpenFile",
      "win-1",
      "git-repository",
      "main",
      "acme",
      0,
      true,
    );
  });

  it("activates an existing git tab for the same repo instead of duplicating", () => {
    workspace = makeWorkspace({
      t1: { appType: "git-repository", config: { filePath: "acme" } },
    });
    handler.init({ dispatch: dispatch as never }, { getWorkspace: () => workspace } as never);

    handler.handleOpenCommit(
      new CustomEvent("openp41ge:open-commit", {
        detail: { repoName: "acme", hash: "abc", pinned: false },
      }),
    );

    expect(dispatch).toHaveBeenCalledWith("activateTabInCell", "win-1", "t1");
    expect(dispatch).not.toHaveBeenCalledWith(expect.stringContaining("actionOpenFile"));
  });

  it("pins an existing preview git tab on a second (pinned) open", () => {
    workspace = makeWorkspace({
      t1: { appType: "git-repository", config: { filePath: "acme" }, isPreview: true },
    });
    handler.init({ dispatch: dispatch as never }, { getWorkspace: () => workspace } as never);

    handler.handleOpenCommit(
      new CustomEvent("openp41ge:open-commit", {
        detail: { repoName: "acme", hash: "abc", pinned: true },
      }),
    );

    expect(dispatch).toHaveBeenCalledWith("pinTabInCell", "win-1", 0, "t1");
  });

  it("ignores events without a repoName", () => {
    workspace = makeWorkspace({});
    handler.init({ dispatch: dispatch as never }, { getWorkspace: () => workspace } as never);

    handler.handleOpenCommit(new CustomEvent("openp41ge:open-commit", { detail: {} }));
    expect(dispatch).not.toHaveBeenCalled();
  });
});
