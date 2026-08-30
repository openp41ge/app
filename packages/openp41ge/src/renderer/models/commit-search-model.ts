/**
 * CommitSearchModel — the DI seam for the Git sidebar commit-search panel.
 *
 * Two implementations:
 *   - IpcCommitSearchModel  (production): delegates to
 *     window.openp41ge.workspaceController.searchCommits (IPC → main process).
 *   - TestCommitSearchModel (tests): pure in-memory fixture filtering — real
 *     message/path matching semantics, no git/electron.
 *
 * The controller depends on the commitSearchModel interface via a public
 * settable property (`_searchModel`), exactly like RepoService — so exhaustive
 * unit tests can inject TestCommitSearchModel.
 */

/* eslint-disable max-classes-per-file */

import type { CommitSearchOptions, SearchResultCommit } from "openp41ge-git";

/** Narrow read-only search contract (ISP — read only, no write ops). */
export interface CommitSearchModel {
  /**
   * Search commits across the given repos, or all repos (null/empty list).
   * Returns commits with their changed files, ordered most-recent-first.
   */
  search(repoNames: string[] | null, options: CommitSearchOptions): Promise<SearchResultCommit[]>;
}

// ─── Production: IPC-backed ───────────────────────────────────────────────

export class IpcCommitSearchModel implements CommitSearchModel {
  async search(
    repoNames: string[] | null,
    options: CommitSearchOptions,
  ): Promise<SearchResultCommit[]> {
    return window.openp41ge.workspaceController.searchCommits(repoNames, options);
  }
}

// ─── Test: in-memory fixture filtering ────────────────────────────────────

/**
 * In-memory CommitSearchModel for tests. Filters a fixture list with the same
 * message/path substring semantics as the real (main-process) implementation
 * and applies limit/offset — deterministic, no electron.
 */
export class TestCommitSearchModel implements CommitSearchModel {
  fixtures: SearchResultCommit[] = [];
  /** Record of every search() call, for asserting scope + options. */
  calls: Array<{ repoNames: string[] | null; options: CommitSearchOptions }> = [];

  constructor(fixtures: SearchResultCommit[] = []) {
    this.fixtures = fixtures;
  }

  setFixtures(fixtures: SearchResultCommit[]): void {
    this.fixtures = fixtures;
  }

  async search(
    repoNames: string[] | null,
    options: CommitSearchOptions,
  ): Promise<SearchResultCommit[]> {
    this.calls.push({ repoNames, options });

    const query = (options.query ?? "").trim().toLowerCase();
    if (!query) return [];

    const limit = options.limit ?? 100;
    const offset = options.offset ?? 0;

    const scoped =
      repoNames && repoNames.length > 0
        ? this.fixtures.filter((c) => repoNames.includes(c.repoName))
        : this.fixtures;

    const inMode = options.in ?? "message";
    const contentOn = options.content ?? false;
    const matched = scoped.filter((c) => {
      const messageHit = c.message.toLowerCase().includes(query);
      const fileHit = c.files.some((f) => f.path.toLowerCase().includes(query));
      const contentHit = contentOn
        ? c.files.some((f) =>
            (f.hunks ?? []).some((h) => h.lines.some((l) => l.text.toLowerCase().includes(query))),
          )
        : false;
      if (inMode === "message") return messageHit || contentHit;
      if (inMode === "files") return fileHit || contentHit;
      return messageHit || fileHit || contentHit; // "all"
    });

    return matched.slice(offset, offset + limit);
  }
}
