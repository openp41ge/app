/**
 * Unit tests for in-memory test model implementations.
 *
 * These verify that TestRepoService, TestRepositoryModel,
 * and TestWorktreeModel behave correctly as data containers
 * for use in both unit and integration tests.
 */

import { describe, test, expect } from "vitest";
import {
  TestRepoService,
  TestRepositoryModel,
  TestWorktreeModel,
  TestFileContent,
} from "@openp41ge/renderer/models/test-models";

describe("TestFileContent", () => {
  test("readRange returns slice of content", async () => {
    const fc = new TestFileContent("hello world");
    const result = await fc.readRange(0, 5);
    expect(result.data).toBe("hello");
    expect(result.totalSize).toBe(11);
  });

  test("readRange handles offset beyond content", async () => {
    const fc = new TestFileContent("hi");
    const result = await fc.readRange(10, 5);
    expect(result.data).toBe("");
    expect(result.totalSize).toBe(2);
  });

  test("setContent updates content", async () => {
    const fc = new TestFileContent("");
    fc.setContent("new content");
    const result = await fc.readRange(0, 20);
    expect(result.data).toBe("new content");
  });

  test("readChunked reports full content in one chunk", async () => {
    const fc = new TestFileContent("chunked test");
    const chunks: Array<{ loaded: number; total: number; chunk: string }> = [];
    const result = await fc.readChunked(5, (p) => chunks.push(p));
    expect(chunks.length).toBeGreaterThanOrEqual(1);
    expect(result.totalSize).toBe(12);
  });
});

describe("TestWorktreeModel", () => {
  test("constructor with files creates entries", async () => {
    const wt = new TestWorktreeModel("main", "/repo/main", [
      { name: "README.md", path: "/repo/main/README.md" },
      { name: "src", path: "/repo/main/src", isDirectory: true },
    ]);
    const files = await wt.readTree();
    expect(files).toHaveLength(2);
    expect(files[0].name).toBe("README.md");
    expect(files[0].isDirectory).toBe(false);
    expect(files[1].isDirectory).toBe(true);
  });

  test("addFile adds entries that appear in readTree", async () => {
    const wt = new TestWorktreeModel("main", "/repo/main");
    wt.addFile("index.ts", "/repo/main/index.ts");
    wt.addFile("lib.ts", "/repo/main/lib.ts");
    const files = await wt.readTree();
    expect(files).toHaveLength(2);
    expect(files[0].gitStatus).toBe("tracked");
  });

  test("addFile with status sets gitStatus", async () => {
    const wt = new TestWorktreeModel("main", "/repo/main");
    wt.addFile("new.ts", "/repo/main/new.ts", false, "untracked");
    const files = await wt.readTree();
    expect(files[0].gitStatus).toBe("untracked");
  });

  test("getFileStatus returns correct status", async () => {
    const wt = new TestWorktreeModel("main", "/repo/main", [
      { name: "tracked.ts", path: "/repo/main/tracked.ts", gitStatus: "tracked" },
      { name: "untracked.ts", path: "/repo/main/untracked.ts", gitStatus: "untracked" },
    ]);
    expect(await wt.getFileStatus("/repo/main/tracked.ts")).toBe("tracked");
    expect(await wt.getFileStatus("/repo/main/untracked.ts")).toBe("untracked");
  });

  test("getFileStatus returns tracked for unknown files", async () => {
    const wt = new TestWorktreeModel("main", "/repo/main");
    expect(await wt.getFileStatus("/unknown.ts")).toBe("tracked");
  });

  test("setFiles replaces all entries", async () => {
    const wt = new TestWorktreeModel("main", "/repo/main", [
      { name: "old.ts", path: "/repo/main/old.ts" },
    ]);
    wt.setFiles([{ name: "new.ts", path: "/repo/main/new.ts" }]);
    const files = await wt.readTree();
    expect(files).toHaveLength(1);
    expect(files[0].name).toBe("new.ts");
  });
});

describe("TestRepositoryModel", () => {
  test("constructor sets name and url", () => {
    const repo = new TestRepositoryModel("my-repo", "https://github.com/test/my-repo");
    expect(repo.name).toBe("my-repo");
    expect(repo.url).toBe("https://github.com/test/my-repo");
  });

  test("setWorktree adds a worktree that appears in listWorktrees", async () => {
    const repo = new TestRepositoryModel("my-repo", "");
    repo.setWorktree("main");
    const wts = await repo.listWorktrees();
    expect(wts).toHaveLength(1);
    expect(wts[0].branch).toBe("main");
  });

  test("setWorktree with files creates worktree with files", async () => {
    const repo = new TestRepositoryModel("my-repo", "");
    repo.setWorktree("main", [{ name: "README.md", path: "/my-repo/main/README.md" }]);
    const wts = await repo.listWorktrees();
    const files = await wts[0].readTree();
    expect(files).toHaveLength(1);
    expect(files[0].name).toBe("README.md");
  });

  test("checkoutWorktree creates worktree if missing", async () => {
    const repo = new TestRepositoryModel("my-repo", "");
    const wt = await repo.checkoutWorktree("feature-x");
    expect(wt.branch).toBe("feature-x");
    const wts = await repo.listWorktrees();
    expect(wts).toHaveLength(1);
  });

  test("checkoutWorktree returns existing worktree if already present", async () => {
    const repo = new TestRepositoryModel("my-repo", "");
    repo.setWorktree("feature-x");
    const wt = await repo.checkoutWorktree("feature-x");
    expect(wt.branch).toBe("feature-x");
    const wts = await repo.listWorktrees();
    expect(wts).toHaveLength(1);
  });

  test("deleteWorktree removes worktree", async () => {
    const repo = new TestRepositoryModel("my-repo", "");
    repo.setWorktree("main");
    repo.setWorktree("feature");
    expect(await repo.listWorktrees()).toHaveLength(2);
    await repo.deleteWorktree("feature");
    expect(await repo.listWorktrees()).toHaveLength(1);
    expect((await repo.listWorktrees())[0].branch).toBe("main");
  });

  test("listBranches returns worktree branch names", async () => {
    const repo = new TestRepositoryModel("my-repo", "");
    repo.setWorktree("main");
    repo.setWorktree("dev");
    const branches = await repo.listBranches();
    expect(branches).toContain("main");
    expect(branches).toContain("dev");
  });

  test("getDefaultBranch returns first worktree branch", async () => {
    const repo = new TestRepositoryModel("my-repo", "");
    expect(await repo.getDefaultBranch()).toBe("main");
    repo.setWorktree("develop");
    expect(await repo.getDefaultBranch()).toBe("develop");
  });

  test("pullBranch and fetch are no-ops (don't throw)", async () => {
    const repo = new TestRepositoryModel("my-repo", "");
    repo.setWorktree("main");
    await repo.pullBranch("main");
    await repo.fetch();
    const wts = await repo.listWorktrees();
    expect(wts).toHaveLength(1);
  });

  test("ensureWorktree returns existing or creates new", () => {
    const repo = new TestRepositoryModel("my-repo", "");
    const wt1 = repo.ensureWorktree("main");
    expect(wt1.branch).toBe("main");
    const wt2 = repo.ensureWorktree("main");
    expect(wt2).toBe(wt1);
  });

  test("getWorktree returns undefined for missing", () => {
    const repo = new TestRepositoryModel("my-repo", "");
    expect(repo.getWorktree("main")).toBeUndefined();
    repo.ensureWorktree("main");
    expect(repo.getWorktree("main")).toBeDefined();
  });
});

describe("TestRepoService", () => {
  test("addRepoModel adds a repo that appears in listRepos", async () => {
    const service = new TestRepoService();
    const repo = new TestRepositoryModel("my-repo", "");
    service.addRepoModel(repo);
    const repos = await service.listRepos();
    expect(repos).toHaveLength(1);
    expect(repos[0].name).toBe("my-repo");
  });

  test("createRepo creates repo with main worktree", async () => {
    const service = new TestRepoService();
    const repo = service.createRepo("my-repo", "https://github.com/test/my-repo");
    expect(repo.name).toBe("my-repo");
    const repos = await service.listRepos();
    expect(repos).toHaveLength(1);
    const wts = await repos[0].listWorktrees();
    expect(wts).toHaveLength(1);
    expect(wts[0].branch).toBe("main");
  });

  test("getRepo returns null for missing repo", async () => {
    const service = new TestRepoService();
    expect(await service.getRepo("nonexistent")).toBeNull();
  });

  test("getRepo returns repo by name", async () => {
    const service = new TestRepoService();
    service.createRepo("my-repo");
    const repo = await service.getRepo("my-repo");
    expect(repo).not.toBeNull();
    expect(repo!.name).toBe("my-repo");
  });

  test("clone creates repo with derived name", async () => {
    const service = new TestRepoService();
    const session = service.clone("https://github.com/org/my-repo.git");
    await session.promise;
    const repos = await service.listRepos();
    expect(repos).toHaveLength(1);
    expect(repos[0].name).toBe("my-repo");
    expect(await repos[0].listWorktrees()).toHaveLength(1);
  });

  test("addRepo creates a repo from path", async () => {
    const service = new TestRepoService();
    const repo = await service.addRepo("/some/path/my-repo");
    expect(repo.name).toBe("my-repo");
    expect(await repo.listWorktrees()).toHaveLength(1);
  });

  test("removeRepo removes repo from service", async () => {
    const service = new TestRepoService();
    service.createRepo("my-repo");
    expect(await service.listRepos()).toHaveLength(1);
    await service.removeRepo("my-repo");
    expect(await service.listRepos()).toHaveLength(0);
  });

  test("clear removes all repos", async () => {
    const service = new TestRepoService();
    service.createRepo("a");
    service.createRepo("b");
    expect(await service.listRepos()).toHaveLength(2);
    service.clear();
    expect(await service.listRepos()).toHaveLength(0);
  });

  test("clone returns session with promise that resolves to repo", async () => {
    const service = new TestRepoService();
    const session = service.clone("https://github.com/test/repo.git");
    const repo = await session.promise;
    expect(repo.name).toBe("repo");
    const wts = await repo.listWorktrees();
    expect(wts).toHaveLength(1);
  });
});
