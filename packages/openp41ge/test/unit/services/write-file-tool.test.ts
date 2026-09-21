/**
 * create_or_replace_file tool — create/replace behavior + scope + git apply.
 *
 * Verifies it creates an absent file and replaces a present one via git
 * (unstaged working-tree change), and enforces the connected-worktree scope.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import os from "os";
import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";
import writeFileTool from "openp41ge-agents-tool-write-file";
import type { ToolExecutionContext } from "openp41ge-agents-tool-types";

function git(args: string[], cwd: string): void {
  const r = spawnSync("git", args, { cwd, encoding: "utf-8" });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr}`);
}

async function write(p: string, content: string, ctx: ToolExecutionContext, mode?: string) {
  return writeFileTool.execute({ path: p, content, ...(mode ? { mode } : {}) }, ctx);
}

describe("create_or_replace_file", () => {
  let base: string;
  let repo: string;

  beforeEach(() => {
    base = fs.mkdtempSync(path.join(os.tmpdir(), "write-file-"));
    repo = path.join(base, "repo");
    fs.mkdirSync(repo, { recursive: true });
    git(["init", "-q"], repo);
    git(["config", "user.email", "t@t"], repo);
    git(["config", "user.name", "t"], repo);
    git(["commit", "-qm", "init", "--allow-empty"], repo);
  });

  afterEach(() => {
    fs.rmSync(base, { recursive: true, force: true });
  });

  it("creates a file when absent", async () => {
    const p = path.join(repo, "new.txt");
    const res = await write(p, "hello\nworld\n", { cwd: repo, roots: [repo] });
    expect(res.error).toBeUndefined();
    expect(fs.readFileSync(p, "utf-8")).toBe("hello\nworld\n");
    const status = spawnSync("git", ["status", "--porcelain"], { cwd: repo, encoding: "utf-8" });
    expect(status.stdout.trimEnd()).toBe("?? new.txt");
  });

  it("creates a file in a new subdirectory (parent dirs made)", async () => {
    const p = path.join(repo, "sub", "deep", "x.txt");
    const res = await write(p, "x", { cwd: repo, roots: [repo] });
    expect(res.error).toBeUndefined();
    expect(fs.readFileSync(p, "utf-8")).toBe("x");
  });

  it("replaces an existing file's content via git", async () => {
    const p = path.join(repo, "a.txt");
    fs.writeFileSync(p, "old content\n");
    git(["add", "a.txt"], repo);
    git(["commit", "-qm", "add a"], repo);
    const res = await write(p, "new content\n", { cwd: repo, roots: [repo] });
    expect(res.error).toBeUndefined();
    expect(fs.readFileSync(p, "utf-8")).toBe("new content\n");
    const status = spawnSync("git", ["status", "--porcelain"], { cwd: repo, encoding: "utf-8" });
    expect(status.stdout.trimEnd()).toBe(" M a.txt");
  });

  it("is a no-op when replace content already matches", async () => {
    const p = path.join(repo, "a.txt");
    fs.writeFileSync(p, "same\n");
    const res = await write(p, "same\n", { cwd: repo, roots: [repo] }, "replace");
    expect(res.error).toBeUndefined();
    expect(res.content).toContain("already matches");
  });

  it("mode 'create' fails when the file exists", async () => {
    const p = path.join(repo, "a.txt");
    fs.writeFileSync(p, "x\n");
    const res = await write(p, "y\n", { cwd: repo, roots: [repo] }, "create");
    expect(res.error).toContain("already exists");
  });

  it("mode 'replace' fails when the file does not exist", async () => {
    const p = path.join(repo, "nope.txt");
    const res = await write(p, "y\n", { cwd: repo, roots: [repo] }, "replace");
    expect(res.error).toContain("does not exist");
  });

  it("denies a path outside the connected worktrees", async () => {
    const outside = path.join(base, "out.txt");
    const res = await write(outside, "x", { cwd: repo, roots: [repo] });
    expect(res.error).toContain("outside the connected worktrees");
    expect(fs.existsSync(outside)).toBe(false);
  });

  it("denies when no worktrees are connected", async () => {
    const p = path.join(repo, "x.txt");
    const res = await write(p, "x", { cwd: repo, roots: [] });
    expect(res.error).toContain("no connected worktrees");
  });
});
