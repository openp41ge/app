/**
 * CommitSearchSystemTabController — system tab controller for the Git panel
 * (registration id `"git"`), repurposed as a commit search/query UI.
 *
 * Search across connected repos by commit message or changed-file path, with
 * hierarchical results:
 *     commit rows (repo · short hash · message · author) ⊃ file rows
 * (path · +adds/−dels), expandable like the explorer repo → worktree nesting.
 *
 * Interactions:
 *   - Enter / auto-debounced input runs the search; Escape clears then blurs.
 *   - Single-click a commit → openp41ge:open-commit (unpinned preview git tab);
 *     double-click pins. File sub-rows open the working-tree file (unpinned
 *     preview), identical to explorer file single-click.
 *   - Rows are draggable via the unified bitmap pipeline (GitEntryDragSource):
 *     dropping on the grid opens the repo's git-content pane (action by drop
 *     location).
 *
 * Data access goes through the CommitSearchModel interface (public `_searchModel`
 * property for test injection — production IpcCommitSearchModel, tests
 * TestCommitSearchModel). Loads repoNames via workspaceController.listRepos.
 */

import type { SystemTabController } from "../../controllers/types";
import type { CommitSearchModel } from "../../models/commit-search-model";
import { IpcCommitSearchModel } from "../../models/commit-search-model";
import type { SearchResultCommit } from "openp41ge-git";

/** 250ms input debounce — search as you type without spamming IPC per key. */
const DEBOUNCE_MS = 250;

interface RepoOption {
  name: string;
}

export class CommitSearchSystemTabController implements SystemTabController {
  readonly tabId: string;
  readonly appType = "git";

  /** DI seam — production IpcCommitSearchModel; tests inject TestCommitSearchModel. */
  _searchModel: CommitSearchModel = new IpcCommitSearchModel();

  private _viewElement: HTMLElement | null = null;
  private _input: HTMLInputElement | null = null;
  private _scopeSelect: HTMLSelectElement | null = null;
  private _filesToggle: HTMLButtonElement | null = null;
  private _results: HTMLElement | null = null;
  private _footer: HTMLElement | null = null;

  private _repos: RepoOption[] = [];
  private _expandedCommits = new Set<string>(); // "repoName<sep>shortHash"
  private _expandedFiles = new Set<string>(); // "repoName<sep>shortHash<sep>path"
  private _debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private _searchToken = 0;
  /** Last search results (cache) — expansion toggles re-render, not refetch. */
  private _lastCommits: SearchResultCommit[] | null = null;

  // Commit-message search is always on; the files icon toggles changed-file-
  // path search on top of it (on = combined 'all', off = messages only).
  private _searchFiles = true;

  /** Keep-alive (SystemTabController.setVisible). */
  private _suspended = false;
  private _suspendDirty = false;
  private _onGitRefresh: (() => void) | null = null;

  constructor(tabId: string) {
    this.tabId = tabId;
  }

  mount(container: HTMLElement): Promise<void> | void {
    const wrapper = document.createElement("div");
    wrapper.dataset.systemTab = "git";
    Object.assign(wrapper.style, {
      display: "flex",
      flexDirection: "column",
      width: "100%",
      height: "100%",
      overflow: "hidden",
    });

    // ── Search header: icon toggles (above) + full-width input + scope ──
    const searchBox = document.createElement("div");
    Object.assign(searchBox.style, {
      padding: "8px 10px",
      display: "flex",
      flexDirection: "column",
      gap: "6px",
      flexShrink: "0",
      borderBottom: "1px solid var(--divider,#2a2a2a)",
    });

    // Single row: full-width input with the icon toggles right-aligned beside it.
    const searchInputRow = document.createElement("div");
    Object.assign(searchInputRow.style, {
      display: "flex",
      alignItems: "center",
      gap: "4px",
    });

    const FILES_ICON =
      '<svg xmlns="http://www.w3.org/2000/svg" height="18" viewBox="0 -960 960 960" width="18" fill="currentColor"><path d="M200-800v241-1 400-640 200-200Zm0 720q-33 0-56.5-23.5T120-160v-640q0-33 23.5-56.5T200-880h320l240 240v100q-19-8-39-12.5t-41-6.5v-41H480v-200H200v640h241q16 24 36 44.5T521-80H200Zm531-149q29-29 29-71t-29-71q-29-29-71-29t-71 29q-29 29-29 71t29 71q29 29 71 29t71-29ZM864-40 756-148q-21 14-45.5 21t-50.5 7q-75 0-127.5-52.5T480-300q0-75 52.5-127.5T660-480q75 0 127.5 52.5T840-300q0 26-7 50.5T812-204L920-96l-56 56Z"/></svg>';

    const makeIconToggle = (icon: string, title: string): HTMLButtonElement => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.dataset.searchInto = "files";
      btn.title = title;
      btn.innerHTML = icon; // SVG uses currentColor — grey off, white on.
      Object.assign(btn.style, {
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: "18px",
        height: "18px",
        padding: "0",
        cursor: "pointer",
        background: "transparent",
        border: "1px solid transparent",
        borderRadius: "4px",
        color: "var(--text-secondary,#888)",
      });
      return btn;
    };
    const filesToggle = makeIconToggle(FILES_ICON, "Search changed file paths");

    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = "Search commits…";
    input.setAttribute("spellcheck", "false");
    Object.assign(input.style, {
      flex: "1",
      minWidth: "0",
      boxSizing: "border-box",
      height: "26px",
      padding: "0", // searchBox's own padding supplies the horizontal space
      fontSize: "12px",
      color: "var(--text-primary,#ccc)",
      background: "transparent", // no field chrome — flush with the header padding
      border: "none",
      outline: "none",
    });

    searchInputRow.appendChild(input);
    searchInputRow.appendChild(filesToggle);
    searchBox.appendChild(searchInputRow);

    const scope = document.createElement("select");
    Object.assign(scope.style, {
      width: "100%",
      boxSizing: "border-box",
      height: "24px",
      fontSize: "11px",
      color: "var(--text-secondary,#aaa)",
      background: "var(--bg-secondary,#252526)",
      border: "1px solid var(--divider,#333)",
      borderRadius: "4px",
      outline: "none",
      textOverflow: "ellipsis",
    });
    searchBox.appendChild(scope);

    wrapper.appendChild(searchBox);

    // ── Results list ──────────────────────────────────────────────────
    const results = document.createElement("div");
    Object.assign(results.style, {
      flex: "1",
      minHeight: "0",
      overflowY: "auto",
      overflowX: "hidden",
      display: "flex",
      flexDirection: "column",
    });
    wrapper.appendChild(results);

    // ── Footer ────────────────────────────────────────────────────────
    const footer = document.createElement("div");
    Object.assign(footer.style, {
      flexShrink: "0",
      height: "24px",
      display: "flex",
      alignItems: "center",
      padding: "0 8px",
      borderTop: "1px solid var(--divider,#333)",
      fontSize: "12px",
      color: "var(--text-secondary,#999)",
      background: "var(--bg-secondary,#252526)",
      gap: "6px",
    });
    wrapper.appendChild(footer);

    container.appendChild(wrapper);
    this._viewElement = wrapper;
    this._input = input;
    this._scopeSelect = scope;
    this._filesToggle = filesToggle;
    this._results = results;
    this._footer = footer;

    // ── Wire events ───────────────────────────────────────────────────
    input.addEventListener("input", () => {
      this._debounce();
    });
    input.addEventListener("keydown", (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        this._schedule();
        void this._runSearch();
      } else if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        if (input.value) {
          input.value = "";
          this._renderEmptyQuery();
        } else {
          input.blur();
        }
      } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        this._moveFocus(e.key === "ArrowDown" ? 1 : -1, e);
      }
    });
    scope.addEventListener("change", () => this._debounce());
    filesToggle.addEventListener("click", () => this._toggleSearch());

    // Both icons default on → render them white (enabled) immediately.
    this._applyToggleStyles();

    this._renderScopeOptions();

    // Load repoNames for the scope select, then render states.
    void this._loadRepos();

    // Live refreshes (workspace/git changes) — deferred while hidden.
    this._onGitRefresh = () => {
      if (this._suspended) {
        this._suspendDirty = true;
        return;
      }
      void this._loadRepos();
    };
    document.addEventListener("git:refresh", this._onGitRefresh);

    // Autofocus the search input on open (clone-dialog pattern).
    requestAnimationFrame(() => input.focus());

    this._renderEmptyQuery();
  }

  unmount(): void {
    if (this._debounceTimer) {
      clearTimeout(this._debounceTimer);
      this._debounceTimer = null;
    }
    if (this._onGitRefresh) {
      document.removeEventListener("git:refresh", this._onGitRefresh);
      this._onGitRefresh = null;
    }
    this._searchToken += 1;
    if (this._viewElement && this._viewElement.parentNode) {
      this._viewElement.remove();
    }
    this._viewElement = null;
    this._input = null;
    this._scopeSelect = null;
    this._filesToggle = null;
    this._results = null;
    this._footer = null;
  }

  /** Keep-alive: pause background work (reloads/debounce) while hidden. */
  setVisible(visible: boolean): void {
    this._suspended = !visible;
    if (visible && this._suspendDirty) {
      this._suspendDirty = false;
      void this._loadRepos();
    }
  }

  // ── Repo scope loading ────────────────────────────────────────────────

  private async _loadRepos(): Promise<void> {
    try {
      const repos = (await window.openp41ge.workspaceController.listRepos()) as RepoOption[];
      this._repos = repos;
      this._renderScopeOptions();
      // Repo availability changed the empty-state hint — re-render it once
      // repos arrive (they load asynchronously after first paint).
      if (!this._input?.value.trim()) {
        this._renderEmptyQuery();
      }
    } catch {
      // Non-fatal — the "All repos" scope still works.
      this._repos = [];
    }
  }

  private _renderScopeOptions(): void {
    const scope = this._scopeSelect;
    if (!scope) return;
    const previous = scope.value;
    scope.replaceChildren();
    const all = document.createElement("option");
    all.value = "";
    all.textContent = "All repos";
    scope.appendChild(all);
    for (const repo of this._repos) {
      const opt = document.createElement("option");
      opt.value = repo.name;
      opt.textContent = repo.name;
      scope.appendChild(opt);
    }
    if (previous && this._repos.some((r) => r.name === previous)) {
      scope.value = previous;
    }
  }

  // ── Search-into toggles ───────────────────────────────────────────────

  private _toggleSearch(): void {
    this._searchFiles = !this._searchFiles;
    this._applyToggleStyles();
    if (this._input?.value.trim()) {
      this._debounce();
    } else {
      this._renderEmptyQuery();
    }
  }

  private _applyToggleStyles(): void {
    const btn = this._filesToggle;
    if (!btn) return;
    // Grey when off, white (enabled) when on — the SVG uses currentColor.
    btn.style.color = this._searchFiles ? "#e3e3e3" : "var(--text-secondary,#888)";
  }

  // ── Search execution ──────────────────────────────────────────────────

  private _debounce(): void {
    if (this._debounceTimer) clearTimeout(this._debounceTimer);
    this._debounceTimer = setTimeout(() => {
      this._debounceTimer = null;
      void this._runSearch();
    }, DEBOUNCE_MS);
  }

  private _schedule(): void {
    if (this._debounceTimer) {
      clearTimeout(this._debounceTimer);
      this._debounceTimer = null;
    }
  }

  private async _runSearch(): Promise<void> {
    const input = this._input;
    const results = this._results;
    if (!input || !results) return;
    const query = input.value.trim();
    if (!query) {
      this._renderEmptyQuery();
      return;
    }

    const token = ++this._searchToken;
    const repoName = this._scopeSelect?.value || null;
    // Commits (messages) are always searched; files add the changed-file-path
    // dimension when the toggle is on.
    const mode = this._searchFiles ? "all" : "message";

    results.replaceChildren(this._message("Searching…", "var(--text-secondary,#999)"));
    if (this._footer) {
      this._footer.textContent = "";
    }

    try {
      const commits = await this._searchModel.search(repoName, { query, in: mode, limit: 100 });
      if (token !== this._searchToken) return; // a newer search superseded this one
      this._lastCommits = commits;
      this._renderResults(commits, query);
    } catch (err: unknown) {
      if (token !== this._searchToken) return;
      const msg = err instanceof Error ? err.message : String(err);
      results.replaceChildren();
      results.appendChild(this._message(`Search failed: ${msg}`, "var(--error,#e53e3e)"));
    }
  }

  // ── Rendering ─────────────────────────────────────────────────────────

  private _message(text: string, color: string): HTMLElement {
    const el = document.createElement("div");
    el.textContent = text;
    Object.assign(el.style, {
      padding: "8px 10px",
      fontSize: "12px",
      fontStyle: "italic",
      color,
    });
    return el;
  }

  private _renderEmptyQuery(): void {
    const results = this._results;
    if (!results) return;
    results.replaceChildren();
    if (this._repos.length === 0) {
      results.appendChild(this._message("No repos", "var(--text-secondary,#999)"));
    } else {
      results.appendChild(
        this._message(
          "Type to search commit messages or changed file paths",
          "var(--text-muted,#777)",
        ),
      );
    }
    if (this._footer) this._footer.textContent = "";
  }

  private _renderResults(commits: SearchResultCommit[], _query: string): void {
    const results = this._results;
    if (!results) return;
    results.replaceChildren();

    if (commits.length === 0) {
      results.appendChild(this._message("No matching commits", "var(--text-muted,#777)"));
      if (this._footer) this._footer.textContent = "";
      return;
    }

    for (const commit of commits) {
      results.appendChild(this._commitRow(commit));
    }

    if (this._footer) {
      this._footer.textContent = `${commits.length} result${commits.length === 1 ? "" : "s"}`;
    }
  }

  private _key(repoName: string, shortHash: string): string {
    return `${repoName}:${shortHash}`;
  }

  private _commitRow(commit: SearchResultCommit): HTMLElement {
    const key = this._key(commit.repoName, commit.shortHash);
    const expanded = this._expandedCommits.has(key);

    const row = document.createElement("div");
    row.className = "commit-result-row";
    row.tabIndex = 0;
    row.setAttribute("data-commit-row", "");
    row.setAttribute("data-repo-row", ""); // unified bitmap drag surface
    row.setAttribute("data-repo", commit.repoName);
    row.setAttribute("draggable", "true");

    Object.assign(row.style, {
      display: "flex",
      flexDirection: "column",
      userSelect: "none",
      cursor: "pointer",
    });

    const head = document.createElement("div");
    Object.assign(head.style, {
      display: "flex",
      alignItems: "center",
      gap: "6px",
      height: "28px",
      padding: "0 10px 0 6px",
      fontSize: "12px",
      color: "var(--text-primary,#ccc)",
    });

    // The chevron toggles the file sub-rows; the rest of the row opens the
    // preview git tab (single-click unpinned, double-click pinned).
    const chevron = document.createElement("span");
    chevron.textContent = expanded ? "\u25BE" : "\u25B8";
    Object.assign(chevron.style, {
      width: "14px",
      flexShrink: "0",
      fontSize: "10px",
      color: "var(--text-secondary,#888)",
      textAlign: "center",
    });
    chevron.addEventListener("click", (e: MouseEvent) => {
      e.stopPropagation();
      if (this._expandedCommits.has(key)) this._expandedCommits.delete(key);
      else {
        this._expandedCommits.add(key);
        this._expandedFiles.delete(key);
      }
      this._rerender();
    });
    head.appendChild(chevron);

    const repo = document.createElement("span");
    repo.textContent = commit.repoName;
    Object.assign(repo.style, {
      flexShrink: "0",
      fontSize: "10px",
      color: "var(--text-secondary,#888)",
    });
    head.appendChild(repo);

    const hash = document.createElement("span");
    hash.textContent = commit.shortHash;
    Object.assign(hash.style, {
      flexShrink: "0",
      fontSize: "10px",
      color: "var(--accent,#4a9eff)",
    });
    head.appendChild(hash);

    const message = document.createElement("span");
    message.textContent = commit.message;
    message.title = commit.message;
    Object.assign(message.style, {
      flex: "1",
      minWidth: "0",
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
      color: "var(--text-primary,#ccc)",
    });
    head.appendChild(message);

    const meta = document.createElement("span");
    meta.textContent = commit.relativeDate || commit.date || commit.author;
    Object.assign(meta.style, {
      flexShrink: "0",
      fontSize: "10px",
      color: "var(--text-muted,#666)",
    });
    head.appendChild(meta);

    row.appendChild(head);

    // Click: single = preview (unpinned), double = pin. Space/Enter = preview.
    // File sub-rows stopPropagation so they never trigger the commit open.
    row.addEventListener("click", (e: MouseEvent) => {
      e.stopPropagation();
      this._emitOpenCommit(commit, false);
    });
    row.addEventListener("dblclick", (e: MouseEvent) => {
      e.stopPropagation();
      this._emitOpenCommit(commit, true);
    });
    row.addEventListener("keydown", (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        this._emitOpenCommit(commit, e.key === "Enter");
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        if (this._expandedCommits.has(key)) return;
        this._expandedCommits.add(key);
        this._expandedFiles.delete(key);
        this._rerender();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        if (!this._expandedCommits.has(key)) return;
        this._expandedCommits.delete(key);
        this._rerender();
      }
    });

    if (expanded) {
      const fileRows = this._fileRows(commit);
      if (fileRows.length === 0) {
        const none = this._message("No changed files", "var(--text-muted,#777)");
        Object.assign(none.style, { padding: "2px 10px 2px 20px", fontSize: "11px" });
        row.appendChild(none);
      } else {
        for (const fr of fileRows) row.appendChild(fr);
      }
    }

    return row;
  }

  private _fileRows(commit: SearchResultCommit): HTMLElement[] {
    const out: HTMLElement[] = [];
    for (const file of commit.files) {
      const row = document.createElement("div");
      row.className = "commit-file-row";
      row.tabIndex = 0;
      row.setAttribute("data-worktree-row", ""); // unified bitmap drag surface
      row.setAttribute("data-repo", commit.repoName);
      row.setAttribute("data-branch", commit.shortHash);
      row.setAttribute("draggable", "true");

      Object.assign(row.style, {
        display: "flex",
        alignItems: "center",
        gap: "6px",
        height: "24px",
        padding: "0 10px 0 22px",
        fontSize: "11px",
        cursor: "pointer",
        color: "var(--text-secondary,#aaa)",
        userSelect: "none",
      });

      const pad = document.createElement("span");
      pad.textContent = "";
      Object.assign(pad.style, { width: "14px", flexShrink: "0" });
      row.appendChild(pad);

      const name = document.createElement("span");
      name.textContent = file.path;
      name.title = file.path;
      Object.assign(name.style, {
        flex: "1",
        minWidth: "0",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
      });
      row.appendChild(name);

      const counts = document.createElement("span");
      counts.textContent = `${file.additions > 0 ? "+" + file.additions : ""}${
        file.deletions > 0 ? (file.additions > 0 ? " " : "") + "\u2212" + file.deletions : ""
      }`;
      Object.assign(counts.style, {
        flexShrink: "0",
        fontSize: "10px",
        color: "var(--text-muted,#777)",
      });
      row.appendChild(counts);

      row.addEventListener("click", (e: MouseEvent) => {
        e.stopPropagation();
        // Working-tree file preview (v1) — file-at-revision is an open question.
        document.dispatchEvent(
          new CustomEvent("openp41ge:open-file", {
            detail: {
              path: file.path,
              name: file.path.split("/").pop() ?? file.path,
              pinned: false,
            },
          }),
        );
      });
      row.addEventListener("dblclick", (e: MouseEvent) => {
        e.stopPropagation();
        document.dispatchEvent(
          new CustomEvent("openp41ge:open-file", {
            detail: {
              path: file.path,
              name: file.path.split("/").pop() ?? file.path,
              pinned: true,
            },
          }),
        );
      });
      row.addEventListener("keydown", (e: KeyboardEvent) => {
        if (e.key === "Enter") {
          e.preventDefault();
          document.dispatchEvent(
            new CustomEvent("openp41ge:open-file", {
              detail: {
                path: file.path,
                name: file.path.split("/").pop() ?? file.path,
                pinned: true,
              },
            }),
          );
        }
      });

      out.push(row);
    }
    return out;
  }

  private _emitOpenCommit(commit: SearchResultCommit, pinned: boolean): void {
    document.dispatchEvent(
      new CustomEvent("openp41ge:open-commit", {
        detail: {
          repoName: commit.repoName,
          hash: commit.hash,
          pinned,
        },
      }),
    );
  }

  /** Rebuild the results in place (e.g. after expand/collapse) without refetching. */
  private _rerender(): void {
    if (this._lastCommits) this._renderResults(this._lastCommits, "");
  }

  // ── Keyboard navigation across top-level commit rows ─────────────────

  private _moveFocus(delta: number, e: KeyboardEvent): void {
    const results = this._results;
    if (!results) return;
    e.preventDefault();
    const rows = Array.from(results.querySelectorAll<HTMLElement>(".commit-result-row"));
    if (rows.length === 0) return;
    const active = document.activeElement as HTMLElement | null;
    let idx = active ? rows.indexOf(active) : -1;
    if (active && !rows.includes(active)) {
      // Find the containing commit row if focus is on a nested file row.
      const parent = active.closest?.(".commit-result-row");
      idx = parent instanceof HTMLElement ? rows.indexOf(parent) : -1;
    }
    const next = Math.min(rows.length - 1, Math.max(0, (idx < 0 ? 0 : idx) + delta));
    rows[next].focus();
  }
}
