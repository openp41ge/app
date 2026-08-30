/**
 * GitCommitSearchController — app type `"git-commit-search"`.
 *
 * Opened by dragging a commit-search result row onto the grid (open-tab drag
 * with appType git-commit-search). Displays the commit's FULL message in a
 * read-only `<file-editor>` so the drag lands on a real viewer instead of the
 * original placeholder panel.
 *
 * Repo + hash arrive two ways (mirrors GitRepositoryController):
 *   - first mount:  window.__pendingGitCommitSearch set by the grid-open-tab /
 *                   cross-window drop handler
 *   - re-mount:     restore() gets the serialised tab config — for this app the
 *                   config slot is a JSON string `{ repoName, hash }`
 *
 * The fetched message (+ author/date) is snapshot/restored too, so a re-mount
 * renders instantly without a refetch. First mount fetches via the
 * `workspace:getCommitMessage` IPC (window.openp41ge.workspaceController).
 */

import { BaseController } from "../../controllers/base-controller";
// Import the file-editor component (side-effect: defines <file-editor>) and
// the in-memory model for the synthetic commit-message buffer.
import "openp41ge-file-editor";
import type { FileEditorElement } from "openp41ge-file-editor";
import { PieceTreeTextContentModel } from "openp41ge-file-editor";

interface CommitSearchResultContext {
  repoName?: string;
  hash?: string;
}

export class GitCommitSearchController extends BaseController {
  private _repoName = "";
  private _hash = "";

  /** Cached commit message (full message) for instant re-mount render. */
  private _messageContent: string | null = null;
  private _messageAuthor = "";
  private _messageDate = "";

  private _editor: FileEditorElement | null = null;

  mount(container: HTMLElement): void {
    this.container = container;

    // Fresh mount: a drop set the pending context on this window.
    const pending = (window as unknown as Record<string, unknown>).__pendingGitCommitSearch as
      CommitSearchResultContext | undefined;
    if (pending?.repoName && pending.hash && !this._repoName && !this._hash) {
      this._repoName = pending.repoName;
      this._hash = pending.hash;
      (window as unknown as Record<string, unknown>).__pendingGitCommitSearch = null;
    }

    container.style.cssText = "width:100%;height:100%;overflow:hidden;background:#121212;";
    container.innerHTML = "";

    const shortHash = this._hash ? this._hash.slice(0, 7) : "";

    if (!this._repoName || !this._hash) {
      container.innerHTML = `
        <div style="display:flex;width:100%;height:100%;align-items:center;justify-content:center;font-size:12px;color:var(--text-muted,#777);padding:16px;text-align:center;">
          Commit search result
        </div>
      `;
      return;
    }

    // Header — repo · short hash, then the read-only editor fills the rest.
    const shell = document.createElement("div");
    shell.style.cssText = "display:flex;flex-direction:column;width:100%;height:100%;";

    const header = document.createElement("div");
    header.style.cssText =
      "display:flex;align-items:center;justify-content:space-between;padding:0 10px;height:28px;" +
      "border-bottom:1px solid #333;font-size:11px;color:#999;flex-shrink:0;";
    const left = document.createElement("span");
    left.textContent = this._repoName;
    left.style.cssText = "overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
    const right = document.createElement("span");
    right.textContent = shortHash;
    header.appendChild(left);
    header.appendChild(right);

    const editorHost = document.createElement("div");
    editorHost.style.cssText = "flex:1;min-height:0;position:relative;";

    shell.appendChild(header);
    shell.appendChild(editorHost);
    container.appendChild(shell);

    const editor = document.createElement("file-editor") as FileEditorElement;
    editor.style.cssText = "width:100%;height:100%;display:block;";
    // Read-only from the start: the caret never appears and no edit can land.
    editor.setReadOnly(true);
    editorHost.appendChild(editor);
    this._editor = editor;

    if (this._messageContent !== null) {
      // Restored from a previous snapshot — render without refetching.
      void this._loadMessageIntoEditor(editor);
    } else {
      void this._fetchAndLoad(editor);
    }
  }

  unmount(): void {
    this._editor = null;
    this.container = null;
  }

  snapshot(): Record<string, unknown> {
    return {
      ...this.state,
      repoName: this._repoName,
      hash: this._hash,
      message: this._messageContent,
      messageAuthor: this._messageAuthor,
      messageDate: this._messageDate,
    };
  }

  restore(state: Record<string, unknown>): void {
    this.state = { ...state };
    const parsed =
      typeof state.filePath === "string" && state.filePath.trim().startsWith("{")
        ? (safeParse(state.filePath) as CommitSearchResultContext)
        : undefined;
    this._repoName = (state.repoName as string) || parsed?.repoName || "";
    this._hash = (state.hash as string) || parsed?.hash || "";
    this._messageContent = typeof state.message === "string" ? state.message : null;
    this._messageAuthor = (state.messageAuthor as string) || "";
    this._messageDate = (state.messageDate as string) || "";
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

  private async _fetchAndLoad(editor: FileEditorElement): Promise<void> {
    const startEditor = editor;
    let content = "";
    let author = "";
    let date = "";
    try {
      const entry = await window.openp41ge.workspaceController.getCommitMessage(
        this._repoName,
        this._hash,
      );
      if (entry) {
        content = entry.fullMessage || entry.message || "";
        author = entry.authorName || "";
        date = entry.date || "";
      }
    } catch {
      // Same fallback as the null-result path below.
    }

    // Ignore stale completions (tab re-mounted with a fresh editor meanwhile).
    if (!this.container || this._editor !== startEditor) return;

    if (!content) {
      this._showFallback(startEditor, "Commit message unavailable for this hash");
      return;
    }

    this._messageContent = content;
    this._messageAuthor = author;
    this._messageDate = date;
    await this._loadMessageIntoEditor(startEditor);
  }

  private async _loadMessageIntoEditor(editor: FileEditorElement): Promise<void> {
    await this._awaitEditorReady(editor);
    if (!this.container || this._editor !== editor) return; // detached meanwhile

    const content = this._messageContent?.length ? this._messageContent : "(no commit message)";
    const uri = `gitcommit://${this._repoName}/${this._hash}`;
    const model = new PieceTreeTextContentModel(
      uri,
      content.endsWith("\n") ? content : content + "\n",
    );
    editor.textContentModel = model;
    try {
      await editor.loadFile(uri, this._hash.slice(0, 7) || "commit");
    } catch {
      if (this._editor === editor) {
        this._showFallback(editor, "Could not render the commit message");
      }
    }
  }

  private _showFallback(editor: FileEditorElement, text: string): void {
    if (!editor.parentElement) return;
    const host = editor.parentElement;
    host.innerHTML = "";
    const msg = document.createElement("div");
    msg.textContent = text;
    msg.style.cssText =
      "display:flex;width:100%;height:100%;align-items:center;justify-content:center;" +
      "font-size:12px;color:#777;font-style:italic;padding:16px;text-align:center;";
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
