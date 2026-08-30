/**
 * CommitFileDiffController — app type `"commit-file-diff"`.
 *
 * Opened when a FILE result in the Git sidebar commit search is activated
 * (single-click preview, double-click/Enter pinned). Renders the commit's
 * diff for that file in a read-only view: `@@` hunk headers muted, `+` lines
 * green, `-` lines red, context lines grey. Nothing is editable — the view has
 * no textarea at all.
 *
 * Context arrives two ways (mirrors GitCommitSearchController):
 *   - first mount:  window.__pendingCommitFileDiff set by the open-commit-file
 *                   handler; OR restore() already parsed the serialised config
 *   - re-mount:     restore() gets the tab's config slot (JSON string
 *                   `{ repoName, hash, path }`) and any cached hunks, so the
 *                   diff paints instantly without a refetch.
 *
 * First-mount fetching uses the `workspace:getCommitFileHunks` IPC via
 * window.openp41ge.workspaceController (empty query → the full file diff).
 */

import { BaseController } from "../../controllers/base-controller";

interface CommitFileContext {
  repoName?: string;
  hash?: string;
  path?: string;
}

export class CommitFileDiffController extends BaseController {
  private _repoName = "";
  private _hash = "";
  private _path = "";

  /** Cached hunks for instant re-mount render (undefined = not fetched yet). */
  private _hunks: { header: string; lines: Array<{ type: "+" | "-" | " "; text: string }> }[] | null =
    null;

  mount(container: HTMLElement): void {
    this.container = container;

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
    this._bodyHost.style.cssText = "flex:1;min-height:0;overflow:auto;";
    shell.appendChild(this._bodyHost);

    container.appendChild(shell);

    if (this._hunks !== null) {
      this._renderHunks();
    } else {
      void this._fetchAndRender();
    }
  }

  private _bodyHost: HTMLElement | null = null;
  private _mountToken = 0;

  unmount(): void {
    this._mountToken += 1;
    this._bodyHost = null;
    this.container = null;
  }

  snapshot(): Record<string, unknown> {
    return {
      ...this.state,
      filePath: JSON.stringify({ repoName: this._repoName, hash: this._hash, path: this._path }),
      hunks: this._hunks,
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
    this._hunks = Array.isArray(state.hunks) ? (state.hunks as typeof this._hunks) : this._hunks;
  }

  /** @internal test seam — overridable diff fetch (jsdom has no IPC). */
  _fetchDiff: (() => Promise<unknown[]>) | null = null;

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

  private async _fetchAndRender(): Promise<void> {
    const token = ++this._mountToken;
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
    if (token !== this._mountToken || !this.container) return; // unmounted meanwhile
    this._hunks = hunks as typeof this._hunks;
    this._renderHunks();
  }

  private _renderHunks(): void {
    const host = this._bodyHost;
    if (!host || !this.container) return;
    host.innerHTML = "";
    const hunks = this._hunks ?? [];
    if (hunks.length === 0) {
      const msg = document.createElement("div");
      msg.textContent = "No textual diff for this file at this commit";
      msg.style.cssText =
        "display:flex;width:100%;height:100%;align-items:center;justify-content:center;" +
        "font-size:12px;color:var(--text-muted,#777);font-style:italic;padding:16px;text-align:center;";
      host.appendChild(msg);
      return;
    }
    const pre = document.createElement("pre");
    pre.style.cssText =
      "margin:0;padding:8px 12px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;" +
      "font-size:12px;line-height:1.5;color:var(--text-secondary,#aaa);white-space:pre;overflow:visible;";
    pre.setAttribute("data-commit-diff", "");
    for (const h of hunks) {
      pre.appendChild(this._hunkBlock(h));
    }
    host.appendChild(pre);
  }

  private _hunkBlock(h: {
    header: string;
    lines: Array<{ type: "+" | "-" | " "; text: string }>;
  }): HTMLElement {
    const block = document.createElement("div");
    const head = document.createElement("div");
    head.setAttribute("data-diff-header", "");
    head.textContent = h.header;
    head.style.cssText = "color:var(--text-muted,#777);user-select:text;";
    block.appendChild(head);
    for (const line of h.lines) {
      const el = document.createElement("div");
      el.textContent = (line.type === " " ? " " : line.type) + line.text;
      Object.assign(el.style, {
        color:
          line.type === "+"
            ? "#3fb950"
            : line.type === "-"
              ? "#f85149"
              : "var(--text-secondary,#aaa)",
        userSelect: "text",
      });
      block.appendChild(el);
    }
    return block;
  }
}

function safeParse(json: string): unknown {
  try {
    return JSON.parse(json);
  } catch {
    return undefined;
  }
}
