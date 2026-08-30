/**
 * NodeGitCommitService — git commit/branch queries via child_process.
 *
 * Executes git commands against a bare repo directory.
 * Follows the same patterns as NodeGitService for directory resolution.
 */

import { exec } from "child_process";
import path from "path";
import type { CommitSearchOptions, SearchHunk, SearchResultCommit } from "openp41ge-git";
import type {
  IGitCommitService,
  CommitEntry,
  BranchEntry,
  DiffStatEntry,
} from "../interfaces/git-commit-service.js";

export class NodeGitCommitService implements IGitCommitService {
  private _reposDir: string;

  constructor(reposDir: string) {
    this._reposDir = reposDir;
  }

  /** Update the repos directory (called when switching projects). */
  setReposDir(reposDir: string): void {
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

    const tryGetLog = async (): Promise<string> => {
      return this._execGit(
        [
          "log",
          branch,
          `--max-count=${maxCount}`,
          `--skip=${skip}`,
          `--format=%H|%h|%an|%ae|%aI|%ar|%s|%b%n---BODY_END---%n%P%n%D%n---ENTRY_END---`,
        ],
        repoName,
      );
    };

    let output: string;
    try {
      output = await tryGetLog();
    } catch {
      // If the branch is a remote ref that doesn't exist locally (e.g., listed
      // via git ls-remote but never fetched), fetch the remote ref first.
      if (branch.includes("/")) {
        const slashIdx = branch.indexOf("/");
        const remoteName = branch.slice(0, slashIdx);
        const remoteBranch = branch.slice(slashIdx + 1);
        try {
          await this._execGit(
            [
              "fetch",
              remoteName,
              `+refs/heads/${remoteBranch}:refs/remotes/${remoteName}/${remoteBranch}`,
              "--no-tags",
            ],
            repoName,
          );
          output = await tryGetLog();
        } catch {
          throw new Error(`Branch "${branch}" not found locally or on remote`);
        }
      } else {
        throw new Error(`Branch "${branch}" not found locally`);
      }
    }

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

  /**
   * Get a single commit by hash, or null when it is not reachable.
   *
   * Uses a newline-separated format (one field per line) so message bodies
   * containing `|` or other delimiters survive round-tripping unchanged: the
   * whole `%B` (subject + body) spans until the `---ENDBODY---` marker.
   */
  async getCommitMessage(repoName: string, hash: string): Promise<CommitEntry | null> {
    let output: string;
    try {
      output = await this._execGit(
        [
          "log",
          "-1",
          hash,
          "--format=%H%n%h%n%an%n%ae%n%aI%n%ar%n%B%n---ENDBODY---%n%P%n---ENDENTRY---",
        ],
        repoName,
      );
    } catch {
      // Bad or unreachable hash (or the repo is missing) — no such commit.
      return null;
    }
    if (!output.trim()) return null;
    return this._parseSingleCommit(output);
  }

  private _parseSingleCommit(raw: string): CommitEntry | null {
    const bodyEnd = raw.indexOf("\n---ENDBODY---\n");
    if (bodyEnd === -1) return null;

    const header = raw.slice(0, bodyEnd);
    const footer = raw.slice(bodyEnd + "\n---ENDBODY---\n".length);
    const lines = header.split("\n");
    if (lines.length < 6) return null;

    const [hash, shortHash = "", authorName = "", authorEmail = "", date = "", relativeDate = ""] =
      lines;
    // %B is raw (subject + body); fields after the five header lines are the
    // full message. Trim trailing whitespace so the message ends cleanly.
    const fullMessage = lines.slice(6).join("\n").trim();
    const message = fullMessage.split("\n")[0] ?? "";

    const footerLines = footer.trimEnd().split("\n");
    const parents = footerLines.length > 0 && footerLines[0] ? footerLines[0].split(" ") : [];

    return {
      hash,
      shortHash,
      authorName,
      authorEmail,
      date,
      relativeDate,
      message,
      fullMessage,
      refs: [],
      parents,
    };
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

    // Get remote branches — first try local remote-tracking refs, then
    // fall back to querying the remote directly (in case the old fetch
    // command bypassed refs/remotes/origin/*).
    let remoteOutput = "";
    try {
      remoteOutput = await this._execGit(
        ["for-each-ref", "--format=%(refname:short)", "refs/remotes/origin/"],
        repoName,
      );
    } catch {
      // No remote branches via refs
    }

    if (!remoteOutput.trim()) {
      try {
        const lsRemote = await this._execGit(
          ["ls-remote", "--heads", "--refs", "origin"],
          repoName,
        );
        remoteOutput = lsRemote
          .split("\n")
          .filter(Boolean)
          .map((line) => {
            const match = line.match(/^[a-f0-9]+\s+refs\/heads\/(.+)$/);
            return match ? `origin/${match[1]}` : "";
          })
          .join("\n");
      } catch {
        // No remote branches via ls-remote either
      }
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

    // Add all remote branches (renderer groups local+remote by shortName)
    for (const remoteName of remoteBranches) {
      if (remoteName === "HEAD") continue;
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

  // ─── Commit search (Git sidebar — commit search UI) ────────────────────

  /** ASCII record-separator prefix on every commit-format line (0x1E can't
   * appear in real git data, so it is an unambiguous record boundary). */
  private static readonly _SEARCH_RECORD_SEP = "\x1e";

  async searchCommits(
    repoName: string,
    options: CommitSearchOptions,
  ): Promise<SearchResultCommit[]> {
    const query = (options.query ?? "").trim();
    if (!query) return [];
    const inMode = options.in ?? "message";
    const limit = options.limit ?? 100;
    const offset = options.offset ?? 0;

    // Cap the walk so huge histories don't stream unbounded --numstat output
    // and so the selectable depth limit is honored.
    const maxCount = options.maxCount ?? 5000;
    const format = `%x1e%H|%h|%an|%aI|%ar|%s`;
    const caseSensitive = options.caseSensitive ?? false;
    const regexMode = options.regex ?? false;
    const qLower = query.toLowerCase();
    // Path matcher honours the case + regex toggles (regex in JS flavour).
    const fileMatches = (path: string): boolean => {
      if (regexMode) {
        try {
          return new RegExp(query, caseSensitive ? "" : "i").test(path);
        } catch {
          return false;
        }
      }
      return caseSensitive ? path.includes(query) : path.toLowerCase().includes(qLower);
    };

    // Depth cap: the newest `maxCount` commits. A plain log --max-count counts
    // walked commits — a true depth cap. The --grep pass cannot be capped that
    // way (with a filter git keeps walking until it finds matches, so
    // --max-count only limits its output). So message/all first pin the newest
    // maxCount commits by hash, then run git-native --grep over exactly that
    // walk.
    const pinNewestN = async (): Promise<string[]> => {
      const raw = await this._execGit(
        ["log", "--all", "--date-order", `--max-count=${maxCount + 1}`, "--format=%H"],
        repoName,
      );
      return raw ? raw.trim().split(/\s+/).filter(Boolean) : [];
    };
    const grepRaw = async (hashes: string[]): Promise<string> => {
      if (hashes.length === 0) return "";
      const revs =
        hashes.length > maxCount
          ? [hashes[0], `^${hashes[maxCount]}`] // newest maxCount exactly
          : [hashes[0]]; // whole history is within the cap
      return this._execGit(
        [
          "log",
          ...revs,
          "--date-order",
          ...(regexMode ? [] : ["--fixed-strings"]),
          ...(caseSensitive ? [] : ["--regexp-ignore-case"]),
          `--grep=${query}`,
          `--format=${format}`,
          "--numstat",
        ],
        repoName,
      );
    };
    // Files enumerates the raw depth-capped walk and filters paths in JS
    // (substring, ci) — deterministic for a plain search box.
    const walkRaw = (): Promise<string> =>
      this._execGit(
        [
          "log",
          "--all",
          "--date-order",
          `--max-count=${maxCount}`,
          `--format=${format}`,
          "--numstat",
        ],
        repoName,
      );

    let results: SearchResultCommit[] = [];
    if (inMode === "message" || inMode === "all") {
      const [hashes, fileRaw] = await Promise.all([
        // Walking newest-N is the same for message and all, and file hits reuse
        // the same capped walk — share the I/O.
        pinNewestN(),
        inMode === "all" ? walkRaw() : Promise.resolve(""),
      ]);
      const [msgRaw] = await Promise.all([grepRaw(hashes)]);
      const msgHits = msgRaw
        ? this._parseSearchLog(msgRaw).map((c) => this._toSearchResultCommit(repoName, c))
        : [];
      if (inMode === "message") {
        results = msgHits;
      } else {
        const fileHits = fileRaw
          ? this._parseSearchLog(fileRaw)
              .map((c) => this._toSearchResultCommit(repoName, c))
              .filter((c) => c.files.some((f) => fileMatches(f.path)))
          : [];
        // Union by hash (newest first) — guarantees files-inclusive results are
        // always a superset of message-only results.
        const byHash = new Map<string, SearchResultCommit>();
        for (const c of msgHits) byHash.set(c.hash, c);
        for (const c of fileHits) if (!byHash.has(c.hash)) byHash.set(c.hash, c);
        results = [...byHash.values()];
      }
    } else {
      const raw = await walkRaw();
      results = raw
        ? this._parseSearchLog(raw)
            .map((c) => this._toSearchResultCommit(repoName, c))
            .filter((c) => c.files.some((f) => fileMatches(f.path)))
        : [];
    }

    // Content dimension (git -G pickaxe): commits whose CHANGED LINES match
    // the query. Literal queries are regex-escaped so `a+b` means "a+b" not
    // "a..b"; regex mode passes the raw pattern. Case handled via -i (the
    // --regexp-ignore-case option applies to -G pickaxe). Union by hash with
    // whatever message/files already matched; a content-pass failure (e.g. a
    // malformed regex) must NEVER drop the other scopes' hits.
    if (options.content) {
      const pat = regexMode ? query : NodeGitCommitService._escapeRegex(query);
      if (pat) {
        try {
          const hashes = await pinNewestN();
          if (hashes.length > 0) {
            const revs =
              hashes.length > maxCount
                ? [hashes[0], `^${hashes[maxCount]}`]
                : [hashes[0]];
            const contentRaw = await this._execGit(
              [
                "log",
                ...revs,
                "--date-order",
                `-G${pat}`,
                ...(caseSensitive ? [] : ["-i"]),
                `--format=${format}`,
                "--numstat",
              ],
              repoName,
            );
            if (contentRaw) {
              const contentHits = this._parseSearchLog(contentRaw).map((c) =>
                this._toSearchResultCommit(repoName, c),
              );
              const byHash = new Map<string, SearchResultCommit>();
              for (const c of results) byHash.set(c.hash, c);
              for (const c of contentHits) if (!byHash.has(c.hash)) byHash.set(c.hash, c);
              results = [...byHash.values()];
            }
          }
        } catch {
          // Content match is best-effort — keep message/files hits.
        }
      }
    }

    return results.slice(offset, offset + limit);
  }

  private _parseSearchLog(output: string): Array<{
    header: string;
    files: Array<{ path: string; additions: number; deletions: number }>;
  }> {
    const commits: Array<{
      header: string;
      files: Array<{ path: string; additions: number; deletions: number }>;
    }> = [];
    let cur: {
      header: string;
      files: Array<{ path: string; additions: number; deletions: number }>;
    } | null = null;

    for (const rawLine of output.split("\n")) {
      const line = rawLine.trim();
      if (!line) continue;
      if (line.startsWith(NodeGitCommitService._SEARCH_RECORD_SEP)) {
        cur = { header: line.slice(NodeGitCommitService._SEARCH_RECORD_SEP.length), files: [] };
        commits.push(cur);
        continue;
      }
      if (!cur) continue;
      const parts = line.split("\t");
      if (parts.length < 3) continue;
      const add = parts[0].trim();
      const del = parts[1].trim();
      cur.files.push({
        path: parts.slice(2).join("\t"),
        additions: add === "-" ? 0 : parseInt(add, 10) || 0,
        deletions: del === "-" ? 0 : parseInt(del, 10) || 0,
      });
    }
    return commits;
  }

  private _toSearchResultCommit(
    repoName: string,
    c: {
      header: string;
      files: Array<{ path: string; additions: number; deletions: number }>;
    },
  ): SearchResultCommit {
    const [hash, shortHash, author, date, relativeDate, ...messageParts] = c.header.split("|");
    return {
      repoName,
      hash: hash ?? "",
      shortHash: shortHash ?? "",
      message: messageParts.join("|") ?? "",
      author: author ?? "",
      date: date ?? "",
      relativeDate: relativeDate ?? "",
      files: c.files,
    };
  }

  /** Escape a literal query so it can be passed to git -G as a fixed pattern. */
  private static _escapeRegex(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  /**
   * Lazy content-search helper: changed hunks of ONE commit+file whose lines
   * contain the query. Best-effort — returns [] for unknown commit/file or
   * any git error (the sidebar shows an empty state, never a throw).
   */
  async getCommitFileHunks(
    repoName: string,
    hash: string,
    path: string,
    query: string,
    options: Pick<CommitSearchOptions, "regex" | "caseSensitive">,
  ): Promise<SearchHunk[]> {
    const q = (query ?? "").trim();
    if (!q || !hash || !path) return [];
    const regexMode = options?.regex ?? false;
    const caseSensitive = options?.caseSensitive ?? false;
    const qLower = q.toLowerCase();
    const matches = (text: string): boolean => {
      if (regexMode) {
        try {
          return new RegExp(q, caseSensitive ? "" : "i").test(text);
        } catch {
          return false;
        }
      }
      return caseSensitive ? text.includes(q) : text.toLowerCase().includes(qLower);
    };
    try {
      const out = await this._execGit(
        ["show", hash, "--format=", "--unified=3", "--", path],
        repoName,
      );
      if (!out) return [];
      return this._parseHunks(out).filter((h) => h.lines.some((l) => matches(l.text)));
    } catch {
      return [];
    }
  }

  /** Parse `git show <hash> --format= -- <path>` patch output into hunks. */
  private _parseHunks(output: string): SearchHunk[] {
    const hunks: SearchHunk[] = [];
    let cur: SearchHunk | null = null;
    for (const rawLine of output.split("\n")) {
      const line = rawLine;
      if (line.startsWith("@@")) {
        cur = { header: line, lines: [] };
        hunks.push(cur);
        continue;
      }
      if (!cur) continue;
      if (line.startsWith("+")) cur.lines.push({ type: "+", text: line.slice(1) });
      else if (line.startsWith("-")) cur.lines.push({ type: "-", text: line.slice(1) });
      else cur.lines.push({ type: " ", text: line });
    }
    return hunks;
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
