/**
 * search_files tool — connected-worktree scope enforcement + targeting.
 *
 * The tool must only search inside the `roots` scope handed to it. It can
 * target a specific worktree or a group of them via the `roots` argument; when
 * omitted it searches every connected worktree. An empty `roots` scope (no
 * connected worktrees) denies every search. A missing `roots` scope (legacy /
 * direct usage) stays unrestricted.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import os from "os";
import fs from "fs";
import path from "path";
import searchFilesTool from "openp41ge-agents-tool-search-files";
import type { ToolExecutionContext } from "openp41ge-agents-tool-types";

async function search(args: Record<string, unknown>, ctx: ToolExecutionContext) {
  return searchFilesTool.execute(args, ctx);
}

describe("search_files scope enforcement", () => {
  let base: string;
  let rootA: string;
  let rootB: string;
  let fileA: string;
  let fileB: string;

  beforeEach(() => {
    base = fs.mkdtempSync(path.join(os.tmpdir(), "search-files-scope-"));
    rootA = path.join(base, "repo-a", "main");
    rootB = path.join(base, "repo-a", "feature-x");
    fs.mkdirSync(rootA, { recursive: true });
    fs.mkdirSync(rootB, { recursive: true });
    fileA = path.join(rootA, "src", "alpha.ts");
    fileB = path.join(rootB, "src", "beta.ts");
    fs.mkdirSync(path.dirname(fileA), { recursive: true });
    fs.mkdirSync(path.dirname(fileB), { recursive: true });
    fs.writeFileSync(fileA, "x");
    fs.writeFileSync(fileB, "x");
  });

  afterEach(() => {
    fs.rmSync(base, { recursive: true, force: true });
  });

  it("searches every connected worktree by default", async () => {
    const res = await search({ query: "ts" }, { cwd: rootA, roots: [rootA, rootB] });
    expect(res.error).toBeUndefined();
    expect(res.content).toContain(fileA);
    expect(res.content).toContain(fileB);
  });

  it("searches a specific worktree / group when roots are requested", async () => {
    const res = await search(
      { query: "ts", roots: [rootA] },
      { cwd: rootA, roots: [rootA, rootB] },
    );
    expect(res.error).toBeUndefined();
    expect(res.content).toContain(fileA);
    expect(res.content).not.toContain(fileB);
  });

  it("rejects a requested root outside the connected worktrees", async () => {
    const outside = path.join(base, "elsewhere");
    fs.mkdirSync(outside, { recursive: true });
    const res = await search({ query: "ts", roots: [outside] }, { cwd: rootA, roots: [rootA] });
    expect(res.error).toContain("outside the connected worktrees");
  });

  it("rejects a search that names a bare repo directory", async () => {
    const gitDir = path.join(base, "repo-a", ".git");
    const res = await search({ query: "ts", roots: [gitDir] }, { cwd: rootA, roots: [rootA] });
    expect(res.error).toContain("outside the connected worktrees");
  });

  it("denies every search when no worktrees are connected", async () => {
    const res = await search({ query: "ts" }, { cwd: rootA, roots: [] });
    expect(res.error).toContain("no connected worktrees");
  });

  it("is unrestricted when no scope is provided (legacy)", async () => {
    const res = await search({ query: "alpha", roots: [rootA] }, { cwd: rootA });
    expect(res.error).toBeUndefined();
    expect(res.content).toContain(fileA);
  });

  it("resolves relative roots against cwd and applies the scope", async () => {
    const res = await search(
      { query: "ts", roots: ["../feature-x"] },
      { cwd: rootA, roots: [rootA, rootB] },
    );
    expect(res.error).toBeUndefined();
    expect(res.content).toContain(fileB);
  });
});
