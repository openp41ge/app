/**
 * <openp41ge-repo-tree-item> — single repo header with expandable worktree items (Lit).
 *
 * Rendering orchestration component. Delegates async data loading to
 * WorktreeFileLoader and persistence to DirPersistenceService.
 *
 * Events (bubbling):
 *   repo-add-worktree  — { repoName: string, branch: string }
 *   repo-toggle-expand — { repoName: string, expanded: boolean }
 *   repo-open-git      — { repoName: string }
 *   worktree-files-toggle  — { repoName: string, branch: string, expanded: boolean }
 *   dir-toggle-expand      — { branch: string, path: string, expanded: boolean }
 *   file-open          — { path: string, name: string, mode: string }
 */

import { LitElement, html, nothing, type TemplateResult } from "lit";
import { property, state } from "lit/decorators.js";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import { plusIconThick, refreshIcon } from "../icons";
import {
  WorktreeFileLoader,
  DirPersistenceService,
  type WorktreeData,
  type FileEntry,
} from "openp41ge-filesystem";
import type { TreeNode, IconRenderer } from "openp41ge-uikit";
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

  @property({ type: Boolean })
  editMode = false;

  @state() private _expanded = false;
  @state() private _showingAddWorktree = false;
  @state() private _expandedWorktrees = new Set<string>();
  @state() private _expandedDirs = new Map<string, Set<string>>();
  @state() private _pullingBranches = new Set<string>();

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
  }

  firstUpdated(): void {
    queueMicrotask(() => this._loadRestoredFiles());
  }

  updated(changedProperties: Map<string | number | symbol, unknown>): void {
    if (changedProperties.has("worktrees")) {
      queueMicrotask(() => this._loadRestoredFiles());
    }
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

  private _openGitInfo(): void {
    this.dispatchEvent(
      new CustomEvent("repo-open-git", {
        bubbles: true,
        detail: { repoName: this.repoName },
      }),
    );
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
      <div
        class="sticky top-[30px] z-[1] bg-gutter h-[26px] pointer-events-none border-b border-[#232323]"
      >
        <div
          class="pointer-events-auto flex items-center h-[26px] px-2 pl-7 cursor-pointer text-xs text-[#b0b0b0] gap-1 overflow-hidden transition-colors duration-100 wt-row-header"
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
            ><openp41ge-icon name=${isExpanded ? "chevron-down" : "chevron-right"} size="10"></openp41ge-icon></span
          >
          <span class="flex-1 overflow-hidden text-ellipsis whitespace-nowrap"
            >${wt.branch}</span
          >
          ${!wt.exists ? html`<span class="text-muted text-2xs">(pending)</span>` : ""}
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
                    >${unsafeHTML(refreshIcon(14))}</span>`
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
    return entries.map((entry) => {
      const isUntracked = this._fileLoader.isUntracked(branch, entry.path);
      if (entry.isDirectory) {
        const isExpanded = expandedDirs.has(entry.path);
        const isLoading = this._fileLoader.isLoadingDir(entry.path);
        return {
          id: entry.path,
          label: entry.name,
          icon: "folder-closed",
          expanded: isExpanded,
          expandable: true,
          status: isUntracked ? ("untracked" as const) : undefined,
          children: isExpanded && this._fileLoader.dirContents.has(entry.path)
            ? this._buildFileTreeNodes(branch, entry.path)
            : undefined,
          meta: { branch, filePath: entry.path, isDirectory: true, isLoading },
        };
      }
      return {
        id: entry.path,
        label: entry.name,
        icon: entry.name,
        draggable: true,
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
    const meta = e.detail?.meta as { branch?: string; filePath?: string } | undefined;
    if (!meta?.filePath) return;
    const name = meta.filePath.split("/").pop() ?? meta.filePath;
    document.dispatchEvent(
      new CustomEvent("openp41ge:open-file", {
        detail: { path: meta.filePath, name, pinned: false },
      }),
    );
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

  render() {
    return html`
      <style>
        .repo-header-btn:hover { background-color: var(--bg-hover, #2a2d2e); }
        .repo-header-btn:hover svg { color: var(--accent, #4a9eff); }
        .wt-row-btn:hover { background-color: var(--bg-hover, #2a2d2e); }
        .wt-row-btn:hover svg { color: var(--accent, #4a9eff); }
        .wt-row-btn svg { transition: color 0.1s; }
        .wt-row-header:hover { background-color: var(--bg-hover, #2a2d2e); }
        .wt-row-btn:hover { background-color: var(--bg-hover, #2a2d2e); }
        .wt-row-btn:hover svg { color: var(--accent, #4a9eff); }
        .wt-row-btn svg { transition: color 0.1s; }
        #wt-addwt-input:focus { outline: none !important; }
      </style>
      <div class="select-none">
        <!-- Repo header -->
        <div
          class="sticky top-0 z-[2] bg-gutter h-[30px] border-b border-[#232323] pointer-events-none"
        >
          <!-- Inner wrapper: receives all pointer events -->
          <div
            draggable="true"
            class="pointer-events-auto flex items-center h-[30px] px-2 pl-3 cursor-pointer text-sm text-[#ccc] gap-1 transition-colors duration-100 wt-row-header"
            @click=${this._toggleExpand}
            @dragstart=${(e: DragEvent) => {
              e.dataTransfer!.setData("application/x-openp41ge-repo", this.repoName);
              e.dataTransfer!.effectAllowed = "move";
              e.dataTransfer!.dropEffect = "move";
            }}
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
              ><openp41ge-icon name=${this._expanded ? "chevron-down" : "chevron-right"} size="10"></openp41ge-icon></span
            >
            <span class="flex-1 overflow-hidden text-ellipsis whitespace-nowrap"
              >${this.repoName}</span
            >
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
          this._expanded
            ? html`
                ${
                  this.worktrees.length > 0
                    ? this.worktrees.map(
                        (wt) => html`
                          ${this._renderWorktree(wt)}
                          ${
                            this._expandedWorktrees.has(wt.branch) &&
                            this._fileLoader.isWorktreeLoaded(wt.branch)
                              ? html`<div style="padding-left:20px">
                                  <openp41ge-tree
                                    style="--tree-font-size:12px"
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
                class="flex items-center h-[26px] px-2 pl-7 text-xs gap-1 border-b border-[#232323] transition-colors duration-100"
              >
                <span class="w-[10px] shrink-0"></span>
                <input
                  id="wt-addwt-input"
                  type="text"
                  placeholder="enter branch name"
                  class="flex-1 min-w-0 h-[22px] bg-transparent border-none rounded-none text-[#e0e0e0] text-xs px-1.5 outline-none font-inherit"
                  @keydown=${(e: KeyboardEvent) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      this._confirmAddWorktree();
                    }
                    if (e.key === "Escape") {
                      e.preventDefault();
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
                  class="wt-row-btn w-[22px] h-[22px] flex items-center justify-center cursor-pointer rounded shrink-0 text-secondary transition-colors duration-100"
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
    this._showingAddWorktree = true;
    this.requestUpdate();
    requestAnimationFrame(() => {
      (this.querySelector("#wt-addwt-input") as HTMLInputElement | null)?.focus();
    });
  }

  private _cancelAddWorktree(): void {
    this._showingAddWorktree = false;
    this.requestUpdate();
  }

  private _confirmAddWorktree(): void {
    const input = this.querySelector("#wt-addwt-input") as HTMLInputElement | null;
    if (!input) return;

    const branch = input.value.trim();
    if (!branch) return;

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
