/**
 * Behaviour tests for NodeGitCommitService.searchCommits using a real local
 * git repo (bare clone under reposDir/<name>/.git), so the git commands and
 * the record-parsing are exercised end-to-end exactly as in production.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { NodeGitCommitService } from "../../../src/main/services/node-git-commit-service";

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

describe("NodeGitCommitService.searchCommits", () => {
  let root: string;
  let srcRepo: string;
  let reposDir: string;
  let svc: NodeGitCommitService;
  const repoName = "github.com/example/demo";

  /** Values set during the test setup — capture commit messages by index. */
  const shortHash: Record<string, string> = {};

  beforeAll(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "openp41ge-search-test-"));
    srcRepo = path.join(root, "src");
    fs.mkdirSync(srcRepo, { recursive: true });
    git(srcRepo, ["init", "-q", "-b", "main", "."]);

    fs.writeFileSync(path.join(srcRepo, "a.txt"), "hello world\n");
    git(srcRepo, ["add", "."]);
    git(srcRepo, ["commit", "-qm", "initial commit"]);

    fs.writeFileSync(path.join(srcRepo, "a.txt"), "hello world again\n");
    git(srcRepo, ["add", "."]);
    git(srcRepo, ["commit", "-qm", "add feature xyz alpha"]);

    fs.writeFileSync(path.join(srcRepo, "b.txt"), "sample content\n");
    git(srcRepo, ["add", "."]);
    git(srcRepo, ["commit", "-qm", "add b.txt helper"]);

    // A commit whose MESSAGE does not mention the changed file path — used to
    // prove file-scope / all-scope match by path alone.
    fs.mkdirSync(path.join(srcRepo, "docs"), { recursive: true });
    fs.writeFileSync(path.join(srcRepo, "docs", "readme.md"), "# Demo\n");
    git(srcRepo, ["add", "."]);
    git(srcRepo, ["commit", "-qm", "cleanup: remove cruft"]);

    // A commit whose BODY (not subject) contains the search token — used to
    // prove all-scope keeps git-native body matches that message-scope finds.
    fs.writeFileSync(path.join(srcRepo, "c.txt"), "widget\n");
    git(srcRepo, ["add", "."]);
    git(srcRepo, ["commit", "-qm", "chore: install widget", "-m", "Fixes the thingamajig zorple"]);

    // Tag the commits for stable assertions (oldest → newest).
    const logs = git(srcRepo, ["log", "--oneline", "--reverse"]).split("\n").filter(Boolean);
    logs.forEach((line, i) => {
      const h = line.split(" ")[0];
      shortHash[`c${i}`] = h;
    });

    reposDir = path.join(root, "repos");
    fs.mkdirSync(reposDir, { recursive: true });
    git(reposDir, ["clone", "--bare", "--quiet", srcRepo, path.join(reposDir, repoName, ".git")]);

    svc = new NodeGitCommitService(reposDir);
  });

  afterAll(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("message scope matches the commit message (case-insensitive, --grep)", async () => {
    const results = await svc.searchCommits(repoName, { query: "xyz alpha", in: "message" });
    expect(results).toHaveLength(1);
    expect(results[0].shortHash).toBe(shortHash.c1);
    expect(results[0].message).toContain("xyz alpha");
    expect(results[0].files).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: "a.txt" })]),
    );

    // Case-insensitive
    const upper = await svc.searchCommits(repoName, { query: "XYZ ALPHA", in: "message" });
    expect(upper).toHaveLength(1);
  });

  it("caseSensitive true excludes case-mismatched message matches", async () => {
    // The fixture message is lowercase "add feature xyz alpha".
    const ci = await svc.searchCommits(repoName, { query: "XYZ ALPHA", in: "message" });
    expect(ci).toHaveLength(1);
    const cs = await svc.searchCommits(repoName, {
      query: "XYZ ALPHA",
      in: "message",
      caseSensitive: true,
    });
    expect(cs).toHaveLength(0);
  });

  it("regex option toggles regex vs literal matching", async () => {
    // "xyz*" never appears literally, but as a regex (xy + zero-or-more z) it
    // matches "add feature xyz alpha" (c1).
    const literal = await svc.searchCommits(repoName, { query: "xyz*", in: "message" });
    expect(literal).toHaveLength(0);
    const regex = await svc.searchCommits(repoName, {
      query: "xyz*",
      in: "message",
      regex: true,
    });
    expect(regex.map((r) => r.shortHash)).toContain(shortHash.c1);
  });

  it("caseSensitive + regex combine", async () => {
    const mixed = await svc.searchCommits(repoName, {
      query: "xyz*",
      in: "message",
      regex: true,
      caseSensitive: true,
    });
    expect(mixed.map((r) => r.shortHash)).toContain(shortHash.c1);
  });

  it("maxCount caps the walked history, dropping older commits", async () => {
    // "add feature xyz alpha" (c1) is an old commit — reachable within the
    // default walk.
    const deep = await svc.searchCommits(repoName, {
      query: "xyz alpha",
      in: "message",
    });
    expect(deep.map((r) => r.shortHash)).toEqual([shortHash.c1]);

    // With maxCount 1 only the newest commit is examined, so the old match
    // disappears entirely.
    const shallow = await svc.searchCommits(repoName, {
      query: "xyz alpha",
      in: "message",
      maxCount: 1,
    });
    expect(shallow).toHaveLength(0);
  });

  it("files scope matches changed-file paths", async () => {
    const results = await svc.searchCommits(repoName, { query: "b.txt", in: "files" });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].shortHash).toBe(shortHash.c2);
    expect(results[0].files).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: "b.txt", additions: 1 })]),
    );
  });

  it("files scope finds a commit by path even when the message never mentions it", async () => {
    const results = await svc.searchCommits(repoName, { query: "readme", in: "files" });
    expect(results).toHaveLength(1);
    expect(results[0].shortHash).toBe(shortHash.c3);
    expect(results[0].message).toBe("cleanup: remove cruft");
  });

  it("all scope matches message OR changed-file path", async () => {
    const results = await svc.searchCommits(repoName, { query: "xyz", in: "all" });
    const hashes = results.map((r) => r.shortHash);
    expect(hashes).toEqual([shortHash.c1]); // message match only

    // A query matching only a file path (not any message) still hits via all.
    const pathOnly = await svc.searchCommits(repoName, { query: "readme", in: "all" });
    expect(pathOnly.map((r) => r.shortHash)).toEqual([shortHash.c3]);
  });

  it("all scope returns body-only message matches (superset of message scope, never fewer)", async () => {
    // "zorple" appears only in the commit BODY. message-scope (--grep)
    // matches subject + body → finds it. all-scope must keep that hit (files
    // on should only add results, never drop message matches).
    const messageScope = await svc.searchCommits(repoName, { query: "zorple", in: "message" });
    expect(messageScope).toHaveLength(1);
    expect(messageScope[0].shortHash).toBe(shortHash.c4);

    const allScope = await svc.searchCommits(repoName, { query: "zorple", in: "all" });
    expect(allScope).toHaveLength(1);
    expect(allScope[0].shortHash).toBe(shortHash.c4);
  });

  it("an empty query returns no results", async () => {
    const results = await svc.searchCommits(repoName, { query: "   ", in: "message" });
    expect(results).toEqual([]);
  });

  it("a garbage query returns no results", async () => {
    const results = await svc.searchCommits(repoName, {
      query: "zzz-no-such-token-zzz",
      in: "all",
    });
    expect(results).toEqual([]);
  });

  it("offset/limit slice the result set", async () => {
    // Query "add" matches c1 ("add feature xyz alpha") and c2 ("add b.txt
    // helper") — newest first in git log.
    const results = await svc.searchCommits(repoName, { query: "add", in: "message", limit: 1 });
    expect(results).toHaveLength(1);
    // Git log is newest-first, so the first page is c2.
    expect(results[0].shortHash).toBe(shortHash.c2);

    const page2 = await svc.searchCommits(repoName, {
      query: "add",
      in: "message",
      offset: 1,
      limit: 1,
    });
    expect(page2).toHaveLength(1);
    expect(page2[0].shortHash).toBe(shortHash.c1);
  });

  it("throws for an unknown repo", async () => {
    await expect(
      svc.searchCommits("github.com/example/missing", { query: "abc", in: "message" }),
    ).rejects.toThrow();
  });
});
