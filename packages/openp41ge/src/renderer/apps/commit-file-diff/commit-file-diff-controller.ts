/**
 * CommitFileDiffController — app type `"commit-file-diff"`.
 *
 * Opened when a FILE result in the Git sidebar commit search is activated
 * (single-click preview, double-click/Enter pinned). Fetches the file's hunks
 * at that commit via `workspace:getCommitFileHunks` (empty query → the full
 * diff), converts them with `hunksToDiffDocument`, and shows them in a
 * READ-ONLY `<file-editor>` diff view — VS Code-style green additions / red
 * deletions with old|new line numbers, +/− glyphs and `@@` header rows.
 * Nothing is editable: the editor is in read-only diff mode (no caret).
 *
 * Context arrives two ways (mirrors GitCommitSearchController):
 *   - first mount:  window.__pendingCommitFileDiff set by the open-commit-file
 *                   handler; OR restore() already parsed the serialised config
 *   - re-mount:     restore() gets the tab's config slot (JSON string
 *                   `{ repoName, hash, path }`) and the cached `diff` document,
 *                   so the diff paints instantly without a refetch.
 */

import { BaseController } from "../../controllers/base-controller";
// Import the file-editor component (side-effect: defines <file-editor>) so the
// diff document renders through the real editor (read-only diff mode).
import "openp41ge-file-editor";
import type { FileEditorElement } from "openp41ge-file-editor";
import { hunksToDiffDocument, type DiffDocument } from "openp41ge-git";

interface CommitFileContext {
  repoName?: string;
  hash?: string;
  path?: string;
}

export class CommitFileDiffController extends BaseController {
  private _repoName = "";
  private _hash = "";
  private _path = "";

  /** Cached diff document for instant re-mount render (null = not fetched yet). */
  private _diff: DiffDocument | null = null;

  private _editor: FileEditorElement | null = null;
  private _bodyHost: HTMLElement | null = null;
  private _mountToken = 0;

  /** @internal test seam — overridable diff fetch (jsdom has no IPC). */
  _fetchDiff: (() => Promise<unknown[]>) | null = null;

  mount(container: HTMLElement): void {
    this.container = container;
    const token = ++this._mountToken;

    // Fresh mount: the handler set the pending context for this window.
    const pending = (window as unknown as Record<string, unknown>).__pendingCommitFileDiff as
      | CommitFileContext
      | undefined;
    if (pending?.repoName && pending.hash && pending.path && !this._repoName) {
      this._repoName = pending.repoName;
      this._hash = pending.hash;
      this._path = pending.path;
      (window as unknown as Record<string, unknown>).__pendingCommitFileDiff = null;
    }

    container.style.cssText = "width:100%;height:100%;overflow:hidden;background:#121212;";
    container.innerHTML = "";

    if (!this._repoName || !this._hash || !this._path) {
      container.innerHTML = `
        <div style="display:flex;width:100%;height:100%;align-items:center;justify-content:center;font-size:12px;color:var(--text-muted,#777);padding:16px;text-align:center;">
          File diff unavailable
        </div>
      `;
      return;
    }

    const shell = document.createElement("div");
    shell.style.cssText = "display:flex;flex-direction:column;width:100%;height:100%;";

    shell.appendChild(this._buildHeader());

    this._bodyHost = document.createElement("div");
    this._bodyHost.style.cssText = "flex:1;min-height:0;position:relative;";
    shell.appendChild(this._bodyHost);
    container.appendChild(shell);

    const editor = document.createElement("file-editor") as FileEditorElement;
    editor.style.cssText = "width:100%;height:100%;display:block;";
    editor.setReadOnly(true);
    this._bodyHost.appendChild(editor);
    this._editor = editor;

    if (this._diff !== null) {
      editor.setDiffDocument(this._diff);
    } else {
      void this._fetchAndRender(editor, token);
    }
  }

  unmount(): void {
    this._mountToken += 1;
    this._editor = null;
    this._bodyHost = null;
    this.container = null;
  }

  snapshot(): Record<string, unknown> {
    return {
      ...this.state,
      filePath: JSON.stringify({ repoName: this._repoName, hash: this._hash, path: this._path }),
      diff: this._diff,
    };
  }

  restore(state: Record<string, unknown>): void {
    this.state = { ...state };
    const parsed =
      typeof state.filePath === "string" && state.filePath.trim().startsWith("{")
        ? (safeParse(state.filePath) as CommitFileContext)
        : undefined;
    this._repoName = (state.repoName as string) || parsed?.repoName || "";
    this._hash = (state.hash as string) || parsed?.hash || "";
    this._path = (state.path as string) || parsed?.path || "";
    if (
      state.diff &&
      typeof state.diff === "object" &&
      Array.isArray((state.diff as DiffDocument).lines)
    ) {
      this._diff = state.diff as DiffDocument;
    }
  }

  /** Header: repo — file path — short hash. */
  private _buildHeader(): HTMLElement {
    const header = document.createElement("div");
    header.style.cssText =
      "display:flex;align-items:center;gap:8px;padding:0 10px;height:28px;flex-shrink:0;" +
      "border-bottom:1px solid #333;font-size:11px;color:#999;";
    const path = document.createElement("span");
    path.textContent = this._path;
    path.style.cssText = "flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
    const short = document.createElement("span");
    short.textContent = this._hash.slice(0, 7);
    short.style.color = "#e3e3e3";
    header.appendChild(path);
    header.appendChild(short);
    return header;
  }

  private async _fetchAndRender(editor: FileEditorElement, token: number): Promise<void> {
    let hunks: unknown[] = [];
    try {
      if (this._fetchDiff) {
        hunks = await this._fetchDiff();
      } else if (window.openp41ge?.workspaceController?.getCommitFileHunks) {
        hunks = await window.openp41ge.workspaceController.getCommitFileHunks(
          this._repoName,
          this._hash,
          this._path,
          "",
          { regex: false, caseSensitive: false },
        );
      }
    } catch {
      hunks = [];
    }
    if (token !== this._mountToken || !this.container || this._editor !== editor) return;

    if (hunks.length === 0) {
      this._showEmpty(editor, "No textual diff for this file at this commit");
      return;
    }
    this._diff = hunksToDiffDocument(hunks as Parameters<typeof hunksToDiffDocument>[0]);
    editor.setDiffDocument(this._diff);
  }

  private _showEmpty(editor: FileEditorElement, text: string): void {
    if (!editor.parentElement) return;
    editor.remove();
    this._editor = null;
    const host = this._bodyHost ?? editor.parentElement;
    const msg = document.createElement("div");
    msg.textContent = text;
    msg.style.cssText =
      "display:flex;width:100%;height:100%;align-items:center;justify-content:center;" +
      "font-size:12px;color:var(--text-muted,#777);font-style:italic;padding:16px;text-align:center;";
    host.appendChild(msg);
  }
}

function safeParse(json: string): unknown {
  try {
    return JSON.parse(json);
  } catch {
    return undefined;
  }
}
