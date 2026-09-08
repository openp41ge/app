/**
 * <openp41ge-repo-tree-item> — single repo header with expandable worktree items (Lit).
 *
 * Rendering orchestration component. Delegates async data loading to
 * WorktreeFileLoader and persistence to DirPersistenceService.
 *
 * Events (bubbling):
 *   repo-add-worktree  — { repoName: string, branch: string }
 *   repo-toggle-expand — { repoName: string, expanded: boolean }
 *   worktree-files-toggle  — { repoName: string, branch: string, expanded: boolean }
 *   dir-toggle-expand      — { branch: string, path: string, expanded: boolean }
 *   file-open          — { path: string, name: string, mode: string }
 */

import { LitElement, html, nothing, type TemplateResult } from "lit";
import { property, state } from "lit/decorators.js";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import { plusIconThick, refreshIcon } from "../icons";
import { classifyWorktree, worstOf, worktreeStatusLabel } from "../services/worktree-status";
import { matchesNameFilter } from "../services/explorer-filter";
import {
  WorktreeFileLoader,
  DirPersistenceService,
  type WorktreeData,
  type FileEntry,
} from "openp41ge-filesystem";
import type { TreeNode, IconRenderer } from "openp41ge-uikit";
import { highlightLine, languageFromPath } from "openp41ge-uikit";
import { getThemeById, darkPlusTheme } from "openp41ge-uikit/theme";
import { appServices } from "../app";
import "openp41ge-uikit";

export type { WorktreeData, FileEntry };

export class Openp41geRepoTreeItem extends LitElement {
  protected createRenderRoot(): HTMLElement | DocumentFragment {
    return this;
  }

  @property({ attribute: false })
  repoName = "";

  @property({ attribute: false })
  repoUrl = "";

  @property({ attribute: false })
  worksetId = "";

  @property({ attribute: false })
  worktrees: WorktreeData[] = [];

  @property({ attribute: false })
  filter = "";

  @property({ type: Boolean })
  filterRegex = false;

  @property({ type: Boolean })
  filterCase = false;

  @property({ type: Boolean })
  editMode = false;

  @property({ attribute: false })
  contentMatches: Map<string, FileContentSearchResult> = new Map();

  @state() private _expanded = false;
  @state() private _showingAddWorktree = false;
  @state() private _addWorktreeName = "";

  /** True when the add-worktree input value matches an existing worktree name. */
  private get _isDuplicateWorktreeName(): boolean {
    const name = this._addWorktreeName.trim().toLowerCase();
    if (!name) return false;
    return this.worktrees.some((wt) => wt.branch.toLowerCase() === name);
  }

  /** Whether a name passes the active filter (empty filter matches all). */
  private _matchesFilter(name: string): boolean {
    return matchesNameFilter(name, this.filter, this.filterRegex, this.filterCase);
  }

  /** Worktrees narrowed by the active filter (empty filter → all). */
  private get _filteredWorktrees(): WorktreeData[] {
    const q = this.filter.trim();
    if (!q) return this.worktrees;
    return this.worktrees.filter((wt) => {
      if (this._matchesFilter(wt.branch)) return true;
      // A worktree with content matches is surfaced even when its branch
      // name doesn't match, so the user can see the file rows that matched.
      return this._worktreeHasContentMatch(wt);
    });
  }
  @state() private _expandedWorktrees = new Set<string>();
  @state() private _expandedDirs = new Map<string, Set<string>>();
  @state() private _pullingBranches = new Set<string>();
  /** Branches whose content-match directory chains have already been revealed. */
  @state() private _revealedContentBranches = new Set<string>();
  /** shortName → ahead/behind counters, loaded once per repo to show sync warnings. */
  private _branchSync = new Map<string, { ahead: number; behind: number }>();
  private _syncKnown = false;
  private _syncRequested = false;

  // Single completion timestamp (branch → Date.now()) so green flash persists
  private _pullCompleted = new Map<string, number>();

  // Extracted services
  private _fileLoader = new WorktreeFileLoader();
  private _persistence = new DirPersistenceService();

  connectedCallback(): void {
    super.connectedCallback();
    const restored = this._persistence.loadFromGlobalState(this.repoName);
    this._expanded = restored.expanded;
    this._expandedWorktrees = restored.expandedWorktrees;
    // _expandedDirs will be populated by _loadRestoredFiles once worktrees arrive
    this._loadSync();
  }

  firstUpdated(): void {
    queueMicrotask(() => this._loadRestoredFiles());
  }

  updated(changedProperties: Map<string | number | symbol, unknown>): void {
    this._loadSync();
    if (changedProperties.has("worktrees")) {
      queueMicrotask(() => this._loadRestoredFiles());
    }
    if (
      changedProperties.has("filter") ||
      changedProperties.has("filterRegex") ||
      changedProperties.has("filterCase") ||
      changedProperties.has("contentMatches")
    ) {
      this._syncAutoExpand();
    }
  }

  /** Whether the active filter narrows the tree (empty query = no filter). */
  private get _isFilterActive(): boolean {
    return Boolean(this.filter.trim());
  }

  /** Load files for worktrees that match the active filter and aren't loaded yet. */
  private _syncAutoExpand(): void {
    const q = this.filter.trim();
    if (!q) return;
    for (const wt of this._filteredWorktrees) {
      if (!wt.exists) continue;
      if (this._fileLoader.isWorktreeLoaded(wt.branch)) {
        // Already loaded — just reveal the content-match directory chains.
        if (wt.path) this._revealContentDirs(wt.branch, wt.path);
        continue;
      }
      if (this._fileLoader.isLoadingWorktree(wt.branch)) continue;
      const path = wt.path || `${this.repoName}/${wt.branch}`;
      this._expandedWorktrees.add(wt.branch);
      void this._fileLoader.expandWorktreeFiles(wt.branch, path, this.repoName, () => {
        if (this.isConnected) this.requestUpdate();
        if (wt.path) this._revealContentDirs(wt.branch, wt.path);
      });
    }
    this.requestUpdate();
  }

  /** Whether any content match lives under this worktree's root path. */
  private _worktreeHasContentMatch(wt: WorktreeData): boolean {
    if (this.contentMatches.size === 0 || !wt.path) return false;
    const prefix = wt.path.endsWith("/") ? wt.path : wt.path + "/";
    for (const p of this.contentMatches.keys()) {
      if (p.startsWith(prefix)) return true;
    }
    return false;
  }

  /** Whether any content match lives under the given directory path. */
  private _dirContainsMatch(dirPath: string): boolean {
    if (this.contentMatches.size === 0) return false;
    const prefix = dirPath.endsWith("/") ? dirPath : dirPath + "/";
    for (const p of this.contentMatches.keys()) {
      if (p.startsWith(prefix)) return true;
    }
    return false;
  }

  /** Build the match sub-list nodes for a file that has content matches. */
  private _contentMatchNodes(branch: string, filePath: string): TreeNode[] | undefined {
    const res = this.contentMatches.get(filePath);
    if (!res || res.matches.length === 0) return undefined;
    // Shift the row back one indent level so it aligns near the file's name
    // instead of sitting a full level deeper (see reduceIndent in the tree).
    const maxDigits = Math.max(1, ...res.matches.map((m) => String(m.lineNumber ?? 1).length));
    const language = languageFromPath(filePath);
    const query = this.filter.trim();
    return res.matches.map((m, i) => ({
      id: `${filePath}:match:${i}`,
      label: m.lineText,
      showChevron: false,
      draggable: false,
      reduceIndent: 16,
      meta: {
        branch,
        filePath,
        match: true,
        line: m.lineNumber,
        column: m.column,
        matchText: m.lineText.trim(),
      },
      renderLabel: () => html`
        <span class="cm-match-row">
          <span class="cm-match-gutter" style=${`min-width:${maxDigits}ch`}>${m.lineNumber}</span>
          <span class="cm-match-code"
            >${unsafeHTML(
              highlightLine(m.lineText.replace(/\s+$/, ""), {
                language,
                query,
                regex: this.filterRegex,
                caseSensitive: this.filterCase,
              }),
            )}</span
          >
        </span>
      `,
    }));
  }

  /** Load the ancestor directory chain for each content match under a worktree. */
  private _revealContentDirs(branch: string, worktreePath: string): void {
    if (this.contentMatches.size === 0 || !worktreePath) return;
    if (this._revealedContentBranches.has(branch)) return;
    const root = worktreePath.endsWith("/") ? worktreePath : worktreePath + "/";
    for (const filePath of this.contentMatches.keys()) {
      if (!filePath.startsWith(root)) continue;
      let dir = filePath.substring(0, filePath.lastIndexOf("/"));
      const chain: string[] = [];
      while (dir && dir.startsWith(root) && dir.length > root.length) {
        chain.push(dir);
        dir = dir.substring(0, dir.lastIndexOf("/"));
      }
      for (const d of chain.reverse()) {
        if (this._fileLoader.dirContents.has(d)) continue;
        if (this._fileLoader.isLoadingDir(d)) continue;
        void this._fileLoader.expandDir(branch, d, () => {
          if (this.isConnected) this.requestUpdate();
        });
      }
    }
    this._revealedContentBranches.add(branch);
  }

  /** Load ahead/behind counters for this repo's branches to show sync warnings. */
  private _loadSync(): void {
    if (this._syncRequested || !this.repoName || !window.openp41ge?.workspaceController) return;
    this._syncRequested = true;
    window.openp41ge.workspaceController
      .getBranches(this.repoName)
      .then((entries) => {
        if (!this.isConnected) return;
        this._branchSync.clear();
        for (const e of entries) {
          if (!e?.name && !e?.shortName) continue;
          this._branchSync.set(e.shortName ?? e.name, {
            ahead: e.ahead ?? 0,
            behind: e.behind ?? 0,
          });
        }
        this._syncKnown = true;
        this.requestUpdate();
      })
      .catch(() => {
        // No local clone or repo error — warnings still surface for missing worktrees.
        this._syncKnown = false;
      });
  }

  /** Warning indicator for a single worktree row (ahead/behind or missing folder). */
  private _wtWarn(wt: WorktreeData): TemplateResult | typeof nothing {
    const info = this._wtSyncInfo(wt);
    if (info.state === "ok" || info.state === "unknown") return nothing;
    return html`
      <span
        class="shrink-0 flex items-center cursor-pointer wt-warn"
        style="color:var(--text-warning,#e5a50a)"
        title=${worktreeStatusLabel(info)}
        @click=${(e: MouseEvent) => this._warnClick(e)}
      >
        <openp41ge-icon name="warning" size="11"></openp41ge-icon>
      </span>
    `;
  }

  /**
   * Warning icon → open the Workspaces overlay at this repo's status bar. The
   * repo-status UI (divergence, missing worktree re-create) lives there; the
   * explorer just navigates. Stopping propagation keeps the row's own click
   * (expand files / toggle repo) from firing.
   */
  private _warnClick(e: Event): void {
    e.stopPropagation();
    document.dispatchEvent(
      new CustomEvent("openp41ge:focus-workspace-repo", {
        detail: { repoName: this.repoName },
      }),
    );
  }

  /** Aggregate warning indicator shown on the repo header row. */
  private _repoWarn(): TemplateResult | typeof nothing {
    const infos = this.worktrees.map((wt) => this._wtSyncInfo(wt));
    const worst = worstOf(infos);
    if (worst.state === "ok" || worst.state === "unknown") return nothing;
    return html`
      <span
        class="shrink-0 flex items-center cursor-pointer wt-warn"
        style="color:var(--text-warning,#e5a50a)"
        title=${`${infos.length} worktree(s): ${worktreeStatusLabel(worst)}`}
        @click=${(e: MouseEvent) => this._warnClick(e)}
      >
        <openp41ge-icon name="warning" size="11"></openp41ge-icon>
      </span>
    `;
  }

  private _wtSyncInfo(wt: WorktreeData) {
    const counts = this._branchSync.get(wt.branch);
    return classifyWorktree(
      counts?.ahead ?? 0,
      counts?.behind ?? 0,
      wt.exists,
      this._syncKnown && counts !== undefined,
    );
  }

  private async _loadRestoredFiles(): Promise<void> {
    if (!this._expanded) return;

    // Restore directory expansion from persistence (needs worktree paths)
    const restoredDirs = this._persistence.restoreDirExpansion(this.worktrees);
    if (restoredDirs) {
      for (const [branch, dirs] of restoredDirs) {
        this._expandedDirs.set(branch, dirs);
      }
    }

    const onUpdate = () => {
      if (!this.isConnected) return;
      this.requestUpdate();
    };

    await this._fileLoader.loadRestoredFiles(
      this._expandedWorktrees,
      this._expandedDirs,
      this.worktrees,
      this.repoName,
      onUpdate,
    );
  }

  private _toggleExpand(): void {
    this._expanded = !this._expanded;
    this.dispatchEvent(
      new CustomEvent("repo-toggle-expand", {
        bubbles: true,
        detail: { repoName: this.repoName, expanded: this._expanded },
      }),
    );
    this.requestUpdate();
  }

  private async _toggleWorktreeFiles(branch: string, path: string): Promise<void> {
    if (this._expandedWorktrees.has(branch)) {
      // Collapse — keep cached data for instant re-expand
      this._expandedWorktrees.delete(branch);
      this._expandedDirs.delete(branch);
      this._fileLoader.collapseWorktreeFiles(branch);
      this.dispatchEvent(
        new CustomEvent("worktree-files-toggle", {
          bubbles: true,
          detail: { repoName: this.repoName, branch, expanded: false },
        }),
      );
      this.requestUpdate();
      return;
    }

    // Expand — show stale cache immediately, refresh in background
    this._expandedWorktrees.add(branch);
    // Restore previously expanded directories from persistence
    const restoredDirs = this._persistence.restoreDirExpansion(this.worktrees);
    if (restoredDirs) {
      for (const [rb, dirs] of restoredDirs) {
        this._expandedDirs.set(rb, dirs);
      }
    }
    this.requestUpdate();

    await this._fileLoader.expandWorktreeFiles(branch, path, this.repoName, () => {
      if (!this.isConnected) return;
      this.requestUpdate();
    });

    this.dispatchEvent(
      new CustomEvent("worktree-files-toggle", {
        bubbles: true,
        detail: { repoName: this.repoName, branch, expanded: true },
      }),
    );
    this.requestUpdate();
  }

  private async _toggleDir(branch: string, dirPath: string): Promise<void> {
    const dirs = this._expandedDirs.get(branch);
    if (dirs && dirs.has(dirPath)) {
      // Collapse — keep cached data for instant re-expand
      dirs.delete(dirPath);
      if (dirs.size === 0) this._expandedDirs.delete(branch);
      this._fileLoader.collapseDir(branch, dirPath);
      this.dispatchEvent(
        new CustomEvent("dir-toggle-expand", {
          bubbles: true,
          detail: { branch, path: dirPath, expanded: false },
        }),
      );
      this.requestUpdate();
      return;
    }

    // Expand — show stale cache immediately, refresh in background
    const expandedDirs = this._expandedDirs.get(branch) ?? new Set();
    expandedDirs.add(dirPath);
    this._expandedDirs.set(branch, expandedDirs);
    this.requestUpdate();

    await this._fileLoader.expandDir(branch, dirPath, () => {
      if (!this.isConnected) return;
      this.requestUpdate();
    });

    this.dispatchEvent(
      new CustomEvent("dir-toggle-expand", {
        bubbles: true,
        detail: { branch, path: dirPath, expanded: true },
      }),
    );
    this.requestUpdate();
  }

  private _renderWorktree(wt: WorktreeData): TemplateResult {
    const isExpanded = this._expandedWorktrees.has(wt.branch);
    const isPulling = this._pullingBranches.has(wt.branch);
    const pullDoneTime = this._pullCompleted.get(wt.branch);
    const showGreen = pullDoneTime !== undefined && Date.now() - pullDoneTime < 2500;
    return html`
      <div class="relative bg-gutter h-[26px] pointer-events-none border-b border-[#232323]">
        <div
          draggable="true"
          data-worktree-row
          data-repo="${this.repoName}"
          data-branch="${wt.branch}"
          class="pointer-events-auto flex items-center h-[26px] px-2 pl-7 pr-3 cursor-pointer text-sm text-[#b0b0b0] gap-1 overflow-hidden transition-colors duration-100 wt-row-header"
          @click=${() => {
            const path = wt.path || `${this.repoName}/${wt.branch}`;
            this._toggleWorktreeFiles(wt.branch, path);
          }}
          @contextmenu=${(e: MouseEvent) => {
            e.preventDefault();
            e.stopPropagation();
            this.dispatchEvent(
              new CustomEvent("worktree-contextmenu", {
                bubbles: true,
                detail: {
                  repoName: this.repoName,
                  branch: wt.branch,
                  x: e.clientX,
                  y: e.clientY,
                },
              }),
            );
          }}
        >
          ${
            isPulling
              ? html`<div
                  class="absolute inset-0 bg-gradient-to-r from-[#2a6fd1] via-[transparent_50%] to-[#2a6fd1] bg-[length:200%_100%] animate-[pull-indeterminate_1.2s_linear_infinite] opacity-30 pointer-events-none"
                ></div>`
              : showGreen
                ? html`<div
                    class="absolute inset-0 bg-accent/25 transition-opacity duration-500 ease-out pointer-events-none"
                  ></div>`
                : ""
          }
          <span class="text-muted w-[10px] flex items-center justify-center"
            ><openp41ge-icon
              name=${isExpanded ? "chevron-down" : "chevron-right"}
              size="10"
            ></openp41ge-icon
          ></span>
          <span class="flex-1 overflow-hidden text-ellipsis whitespace-nowrap">${wt.branch}</span>
          ${this._wtWarn(wt)}
          ${
            this._fileLoader.isRefreshingWorktree(wt.branch) ||
            this._fileLoader.isLoadingWorktree(wt.branch)
              ? html`<div
                  class="wt-spinner w-[14px] h-[14px] shrink-0 border-2 border-[#444] border-t-accent-hover rounded-full animate-[wt-spin_0.8s_linear_infinite]"
                ></div>`
              : html` <!-- Refresh button -->
                  <span
                    class="wt-row-btn w-5 h-5 flex items-center justify-center rounded cursor-pointer shrink-0 text-muted transition-colors duration-100"
                    title="Refresh"
                    @click=${(e: MouseEvent) => {
                      e.stopPropagation();
                      this.dispatchEvent(
                        new CustomEvent("worktree-refresh", {
                          bubbles: true,
                          detail: { repoName: this.repoName, branch: wt.branch },
                        }),
                      );
                    }}
                    >${unsafeHTML(refreshIcon(14))}</span
                  >`
          }
        </div>
      </div>
    `;
  }

  // ─── Uikit tree integration ──────────────────────────────────────

  /** Build TreeNode[] for all files under a worktree branch. */
  private _buildFileTreeNodes(branch: string, parentPath?: string): TreeNode[] {
    const entries = this._fileLoader.getEntries(branch, parentPath);
    if (entries.length === 0) return [];
    const expandedDirs = this._expandedDirs.get(branch) ?? new Set();
    const filterActive = this._isFilterActive;
    return entries
      .filter((entry) => {
        if (!filterActive) return true;
        if (this._matchesFilter(entry.name)) return true;
        // Surface a directory when a content match lives somewhere under it,
        // and a file when it has its own content matches — even when the name
        // doesn't match the filter.
        if (entry.isDirectory) return this._dirContainsMatch(entry.path);
        return this.contentMatches.has(entry.path);
      })
      .map((entry) => {
        const isUntracked = this._fileLoader.isUntracked(branch, entry.path);
        if (entry.isDirectory) {
          // While filtering, auto-expand directories whose name matches or
          // that contain a content match, so matching descendants are visible.
          const isExpanded = filterActive
            ? this._matchesFilter(entry.name) || this._dirContainsMatch(entry.path)
            : expandedDirs.has(entry.path);
          const isLoading = this._fileLoader.isLoadingDir(entry.path);
          return {
            id: entry.path,
            label: entry.name,
            icon: "folder-closed",
            expanded: isExpanded,
            expandable: true,
            status: isUntracked ? ("untracked" as const) : undefined,
            children:
              isExpanded && this._fileLoader.dirContents.has(entry.path)
                ? this._buildFileTreeNodes(branch, entry.path)
                : undefined,
            meta: { branch, filePath: entry.path, isDirectory: true, isLoading },
          };
        }
        const matchChildren = filterActive
          ? this._contentMatchNodes(branch, entry.path)
          : undefined;
        return {
          id: entry.path,
          label: entry.name,
          icon: entry.name,
          draggable: true,
          expanded: matchChildren !== undefined ? true : undefined,
          showChevron: matchChildren !== undefined ? true : undefined,
          children: matchChildren,
          status: isUntracked ? ("untracked" as const) : undefined,
          meta: { branch, filePath: entry.path },
        };
      });
  }

  /** Icon renderer for tree nodes — renders <openp41ge-icon> for known icon names, <file-extension-svg> for files. */
  private _renderIcon: IconRenderer = (name: string, size: number) => {
    // Icon registry names (folder-closed, git-branch, etc.)
    if (name.startsWith("folder") || name.startsWith("git") || name.startsWith("chevron")) {
      return html`<openp41ge-icon name=${name} size=${size}></openp41ge-icon>`;
    }
    // name is the filename — render file extension icon
    return html`<file-extension-svg filename=${name} size=${size}></file-extension-svg>`;
  };

  /** Build an onToggle handler for a given branch — expands/collapses directories asynchronously. */
  private _makeDirToggle(branch: string): (node: TreeNode) => Promise<void> {
    return async (node: TreeNode) => {
      const meta = node.meta as { filePath: string; isDirectory?: boolean } | undefined;
      if (!meta?.isDirectory) return;

      const dirPath = meta.filePath;
      const dirs = this._expandedDirs.get(branch) ?? new Set();

      if (dirs.has(dirPath)) {
        // Collapse
        dirs.delete(dirPath);
        if (dirs.size === 0) this._expandedDirs.delete(branch);
        this._fileLoader.collapseDir(branch, dirPath);
        this.dispatchEvent(
          new CustomEvent("dir-toggle-expand", {
            bubbles: true,
            detail: { branch, path: dirPath, expanded: false },
          }),
        );
        this.requestUpdate();
        return;
      }

      // Expand
      dirs.add(dirPath);
      this._expandedDirs.set(branch, dirs);

      // Let the tree render with the spinner while loading
      this.requestUpdate();

      await this._fileLoader.expandDir(branch, dirPath, () => {
        if (!this.isConnected) return;
        this.requestUpdate();
      });

      this.dispatchEvent(
        new CustomEvent("dir-toggle-expand", {
          bubbles: true,
          detail: { branch, path: dirPath, expanded: true },
        }),
      );
      this.requestUpdate();
    };
  }

  /** Sync _expandedDirs when user collapses a dir node (via the uikit tree's internal toggle). */
  private _makeDirExpandedChange(branch: string): (nodeId: string, expanded: boolean) => void {
    return (nodeId: string, expanded: boolean) => {
      if (expanded) return; // Expansion is handled by onToggle
      const dirs = this._expandedDirs.get(branch);
      if (!dirs || !dirs.has(nodeId)) return;
      dirs.delete(nodeId);
      if (dirs.size === 0) this._expandedDirs.delete(branch);
      this._fileLoader.collapseDir(branch, nodeId);
      this.dispatchEvent(
        new CustomEvent("dir-toggle-expand", {
          bubbles: true,
          detail: { branch, path: nodeId, expanded: false },
        }),
      );
    };
  }

  /** Handlers for uikit tree events on a given branch. */
  private _onFileClick = (e: CustomEvent): void => {
    const meta = e.detail?.meta as
      | {
          branch?: string;
          filePath?: string;
          match?: boolean;
          line?: number;
          column?: number;
        }
      | undefined;
    if (!meta?.filePath) return;
    const name = meta.filePath.split("/").pop() ?? meta.filePath;
    const detail: Record<string, unknown> = { path: meta.filePath, name, pinned: false };
    // A content-match row carries the line/column to jump to, plus the query
    // so the editor highlights the search term.
    if (meta.match) {
      detail.line = meta.line;
      detail.column = meta.column;
      detail.search = {
        query: this.filter.trim(),
        regex: this.filterRegex,
        caseSensitive: this.filterCase,
      };
    }
    document.dispatchEvent(new CustomEvent("openp41ge:open-file", { detail }));
  };

  private _onFileDblClick = (e: CustomEvent): void => {
    const meta = e.detail?.meta as { branch?: string; filePath?: string } | undefined;
    if (!meta?.filePath) return;
    const name = meta.filePath.split("/").pop() ?? meta.filePath;
    document.dispatchEvent(
      new CustomEvent("openp41ge:open-file", {
        detail: { path: meta.filePath, name, pinned: true },
      }),
    );
  };

  private _onFileContextMenu = (e: CustomEvent): void => {
    const meta = e.detail?.meta as { branch?: string; filePath?: string } | undefined;
    if (!meta) return;
    this.dispatchEvent(
      new CustomEvent("worktree-contextmenu", {
        bubbles: true,
        detail: {
          repoName: this.repoName,
          branch: meta.branch,
          x: e.detail.clientX,
          y: e.detail.clientY,
        },
      }),
    );
  };

  /** Inline `--cm-*` custom properties for the tree's content-match rows,
   *  derived from the active syntax theme (the uikit tree reads these). */
  private _themeTokenVars(): string {
    let theme = darkPlusTheme;
    try {
      const id = appServices?.configService?.getSyntaxTheme?.() ?? "openp41ge-dark";
      theme = getThemeById(id);
    } catch {
      theme = darkPlusTheme;
    }
    const c = theme.colors;
    return `--cm-kw:${c.kw};--cm-str:${c.str};--cm-cmt:${c.cmt};--cm-num:${c.num};--cm-type:${c.type};--cm-fun:${c.fun};--cm-op:${c.op};--cm-tag:${c.tag};--cm-atr:${c.atr};--cm-rgx:${c.rgx};--cm-gutter-bg:${c.gutterBg};`;
  }

  render() {
    return html`
      <style>
        /* Content-match rows (gutter + highlighted code) are styled inside the
           uikit tree's shadow DOM; the tree reads --cm-* custom properties set
           inline on the <openp41ge-tree> element. */

        /* End-of-row action buttons only appear when hovering the row: a flat
           fill defines the tile while visible, and hovering the row fades the
           buttons in (they are kept pointer-inert while hidden). */
        .repo-header-btn,
        .wt-row-btn {
          width: 20px;
          height: 20px;
          box-sizing: border-box;
          border-radius: 5px;
          background: var(--bg-hover, #2a2d2e);
          opacity: 0;
          pointer-events: none;
          transition:
            opacity 0.05s ease,
            color 0.1s;
        }
        .wt-row-header:hover .repo-header-btn,
        .wt-row-header:hover .wt-row-btn {
          opacity: 1;
          pointer-events: auto;
        }
        .repo-header-btn:hover,
        .wt-row-btn:hover {
          background: var(--bg-hover-strong, #3a3d3f);
        }
        .repo-header-btn:hover svg {
          color: var(--accent, #4a9eff);
        }
        .wt-row-btn:hover svg {
          color: var(--accent, #4a9eff);
        }
        .wt-row-btn svg {
          transition: color 0.1s;
        }
        .wt-row-header:hover {
          background-color: var(--bg-hover, #2a2d2e);
        }
        .wt-row-btn svg {
          transition: color 0.1s;
        }
        #wt-addwt-input:focus {
          outline: none !important;
        }
        #wt-addwt-row.duplicate-name:focus-within {
          outline-color: #e81123 !important;
        }
      </style>
      <div class="select-none">
        <!-- Repo header -->
        <div class="relative bg-gutter h-[30px] border-b border-[#232323] pointer-events-none">
          <!-- Inner wrapper: receives all pointer events -->
          <div
            draggable="true"
            data-repo-row
            data-repo="${this.repoName}"
            class="pointer-events-auto flex items-center h-[30px] px-2 pl-3 pr-3 cursor-pointer text-sm text-[#ccc] gap-1 transition-colors duration-100 wt-row-header"
            @click=${this._toggleExpand}
            @contextmenu=${(e: MouseEvent) => {
              e.preventDefault();
              e.stopPropagation();
              this.dispatchEvent(
                new CustomEvent("repo-contextmenu", {
                  bubbles: true,
                  detail: {
                    repoName: this.repoName,
                    x: e.clientX,
                    y: e.clientY,
                  },
                }),
              );
            }}
          >
            <span class="text-muted w-[10px] flex items-center justify-center"
              ><openp41ge-icon
                name=${this._expanded ? "chevron-down" : "chevron-right"}
                size="10"
              ></openp41ge-icon
            ></span>
            <span class="flex-1 overflow-hidden text-ellipsis whitespace-nowrap"
              >${this.repoName}</span
            >
            ${this._repoWarn()}
            ${html`
              <!-- + button (add worktree) -->
              <span
                class="repo-header-btn w-5 h-5 flex items-center justify-center rounded cursor-pointer shrink-0 text-muted transition-colors duration-100"
                title="Add worktree"
                @click=${(e: MouseEvent) => {
                  e.stopPropagation();
                  this._showAddWorktreeInline();
                }}
                >${unsafeHTML(plusIconThick(14))}</span
              >
              <!-- Refresh button -->
              <span
                class="repo-header-btn w-5 h-5 flex items-center justify-center rounded cursor-pointer shrink-0 text-muted transition-colors duration-100"
                title="Refresh"
                @click=${(e: MouseEvent) => {
                  e.stopPropagation();
                  this.dispatchEvent(
                    new CustomEvent("repo-refresh", {
                      bubbles: true,
                      detail: { repoName: this.repoName },
                    }),
                  );
                }}
                >${unsafeHTML(refreshIcon(14))}</span
              >
            `}
          </div>
        </div>

        <!-- Expanded worktrees -->
        ${
          this._expanded || (this._isFilterActive && this._filteredWorktrees.length > 0)
            ? html`
                ${
                  this._filteredWorktrees.length > 0
                    ? this._filteredWorktrees.map(
                        (wt) => html`
                          ${this._renderWorktree(wt)}
                          ${
                            (this._expandedWorktrees.has(wt.branch) ||
                              (this._isFilterActive && this._matchesFilter(wt.branch))) &&
                            this._fileLoader.isWorktreeLoaded(wt.branch)
                              ? html`<div class="wt-expanded-wt-block border-b border-[#232323]">
                                  <openp41ge-tree
                                    style="--tree-font-size:12px;--tree-indent:20px;${this._themeTokenVars()}"
                                    .nodes=${this._buildFileTreeNodes(wt.branch)}
                                    .renderIcon=${this._renderIcon}
                                    .onToggle=${this._makeDirToggle(wt.branch)}
                                    .onExpandedChange=${this._makeDirExpandedChange(wt.branch)}
                                    depth="0"
                                    @tree-node-click=${this._onFileClick}
                                    @tree-node-dblclick=${this._onFileDblClick}
                                    @tree-node-contextmenu=${this._onFileContextMenu}
                                  ></openp41ge-tree>
                                </div>`
                              : ""
                          }
                        `,
                      )
                    : ""
                }
              `
            : nothing
        }
        ${
          this._showingAddWorktree
            ? html` <div
                id="wt-addwt-row"
                class="flex items-center h-[26px] px-2 pl-7 pr-3 text-sm gap-1 border-b border-[#232323] transition-colors duration-100 ${this._isDuplicateWorktreeName ? "duplicate-name" : ""}"
              >
                <input
                  id="wt-addwt-input"
                  type="text"
                  placeholder="enter branch name"
                  class="flex-1 min-w-0 h-[22px] bg-transparent border-none rounded-none text-[#e0e0e0] text-sm pl-[14px] outline-none font-inherit"
                  .value=${this._addWorktreeName}
                  @input=${(e: InputEvent) => {
                    this._addWorktreeName = (e.target as HTMLInputElement).value;
                  }}
                  @keydown=${(e: KeyboardEvent) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      this._confirmAddWorktree();
                    }
                    if (e.key === "Escape") {
                      e.preventDefault();
                      e.stopPropagation();
                      this._cancelAddWorktree();
                    }
                  }}
                  @blur=${(_e: FocusEvent) => {
                    setTimeout(() => {
                      if (this._showingAddWorktree) {
                        this._cancelAddWorktree();
                      }
                    }, 150);
                  }}
                />
                <span
                  class="wt-row-btn w-[22px] h-[22px] flex items-center justify-center rounded shrink-0 text-secondary transition-colors duration-100 ${this._isDuplicateWorktreeName ? "pointer-events-none opacity-40" : "cursor-pointer"}"
                  @click=${() => this._confirmAddWorktree()}
                  title="Confirm"
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  >
                    <polyline points="4,8 7,11 12,4" />
                  </svg>
                </span>
                <span
                  class="wt-row-btn w-[22px] h-[22px] flex items-center justify-center cursor-pointer rounded shrink-0 text-secondary transition-colors duration-100"
                  @click=${() => this._cancelAddWorktree()}
                  title="Cancel"
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  >
                    <line x1="4" y1="4" x2="12" y2="12" />
                    <line x1="12" y1="4" x2="4" y2="12" />
                  </svg>
                </span>
              </div>`
            : nothing
        }
      </div>
    `;
  }

  private _showAddWorktreeInline(): void {
    this._addWorktreeName = "";
    this._showingAddWorktree = true;
    this.requestUpdate();
    requestAnimationFrame(() => {
      (this.querySelector("#wt-addwt-input") as HTMLInputElement | null)?.focus();
    });
  }

  private _cancelAddWorktree(): void {
    this._addWorktreeName = "";
    this._showingAddWorktree = false;
    this.requestUpdate();
  }

  private _confirmAddWorktree(): void {
    if (this._isDuplicateWorktreeName) return;
    const branch = this._addWorktreeName.trim();
    if (!branch) return;

    this._addWorktreeName = "";
    this._showingAddWorktree = false;
    this.requestUpdate();

    this.dispatchEvent(
      new CustomEvent("repo-add-worktree", {
        bubbles: true,
        detail: {
          repoName: this.repoName,
          branch,
        },
      }),
    );
  }

  /** Start the pull progress animation on a worktree row. */
  startPullAnimation(branch: string): void {
    this._pullingBranches.add(branch);
    this._pullCompleted.delete(branch);
    this.requestUpdate();
  }

  /** Mark a pull as completed — turns the bar green for ~2s then fades. */
  completePullAnimation(branch: string): void {
    this._pullingBranches.delete(branch);
    this._pullCompleted.set(branch, Date.now());
    this.requestUpdate();
    // Auto-clear green flash after 2.5s
    setTimeout(() => {
      this._pullCompleted.delete(branch);
      this.requestUpdate();
    }, 2500);
  }
}

customElements.define("openp41ge-repo-tree-item", Openp41geRepoTreeItem);
