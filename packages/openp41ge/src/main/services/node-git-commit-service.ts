/**
 * NodeGitCommitService — git commit/branch queries via child_process.
 *
 * Executes git commands against a bare repo directory.
 * Follows the same patterns as NodeGitService for directory resolution.
 */

import { exec } from "child_process";
import path from "path";
import type {
  IGitCommitService,
  CommitEntry,
  BranchEntry,
  DiffStatEntry,
} from "../interfaces/git-commit-service.js";

export class NodeGitCommitService implements IGitCommitService {
  private readonly _reposDir: string;

  constructor(reposDir: string) {
    this._reposDir = reposDir;
  }

  private _gitDir(repoName: string): string {
    return path.join(this._reposDir, repoName, ".git");
  }

  private async _execGit(args: string[], repoName: string): Promise<string> {
    const repoDir = path.join(this._reposDir, repoName);
    return new Promise((resolve, reject) => {
      exec(
        `git -C "${repoDir.replace(/"/g, '\\"')}" --git-dir=.git ${args.map((a) => `"${a.replace(/"/g, '\\"')}"`).join(" ")}`,
        {
          maxBuffer: 10 * 1024 * 1024,
          timeout: 30_000,
        },
        (error, stdout, stderr) => {
          if (error) {
            reject(new Error(stderr.trim() || error.message));
          } else {
            resolve(stdout.trimEnd());
          }
        },
      );
    });
  }

  /**
   * Get commit log with hash-based pagination.
   * First page: runs `git log <branch>` with max-count.
   * Next pages: uses `<after>..HEAD` as revision range so git walks from HEAD
   * and stops at the given boundary — O(log n) instead of the O(n) --skip.
   */
  async getCommitLog(
    repoName: string,
    branch: string,
    options?: { maxCount?: number; skip?: number },
  ): Promise<CommitEntry[]> {
    const maxCount = options?.maxCount ?? 50;
    const skip = options?.skip ?? 0;

    const args: string[] = [
      "log",
      branch,
      `--max-count=${maxCount}`,
      `--skip=${skip}`,
      `--format=%H|%h|%an|%ae|%aI|%ar|%s|%b%n---BODY_END---%n%P%n%D%n---ENTRY_END---`,
    ];

    const output = await this._execGit(args, repoName);

    if (!output) return [];
    return this._parseCommitLog(output);
  }

  private _parseCommitLog(output: string): CommitEntry[] {
    const entries: CommitEntry[] = [];

    // Split by the entry-end marker to get individual commit entries
    const rawEntries = output.split("\n---ENTRY_END---\n");

    for (const raw of rawEntries) {
      if (!raw.trim()) continue;

      // Split each entry into header+body and footer using the body-end marker
      const bodyEndIdx = raw.indexOf("\n---BODY_END---\n");
      if (bodyEndIdx === -1) continue;

      const headerBody = raw.slice(0, bodyEndIdx);
      const footer = raw.slice(bodyEndIdx + "\n---BODY_END---\n".length);

      // Parse header line (first line of headerBody)
      const firstLine = headerBody.split("\n")[0];
      const parts = firstLine.split("|");
      if (parts.length < 8) continue;

      const hash = parts[0];
      const shortHash = parts[1];
      const authorName = parts[2];
      const authorEmail = parts[3];
      const date = parts[4];
      const relativeDate = parts[5];
      const message = parts[6] || "";

      // Extract body: everything after the first line in headerBody
      const bodyFromHeader = headerBody.split("\n").slice(1).join("\n").trim();
      const fullMessage = bodyFromHeader || message;

      // Parse footer: first line = parents, second line = refs
      const footerLines = footer.trimEnd().split("\n");
      const parents = footerLines.length > 0 && footerLines[0] ? footerLines[0].split(" ") : [];
      const refsStr = footerLines.length > 1 ? footerLines[1] || "" : "";

      // Parse refs
      const refs: string[] = [];
      if (refsStr) {
        for (const ref of refsStr.split(", ")) {
          const trimmed = ref.trim();
          if (trimmed) refs.push(trimmed);
        }
      }

      entries.push({
        hash,
        shortHash,
        authorName,
        authorEmail,
        date,
        relativeDate,
        message,
        fullMessage,
        refs,
        parents,
      });
    }

    return entries;
  }

  async getBranches(repoName: string): Promise<BranchEntry[]> {
    // Get current branch (checked out HEAD)
    let currentBranch = "";
    try {
      currentBranch = (await this._execGit(["rev-parse", "--abbrev-ref", "HEAD"], repoName)).trim();
    } catch {
      // Detached HEAD or bare repo
    }

    // Get local branches with upstream and last commit info
    const localOutput = await this._execGit(
      [
        "for-each-ref",
        "--format=%(refname:short)%00%(objectname:short)%00%(upstream:short)%00%(upstream:track)",
        "refs/heads/",
      ],
      repoName,
    );

    // Get remote branches
    let remoteOutput = "";
    try {
      remoteOutput = await this._execGit(
        ["for-each-ref", "--format=%(refname:short)", "refs/remotes/origin/"],
        repoName,
      );
    } catch {
      // No remote branches
    }

    // Build a map of local branches
    const localBranches = new Map<string, { shortHash: string; upstream: string; track: string }>();

    for (const line of localOutput.split("\n")) {
      if (!line.trim()) continue;
      const [ref, shortHash, upstream, track] = line.split("\0");
      if (!ref) continue;
      const name = ref.replace("refs/heads/", "");
      localBranches.set(name, {
        shortHash: shortHash || "",
        upstream: upstream || "",
        track: track || "",
      });
    }

    // Parse remote branches
    const remoteBranches = new Set<string>();
    for (const line of remoteOutput.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const name = trimmed.replace(/^origin\//, "");
      if (name !== "HEAD") remoteBranches.add(name);
    }

    // Get current branch (checked out as a worktree)
    // For bare repos, there's no HEAD branch — we list worktrees instead
    // We can check branch names against existing worktrees

    const branches: BranchEntry[] = [];

    // Add local branches
    for (const [name, info] of localBranches) {
      const { shortHash, upstream, track } = info;

      // Parse ahead/behind from track string (e.g., "[ahead 3, behind 1]")
      let ahead = 0;
      let behind = 0;
      if (track) {
        const aheadMatch = track.match(/ahead (\d+)/);
        const behindMatch = track.match(/behind (\d+)/);
        if (aheadMatch) ahead = parseInt(aheadMatch[1], 10);
        if (behindMatch) behind = parseInt(behindMatch[1], 10);
      }

      let lastCommit: CommitEntry | null = null;
      if (shortHash) {
        // Get the last commit for this branch
        try {
          const logs = await this.getCommitLog(repoName, name, { maxCount: 1 });
          if (logs.length > 0) lastCommit = logs[0];
        } catch {
          // Ignore
        }
      }

      branches.push({
        name,
        shortName: name,
        isLocal: true,
        isCurrent: name === currentBranch,
        tracking: upstream || undefined,
        ahead,
        behind,
        lastCommit,
      });
    }

    // Add remote-only branches
    for (const remoteName of remoteBranches) {
      if (!localBranches.has(remoteName)) {
        branches.push({
          name: `origin/${remoteName}`,
          shortName: remoteName,
          isLocal: false,
          isCurrent: false,
          lastCommit: null,
          ahead: 0,
          behind: 0,
        });
      }
    }

    // Sort: current branch first, then local, then remote
    branches.sort((a, b) => {
      if (a.isCurrent && !b.isCurrent) return -1;
      if (!a.isCurrent && b.isCurrent) return 1;
      if (a.isLocal && !b.isLocal) return -1;
      if (!a.isLocal && b.isLocal) return 1;
      return a.name.localeCompare(b.name);
    });

    return branches;
  }

  async getDiffStat(repoName: string, commitHash?: string): Promise<DiffStatEntry[]> {
    let output: string;

    if (commitHash) {
      // Diff for a specific commit
      output = await this._execGit(
        ["diff-tree", "--no-commit-id", "-r", "--numstat", commitHash],
        repoName,
      );
    } else {
      // Working tree diff (unstaged + staged changes)
      try {
        output = await this._execGit(["diff", "HEAD", "--numstat"], repoName);
      } catch {
        // No HEAD (empty repo)
        return [];
      }
    }

    if (!output) return [];

    const entries: DiffStatEntry[] = [];
    for (const line of output.split("\n")) {
      if (!line.trim()) continue;
      const parts = line.split("\t");
      if (parts.length < 3) continue;

      const added = parseInt(parts[0], 10);
      const deleted = parseInt(parts[1], 10);
      const filePath = parts[2];

      let status: DiffStatEntry["status"] = "modified";
      if (added > 0 && deleted === 0) {
        // Check if file is new (git diff-tree shows "0\t0" for new files with --numstat? No, it shows "-\t-")
        // Actually, for new files git shows the actual counts. Let me check the status differently.
        // For --numstat, new files show added+deleted counts. We can't distinguish from modified.
        // We'll use the --diff-filter approach or just mark as modified unless we use -r --name-status
        status = "modified";
      }

      entries.push({ filePath, added, deleted, status });
    }

    // Get file statuses for accuracy
    if (commitHash) {
      try {
        const statusOutput = await this._execGit(
          ["diff-tree", "--no-commit-id", "-r", "--name-status", commitHash],
          repoName,
        );
        this._applyFileStatuses(entries, statusOutput);
      } catch {
        // Ignore
      }
    } else {
      try {
        const statusOutput = await this._execGit(["diff", "HEAD", "--name-status"], repoName);
        this._applyFileStatuses(entries, statusOutput);
      } catch {
        // Ignore
      }
    }

    return entries;
  }

  async getUntrackedFiles(repoName: string): Promise<string[]> {
    const allPaths = new Set<string>();

    // Untracked non-ignored files (new files not yet staged)
    try {
      const output = await this._execGit(["ls-files", "--others", "--exclude-standard"], repoName);
      if (output) {
        for (const p of output.split("\n")) {
          const t = p.trim();
          if (t) allPaths.add(t);
        }
      }
    } catch {
      // Non-fatal
    }

    // Untracked gitignored files (e.g. *.tsbuildinfo, .env, build artifacts)
    try {
      const output = await this._execGit(
        ["ls-files", "--others", "--ignored", "--exclude-standard"],
        repoName,
      );
      if (output) {
        for (const p of output.split("\n")) {
          const t = p.trim();
          if (t) allPaths.add(t);
        }
      }
    } catch {
      // Non-fatal
    }

    return [...allPaths];
  }

  async deleteLocalBranch(repoName: string, branchName: string, force?: boolean): Promise<void> {
    const flag = force ? "-D" : "-d";
    await this._execGit(["branch", flag, branchName], repoName);
  }

  private _applyFileStatuses(entries: DiffStatEntry[], statusOutput: string): void {
    const statusMap = new Map<string, DiffStatEntry["status"]>();
    for (const line of statusOutput.split("\n")) {
      if (!line.trim()) continue;
      const match = line.match(/^([ARMDTUX])\d*\s+(.+)$/);
      if (!match) continue;
      const code = match[1];
      const filePath = match[2].trim();

      let status: DiffStatEntry["status"];
      switch (code) {
        case "A":
          status = "added";
          break;
        case "D":
          status = "deleted";
          break;
        case "R":
          status = "renamed";
          // Handle "R100\toldpath\tnewpath"
          const parts = match[2].split("\t");
          statusMap.set(parts[parts.length - 1], "renamed");
          continue;
        case "M":
        default:
          status = "modified";
          break;
      }
      statusMap.set(filePath, status);
    }

    for (const entry of entries) {
      if (statusMap.has(entry.filePath)) {
        entry.status = statusMap.get(entry.filePath)!;
      }
    }
  }
}
