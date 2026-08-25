/**
 * WorkspaceFileService — tracks the active .openp41ge-workspace file.
 *
 * Manages opening, saving, and creating draft workspace files.
 * Emits "workspace-file-changed" on document when the active file changes.
 */

import type { WorkspaceFileData } from "../../layout/types";
import { appState } from "./app-state";

const WORKSPACE_CHANGED_EVENT = "workspace-file-changed";

/** Result of materialising (cloning) a repo for a workspace. */
export interface MaterializeOutcome {
  url: string;
  name: string;
  ok: boolean;
  error?: string;
  worktrees: Array<{ branch: string; ok: boolean; error?: string }>;
}

/**
 * Derive the repository name from a git URL, matching the main-process
 * NodeGitService derivation so repos land under the same directory name.
 * https://github.com/acme/widget.git -> github.com/acme/widget
 * git@github.com:acme/widget.git    -> github.com/acme/widget
 */
export function deriveRepoName(url: string): string {
  const cleaned = url
    .replace(/^https?:\/\//, "")
    .replace(/^git@/, "")
    .replace(/\.git$/, "");
  const parts = cleaned.split(/[/:]/);
  const provider = parts[0];
  const repoName = parts[parts.length - 1];
  const orgPath = parts.slice(1, -1).join("/");
  return orgPath ? `${provider}/${orgPath}/${repoName}` : `${provider}/${repoName}`;
}

export class WorkspaceFileService {
  /** Path to the active .openp41ge-workspace file, or null if none. */
  activeFilePath: string | null = null;

  /** Parsed contents of the active workspace file. */
  activeData: WorkspaceFileData | null = null;

  /**
   * Human-readable name of the active workspace:
   * `data.name` if set, else the workspace file's basename (minus the
   * `.openp41ge-workspace` extension), else "No workspace".
   */
  get activeWorkspaceName(): string {
    const name = this.activeData?.name?.trim();
    if (name) return name;
    if (this.activeFilePath) {
      const base = this.activeFilePath.split(/[\\/]/).pop() ?? "";
      const cleaned = base.replace(/\.openp41ge-workspace$/i, "").trim();
      if (cleaned) return cleaned;
    }
    return "No workspace";
  }

  // ── Open (via dialog) ───────────────────────────────

  /**
   * Open the native file picker. Reads the selected file and sets it active.
   * Returns true if a file was loaded, false if cancelled.
   */
  async openDialog(): Promise<boolean> {
    const result = await window.openp41ge.dialog.openWorkspaceFile();
    if (!result) return false;
    this.activeFilePath = result.filePath;
    this.activeData = result.data;
    appState.activeWorkspaceFilePath = result.filePath;
    appState.notify();
    this._emitChanged();
    return true;
  }

  // ── Load known path ─────────────────────────────────

  /**
   * Load a workspace file from a known path (no dialog).
   * Returns true on success.
   */
  async loadPath(filePath: string): Promise<boolean> {
    const result = await window.openp41ge.dialog.readWorkspaceFile(filePath);
    if (!result) return false;
    this.activeFilePath = result.filePath;
    this.activeData = result.data;
    appState.activeWorkspaceFilePath = result.filePath;
    appState.notify();
    this._emitChanged();
    return true;
  }

  // ── Save ────────────────────────────────────────────

  /**
   * Write current data to the active workspace file (no dialog).
   */
  async save(): Promise<boolean> {
    if (!this.activeFilePath || !this.activeData) return false;
    const ok = await window.openp41ge.dialog.writeWorkspaceFile(this.activeFilePath, this.activeData);
    return ok;
  }

  /**
   * Save via dialog (Save As). Returns the new path, or null if cancelled.
   */
  async saveAs(): Promise<string | null> {
    if (!this.activeData) return null;
    const defaultPath = this.activeFilePath ?? undefined;
    const filePath = await window.openp41ge.dialog.saveWorkspaceFile(this.activeData, defaultPath);
    if (!filePath) return null;
    this.activeFilePath = filePath;
    appState.activeWorkspaceFilePath = filePath;
    appState.notify();
    this._emitChanged();
    return filePath;
  }

  // ── List all workspaces ───────────────────────────

  /**
   * List all .openp41ge-workspace files from ~/.openp41ge/workspaces/.
   * Returns sorted array of { filePath, data }.
   */
  async listWorkspaces(): Promise<Array<{ filePath: string; data: WorkspaceFileData }>> {
    return window.openp41ge.dialog.listWorkspaces();
  }

  // ── Create new workspace ───────────────────────────

  /**
   * Create a new workspace file with the given name.
   * Writes to ~/.openp41ge/workspaces/<uuid>.openp41ge-workspace
   * and sets it as the active workspace.
   */
  async createWorkspace(name: string): Promise<WorkspaceFileData | null> {
    const uuid = crypto.randomUUID();
    const now = new Date().toISOString();
    const data: WorkspaceFileData = {
      id: uuid,
      name,
      version: 1,
      createdAt: now,
      dataDir: `~/.openp41ge/workspaces-data/${uuid}`,
      repos: [],
    };

    const filePath = `~/.openp41ge/workspaces/${uuid}.openp41ge-workspace`;

    // Ensure data directory exists
    await window.openp41ge.dialog.ensureDir(`~/.openp41ge/workspaces-data/${uuid}`);

    const written = await window.openp41ge.dialog.writeWorkspaceFile(filePath, data);
    if (!written) return null;

    this.activeFilePath = filePath;
    this.activeData = data;
    appState.activeWorkspaceFilePath = filePath;
    appState.notify();
    this._emitChanged();
    return data;
  }

  // ── Activate existing workspace ────────────────────

  /**
   * Set a workspace (from listWorkspaces) as the active workspace.
   */
  activateWorkspace(entry: { filePath: string; data: WorkspaceFileData }): void {
    this.activeFilePath = entry.filePath;
    this.activeData = entry.data;
    appState.activeWorkspaceFilePath = entry.filePath;
    appState.notify();
    this._emitChanged();
  }

  // ── Change data dir ─────────────────────────────────

  /**
   * Update the dataDir in memory. Call save() to persist to disk.
   */
  changeDataDir(newPath: string): void {
    if (!this.activeData) return;
    this.activeData.dataDir = newPath;
    this._emitChanged();
  }

  // ── Materialize repos (clone on disk) ────────────────────────────

  /**
   * Best-effort clone of the active workspace's repos into the project
   * repositories dir + registration in the window's repoRefs, and checkout
   * of their worktrees, so the Explorer/Git sidebar panels can list them.
   *
   * Uses the workspaceController APIs (the same path normal repo-add uses),
   * which clone into the directory the sidebar panels scan. All operations
   * are idempotent at the main-process level (existing clones/worktrees are
   * skipped), so this is safe to run on every activation. Returns a per-repo
   * outcome summary (for tests/diagnostics).
   */
  async materializeActiveRepos(): Promise<MaterializeOutcome[]> {
    const data = this.activeData;
    if (!data || !Array.isArray(data.repos) || data.repos.length === 0) return [];

    const outcomes: MaterializeOutcome[] = [];
    for (const repo of data.repos) {
      const name = deriveRepoName(repo.url);
      const out: MaterializeOutcome = { url: repo.url, name, ok: false, worktrees: [] };
      try {
        // Clone the bare repo into the project repos dir (idempotent).
        const clone = await window.openp41ge.workspaceController.clone(repo.url).promise;
        if (!clone.success) {
          out.error = clone.error || "Clone failed";
          outcomes.push(out);
          continue;
        }
        // Register the repo in the window's repoRefs so sidebar panels show it.
        await window.openp41ge.workspaceController.worksetAddRepo(name, repo.url, repo.worktrees ?? []);

        for (const branch of repo.worktrees ?? []) {
          try {
            await window.openp41ge.workspaceController.checkoutWorktree(name, branch);
            await window.openp41ge.workspaceController.worksetAddWorktreeToRepo(name, branch);
            out.worktrees.push({ branch, ok: true });
          } catch (wtErr) {
            out.worktrees.push({
              branch,
              ok: false,
              error: wtErr instanceof Error ? wtErr.message : String(wtErr),
            });
          }
        }
        out.ok = out.worktrees.every((w) => w.ok);
      } catch (e) {
        out.error = e instanceof Error ? e.message : String(e);
      }
      outcomes.push(out);
    }
    return outcomes;
  }

  // ── Clear ───────────────────────────────────────────

  /** Clear the active workspace (drops references, file stays on disk). */
  clear(): void {
    this.activeFilePath = null;
    this.activeData = null;
    appState.activeWorkspaceFilePath = null;
    appState.notify();
    this._emitChanged();
  }

  // ── Events ──────────────────────────────────────────

  private _emitChanged(): void {
    document.dispatchEvent(
      new CustomEvent(WORKSPACE_CHANGED_EVENT, {
        bubbles: true,
        detail: {
          filePath: this.activeFilePath,
          data: this.activeData,
        },
      }),
    );
  }

  /** Subscribe to workspace file changes. Returns unsubscribe. */
  onChange(callback: () => void): () => void {
    const handler = () => callback();
    document.addEventListener(WORKSPACE_CHANGED_EVENT, handler);
    return () => document.removeEventListener(WORKSPACE_CHANGED_EVENT, handler);
  }
}

/** Singleton instance. */
export const workspaceFileService = new WorkspaceFileService();

/**
 * Pure filter: does this workspace match a search query? Matches against the
 * workspace name, the file basename, repo names/urls, and worktree names.
 * An empty/whitespace query matches everything.
 */
export function workspaceMatchesQuery(
  data: WorkspaceFileData,
  filePath: string,
  query: string,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;

  if ((data.name ?? "").toLowerCase().includes(q)) return true;

  const base = filePath.split(/[\\/]/).pop() ?? "";
  if (base.toLowerCase().includes(q)) return true;

  return (data.repos ?? []).some(
    (r) =>
      r.url.toLowerCase().includes(q) ||
      (r.worktrees ?? []).some((w) => w.toLowerCase().includes(q)),
  );
}
