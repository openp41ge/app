/**
 * Behaviour tests for NodeGitCommitService.getCommitMessage using a real
 * local git repo (bare clone under reposDir/<name>/.git), exercising the git
 * command and the full-message parsing exactly as in production.
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

describe("NodeGitCommitService.getCommitMessage", () => {
  let root: string;
  let srcRepo: string;
  let reposDir: string;
  let svc: NodeGitCommitService;
  const repoName = "github.com/example/demo";

  let hashBody: string;
  let hashSimple: string;

  beforeAll(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "openp41ge-msg-test-"));
    srcRepo = path.join(root, "src");
    fs.mkdirSync(srcRepo, { recursive: true });
    git(srcRepo, ["init", "-q", "-b", "main", "."]);

    fs.writeFileSync(path.join(srcRepo, "a.txt"), "one\n");
    git(srcRepo, ["add", "."]);
    git(srcRepo, ["commit", "-qm", "initial commit"]);
    hashSimple = git(srcRepo, ["rev-parse", "HEAD"]);

    // A commit whose BODY contains `|` and multiple lines — proves the
    // newline-separated format preserves the raw message untouched.
    fs.writeFileSync(path.join(srcRepo, "b.txt"), "two\n");
    git(srcRepo, ["add", "."]);
    git(srcRepo, [
      "commit",
      "-qm",
      "feat: add pipeline runner | v2",
      "-m",
      "Implements the pipeline runner.\n\nCloses #42 — pipes | and more.",
    ]);
    hashBody = git(srcRepo, ["rev-parse", "HEAD"]);

    reposDir = path.join(root, "repos");
    fs.mkdirSync(reposDir, { recursive: true });
    git(reposDir, ["clone", "--bare", "--quiet", srcRepo, path.join(reposDir, repoName, ".git")]);

    svc = new NodeGitCommitService(reposDir);
  });

  afterAll(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("returns the full subject + body message intact", async () => {
    const entry = await svc.getCommitMessage(repoName, hashBody);
    expect(entry).not.toBeNull();
    expect(entry!.hash).toBe(hashBody);
    expect(entry!.shortHash).toBe(hashBody.slice(0, 7));
    expect(entry!.authorName).toBe("t");
    expect(entry!.authorEmail).toBe("t@t.co");
    // `message` = subject line; `fullMessage` = raw subject + body.
    expect(entry!.message).toBe("feat: add pipeline runner | v2");
    expect(entry!.fullMessage).toContain("Implements the pipeline runner.");
    expect(entry!.fullMessage).toContain("Closes #42 — pipes | and more.");
    // The `|` in the subject must survive — a `|`-delimited format would split it.
    expect(entry!.fullMessage).toContain("feat: add pipeline runner | v2");
    expect(entry!.parents).toEqual([hashSimple]);
  });

  it("accepts a short hash and returns the same commit", async () => {
    const entry = await svc.getCommitMessage(repoName, hashBody.slice(0, 12));
    expect(entry?.hash).toBe(hashBody);
  });

  it("returns null for an unknown hash", async () => {
    const entry = await svc.getCommitMessage(repoName, "deadbeef".repeat(5));
    expect(entry).toBeNull();
  });

  it("returns the simple subject for a one-line commit", async () => {
    const entry = await svc.getCommitMessage(repoName, hashSimple);
    expect(entry?.message).toBe("initial commit");
    expect(entry?.fullMessage).toBe("initial commit");
  });
});
