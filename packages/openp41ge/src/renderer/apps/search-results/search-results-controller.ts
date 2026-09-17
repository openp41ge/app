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

    // Header: the query and how many matches were found.
    const header = document.createElement("div");
    header.style.cssText =
      "flex-shrink:0;padding:10px 14px;border-bottom:1px solid var(--border-color,#2a2a2a);" +
      "display:flex;align-items:baseline;gap:8px;background:var(--bg-secondary,#1a1a1a);";
    const q = this._query();
    const qEl = document.createElement("span");
    qEl.textContent = q ? `"${q}"` : "Search results";
    qEl.style.cssText = "font-size:13px;font-weight:600;color:var(--text-primary,#d4d4d4);";
    const countEl = document.createElement("span");
    countEl.textContent = `${this._rows.length} file${this._rows.length === 1 ? "" : "s"}`;
    countEl.style.cssText = "font-size:11px;color:var(--text-muted,#888);";
    header.appendChild(qEl);
    header.appendChild(countEl);
    shell.appendChild(header);

    const list = document.createElement("div");
    list.style.cssText =
      "flex:1;min-height:0;overflow:auto;padding:4px 0;font-family:" +
      "var(--font-mono,'JetBrains Mono',monospace);font-size:12px;";

    for (const p of this._rows) {
      const row = document.createElement("button");
      row.type = "button";
      row.className = "sr-row";
      row.title = p;
      row.style.cssText =
        "display:flex;align-items:center;gap:8px;width:100%;text-align:left;padding:5px 14px;" +
        "background:transparent;border:none;cursor:pointer;color:var(--text-secondary,#bbb);" +
        "font:inherit;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;";
      row.addEventListener("mouseenter", () => {
        row.style.background = "var(--bg-active,#2d2d2d)";
        row.style.color = "var(--text-primary,#e4e4e4)";
      });
      row.addEventListener("mouseleave", () => {
        row.style.background = "transparent";
        row.style.color = "var(--text-secondary,#bbb)";
      });
      const icon = document.createElement("span");
      icon.textContent = "\u{1f4c4}"; // 📄
      icon.style.cssText = "flex-shrink:0;font-size:12px;opacity:0.8;";
      const text = document.createElement("span");
      text.textContent = p;
      text.style.cssText = "overflow:hidden;text-overflow:ellipsis;";
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

    this._bodyHost = list;
    shell.appendChild(list);
    container.appendChild(shell);
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

  private _query(): string {
    let args: Record<string, unknown> = {};
    try {
      args = this._argsString ? JSON.parse(this._argsString) : {};
    } catch {
      args = {};
    }
    return typeof args.query === "string" ? args.query : "";
  }
}

function safeParse(json: string): unknown {
  try {
    return JSON.parse(json);
  } catch {
    return undefined;
  }
}
