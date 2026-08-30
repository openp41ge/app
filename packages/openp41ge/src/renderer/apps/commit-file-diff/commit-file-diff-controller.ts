/**
 * CommitFileDiffController — app type `"commit-file-diff"`.
 *
 * Opened when a FILE result in the Git sidebar commit search is activated
 * (single-click preview, double-click/Enter pinned). Fetches the file's FULL
 * content and its hunks at that commit via `workspace:getCommitFileContent` +
 * `workspace:getCommitFileHunks`, merges them with `buildInlineDiffFile`, then
 * LOADS the result as a REAL buffer in a READ-ONLY `<file-editor>`:
 *   - the whole file open (nothing cropped, full syntax highlighting, real
 *     line numbers, scroll/find/selection),
 *   - additions/deletions INLINED in the editor — green added rows, red
 *     re-injected deleted rows, no @@ section headers,
 *   - read-only by construction (a commit cannot change).
 *
 * Context arrives two ways (mirrors GitCommitSearchController):
 *   - first mount:  window.__pendingCommitFileDiff set by the open-commit-file
 *                   handler; OR restore() already parsed the serialised config
 *   - re-mount:     restore() gets the tab's config slot (JSON string
 *                   `{ repoName, hash, path }`) and the cached `text` + `rows`,
 *                   so the diff paints instantly without a refetch.
 */

import { BaseController } from "../../controllers/base-controller";
// Import the file-editor component (side-effect: defines <file-editor>) and the
// in-memory model used to build the synthetic commit-file buffer.
import "openp41ge-file-editor";
import type { FileEditorElement } from "openp41ge-file-editor";
import { PieceTreeTextContentModel } from "openp41ge-file-editor";
import { buildInlineDiffFile, type InlineDiffRow } from "openp41ge-git";

interface CommitFileContext {
  repoName?: string;
  hash?: string;
  path?: string;
}

export class CommitFileDiffController extends BaseController {
  private _repoName = "";
  private _hash = "";
  private _path = "";

  /** Cached merged document (text + row decorations) for instant re-mount. */
  private _diffText: string | null = null;
  private _diffRows: InlineDiffRow[] | null = null;

  private _editor: FileEditorElement | null = null;
  private _bodyHost: HTMLElement | null = null;
  private _mountToken = 0;

  /** @internal test seam — overridable diff fetch (jsdom has no IPC).
   * Returns [content, hunks] like the real dual IPC fetch. */
  _fetchDiff: (() => Promise<[string | null, unknown[]]>) | null = null;

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

    if (this._diffText !== null) {
      void this._loadInlineDiff(editor);
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
      text: this._diffText,
      rows: this._diffRows,
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
    if (typeof state.text === "string") this._diffText = state.text;
    if (Array.isArray(state.rows)) {
      const rows = state.rows as unknown[];
      if (
        rows.every(
          (r) =>
            r &&
            typeof r === "object" &&
            ("kind" in (r as object)) &&
            ("fileLine" in (r as object)),
        )
      ) {
        this._diffRows = rows as InlineDiffRow[];
      }
    }
  }

  /** Header: file path — short hash. */
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
    let content: string | null = null;
    let hunks: unknown[] = [];
    try {
      if (this._fetchDiff) {
        [content, hunks] = await this._fetchDiff();
      } else if (window.openp41ge?.workspaceController) {
        const wc = window.openp41ge.workspaceController;
        [content, hunks] = await Promise.all([
          wc.getCommitFileContent(this._repoName, this._hash, this._path),
          wc.getCommitFileHunks(this._repoName, this._hash, this._path, "", {
            regex: false,
            caseSensitive: false,
          }),
        ]);
      }
    } catch {
      content = null;
      hunks = [];
    }
    if (token !== this._mountToken || !this.container || this._editor !== editor) return;

    if (content === null) {
      this._showEmpty(editor, "No textual content for this file at this commit");
      return;
    }
    const file = buildInlineDiffFile(content, hunks as Parameters<typeof buildInlineDiffFile>[1]);
    this._diffText = file.text;
    this._diffRows = [...file.rows];
    void this._loadInlineDiff(editor);
  }

  /** Load the merged buffer into the read-only editor, then apply decorations. */
  private async _loadInlineDiff(editor: FileEditorElement): Promise<void> {
    await this._awaitEditorReady(editor);
    if (!this.container || this._editor !== editor) return; // detached meanwhile

    const text = this._diffText;
    const rows = this._diffRows;
    if (text === null || !rows || rows.length === 0) {
      this._showEmpty(editor, "No textual diff for this file at this commit");
      return;
    }

    // The uri ends with the real file name so language detection (extension)
    // engages and the loaded buffer gets FULL syntax highlighting.
    const uri = `gitcommitfile://${this._repoName}/${this._hash}/${this._path}`;
    const model = new PieceTreeTextContentModel(uri, text);
    editor.textContentModel = model;

    const name = this._path.split("/").filter(Boolean).pop() || this._path;
    try {
      await editor.loadFile(uri, name || "file");
    } catch {
      if (this._editor === editor) {
        this._showEmpty(editor, "Could not render the file at this commit");
      }
      return;
    }
    if (this._editor !== editor) return;
    editor.setInlineDiff(rows);
  }

  /** Wait for the editor's Lit pipeline (viewport) before loadFile can paint. */
  private async _awaitEditorReady(editor: FileEditorElement): Promise<void> {
    type EditorWithPrivates = { _viewportEl?: HTMLElement; updateComplete: Promise<void> };
    const e = editor as unknown as EditorWithPrivates;
    if (e._viewportEl) return;
    if (typeof e.updateComplete?.then === "function") {
      await e.updateComplete;
      // firstUpdated may have created _viewportEl synchronously; if a later
      // lit update re-schedules, give it one more turn.
      if (!e._viewportEl) await e.updateComplete;
    }
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
