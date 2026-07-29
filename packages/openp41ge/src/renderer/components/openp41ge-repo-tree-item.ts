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
import { getFileIcon } from "../icons/material-icons";
import { WorktreeFileLoader } from "../services/worktree-file-loader";
import { DirPersistenceService } from "../services/dir-persistence-service";

export interface WorktreeData {
  branch: string;
  path: string;
  exists: boolean;
}

export interface FileEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  size: number;
  modifiedAt: number;
}

// Injected CSS for custom property driven dynamic styles
(function injectRepTreeItemStyles(): void {
  if (document.getElementById("openp41ge-repo-tree-item-styles")) return;
  const s = document.createElement("style");
  s.id = "openp41ge-repo-tree-item-styles";
  s.textContent = [
    ".rti-dir-row { padding:0 12px 0 var(--dp); color:var(--fg); }",
    ".rti-dir-row.untracked { opacity:0.6; }",
    ".rti-file-row { padding:0 12px 0 var(--dp); color:var(--fg); }",
    ".rti-file-row.untracked { opacity:0.6; }",
    ".rti-loading { padding:2px 0 2px var(--dp-l); }",
    ".rti-icon.untracked { opacity:0.5; }",
    ".rti-label.untracked { opacity:0.5; }",
  ].join("\n");
  document.head.appendChild(s);
})();

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
          class="pointer-events-auto flex items-center h-[26px] px-2 pl-7 cursor-pointer text-xs text-[#b0b0b0] gap-1 overflow-hidden transition-[background] duration-100"
          @mouseenter=${(e: MouseEvent) => {
            (e.currentTarget as HTMLElement).classList.add("bg-hover");
          }}
          @mouseleave=${(e: MouseEvent) => {
            (e.currentTarget as HTMLElement).classList.remove("bg-hover");
          }}
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
          <span class="text-[#8a8a8a] text-2xs w-[10px]"
            >${isExpanded ? "\u25BC" : "\u25B6"}</span
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
                    class="w-5 h-5 flex items-center justify-center rounded cursor-pointer shrink-0 text-muted transition-[background] duration-100"
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
                    @mouseenter=${(e: MouseEvent) => {
                      (e.currentTarget as HTMLElement).classList.add("bg-hover");
                    }}
                    @mouseleave=${(e: MouseEvent) => {
                      (e.currentTarget as HTMLElement).classList.remove("bg-hover");
                    }}
                    @mouseover=${(e: MouseEvent) => {
                      (e.currentTarget as HTMLElement).classList.add("text-accent");
                    }}
                    @mouseout=${(e: MouseEvent) => {
                      (e.currentTarget as HTMLElement).classList.remove("text-accent");
                    }}
                    >${unsafeHTML(refreshIcon(14))}</span
                  >
                  <!-- 3-dot button -->
                  <span
                    class="w-5 h-5 flex items-center justify-center rounded cursor-pointer shrink-0 text-muted transition-[background] duration-100"
                    title="More"
                    @mouseenter=${(e: MouseEvent) => {
                      (e.currentTarget as HTMLElement).classList.add("bg-hover");
                    }}
                    @mouseleave=${(e: MouseEvent) => {
                      (e.currentTarget as HTMLElement).classList.remove("bg-hover");
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
                      <circle cx="7" cy="3" r="1.2" />
                      <circle cx="7" cy="7" r="1.2" />
                      <circle cx="7" cy="11" r="1.2" />
                    </svg>
                  </span>`
          }
        </div>
      </div>
    `;
  }

  private _renderWorktreeFiles(
    branch: string,
    depth: number,
    parentPath?: string,
  ): TemplateResult[] {
    const entries = this._fileLoader.getEntries(branch, parentPath);
    if (entries.length === 0) return [];

    const expandedDirs = this._expandedDirs.get(branch) ?? new Set();

    return entries.map((entry) => {
      const isUntracked = this._fileLoader.isUntracked(branch, entry.path);
      if (entry.isDirectory) {
        const isExpanded = expandedDirs.has(entry.path);
        const isLoading = this._fileLoader.isLoadingDir(entry.path);
        const isRefreshing = this._fileLoader.isRefreshingDir(entry.path);
        const hasCache = this._fileLoader.dirContents.has(entry.path);
        // Show cached children immediately, even during refresh
        const children =
          isExpanded && hasCache ? this._fileLoader.dirContents.get(entry.path) : undefined;
        return html`
          <div
            class="rti-dir-row flex items-center h-6 cursor-pointer text-xs gap-1 transition-[background] duration-100${isUntracked ? " untracked" : ""}"
            style="--dp:${28 + depth * 14}px;--fg:${isUntracked ? "#666" : "#999"}"
            @mouseenter=${(e: MouseEvent) => {
              (e.currentTarget as HTMLElement).classList.add("bg-[rgba(255,255,255,0.03)]");
            }}
            @mouseleave=${(e: MouseEvent) => {
              (e.currentTarget as HTMLElement).classList.remove("bg-[rgba(255,255,255,0.03)]");
            }}
            @click=${() => this._toggleDir(branch, entry.path)}
          >
            <span
              class="inline-flex items-center justify-center w-4 h-4 shrink-0 text-[#8a8a8a] text-2xs"
              >${isExpanded ? "\u25BC" : "\u25B6"}</span
            >
            <span class="flex-1 overflow-hidden text-ellipsis whitespace-nowrap"
              >${entry.name}</span
            >
            ${
              (isLoading || isRefreshing) && isExpanded
                ? html`<div
                    class="wt-spinner w-[10px] h-[10px] shrink-0 border-[1.5px] border-[#444] border-t-accent-hover rounded-full animate-[wt-spin_0.8s_linear_infinite]"
                  ></div>`
                : ""
            }
          </div>
          ${children ? this._renderWorktreeFiles(branch, depth + 1, entry.path) : ""}
          ${
            isExpanded && !hasCache && isLoading
              ? html`<div
                  class="rti-loading text-2xs text-muted"
                  style="--dp-l:${28 + (depth + 1) * 14}px"
                >
                  <div
                    class="wt-spinner w-[10px] h-[10px] inline-block border-[1.5px] border-[#444] border-t-accent-hover rounded-full animate-[wt-spin_0.8s_linear_infinite] mr-1 align-middle"
                  ></div>
                  Loading...
                </div>`
              : ""
          }
        `;
      }
      return html`
        <div
          data-file-path="${entry.path}"
          class="rti-file-row flex items-center h-6 cursor-pointer text-xs gap-1 transition-[background] duration-100${isUntracked ? " untracked" : ""}"
          style="--dp:${28 + depth * 14}px;--fg:${isUntracked ? "#666" : "#aaa"}"
          @mouseenter=${(e: MouseEvent) => {
            (e.currentTarget as HTMLElement).classList.add("bg-[rgba(255,255,255,0.03)]");
          }}
          @mouseleave=${(e: MouseEvent) => {
            (e.currentTarget as HTMLElement).classList.remove("bg-[rgba(255,255,255,0.03)]");
          }}
          @click=${(e: MouseEvent) => {
            const name = entry.path.split("/").pop() ?? entry.path;
            if (e.detail === 2) {
              document.dispatchEvent(
                new CustomEvent("openp41ge:open-file", {
                  detail: { path: entry.path, name, pinned: true },
                }),
              );
              return;
            }
            document.dispatchEvent(
              new CustomEvent("openp41ge:open-file", {
                detail: { path: entry.path, name, pinned: false },
              }),
            );
          }}
        >
          <span
            class="inline-flex items-center shrink-0 w-4 h-4"
            class="rti-icon inline-flex items-center shrink-0 w-4 h-4${isUntracked ? " untracked" : ""}"
            >${unsafeHTML(getFileIcon(entry.name))}</span
          >
          <span
            class="overflow-hidden text-ellipsis whitespace-nowrap"
            class="rti-label overflow-hidden text-ellipsis whitespace-nowrap${isUntracked ? " untracked" : ""}"
            >${entry.name}</span
          >
        </div>
      `;
    });
  }

  render() {
    return html`
      <div class="select-none">
        <!-- Repo header -->
        <div
          class="sticky top-0 z-[2] bg-gutter h-[30px] border-b border-[#232323] pointer-events-none"
        >
          <!-- Inner wrapper: receives all pointer events -->
          <div
            draggable="true"
            class="pointer-events-auto flex items-center h-[30px] px-2 pl-3 cursor-pointer text-sm text-[#ccc] gap-1 transition-[background] duration-100"
            @mouseenter=${(e: MouseEvent) => {
              (e.currentTarget as HTMLElement).classList.add("bg-hover");
            }}
            @mouseleave=${(e: MouseEvent) => {
              (e.currentTarget as HTMLElement).classList.remove("bg-hover");
            }}
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
            <span class="text-[#8a8a8a] text-2xs w-[10px]"
              >${this._expanded ? "\u25BC" : "\u25B6"}</span
            >
            <span class="flex-1 overflow-hidden text-ellipsis whitespace-nowrap"
              >${this.repoName}</span
            >
            ${html`
              <!-- Refresh button -->
              <span
                class="w-5 h-5 flex items-center justify-center rounded cursor-pointer shrink-0 text-muted transition-[background] duration-100"
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
                @mouseenter=${(e: MouseEvent) => {
                  (e.currentTarget as HTMLElement).classList.add("bg-hover");
                }}
                @mouseleave=${(e: MouseEvent) => {
                  (e.currentTarget as HTMLElement).classList.remove("bg-hover");
                }}
                @mouseover=${(e: MouseEvent) => {
                  (e.currentTarget as HTMLElement).classList.add("text-accent");
                }}
                @mouseout=${(e: MouseEvent) => {
                  (e.currentTarget as HTMLElement).classList.remove("text-accent");
                }}
                >${unsafeHTML(refreshIcon(14))}</span
              >
              <!-- 3-dot button -->
              <span
                class="w-5 h-5 flex items-center justify-center rounded cursor-pointer shrink-0 text-muted transition-[background] duration-100"
                title="More"
                @mouseenter=${(e: MouseEvent) => {
                  (e.currentTarget as HTMLElement).classList.add("bg-hover");
                }}
                @mouseleave=${(e: MouseEvent) => {
                  (e.currentTarget as HTMLElement).classList.remove("bg-hover");
                }}
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
                  <circle cx="7" cy="3" r="1.2" />
                  <circle cx="7" cy="7" r="1.2" />
                  <circle cx="7" cy="11" r="1.2" />
                </svg>
              </span>
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
                        (wt, _idx) => html`
                          ${this._renderWorktree(wt)}
                          ${
                            this._expandedWorktrees.has(wt.branch) &&
                            this._fileLoader.isWorktreeLoaded(wt.branch)
                              ? this._renderWorktreeFiles(wt.branch, 1)
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
                class="flex items-center h-[26px] px-2 pl-7 text-xs gap-1 border-b border-[#232323] outline outline-2 outline-offset-[-2px] outline-[#2a6fd1] transition-[background] duration-100"
              >
                <span class="hidden"></span>
                <input
                  id="wt-addwt-input"
                  type="text"
                  placeholder="enter branch name"
                  class="flex-1 min-w-0 h-[22px] bg-transparent border-none rounded-none text-[#e0e0e0] text-xs px-1.5 outline-none font-inherit ml-2"
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
                  id="wt-addwt-confirm"
                  class="w-[22px] h-[22px] flex items-center justify-center cursor-pointer rounded shrink-0 text-secondary"
                  @click=${() => this._confirmAddWorktree()}
                  @mouseenter=${(e: MouseEvent) => {
                    (e.currentTarget as HTMLElement).classList.add("bg-hover");
                  }}
                  @mouseleave=${(e: MouseEvent) => {
                    (e.currentTarget as HTMLElement).classList.remove("bg-hover");
                  }}
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
                  id="wt-addwt-cancel"
                  class="w-[22px] h-[22px] flex items-center justify-center cursor-pointer rounded shrink-0 text-secondary"
                  @click=${() => this._cancelAddWorktree()}
                  @mouseenter=${(e: MouseEvent) => {
                    (e.currentTarget as HTMLElement).classList.add("bg-hover");
                  }}
                  @mouseleave=${(e: MouseEvent) => {
                    (e.currentTarget as HTMLElement).classList.remove("bg-hover");
                  }}
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
            : this._expanded
              ? html` <div
                  class="flex items-center h-[26px] px-2 pl-7 cursor-pointer text-xs text-muted gap-1 border-b border-[#232323] transition-[background] duration-100 select-none"
                  @click=${(e: MouseEvent) => {
                    e.stopPropagation();
                    this._showingAddWorktree = true;
                    this.requestUpdate();
                    requestAnimationFrame(() => {
                      (this.querySelector("#wt-addwt-input") as HTMLInputElement | null)?.focus();
                    });
                  }}
                  @mouseenter=${(e: MouseEvent) => {
                    (e.currentTarget as HTMLElement).classList.add("bg-hover");
                  }}
                  @mouseleave=${(e: MouseEvent) => {
                    (e.currentTarget as HTMLElement).classList.remove("bg-hover");
                  }}
                >
                  <span
                    class="w-[10px] h-[26px] flex items-center justify-center shrink-0"
                    ><span
                      class="-translate-x-px inline-flex text-muted"
                      >${unsafeHTML(plusIconThick(11))}</span
                    ></span
                  >
                  <span class="text-muted">add worktree</span>
                </div>`
              : nothing
        }
      </div>
    `;
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
