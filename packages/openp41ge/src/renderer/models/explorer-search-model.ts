/**
 * ExplorerSearchModel — full-text content search for the Explorer sidebar.
 *
 * The worktree-tree component depends on this single interface for content
 * search. In production it's IpcExplorerSearchModel (calls file.searchContents
 * via window.openp41ge); in tests it's TestExplorerSearchModel (in-memory, in
 * test-models.ts).
 */

export interface ExplorerSearchOptions {
  regex?: boolean;
  caseSensitive?: boolean;
}

export interface IExplorerSearchModel {
  /** Content-search `query` over the given root disk paths. Empty query → []. */
  searchContents(
    query: string,
    rootPaths: string[],
    options?: ExplorerSearchOptions,
  ): Promise<FileContentSearchResult[]>;
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
}
