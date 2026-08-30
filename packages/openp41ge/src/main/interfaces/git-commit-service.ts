/**
 * Git commit and branch query interface — strictly separate from IGitService (ISP/OCP).
 *
 * All methods return plain data objects — no Electron or DOM types.
 * Implementations run in the main (Node.js) process.
 */

import type { CommitSearchOptions, SearchResultCommit } from "openp41ge-git";

export interface CommitEntry {
  hash: string;
  shortHash: string;
  authorName: string;
  authorEmail: string;
  date: string;
  relativeDate: string;
  message: string;
  fullMessage: string;
  refs: string[];
  parents: string[];
}

export interface BranchEntry {
  name: string;
  shortName: string;
  isLocal: boolean;
  isCurrent: boolean;
  tracking?: string;
  ahead: number;
  behind: number;
  lastCommit: CommitEntry | null;
}

export interface DiffStatEntry {
  filePath: string;
  added: number;
  deleted: number;
  status: "added" | "modified" | "deleted" | "renamed";
}

export interface IGitCommitService {
  /**
   * Get commit log for a branch.
   * Supports pagination via `skip` (number of commits to skip).
   */
  getCommitLog(
    repoName: string,
    branch: string,
    options?: { maxCount?: number; skip?: number },
  ): Promise<CommitEntry[]>;

  /**
   * Get all branches for a repository with ahead/behind tracking.
   */
  getBranches(repoName: string): Promise<BranchEntry[]>;

  /**
   * Get diff stat for a commit, or for the working tree if no commitHash given.
   */
  getDiffStat(repoName: string, commitHash?: string): Promise<DiffStatEntry[]>;

  /**
   * Get a single commit's full data (including the complete message) by hash,
   * or null when the commit is not reachable in this repository.
   */
  getCommitMessage(repoName: string, hash: string): Promise<CommitEntry | null>;

  /**
   * Delete a local branch. Throws if not fully merged (use force to override).
   */
  deleteLocalBranch(repoName: string, branchName: string, force?: boolean): Promise<void>;

  /**
   * Get file paths not tracked by git for a repository (both untracked and gitignored).
   * Runs `git ls-files --others --exclude-standard` for untracked files
   * and `git ls-files --others --ignored --exclude-standard` for gitignored files.
   */
  getUntrackedFiles(repoName: string): Promise<string[]>;

  /**
   * Search commit history across all refs of a single repository.
   *
   * Scope (`in`):
   *   - "message" — match against subject/body (`git log --grep`).
   *   - "files"   — match against changed file paths (path substring).
   *   - "all"     — either message OR changed-file-path match.
   *
   * Returns commits with their per-commit diff stat (changed files + counts),
   * sliced by offset/limit. Callers iterate repos for cross-repo search.
   */
  searchCommits(repoName: string, options: CommitSearchOptions): Promise<SearchResultCommit[]>;
}
