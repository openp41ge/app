import { spawn, exec } from "child_process";
import fs from "fs";
import path from "path";
import { EventEmitter } from "events";
import type {
  IGitService,
  RepoInfo,
  WorktreeInfo,
  GitCloneSession,
  GitCloneResult,
} from "../interfaces/git-service.js";

/**
 * Git service implementation using Node.js child_process.
 *
 * Repositories are stored under reposDir in a hierarchical layout:
 *   reposDir/<provider>/<org>/<repo>/
 *     .git/          ← bare repo internals (HEAD, config, objects/, refs/)
 *     main/          ← worktree (files from the main branch)
 *     feature/       ← worktree (files from the feature branch)
 *
 * Examples:
 *   git@github.com:user/repo.git → github/user/repo/
 *   https://gitlab.com/group/sub/project.git → gitlab/group/sub/project/
 */
export class NodeGitService implements IGitService {
  private _reposDir: string;
  private _initialized = false;

  constructor(reposDir: string) {
    this._reposDir = reposDir;
  }

  /** Update the repositories directory (used when switching to a project). */
  setReposDir(reposDir: string): void {
    this._reposDir = reposDir;
    this._initialized = false;
  }

  private _ensureDir(): void {
    if (!this._initialized) {
      fs.mkdirSync(this._reposDir, { recursive: true });
      this._initialized = true;
    }
  }

  /** Parent directory for a repo (where .git/ and worktrees live). */
  private _repoDir(name: string): string {
    return path.join(this._reposDir, name);
  }

  /** Bare .git directory for a repo. */
  private _gitDir(name: string): string {
    return path.join(this._reposDir, name, ".git");
  }

  /**
   * Execute a git command within a repo's parent directory using --git-dir=.git
   * so that worktree operations create siblings of .git/.
   */
  private async _execGit(args: string[], repoName: string): Promise<string> {
    const repoDir = this._repoDir(repoName);
    return new Promise((resolve, reject) => {
      exec(
        `git -C "${repoDir.replace(/"/g, '\\"')}" --git-dir=.git ${args.map((a) => `"${a.replace(/"/g, '\\"')}"`).join(" ")}`,
        {
          maxBuffer: 10 * 1024 * 1024,
          timeout: 120_000,
        },
        (error, stdout, stderr) => {
          if (error) {
            const msg = stderr.trim() || error.message;
            reject(new Error(`git error: ${msg}`));
          } else {
            resolve(stdout.trim());
          }
        },
      );
    });
  }

  // ── Clone ──────────────────────────────────────────────────────────────

  clone(url: string): GitCloneSession {
    this._ensureDir();
    const name = this._deriveRepoName(url);
    const repoDir = this._repoDir(name);
    const gitDir = this._gitDir(name);

    if (fs.existsSync(gitDir)) {
      return {
        promise: Promise.resolve({ success: true, path: gitDir }),
        onProgress: () => () => {},
        abort: () => {},
      };
    }

    fs.mkdirSync(repoDir, { recursive: true });

    const emitter = new EventEmitter();
    let aborted = false;

    const child = spawn("git", ["clone", "--bare", "--progress", url, gitDir], {
      cwd: this._reposDir,
      stdio: ["ignore", "ignore", "pipe"],
      timeout: 300_000,
    });

    let lastPercent = 0;
    child.stderr!.on("data", (data: Buffer) => {
      if (aborted) return;
      const lines = data.toString("utf-8").split("\n");
      for (const line of lines) {
        if (!line.trim()) continue;
        const percentMatch = line.match(/(\d+)%/);
        const pct = percentMatch ? Math.min(100, Math.max(0, parseInt(percentMatch[1], 10))) : 0;
        if (pct > lastPercent) lastPercent = pct;
        emitter.emit("progress", {
          percent: Math.max(lastPercent, pct),
          message: line.trim().replace(/\r/g, ""),
        });
      }
    });

    const promise = new Promise<GitCloneResult>((resolve) => {
      child.on("close", (code) => {
        if (aborted) {
          resolve({ success: false, error: "Clone aborted" });
          return;
        }
        if (code === 0) {
          emitter.emit("progress", { percent: 100, message: "Clone complete" });
          resolve({ success: true, path: gitDir });
        } else {
          const stderr = child.stderr!.read()?.toString("utf-8") || "Unknown error";
          resolve({ success: false, error: stderr.trim() });
        }
      });
      child.on("error", (err) => {
        if (!aborted) resolve({ success: false, error: err.message });
      });
    });

    return {
      promise,
      onProgress: (callback) => {
        emitter.on("progress", callback);
        return () => emitter.off("progress", callback);
      },
      abort: () => {
        aborted = true;
        child.kill("SIGTERM");
      },
    };
  }

  // ── List / get repos ──────────────────────────────────────────────────

  async listRepos(): Promise<RepoInfo[]> {
    this._ensureDir();
    const candidates: { name: string; gitDir: string }[] = [];

    const walk = (dir: string): void => {
      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const fullPath = path.join(dir, entry.name);
        const gitDir = path.join(fullPath, ".git");
        if (fs.existsSync(gitDir)) {
          candidates.push({
            name: path.relative(this._reposDir, fullPath),
            gitDir,
          });
        }
        walk(fullPath);
      }
    };

    walk(this._reposDir);

    const repos: RepoInfo[] = [];
    for (const c of candidates) {
      try {
        const output = await this._execGit(["rev-parse", "--is-bare-repository"], c.name);
        if (output === "true") {
          let url = "";
          try {
            url = await this._execGit(["config", "--get", "remote.origin.url"], c.name);
          } catch {
            url = "";
          }
          repos.push({ path: c.gitDir, name: c.name, url });
        }
      } catch {
        /* skip */
      }
    }
    return repos;
  }

  async getRepo(name: string): Promise<RepoInfo | null> {
    this._ensureDir();
    const gitDir = this._gitDir(name);
    if (!fs.existsSync(gitDir)) return null;
    try {
      const output = await this._execGit(["rev-parse", "--is-bare-repository"], name);
      if (output !== "true") return null;
      let url = "";
      try {
        url = await this._execGit(["config", "--get", "remote.origin.url"], name);
      } catch {
        url = "";
      }
      return { path: gitDir, name, url };
    } catch {
      return null;
    }
  }

  // ── Worktrees ─────────────────────────────────────────────────────────

  async listWorktrees(repoName: string): Promise<WorktreeInfo[]> {
    this._ensureDir();
    const repoDir = this._repoDir(repoName);
    if (!fs.existsSync(repoDir)) return [];

    try {
      const branchesOutput = await this._execGit(
        ["branch", "--list", "--format=%(refname:short)"],
        repoName,
      );
      const branches = branchesOutput ? branchesOutput.split("\n") : [];
      const worktrees: WorktreeInfo[] = [];
      for (const branch of branches) {
        if (!branch) continue;
        const dirName = branch.replace(/\//g, "--");
        const worktreePath = path.join(repoDir, dirName);
        if (fs.existsSync(worktreePath) && fs.lstatSync(worktreePath).isDirectory()) {
          worktrees.push({ branch, path: worktreePath, exists: true });
        }
      }
      return worktrees;
    } catch {
      return [];
    }
  }

  async checkoutWorktree(repoName: string, branch: string): Promise<WorktreeInfo> {
    this._ensureDir();
    const repoDir = this._repoDir(repoName);
    const dirName = branch.replace(/\//g, "--");
    const worktreePath = path.join(repoDir, dirName);

    if (fs.existsSync(worktreePath)) {
      return { branch, path: worktreePath, exists: true };
    }

    // Check if branch exists locally
    let branchExists = false;
    try {
      const output = await this._execGit(["rev-parse", "--verify", branch], repoName);
      branchExists = !!output;
    } catch {
      branchExists = false;
    }

    if (branchExists) {
      // Local branch exists — create worktree directly
      await this._execGit(["worktree", "add", "--checkout", dirName, branch], repoName);
    } else {
      // Check if branch exists on remote
      let remoteExists = false;
      try {
        const remoteOutput = await this._execGit(
          ["ls-remote", "--heads", "origin", branch],
          repoName,
        );
        remoteExists = !!remoteOutput.trim();
      } catch {
        remoteExists = false;
      }

      if (remoteExists) {
        // Remote branch exists — fetch it, create local tracking branch, then worktree
        await this._execGit(["fetch", "origin", `${branch}:${branch}`], repoName);
        await this._execGit(["worktree", "add", "--checkout", dirName, branch], repoName);
      } else {
        // Branch doesn't exist anywhere — create it from HEAD and add worktree
        await this._execGit(["branch", branch], repoName);
        await this._execGit(["worktree", "add", "--checkout", dirName, branch], repoName);
      }
    }

    return { branch, path: worktreePath, exists: true };
  }

  async deleteWorktree(repoName: string, branch: string): Promise<void> {
    const repoDir = this._repoDir(repoName);
    const dirName = branch.replace(/\//g, "--");
    const worktreePath = path.join(repoDir, dirName);
    if (!fs.existsSync(worktreePath)) return;
    try {
      await this._execGit(["worktree", "remove", dirName], repoName);
    } catch {
      fs.rmSync(worktreePath, { recursive: true, force: true });
      try {
        await this._execGit(["worktree", "prune"], repoName);
      } catch {
        /* ignore */
      }
    }
  }

  async pullBranch(repoName: string, branch: string): Promise<void> {
    const dirName = branch.replace(/\//g, "--");
    const worktreePath = path.join(this._repoDir(repoName), dirName);
    const gitDir = this._gitDir(repoName);

    // Fetch latest from remote (runs from repo dir, works fine)
    await this.fetch(repoName);

    // Merge remote tracking branch into local branch.
    // Must run inside the worktree, not the bare repo dir.
    if (fs.existsSync(worktreePath)) {
      try {
        await this._execGitInDir(["merge", "--ff-only", `origin/${branch}`], worktreePath, gitDir);
      } catch {
        // Fast-forward may fail; try regular merge
        await this._execGitInDir(["merge", `origin/${branch}`], worktreePath, gitDir);
      }

      // Checkout latest files into the worktree
      await this._execGitInDir(["checkout", "--", "."], worktreePath, gitDir);
    }
  }

  /**
   * Execute a git command in a specific worktree directory, pointing to the
   * shared .git directory (needed because worktrees use gitlink files).
   */
  private async _execGitInDir(args: string[], cwd: string, gitDir: string): Promise<string> {
    return new Promise((resolve, reject) => {
      exec(
        `git --git-dir="${gitDir}" --work-tree="${cwd}" ${args.map((a) => `"${a.replace(/"/g, '\\"')}"`).join(" ")}`,
        {
          cwd,
          maxBuffer: 10 * 1024 * 1024,
          timeout: 120_000,
        },
        (error, stdout, stderr) => {
          if (error) {
            const msg = stderr.trim() || error.message;
            reject(new Error(`git error: ${msg}`));
          } else {
            resolve(stdout.trim());
          }
        },
      );
    });
  }

  async fetch(repoName: string): Promise<void> {
    const gitDir = this._gitDir(repoName);
    if (!fs.existsSync(gitDir)) return;
    // Update checked-out branches safely (--update-head-ok bypasses
    // the "refusing to fetch into checked-out branch" safety check
    // for worktree-checked-out branches)
    await this._execGit(
      ["fetch", "origin", "+refs/heads/*:refs/heads/*", "--update-head-ok"],
      repoName,
    );
  }

  async getCurrentBranch(dirPath: string): Promise<string | null> {
    try {
      const gitPath = path.join(dirPath, ".git");
      const stat = fs.statSync(gitPath);
      let headPath: string;
      if (stat.isFile()) {
        const content = fs.readFileSync(gitPath, "utf-8");
        const match = content.match(/^gitdir:\s*(.+)$/m);
        if (!match) return null;
        headPath = path.join(match[1].trim(), "HEAD");
      } else if (stat.isDirectory()) {
        headPath = path.join(gitPath, "HEAD");
      } else {
        return null;
      }
      const head = fs.readFileSync(headPath, "utf-8");
      const refMatch = head.match(/^ref:\s*refs\/heads\/(.+)$/m);
      return refMatch ? refMatch[1].trim() : null;
    } catch {
      return null;
    }
  }

  async listBranches(repoName: string): Promise<string[]> {
    this._ensureDir();
    const gitDir = this._gitDir(repoName);
    if (!fs.existsSync(gitDir)) return [];
    try {
      const output = await this._execGit(["branch", "-a", "--format=%(refname:short)"], repoName);
      if (!output) return [];
      const branches = output.split("\n").filter(Boolean);
      const seen = new Set<string>();
      const result: string[] = [];
      for (const b of branches) {
        const normalized = b.replace(/^origin\//, "");
        if (!seen.has(normalized) && normalized !== "HEAD") {
          seen.add(normalized);
          result.push(normalized);
        }
      }
      return result.sort();
    } catch {
      return [];
    }
  }

  async getDefaultBranch(repoName: string): Promise<string | null> {
    this._ensureDir();
    const gitDir = this._gitDir(repoName);
    if (!fs.existsSync(gitDir)) return null;
    try {
      const output = await this._execGit(["symbolic-ref", "refs/remotes/origin/HEAD"], repoName);
      if (!output) return null;
      const match = output.match(/refs\/remotes\/origin\/(.+)$/);
      return match ? match[1] : null;
    } catch {
      try {
        const branches = await this.listBranches(repoName);
        return branches.find((b) => b === "main" || b === "master") ?? branches[0] ?? null;
      } catch {
        return null;
      }
    }
  }

  // ── URL parsing ────────────────────────────────────────────────────────

  /**
   * Derive a hierarchical directory path from a git URL.
   *
   * Examples:
   *   git@github.com:user/repo.git       → "github.com/user/repo"
   *   https://github.com/user/repo.git   → "github.com/user/repo"
   *   git@gitlab.com:group/sub/project.git → "gitlab.com/group/sub/project"
   *   https://gitlab.example.com/org/proj.git → "gitlab.example.com/org/proj"
   */
  private _deriveRepoName(url: string): string {
    // Strip protocol and git@ prefix
    let cleaned = url
      .replace(/^https?:\/\//, "")
      .replace(/^git@/, "")
      .replace(/\.git$/, "");

    // SSH: "github.com:user/repo" → ["github.com", "user", "repo"]
    // HTTPS: "github.com/user/repo" → ["github.com", "user", "repo"]
    const parts = cleaned.split(/[/:]/);

    const provider = parts[0];
    const repoName = parts[parts.length - 1];
    const orgPath = parts.slice(1, -1).join("/");

    return orgPath ? `${provider}/${orgPath}/${repoName}` : `${provider}/${repoName}`;
  }
}
