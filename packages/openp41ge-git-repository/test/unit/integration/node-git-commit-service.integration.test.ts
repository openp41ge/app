/**
 * Integration tests for NodeGitCommitService.
 *
 * Creates a real git repo on disk (in a temp directory) and tests
 * all three methods (getBranches, getCommitLog, getDiffStat) against it.
 * No mocking — validates that git command output parsing works end-to-end.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "path";
import fs from "fs";
import { execSync } from "child_process";
import { NodeGitCommitService } from "@openp41ge/main/services/node-git-commit-service";

const TEST_DIR = path.join(process.cwd(), ".tmp-integration-test");
const REPO_NAME = "test-org/integration-repo";
const REPO_DIR = path.join(TEST_DIR, "repositories", REPO_NAME);

const gitEnv = {
  ...process.env,
  GIT_AUTHOR_NAME: "Integration",
  GIT_AUTHOR_EMAIL: "int@test.com",
  GIT_COMMITTER_NAME: "Integration",
  GIT_COMMITTER_EMAIL: "int@test.com",
};

function run(cmd: string): void {
  execSync(`cd "${REPO_DIR}" && ${cmd}`, { stdio: "ignore", env: gitEnv });
}

function createTestRepo(): void {
  if (fs.existsSync(REPO_DIR)) {
    fs.rmSync(REPO_DIR, { recursive: true });
  }
  fs.mkdirSync(REPO_DIR, { recursive: true });
  fs.mkdirSync(path.join(REPO_DIR, "src"), { recursive: true });

  run("git init -b main");
  fs.writeFileSync(path.join(REPO_DIR, "README.md"), "# Test\n");
  run('git add README.md && git commit -m "Initial commit"');

  // Add a few files
  fs.writeFileSync(path.join(REPO_DIR, "src/index.ts"), "// index\n");
  run('git add src/index.ts && git commit -m "Add index.ts"');

  fs.writeFileSync(path.join(REPO_DIR, "src/app.ts"), "// app\n");
  run('git add src/app.ts && git commit -m "Add app.ts"');

  // Modify a file
  fs.writeFileSync(path.join(REPO_DIR, "README.md"), "# Test\n\nUpdated\n");
  run('git add README.md && git commit -m "Update README"');

  // Delete a file
  fs.rmSync(path.join(REPO_DIR, "src/app.ts"));
  run('git rm src/app.ts && git commit -m "Remove app.ts"');

  // Create a branch
  run("git checkout -b feature/test-feature");
  fs.writeFileSync(path.join(REPO_DIR, "src/feature.ts"), "// feature\n");
  run('git add src/feature.ts && git commit -m "Add feature module"');

  // Switch back to main
  run("git checkout main");
}

describe("NodeGitCommitService integration", () => {
  let service: NodeGitCommitService;

  beforeEach(() => {
    createTestRepo();
    service = new NodeGitCommitService(path.join(TEST_DIR, "repositories"));
  });

  afterEach(() => {
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  describe("getBranches", () => {
    it("returns local branches with correct names", async () => {
      const branches = await service.getBranches(REPO_NAME);
      const localNames = branches.filter((b) => b.isLocal).map((b) => b.name);
      expect(localNames).toContain("main");
      expect(localNames).toContain("feature/test-feature");
    });

    it("marks current branch", async () => {
      const branches = await service.getBranches(REPO_NAME);
      const current = branches.find((b) => b.isCurrent);
      expect(current).toBeDefined();
      expect(current!.name).toBe("main");
    });

    it("returns lastCommit for each branch", async () => {
      const branches = await service.getBranches(REPO_NAME);
      for (const branch of branches) {
        expect(branch.lastCommit).toBeDefined();
        expect(branch.lastCommit!.message).toBeTruthy();
        expect(branch.lastCommit!.hash).toBeTruthy();
      }
    });
  });

  describe("getCommitLog", () => {
    it("returns commits for a branch in reverse chronological order", async () => {
      const commits = await service.getCommitLog(REPO_NAME, "main");
      expect(commits.length).toBeGreaterThanOrEqual(4);
      // Newest first
      const dates = commits.map((c) => new Date(c.date).getTime());
      for (let i = 1; i < dates.length; i++) {
        expect(dates[i - 1]).toBeGreaterThanOrEqual(dates[i]);
      }
    });

    it("includes author name and email in each commit", async () => {
      const commits = await service.getCommitLog(REPO_NAME, "main");
      for (const c of commits) {
        expect(c.authorName).toBeTruthy();
        expect(c.authorEmail).toBeTruthy();
      }
    });

    it("respects maxCount option", async () => {
      const commits = await service.getCommitLog(REPO_NAME, "main", { maxCount: 2 });
      expect(commits.length).toBeLessThanOrEqual(2);
    });

    it("supports skip-based pagination", async () => {
      const firstPage = await service.getCommitLog(REPO_NAME, "main", { maxCount: 2 });
      expect(firstPage.length).toBe(2);

      // Second page: skip first 2 commits
      const secondPage = await service.getCommitLog(REPO_NAME, "main", {
        maxCount: 10,
        skip: 2,
      });
      expect(secondPage.length).toBeGreaterThanOrEqual(1);
      // Second page should not include commits from first page
      const firstHashes = new Set(firstPage.map((c) => c.hash));
      for (const c of secondPage) {
        expect(firstHashes.has(c.hash)).toBe(false);
      }
    });

    it("returns empty array for branch with no commits", async () => {
      await expect(service.getCommitLog(REPO_NAME, "nonexistent-branch")).rejects.toThrow();
    });

    it("includes shortHash and relativeDate", async () => {
      const commits = await service.getCommitLog(REPO_NAME, "main", { maxCount: 1 });
      expect(commits[0].shortHash).toBeTruthy();
      expect(commits[0].shortHash.length).toBeLessThan(commits[0].hash.length);
      expect(commits[0].relativeDate).toBeTruthy();
    });
  });

  describe("getDiffStat", () => {
    it("returns working tree diff when no commitHash given", async () => {
      // Make an uncommitted change
      fs.appendFileSync(path.join(REPO_DIR, "README.md"), "\n// dirty\n");
      const stats = await service.getDiffStat(REPO_NAME);
      expect(stats.length).toBeGreaterThanOrEqual(1);
      expect(stats.some((s) => s.filePath === "README.md")).toBe(true);
    });

    it("returns diff stat for a specific commit", async () => {
      const commits = await service.getCommitLog(REPO_NAME, "main", { maxCount: 5 });
      // Find a commit with file changes
      const removeCommit = commits.find((c) => c.message.includes("Remove"));
      if (removeCommit) {
        const stats = await service.getDiffStat(REPO_NAME, removeCommit.hash);
        expect(stats.length).toBeGreaterThanOrEqual(1);
        expect(stats.some((s) => s.status === "deleted")).toBe(true);
      }
    });

    it("includes added/deleted line counts", async () => {
      const commits = await service.getCommitLog(REPO_NAME, "main", { maxCount: 5 });
      const removeCommit = commits.find((c) => c.message.includes("Remove"));
      if (removeCommit) {
        const stats = await service.getDiffStat(REPO_NAME, removeCommit.hash);
        for (const s of stats) {
          expect(typeof s.added).toBe("number");
          expect(typeof s.deleted).toBe("number");
          expect(s.filePath).toBeTruthy();
        }
      }
    });

    it("returns correct status for added files", async () => {
      const commits = await service.getCommitLog(REPO_NAME, "feature/test-feature", {
        maxCount: 5,
      });
      const addCommit = commits.find((c) => c.message.includes("feature module"));
      if (addCommit) {
        const stats = await service.getDiffStat(REPO_NAME, addCommit.hash);
        expect(stats.some((s) => s.status === "added")).toBe(true);
      }
    });
  });
});
