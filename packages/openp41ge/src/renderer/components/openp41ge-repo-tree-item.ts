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
import { ref, createRef } from "lit/directives/ref.js";
import { plusIconThick, checkIcon, closeIcon, worktreeIcon, repoIcon } from "../icons";
import { hasExactFileIcon } from "../icons/material-icons";
import { toastService } from "./openp41ge-toast";
import { classifyWorktree, worstOf, worktreeStatusLabel } from "../services/worktree-status";
import { matchesNameFilter } from "../services/explorer-filter";
import {
  WorktreeFileLoader,
  DirPersistenceService,
  type WorktreeData,
  type FileEntry,
} from "openp41ge-filesystem";
import type { TreeNode, IconRenderer } from "openp41ge-uikit";
import { highlightLine, languageFromPath, cropLine } from "openp41ge-uikit";
import { getThemeById, darkPlusTheme } from "openp41ge-uikit/theme";
import { appServices } from "../app";
import "openp41ge-uikit";

export type { WorktreeData, FileEntry };

/** Rows a node list would render, following expanded children. */
function countVisibleRows(nodes: TreeNode[]): number {
  let n = 0;
  for (const node of nodes) {
    n += 1;
    if (node.expanded && node.children) n += countVisibleRows(node.children);
  }
  return n;
}

/**
 * Upper bound on inline content-match rows built in a single render.
 *
 * Sized well above what fits in the sidebar viewport, but low enough that a
 * two-character query (which can match in every walked file) still renders in
 * a few milliseconds and never blocks typing.
 */
const MAX_RENDERED_MATCH_ROWS = 500;

/**
 * Flattened row count past which a worktree's file tree renders virtualized.
 *
 * Below it the tree renders every row, exactly as it always has — normal
 * browsing never takes the windowed path. Above it (a broad search that
 * reveals hundreds of matched files and their lines) only the rows overlapping
 * the panel's viewport are built.
 */
const VIRTUALIZE_ROW_THRESHOLD = 150;

/** Row height in px for the explorer file tree. Overrides the uikit tree's
 * default (26px) via the inline --tree-row-height so every explorer row is the
 * same height as the repo/worktree header rows (30px). */
const TREE_ROW_HEIGHT = 30;

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

  /** Explorer indentation unit in px per level (from explorer settings).
   *  Every row's left padding is a multiple of this fixed value. */
  @property({ type: Number })
  indentSize = 16;

  /** How many levels of directory contents the loader prefetches per expand
   *  (from explorer settings). Passed through to WorktreeFileLoader. Defaults
   *  to 0 so a bare item (as in unit tests) keeps the on-demand readdir path. */
  @property({ type: Number })
  prefetchDepth = 0;

  /** Matching files keyed by disk path — counts only, no match lines. */
  @property({ attribute: false })
  contentIndex: Map<string, ContentMatchIndexEntry> = new Map();

  /** Match lines fetched so far, keyed by disk path. */
  @property({ attribute: false })
  matchDetails: Map<string, FileContentMatch[]> = new Map();

  /** Matched files whose match rows are open. */
  @property({ attribute: false })
  expandedMatchFiles: Set<string> = new Set();

  /**
   * Remaining match rows this render may build, reset at the top of render().
   *
   * Each match row is a syntax-highlighted template, and a short query can
   * match tens of thousands of times across the walked files. Building them all
   * on every streamed batch is what froze the Explorer, so rendering stops at
   * MAX_RENDERED_MATCH_ROWS: files past the budget still show as file rows with
   * their match-count badge, they just don't expand their matches inline.
   */
  private _matchRowBudget = MAX_RENDERED_MATCH_ROWS;

  @state() private _expanded = false;
  @state() private _showingAddWorktree = false;
  @state() private _addWorktreeName = "";

  /** The explorer create row currently in inline-edit mode (null = none). */
  @state() private _newEntry: {
    branch: string;
    parentPath: string;
    kind: "folder" | "file";
    /** Stable row id, so the tree can keep (and restore) the right row. */
    id: string;
  } | null = null;

  /** Value being typed in the inline new-folder/new-file input. Reactive so
   *  the row's icon can switch to the detected file-type as you type; the
   *  input's `.value` stays synced with this so the caret is preserved. */
  @state() private _newEntryName = "";

  /** Ref to the inline create-row input, used to focus it after render. */
  private _newEntryInputRef = createRef<HTMLInputElement>();

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
    this._fileLoader.prefetchDepth = this.prefetchDepth;
    this._loadSync();
    if (changedProperties.has("worktrees")) {
      queueMicrotask(() => this._loadRestoredFiles());
    }
    if (
      changedProperties.has("filter") ||
      changedProperties.has("filterRegex") ||
      changedProperties.has("filterCase") ||
      changedProperties.has("contentIndex")
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
    if (this.contentIndex.size === 0 || !wt.path) return false;
    const prefix = wt.path.endsWith("/") ? wt.path : wt.path + "/";
    for (const p of this.contentIndex.keys()) {
      if (p.startsWith(prefix)) return true;
    }
    return false;
  }

  /** Whether any content match lives under the given directory path. */
  private _dirContainsMatch(dirPath: string): boolean {
    if (this.contentIndex.size === 0) return false;
    const prefix = dirPath.endsWith("/") ? dirPath : dirPath + "/";
    for (const p of this.contentIndex.keys()) {
      if (p.startsWith(prefix)) return true;
    }
    return false;
  }

  /** Badge text for a single file's match count ("12", or "200+" when capped). */
  private _fileMatchBadge(filePath: string): string | undefined {
    const entry = this.contentIndex.get(filePath);
    if (!entry || entry.count === 0) return undefined;
    return `${entry.count}${entry.truncated ? "+" : ""}`;
  }

  /** Badge text for the matches under a directory (all descendants). */
  private _dirMatchBadge(dirPath: string): string | undefined {
    if (this.contentIndex.size === 0) return undefined;
    const prefix = dirPath.endsWith("/") ? dirPath : dirPath + "/";
    let count = 0;
    let truncated = false;
    for (const [p, entry] of this.contentIndex) {
      if (!p.startsWith(prefix)) continue;
      count += entry.count;
      if (entry.truncated) truncated = true;
    }
    if (count === 0) return undefined;
    return `${count}${truncated ? "+" : ""}`;
  }

  /**
   * Build the match sub-list nodes for an expanded file.
   *
   * Returns `undefined` when the file's rows are collapsed, its lines haven't
   * arrived yet, or this render has spent its row budget — in each case the
   * file row still shows its match-count badge.
   */
  private _contentMatchNodes(branch: string, filePath: string): TreeNode[] | undefined {
    if (!this.expandedMatchFiles.has(filePath)) return undefined;
    const matches = this.matchDetails.get(filePath);
    if (!matches || matches.length === 0) return undefined;
    if (this._matchRowBudget <= 0) return undefined;
    const shown = matches.slice(0, this._matchRowBudget);
    this._matchRowBudget -= shown.length;
    // Shift the row back one indent level so it aligns near the file's name
    // instead of sitting a full level deeper (see reduceIndent in the tree).
    const maxDigits = Math.max(1, ...shown.map((m) => String(m.lineNumber ?? 1).length));
    const language = languageFromPath(filePath);
    // Fixed gutter width: one `ch` per digit plus the horizontal padding, so
    // every row in this file shares the same gutter box → line numbers are
    // right-aligned by place value and the right borders connect.
    const gutterWidth = `calc(${maxDigits}ch + 14px)`;
    // Overhang the gutter left so its RIGHT edge lands on the start of the file
    // row's text. The match row's label left edge equals the file row's label
    // left edge, and the file's label carries 4px of leading padding, so the
    // gutter is pushed back by (width - 4px).
    const gutterOverhang = `calc(-${maxDigits}ch - 10px)`;
    return shown.map((m, i) => {
      const rawLine = m.lineText.replace(/\s+$/, "");
      const safeStart = Math.min(m.startIndex ?? 0, rawLine.length);
      const safeEnd = Math.min(m.endIndex ?? safeStart, rawLine.length);
      // Keep the match near the left (small leading context) so it is visible
      // even in the narrow explorer drawer, with trailing context after it.
      const cropped = cropLine(rawLine, safeStart, safeEnd, {
        maxChars: 44,
        before: 6,
        after: 38,
      });
      return {
        id: `${filePath}:match:${i}`,
        label: m.lineText,
        showChevron: false,
        draggable: false,
        reduceIndent: this.indentSize,
        meta: {
          branch,
          filePath,
          match: true,
          line: m.lineNumber,
          column: m.column,
          matchIndex: i,
          matchText: m.lineText.trim(),
        },
        renderLabel: () => html`
          <span class="cm-match-row">
            <span
              class="cm-match-gutter"
              style=${`width:${gutterWidth};margin-left:${gutterOverhang}`}
              ><span class="cm-match-gutter-num">${m.lineNumber}</span></span
            >
            <span class="cm-match-code"
              >${unsafeHTML(
                highlightLine(cropped.text, {
                  language,
                  matchStart: cropped.matchStart,
                  matchEnd: cropped.matchEnd,
                }),
              )}</span
            >
          </span>
        `,
      };
    });
  }

  /** Load the ancestor directory chain for each content match under a worktree.
   *
   * Runs on every `contentIndex` change (search results stream in). The set of
   * matched files grows over time, so a one-time “already revealed” guard would
   * skip directories that only appear in later chunks and leave those rows
   * showing an open folder with no children. `expandDir` is idempotent — it
   * skips directories that are already loaded or currently loading — so this is
   * safe to call repeatedly. */
  private _revealContentDirs(branch: string, worktreePath: string): void {
    if (this.contentIndex.size === 0 || !worktreePath) return;
    const root = worktreePath.endsWith("/") ? worktreePath : worktreePath + "/";
    for (const filePath of this.contentIndex.keys()) {
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

  /** Collapse this repo's header and every expanded worktree/directory.
   * Called by the Explorer's bottom-bar "collapse all" button. */
  collapseAll(): void {
    if (this._expanded) {
      this._expanded = false;
      this.dispatchEvent(
        new CustomEvent("repo-toggle-expand", {
          bubbles: true,
          detail: { repoName: this.repoName, expanded: false },
        }),
      );
    }
    for (const branch of Array.from(this._expandedWorktrees)) {
      this._fileLoader.collapseWorktreeFiles(branch);
      this._expandedDirs.delete(branch);
      this.dispatchEvent(
        new CustomEvent("worktree-files-toggle", {
          bubbles: true,
          detail: { repoName: this.repoName, branch, expanded: false },
        }),
      );
    }
    this._expandedWorktrees.clear();
    this._expandedDirs.clear();
    this._persistence.resetPendingRestore();
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
      <div class="relative bg-gutter h-[30px] pointer-events-none">
        <div
          draggable="true"
          data-worktree-row
          data-repo="${this.repoName}"
          data-branch="${wt.branch}"
          class="pointer-events-auto flex items-center h-[30px] pr-3 cursor-pointer text-sm text-[#b0b0b0] gap-[2px] overflow-hidden transition-colors duration-100 wt-row-header"
          style="padding-left:${8 + this.indentSize}px"
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
          <span class="text-muted w-4 flex items-center justify-center shrink-0"
            ><openp41ge-icon
              name=${isExpanded ? "chevron-down" : "chevron-right"}
              size="12"
            ></openp41ge-icon
          ></span>
          <span class="w-4 flex items-center justify-center shrink-0"
            >${unsafeHTML(worktreeIcon(14))}</span
          >
          <span class="pl-1 flex-1 overflow-hidden text-ellipsis whitespace-nowrap"
            >${wt.branch}</span
          >
          ${this._wtWarn(wt)}
          ${
            this._fileLoader.isRefreshingWorktree(wt.branch) ||
            this._fileLoader.isLoadingWorktree(wt.branch)
              ? html`<div
                  class="wt-spinner w-[14px] h-[14px] shrink-0 border-2 border-[#444] border-t-accent-hover rounded-full animate-[wt-spin_0.8s_linear_infinite]"
                ></div>`
              : nothing
          }
        </div>
      </div>
    `;
  }

  /**
   * The "+ add worktree" row shown at the bottom of a repo's expanded content.
   *
   * Mirrors the sidebar's "+ add repository" row: a muted, hoverable row with a
   * plus icon. Clicking it reveals the inline branch-name input (with
   * Confirm/Cancel), replacing the row in place.
   */
  private _renderAddWorktreeRow(): TemplateResult {
    if (!this._showingAddWorktree) {
      return html`
        <div
          class="add-worktree-row wt-add-row flex items-center h-[30px] pr-3 cursor-pointer select-none text-sm text-muted gap-[2px] transition-[color,background] duration-100"
          style="padding-left:${8 + this.indentSize}px"
          @click=${() => this._showAddWorktreeInline()}
        >
          <span class="w-4 flex items-center justify-center shrink-0"
            >${unsafeHTML(plusIconThick(11))}</span
          ><span class="w-4 flex items-center justify-center shrink-0"
            >${unsafeHTML(worktreeIcon(14))}</span
          ><span class="pl-1 text-muted flex-1 overflow-hidden text-ellipsis whitespace-nowrap"
            >add worktree</span
          >
        </div>
      `;
    }
    return html`
      <div
        id="wt-addwt-row"
        class="flex items-center h-[30px] text-sm gap-[2px] transition-colors duration-100 ${this._isDuplicateWorktreeName ? "duplicate-name" : ""}"
        style="padding-left:${8 + this.indentSize}px"
      >
        <span class="w-4 flex items-center justify-center shrink-0"
          ><span class="inline-flex text-muted">${unsafeHTML(plusIconThick(11))}</span></span
        ><span class="w-4 flex items-center justify-center shrink-0"
          >${unsafeHTML(worktreeIcon(14))}</span
        ><input
          id="wt-addwt-input"
          type="text"
          placeholder="enter branch name"
          class="flex-1 min-w-0 h-6 bg-transparent border-none rounded-none text-primary text-sm px-1 outline-none font-inherit"
          .value=${this._addWorktreeName}
          @input=${(e: InputEvent) => {
            this._addWorktreeName = (e.target as HTMLInputElement).value;
          }}
          @keydown=${(e: KeyboardEvent) => {
            if (e.key === "Enter") {
              e.preventDefault();
              e.stopPropagation();
              this._confirmAddWorktree();
            }
            if (e.key === "Escape") {
              e.preventDefault();
              e.stopPropagation();
              this._cancelAddWorktree(true);
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
        <button
          type="button"
          class="p41ge-icon-btn"
          data-cap-side="left"
          title="Confirm"
          ?disabled=${this._isDuplicateWorktreeName}
          @click=${() => this._confirmAddWorktree()}
        >
          ${unsafeHTML(checkIcon(14))}
        </button>
        <button
          type="button"
          class="p41ge-icon-btn"
          title="Cancel"
          @click=${() => this._cancelAddWorktree()}
        >
          ${unsafeHTML(closeIcon(14))}
        </button>
      </div>
    `;
  }

  // ─── Uikit tree integration ──────────────────────────────────────

  /** Build TreeNode[] for all files under a worktree branch or subdirectory.
   *
   *  When not filtering, each list is appended with two “create” rows —
   *  `+ add folder` at the bottom of the folder group (directories list first,
   *  then files) and `+ add file` at the bottom of the file group. This holds
   *  at the worktree root and every expanded folder, and an empty folder (or
   *  worktree) still shows both rows so the user can start adding content. */
  private _buildFileTreeNodes(branch: string, parentPath?: string): TreeNode[] {
    const entries = this._fileLoader.getEntries(branch, parentPath);
    const expandedDirs = this._expandedDirs.get(branch) ?? new Set();
    const filterActive = this._isFilterActive;
    const nodes: TreeNode[] = [];

    for (const entry of entries) {
      if (filterActive) {
        // Surface a directory when a content match lives somewhere under it,
        // and a file when it has its own content matches — even when the name
        // doesn't match the filter.
        if (this._matchesFilter(entry.name)) {
          // keep
        } else if (entry.isDirectory && this._dirContainsMatch(entry.path)) {
          // keep
        } else if (!entry.isDirectory && this.contentIndex.has(entry.path)) {
          // keep
        } else {
          continue;
        }
      }

      const isUntracked = this._fileLoader.isUntracked(branch, entry.path);
      if (entry.isDirectory) {
        // While filtering, auto-expand directories whose name matches or
        // that contain a content match, so matching descendants are visible.
        const isExpanded = filterActive
          ? this._matchesFilter(entry.name) || this._dirContainsMatch(entry.path)
          : expandedDirs.has(entry.path);
        const isLoading = this._fileLoader.isLoadingDir(entry.path);
        const dirBadge = filterActive ? this._dirMatchBadge(entry.path) : undefined;
        nodes.push({
          id: entry.path,
          label: entry.name,
          icon: "folder-closed",
          expanded: isExpanded,
          expandable: true,
          status: isUntracked ? ("untracked" as const) : undefined,
          badge: dirBadge,
          children:
            isExpanded && this._fileLoader.dirContents.has(entry.path)
              ? this._buildFileTreeNodes(branch, entry.path)
              : undefined,
          meta: { branch, filePath: entry.path, isDirectory: true, isLoading },
        });
      } else {
        const hasMatches = filterActive && this.contentIndex.has(entry.path);
        const matchChildren = hasMatches ? this._contentMatchNodes(branch, entry.path) : undefined;
        const fileBadge = filterActive ? this._fileMatchBadge(entry.path) : undefined;
        const matchesExpanded = hasMatches && this.expandedMatchFiles.has(entry.path);
        nodes.push({
          id: entry.path,
          label: entry.name,
          icon: entry.name,
          draggable: true,
          // A matched file is expandable even before its lines are fetched:
          // opening the row is what asks for them.
          expandable: hasMatches ? true : undefined,
          expanded: hasMatches ? matchesExpanded : undefined,
          showChevron: hasMatches ? true : undefined,
          children: matchChildren,
          badge: fileBadge,
          status: isUntracked ? ("untracked" as const) : undefined,
          meta: { branch, filePath: entry.path, hasMatches },
        });
      }
    }

    // Create rows are only relevant while browsing — never while filtering.
    if (!filterActive) {
      const currentDir = parentPath ?? this._worktreeRootPath(branch);
      const firstFileIdx = nodes.findIndex((n) => !n.meta?.isDirectory);
      const newFolderNode = this._newEntryNode(branch, currentDir, "folder");
      const newFileNode = this._newEntryNode(branch, currentDir, "file");
      // Folders always sit ABOVE files in the list, so the "+ New Folder" row
      // anchors at the bottom of the folder group (the position just before the
      // first file) — it stays above the files even when a folder has no
      // subdirectories. "+ New File" always sits at the very bottom.
      if (firstFileIdx < 0) {
        // No files (only folders, or empty): both create rows go at the bottom.
        nodes.push(newFolderNode, newFileNode);
      } else {
        nodes.splice(firstFileIdx, 0, newFolderNode);
        nodes.push(newFileNode);
      }
    }

    return nodes;
  }

  /** Absolute path of a worktree's root directory (used as the create target
   *  for the top-level create rows). Matches `_renderWorktree`'s fallback. */
  private _worktreeRootPath(branch: string): string {
    const wt = this.worktrees.find((w) => w.branch === branch);
    return wt?.path || `${this.repoName}/${branch}`;
  }

  /** Stable id for a folder/file create row at a given directory. */
  private _newEntryId(branch: string, parentPath: string, kind: "folder" | "file"): string {
    return `new:${branch}::${parentPath}::${kind}`;
  }

  /** Build the `+ add folder` / `+ add file` row for a directory.
   *
   *  It's a leaf row whose label becomes an inline text input while it is the
   *  active create target; otherwise the label is “New Folder” / “New File”
   *  (with a plus icon) and clicking it enters edit mode. */
  private _newEntryNode(branch: string, parentPath: string, kind: "folder" | "file"): TreeNode {
    const id = this._newEntryId(branch, parentPath, kind);
    const editing = this._newEntry?.id === id;
    return {
      id,
      label: kind === "folder" ? "add folder" : "add file",
      // Uniform [action icon][description icon] layout: the action cell holds
      // the + glyph (rotated to a red cross on a duplicate name) and the
      // description cell holds the folder/file-type icon.
      icon: this._newEntryDescIcon(kind, editing),
      actionIcon: this._newEntryActionIcon(kind, editing),
      draggable: false,
      showChevron: false,
      // The muted grey only applies to the idle row; while editing, the label
      // becomes the inline input and must render at full opacity.
      muted: !editing,
      meta: { branch, parentPath, newEntry: kind, isDirectory: kind === "folder" },
      renderLabel: editing ? () => this._renderNewEntryInput(branch, parentPath, kind) : undefined,
    };
  }

  /** The create row's ACTION icon (rendered in the dedicated action cell): +
   *  for both kinds, rotated into a red cross when the typed name duplicates
   *  an existing entry. */
  private _newEntryActionIcon(kind: "folder" | "file", editing: boolean): string {
    if (editing && this._isDuplicateNewEntry) return "new-duplicate";
    return kind === "folder" ? "new-folder" : "new-file";
  }

  /** The create row's DESCRIPTION icon (rendered in the dedicated icon cell):
   *  folders use the default folder icon, files use the unknown/default file
   *  icon, switching to a detected file-type icon (e.g. "app.ts" → TS) once
   *  an exact match is typed. */
  private _newEntryDescIcon(kind: "folder" | "file", editing: boolean): string {
    if (kind === "folder") return "folder-closed";
    const name = this._newEntryName.trim();
    if (editing && name && hasExactFileIcon(name)) return name;
    return "file";
  }

  /** True when the current create name already exists (case-insensitive) as a
   *  file or folder in the target directory — creation is blocked to avoid
   *  overwriting or re-creating an existing entry. */
  private get _isDuplicateNewEntry(): boolean {
    if (!this._newEntry) return false;
    const name = this._newEntryName.trim();
    if (!name) return false;
    return this._nameExistsInDir(this._newEntry.branch, this._newEntry.parentPath, name);
  }

  /** True when `name` already exists as a file or folder in `parentPath`.
   *  Root entries live in the worktree cache; sub-directory entries come from
   *  the per-dir cache, so route by whether the parent is the worktree root. */
  private _nameExistsInDir(branch: string, parentPath: string, name: string): boolean {
    const lower = name.toLowerCase();
    const entries =
      parentPath === this._worktreeRootPath(branch)
        ? this._fileLoader.getEntries(branch)
        : this._fileLoader.getEntries(branch, parentPath);
    return entries.some((e) => e.name.toLowerCase() === lower);
  }

  /** The inline input label for the active create row. */
  private _renderNewEntryInput(
    branch: string,
    parentPath: string,
    kind: "folder" | "file",
  ): TemplateResult {
    const duplicate = this._isDuplicateNewEntry;
    return html`
      <div class="tree-new-entry-row${duplicate ? " duplicate" : ""}">
        <input
          class="tree-new-entry-input"
          placeholder=${kind === "folder" ? "folder name" : "file name"}
          .value=${this._newEntryName}
          ${ref(this._newEntryInputRef)}
          @click=${(e: MouseEvent) => e.stopPropagation()}
          @input=${(e: InputEvent) => {
            this._newEntryName = (e.target as HTMLInputElement).value;
          }}
          @keydown=${(e: KeyboardEvent) => {
            e.stopPropagation();
            if (e.key === "Enter") {
              e.preventDefault();
              void this._confirmNewEntry(branch, parentPath, kind);
            } else if (e.key === "Escape") {
              e.preventDefault();
              // Explicit cancel should hand the arrow cursor back to this row
              // so the user can keep arrowing (blur/confirm do not).
              this._cancelNewEntry(true);
            }
          }}
          @blur=${() => this._cancelNewEntry()}
        />
        <button
          type="button"
          class="tree-new-entry-btn tree-new-entry-confirm"
          title="Confirm"
          ?disabled=${duplicate}
          @mousedown=${(e: MouseEvent) => e.preventDefault()}
          @click=${(e: MouseEvent) => {
            e.stopPropagation();
            void this._confirmNewEntry(branch, parentPath, kind);
          }}
        >
          ${unsafeHTML(checkIcon(14))}
        </button>
        <button
          type="button"
          class="tree-new-entry-btn tree-new-entry-cancel"
          title="Cancel"
          @mousedown=${(e: MouseEvent) => e.preventDefault()}
          @click=${(e: MouseEvent) => {
            e.stopPropagation();
            this._cancelNewEntry();
          }}
        >
          ${unsafeHTML(closeIcon(14))}
        </button>
      </div>
    `;
  }

  /** Enter inline-edit mode for a create row (called on row click). */
  private _beginNewEntry(branch: string, parentPath: string, kind: "folder" | "file"): void {
    this._newEntryName = "";
    this._newEntry = { branch, parentPath, kind, id: this._newEntryId(branch, parentPath, kind) };
    // If the row is already the arrow cursor (arrowed to + Enter), drop its
    // highlight immediately so the inline input isn't framed by a selection.
    this._clearCreateRowHighlight();
    // Tell the Explorer panel to drop its cursor/selection for this row while
    // editing, so a stray re-paint can never frame the input behind a cursor.
    this._notifyCreateRowEdit(this._newEntry.id, true);
    this.requestUpdate();
    // Focus after the tree (re)mounts the input row; a double RAF covers Lit's
    // nested <openp41ge-tree> child update cycle.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => this._newEntryInputRef.value?.focus());
    });
  }

  /** Notify the owning Explorer panel (openp41ge-worktree-tree) that a create
   *  row entered (editing=true) or left (editing=false) inline-edit mode, so it
   *  can manage the arrow cursor that would otherwise frame the input. */
  private _notifyCreateRowEdit(nodeId: string, editing: boolean): void {
    this.dispatchEvent(
      new CustomEvent("create-row-edit", {
        bubbles: true,
        composed: true,
        detail: { nodeId, editing },
      }),
    );
  }

  /** Remove the arrow-cursor highlight (inline background/box-shadow) from the
   *  create row about to be edited, so the input isn't visually selected. */
  private _clearCreateRowHighlight(): void {
    const id = this._newEntry?.id;
    if (!id) return;
    // The create-row id is `new:<branch>::<path>::<kind>` — only `\` and `"`
    // need escaping inside a quoted attribute selector (CSS.escape is absent
    // in the jsdom test environment).
    const sel = `[data-node-id="${id.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"]`;
    const trees = this.renderRoot.querySelectorAll("openp41ge-tree");
    for (const t of trees) {
      const row = (t as unknown as { shadowRoot?: ShadowRoot | null }).shadowRoot?.querySelector(
        sel,
      );
      if (row instanceof HTMLElement) {
        row.style.background = "";
        row.style.boxShadow = "";
        return;
      }
    }
  }

  private _cancelNewEntry(restoreFocus = false): void {
    if (!this._newEntry) return;
    const id = this._newEntry.id;
    this._newEntry = null;
    this._newEntryName = "";
    this.requestUpdate();
    // Escape from the inline input should restore the arrow cursor on the
    // create row so keyboard navigation continues from where it was.
    if (restoreFocus) this._notifyCreateRowEdit(id, false);
  }

  /** Create the file/folder, refresh the directory listing, and (for files)
   *  open the new file in the editor. */
  private async _confirmNewEntry(
    branch: string,
    parentPath: string,
    kind: "folder" | "file",
  ): Promise<void> {
    const name = this._newEntryName.trim();
    this._cancelNewEntry();
    if (!name) return;

    // Block creating an entry whose name already exists in the target dir.
    if (this._nameExistsInDir(branch, parentPath, name)) {
      toastService.show(`"${name}" already exists in this folder`, "error", 4000);
      return;
    }

    const base = parentPath.endsWith("/") ? parentPath : parentPath + "/";
    const target = base + name;
    try {
      if (kind === "folder") {
        const res = await window.openp41ge.file.mkdir(target);
        if (!res.success) throw new Error(`Could not create folder "${name}"`);
        toastService.show(`Folder "${name}" created`, "success");
      } else {
        const res = await window.openp41ge.file.writeFile(target, "");
        if (!res.success) throw new Error(`Could not create file "${name}"`);
        toastService.show(`File "${name}" created`, "success");
        // Open the newly created file so the user can start editing it.
        document.dispatchEvent(
          new CustomEvent("openp41ge:open-file", { detail: { path: target, name, pinned: false } }),
        );
      }
      await this._refreshDirAfterCreate(branch, parentPath);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toastService.show(msg, "error", 5000);
    }
  }

  /** Re-read the directory that just gained a file/folder so the create row
   *  reflects the new entry (root uses the worktree cache, subs use dir cache). */
  private async _refreshDirAfterCreate(branch: string, parentPath: string): Promise<void> {
    const onUpdate = () => {
      if (this.isConnected) this.requestUpdate();
    };
    const root = this._worktreeRootPath(branch);
    if (parentPath === root) {
      this._fileLoader.worktreeFiles.delete(branch);
      await this._fileLoader.expandWorktreeFiles(branch, root, this.repoName, onUpdate);
    } else {
      this._fileLoader.dirContents.delete(parentPath);
      await this._fileLoader.expandDir(branch, parentPath, onUpdate);
    }
  }

  // ── Subtree refresh (right-click) ─────────────────────────────────────

  /** Re-read a folder subtree: clears its cache and reloads the visible dirs.
   *  Used by the folder context menu's “Refresh” action so a change can be
   *  pulled in without refreshing the whole worktree. */
  async refreshDir(branch: string, dirPath: string): Promise<void> {
    const onUpdate = () => {
      if (this.isConnected) this.requestUpdate();
    };
    this._fileLoader.clearDirContents(branch, dirPath);
    // Reload the target dir, then each of its currently-expanded descendants so
    // the whole visible subtree is fresh (prefetching repopulates the rest).
    await this._fileLoader.expandDir(branch, dirPath, onUpdate);
    const dirs = this._expandedDirs.get(branch);
    if (dirs) {
      const prefix = dirPath.endsWith("/") ? dirPath : dirPath + "/";
      for (const d of [...dirs].filter((p) => p.startsWith(prefix)).sort()) {
        await this._fileLoader.expandDir(branch, d, onUpdate);
      }
    }
    this.requestUpdate();
  }

  /** Re-read a single worktree's file tree (files + folders). The worktree's
   *  existence/branch list is owned by the panel refresh; this only reloads
   *  the cached directory listings. */
  async refreshWorktree(branch: string): Promise<void> {
    const onUpdate = () => {
      if (this.isConnected) this.requestUpdate();
    };
    const root = this._worktreeRootPath(branch);
    this._fileLoader.clearWorktreeFiles(branch);
    this._fileLoader.clearWorktreeDirs(root);
    if (this._expandedWorktrees.has(branch)) {
      await this._fileLoader.expandWorktreeFiles(branch, root, this.repoName, onUpdate);
    }
    await this._refreshExpandedDirs(branch, onUpdate);
    this.requestUpdate();
  }

  /** Re-read every cached directory of this repo (all worktrees). Used by the
   *  repo context menu's “Refresh” and by external-change invalidation. */
  async refreshRepo(): Promise<void> {
    const onUpdate = () => {
      if (this.isConnected) this.requestUpdate();
    };
    for (const wt of this.worktrees) {
      const root = this._worktreeRootPath(wt.branch);
      this._fileLoader.clearWorktreeFiles(wt.branch);
      this._fileLoader.clearWorktreeDirs(root);
      if (this._expandedWorktrees.has(wt.branch)) {
        await this._fileLoader.expandWorktreeFiles(wt.branch, root, this.repoName, onUpdate);
      }
      await this._refreshExpandedDirs(wt.branch, onUpdate);
    }
    this.requestUpdate();
  }

  /** Reload the currently-expanded directories of one worktree. */
  private async _refreshExpandedDirs(branch: string, onUpdate: () => void): Promise<void> {
    const dirs = this._expandedDirs.get(branch);
    if (!dirs) return;
    for (const d of [...dirs].sort()) {
      await this._fileLoader.expandDir(branch, d, onUpdate);
    }
  }

  /**
   * Handle a filesystem change reported by the main-process watcher.
   *
   * Refreshes the cached directory listing(s) that would show the change. A
   * change to `changedPath` alters the listing of its parent directory, and —
   * when the path itself is a cached directory — its own listing too. If the
   * change is at a worktree root (a whole worktree folder created/deleted), a
   * `repo-structure-changed` event is emitted so the panel reloads the repo's
   * worktree list.
   *
   * Returns true when the path is inside this item's repo (handled).
   */
  handleExternalChange(changedPath: string): boolean {
    const changed = changedPath.replace(/\/+$/, "");
    let touched = false;
    for (const wt of this.worktrees) {
      const root = this._worktreeRootPath(wt.branch);
      if (changed === root) {
        // Whole worktree folder created/deleted — panel reloads the repo.
        this.dispatchEvent(
          new CustomEvent("repo-structure-changed", {
            bubbles: true,
            detail: { repoName: this.repoName },
          }),
        );
        touched = true;
        continue;
      }
      if (!changed.startsWith(root + "/")) continue;
      touched = true;
      this._refreshPathsForChange(wt.branch, root, changed);
    }
    return touched;
  }

  /** Refresh the cached listings affected by a change at `changed` (inside `root`). */
  private _refreshPathsForChange(branch: string, root: string, changed: string): void {
    const onUpdate = () => {
      if (this.isConnected) this.requestUpdate();
    };
    const parent = changed.substring(0, changed.lastIndexOf("/")) || "/";
    const toRefresh = new Set<string>();
    if (parent === root && this._fileLoader.isWorktreeLoaded(branch)) {
      toRefresh.add(root);
    } else if (this._fileLoader.hasDir(parent)) {
      toRefresh.add(parent);
    }
    // A cached directory itself changing (e.g. its mtime) — refresh its listing.
    if (changed !== parent && this._fileLoader.hasDir(changed)) {
      toRefresh.add(changed);
    }
    for (const dir of toRefresh) {
      if (dir === root) {
        void this._fileLoader.expandWorktreeFiles(branch, root, this.repoName, onUpdate);
      } else {
        void this._fileLoader.expandDir(branch, dir, onUpdate);
      }
    }
  }

  /** Icon renderer for tree nodes — renders <openp41ge-icon> for known icon names, <file-extension-svg> for files. */
  private _renderIcon: IconRenderer = (name: string, size: number) => {
    // A duplicate create name: the + is rotated 45° into a red cross to flag it.
    if (name === "new-duplicate") {
      return html`<span
        style="color:var(--tree-error,#e81123); display:inline-flex;
        transform:rotate(45deg);"
        >${unsafeHTML(plusIconThick(11))}</span
      >`;
    }
    // Icon registry names (folder-closed, git-branch, new-folder/new-file, etc.)
    if (name === "new-folder" || name === "new-file") {
      // Plus icon marks these as “add this kind of entry” rows. Rendered at 11px
      // to match the “+ add worktree” / “+ add repository” rows. Uses the row's
      // own text colour (currentColor) so it matches the row text.
      return html`<span>${unsafeHTML(plusIconThick(11))}</span>`;
    }
    if (name.startsWith("folder") || name.startsWith("git") || name.startsWith("chevron")) {
      return html`<openp41ge-icon name=${name} size=${size}></openp41ge-icon>`;
    }
    // name is the filename — render file extension icon
    return html`<file-extension-svg filename=${name} size=${size}></file-extension-svg>`;
  };

  /** Build an onToggle handler for a given branch — expands/collapses directories asynchronously. */
  private _makeDirToggle(branch: string): (node: TreeNode) => Promise<void> {
    return async (node: TreeNode) => {
      const meta = node.meta as
        { filePath: string; isDirectory?: boolean; hasMatches?: boolean } | undefined;
      // A matched file row: opening it is what asks for its match lines.
      if (meta?.hasMatches && !meta.isDirectory) {
        this._emitMatchToggle(meta.filePath);
        return;
      }
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
  /** Ask the panel to open/close one file's match rows (and fetch its lines). */
  private _emitMatchToggle(filePath: string): void {
    this.dispatchEvent(
      new CustomEvent("content-match-toggle", {
        bubbles: true,
        composed: true,
        detail: { filePath },
      }),
    );
  }

  private _makeDirExpandedChange(branch: string): (nodeId: string, expanded: boolean) => void {
    return (nodeId: string, expanded: boolean) => {
      // Matched file rows collapse through here; they expand via onToggle.
      if (this.contentIndex.has(nodeId)) {
        if (!expanded && this.expandedMatchFiles.has(nodeId)) this._emitMatchToggle(nodeId);
        return;
      }
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
          newEntry?: "folder" | "file";
          parentPath?: string;
          match?: boolean;
          line?: number;
          column?: number;
          matchIndex?: number;
        }
      | undefined;
    if (!meta) return;
    // A “+ add folder” / “+ add file” row — switch it to an inline input.
    // Skip if this row is already the one being edited (clicking the input or
    // its confirm/cancel buttons must not restart the inline edit).
    if (meta.newEntry && meta.branch && meta.parentPath !== undefined) {
      const id = this._newEntryId(meta.branch, meta.parentPath, meta.newEntry);
      if (this._newEntry?.id !== id) {
        this._beginNewEntry(meta.branch, meta.parentPath, meta.newEntry);
      }
      return;
    }
    if (!meta.filePath) return;
    const name = meta.filePath.split("/").pop() ?? meta.filePath;
    const detail: Record<string, unknown> = { path: meta.filePath, name, pinned: false };
    // A content-match row carries the line/column to jump to, plus the query
    // so the editor highlights the search term.
    if (meta.match) {
      detail.line = meta.line;
      detail.column = meta.column;
      detail.matchIndex = meta.matchIndex;
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
    const meta = e.detail?.meta as
      { branch?: string; filePath?: string; newEntry?: string; isDirectory?: boolean } | undefined;
    if (!meta) return;
    // Create rows have no file path — right-clicking them shouldn't surface the
    // worktree context menu.
    if (meta.newEntry) return;
    // Folder rows get their own context menu (e.g. “Refresh”) so a refresh can
    // target just this subtree instead of the whole worktree.
    if (meta.isDirectory && meta.branch && meta.filePath) {
      this.dispatchEvent(
        new CustomEvent("folder-contextmenu", {
          bubbles: true,
          detail: {
            repoName: this.repoName,
            branch: meta.branch,
            path: meta.filePath,
            x: e.detail.clientX,
            y: e.detail.clientY,
          },
        }),
      );
      return;
    }
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
    // The content-match rows sit on the explorer panel (--bg-primary #1e1e1e in
    // dark), NOT on the editor background the syntax theme's gutterBg targets
    // (#161616). The editor gutter colour is too close to the panel to read as a
    // distinct rail, so darken it for dark themes; keep the light grey for light.
    const matchGutterBg =
      theme.type === "light" ? c.gutterBg : `color-mix(in srgb, ${c.gutterBg} 70%, black)`;
    return `--cm-kw:${c.kw};--cm-str:${c.str};--cm-cmt:${c.cmt};--cm-num:${c.num};--cm-type:${c.type};--cm-var:${c.var};--cm-fun:${c.fun};--cm-op:${c.op};--cm-pun:${c.pun};--cm-ent:${c.ent};--cm-sup:${c.sup};--cm-lbl:${c.lbl};--cm-te:${c.te};--cm-scl:${c.scl};--cm-tag:${c.tag};--cm-atr:${c.atr};--cm-rgx:${c.rgx};--cm-gutter-bg:${matchGutterBg};--cm-gutter-fg:var(--text-secondary, #999);`;
  }

  /**
   * One worktree's file tree. Large trees (a broad search) render virtualized
   * against the Explorer panel's scroll container, so only the rows in view are
   * built; small trees keep the plain full render.
   */
  private _renderWorktreeFileTree(branch: string): TemplateResult {
    const nodes = this._buildFileTreeNodes(branch);
    const virtualize = countVisibleRows(nodes) > VIRTUALIZE_ROW_THRESHOLD;
    return html`<div class="wt-expanded-wt-block">
      <openp41ge-tree
        style="--tree-font-size:12px;--tree-indent:${this.indentSize}px;--tree-row-height:30px;${this._themeTokenVars()}"
        .nodes=${nodes}
        .renderIcon=${this._renderIcon}
        .onToggle=${this._makeDirToggle(branch)}
        .onExpandedChange=${this._makeDirExpandedChange(branch)}
        .virtualize=${virtualize}
        .scrollContainer=${virtualize ? this._panelScrollContainer() : null}
        .rowHeight=${TREE_ROW_HEIGHT}
        depth="2"
        @tree-node-click=${this._onFileClick}
        @tree-node-dblclick=${this._onFileDblClick}
        @tree-node-contextmenu=${this._onFileContextMenu}
        @tree-visible-nodes=${this._onVisibleNodes}
      ></openp41ge-tree>
    </div>`;
  }

  /**
   * Rows scrolled into the virtual window: ask the panel to load match lines
   * for the matched files among them, so opening one is instant.
   */
  private _onVisibleNodes = (e: Event): void => {
    const ids = (e as CustomEvent).detail?.nodeIds as string[] | undefined;
    if (!ids || this.contentIndex.size === 0) return;
    const filePaths = ids.filter((id) => this.contentIndex.has(id));
    if (filePaths.length === 0) return;
    this.dispatchEvent(
      new CustomEvent("content-match-prefetch", {
        bubbles: true,
        composed: true,
        detail: { filePaths },
      }),
    );
  };

  /** The Explorer panel's scroll area, which virtualized trees measure against. */
  private _panelScrollContainer(): HTMLElement | null {
    return this.closest(".wt-tree-scroll") as HTMLElement | null;
  }

  render() {
    this._matchRowBudget = MAX_RENDERED_MATCH_ROWS;
    return html`
      <style>
        /* Content-match rows (gutter + highlighted code) are styled inside the
           uikit tree's shadow DOM; the tree reads --cm-* custom properties set
           inline on the <openp41ge-tree> element. */

        .wt-row-header:hover {
          background-color: var(--bg-hover, #2a2d2e);
        }
        .add-worktree-row:hover {
          background-color: var(--bg-hover, #2a2d2e);
        }
        #wt-addwt-input:focus {
          outline: none !important;
        }
        #wt-addwt-row.duplicate-name #wt-addwt-input {
          color: #e81123;
        }
        #wt-addwt-row .p41ge-icon-btn:disabled {
          opacity: 0.4;
          pointer-events: none;
        }
      </style>
      <div class="select-none">
        <!-- Repo header -->
        <div class="relative bg-gutter h-[30px] pointer-events-none">
          <!-- Inner wrapper: receives all pointer events -->
          <div
            draggable="true"
            data-repo-row
            data-repo="${this.repoName}"
            class="pointer-events-auto flex items-center h-[30px] pr-3 cursor-pointer text-sm text-[#ccc] gap-[2px] transition-colors duration-100 wt-row-header"
            style="padding-left:${8}px"
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
            <span class="text-muted w-4 flex items-center justify-center shrink-0"
              ><openp41ge-icon
                name=${this._expanded ? "chevron-down" : "chevron-right"}
                size="12"
              ></openp41ge-icon
            ></span>
            <span class="w-4 flex items-center justify-center shrink-0"
              >${unsafeHTML(repoIcon(14))}</span
            >
            <span class="pl-1 flex-1 overflow-hidden text-ellipsis whitespace-nowrap"
              >${this.repoName}</span
            >
            ${this._repoWarn()}
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
                              ? this._renderWorktreeFileTree(wt.branch)
                              : ""
                          }
                        `,
                      )
                    : ""
                }
                ${this._expanded ? this._renderAddWorktreeRow() : ""}
              `
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

  private _cancelAddWorktree(restoreFocus = false): void {
    this._addWorktreeName = "";
    this._showingAddWorktree = false;
    this.requestUpdate();
    // Escape should hand DOM focus back to the Explorer panel so the next
    // ArrowUp/Down moves the cursor instead of scrolling. The panel listens
    // for this and grabs focus (blur/confirm don't restore).
    if (restoreFocus) {
      this.dispatchEvent(
        new CustomEvent("explorer-panel-focus", {
          bubbles: true,
          composed: true,
        }),
      );
    }
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
