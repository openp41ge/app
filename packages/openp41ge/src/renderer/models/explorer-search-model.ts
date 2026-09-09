/**
 * ExplorerSearchModel — full-text content search for the Explorer sidebar.
 *
 * The worktree-tree component depends on this single interface for content
 * search. In production it's IpcExplorerSearchModel (calls file.searchContents
 * via window.openp41ge); in tests it's TestExplorerSearchModel (in-memory, in
 * test-models.ts).
 *
 * Search is split in two halves. The walk streams a lightweight INDEX — one
 * `{ path, name, dir, count }` entry per matching file, batched — because the
 * tree needs a count for every hit to draw badges, folder totals and the rows
 * that survive the filter. The match LINES are fetched per file, on demand,
 * for the handful of rows that are expanded and on screen.
 */

export interface ExplorerSearchOptions {
  regex?: boolean;
  caseSensitive?: boolean;
}

export interface ContentSearchSession {
  /** Resolves ({ total }) once the search walk completes. */
  done: Promise<unknown>;
  /** Cancel a running search (stops further result delivery). */
  cancel: () => void;
}

export interface IExplorerSearchModel {
  /** Content-search `query` over the given root disk paths. Empty query → []. */
  searchContents(
    query: string,
    rootPaths: string[],
    options?: ExplorerSearchOptions,
  ): Promise<FileContentSearchResult[]>;
  /**
   * Streaming content-search index. Delivers batches of matching files via
   * `onEntries` as soon as they are found and resolves `session.done` when the
   * walk finishes. Call `session.cancel()` to stop a running search (e.g. when
   * superseded).
   */
  searchContentsStreaming(
    query: string,
    rootPaths: string[],
    options: ExplorerSearchOptions | undefined,
    callbacks: { onEntries: (entries: ContentMatchIndexEntry[]) => void },
  ): ContentSearchSession;
  /** Match lines for a single file — resolved lazily, per expanded row. */
  fetchMatches(
    filePath: string,
    query: string,
    options?: ExplorerSearchOptions,
  ): Promise<FileContentMatch[]>;
}

/** Production implementation — delegates to the file.searchContents IPC. */
export class IpcExplorerSearchModel implements IExplorerSearchModel {
  searchContents(
    rawQuery: string,
    rootPaths: string[],
    options?: ExplorerSearchOptions,
  ): Promise<FileContentSearchResult[]> {
    const query = rawQuery.trim();
    if (!query) return Promise.resolve([]);
    return window.openp41ge.file.searchContents(query, rootPaths, options);
  }

  searchContentsStreaming(
    rawQuery: string,
    rootPaths: string[],
    options: ExplorerSearchOptions | undefined,
    callbacks: { onEntries: (entries: ContentMatchIndexEntry[]) => void },
  ): ContentSearchSession {
    const query = rawQuery.trim();
    if (!query) {
      return { done: Promise.resolve({ total: 0 }), cancel: () => undefined };
    }
    const session = window.openp41ge.file.searchContentsStream(query, rootPaths, options);
    session.onChunk((payload) => {
      if (payload.type === "chunk") callbacks.onEntries(payload.entries);
    });
    return {
      done: session.promise,
      cancel: () => session.destroy(),
    };
  }

  async fetchMatches(
    filePath: string,
    rawQuery: string,
    options?: ExplorerSearchOptions,
  ): Promise<FileContentMatch[]> {
    const query = rawQuery.trim();
    if (!query) return [];
    const res = await window.openp41ge.file.contentMatchesForFile(filePath, query, options);
    return res?.matches ?? [];
  }
}
