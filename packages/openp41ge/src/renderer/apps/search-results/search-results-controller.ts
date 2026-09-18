/**
 * SearchResultsController — app type `"search-results"`.
 *
 * Opened when a `search_files` tool-call card in an agent chat is clicked.
 * A search result is a LIST of matching file paths — not file content — so it
 * does NOT belong in the `<file-editor>`. This pane shows the matches as a
 * read-only, clickable list: each row is a file path and clicking a row opens
 * that file in the editor in the cell to the right.
 *
 * Context arrives two ways (mirrors ToolResultController):
 *   - first mount:  window.__pendingToolResult set by the tool-result open
 *                   handler; OR restore() already parsed the serialised config
 *   - re-mount:     restore() gets the tab's config slot (JSON string
 *                   `{ toolName, argsString, result, hint }`).
 */

import { BaseController } from "../../controllers/base-controller";

interface SearchResultsContext {
  toolName?: string;
  argsString?: string;
  result?: string;
  hint?: string;
}

export class SearchResultsController extends BaseController {
  private _toolName = "";
  private _argsString = "";
  private _result = "";
  private _hint = "";
  private _rows: string[] = [];
  private _bodyHost: HTMLElement | null = null;
  private _list: HTMLElement | null = null;
  private _wrap = false;

  mount(container: HTMLElement): void {
    this.container = container;

    const pending = (window as unknown as Record<string, unknown>).__pendingToolResult as
      | SearchResultsContext
      | undefined;
    if (pending && !this._toolName) {
      this._toolName = pending.toolName ?? "";
      this._argsString = pending.argsString ?? "";
      this._result = pending.result ?? "";
      this._hint = pending.hint ?? "";
      (window as unknown as Record<string, unknown>).__pendingToolResult = null;
    }

    this._rows = this._result
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      // `search_files` reports "no matches" in-band as a single sentinel line.
      .filter((l) => l !== "(no matching files)");

    container.style.cssText = "width:100%;height:100%;overflow:hidden;background:#121212;";
    container.innerHTML = "";

    if (!this._rows.length) {
      container.innerHTML = `
        <div style="display:flex;width:100%;height:100%;align-items:center;justify-content:center;font-size:12px;color:var(--text-muted,#777);padding:16px;text-align:center;">
          No matching files
        </div>
      `;
      return;
    }

    const shell = document.createElement("div");
    shell.style.cssText = "display:flex;flex-direction:column;width:100%;height:100%;";

    const style = document.createElement("style");
    style.textContent = `
      .sr-list { flex:1; min-height:0; overflow:auto; padding:4px 0; font-family:var(--font-mono,'JetBrains Mono',monospace); font-size:12px; }
      .sr-row {
        display:flex; align-items:center; gap:8px; width:100%; text-align:left; padding:5px 14px;
        background:transparent; border:none; cursor:pointer; color:var(--text-secondary,#bbb);
        font:inherit; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
      }
      .sr-row:hover { background:var(--bg-active,#2d2d2d); color:var(--text-primary,#e4e4e4); }
      .sr-row-icon { flex-shrink:0; font-size:12px; opacity:0.8; }
      .sr-row-text { overflow:hidden; text-overflow:ellipsis; }
      .sr-list.wrapped .sr-row {
        align-items:flex-start;
        white-space:pre-wrap;
        word-break:break-word;
        overflow:visible;
        text-overflow:clip;
      }
      .sr-list.wrapped .sr-row-text {
        overflow:visible;
        text-overflow:clip;
      }
      .sr-bottom {
        flex-shrink:0; display:flex; align-items:stretch; height:32px;
        border-top:1px solid var(--border-color,#2a2a2a);
        background:var(--bg-primary,#1e1e1e);
      }
      .sr-spacer { flex:1; }
      .sr-wrap-btn {
        display:flex; align-items:center; justify-content:center;
        width:calc(32px + var(--grid-edge-right-pad,0px));
        align-self:stretch;
        background:transparent; border:none;
        color:var(--text-secondary,#999); cursor:pointer;
        padding:0 var(--grid-edge-right-pad,0px) 0 0;
        box-sizing:border-box; flex-shrink:0;
      }
      .sr-wrap-btn:hover { background:rgba(255,255,255,0.07); color:var(--text-primary,#fff); }
      .sr-wrap-btn.active { background:rgba(255,255,255,0.1); color:var(--text-primary,#fff); }
      .sr-wrap-btn svg { display:block; }
    `;
    shell.appendChild(style);

    const list = document.createElement("div");
    list.className = "sr-list" + (this._wrap ? " wrapped" : "");

    for (const p of this._rows) {
      const row = document.createElement("button");
      row.type = "button";
      row.className = "sr-row";
      row.title = p;
      // Flag the row as a file source so the shared custom drag pipeline
      // (init-drag-system) picks it up: drag shows the bitmap ghost and a
      // drop in the grid positions a file-viewer tab; a plain click still
      // opens the preview in the next cell (drags suppress that trailing
      // click via the pipeline's data-file-path suppression).
      row.setAttribute("data-file-path", p);
      const icon = document.createElement("span");
      icon.className = "sr-row-icon";
      icon.textContent = "\u{1f4c4}"; // 📄
      const text = document.createElement("span");
      text.className = "sr-row-text";
      text.textContent = p;
      row.appendChild(icon);
      row.appendChild(text);
      row.addEventListener("click", () => {
        document.dispatchEvent(
          new CustomEvent("openp41ge:open-search-result-file", {
            detail: { sourceTabId: this.tabId, path: p },
          }),
        );
      });
      list.appendChild(row);
    }

    this._list = list;
    this._bodyHost = list;
    shell.appendChild(list);

    // Bottom bar with the line-wrap toggle (mirrors the log viewer / editor).
    const bottom = document.createElement("div");
    bottom.className = "sr-bottom";
    const spacer = document.createElement("span");
    spacer.className = "sr-spacer";
    const wrapBtn = document.createElement("button");
    wrapBtn.type = "button";
    wrapBtn.className = "sr-wrap-btn" + (this._wrap ? " active" : "");
    wrapBtn.title = "Toggle line wrapping";
    wrapBtn.setAttribute("aria-label", "Toggle line wrapping");
    wrapBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><path d="M2 4h12"/><path d="M2 8h8"/><path d="M2 12h6"/><path d="M13 10l2 2-2 2"/><path d="M15 12h-5"/></svg>`;
    wrapBtn.addEventListener("click", () => this._toggleWrap(wrapBtn));
    bottom.appendChild(spacer);
    bottom.appendChild(wrapBtn);
    shell.appendChild(bottom);

    container.appendChild(shell);
  }

  private _toggleWrap(btn: HTMLButtonElement): void {
    this._wrap = !this._wrap;
    if (this._list) this._list.classList.toggle("wrapped", this._wrap);
    btn.classList.toggle("active", this._wrap);
  }

  unmount(): void {
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
        ? (safeParse(state.filePath) as SearchResultsContext)
        : undefined;
    this._toolName = (state.toolName as string) || parsed?.toolName || "";
    this._argsString = (state.argsString as string) || parsed?.argsString || "";
    this._result = (state.result as string) || parsed?.result || "";
    this._hint = (state.hint as string) || parsed?.hint || "";
  }
}

function safeParse(json: string): unknown {
  try {
    return JSON.parse(json);
  } catch {
    return undefined;
  }
}
