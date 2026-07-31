/**
 * WorkspaceFileService — tracks the active .openp41ge-workspace file.
 *
 * Manages opening, saving, and creating draft workspace files.
 * Emits "workspace-file-changed" on document when the active file changes.
 */

import type { WorkspaceFileData } from "../../layout/types";
import { appState } from "./app-state";

const WORKSPACE_CHANGED_EVENT = "workspace-file-changed";

export class WorkspaceFileService {
  /** Path to the active .openp41ge-workspace file, or null if none. */
  activeFilePath: string | null = null;

  /** Parsed contents of the active workspace file. */
  activeData: WorkspaceFileData | null = null;

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

  // ── Draft ───────────────────────────────────────────

  /**
   * Create a draft workspace file and its data directory.
   * The file is written to ~/.openp41ge/workspaces/<uuid>.openp41ge-workspace.
   * The data directory is ~/.openp41ge/workspaces-data/<uuid>/.
   */
  async createDraft(): Promise<WorkspaceFileData | null> {
    const uuid = crypto.randomUUID();
    const now = new Date().toISOString();
    const data: WorkspaceFileData = {
      id: uuid,
      version: 1,
      createdAt: now,
      dataDir: `~/.openp41ge/workspaces-data/${uuid}`,
      repos: [],
    };

    const filePath = `~/.openp41ge/workspaces/${uuid}.openp41ge-workspace`;

    // Ensure directories exist and write the file via IPC (handles ~ expansion on main)
    const dataDirOk = await window.openp41ge.dialog.ensureDir(`~/.openp41ge/workspaces-data/${uuid}`);
    if (!dataDirOk) return null;

    const written = await window.openp41ge.dialog.writeWorkspaceFile(filePath, data);
    if (!written) return null;

    this.activeFilePath = filePath;
    this.activeData = data;
    appState.activeWorkspaceFilePath = filePath;
    appState.notify();
    this._emitChanged();
    return data;
  }

  /**
   * Ensure a draft workspace exists. If none is active, creates one.
   */
  async ensureDraftExists(): Promise<WorkspaceFileData | null> {
    if (this.activeFilePath && this.activeData) {
      return this.activeData;
    }
    return this.createDraft();
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
