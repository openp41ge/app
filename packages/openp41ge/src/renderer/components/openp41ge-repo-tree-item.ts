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
        style="position:sticky;top:30px;z-index:1;background:var(--bg-gutter);height:26px;pointer-events:none;border-bottom:1px solid #232323;"
      >
        <div
          style="pointer-events:auto;display:flex;align-items:center;height:26px;padding:0 8px 0 28px;cursor:pointer;font-size:11px;color:#b0b0b0;gap:4px;overflow:hidden;"
          @mouseenter=${(e: MouseEvent) => {
            (e.currentTarget as HTMLElement).style.background = "#2a2a2a";
          }}
          @mouseleave=${(e: MouseEvent) => {
            (e.currentTarget as HTMLElement).style.background = "transparent";
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
                  style="position:absolute;inset:0;background:linear-gradient(90deg, #2a6fd1 0%, #2a6fd1 30%, transparent 50%, #2a6fd1 70%, #2a6fd1 100%);background-size:200% 100%;animation:pull-indeterminate 1.2s linear infinite;opacity:0.3;pointer-events:none;"
                ></div>`
              : showGreen
                ? html`<div
                    style="position:absolute;inset:0;background:var(--accent);opacity:0.25;transition:opacity 0.5s ease;pointer-events:none;"
                  ></div>`
                : ""
          }
          <span style="color:#8a8a8a;font-size:10px;width:10px;"
            >${isExpanded ? "\u25BC" : "\u25B6"}</span
          >
          <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"
            >${wt.branch}</span
          >
          ${!wt.exists ? html`<span style="color:var(--text-muted);font-size:10px;">(pending)</span>` : ""}
          ${
            this._fileLoader.isRefreshingWorktree(wt.branch) ||
            this._fileLoader.isLoadingWorktree(wt.branch)
              ? html`<div
                  class="wt-spinner"
                  style="width:14px;height:14px;flex-shrink:0;border:2px solid #444;border-top-color:var(--accent-hover);border-radius:50%;animation:wt-spin 0.8s linear infinite;"
                ></div>`
              : html` <!-- Refresh button -->
                  <span
                    style="width:20px;height:20px;display:flex;align-items:center;justify-content:center;border-radius:3px;cursor:pointer;flex-shrink:0;color:var(--text-muted);"
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
                      (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.08)";
                    }}
                    @mouseleave=${(e: MouseEvent) => {
                      (e.currentTarget as HTMLElement).style.background = "transparent";
                    }}
                    @mouseover=${(e: MouseEvent) => {
                      (e.currentTarget as HTMLElement).style.color = "#4a9eff";
                    }}
                    @mouseout=${(e: MouseEvent) => {
                      (e.currentTarget as HTMLElement).style.color = "#666";
                    }}
                    >${unsafeHTML(refreshIcon(14))}</span
                  >
                  <!-- 3-dot button -->
                  <span
                    style="width:20px;height:20px;display:flex;align-items:center;justify-content:center;border-radius:3px;cursor:pointer;flex-shrink:0;color:var(--text-muted);"
                    title="More"
                    @mouseenter=${(e: MouseEvent) => {
                      (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.08)";
                    }}
                    @mouseleave=${(e: MouseEvent) => {
                      (e.currentTarget as HTMLElement).style.background = "transparent";
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
            style="display:flex;align-items:center;height:24px;padding:0 12px 0 ${28 + depth * 14}px;cursor:pointer;font-size:11px;color:${isUntracked ? "#666" : "#999"};gap:4px;transition:background 0.1s;${isUntracked ? "opacity:0.6;" : ""}"
            @mouseenter=${(e: MouseEvent) => {
              (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.03)";
            }}
            @mouseleave=${(e: MouseEvent) => {
              (e.currentTarget as HTMLElement).style.background = "transparent";
            }}
            @click=${() => this._toggleDir(branch, entry.path)}
          >
            <span
              style="display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;flex-shrink:0;color:#8a8a8a;font-size:10px;"
              >${isExpanded ? "\u25BC" : "\u25B6"}</span
            >
            <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"
              >${entry.name}</span
            >
            ${
              (isLoading || isRefreshing) && isExpanded
                ? html`<div
                    class="wt-spinner"
                    style="width:10px;height:10px;flex-shrink:0;border:1.5px solid #444;border-top-color:var(--accent-hover);border-radius:50%;animation:wt-spin 0.8s linear infinite;"
                  ></div>`
                : ""
            }
          </div>
          ${children ? this._renderWorktreeFiles(branch, depth + 1, entry.path) : ""}
          ${
            isExpanded && !hasCache && isLoading
              ? html`<div
                  style="padding:2px 0 2px ${28 + (depth + 1) * 14}px;font-size:10px;color:var(--text-muted);"
                >
                  <div
                    class="wt-spinner"
                    style="width:10px;height:10px;display:inline-block;border:1.5px solid #444;border-top-color:var(--accent-hover);border-radius:50%;animation:wt-spin 0.8s linear infinite;margin-right:4px;vertical-align:middle;"
                  ></div>
                  Loading...
                </div>`
              : ""
          }
        `;
      }
      return html`
        <div
          draggable="true"
          style="display:flex;align-items:center;height:24px;padding:0 12px 0 ${28 + depth * 14}px;cursor:pointer;font-size:11px;color:${isUntracked ? "#666" : "#aaa"};gap:4px;transition:background 0.1s;${isUntracked ? "opacity:0.6;" : ""}"
          @mouseenter=${(e: MouseEvent) => {
            (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.03)";
          }}
          @mouseleave=${(e: MouseEvent) => {
            (e.currentTarget as HTMLElement).style.background = "transparent";
          }}
          @dragstart=${(e: DragEvent) => {
            e.dataTransfer!.setData("text/plain", entry.path);
            e.dataTransfer!.effectAllowed = "copy";
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
            style="display:inline-flex;align-items:center;flex-shrink:0;width:16px;height:16px;${isUntracked ? "opacity:0.5;" : ""}"
            >${unsafeHTML(getFileIcon(entry.name))}</span
          >
          <span
            style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;${isUntracked ? "opacity:0.5;" : ""}"
            >${entry.name}</span
          >
        </div>
      `;
    });
  }

  render() {
    return html`
      <div style="user-select:none;">
        <!-- Repo header - outer shell: sticky visual only, events pass through to file rows behind -->
        <div
          style="position:sticky;top:0;z-index:2;background:var(--bg-gutter);height:30px;border-bottom:1px solid #232323;pointer-events:none;"
        >
          <!-- Inner wrapper: receives all pointer events, click/drag/contextmenu -->
          <div
            draggable="true"
            style="pointer-events:auto;display:flex;align-items:center;height:30px;padding:0 8px 0 12px;cursor:pointer;font-size:12px;color:#ccc;gap:4px;"
            @mouseenter=${(e: MouseEvent) => {
              (e.currentTarget as HTMLElement).style.backgroundColor = "rgba(255,255,255,0.08)";
            }}
            @mouseleave=${(e: MouseEvent) => {
              (e.currentTarget as HTMLElement).style.background = "transparent";
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
            <span style="color:#8a8a8a;font-size:10px;width:10px;"
              >${this._expanded ? "\u25BC" : "\u25B6"}</span
            >
            <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"
              >${this.repoName}</span
            >
            ${html`
              <!-- Refresh button -->
              <span
                style="width:20px;height:20px;display:flex;align-items:center;justify-content:center;border-radius:3px;cursor:pointer;flex-shrink:0;color:var(--text-muted);"
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
                  (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.08)";
                }}
                @mouseleave=${(e: MouseEvent) => {
                  (e.currentTarget as HTMLElement).style.background = "transparent";
                }}
                @mouseover=${(e: MouseEvent) => {
                  (e.currentTarget as HTMLElement).style.color = "#4a9eff";
                }}
                @mouseout=${(e: MouseEvent) => {
                  (e.currentTarget as HTMLElement).style.color = "#666";
                }}
                >${unsafeHTML(refreshIcon(14))}</span
              >
              <!-- 3-dot button -->
              <span
                style="width:20px;height:20px;display:flex;align-items:center;justify-content:center;border-radius:3px;cursor:pointer;flex-shrink:0;color:var(--text-muted);"
                title="More"
                @mouseenter=${(e: MouseEvent) => {
                  (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.08)";
                }}
                @mouseleave=${(e: MouseEvent) => {
                  (e.currentTarget as HTMLElement).style.background = "transparent";
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
                style="display:flex;align-items:center;height:26px;padding:0 8px 0 28px;font-size:11px;gap:4px;border-bottom:1px solid #232323;outline:2px solid #2a6fd1;outline-offset:-2px;transition:background 0.1s;"
              >
                <span style="display:none;"></span>
                <input
                  id="wt-addwt-input"
                  type="text"
                  placeholder="enter branch name"
                  style="flex:1;min-width:0;height:22px;background:transparent;border:none;border-radius:0;color:#e0e0e0;font-size:11px;padding:0 6px;outline:none;font-family:inherit;margin-left:8px;"
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
                  style="width:22px;height:22px;display:flex;align-items:center;justify-content:center;cursor:pointer;border-radius:3px;flex-shrink:0;color:var(--text-secondary);"
                  @click=${() => this._confirmAddWorktree()}
                  @mouseenter=${(e: MouseEvent) => {
                    (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.06)";
                  }}
                  @mouseleave=${(e: MouseEvent) => {
                    (e.currentTarget as HTMLElement).style.background = "transparent";
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
                  style="width:22px;height:22px;display:flex;align-items:center;justify-content:center;cursor:pointer;border-radius:3px;flex-shrink:0;color:var(--text-secondary);"
                  @click=${() => this._cancelAddWorktree()}
                  @mouseenter=${(e: MouseEvent) => {
                    (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.06)";
                  }}
                  @mouseleave=${(e: MouseEvent) => {
                    (e.currentTarget as HTMLElement).style.background = "transparent";
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
                  style="display:flex;align-items:center;height:26px;padding:0 8px 0 28px;cursor:pointer;font-size:11px;color:var(--text-muted);gap:4px;border-bottom:1px solid #232323;transition:background 0.1s;user-select:none;"
                  @click=${(e: MouseEvent) => {
                    e.stopPropagation();
                    this._showingAddWorktree = true;
                    this.requestUpdate();
                    requestAnimationFrame(() => {
                      (this.querySelector("#wt-addwt-input") as HTMLInputElement | null)?.focus();
                    });
                  }}
                  @mouseenter=${(e: MouseEvent) => {
                    (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.03)";
                  }}
                  @mouseleave=${(e: MouseEvent) => {
                    (e.currentTarget as HTMLElement).style.background = "transparent";
                  }}
                >
                  <span
                    style="width:10px;height:26px;display:flex;align-items:center;justify-content:center;flex-shrink:0;"
                    ><span
                      style="transform:translateX(-1px);display:inline-flex;color:var(--text-muted);"
                      >${unsafeHTML(plusIconThick(11))}</span
                    ></span
                  >
                  <span style="color:var(--text-muted);">add worktree</span>
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
