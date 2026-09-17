/**
 * read_file tool — connected-worktree scope enforcement.
 *
 * The tool must only read files inside one of the `roots` handed to it in the
 * execution context. An empty `roots` array (no connected worktrees) denies
 * every read. A missing `roots` (legacy / direct usage) stays unrestricted.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import os from "os";
import fs from "fs";
import path from "path";
import readFileTool from "openp41ge-agents-tool-read-file";
import type { ToolExecutionContext } from "openp41ge-agents-tool-types";

async function read(p: string, ctx: ToolExecutionContext) {
  return readFileTool.execute({ path: p }, ctx);
}

describe("read_file scope enforcement", () => {
  let base: string;
  let rootA: string;
  let rootB: string;
  let fileA: string;
  let fileB: string;

  beforeEach(() => {
    base = fs.mkdtempSync(path.join(os.tmpdir(), "read-file-scope-"));
    rootA = path.join(base, "repo-a", "main");
    rootB = path.join(base, "repo-a", "feature-x");
    fs.mkdirSync(rootA, { recursive: true });
    fs.mkdirSync(rootB, { recursive: true });
    fileA = path.join(rootA, "file.ts");
    fileB = path.join(rootB, "file.ts");
    fs.writeFileSync(fileA, "alpha");
    fs.writeFileSync(fileB, "beta");
  });

  afterEach(() => {
    fs.rmSync(base, { recursive: true, force: true });
  });

  it("reads a file inside a root", async () => {
    const res = await read(fileA, { cwd: rootA, roots: [rootA] });
    expect(res.error).toBeUndefined();
    expect(res.content).toBe("alpha");
  });

  it("reads a file inside ANY of the connected roots", async () => {
    const res = await read(fileB, { cwd: rootA, roots: [rootA, rootB] });
    expect(res.error).toBeUndefined();
    expect(res.content).toBe("beta");
  });

  it("denies a file outside every root", async () => {
    const outside = path.join(base, "elsewhere", "secret.ts");
    fs.mkdirSync(path.dirname(outside), { recursive: true });
    fs.writeFileSync(outside, "secret");
    const res = await read(outside, { cwd: rootA, roots: [rootA, rootB] });
    expect(res.error).toContain("outside the connected worktrees");
  });

  it("denies the bare repo directory (never a worktree root)", async () => {
    const gitDir = path.join(base, "repo-a", ".git", "objects", "ab");
    fs.mkdirSync(path.dirname(gitDir), { recursive: true });
    fs.writeFileSync(gitDir, "pack");
    const res = await read(gitDir, { cwd: rootA, roots: [rootA, rootB] });
    expect(res.error).toContain("outside the connected worktrees");
  });

  it("denies a sibling whose name is a prefix of a root", async () => {
    // rootA = …/repo-a/main; a directory named `main-evil` must not be allowed
    // through a naive prefix check.
    const evil = path.join(base, "repo-a", "main-evil", "file.ts");
    fs.mkdirSync(path.dirname(evil), { recursive: true });
    fs.writeFileSync(evil, "evil");
    const res = await read(evil, { cwd: rootA, roots: [rootA] });
    expect(res.error).toContain("outside the connected worktrees");
  });

  it("denies every read when no worktrees are connected", async () => {
    const res = await read(fileA, { cwd: rootA, roots: [] });
    expect(res.error).toContain("no connected worktrees");
  });

  it("is unrestricted when no roots are provided (legacy)", async () => {
    const res = await read(fileA, { cwd: rootA });
    expect(res.error).toBeUndefined();
    expect(res.content).toBe("alpha");
  });

  it("resolves cwd-relative paths and applies the scope", async () => {
    const res = await read("file.ts", { cwd: rootA, roots: [rootA] });
    expect(res.error).toBeUndefined();
    expect(res.content).toBe("alpha");

    const denied = await read("../file.ts", { cwd: rootB, roots: [rootB] });
    expect(denied.error).toContain("outside the connected worktrees");
  });
});
