import { describe, it, expect, beforeEach } from "vitest";
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

    it("reports progress", async () => {
      const session = service.clone("https://github.com/example/repo.git");
      const progresses: number[] = [];
      session.onProgress((p) => progresses.push(p.percent));
      const result = await session.promise;
      expect(result.success).toBe(true);
      expect(progresses.length).toBeGreaterThan(0);
    });

    it("can be destroyed", async () => {
      const session = service.clone("https://github.com/example/repo.git");
      session.destroy();
      await expect(session.promise).rejects.toThrow("Clone aborted");
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
    });

    it("removeRepo deletes the repo", async () => {
      adapter.addRepo("my-repo", "https://github.com/example/my-repo.git");
      await service.removeRepo("my-repo");
      const repos = await service.listRepos();
      expect(repos).toHaveLength(0);
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
    });

    it("checkoutWorktree creates a worktree", async () => {
      const wt = await service.checkoutWorktree("my-repo", "feature-x");
      expect(wt.branch).toBe("feature-x");
      expect(wt.exists).toBe(true);
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
  });

  // ── Branches ──

  describe("branches", () => {
    it("listBranches returns branches from adapter", async () => {
      adapter.addBranch("my-repo", "main");
      adapter.addBranch("my-repo", "develop");
      const branches = await service.listBranches("my-repo");
      expect(branches).toEqual(["main", "develop"]);
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
  });
});
