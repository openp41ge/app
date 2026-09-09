/**
 * In-memory test implementations of all model interfaces.
 *
 * These models store everything in Maps and arrays — no filesystem,
 * no git CLI, no IPC. Perfect for unit tests and test injection.
 */

/* eslint-disable max-classes-per-file */

import type {
  RepositoryModel,
  GitCloneSessionModel,
  GitCloneProgress,
} from "./repository-model.js";
import type { WorktreeModel } from "./worktree-model.js";
import type { FileEntryModel, FileContentModel, FileStatus } from "./file-model.js";
import type { RepoService } from "./repo-service.js";
import type {
  IExplorerSearchModel,
  ExplorerSearchOptions,
  ContentSearchSession,
} from "./explorer-search-model.js";

// ─── TestFileContent ─────────────────────────────────────────────────

export class TestFileContent implements FileContentModel {
  constructor(private _content: string = "") {}

  setContent(content: string): void {
    this._content = content;
  }

  async readRange(offset: number, length: number): Promise<{ data: string; totalSize: number }> {
    const end = Math.min(offset + length, this._content.length);
    return {
      data: this._content.slice(offset, end),
      totalSize: this._content.length,
    };
  }

  async readChunked(
    chunkSize: number,
    onProgress: (p: { loaded: number; total: number; chunk: string }) => void,
  ): Promise<{ data: string; totalSize: number }> {
    const totalSize = this._content.length;
    let loaded = 0;
    let data = "";
    while (loaded < totalSize) {
      const end = Math.min(loaded + chunkSize, totalSize);
      const chunk = this._content.slice(loaded, end);
      data += chunk;
      onProgress({ loaded: end, total: totalSize, chunk });
      loaded = end;
    }
    return { data, totalSize };
  }
}

// ─── TestWorktreeModel ───────────────────────────────────────────────

export class TestWorktreeModel implements WorktreeModel {
  public readonly exists = true;
  private _files: TestFileEntry[] = [];

  constructor(
    public readonly branch: string,
    public readonly path: string,
    files: TestFileEntryInit[] = [],
  ) {
    for (const f of files) {
      this.addFile(f.name, f.path, f.isDirectory ?? false, f.gitStatus ?? "tracked");
    }
  }

  addFile(
    name: string,
    filePath: string,
    isDirectory = false,
    gitStatus: FileStatus = "tracked",
  ): void {
    this._files.push({
      name,
      path: filePath,
      isDirectory,
      size: isDirectory ? 0 : 100,
      modifiedAt: Date.now(),
      gitStatus,
    });
  }

  setFiles(files: TestFileEntryInit[]): void {
    this._files = [];
    for (const f of files) {
      this.addFile(f.name, f.path, f.isDirectory ?? false, f.gitStatus ?? "tracked");
    }
  }

  async readTree(_dirPath?: string): Promise<FileEntryModel[]> {
    return [...this._files];
  }

  async readFile(_filePath: string): Promise<FileContentModel> {
    return new TestFileContent();
  }

  async getFileStatus(filePath: string): Promise<FileStatus> {
    return this._files.find((f) => f.path === filePath)?.gitStatus ?? "tracked";
  }

  async stageFile(_filePath: string): Promise<void> {
    // no-op in test mode
  }
}

export interface TestFileEntryInit {
  name: string;
  path: string;
  isDirectory?: boolean;
  gitStatus?: FileStatus;
}

interface TestFileEntry extends FileEntryModel {}

// ─── TestRepositoryModel ─────────────────────────────────────────────

export class TestRepositoryModel implements RepositoryModel {
  private _worktrees = new Map<string, TestWorktreeModel>();

  constructor(
    public readonly name: string,
    public readonly url: string,
  ) {}

  /** Get a worktree by branch name, or undefined. */
  getWorktree(branch: string): TestWorktreeModel | undefined {
    return this._worktrees.get(branch);
  }

  /** Set a worktree with optional files. Replaces if already exists. */
  setWorktree(branch: string, files?: TestFileEntryInit[], path?: string): TestWorktreeModel {
    const wtPath = path ?? `/${this.name}/${branch}`;
    const wt = new TestWorktreeModel(branch, wtPath, files);
    this._worktrees.set(branch, wt);
    return wt;
  }

  /** Create a worktree and immediately add files to it. */
  ensureWorktree(branch: string): TestWorktreeModel {
    if (!this._worktrees.has(branch)) {
      this._worktrees.set(branch, new TestWorktreeModel(branch, `/${this.name}/${branch}`));
    }
    return this._worktrees.get(branch)!;
  }

  async listWorktrees(): Promise<WorktreeModel[]> {
    return Array.from(this._worktrees.values());
  }

  async checkoutWorktree(branch: string): Promise<WorktreeModel> {
    if (!this._worktrees.has(branch)) {
      this._worktrees.set(branch, new TestWorktreeModel(branch, `/${this.name}/${branch}`));
    }
    return this._worktrees.get(branch)!;
  }

  async deleteWorktree(branch: string): Promise<void> {
    this._worktrees.delete(branch);
  }

  async pullBranch(_branch: string): Promise<void> {
    // no-op in test mode
  }

  async fetch(): Promise<void> {
    // no-op
  }

  async listBranches(): Promise<string[]> {
    return Array.from(this._worktrees.keys());
  }

  async getDefaultBranch(): Promise<string | null> {
    if (this._worktrees.size > 0) {
      return this._worktrees.keys().next().value ?? "main";
    }
    return "main";
  }
}

// ─── TestCloneSession ────────────────────────────────────────────────

export class TestCloneSession implements GitCloneSessionModel {
  readonly promise: Promise<RepositoryModel>;
  private _listeners: Array<(p: GitCloneProgress) => void> = [];
  private _aborted = false;

  constructor(
    repoName: string,
    repoUrl: string,
    private _repoService: TestRepoService,
  ) {
    this.promise = new Promise((resolve, reject) => {
      // Simulate clone by resolving after a microtask tick
      setTimeout(() => {
        if (this._aborted) {
          reject(new Error("Clone aborted"));
          return;
        }
        const repo = new TestRepositoryModel(repoName, repoUrl);
        repo.ensureWorktree("main");
        this._repoService._repos.set(repoName, repo);
        this._emit({ percent: 100, message: "Clone complete" });
        resolve(repo);
      }, 0);
    });
  }

  onProgress(callback: (progress: GitCloneProgress) => void): () => void {
    this._listeners.push(callback);
    return () => {
      this._listeners = this._listeners.filter((l) => l !== callback);
    };
  }

  abort(): void {
    this._aborted = true;
  }

  private _emit(progress: GitCloneProgress): void {
    for (const cb of this._listeners) {
      cb(progress);
    }
  }
}

// ─── TestRepoService ─────────────────────────────────────────────────

export class TestRepoService implements RepoService {
  /** Internal repos map — public so tests can inspect state. */
  readonly _repos = new Map<string, TestRepositoryModel>();

  /** Add a pre-configured test repo. */
  addRepoModel(repo: TestRepositoryModel): void {
    this._repos.set(repo.name, repo);
  }

  /** Create a repo with a default "main" worktree in one call. */
  createRepo(name: string, url?: string): TestRepositoryModel {
    const repo = new TestRepositoryModel(name, url ?? `https://github.com/test/${name}`);
    repo.ensureWorktree("main");
    this._repos.set(name, repo);
    return repo;
  }

  /** Remove all repos. */
  clear(): void {
    this._repos.clear();
  }

  async listRepos(): Promise<RepositoryModel[]> {
    return Array.from(this._repos.values());
  }

  async getRepo(name: string): Promise<RepositoryModel | null> {
    return this._repos.get(name) ?? null;
  }

  clone(url: string): TestCloneSession {
    const name =
      url
        .split("/")
        .pop()
        ?.replace(/\.git$/, "") ?? "unknown";
    return new TestCloneSession(name, url, this);
  }

  async addRepo(_path: string, name?: string): Promise<RepositoryModel> {
    const repoName = name ?? _path.split("/").pop() ?? "unknown";
    const repo = new TestRepositoryModel(repoName, _path);
    repo.ensureWorktree("main");
    this._repos.set(repoName, repo);
    return repo;
  }

  async removeRepo(name: string): Promise<void> {
    this._repos.delete(name);
  }
}

// ─── TestExplorerSearchModel ──────────────────────────────────────────

/** In-memory Explorer content-search — records calls, returns canned results. */
export class TestExplorerSearchModel implements IExplorerSearchModel {
  /** Canned per-file results; the index is derived from them. */
  results: FileContentSearchResult[] = [];
  calls: Array<{
    query: string;
    rootPaths: string[];
    options?: ExplorerSearchOptions;
  }> = [];
  /** Per-file match-line fetches, in order — the lazy half of the search. */
  fetchCalls: Array<{ filePath: string; query: string }> = [];

  /** When true, `searchContentsStreaming` returns a pending session whose `done`
   *  the test resolves manually (via `pendingStreaming`), so supersession can be
   *  observed: a newer search must `cancel()` the previous one.
   */
  deferStreaming = false;
  /** Session handles for deferred (pending) searches, in start order.
   *  `emit` delivers one batch of index entries to that session. */
  pendingStreaming: Array<
    ContentSearchSession & {
      resolve: (value: unknown) => void;
      emit: (entries: ContentMatchIndexEntry[]) => void;
      query: string;
    }
  > = [];
  /** Queries whose streaming session was cancelled via `session.cancel()`.
   *  Present because `TestExplorerSearchModel` is also used for the default
   *  (non-deferred) synchronous path. */
  cancelledStreaming: string[] = [];

  /** The index entries the canned `results` correspond to. */
  get indexEntries(): ContentMatchIndexEntry[] {
    return this.results.map((r) => ({
      path: r.path,
      name: r.name,
      dir: r.dir,
      count: r.matches.length,
      truncated: r.truncated,
    }));
  }

  searchContents(
    rawQuery: string,
    rootPaths: string[],
    options?: ExplorerSearchOptions,
  ): Promise<FileContentSearchResult[]> {
    const query = rawQuery.trim();
    this.calls.push({ query, rootPaths, options });
    if (!query) return Promise.resolve([]);
    return Promise.resolve(this.results);
  }

  searchContentsStreaming(
    rawQuery: string,
    rootPaths: string[],
    options: ExplorerSearchOptions | undefined,
    callbacks: { onEntries: (entries: ContentMatchIndexEntry[]) => void },
  ): ContentSearchSession {
    const query = rawQuery.trim();
    this.calls.push({ query, rootPaths, options });
    if (this.deferStreaming) {
      let resolve!: (value: unknown) => void;
      const done = new Promise<unknown>((r) => {
        resolve = r;
      });
      const session = {
        done,
        resolve,
        query,
        emit: (entries: ContentMatchIndexEntry[]) => callbacks.onEntries(entries),
        cancel: () => {
          this.cancelledStreaming.push(query);
        },
      };
      this.pendingStreaming.push(session);
      return session;
    }
    // Deliver the whole index in one batch, mirroring the real IPC ordering.
    callbacks.onEntries(this.indexEntries);
    return { done: Promise.resolve({ total: this.results.length }), cancel: () => undefined };
  }

  fetchMatches(filePath: string, rawQuery: string): Promise<FileContentMatch[]> {
    this.fetchCalls.push({ filePath, query: rawQuery.trim() });
    const hit = this.results.find((r) => r.path === filePath);
    return Promise.resolve(hit ? hit.matches : []);
  }

  clearCalls(): void {
    this.calls = [];
    this.fetchCalls = [];
  }
}
