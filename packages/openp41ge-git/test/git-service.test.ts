import { describe, it, expect, beforeEach, vi } from "vitest";
import { GitService } from "../src/git-service";
import { TestGitAdapter } from "../src/test-adapter";

describe("GitService", () => {
  let adapter: TestGitAdapter;
  let service: GitService;

  beforeEach(() => {
    adapter = new TestGitAdapter();
    service = new GitService(adapter);
  });

  // ── Clone ──

  describe("clone()", () => {
    it("accepts https:// URLs", () => {
      const session = service.clone("https://github.com/example/repo.git");
      expect(session).toBeTruthy();
      expect(session.promise).toBeInstanceOf(Promise);
    });

    it("accepts git@ URLs", () => {
      const session = service.clone("git@github.com:example/repo.git");
      expect(session).toBeTruthy();
    });

    it("accepts ssh:// URLs", () => {
      const session = service.clone("ssh://git@github.com/example/repo.git");
      expect(session).toBeTruthy();
    });

    it("throws on invalid URL format", () => {
      expect(() => service.clone("not-a-url")).toThrow("Invalid URL format");
      expect(() => service.clone("")).toThrow("Invalid URL format");
      expect(() => service.clone("ftp://bad")).toThrow("Invalid URL format");
    });

    it("reports progress to single subscriber", async () => {
      const session = service.clone("https://github.com/example/repo.git");
      const progresses: number[] = [];
      session.onProgress((p) => progresses.push(p.percent));
      const result = await session.promise;
      expect(result.success).toBe(true);
      expect(progresses).toContain(50);
      expect(progresses).toContain(100);
    });

    it("reports progress to multiple subscribers", async () => {
      const session = service.clone("https://github.com/example/repo.git");
      const p1: number[] = [];
      const p2: number[] = [];
      session.onProgress((p) => p1.push(p.percent));
      session.onProgress((p) => p2.push(p.percent));
      await session.promise;
      expect(p1.length).toBeGreaterThan(0);
      expect(p2).toEqual(p1);
    });

    it("unsubscribe stops progress notifications", async () => {
      const session = service.clone("https://github.com/example/repo.git");
      const progresses: number[] = [];
      const unsub = session.onProgress((p) => progresses.push(p.percent));
      unsub();
      await session.promise;
      expect(progresses).toHaveLength(0);
    });

    it("can be destroyed before completion", async () => {
      const session = service.clone("https://github.com/example/repo.git");
      session.destroy();
      await expect(session.promise).rejects.toThrow("Clone aborted");
    });

    it("double destroy is safe", async () => {
      const session = service.clone("https://github.com/example/repo.git");
      session.destroy();
      // Suppress the expected rejection so it doesn't leak as unhandled
      session.promise.catch(() => {});
      session.destroy(); // should not throw
      await expect(session.promise).rejects.toThrow("Clone aborted");
    });

    it("clone makes the repo visible via listRepos", async () => {
      const session = service.clone("https://github.com/example/new-repo.git");
      await session.promise;
      const repos = await service.listRepos();
      expect(repos.some((r) => r.name === "new-repo")).toBe(true);
    });

    it("handles URL with complex path", async () => {
      const session = service.clone("https://github.com/org/sub-group/my-repo.git");
      await session.promise;
      const repos = await service.listRepos();
      expect(repos.some((r) => r.name === "my-repo")).toBe(true);
    });
  });

  // ── Repos ──

  describe("listRepos / getRepo / removeRepo", () => {
    it("returns empty list when no repos", async () => {
      const repos = await service.listRepos();
      expect(repos).toEqual([]);
    });

    it("lists repos added via test adapter", async () => {
      adapter.addRepo("my-repo", "https://github.com/example/my-repo.git");
      const repos = await service.listRepos();
      expect(repos).toHaveLength(1);
      expect(repos[0].name).toBe("my-repo");
    });

    it("getRepo returns null for missing repo", async () => {
      const repo = await service.getRepo("nonexistent");
      expect(repo).toBeNull();
    });

    it("getRepo returns repo info", async () => {
      adapter.addRepo("my-repo", "https://github.com/example/my-repo.git");
      const repo = await service.getRepo("my-repo");
      expect(repo).not.toBeNull();
      expect(repo!.name).toBe("my-repo");
      expect(repo!.url).toBe("https://github.com/example/my-repo.git");
    });

    it("removeRepo deletes the repo", async () => {
      adapter.addRepo("my-repo", "https://github.com/example/my-repo.git");
      await service.removeRepo("my-repo");
      const repos = await service.listRepos();
      expect(repos).toHaveLength(0);
    });

    it("removeRepo cleans up associated worktrees and branches", async () => {
      adapter.addRepo("my-repo", "url");
      adapter.addWorktreeData("my-repo", "main");
      adapter.addBranch("my-repo", "main");
      await service.removeRepo("my-repo");
      // Removed from all maps
      const wts = await service.listWorktrees("my-repo");
      expect(wts).toHaveLength(0);
      const branches = await service.listBranches("my-repo");
      expect(branches).toHaveLength(0);
    });
  });

  // ── Worktrees ──

  describe("worktrees", () => {
    it("listWorktrees returns empty list", async () => {
      const wts = await service.listWorktrees("my-repo");
      expect(wts).toEqual([]);
    });

    it("listWorktrees returns worktrees added via test adapter", async () => {
      adapter.addWorktreeData("my-repo", "main", "/path/main");
      const wts = await service.listWorktrees("my-repo");
      expect(wts).toHaveLength(1);
      expect(wts[0].branch).toBe("main");
      expect(wts[0].exists).toBe(true);
    });

    it("checkoutWorktree creates a worktree", async () => {
      const wt = await service.checkoutWorktree("my-repo", "feature-x");
      expect(wt.branch).toBe("feature-x");
      expect(wt.exists).toBe(true);
      expect(wt.path).toContain("feature-x");
    });

    it("addWorktree creates a worktree", async () => {
      const wt = await service.addWorktree("my-repo", "feature-y");
      expect(wt.branch).toBe("feature-y");
    });

    it("deleteWorktree removes the worktree", async () => {
      adapter.addWorktreeData("my-repo", "main");
      await service.deleteWorktree("my-repo", "main");
      const wts = await service.listWorktrees("my-repo");
      expect(wts).toHaveLength(0);
    });

    it("allows multiple worktrees on the same repo", async () => {
      await service.addWorktree("my-repo", "main");
      await service.addWorktree("my-repo", "develop");
      await service.addWorktree("my-repo", "feature-x");
      const wts = await service.listWorktrees("my-repo");
      expect(wts).toHaveLength(3);
    });

    it("replaces existing worktree on checkout with same branch", async () => {
      adapter.addWorktreeData("my-repo", "main", "/old/path");
      const wt = await service.checkoutWorktree("my-repo", "main");
      expect(wt.path).not.toBe("/old/path");
      const wts = await service.listWorktrees("my-repo");
      expect(wts).toHaveLength(1);
    });

    it("deleteWorktree on non-existent branch does not throw", async () => {
      await expect(
        service.deleteWorktree("my-repo", "nonexistent"),
      ).resolves.toBeUndefined();
    });
  });

  // ── Branches ──

  describe("branches", () => {
    it("listBranches returns branches from adapter", async () => {
      adapter.addBranch("my-repo", "main");
      adapter.addBranch("my-repo", "develop");
      const branches = await service.listBranches("my-repo");
      expect(branches).toEqual(["main", "develop"]);
    });

    it("listBranches returns empty array for unknown repo", async () => {
      const branches = await service.listBranches("nonexistent");
      expect(branches).toEqual([]);
    });

    it("getDefaultBranch returns first branch", async () => {
      adapter.addBranch("my-repo", "main");
      const def = await service.getDefaultBranch("my-repo");
      expect(def).toBe("main");
    });

    it("getDefaultBranch returns null when no branches", async () => {
      const def = await service.getDefaultBranch("my-repo");
      expect(def).toBeNull();
    });

    it("deleteLocalBranch resolves", async () => {
      await expect(
        service.deleteLocalBranch("my-repo", "feature-x", false),
      ).resolves.toBeUndefined();
    });
  });

  // ── Pull / Fetch ──

  describe("pull & fetch", () => {
    it("pullBranch resolves", async () => {
      await expect(
        service.pullBranch("my-repo", "main"),
      ).resolves.toBeUndefined();
    });

    it("fetch resolves", async () => {
      await expect(
        service.fetch("my-repo"),
      ).resolves.toBeUndefined();
    });
  });

  // ── Commit log & branch metadata ──

  describe("commit log & branch metadata", () => {
    it("getCommitLog returns empty array by default", async () => {
      const log = await service.getCommitLog("my-repo", "main");
      expect(log).toEqual([]);
    });

    it("getCommitLog accepts options hash", async () => {
      const log = await service.getCommitLog("my-repo", "main", {
        maxCount: 10,
        after: "abc123",
      });
      expect(log).toEqual([]);
    });

    it("getBranches returns empty array", async () => {
      const branches = await service.getBranches("my-repo");
      expect(branches).toEqual([]);
    });

    it("getDiffStat returns empty array", async () => {
      const stat = await service.getDiffStat("my-repo");
      expect(stat).toEqual([]);
    });

    it("getDiffStat accepts commit hash", async () => {
      const stat = await service.getDiffStat("my-repo", "abc123");
      expect(stat).toEqual([]);
    });

    it("getUntrackedFiles returns empty array", async () => {
      const files = await service.getUntrackedFiles("my-repo");
      expect(files).toEqual([]);
    });
  });

  // ── Workset API ──

  describe("workset API", () => {
    it("worksetAddRepo returns true", async () => {
      const ok = await service.worksetAddRepo("my-repo", "url");
      expect(ok).toBe(true);
    });

    it("worksetAddRepo accepts optional worktrees", async () => {
      const ok = await service.worksetAddRepo("my-repo", "url", ["main", "develop"]);
      expect(ok).toBe(true);
    });

    it("worksetRemoveRepo returns true", async () => {
      const ok = await service.worksetRemoveRepo("my-repo");
      expect(ok).toBe(true);
    });

    it("worksetHasRepo returns true", async () => {
      const ok = await service.worksetHasRepo("my-repo");
      expect(ok).toBe(true);
    });

    it("worksetAddWorktreeToRepo returns true", async () => {
      const ok = await service.worksetAddWorktreeToRepo("my-repo", "main");
      expect(ok).toBe(true);
    });

    it("worksetGetRepoRefs returns JSON string", async () => {
      adapter.repoRefs = JSON.stringify([
        { name: "repo1", url: "url1", worktrees: ["main"] },
      ]);
      const refs = await service.worksetGetRepoRefs();
      expect(refs).toBe(
        JSON.stringify([{ name: "repo1", url: "url1", worktrees: ["main"] }]),
      );
    });
  });

  // ── onWorksetRepoRefsChanged ──

  describe("onWorksetRepoRefsChanged", () => {
    it("calls callback when triggered via adapter", () => {
      const cb = vi.fn();
      const unsub = service.onWorksetRepoRefsChanged(cb);
      // Trigger the adapter's refs changed callbacks
      adapter._refsChanged.forEach((fn) => fn());
      expect(cb).toHaveBeenCalledTimes(1);
      unsub();
    });

    it("unsubscribe stops receiving callbacks", () => {
      const cb = vi.fn();
      const unsub = service.onWorksetRepoRefsChanged(cb);
      unsub();
      adapter._refsChanged.forEach((fn) => fn());
      expect(cb).not.toHaveBeenCalled();
    });
  });

  // ── Integration ──

  describe("integration", () => {
    it("clone -> listWorktrees -> addWorktree -> deleteWorktree flow", async () => {
      const session = service.clone("https://github.com/example/integration-repo.git");
      await session.promise;

      // Repo is now visible
      const repos = await service.listRepos();
      const repo = repos.find((r) => r.name === "integration-repo");
      expect(repo).toBeTruthy();

      // No worktrees initially
      let wts = await service.listWorktrees("integration-repo");
      expect(wts).toHaveLength(0);

      // Add worktree
      await service.addWorktree("integration-repo", "feature-foo");
      wts = await service.listWorktrees("integration-repo");
      expect(wts).toHaveLength(1);

      // Delete worktree
      await service.deleteWorktree("integration-repo", "feature-foo");
      wts = await service.listWorktrees("integration-repo");
      expect(wts).toHaveLength(0);
    });

    it("operates on multiple repos independently", async () => {
      adapter.addRepo("repo-a", "url-a");
      adapter.addRepo("repo-b", "url-b");
      adapter.addWorktreeData("repo-a", "main");
      adapter.addWorktreeData("repo-b", "develop");

      expect(await service.listWorktrees("repo-a")).toHaveLength(1);
      expect(await service.listWorktrees("repo-b")).toHaveLength(1);

      await service.deleteWorktree("repo-a", "main");
      expect(await service.listWorktrees("repo-a")).toHaveLength(0);
      expect(await service.listWorktrees("repo-b")).toHaveLength(1);
    });
  });
});
