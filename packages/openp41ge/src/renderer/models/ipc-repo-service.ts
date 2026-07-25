/**
 * IPC-backed implementations of all model interfaces.
 *
 * These wrap existing window.openp41ge.workspaceController.* IPC calls
 * in the model interfaces. The tree component never calls IPC directly —
 * it always goes through these models.
 *
 * In production, the Openp41geWorktreeTree component creates an IpcRepoService
 * as the default. In tests, a TestRepoService is injected instead.
 */

/* eslint-disable max-classes-per-file */

import type { RepoService } from "./repo-service.js";
import type {
  RepositoryModel,
  GitCloneSessionModel,
  GitCloneProgress,
} from "./repository-model.js";
import type { WorktreeModel } from "./worktree-model.js";
import type { FileEntryModel, FileContentModel, FileStatus } from "./file-model.js";

// ─── IpcFileContent ──────────────────────────────────────────────────

class IpcFileContent implements FileContentModel {
  constructor(private _filePath: string) {}

  async readRange(offset: number, length: number): Promise<{ data: string; totalSize: number }> {
    return window.openp41ge.file.readRange(this._filePath, offset, length);
  }

  async readChunked(
    chunkSize: number,
    onProgress: (p: { loaded: number; total: number; chunk: string }) => void,
  ): Promise<{ data: string; totalSize: number }> {
    const session = window.openp41ge.file.readChunked(this._filePath);
    session.onProgress((p: { loaded: number; total: number; chunk: string }) => {
      if (chunkSize > 0) onProgress(p);
    });
    return session.promise;
  }
}

// ─── IpcWorktreeModel ────────────────────────────────────────────────

class IpcWorktreeModel implements WorktreeModel {
  constructor(
    private _repoName: string,
    private _data: { branch: string; path: string; exists: boolean },
  ) {}

  get branch(): string {
    return this._data.branch;
  }

  get path(): string {
    return this._data.path;
  }

  get exists(): boolean {
    return this._data.exists;
  }

  async readTree(_dirPath?: string): Promise<FileEntryModel[]> {
    // readdir is on window.openp41ge.file; we read the worktree path
    const entries = await window.openp41ge.file.readdir(this._data.path);
    return entries.map((e: FileEntry) => ({
      name: e.name,
      path: e.path,
      isDirectory: e.isDirectory,
      size: e.size,
      modifiedAt: e.modifiedAt,
      gitStatus: "tracked" as FileStatus,
    }));
  }

  async readFile(filePath: string): Promise<FileContentModel> {
    return new IpcFileContent(filePath);
  }

  async getFileStatus(_filePath: string): Promise<FileStatus> {
    // Simplified — returns tracked for all files.
    // Full git status requires IPC integration.
    return "tracked" as FileStatus;
  }

  async stageFile(_filePath: string): Promise<void> {
    // no-op for now
  }
}

// ─── IpcRepositoryModel ──────────────────────────────────────────────

class IpcRepositoryModel implements RepositoryModel {
  constructor(private _data: { name: string; url: string }) {}

  get name(): string {
    return this._data.name;
  }

  get url(): string {
    return this._data.url;
  }

  async listWorktrees(): Promise<WorktreeModel[]> {
    const wts = await window.openp41ge.workspaceController.listWorktrees(this._data.name);
    return wts.map(
      (wt: { branch: string; path: string; exists: boolean }) =>
        new IpcWorktreeModel(this._data.name, wt),
    );
  }

  async checkoutWorktree(branch: string): Promise<WorktreeModel> {
    const wt = await window.openp41ge.workspaceController.checkoutWorktree(this._data.name, branch);
    return new IpcWorktreeModel(this._data.name, wt);
  }

  async deleteWorktree(branch: string): Promise<void> {
    await window.openp41ge.workspaceController.deleteWorktree(this._data.name, branch);
  }

  async pullBranch(branch: string): Promise<void> {
    await window.openp41ge.workspaceController.pullBranch(this._data.name, branch);
  }

  async fetch(): Promise<void> {
    await window.openp41ge.workspaceController.fetch(this._data.name);
  }

  async listBranches(): Promise<string[]> {
    return window.openp41ge.workspaceController.listBranches(this._data.name);
  }

  async getDefaultBranch(): Promise<string | null> {
    return window.openp41ge.workspaceController.getDefaultBranch(this._data.name);
  }
}

// ─── IpcCloneSession ──────────────────────────────────────────────────

class IpcCloneSession implements GitCloneSessionModel {
  readonly promise: Promise<RepositoryModel>;
  private _innerSession: {
    promise: Promise<{ success: boolean; path?: string; error?: string }>;
    onProgress: (fn: (p: { percent: number; message: string }) => void) => () => void;
    destroy: () => void;
  };

  constructor(url: string) {
    this._innerSession = window.openp41ge.workspaceController.clone(url);
    this.promise = this._innerSession.promise.then((result) => {
      if (result.success && result.path) {
        const name = result.path.split("/").pop() ?? "unknown";
        return new IpcRepositoryModel({ name, url });
      }
      throw new Error(result.error ?? "Clone failed");
    });
  }

  onProgress(callback: (progress: GitCloneProgress) => void): () => void {
    return this._innerSession.onProgress(callback);
  }

  abort(): void {
    this._innerSession.destroy();
  }
}

// ─── IpcRepoService ──────────────────────────────────────────────────

/**
 * Production RepoService implementation that delegates to IPC.
 *
 * This is the default service used by Openp41geWorktreeTree in production.
 */
export class IpcRepoService implements RepoService {
  async listRepos(): Promise<RepositoryModel[]> {
    const repos = await window.openp41ge.workspaceController.listRepos();
    return repos.map((r: { path: string; name: string; url: string }) => new IpcRepositoryModel(r));
  }

  async getRepo(name: string): Promise<RepositoryModel | null> {
    try {
      const repo = await window.openp41ge.workspaceController.getRepo(name);
      if (!repo) return null;
      return new IpcRepositoryModel(repo);
    } catch {
      return null;
    }
  }

  clone(url: string): GitCloneSessionModel {
    return new IpcCloneSession(url);
  }

  async addRepo(_path: string, name?: string): Promise<RepositoryModel> {
    // With the project system, repos are discovered by scanning the
    // project's repositories/ directory on disk. The clone is handled
    // separately via the clone() method.
    return new IpcRepositoryModel({ name: name ?? _path, url: _path });
  }

  async removeRepo(_name: string): Promise<void> {
    // Repos are simply directories on disk; removal is handled at the
    // filesystem level. The model-level removeRepo is a no-op since
    // the workspace store no longer exists.
  }
}
