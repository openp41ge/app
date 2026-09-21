/**
 * edit_file tool — connected-worktree scope + git-patch application.
 *
 * Verifies the tool only edits files inside a connected root, and that an edit
 * lands as an unstaged git working-tree change produced via `git apply`.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import os from "os";
import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";
import editFileTool from "openp41ge-agents-tool-edit-file";
import type { ToolExecutionContext } from "openp41ge-agents-tool-types";

function git(args: string[], cwd: string): void {
  const r = spawnSync("git", args, { cwd, encoding: "utf-8" });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr}`);
}

async function edit(
  p: string,
  edits: Array<{ old: string; new: string }>,
  ctx: ToolExecutionContext,
) {
  return editFileTool.execute({ path: p, edits }, ctx);
}

describe("edit_file", () => {
  let base: string;
  let repo: string;
  let fileA: string;

  beforeEach(() => {
    base = fs.mkdtempSync(path.join(os.tmpdir(), "edit-file-"));
    repo = path.join(base, "repo");
    fs.mkdirSync(repo, { recursive: true });
    git(["init", "-q"], repo);
    git(["config", "user.email", "t@t"], repo);
    git(["config", "user.name", "t"], repo);
    fileA = path.join(repo, "a.txt");
    fs.writeFileSync(fileA, "line1\nline2\nline3\n");
    git(["add", "a.txt"], repo);
    git(["commit", "-qm", "init"], repo);
  });

  afterEach(() => {
    fs.rmSync(base, { recursive: true, force: true });
  });

  it("applies an edit and leaves an unstaged working-tree diff", async () => {
    const res = await edit(fileA, [{ old: "line2", new: "CHANGED" }], { cwd: repo, roots: [repo] });
    expect(res.error).toBeUndefined();
    expect(fs.readFileSync(fileA, "utf-8")).toBe("line1\nCHANGED\nline3\n");
    const status = spawnSync("git", ["status", "--porcelain"], { cwd: repo, encoding: "utf-8" });
    expect(status.stdout.trimEnd()).toBe(" M a.txt"); // modified, not staged
  });

  it("applies multiple edits in order", async () => {
    const res = await edit(
      fileA,
      [
        { old: "line1", new: "ONE" },
        { old: "line3", new: "THREE" },
      ],
      { cwd: repo, roots: [repo] },
    );
    expect(res.error).toBeUndefined();
    expect(fs.readFileSync(fileA, "utf-8")).toBe("ONE\nline2\nTHREE\n");
  });

  it("rejects an 'old' that is not present", async () => {
    const res = await edit(fileA, [{ old: "nope", new: "x" }], { cwd: repo, roots: [repo] });
    expect(res.error).toContain("not found");
    expect(fs.readFileSync(fileA, "utf-8")).toBe("line1\nline2\nline3\n");
  });

  it("rejects an ambiguous 'old' that occurs more than once", async () => {
    fs.writeFileSync(fileA, "dup\ndup\n");
    const res = await edit(fileA, [{ old: "dup", new: "x" }], { cwd: repo, roots: [repo] });
    expect(res.error).toContain("ambiguous");
  });

  it("denies a path outside the connected worktrees", async () => {
    const outside = path.join(base, "outside.txt");
    fs.writeFileSync(outside, "x");
    const res = await edit(outside, [{ old: "x", new: "y" }], { cwd: repo, roots: [repo] });
    expect(res.error).toContain("outside the connected worktrees");
    expect(fs.readFileSync(outside, "utf-8")).toBe("x");
  });

  it("denies when no worktrees are connected", async () => {
    const res = await edit(fileA, [{ old: "line1", new: "x" }], { cwd: repo, roots: [] });
    expect(res.error).toContain("no connected worktrees");
  });

  it("is unrestricted when no roots are provided (legacy)", async () => {
    const res = await edit(fileA, [{ old: "line2", new: "X" }], { cwd: repo });
    expect(res.error).toBeUndefined();
    expect(fs.readFileSync(fileA, "utf-8")).toBe("line1\nX\nline3\n");
  });

  it("rejects when a path resolves into multiple connected roots (ambiguous)", async () => {
    const res = await edit(fileA, [{ old: "line2", new: "X" }], { cwd: repo, roots: [repo, repo] });
    expect(res.error).toContain("ambiguous");
  });
});
