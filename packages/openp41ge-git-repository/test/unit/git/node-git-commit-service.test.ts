/**
 * Tests for NodeGitCommitService.
 *
 * Stubs child_process.exec so no real git commands are run.
 * Each test sets up mock stdout/stderr/error for the specific scenario.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NodeGitCommitService } from "@openp41ge/main/services/node-git-commit-service";

const mockExec = vi.hoisted(() => vi.fn());
vi.mock("child_process", () => ({ default: { exec: mockExec }, exec: mockExec }));

const REPOS_DIR = "/tmp/test-repos";

function createService(): NodeGitCommitService {
  return new NodeGitCommitService(REPOS_DIR);
}

function mockExecSuccess(stdout: string): void {
  mockExec.mockImplementation(
    (
      _cmd: string,
      _opts: unknown,
      cb: (err: Error | null, stdout: string, stderr: string) => void,
    ) => {
      cb(null, stdout, "");
    },
  );
}

function mockExecError(stderr: string): void {
  mockExec.mockImplementation(
    (
      _cmd: string,
      _opts: unknown,
      cb: (err: Error | null, stdout: string, stderr: string) => void,
    ) => {
      cb(new Error(stderr), "", stderr);
    },
  );
}

// ──────────────────────────────────────────────────────────────
// getCommitLog
// ──────────────────────────────────────────────────────────────

describe("getCommitLog", () => {
  beforeEach(() => {
    mockExec.mockReset();
  });

  it("returns parsed commits from git log output", async () => {
    const svc = createService();
    mockExecSuccess(
      [
        "abc123|abc123|Jane Doe|jane@ex.com|2026-07-04T10:00:00Z|2 hours ago|Fix login bug|",
        "---BODY_END---",
        "parent1 parent2",
        "HEAD -> main, origin/main",
        "---ENTRY_END---",
        "def456|def456|John Smith|john@ex.com|2026-07-03T08:00:00Z|1 day ago|Add auth flow|",
        "---BODY_END---",
        "parent3",
        "origin/main",
        "---ENTRY_END---",
      ].join("\n"),
    );

    const commits = await svc.getCommitLog("my-repo", "main");

    expect(commits).toHaveLength(2);

    // First commit
    expect(commits[0].hash).toBe("abc123");
    expect(commits[0].shortHash).toBe("abc123");
    expect(commits[0].authorName).toBe("Jane Doe");
    expect(commits[0].authorEmail).toBe("jane@ex.com");
    expect(commits[0].date).toBe("2026-07-04T10:00:00Z");
    expect(commits[0].relativeDate).toBe("2 hours ago");
    expect(commits[0].message).toBe("Fix login bug");
    expect(commits[0].parents).toEqual(["parent1", "parent2"]);
    expect(commits[0].refs).toContain("HEAD -> main");
    expect(commits[0].refs).toContain("origin/main");

    // Second commit
    expect(commits[1].hash).toBe("def456");
    expect(commits[1].shortHash).toBe("def456");
    expect(commits[1].parents).toEqual(["parent3"]);
  });

  it("returns empty array for empty output", async () => {
    const svc = createService();
    mockExecSuccess("");

    const commits = await svc.getCommitLog("my-repo", "main");
    expect(commits).toEqual([]);
  });

  it("returns empty array for whitespace-only output", async () => {
    const svc = createService();
    mockExecSuccess("   \n  \n");

    const commits = await svc.getCommitLog("my-repo", "main");
    expect(commits).toEqual([]);
  });

  it("passes maxCount option to git log", async () => {
    const svc = createService();
    mockExecSuccess("");

    await svc.getCommitLog("my-repo", "feature-x", { maxCount: 10 });

    const execCall = mockExec.mock.calls[0][0];
    expect(execCall).toContain("--max-count=10");
    expect(execCall).toContain("feature-x");
  });

  it("passes skip option for pagination", async () => {
    const svc = createService();
    mockExecSuccess("");

    await svc.getCommitLog("my-repo", "main", { maxCount: 10, skip: 5 });

    const execCall = mockExec.mock.calls[0][0];
    expect(execCall).toContain("--skip=5");
    expect(execCall).toContain("--max-count=10");
  });

  it("handles detached HEAD branch name", async () => {
    const svc = createService();
    mockExecSuccess("");

    await svc.getCommitLog("my-repo", "HEAD");

    const execCall = mockExec.mock.calls[0][0];
    expect(execCall).toContain("HEAD");
  });

  it("handles missing body (no body text in commit)", async () => {
    const svc = createService();
    // Commit with no body
    mockExecSuccess(
      [
        "abc123|abc123|Jane|j@e.com|2026-07-04T10:00:00Z|2h|Short msg|",
        "---BODY_END---",
        "",
        "",
        "---ENTRY_END---",
      ].join("\n"),
    );

    const commits = await svc.getCommitLog("my-repo", "main");
    expect(commits).toHaveLength(1);
    expect(commits[0].message).toBe("Short msg");
    expect(commits[0].fullMessage).toBe("Short msg");
    expect(commits[0].parents).toEqual([]);
    expect(commits[0].refs).toEqual([]);
  });

  it("handles multi-line body text", async () => {
    const svc = createService();
    // Commit with body (body is after first line of headerBody)
    // The format: first line of the headerBody contains | separated fields
    // Then rest is body. The body is between first line and ---BODY_END---
    mockExecSuccess(
      [
        "abc123|abc123|Jane|j@e.com|2026-07-04T10:00:00Z|2h|Fix bug|",
        "This is the body",
        "that spans multiple lines",
        "---BODY_END---",
        "parent1",
        "HEAD -> main",
        "---ENTRY_END---",
      ].join("\n"),
    );

    const commits = await svc.getCommitLog("my-repo", "main");
    expect(commits).toHaveLength(1);
    expect(commits[0].message).toBe("Fix bug");
    expect(commits[0].fullMessage).toBe(
      ["This is the body", "that spans multiple lines"].join("\n"),
    );
  });

  it("rejects on git error with stderr", async () => {
    const svc = createService();
    mockExecError("fatal: not a git repository");

    await expect(svc.getCommitLog("my-repo", "main")).rejects.toThrow("not a git repository");
  });

  it("rejects on git error with only error.message", async () => {
    mockExec.mockImplementation(
      (
        _cmd: string,
        _opts: unknown,
        cb: (err: Error | null, stdout: string, stderr: string) => void,
      ) => {
        cb(new Error("ENOENT: git not found"), "", "");
      },
    );
    const svc = createService();

    await expect(svc.getCommitLog("my-repo", "main")).rejects.toThrow("ENOENT: git not found");
  });

  it("handles branch with slash in name", async () => {
    const svc = createService();
    mockExecSuccess("");

    await svc.getCommitLog("my-repo", "feature/ux-improvements");

    const execCall = mockExec.mock.calls[0][0];
    expect(execCall).toContain("feature/ux-improvements");
  });
});

// ──────────────────────────────────────────────────────────────
// getBranches
// ──────────────────────────────────────────────────────────────

describe("getBranches", () => {
  beforeEach(() => {
    mockExec.mockReset();
  });

  it("returns both local and remote branches", async () => {
    const svc = createService();

    // Mock for rev-parse (current branch detection)
    mockExec
      .mockImplementationOnce(
        (
          _cmd: string,
          _opts: unknown,
          cb: (err: Error | null, stdout: string, stderr: string) => void,
        ) => {
          cb(null, "main\n", "");
        },
      )
      // Mock for local branches: for-each-ref refs/heads/
      .mockImplementationOnce(
        (
          _cmd: string,
          _opts: unknown,
          cb: (err: Error | null, stdout: string, stderr: string) => void,
        ) => {
          cb(
            null,
            [
              "main\0abc123\0origin/main\0[ ahead 3, behind 1]",
              "develop\0def456\0origin/develop\0",
              "feature/x\0ghi789\0\0",
            ].join("\n"),
            "",
          );
        },
      )
      // Mock for remote-only branches: for-each-ref refs/remotes/origin/
      .mockImplementationOnce(
        (
          _cmd: string,
          _opts: unknown,
          cb: (err: Error | null, stdout: string, stderr: string) => void,
        ) => {
          cb(
            null,
            ["origin/HEAD", "origin/main", "origin/develop", "origin/feature/remote-only"].join(
              "\n",
            ),
            "",
          );
        },
      )
      // 3 more mock calls for lastCommit via getCommitLog (one per local branch)
      .mockImplementationOnce(
        (
          _cmd: string,
          _opts: unknown,
          cb: (err: Error | null, stdout: string, stderr: string) => void,
        ) => {
          cb(null, "", "");
        },
      )
      .mockImplementationOnce(
        (
          _cmd: string,
          _opts: unknown,
          cb: (err: Error | null, stdout: string, stderr: string) => void,
        ) => {
          cb(null, "", "");
        },
      )
      .mockImplementationOnce(
        (
          _cmd: string,
          _opts: unknown,
          cb: (err: Error | null, stdout: string, stderr: string) => void,
        ) => {
          cb(null, "", "");
        },
      );

    const branches = await svc.getBranches("my-repo");

    // 3 local + 1 remote-only (origin/HEAD excluded)
    expect(branches).toHaveLength(4);

    const mainBranch = branches.find((b) => b.shortName === "main");
    expect(mainBranch).toBeDefined();
    expect(mainBranch!.isLocal).toBe(true);
    expect(mainBranch!.tracking).toBe("origin/main");
    expect(mainBranch!.ahead).toBe(3);
    expect(mainBranch!.behind).toBe(1);

    const developBranch = branches.find((b) => b.shortName === "develop");
    expect(developBranch).toBeDefined();
    expect(developBranch!.tracking).toBe("origin/develop");
    expect(developBranch!.ahead).toBe(0);
    expect(developBranch!.behind).toBe(0);

    const featureX = branches.find((b) => b.shortName === "feature/x");
    expect(featureX).toBeDefined();
    expect(featureX!.tracking).toBeUndefined();

    const remoteOnly = branches.find((b) => b.shortName === "feature/remote-only");
    expect(remoteOnly).toBeDefined();
    expect(remoteOnly!.isLocal).toBe(false);
  });

  it("returns empty array when no branches exist", async () => {
    const svc = createService();

    mockExec
      .mockImplementationOnce(
        (
          _cmd: string,
          _opts: unknown,
          cb: (err: Error | null, stdout: string, stderr: string) => void,
        ) => {
          cb(null, "main\n", "");
        },
      )
      .mockImplementationOnce(
        (
          _cmd: string,
          _opts: unknown,
          cb: (err: Error | null, stdout: string, stderr: string) => void,
        ) => {
          cb(null, "", "");
        },
      )
      .mockImplementationOnce(
        (
          _cmd: string,
          _opts: unknown,
          cb: (err: Error | null, stdout: string, stderr: string) => void,
        ) => {
          cb(null, "", "");
        },
      );

    const branches = await svc.getBranches("my-repo");
    expect(branches).toEqual([]);
  });

  it("handles remote fetch failure gracefully", async () => {
    const svc = createService();

    // Mock rev-parse (current branch)
    mockExec
      .mockImplementationOnce(
        (
          _cmd: string,
          _opts: unknown,
          cb: (err: Error | null, stdout: string, stderr: string) => void,
        ) => {
          cb(null, "main\n", "");
        },
      )
      // Mock local branches success
      .mockImplementationOnce(
        (
          _cmd: string,
          _opts: unknown,
          cb: (err: Error | null, stdout: string, stderr: string) => void,
        ) => {
          cb(null, "main\0abc123\0\0", "");
        },
      )
      // Mock remote branches failure
      .mockImplementationOnce(
        (
          _cmd: string,
          _opts: unknown,
          cb: (err: Error | null, stdout: string, stderr: string) => void,
        ) => {
          cb(new Error("fatal: not a git repository"), "", "");
        },
      );

    // Mock lastCommit query for main
    mockExec.mockImplementationOnce(
      (
        _cmd: string,
        _opts: unknown,
        cb: (err: Error | null, stdout: string, stderr: string) => void,
      ) => {
        cb(null, "", "");
      },
    );

    const branches = await svc.getBranches("my-repo");
    expect(branches).toHaveLength(1);
    expect(branches[0].shortName).toBe("main");
  });

  it("handles upstream tracking with no ahead/behind", async () => {
    const svc = createService();

    mockExec
      .mockImplementationOnce(
        (
          _cmd: string,
          _opts: unknown,
          cb: (err: Error | null, stdout: string, stderr: string) => void,
        ) => {
          cb(null, "main\0abc123\0origin/main\0", "");
        },
      )
      .mockImplementationOnce(
        (
          _cmd: string,
          _opts: unknown,
          cb: (err: Error | null, stdout: string, stderr: string) => void,
        ) => {
          cb(null, "origin/main", "");
        },
      )
      .mockImplementationOnce(
        (
          _cmd: string,
          _opts: unknown,
          cb: (err: Error | null, stdout: string, stderr: string) => void,
        ) => {
          cb(null, "", "");
        },
      );

    const branches = await svc.getBranches("my-repo");
    expect(branches).toHaveLength(1);
    expect(branches[0].ahead).toBe(0);
    expect(branches[0].behind).toBe(0);
  });

  it("includes lastCommit for local branches when available", async () => {
    const svc = createService();

    // Mock rev-parse (current branch)
    mockExec
      .mockImplementationOnce(
        (
          _cmd: string,
          _opts: unknown,
          cb: (err: Error | null, stdout: string, stderr: string) => void,
        ) => {
          cb(null, "main\n", "");
        },
      )
      .mockImplementationOnce(
        (
          _cmd: string,
          _opts: unknown,
          cb: (err: Error | null, stdout: string, stderr: string) => void,
        ) => {
          cb(null, "main\0abc123\0\0", "");
        },
      )
      .mockImplementationOnce(
        (
          _cmd: string,
          _opts: unknown,
          cb: (err: Error | null, stdout: string, stderr: string) => void,
        ) => {
          cb(null, "", "");
        },
      )
      // Mock lastCommit: getCommitLog returns 1 commit
      .mockImplementationOnce(
        (
          _cmd: string,
          _opts: unknown,
          cb: (err: Error | null, stdout: string, stderr: string) => void,
        ) => {
          cb(
            null,
            [
              "abc123|abc123|Jane|j@e.com|2026-07-04T10:00:00Z|2h|Fix bug|",
              "---BODY_END---",
              "",
              "HEAD -> main",
              "---ENTRY_END---",
            ].join("\n"),
            "",
          );
        },
      );

    const branches = await svc.getBranches("my-repo");
    expect(branches).toHaveLength(1);
    expect(branches[0].lastCommit).not.toBeNull();
    expect(branches[0].lastCommit!.hash).toBe("abc123");
    expect(branches[0].lastCommit!.message).toBe("Fix bug");
  });

  it("handles lastCommit query failure gracefully", async () => {
    const svc = createService();

    // Mock rev-parse (current branch)
    mockExec
      .mockImplementationOnce(
        (
          _cmd: string,
          _opts: unknown,
          cb: (err: Error | null, stdout: string, stderr: string) => void,
        ) => {
          cb(null, "main\n", "");
        },
      )
      .mockImplementationOnce(
        (
          _cmd: string,
          _opts: unknown,
          cb: (err: Error | null, stdout: string, stderr: string) => void,
        ) => {
          cb(null, "main\0abc123\0\0", "");
        },
      )
      .mockImplementationOnce(
        (
          _cmd: string,
          _opts: unknown,
          cb: (err: Error | null, stdout: string, stderr: string) => void,
        ) => {
          cb(null, "", "");
        },
      )
      // Mock lastCommit query failure
      .mockImplementationOnce(
        (
          _cmd: string,
          _opts: unknown,
          cb: (err: Error | null, stdout: string, stderr: string) => void,
        ) => {
          cb(new Error("ambiguous argument"), "", "");
        },
      );

    const branches = await svc.getBranches("my-repo");
    expect(branches).toHaveLength(1);
    expect(branches[0].lastCommit).toBeNull();
  });
});

// ──────────────────────────────────────────────────────────────
// getDiffStat
// ──────────────────────────────────────────────────────────────

describe("getDiffStat", () => {
  beforeEach(() => {
    mockExec.mockReset();
  });

  it("returns parsed diff stat entries for working tree", async () => {
    const svc = createService();

    // Mock for diff --numstat (no commitHash)
    mockExec
      .mockImplementationOnce(
        (
          _cmd: string,
          _opts: unknown,
          cb: (err: Error | null, stdout: string, stderr: string) => void,
        ) => {
          cb(null, "12\t3\tsrc/login.tsx\n1\t0\tsrc/auth.ts\n", "");
        },
      )
      // Mock for diff --name-status (to get statuses)
      .mockImplementationOnce(
        (
          _cmd: string,
          _opts: unknown,
          cb: (err: Error | null, stdout: string, stderr: string) => void,
        ) => {
          cb(null, "M\tsrc/login.tsx\nA\tsrc/auth.ts\n", "");
        },
      );

    const entries = await svc.getDiffStat("my-repo");

    expect(entries).toHaveLength(2);

    expect(entries[0].filePath).toBe("src/login.tsx");
    expect(entries[0].added).toBe(12);
    expect(entries[0].deleted).toBe(3);
    expect(entries[0].status).toBe("modified");

    expect(entries[1].filePath).toBe("src/auth.ts");
    expect(entries[1].added).toBe(1);
    expect(entries[1].deleted).toBe(0);
    expect(entries[1].status).toBe("added");
  });

  it("parses diff stat for a specific commit", async () => {
    const svc = createService();

    mockExec
      .mockImplementationOnce(
        (
          _cmd: string,
          _opts: unknown,
          cb: (err: Error | null, stdout: string, stderr: string) => void,
        ) => {
          cb(null, "5\t2\tsrc/index.ts\n", "");
        },
      )
      .mockImplementationOnce(
        (
          _cmd: string,
          _opts: unknown,
          cb: (err: Error | null, stdout: string, stderr: string) => void,
        ) => {
          cb(null, "M\tsrc/index.ts\n", "");
        },
      );

    const entries = await svc.getDiffStat("my-repo", "abc123");

    expect(entries).toHaveLength(1);
    expect(entries[0].filePath).toBe("src/index.ts");
    expect(entries[0].added).toBe(5);
    expect(entries[0].deleted).toBe(2);
    expect(entries[0].status).toBe("modified");
  });

  it("returns empty array for empty working tree", async () => {
    const svc = createService();

    mockExec
      .mockImplementationOnce(
        (
          _cmd: string,
          _opts: unknown,
          cb: (err: Error | null, stdout: string, stderr: string) => void,
        ) => {
          cb(null, "", "");
        },
      )
      .mockImplementationOnce(
        (
          _cmd: string,
          _opts: unknown,
          cb: (err: Error | null, stdout: string, stderr: string) => void,
        ) => {
          cb(null, "", "");
        },
      );

    const entries = await svc.getDiffStat("my-repo");
    expect(entries).toEqual([]);
  });

  it("handles renamed files with R status", async () => {
    const svc = createService();

    mockExec
      .mockImplementationOnce(
        (
          _cmd: string,
          _opts: unknown,
          cb: (err: Error | null, stdout: string, stderr: string) => void,
        ) => {
          cb(null, "0\t0\tnew/path.ts\n", "");
        },
      )
      .mockImplementationOnce(
        (
          _cmd: string,
          _opts: unknown,
          cb: (err: Error | null, stdout: string, stderr: string) => void,
        ) => {
          cb(null, "R100\told/path.ts\tnew/path.ts\n", "");
        },
      );

    const entries = await svc.getDiffStat("my-repo", "def456");
    expect(entries).toHaveLength(1);
    expect(entries[0].status).toBe("renamed");
    expect(entries[0].filePath).toBe("new/path.ts");
  });

  it("handles deleted file status (D)", async () => {
    const svc = createService();

    mockExec
      .mockImplementationOnce(
        (
          _cmd: string,
          _opts: unknown,
          cb: (err: Error | null, stdout: string, stderr: string) => void,
        ) => {
          cb(null, "0\t5\told.ts\n", "");
        },
      )
      .mockImplementationOnce(
        (
          _cmd: string,
          _opts: unknown,
          cb: (err: Error | null, stdout: string, stderr: string) => void,
        ) => {
          cb(null, "D\told.ts\n", "");
        },
      );

    const entries = await svc.getDiffStat("my-repo", "def456");
    expect(entries).toHaveLength(1);
    expect(entries[0].status).toBe("deleted");
  });

  it("returns empty array when git diff fails for working tree (no HEAD)", async () => {
    const svc = createService();

    mockExec.mockImplementationOnce(
      (
        _cmd: string,
        _opts: unknown,
        cb: (err: Error | null, stdout: string, stderr: string) => void,
      ) => {
        cb(new Error("fatal: bad revision 'HEAD'"), "", "");
      },
    );

    const entries = await svc.getDiffStat("my-repo");
    expect(entries).toEqual([]);
  });

  it("handles status output failure gracefully — still returns numstat entries", async () => {
    const svc = createService();

    mockExec
      .mockImplementationOnce(
        (
          _cmd: string,
          _opts: unknown,
          cb: (err: Error | null, stdout: string, stderr: string) => void,
        ) => {
          cb(null, "2\t2\tsrc/file.ts\n", "");
        },
      )
      .mockImplementationOnce(
        (
          _cmd: string,
          _opts: unknown,
          cb: (err: Error | null, stdout: string, stderr: string) => void,
        ) => {
          cb(new Error("fatal"), "", "");
        },
      );

    const entries = await svc.getDiffStat("my-repo", "abc123");
    expect(entries).toHaveLength(1);
    expect(entries[0].status).toBe("modified"); // default
  });
});

// ──────────────────────────────────────────────────────────────
// deleteLocalBranch
// ──────────────────────────────────────────────────────────────

describe("deleteLocalBranch", () => {
  beforeEach(() => {
    mockExec.mockReset();
  });

  it("calls git branch -d for normal delete", async () => {
    const svc = createService();
    mockExecSuccess("");

    await svc.deleteLocalBranch("my-repo", "feature/x");

    const execCall = mockExec.mock.calls[0][0];
    expect(execCall).toContain("branch");
    expect(execCall).toContain("-d");
    expect(execCall).toContain("feature/x");
  });

  it("calls git branch -D for force delete", async () => {
    const svc = createService();
    mockExecSuccess("");

    await svc.deleteLocalBranch("my-repo", "stale-branch", true);

    const execCall = mockExec.mock.calls[0][0];
    expect(execCall).toContain("branch");
    expect(execCall).toContain("-D");
    expect(execCall).toContain("stale-branch");
  });

  it("rejects on git error", async () => {
    const svc = createService();
    mockExecError("error: Cannot delete branch");

    await expect(svc.deleteLocalBranch("my-repo", "main")).rejects.toThrow("Cannot delete branch");
  });
});
