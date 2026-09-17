/**
 * ToolResultController — app type `"tool-result"`.
 *
 * Opened when a tool-call card in an agent chat is clicked. Shows the tool's
 * result text in a READ-ONLY <file-editor> (full line numbers, find/scroll,
 * and syntax highlighting when the result carries a filename extension).
 *
 * Context arrives two ways (mirrors CommitFileDiffController):
 *   - first mount:  window.__pendingToolResult set by the tool-result open
 *                   handler; OR restore() already parsed the serialised config
 *   - re-mount:     restore() gets the tab's config slot (JSON string
 *                   `{ toolName, argsString, result }`).
 */

import { BaseController } from "../../controllers/base-controller";
// Import the file-editor component (side-effect: defines <file-editor>) and the
// in-memory model used to build the synthetic buffer.
import "openp41ge-file-editor";
import type { FileEditorElement } from "openp41ge-file-editor";
import { PieceTreeTextContentModel } from "openp41ge-file-editor";

interface ToolResultContext {
  toolName?: string;
  argsString?: string;
  result?: string;
  hint?: string;
}

export class ToolResultController extends BaseController {
  private _toolName = "";
  private _argsString = "";
  private _result = "";
  private _hint = "";
  private _editor: FileEditorElement | null = null;
  private _bodyHost: HTMLElement | null = null;
  private _mountToken = 0;

  mount(container: HTMLElement): void {
    this.container = container;
    const token = ++this._mountToken;

    // Fresh mount: the handler set the pending context for this window.
    const pending = (window as unknown as Record<string, unknown>).__pendingToolResult as
      | ToolResultContext
      | undefined;
    if (pending && !this._toolName) {
      this._toolName = pending.toolName ?? "";
      this._argsString = pending.argsString ?? "";
      this._result = pending.result ?? "";
      this._hint = pending.hint ?? "";
      (window as unknown as Record<string, unknown>).__pendingToolResult = null;
    }

    container.style.cssText = "width:100%;height:100%;overflow:hidden;background:#121212;";
    container.innerHTML = "";

    if (!this._result) {
      container.innerHTML = `
        <div style="display:flex;width:100%;height:100%;align-items:center;justify-content:center;font-size:12px;color:var(--text-muted,#777);padding:16px;text-align:center;">
          No tool result
        </div>
      `;
      return;
    }

    const shell = document.createElement("div");
    shell.style.cssText = "display:flex;flex-direction:column;width:100%;height:100%;";

    this._bodyHost = document.createElement("div");
    this._bodyHost.style.cssText = "flex:1;min-height:0;position:relative;";
    shell.appendChild(this._bodyHost);
    container.appendChild(shell);

    const editor = document.createElement("file-editor") as FileEditorElement;
    editor.style.cssText = "width:100%;height:100%;display:block;";
    editor.setReadOnly(true);
    this._bodyHost.appendChild(editor);
    this._editor = editor;
    if (this._hint) editor.setStatusInfo(this._hint);

    void this._loadResult(editor, token);
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
      filePath: JSON.stringify({
        toolName: this._toolName,
        argsString: this._argsString,
        result: this._result,
        hint: this._hint,
      }),
    };
  }

  restore(state: Record<string, unknown>): void {
    this.state = { ...state };
    const parsed =
      typeof state.filePath === "string" && state.filePath.trim().startsWith("{")
        ? (safeParse(state.filePath) as ToolResultContext)
        : undefined;
    this._toolName = (state.toolName as string) || parsed?.toolName || "";
    this._argsString = (state.argsString as string) || parsed?.argsString || "";
    this._result = (state.result as string) || parsed?.result || "";
    this._hint = (state.hint as string) || parsed?.hint || "";
  }

  /** Load the result text as a read-only buffer into the editor. */
  private async _loadResult(editor: FileEditorElement, token: number): Promise<void> {
    await this._awaitEditorReady(editor);
    if (token !== this._mountToken || !this.container || this._editor !== editor) return;

    // The buffer is built from the SNAPSHOTTED result string captured when the
    // tool ran, never re-read from disk — so the tab always shows the file
    // content as it was at read time, even if the file changed since.
    const src = this._sourcePath();
    const uri = src
      ? `toolresult://${src.replace(/^\/+/, "")}`
      : `toolresult://${this._toolName}`;
    const model = new PieceTreeTextContentModel(uri, this._result);
    editor.textContentModel = model;

    // Ending the synthetic URI with the real filename lets the editor detect
    // the language from its extension and apply syntax highlighting.
    const name = this._tabTitleHint() || this._toolName || "result";
    try {
      await editor.loadFile(uri, name || "result");
    } catch {
      if (this._editor === editor && this._bodyHost) {
        this._showEmpty(this._bodyHost, "Could not render this tool result");
      }
    }
  }

  /** The original file path the tool read (read_file), or "" when none. */
  private _sourcePath(): string {
    const p = this._args().path;
    return typeof p === "string" && p.trim() ? p.trim() : "";
  }

  private _args(): Record<string, unknown> {
    let args: Record<string, unknown> = {};
    try {
      args = this._argsString ? JSON.parse(this._argsString) : {};
    } catch {
      args = {};
    }
    return args;
  }

  private _tabTitleHint(): string {
    const path = this._args().path;
    if (typeof path === "string" && path.trim()) {
      const p = path as string;
      return p.split("/").filter(Boolean).pop() || p;
    }
    return "";
  }

  /** Wait for the editor's Lit pipeline (viewport) before loadFile can paint. */
  private async _awaitEditorReady(editor: FileEditorElement): Promise<void> {
    type EditorWithPrivates = { _viewportEl?: HTMLElement; updateComplete: Promise<void> };
    const e = editor as unknown as EditorWithPrivates;
    if (e._viewportEl) return;
    if (typeof e.updateComplete?.then === "function") {
      await e.updateComplete;
      if (!e._viewportEl) await e.updateComplete;
    }
  }

  private _showEmpty(host: HTMLElement, text: string): void {
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
