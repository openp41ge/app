/**
 * Behaviour tests for WorktreeStore — the single repositories layout shared
 * by the Explorer (NodeGitService) and the Workspaces overlay (workspaceData:*).
 *
 * Uses a real local git repo so bare-clone/worktree semantics are exercised
 * exactly as in production:
 *   <root>/<provider>/<org>/<repo>/.git   (bare)
 *   <root>/<provider>/<org>/<repo>/<branch with "/"→"--">/  (worktrees)
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { execSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { createWorktreeStore } from "../../../src/main/services/worktree-store";

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

describe("WorktreeStore", () => {
  const repoUrl = "git@github.com:example/demo.git";
  let root: string;
  let reposRoot: string;
  let srcRepo: string;
  let store: ReturnType<typeof createWorktreeStore>;

  // Derived name must match NodeGitService._deriveRepoName.
  const repoName = "github.com/example/demo";
  const repoDir = () => path.join(reposRoot, repoName);

  beforeAll(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "openp41ge-wts-"));
    srcRepo = path.join(root, "src");
    fs.mkdirSync(srcRepo, { recursive: true });
    git(srcRepo, ["init", "-q", "-b", "main", "."]);
    fs.writeFileSync(path.join(srcRepo, "a.txt"), "a\n");
    git(srcRepo, ["add", "."]);
    git(srcRepo, ["commit", "-qm", "init"]);
    git(srcRepo, ["branch", "feat/exists"]);

    reposRoot = path.join(root, "repos");
    fs.mkdirSync(reposRoot, { recursive: true });
    git(reposRoot, ["clone", "--bare", "--quiet", srcRepo, path.join(repoDir(), ".git")]);

    store = createWorktreeStore(reposRoot);
  });

  afterAll(() => {
    vi.restoreAllMocks();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("derives the repo dir name matching NodeGitService", () => {
    expect(store.deriveRepoDirName(repoUrl)).toBe(repoName);
    expect(store.deriveRepoDirName("https://github.com/example/demo")).toBe(repoName);
    expect(store.deriveRepoDirName("github.com:example/demo")).toBe(repoName);
    expect(store.repoAlreadyCloned(repoUrl)).toBe(true);
  });

  it("surfaces a declared-but-unmaterialized worktree as missing", async () => {
    const r = await store.checkWorktreeBranch("", repoUrl, "feat/exists");
    expect(r.status).toBe("missing");
  });

  it("creates a worktree for an existing local branch", async () => {
    const { ok, error } = await store.checkoutWorktreeBranch(repoUrl, "feat/exists");
    expect(error).toBeUndefined();
    expect(ok).toBe(true);
    expect(fs.existsSync(path.join(repoDir(), "feat--exists"))).toBe(true);
    // After materialization the check reports success (not missing).
    const r = await store.checkWorktreeBranch("", repoUrl, "feat/exists");
    expect(r.status).toBe("success");
  });

  it("is idempotent when the worktree folder already exists", async () => {
    const { ok, error } = await store.checkoutWorktreeBranch(repoUrl, "feat/exists");
    expect(ok).toBe(true);
    expect(error).toBeUndefined();
  });

  it("re-creates a worktree whose folder was deleted (prunes stale registration)", async () => {
    const wt = path.join(repoDir(), "feat--exists");
    fs.rmSync(wt, { recursive: true, force: true });
    // Folder gone but the bare repo still has worktree metadata for it.
    expect(fs.existsSync(wt)).toBe(false);
    const { ok, error } = await store.checkoutWorktreeBranch(repoUrl, "feat/exists");
    expect(error).toBeUndefined();
    expect(ok).toBe(true);
    expect(fs.existsSync(wt)).toBe(true);
    // status resolves away from missing after re-materialization
    const r = await store.checkWorktreeBranch("", repoUrl, "feat/exists");
    expect(r.status).not.toBe("missing");
  });

  it("creates a worktree from HEAD for a branch that exists nowhere", async () => {
    const { ok, error } = await store.checkoutWorktreeBranch(repoUrl, "feat/nowhere");
    expect(error).toBeUndefined();
    expect(ok).toBe(true);
    expect(fs.existsSync(path.join(repoDir(), "feat--nowhere"))).toBe(true);
  });

  it("fails checkout before the repo is cloned", async () => {
    const { ok, error } = await store.checkoutWorktreeBranch(
      "git@github.com:example/never-cloned.git",
      "main",
    );
    expect(ok).toBe(false);
    expect(error).toMatch(/not cloned/i);
  });
});
