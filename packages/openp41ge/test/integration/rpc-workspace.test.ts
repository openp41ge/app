/**
 * Integration tests for workspace tRPC handlers.
 *
 * These replace the Pact consumer contracts for workspace/repository
 * operations. Instead of verifying data shapes against a mock server,
 * we inject TestReposService and verify the actual handler logic.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { setReposService } from "../../electron/trpc/repos-handlers";
import { reposHandlers } from "../../electron/trpc/repos-handlers";
import { TestReposService } from "./test-services";

describe("workspace tRPC handlers", () => {
  let testService: TestReposService;

  beforeEach(() => {
    testService = new TestReposService();
    setReposService(testService);
  });

  it("listRepos returns an array of repositories", async () => {
    const repos = await reposHandlers.listRepos();
    expect(Array.isArray(repos)).toBe(true);
    expect(repos.length).toBeGreaterThan(0);
    expect(repos[0]).toHaveProperty("name");
    expect(repos[0]).toHaveProperty("url");
    expect(typeof repos[0].name).toBe("string");
    expect(typeof repos[0].url).toBe("string");
  });

  it("getRepo returns a single repository", async () => {
    const repo = await reposHandlers.getRepo("openp41ge");
    expect(repo).not.toBeNull();
    expect(repo!.name).toBe("openp41ge");
  });

  it("getRepo returns null for unknown repository", async () => {
    const repo = await reposHandlers.getRepo("nonexistent");
    expect(repo).toBeNull();
  });

  it("listWorktrees returns an array of worktrees", async () => {
    testService.state.currentState = "worktrees exist";
    const wts = await reposHandlers.listWorktrees("openp41ge");
    expect(wts).toHaveLength(1);
    expect(wts[0].branch).toBe("main");
    expect(wts[0].exists).toBe(true);
  });

  it("listWorktrees returns empty array when no worktrees exist", async () => {
    testService.state.currentState = "no worktrees exist";
    const wts = await reposHandlers.listWorktrees("empty-repo");
    expect(wts).toEqual([]);
  });

  it("checkoutWorktree returns a new worktree", async () => {
    const wt = await reposHandlers.checkoutWorktree("openp41ge", "feature-x");
    expect(wt.branch).toBe("feature-x");
    expect(wt.exists).toBe(true);
  });

  it("deleteWorktree succeeds", async () => {
    await reposHandlers.checkoutWorktree("openp41ge", "feature-x");
    const result = await reposHandlers.deleteWorktree("openp41ge", "feature-x");
    expect(result).toBeUndefined();
  });

  it("pullBranch succeeds", async () => {
    const result = await reposHandlers.pullBranch("openp41ge", "main");
    expect(result).toBeUndefined();
  });

  it("fetch succeeds", async () => {
    const result = await reposHandlers.fetch("openp41ge");
    expect(result).toBeUndefined();
  });

  it("listBranches returns an array of branch names", async () => {
    const branches = await reposHandlers.listBranches("openp41ge");
    expect(branches.length).toBeGreaterThanOrEqual(1);
    expect(typeof branches[0]).toBe("string");
  });

  it("getDefaultBranch returns the default branch name", async () => {
    const branch = await reposHandlers.getDefaultBranch("openp41ge");
    expect(branch).toBe("main");
  });

  it("getDefaultBranch returns null for empty repo", async () => {
    const branch = await reposHandlers.getDefaultBranch("empty-repo");
    expect(branch).toBeNull();
  });
});
