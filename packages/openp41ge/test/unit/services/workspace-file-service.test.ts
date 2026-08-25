import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  WorkspaceFileService,
  workspaceMatchesQuery,
  deriveRepoName,
} from "../../../src/renderer/services/workspace-file-service";
import type { WorkspaceFileData } from "../../../src/layout/types";

function wsData(overrides: Partial<{ name?: string }> = {}): {
  id: string;
  name?: string;
  version: number;
  createdAt: string;
  dataDir: string;
  repos: Array<{ url: string; worktrees: string[] }>;
} {
  return { id: "1", version: 1, createdAt: "", dataDir: "", repos: [], ...overrides };
}

describe("WorkspaceFileService.activeWorkspaceName", () => {
  let svc: WorkspaceFileService;

  beforeEach(() => {
    svc = new WorkspaceFileService();
  });

  it("uses data.name when set (trimmed)", () => {
    svc.activeFilePath = "~/.openp41ge/workspaces/x.openp41ge-workspace";
    svc.activeData = wsData({ name: "  My Workspace  " });
    expect(svc.activeWorkspaceName).toBe("My Workspace");
  });

  it("falls back to the file basename (minus extension) when no name is set", () => {
    svc.activeFilePath = "~/.openp41ge/workspaces/abc.openp41ge-workspace";
    svc.activeData = wsData();
    expect(svc.activeWorkspaceName).toBe("abc");
  });

  it("falls back to the basename when name is only whitespace", () => {
    svc.activeFilePath = "~/dir/foo.openp41ge-workspace";
    svc.activeData = wsData({ name: "   " });
    expect(svc.activeWorkspaceName).toBe("foo");
  });

  it("returns 'No workspace' when nothing is active", () => {
    expect(svc.activeWorkspaceName).toBe("No workspace");
  });
});

describe("workspaceMatchesQuery", () => {
  const data = (overrides: Partial<WorkspaceFileData> = {}): WorkspaceFileData => ({
    id: "1",
    name: "Alpha",
    version: 1,
    createdAt: "",
    dataDir: "",
    repos: [
      { url: "https://github.com/acme/widget.git", worktrees: ["main", "feature/xyz"] },
    ],
    ...overrides,
  });

  it.each([
    ["", true],
    ["   ", true],
    ["alpha", true],
    ["al", true],
    ["widget", true],
    ["acme/widget", true],
    ["feature/xyz", true],
    ["main", true],
    ["nothing-here", false],
  ])("query %j -> %s", (q, expected) => {
    expect(workspaceMatchesQuery(data(), "/x/alpha.openp41ge-workspace", q)).toBe(expected);
  });

  it("matches on the file basename when the workspace has no name", () => {
    const d = data({ name: undefined });
    expect(workspaceMatchesQuery(d, "~/.openp41ge/workspaces/zzz.openp41ge-workspace", "zzz")).toBe(
      true,
    );
  });
});

describe("WorkspaceFileService.materializeActiveRepos / deriveRepoName", () => {
  function installBridge(mocks: {
    cloneOk?: boolean;
    cloneError?: string;
    wtOk?: boolean;
    wtError?: string;
  }): {
    clone: ReturnType<typeof vi.fn>;
    worksetAddRepo: ReturnType<typeof vi.fn>;
    checkoutWorktree: ReturnType<typeof vi.fn>;
    worksetAddWorktreeToRepo: ReturnType<typeof vi.fn>;
  } {
    const clone = vi.fn().mockImplementation((_url: string) => ({
      promise: Promise.resolve({ success: mocks.cloneOk ?? true, error: mocks.cloneError }),
      onProgress: () => () => {},
      destroy: () => {},
    }));
    const worksetAddRepo = vi.fn().mockResolvedValue(true);
    const checkoutWorktree = vi
      .fn()
      .mockImplementation(() =>
        mocks.wtOk === false ? Promise.reject(new Error(mocks.wtError ?? "wt fail")) : Promise.resolve({ branch: "", path: "", exists: true }),
      );
    const worksetAddWorktreeToRepo = vi.fn().mockResolvedValue(true);
    (window as unknown as { openp41ge: { workspaceController: unknown } }).openp41ge.workspaceController = {
      clone,
      worksetAddRepo,
      checkoutWorktree,
      worksetAddWorktreeToRepo,
    };
    return { clone, worksetAddRepo, checkoutWorktree, worksetAddWorktreeToRepo };
  }

  const repo = (url: string, worktrees: string[]) => ({ url, worktrees });

  it("returns [] and calls nothing when there is no active data or repos", async () => {
    const { clone, worksetAddRepo, checkoutWorktree } = installBridge({});
    const svc = new WorkspaceFileService();
    svc.activeData = { id: "1", version: 1, createdAt: "", dataDir: "", repos: [] };

    expect(await svc.materializeActiveRepos()).toEqual([]);
    expect(clone).not.toHaveBeenCalled();
    expect(worksetAddRepo).not.toHaveBeenCalled();
    expect(checkoutWorktree).not.toHaveBeenCalled();
  });

  it("clones the bare repo, registers it, and checks out each worktree", async () => {
    const { clone, worksetAddRepo, checkoutWorktree, worksetAddWorktreeToRepo } = installBridge({});
    const svc = new WorkspaceFileService();
    svc.activeData = {
      id: "1",
      version: 1,
      createdAt: "",
      dataDir: "",
      repos: [repo("https://github.com/acme/widget.git", ["main", "feature/x"])],
    };

    const outcomes = await svc.materializeActiveRepos();

    expect(clone).toHaveBeenCalledWith("https://github.com/acme/widget.git");
    expect(worksetAddRepo).toHaveBeenCalledWith("github.com/acme/widget", "https://github.com/acme/widget.git", ["main", "feature/x"]);
    expect(checkoutWorktree).toHaveBeenCalledTimes(2);
    expect(checkoutWorktree).toHaveBeenCalledWith("github.com/acme/widget", "main");
    expect(checkoutWorktree).toHaveBeenCalledWith("github.com/acme/widget", "feature/x");
    expect(worksetAddWorktreeToRepo).toHaveBeenCalledTimes(2);
    expect(outcomes).toEqual([
      {
        url: "https://github.com/acme/widget.git",
        name: "github.com/acme/widget",
        ok: true,
        worktrees: [
          { branch: "main", ok: true },
          { branch: "feature/x", ok: true },
        ],
      },
    ]);
  });

  it("marks the repo failed (and skips worktrees) when the clone fails", async () => {
    const { clone, checkoutWorktree, worksetAddRepo } = installBridge({ cloneOk: false, cloneError: "auth" });
    const svc = new WorkspaceFileService();
    svc.activeData = {
      id: "1",
      version: 1,
      createdAt: "",
      dataDir: "",
      repos: [repo("https://github.com/acme/widget.git", ["main"])],
    };

    const outcomes = await svc.materializeActiveRepos();

    expect(clone).toHaveBeenCalledWith("https://github.com/acme/widget.git");
    expect(worksetAddRepo).not.toHaveBeenCalled();
    expect(checkoutWorktree).not.toHaveBeenCalled();
    expect(outcomes[0]).toMatchObject({ url: "https://github.com/acme/widget.git", ok: false, error: "auth", worktrees: [] });
  });

  it("captures worktree checkout failures without failing the whole run", async () => {
    const { checkoutWorktree } = installBridge({ wtOk: false, wtError: "no branch" });
    const svc = new WorkspaceFileService();
    svc.activeData = {
      id: "1",
      version: 1,
      createdAt: "",
      dataDir: "",
      repos: [repo("https://github.com/acme/widget.git", ["main", "dev"])],
    };

    const outcomes = await svc.materializeActiveRepos();

    expect(checkoutWorktree).toHaveBeenCalledTimes(2);
    expect(outcomes[0].worktrees).toEqual([
      { branch: "main", ok: false, error: "no branch" },
      { branch: "dev", ok: false, error: "no branch" },
    ]);
    expect(outcomes[0].ok).toBe(false);
  });
});

describe("deriveRepoName", () => {
  it("derives names from SSH git@ URLs", () => {
    expect(deriveRepoName("git@github.com:acme/widget.git")).toBe("github.com/acme/widget");
  });
  it("derives names from HTTPS URLs", () => {
    expect(deriveRepoName("https://github.com/acme/widget.git")).toBe("github.com/acme/widget");
  });
  it("handles nested org paths", () => {
    expect(deriveRepoName("https://gitlab.com/org/team/proj.git")).toBe("gitlab.com/org/team/proj");
  });
  it("handles bare hosts", () => {
    expect(deriveRepoName("https://github.com/widget")).toBe("github.com/widget");
  });
});
