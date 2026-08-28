/**
 * Regression + behaviour tests for NodeGitService.checkoutWorktree.
 *
 * Uses a real local git repo so worktree semantics are exercised exactly as in
 * production (bare clone under reposDir/<provider>/<org>/<repo>/.git, worktrees
 * as siblings of .git/).
 *
 * Regression (2026-08-29): workspace activation — sometimes concurrent from two
 * windows, with clone() short-circuiting on another window's in-progress clone
 * dir — used to surface `fatal: a branch named '<branch>' already exists` from
 * checkoutWorktree's create-from-HEAD path. checkoutWorktree must now be
 * idempotent and collision-tolerant.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { execSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { NodeGitService } from "../../../src/main/services/node-git-service";

const wtDir = (branch: string) => branch.replace(/\//g, "--");

function git(cwd: string, args: string[]): string {
  return execSync(`git ${args.map((a) => `"${a.replace(/"/g, '\\"')}"`).join(" ")}`, {
    cwd,
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "t",
      GIT_AUTHOR_EMAIL: "t@t.co",
      GIT_COMMITTER_NAME: "t",
      GIT_COMMITTER_EMAIL: "t@t.co",
      GIT_TERMINAL_PROMPT: "0",
    },
    encoding: "utf8",
  }).trim();
}

describe("NodeGitService.checkoutWorktree", () => {
  let root: string;
  let srcRepo: string;
  let reposDir: string;
  let svc: NodeGitService;
  const repoName = "github.com/example/demo";
  const branch = "feat/of-7";

  beforeAll(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "openp41ge-git-test-"));
    srcRepo = path.join(root, "src");
    fs.mkdirSync(srcRepo, { recursive: true });
    git(srcRepo, ["init", "-q", "-b", "main", "."]);
    fs.writeFileSync(path.join(srcRepo, "a.txt"), "a\n");
    git(srcRepo, ["add", "."]);
    git(srcRepo, ["commit", "-qm", "init"]);
    git(srcRepo, ["branch", branch]);
    git(srcRepo, ["branch", "feat/other"]);

    reposDir = path.join(root, "repos");
    fs.mkdirSync(reposDir, { recursive: true });
    git(reposDir, ["clone", "--bare", "--quiet", srcRepo, path.join(reposDir, repoName, ".git")]);
    svc = new NodeGitService(reposDir);
  });

  afterAll(() => {
    vi.restoreAllMocks();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("creates a worktree for an existing local branch without throwing", async () => {
    const info = await svc.checkoutWorktree(repoName, branch);
    expect(info.exists).toBe(true);
    expect(info.path).toBe(path.join(reposDir, repoName, wtDir(branch)));
    expect(fs.existsSync(info.path)).toBe(true);
  });

  it("is idempotent on a second call (worktree already exists)", async () => {
    await expect(svc.checkoutWorktree(repoName, branch)).resolves.toMatchObject({ exists: true });
  });

  it("does not throw 'already exists' when the branch ref pre-exists but the worktree is missing", async () => {
    // Regression: while another window's clone is in progress, rev-parse sees no
    // refs yet, so checkoutWorktree used to hit `git branch <b>` and throw
    // `fatal: a branch named '<b>' already exists`. It must settle to exists:true.
    //
    // To force that path deterministically: a branch that exists only in local
    // refs/heads (not on origin) + a rev-parse failure (stubbed mid-clone). Old
    // code fell through to `git branch` -> fatal "already exists"; new code must
    // tolerate it and materialize the worktree.
    const b = "feat/local-only";
    git(path.join(reposDir, repoName), ["--git-dir=.git", "branch", b]);
    const dir = path.join(reposDir, repoName, wtDir(b));
    fs.rmSync(dir, { recursive: true, force: true });

    const svcAny = svc as unknown as { _execGit: (...a: unknown[]) => Promise<string> };
    const realExec = svcAny._execGit.bind(svc);
    vi.spyOn(svcAny, "_execGit").mockImplementation(async (args: string[], name: string) => {
      if (args[0] === "rev-parse") throw new Error("simulated mid-clone: refs not visible yet");
      return realExec(args, name);
    });

    await expect(svc.checkoutWorktree(repoName, b)).resolves.toMatchObject({ exists: true });
    expect(fs.existsSync(dir)).toBe(true);
    vi.restoreAllMocks();
  });

  it("checks out a branch that exists only on the remote", async () => {
    const remoteOnly = "feat/remote-only";
    git(srcRepo, ["branch", remoteOnly]);
    const info = await svc.checkoutWorktree(repoName, remoteOnly);
    expect(info.exists).toBe(true);
    const wtList = git(path.join(reposDir, repoName), ["worktree", "list", "--porcelain"]);
    expect(wtList).toContain(`branch refs/heads/${remoteOnly}`);
  });

  it("creates a brand-new branch and materializes it as a worktree", async () => {
    const fresh = "feat/newbranch";
    const info = await svc.checkoutWorktree(repoName, fresh);
    expect(info.exists).toBe(true);
    const wtList = git(path.join(reposDir, repoName), ["worktree", "list", "--porcelain"]);
    expect(wtList).toContain(`branch refs/heads/${fresh}`);
  });

  it("never throws 'already exists' across repeated activations", async () => {
    for (let i = 0; i < 3; i += 1) {
      for (const b of [branch, "feat/other", "feat/remote-only", "feat/newbranch"]) {
        await expect(svc.checkoutWorktree(repoName, b)).resolves.toMatchObject({ exists: true });
      }
    }
  });
});
