/**
 * <openp41ge-worktree-tree> — Git worktree explorer replacing <openp41ge-file-tree>.
 *
 * States:
 *   1. Empty — no repos cloned, shows "Clone Repository" button
 *   2. Cloning — progress bar with git stderr messages
 *   3. Repo loaded — tree view with worktrees and files
 *   4. Error — clone failure with retry option
 *
 * Architecture (SOLID):
 *   - Facade web component that delegates to injected services
 *   - Pure DOM rendering via RepoTreeRenderer
 *   - Module-level persistent state survives DOM teardown
 *   - All IPC calls go through window.openp41ge.workspaceController.*
 */

import { LitElement, html, nothing, type TemplateResult } from "lit";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import { state, property } from "lit/decorators.js";
import { toastService } from "./openp41ge-toast";
import { repoTreeRenderer } from "../services/repo-tree-renderer";
import { plusIconThick } from "../icons";
import { createOpenp41geContextMenu } from "../interfaces/element-guards";
import { showConfirmModal } from "./openp41ge-confirm-modal";
import "./openp41ge-repo-tree-item";
import { repoOrderCache } from "../repo-order-cache";
import "./openp41ge-clone-dialog";
import "./openp41ge-add-worktree-dialog";
import { appServices } from "../app";
import type { Workspace, Tab } from "../../layout/types";
import { Openp41geTabsEventHandler } from "../services/openp41ge-tabs-event-handler";

import { worktreePersistence } from "../services/worktree-persistence";
import { setContextMenuActive } from "../services/drag-context";
import type { RepoService } from "../models/repo-service";
import { IpcRepoService } from "../models/ipc-repo-service";
import { GitService, IpcGitAdapter } from "openp41ge-git";

// ─── Workspace record type ─────────────────────────────────────────────

interface WorkspaceStoreRecord {
  id: string;
  name: string;
  createdAt: number;
  lastAccessedAt: number;
  repos: Array<{
    url: string;
    name: string;
    worktrees: string[];
  }>;
}

// ─── Module-level state (survives DOM teardown) ─────────────────────────

const _expandedRepos = new Set<string>();
const _expandedWorktrees = new Set<string>();
const _expandedDirs = new Set<string>();
let _isOpen = false;

let _showingAddRepo = false;

// ─── Workspace state ───────────────────────────────────────────────────

// ─── Clone session state ────────────────────────────────────────────────

let _cloneDestroy: (() => void) | null = null;
let _showingCloneInput = false;

// ─── Persistence keys ───────────────────────────────────────────────────

// Persistence is now handled by WorktreePersistence service.
// The legacy functions are preserved as adapter wrappers.

function savePersistedState(): void {
  try {
    worktreePersistence.save({
      drawerWidth: 280,
      expandedRepos: _expandedRepos,
      expandedWorktrees: _expandedWorktrees,
      expandedDirs: _expandedDirs,
    });
  } catch {
    /* ignore */
  }
}

// ─── Public API ─────────────────────────────────────────────────────────

/** Saved column index before the worktree cleared grid focus. */
let _savedFocusedCol = -1;

function _clearGridCellFocus(): void {
  const grid = document.querySelector("tab-grid");
  if (grid) {
    _savedFocusedCol = 0;
  }
}

function _restoreGridFocus(): void {
  const grid = document.querySelector("tab-grid") as HTMLElement | null;
  if (grid) {
    _savedFocusedCol = -1;
    const cell = grid.querySelector(".grid-cell");
    if (cell) {
      (cell as HTMLElement).focus();
    }
  }
}

function updateDrawerVisibility(): void {
  const el = document.querySelector("openp41ge-worktree-tree") as Openp41geWorktreeTree | null;
  if (el) {
    el.style.position = "relative";
    el.style.inset = "auto";
    el.style.width = _isOpen ? "" : "0";
    el.style.zIndex = "";
    el.style.borderLeft = _isOpen ? "1px solid #2a2a2a" : "none";
    el.style.height = "";

    const drawer = el.querySelector(".wt-drawer") as HTMLElement | null;
    if (drawer) {
      drawer.style.width = "";
    }
    const notch = el.querySelector(".wt-resize-notch") as HTMLElement | null;
    if (notch) {
      notch.style.display = _isOpen ? "" : "none";
      notch.classList.toggle("fullwidth", false);
    }
  }
  document.dispatchEvent(
    new CustomEvent("openp41ge:explorer-state-changed", { detail: { open: _isOpen } }),
  );
}

// ─── Web Component (Lit) ───────────────────────────────────────────────

class Openp41geWorktreeTree extends LitElement {
  protected createRenderRoot(): HTMLElement | DocumentFragment {
    return this;
  }

  private _drawerEl: HTMLElement | null = null;
  private _treeEl: HTMLElement | null = null;
  private _wsDrawerEl: HTMLElement | null = null;
  @state() private _wsDrawerOpen = false;
  @state() private _activeWsId: string | null = null;
  @state() private _activeWsConfig: WorkspaceStoreRecord | null = null;
  @state() private _workspaceList: WorkspaceStoreRecord[] = [];
  @property() worksetId = "";
  private _prevWorksetId = "";
  @state() private _editMode = false;
  @state() private _editRepos: WorkspaceStoreRecord["repos"] = [];
  @state() private _renamingWsId: string | null = null;
  private _openp41geRepoUnsub: (() => void) | null = null;
  private _selectedPath = "";
  private _worktreesByRepo: Map<string, Array<{ branch: string; path: string; exists: boolean }>> =
    new Map();

  /**
   * Repository service — the single seam for DI/testing.
   * In production: IpcRepoService (calls window.openp41ge.workspaceController.*).
   * In tests: TestRepoService can be injected externally.
   */
  _repoService: RepoService = new IpcRepoService();

  /**
   * Git service — wraps workspaceController git operations with adapter-based DI.
   * In production: IpcGitAdapter (delegates to workspaceController).
   * In tests: TestGitAdapter can be injected.
   */
  _gitService: GitService = new GitService(new IpcGitAdapter());

  // ── Git panel state ───────────────────────────────────────────────────────
  private _gitDisconnected = false;
  private _repoDropHandler: ((e: Event) => void) | null = null;
  private _onProjectChanged = (): void => {
    this._loadRepos();
  };

  /** Initiate a pointer-event drag to reorder a repo in the explorer tree. */
  private _startExplorerDrag(e: PointerEvent, repoName: string, idx: number): void {
    if (this._explorerDragIdx >= 0) return;
    const repos = this._repos;
    const fromIdx = repos.findIndex((r) => r.name === repoName);
    if (fromIdx < 0) return;

    this._explorerDragIdx = fromIdx;
    this._explorerDragRepoName = repoName;

    // Document-level listeners for live reorder
    this._boundExplorerPointerMove = (ev: PointerEvent) => {
      if (this._explorerDragIdx < 0) return;
      ev.preventDefault();
      // Find drop index
      const items = this.renderRoot?.querySelectorAll("openp41ge-repo-tree-item");
      let toIdx = repos.length;
      if (items) {
        for (let i = 0; i < items.length; i++) {
          const r = items[i].getBoundingClientRect();
          if (ev.clientY < r.top + r.height / 2) { toIdx = i; break; }
        }
      }
      const from = this._explorerDragIdx;
      if (toIdx === from) return;
      const adjustedTo = toIdx > from ? toIdx - 1 : toIdx;
      const [moved] = repos.splice(from, 1);
      repos.splice(adjustedTo, 0, moved);
      this._repos = [...repos];
      this._explorerDragIdx = adjustedTo;
    };

    this._boundExplorerPointerUp = (ev: PointerEvent) => {
      if (this._explorerDragIdx < 0) return;
      ev.preventDefault();
      // Persist the new repo order
      const orderNames = this._repos.map((r) => r.name);
      const pn = window.__openp41geProjectName;
      const projectName = pn ?? "";
      // Update in-memory cache immediately (shared with project picker)
      if (projectName) repoOrderCache.set(projectName, orderNames);
      // Persist to disk via IPC
      const doSave = (name: string) => {
        window.openp41ge.project.setRepoOrder(name, orderNames);
        document.dispatchEvent(new CustomEvent("project:changed"));
      };
      if (projectName) {
        doSave(projectName);
      } else {
        window.openp41ge.project.current().then((n) => { if (n) doSave(n); });
      }
      // Clean up
      this._explorerDragIdx = -1;
      this._explorerDragRepoName = null;
      if (this._boundExplorerPointerMove) {
        document.removeEventListener("pointermove", this._boundExplorerPointerMove);
      }
      if (this._boundExplorerPointerUp) {
        document.removeEventListener("pointerup", this._boundExplorerPointerUp);
      }
      this._boundExplorerPointerMove = null;
      this._boundExplorerPointerUp = null;
    };

    document.addEventListener("pointermove", this._boundExplorerPointerMove);
    document.addEventListener("pointerup", this._boundExplorerPointerUp);
  }

  private _loading = true;
  private _errorMessage = "";
  private _errorRetry: (() => void) | null = null;
  private _loadingRepos = false;
  private _pendingLoadAfterTreeReady = false;
  @state() private _repos: Array<{ path: string; name: string; url: string }> = [];
  @state() private _dropIndex: number = -1;
  @state() private _explorerDragIdx: number = -1;
  private _explorerDragRepoName: string | null = null;
  private _boundExplorerPointerMove: ((e: PointerEvent) => void) | null = null;
  private _boundExplorerPointerUp: ((e: PointerEvent) => void) | null = null;
  private _addWsContainer: HTMLElement | null = null;
  constructor() {
    super();
    this._injectStyles();
  }

  private _injectStyles(): void {
    if (document.getElementById("wt-scrollbar-style")) return;
    const s = document.createElement("style");
    s.id = "wt-scrollbar-style";
    s.textContent = `
      openp41ge-worktree-tree { outline: none; box-shadow: -6px 0 8px rgba(0,0,0,0.1); }
      .wt-tree-scroll { outline: none; }
      .wt-tree-scroll * { outline: none; }
      /* Native scrollbar hidden; custom overlay scrollbar implemented via JS. */
      .wt-tree-scroll { scrollbar-width: none; -ms-overflow-style: none; }
      .wt-tree-scroll::-webkit-scrollbar { width: 0; height: 0; }
      /* Custom overlay scrollbar track — always visible when scrollable */
      .wt-tree-scroll-wrapper .wt-scrollbar-track {
        position: absolute; right: 0; top: 0; width: 8px; height: 100%;
        pointer-events: auto; z-index: 10;
        background: transparent;
        opacity: 0;
        transition: opacity 0.2s ease;
      }
      .wt-tree-scroll-wrapper:hover .wt-scrollbar-track {
        opacity: 1;
      }
      .wt-tree-scroll-wrapper .wt-scrollbar-track:hover {
        background: rgba(0,0,0,0.08);
      }
      .wt-tree-scroll-wrapper .wt-scrollbar-thumb {
        position: absolute; right: 0; width: 6px;
        background: rgba(255,255,255,0.2);
      }
      .wt-tree-scroll-wrapper .wt-scrollbar-thumb:hover {
        background: rgba(255,255,255,0.35);
      }
      /* Rows already have padding-right:8px in their inline styles, so
         the overlay scrollbar sits in the padded area — content text/buttons
         are never hidden underneath it. Row backgrounds fill the full width
         (edge to edge) because .wt-tree-scroll-content has no padding. */
      #wt-addrepo-row:focus-within,
      #wt-addwt-row:focus-within { box-shadow: inset 0 0 0 1px #4a9eff; }
      #wt-addwt-input::placeholder,
      #wt-addrepo-input::placeholder,
      #ws-add-input::placeholder { font-style:italic; }
      @keyframes wt-spin { to { transform: rotate(360deg); } }
      @keyframes pull-indeterminate { 0% { background-position:200% 0; } 100% { background-position:-200% 0; } }
      .wt-spinner {
        width:14px;height:14px;flex-shrink:0;
        border:2px solid #444;border-top-color:var(--accent-hover);
        border-radius:50%;animation:wt-spin 0.8s linear infinite;
      }
    `;
    document.head.appendChild(s);
  }

  private _onWindowResize = () => {
    if (_isOpen) {
      updateDrawerVisibility();
      this.requestUpdate();
    }
  };

  connectedCallback(): void {
    super.connectedCallback();
    window.addEventListener("resize", this._onWindowResize);
    const saved = worktreePersistence.load();
    if (saved) {
      saved.expandedRepos.forEach((r) => _expandedRepos.add(r));
      saved.expandedWorktrees.forEach((b) => _expandedWorktrees.add(b));
      saved.expandedDirs.forEach((d) => _expandedDirs.add(d));
    }
    this._editMode = worktreePersistence.loadEditMode();

    // Expose expanded state globally for sub-components
    (window as unknown as Record<string, unknown>).__wtState = {
      expandedRepos: _expandedRepos,
      expandedWorktrees: _expandedWorktrees,
      expandedDirs: _expandedDirs,
      getExpandedRepos: () => _expandedRepos,
      getExpandedWorktrees: () => _expandedWorktrees,
      getExpandedDirs: () => _expandedDirs,
    };

    this.style.cssText = `
      display:flex;flex-direction:row;
      overflow:hidden;flex-shrink:0;
      width:${_isOpen ? "280px" : "0"};
      min-width:0;
      background:var(--bg-gutter);
      border-left:${_isOpen ? "1px solid #2a2a2a" : "none"};
    `;

    this.addEventListener("keydown", this._onKeyDown);
    if (!this.hasAttribute("tabindex")) {
      this.setAttribute("tabindex", "-1");
    }
    this.addEventListener("mousedown", this._onMousedownFocus);
    this.addEventListener("worktree-contextmenu", this._onWorktreeContextMenu as EventListener);
    this.addEventListener("repo-contextmenu", this._onRepoContextMenu as EventListener);

    // Subscribe to openp41ge repoRefs changes from other windows
    this._openp41geRepoUnsub = window.openp41ge.workspaceController.onWorksetRepoRefsChanged(
      async () => {
        await this._loadRepos();
      },
    );

    // Reload when the project is switched (e.g. via project picker)
    document.addEventListener("project:changed", this._onProjectChanged);

    // Listen for repo drops from file-tree drag-and-drop
    this._repoDropHandler = (e: Event) => {
      if (e.target !== document) return; // Only handle events dispatched on document
      const ce = e as CustomEvent;
      if (ce.detail?.repoName) {
        this._openGitTab(ce.detail.repoName);
      }
    };
    document.addEventListener("repo-open-git", this._repoDropHandler);

    // Sync open/closed state from the workspace state on initial mount.
    // This is needed because _syncExplorerState is also called from willUpdate
    // but only fires when worksetId changes — which may not happen on first mount
    // (worksetId is often "" when the tree is created by ExplorerSidebarView).
    this._syncExplorerState();

    // Initial load
    this._loadRepos();
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    window.removeEventListener("resize", this._onWindowResize);
    this._gitDisconnected = true;

    if (this._openp41geRepoUnsub) {
      this._openp41geRepoUnsub();
      this._openp41geRepoUnsub = null;
    }
    document.removeEventListener("project:changed", this._onProjectChanged);
    if (this._repoDropHandler) {
      document.removeEventListener("repo-open-git", this._repoDropHandler);
      this._repoDropHandler = null;
    }
    this.removeEventListener("keydown", this._onKeyDown);
    this.removeEventListener("mousedown", this._onMousedownFocus);
    this.removeEventListener("worktree-contextmenu", this._onWorktreeContextMenu as EventListener);
    this.removeEventListener("repo-contextmenu", this._onRepoContextMenu as EventListener);
  }

  // ═══ Lit template ═══════════════════════════════════════════════════

  /**
   * Lit render() outputs the outer skeleton with new sub-components.
   * The tree content (repos, worktrees) is rendered by <openp41ge-repo-tree-item>.
   * _renderTree() is still called for async data loading.
   */
  render(): TemplateResult | typeof nothing {
    return html`
      <div
        class="wt-drawer"
        style="display:flex;flex-direction:column;overflow:hidden;flex:1;min-height:0;width:100%;background:var(--bg-gutter);position:relative;user-select:none;"
      >
        <div class="wt-tree-scroll-wrapper" style="flex:1;position:relative;min-height:0;">
          <div
            class="wt-tree-scroll"
            style="position:absolute;inset:0;overflow-y:auto;overflow-x:hidden;"
          >
            <div class="wt-tree-scroll-content"
              @dragenter=${(e: DragEvent) => {
                if (e.dataTransfer?.types.includes("application/x-openp41ge-repo")) e.preventDefault();
              }}
              @dragover=${(e: DragEvent) => {
                if (!e.dataTransfer?.types.includes("application/x-openp41ge-repo")) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                const items = this.renderRoot?.querySelectorAll("openp41ge-repo-tree-item");
                let idx = this._repos.length;
                if (items) {
                  for (let i = 0; i < items.length; i++) {
                    const rect = items[i].getBoundingClientRect();
                    if (e.clientY < rect.top + rect.height / 2) { idx = i; break; }
                  }
                }
                this._dropIndex = idx;
              }}
              @dragleave=${(e: DragEvent) => {
                const t = e.currentTarget as HTMLElement;
                const r = e.relatedTarget as Node | null;
                if (r && t.contains(r)) return;
                this._dropIndex = -1;
              }}
              @drop=${(e: DragEvent) => {
                this._dropIndex = -1;
                const dragName = e.dataTransfer?.getData("application/x-openp41ge-repo");
                if (!dragName) return;
                e.preventDefault();
                const items = this.renderRoot?.querySelectorAll("openp41ge-repo-tree-item");
                let dropIndex = this._repos.length;
                if (items) {
                  for (let i = 0; i < items.length; i++) {
                    const rect = items[i].getBoundingClientRect();
                    if (e.clientY < rect.top + rect.height / 2) { dropIndex = i; break; }
                  }
                }
                const fromIdx = this._repos.findIndex((r) => r.name === dragName);
                if (fromIdx === -1 || fromIdx === dropIndex || dropIndex === fromIdx + 1) return;
                const newRepos = [...this._repos];
                const [moved] = newRepos.splice(fromIdx, 1);
                newRepos.splice(dropIndex > fromIdx ? dropIndex - 1 : dropIndex, 0, moved);
                this._repos = newRepos;
              }}
            >
              ${this._repos.map((repo, idx) => {
                const worktrees = this._worktreesByRepo.get(repo.name) ?? [];
                return html`
                  ${this._dropIndex === idx
                    ? html`<div style="height:2px;background:#4a9eff;flex-shrink:0;margin:0;"></div>`
                    : nothing}
                  <div style="display:flex;align-items:stretch;width:100%;${this._explorerDragIdx === idx ? 'opacity:0.3;' : ''}">
                    <!-- Grip area for drag reorder -->
                    <span
                      style="display:flex;align-items:center;justify-content:center;width:16px;flex-shrink:0;cursor:grab;color:#444;"
                      @pointerdown=${(e: PointerEvent) => {
                        if (e.button !== 0 || this._explorerDragIdx >= 0) return;
                        e.preventDefault();
                        e.stopPropagation();
                        this._startExplorerDrag(e, repo.name, idx);
                      }}
                      title="Drag to reorder"
                    >
                      <svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor">
                        <circle cx="3" cy="2" r="1.2"/><circle cx="7" cy="2" r="1.2"/>
                        <circle cx="3" cy="7" r="1.2"/><circle cx="7" cy="7" r="1.2"/>
                        <circle cx="3" cy="12" r="1.2"/><circle cx="7" cy="12" r="1.2"/>
                      </svg>
                    </span>
                    <openp41ge-repo-tree-item style="flex:1;min-width:0;"
                      .repoName=${repo.name}
                      .repoUrl=${repo.url}
                      .worksetId=${this.worksetId}
                      .worktrees=${worktrees}
                      .editMode=${this._editMode}
                      @repo-toggle-expand=${(e: CustomEvent) => {
                        const { repoName: rn, expanded } = e.detail;
                        if (expanded) _expandedRepos.add(rn); else _expandedRepos.delete(rn);
                        savePersistedState();
                      }}
                      @repo-add-worktree=${(e: CustomEvent) => {
                        this._doAddWorktree(e.detail.repoName, e.detail.branch);
                      }}
                      @repo-open-git=${(e: CustomEvent) => {
                        this._openGitTab(e.detail.repoName);
                      }}
                      @worktree-files-toggle=${(e: CustomEvent) => {
                        const { repoName: rn, branch, expanded } = e.detail;
                        const key = rn + ":" + branch;
                        if (expanded) _expandedWorktrees.add(key); else _expandedWorktrees.delete(key);
                        savePersistedState();
                      }}
                      @dir-toggle-expand=${(e: CustomEvent) => {
                        const { branch, path, expanded } = e.detail;
                        const key = branch + ":" + path;
                        if (expanded) _expandedDirs.add(key); else _expandedDirs.delete(key);
                        savePersistedState();
                      }}
                      @worktree-delete=${async (e: CustomEvent) => {
                        const { branch } = e.detail;
                        const confirmed = await showConfirmModal({
                          message: "Delete worktree",
                          detail: 'Are you sure you want to delete worktree "' + branch + '"?',
                          confirmLabel: "Delete", confirmStyle: "danger",
                        });
                        if (confirmed) {
                          try {
                            await window.openp41ge.workspaceController.deleteWorktree(repo.name, branch);
                            await this._loadRepos();
                          } catch { /* ignore */ }
                        }
                      }}
                      @file-open=${(e: CustomEvent) => {
                        const { path: fp } = e.detail;
                        this._openFile(fp, fp.split("/").pop() ?? fp, true);
                      }}
                      @file-preview=${(e: CustomEvent) => {
                        const { path: fp } = e.detail;
                        this._openFile(fp, fp.split("/").pop() ?? fp, false);
                      }}
                    ></openp41ge-repo-tree-item>
                  </div>
                `;
              })}
              ${this._dropIndex === this._repos.length
                ? html`<div style="height:2px;background:#4a9eff;flex-shrink:0;margin:0;"></div>`
                : nothing}
              ${_showingAddRepo
                ? html`<div id="wt-addrepo-row" style="display:flex;align-items:center;height:30px;padding-left:12px;padding-right:8px;font-size:12px;border-bottom:1px solid var(--border-divider);outline:2px solid #2a6fd1;outline-offset:-2px;transition:background 0.1s;"><span style="display:none;">${unsafeHTML(plusIconThick(16))}</span><input id="wt-addrepo-input" type="text" placeholder="git clone URL" style="flex:1;min-width:0;height:24px;background:transparent;border:none;border-radius:0;color:#e0e0e0;font-size:11px;padding:0 6px;outline:none;font-family:inherit;margin-left:8px;" @keydown=${(e: KeyboardEvent) => { if (e.key === "Enter") { e.preventDefault(); this._confirmAddRepo(); } if (e.key === "Escape") { e.preventDefault(); this._cancelAddRepo(); } }} @blur=${(_e: FocusEvent) => { setTimeout(() => { if (_showingAddRepo) this._cancelAddRepo(); }, 150); }}/><span id="wt-addrepo-confirm" style="width:22px;height:22px;display:flex;align-items:center;justify-content:center;cursor:pointer;border-radius:3px;flex-shrink:0;margin-left:4px;color:var(--text-secondary);" @click=${() => this._confirmAddRepo()} @mouseenter=${(e: MouseEvent) => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.06)"; }} @mouseleave=${(e: MouseEvent) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }} title="Confirm"><svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4,8 7,11 12,4"/></svg></span><span id="wt-addrepo-cancel" style="width:22px;height:22px;display:flex;align-items:center;justify-content:center;cursor:pointer;border-radius:3px;flex-shrink:0;color:var(--text-secondary);" @click=${() => this._cancelAddRepo()} @mouseenter=${(e: MouseEvent) => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.06)"; }} @mouseleave=${(e: MouseEvent) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }} title="Cancel"><svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="4" x2="12" y2="12"/><line x1="12" y1="4" x2="4" y2="12"/></svg></span></div>`
                : html`<div style="display:flex;align-items:center;height:30px;padding-left:12px;padding-right:8px;cursor:pointer;user-select:none;font-size:12px;color:var(--text-muted);transition:color 0.1s,background 0.1s;border-bottom:1px solid var(--border-divider);" @click=${() => this._showAddRepoInline()} @mouseenter=${(e: MouseEvent) => { (e.currentTarget as HTMLElement).style.background = "#1e1e1e"; }} @mouseleave=${(e: MouseEvent) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}><span style="width:10px;height:30px;display:flex;align-items:center;justify-content:center;flex-shrink:0;"><span style="transform:translateX(-1px);display:inline-flex;">${unsafeHTML(plusIconThick(11))}</span></span><span class="add-repo-label" style="margin-left:4px;color:var(--text-muted);flex:1;">add repository</span></div>`
              }
            </div>
            <!-- wt-tree-scroll-content -->
          </div>
          <!-- wt-tree-scroll -->
          <div class="wt-scrollbar-track" @mousedown=${this._onScrollbarTrackMousedown}>
            <div class="wt-scrollbar-thumb" @mousedown=${this._onScrollbarThumbMousedown}></div>
          </div>
        </div>
        <!-- wt-tree-scroll-wrapper -->
      </div>
    `;
  }

  /**
   * Sync the local _isOpen state from the active workset's sidebar.activeViewId.
   * This ensures the tree opens/closes when switching worksets.
   */
  private _syncExplorerState(): void {
    const app = (window as unknown as Record<string, unknown>).__openp41geApp as
      | { getWorkspace: () => unknown; dispatch: (fn: string, ...args: unknown[]) => void }
      | undefined;
    // Fallback: read workspace state from root element dataset
    const wsStr = document.getElementById("root")?.dataset?.workspace;
    if (!wsStr && !app) return;
    let ws: unknown;
    try {
      ws = app?.getWorkspace?.() ?? JSON.parse(wsStr ?? "null");
    } catch {
      return;
    }
    if (!ws) return;
    const myWindowId =
      window.openp41ge?.workspace?.getWindowId?.() ??
      (window as unknown as Record<string, unknown>).__openp41geWindowId;
    if (!myWindowId) return;
    const wss = ws as {
      windows?: Array<{ id: string; sidebar?: { activeViewId: string | null; width?: number } }>;
    };
    const win = wss.windows?.find((w: { id: string }) => w.id === myWindowId);
    if (!win) return;
    const shouldBeOpen = win.sidebar?.activeViewId === "explorer";
    if (shouldBeOpen !== _isOpen) {
      _isOpen = shouldBeOpen;
      if (_isOpen) {
        _clearGridCellFocus();
        // Trigger repo loading — like open() does — so content loads promptly
        // when the explorer is restored from persisted state on startup.
        this._loadRepos();
      } else {
        _restoreGridFocus();
      }
      this.requestUpdate();
    }
  }

  /**
   * Detect openp41geId changes and re-render the tree with the new openp41ge's visibility.
   */
  willUpdate(_changed: Map<string | number | symbol, unknown>): void {
    if (_changed.has("worksetId") && this.worksetId && this.worksetId !== this._prevWorksetId) {
      this._prevWorksetId = this.worksetId;
      this._syncExplorerState();
      this._loadRepos();
    }
  }

  /**
   * After render, ensure tree content and events are wired.
   */
  updated(): void {
    // Store DOM refs after Lit render
    this._drawerEl = this.querySelector(".wt-drawer");
    this._treeEl = this.querySelector(".wt-tree-scroll");

    // Sync drawer visibility now that the drawer DOM is available.
    // _syncExplorerState() may have set _isOpen before the first render,
    // but updateDrawerVisibility() couldn't run because .wt-drawer didn't
    // exist yet. Run it here so the drawer width reflects the correct state.
    if (this._drawerEl) {
      updateDrawerVisibility();
    }

    // Sync custom overlay scrollbar thumb position and bind scroll listener.
    // Use requestAnimationFrame so the browser has performed layout after
    // Lit's DOM update — otherwise scrollHeight may still reflect old
    // content (e.g., expanded worktrees) and the scrollbar won't be hidden
    // when content shrinks.
    requestAnimationFrame(() => this._syncScrollbar());
    if (this._treeEl) {
      this._treeEl.removeEventListener("scroll", this._boundScroll);
      this._treeEl.addEventListener("scroll", this._boundScroll, { passive: true });
    }

    // Trigger data load if not yet loaded
    if (this._repos.length === 0 && !this._loadingRepos) {
      this._loadRepos();
    }

    // If a load was deferred because _treeEl wasn't available, run it now
    if (this._pendingLoadAfterTreeReady && this._treeEl && !this._loadingRepos) {
      this._pendingLoadAfterTreeReady = false;
      this._loadRepos();
    }
  }

  private _onScrollbarTrackMousedown = (e: MouseEvent): void => {
    const track = e.currentTarget as HTMLElement;
    const thumb = track.querySelector(".wt-scrollbar-thumb") as HTMLElement;
    if (!thumb || !this._treeEl) return;

    const trackRect = track.getBoundingClientRect();
    const clickY = e.clientY - trackRect.top;
    const thumbHeight = thumb.offsetHeight;
    const trackHeight = trackRect.height - thumbHeight;

    if (trackHeight <= 0) return;

    const scrollRatio = clickY / trackHeight;
    const maxScroll = this._treeEl.scrollHeight - this._treeEl.clientHeight;
    this._treeEl.scrollTop = Math.round(scrollRatio * maxScroll);
  };

  private _onScrollbarThumbMousedown = (e: MouseEvent): void => {
    e.preventDefault();
    e.stopPropagation();

    if (!this._treeEl) return;
    const thumb = e.currentTarget as HTMLElement;
    const track = thumb.parentElement as HTMLElement;
    if (!track) return;

    const startY = e.clientY;
    const startScrollTop = this._treeEl.scrollTop;
    const trackRect = track.getBoundingClientRect();
    const thumbHeight = thumb.offsetHeight;
    const maxScroll = this._treeEl.scrollHeight - this._treeEl.clientHeight;

    const onMove = (ev: MouseEvent) => {
      const dy = ev.clientY - startY;
      const trackHeight = trackRect.height - thumbHeight;
      if (trackHeight <= 0) return;
      const ratio = dy / trackHeight;
      this._treeEl!.scrollTop = Math.max(
        0,
        Math.min(maxScroll, startScrollTop + ratio * maxScroll),
      );
    };

    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  private _boundScroll = (): void => {
    this._syncScrollbar();
  };

  private _syncScrollbar(): void {
    const el = this._treeEl;
    if (!el) return;

    // Track and thumb are outside .wt-tree-scroll (sibling, not child) to avoid
    // overflow clipping. Query from the wrapper parent instead.
    const wrapper = this.querySelector(".wt-tree-scroll-wrapper");
    const track = wrapper?.querySelector(".wt-scrollbar-track") as HTMLElement;
    const thumb = wrapper?.querySelector(".wt-scrollbar-thumb") as HTMLElement;
    if (!track || !thumb) return;

    const { scrollHeight, clientHeight, scrollTop } = el;

    if (scrollHeight <= clientHeight || clientHeight <= 0) {
      track.style.display = "none";
      return;
    }
    track.style.display = "";

    // Track rendered height from getBoundingClientRect
    const trackH = track.getBoundingClientRect().height;
    if (trackH <= 0) return;

    // Thumb proportional to visible / total content
    const visiblePct = clientHeight / scrollHeight;
    const thumbH = Math.max(20, visiblePct * trackH);
    thumb.style.height = thumbH + "px";

    // Thumb position mirrors scroll progress (0→1)
    const maxScroll = scrollHeight - clientHeight;
    const pct = maxScroll > 0 ? scrollTop / maxScroll : 0;
    thumb.style.top = pct * (trackH - thumbH) + "px";
  }

  // ── Focus ─────────────────────────────────────────────────────────────

  private _onMousedownFocus = (e: MouseEvent) => {
    const target = e.target as HTMLElement;
    if (
      target &&
      (target.tabIndex >= 0 || target.matches("button, input, textarea, select, a, [tabindex]"))
    ) {
      return;
    }
    this.focus();
  };

  // ── Key handler ───────────────────────────────────────────────────────

  private _onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      this.close();
    }
  };

  // ── Edit mode toggle ────────────────────────────────────────────────

  private _toggleEditMode(): void {
    this._editMode = !this._editMode;
    worktreePersistence.saveEditMode(this._editMode);
    this.requestUpdate();
    // Imperatively update the eye-icon button color (Lit re-render may not
    // reliably trigger before _renderTree's async innerHTML clears content)
    const btn = this.querySelector(
      ".wt-drawer > div:last-child > div:last-child",
    ) as HTMLElement | null;
    if (btn) btn.style.color = this._editMode ? "#4a9eff" : "#555";
    this._renderTree();
  }

  // ── Load repos ────────────────────────────────────────────────────────

  private async _loadRepos(): Promise<void> {
    // If tree DOM refs aren't ready yet, queue the load for the next updated() cycle
    if (!this._treeEl) {
      this._pendingLoadAfterTreeReady = true;
      return;
    }
    // If the clone input is being shown, don't overwrite it
    if (_showingAddRepo) return;
    if (this._loadingRepos) return;
    this._loadingRepos = true;

    try {
      // Load workspace config first
      await this._loadWorkspaces();

      const repoModels = await this._repoService.listRepos();
      this._repos = repoModels.map((rm) => ({
        path: "",
        name: rm.name,
        url: rm.url,
      }));
      if (_showingAddRepo) return;

      // Load worktrees for all repos via model
      this._worktreesByRepo.clear();
      for (const rm of repoModels) {
        try {
          const wts = await rm.listWorktrees();
          this._worktreesByRepo.set(
            rm.name,
            wts.map((wt) => ({
              branch: wt.branch,
              path: wt.path,
              exists: wt.exists,
            })),
          );
        } catch {
          this._worktreesByRepo.set(rm.name, []);
        }
      }

      this._loadingRepos = false;

      // Filter repos by the active openp41ge's repoRefs.
      // First, ensure filesystem repos are in the openp41ge's repoRefs.
      await this._syncReposToOpenp41ge();

      if (this._repos.length === 0) {
        this._renderTree();
        return;
      }

      this._renderTree();
    } catch {
      this._loadingRepos = false;
      this.requestUpdate();
    }
  }

  /**
   * Sync filesystem repos with the active openp41ge's repoRefs.
   * Auto-adds repos that exist on disk but aren't in repoRefs.
   * Filters out repos that aren't in repoRefs (unless edit mode is on).
   */
  private async _syncReposToOpenp41ge(): Promise<void> {
    try {
      const repoRefsJson = await window.openp41ge.workspaceController.worksetGetRepoRefs();
      const repoRefs: Array<{
        name: string;
        url: string;
        worktrees: string[];
      }> = JSON.parse(repoRefsJson);

      // Auto-add filesystem repos that don't exist in repoRefs yet
      for (const repo of this._repos) {
        if (!repoRefs.some((r) => r.name === repo.name)) {
          await window.openp41ge.workspaceController.worksetAddRepo(repo.name, repo.url);
          repoRefs.push({
            name: repo.name,
            url: repo.url,
            worktrees: [],
          });
        }
      }

      // Filter repos to only show ones in repoRefs (unless edit mode)
      if (!this._editMode) {
        this._repos = this._repos.filter((r) => repoRefs.some((ref) => ref.name === r.name));
      }

      // Also rebuild _worktreesByRepo from repoRef worktree lists
      for (const repoRef of repoRefs) {
        if (repoRef.worktrees.length > 0) {
          const existing = this._worktreesByRepo.get(repoRef.name) ?? [];
          // Add worktrees from repoRef that are missing from worktreesByRepo
          const existingBranches = new Set(existing.map((wt) => wt.branch));
          for (const branch of repoRef.worktrees) {
            if (!existingBranches.has(branch)) {
              existing.push({ branch, path: ``, exists: false });
            }
          }
          this._worktreesByRepo.set(repoRef.name, existing);
        }
      }
    } catch {
      // If repoRefs API is unavailable, just show all repos
    }
  }

  // ── Workspace helpers ─────────────────────────────────────────────────

  private async _loadWorkspaces(): Promise<void> {
    try {
      const store = await window.openp41ge.workspaceController.loadStore();
      this._workspaceList = (store.workspaces ?? []) as WorkspaceStoreRecord[];

      // Auto-create default workspace on first launch
      if (this._workspaceList.length === 0) {
        const record = await window.openp41ge.workspaceController.createWorkspace("default");
        this._workspaceList = [record as WorkspaceStoreRecord];
      }

      // Determine active workspace per-window via localStorage
      const winId = window.openp41ge.workspace.getWindowId();
      let preferredId: string | null = null;
      if (winId) {
        preferredId = localStorage.getItem(`openp41ge:activeWs:${winId}`);
      }
      // Fall back to store's lastActiveId, then first workspace
      this._activeWsId = preferredId ?? store.lastActiveId ?? this._workspaceList[0]?.id ?? null;
      // Ensure the chosen workspace still exists
      if (this._activeWsId && !this._workspaceList.some((w) => w.id === this._activeWsId)) {
        this._activeWsId = this._workspaceList[0]?.id ?? null;
      }
      if (this._activeWsId) {
        this._activeWsConfig = this._workspaceList.find((w) => w.id === this._activeWsId) ?? null;
      } else {
        this._activeWsConfig = null;
      }
    } catch {
      // Workspace store unavailable — show all
      this._activeWsId = null;
      this._activeWsConfig = null;
      this._workspaceList = [];
    }
  }

  private async _setActiveWorkspace(id: string | null): Promise<void> {
    this._activeWsId = id;
    this._activeWsConfig = id ? (this._workspaceList.find((w) => w.id === id) ?? null) : null;
    this._renderTree();
    if (id && this._activeWsConfig) {
      toastService.show("Workspace: " + this._activeWsConfig.name, "info", 1500);
    }

    // Persist per-window active workspace to localStorage
    const winId = window.openp41ge.workspace.getWindowId();
    if (winId) {
      if (id) {
        localStorage.setItem(`openp41ge:activeWs:${winId}`, id);
      } else {
        localStorage.removeItem(`openp41ge:activeWs:${winId}`);
      }
    }

    // Update lastActive in store as hint for new windows
    if (id) {
      await window.openp41ge.workspaceController.setActiveWorkspace(id);
    }
  }

  private _closeTabsForWorktree(repoName: string, branch: string): void {
    // Find the worktree path
    const worktrees = this._worktreesByRepo.get(repoName) ?? [];
    const wt = worktrees.find((w) => w.branch === branch);
    if (!wt) return;

    // Check if any file tabs are open with this worktree prefix
    const prefix = wt.path.replace(/\/$/, "") + "/";
    // Dispatch a custom event to notify tab system to close related tabs
    document.dispatchEvent(
      new CustomEvent("openp41ge:close-worktree-tabs", {
        detail: { pathPrefix: prefix, repoName, branch },
      }),
    );
  }

  // ── Workspace drawer ────────────────────────────────────────────────

  private _toggleWorkspaceDrawer(): void {
    const drawer = this._wsDrawerEl;
    if (!drawer) return;

    if (this._wsDrawerOpen) {
      this._closeWorkspaceDrawer();
      return;
    }

    this._renderWorkspaceDrawer(drawer);
    drawer.style.maxHeight = "300px";
    this._wsDrawerOpen = true;
  }

  private _closeWorkspaceDrawer(): void {
    const drawer = this._wsDrawerEl;
    if (!drawer) return;
    drawer.style.maxHeight = "0";
    this._wsDrawerOpen = false;
    // Exit edit mode when drawer closes
    if (this._editMode) {
      this._editMode = false;
      this._editRepos = [];
      this._renderTree();
    }
  }

  private _renderWorkspaceDrawer(drawer: HTMLElement): void {
    drawer.innerHTML = "";

    // Edit mode indicator bar
    if (this._editMode) {
      const editBar = document.createElement("div");
      editBar.style.cssText = `
        display:flex;align-items:center;height:28px;
        padding:0 12px;font-size:11px;font-weight:600;
        background:var(--accent-hover);color:#fff;
      `;
      editBar.textContent = "editing workspace…";
      drawer.appendChild(editBar);
    }

    // Cancel rename mode if the workspace was deleted
    if (this._renamingWsId && !this._workspaceList.some((w) => w.id === this._renamingWsId)) {
      this._renamingWsId = null;
    }

    const inner = document.createElement("div");
    inner.style.cssText = "padding:4px 0;";

    for (const ws of this._workspaceList) {
      const isActive = ws.id === this._activeWsId;
      const isRenaming = ws.id === this._renamingWsId;
      const row = document.createElement("div");
      row.style.cssText = `
        display:flex;align-items:center;gap:6px;height:30px;
        padding:0 12px;cursor:pointer;font-size:12px;
        color:${isActive ? "#4a9eff" : "#ccc"};
        transition:background 0.1s;
      `;

      // Grid icon
      const icon = document.createElement("span");
      icon.innerHTML =
        '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="3" y="3" width="8" height="8" rx="1" stroke="' +
        (isActive ? "#4a9eff" : "#666") +
        '" stroke-width="1.5"/><rect x="13" y="3" width="8" height="8" rx="1" stroke="' +
        (isActive ? "#4a9eff" : "#666") +
        '" stroke-width="1.5"/><rect x="3" y="13" width="8" height="8" rx="1" stroke="' +
        (isActive ? "#4a9eff" : "#666") +
        '" stroke-width="1.5"/><rect x="13" y="13" width="8" height="8" rx="1" stroke="' +
        (isActive ? "#4a9eff" : "#666") +
        '" stroke-width="1.5"/></svg>';
      icon.style.cssText =
        "width:16px;display:flex;align-items:center;justify-content:center;flex-shrink:0;";
      row.appendChild(icon);

      if (isRenaming) {
        // Inline rename input
        const input = document.createElement("input");
        input.type = "text";
        input.value = ws.name;
        input.spellcheck = false;
        input.id = `ws-rename-input-${ws.id}`;
        input.style.cssText = `
          flex:1;min-width:0;margin-left:6px;height:100%;
          background:transparent;border:none;outline:none;
          color:#eee;font-size:12px;font-family:inherit;
          padding:0;
        `;
        row.appendChild(input);

        // Confirm icon
        const confirmIcon = document.createElement("span");
        confirmIcon.textContent = "\u2713";
        confirmIcon.style.cssText =
          "width:22px;height:22px;display:flex;align-items:center;justify-content:center;cursor:pointer;border-radius:3px;color:var(--accent-hover);font-size:13px;font-weight:bold;transition:background 0.1s;";
        confirmIcon.title = "Rename";
        confirmIcon.addEventListener("mouseenter", () => {
          confirmIcon.style.background = "rgba(255,255,255,0.08)";
        });
        confirmIcon.addEventListener("mouseleave", () => {
          confirmIcon.style.background = "transparent";
        });
        confirmIcon.addEventListener("click", (e) => {
          e.stopPropagation();
          this._confirmRename(ws.id);
        });
        row.appendChild(confirmIcon);

        // Cancel icon
        const cancelIcon = document.createElement("span");
        cancelIcon.textContent = "\u2715";
        cancelIcon.style.cssText =
          "width:22px;height:22px;display:flex;align-items:center;justify-content:center;cursor:pointer;border-radius:3px;color:var(--text-secondary);font-size:12px;transition:background 0.1s;margin-left:2px;";
        cancelIcon.title = "Cancel rename";
        cancelIcon.addEventListener("mouseenter", () => {
          cancelIcon.style.background = "rgba(255,255,255,0.08)";
        });
        cancelIcon.addEventListener("mouseleave", () => {
          cancelIcon.style.background = "transparent";
        });
        cancelIcon.addEventListener("click", (e) => {
          e.stopPropagation();
          this._renamingWsId = null;
          this._renderWorkspaceDrawer(drawer);
        });
        row.appendChild(cancelIcon);

        // Focus the input and select all text
        requestAnimationFrame(() => {
          input.focus();
          input.select();
        });

        // Enter confirms, Escape cancels
        input.addEventListener("keydown", (e) => {
          if (e.key === "Enter") {
            e.stopPropagation();
            this._confirmRename(ws.id);
          } else if (e.key === "Escape") {
            e.stopPropagation();
            this._renamingWsId = null;
            this._renderWorkspaceDrawer(drawer);
          }
        });
      } else {
        const label = document.createElement("span");
        label.textContent = ws.name;
        label.style.cssText = "flex:1;";
        row.appendChild(label);

        if (isActive) {
          if (this._editMode) {
            // Confirm button
            const confirmIcon = document.createElement("span");
            confirmIcon.textContent = "\u2713";
            confirmIcon.style.cssText =
              "width:22px;height:22px;display:flex;align-items:center;justify-content:center;cursor:pointer;border-radius:3px;color:var(--accent-hover);font-size:13px;font-weight:bold;transition:background 0.1s;";
            confirmIcon.title = "Save workspace";
            confirmIcon.addEventListener("mouseenter", () => {
              confirmIcon.style.background = "rgba(255,255,255,0.08)";
            });
            confirmIcon.addEventListener("mouseleave", () => {
              confirmIcon.style.background = "transparent";
            });
            confirmIcon.addEventListener("click", (e) => {
              e.stopPropagation();
              this._confirmEditWorkspace();
            });
            row.appendChild(confirmIcon);

            // Cancel button
            const cancelIcon = document.createElement("span");
            cancelIcon.textContent = "\u2715";
            cancelIcon.style.cssText =
              "width:22px;height:22px;display:flex;align-items:center;justify-content:center;cursor:pointer;border-radius:3px;color:var(--text-secondary);font-size:12px;transition:background 0.1s;margin-left:2px;";
            cancelIcon.title = "Cancel editing";
            cancelIcon.addEventListener("mouseenter", () => {
              cancelIcon.style.background = "rgba(255,255,255,0.08)";
            });
            cancelIcon.addEventListener("mouseleave", () => {
              cancelIcon.style.background = "transparent";
            });
            cancelIcon.addEventListener("click", (e) => {
              e.stopPropagation();
              this._cancelEditWorkspace();
            });
            row.appendChild(cancelIcon);
          } else {
            // Edit button
            const editBtn = document.createElement("span");
            editBtn.innerHTML =
              '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 000-1.41l-2.34-2.34a1 1 0 00-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" fill="#888"/></svg>';
            editBtn.style.cssText =
              "width:22px;height:22px;display:flex;align-items:center;justify-content:center;cursor:pointer;border-radius:3px;transition:background 0.1s;";
            editBtn.title = "Edit workspace visibility";
            editBtn.addEventListener("mouseenter", () => {
              editBtn.style.background = "rgba(255,255,255,0.08)";
            });
            editBtn.addEventListener("mouseleave", () => {
              editBtn.style.background = "transparent";
            });
            editBtn.addEventListener("click", (e) => {
              e.stopPropagation();
              this._enterEditMode();
            });
            row.appendChild(editBtn);
          }
        }

        // Click label to start rename (double-click to avoid interfering with single-click)
        label.addEventListener("dblclick", (e) => {
          e.stopPropagation();
          this._renamingWsId = ws.id;
          this._renderWorkspaceDrawer(drawer);
        });
      }

      row.addEventListener("mouseenter", () => {
        row.style.background = "rgba(255,255,255,0.04)";
      });
      row.addEventListener("mouseleave", () => {
        row.style.background = "transparent";
      });
      row.addEventListener("click", (e) => {
        e.stopPropagation();
        if (isRenaming) return; // don't close drawer while renaming
        if (ws.id !== this._activeWsId) {
          this._setActiveWorkspace(ws.id);
        }
        this._closeWorkspaceDrawer();
      });
      row.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        e.stopPropagation();
        this._showWorkspaceContextMenu(ws.id, ws.name, e.clientX, e.clientY);
      });
      inner.appendChild(row);
    }

    // Separator
    const sep = document.createElement("div");
    sep.style.cssText = "height:1px;background:var(--bg-tertiary);margin:4px 12px;";
    inner.appendChild(sep);

    // "Add workspace" row — clickable to reveal inline input
    const addRow = document.createElement("div");
    addRow.style.cssText = `
      display:flex;align-items:center;gap:6px;height:30px;
      padding:0 12px;cursor:pointer;font-size:12px;color:var(--accent-hover);
      transition:background 0.1s;
    `;
    addRow.id = "ws-add-row";

    const plusIcon = document.createElement("span");
    plusIcon.innerHTML =
      '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 4v16M4 12h16" stroke="#4a9eff" stroke-width="2" stroke-linecap="round"/></svg>';
    plusIcon.style.cssText =
      "width:16px;display:flex;align-items:center;justify-content:center;flex-shrink:0;";
    addRow.appendChild(plusIcon);

    const addLabel = document.createElement("span");
    addLabel.textContent = "New workspace...";
    addLabel.style.cssText = "flex:1;";
    addLabel.id = "ws-add-label";
    addRow.appendChild(addLabel);

    addRow.addEventListener("mouseenter", () => {
      addRow.style.background = "rgba(255,255,255,0.04)";
    });
    addRow.addEventListener("mouseleave", () => {
      addRow.style.background = "transparent";
    });
    addRow.addEventListener("click", (e) => {
      e.stopPropagation();
      if (!this._addWsContainer) {
        this._showAddWorkspaceInline();
      }
    });
    this._addWsContainer = null;
    inner.appendChild(addRow);

    drawer.appendChild(inner);
  }

  private _showAddWorkspaceInline(): void {
    const addRow = document.getElementById("ws-add-row");
    if (!addRow) return;

    this._addWsContainer = addRow;

    // Replace contents with input + actions
    addRow.innerHTML = "";
    addRow.style.background = "rgba(42,111,209,0.08)";

    // Plus icon
    const plusIcon = document.createElement("span");
    plusIcon.innerHTML =
      '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 4v16M4 12h16" stroke="#4a9eff" stroke-width="2" stroke-linecap="round"/></svg>';
    plusIcon.style.cssText =
      "width:16px;display:flex;align-items:center;justify-content:center;flex-shrink:0;";
    addRow.appendChild(plusIcon);

    // Input
    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = "new workspace name";
    input.spellcheck = false;
    input.id = "ws-add-input";
    input.style.cssText = `
      flex:1;min-width:0;margin-left:6px;height:100%;
      padding:0;box-sizing:border-box;
      background:transparent;border:none;outline:none;
      color:#ddd;font-size:12px;font-family:inherit;
    `;
    addRow.addEventListener("click", (e) => {
      if (e.target === addRow) input.focus();
    });
    addRow.appendChild(input);

    // Action icons
    const actions = document.createElement("span");
    actions.style.cssText = "display:flex;align-items:center;gap:4px;flex-shrink:0;";

    // Confirm
    const confirmIcon = document.createElement("span");
    confirmIcon.textContent = "✓";
    confirmIcon.style.cssText = `
      width:22px;height:22px;display:flex;
      align-items:center;justify-content:center;
      cursor:pointer;border-radius:3px;
      color:var(--text-secondary);font-size:14px;font-weight:bold;
    `;
    confirmIcon.addEventListener("mouseenter", () => {
      confirmIcon.style.background = "rgba(255,255,255,0.08)";
    });
    confirmIcon.addEventListener("mouseleave", () => {
      confirmIcon.style.background = "transparent";
    });
    confirmIcon.addEventListener("click", (e) => {
      e.stopPropagation();
      this._confirmAddWorkspace();
    });
    actions.appendChild(confirmIcon);

    // Cancel
    const cancelIcon = document.createElement("span");
    cancelIcon.textContent = "✕";
    cancelIcon.style.cssText = `
      width:22px;height:22px;display:flex;
      align-items:center;justify-content:center;
      cursor:pointer;border-radius:3px;
      color:var(--text-muted);font-size:12px;
    `;
    cancelIcon.addEventListener("mouseenter", () => {
      cancelIcon.style.background = "rgba(255,255,255,0.08)";
    });
    cancelIcon.addEventListener("mouseleave", () => {
      cancelIcon.style.background = "transparent";
    });
    cancelIcon.addEventListener("click", (e) => {
      e.stopPropagation();
      this._cancelAddWorkspace();
    });
    actions.appendChild(cancelIcon);

    addRow.appendChild(actions);

    // Keyboard handlers
    input.addEventListener("keydown", (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        this._confirmAddWorkspace();
      }
      if (e.key === "Escape") {
        e.preventDefault();
        this._cancelAddWorkspace();
      }
    });

    setTimeout(() => input.focus(), 50);
  }

  private _cancelAddWorkspace(): void {
    this._addWsContainer = null;
    this._renderWorkspaceDrawer(this._wsDrawerEl!);
  }

  private _enterEditMode(): void {
    if (!this._activeWsConfig) return;
    // Deep copy the current workspace repos for editing.
    // If worktrees is empty (meaning all visible), populate with all current worktrees.
    this._editRepos = this._activeWsConfig.repos.map((r) => ({
      url: r.url,
      name: r.name,
      worktrees:
        r.worktrees.length > 0
          ? [...r.worktrees]
          : (this._worktreesByRepo.get(r.name) ?? []).map((wt) => wt.branch),
    }));
    this._editMode = true;

    // Re-render tree showing all items and drawer with confirm/cancel
    this._renderTree();
    if (this._wsDrawerEl && this._wsDrawerOpen) {
      this._renderWorkspaceDrawer(this._wsDrawerEl);
    }
  }

  private async _confirmEditWorkspace(): Promise<void> {
    if (!this._activeWsId) return;
    this._editMode = false;

    try {
      // Sync the edited config to the workspace store
      // First, clear all existing repos from the workspace
      const activeConfig = this._workspaceList.find((w) => w.id === this._activeWsId);
      if (activeConfig) {
        for (const repo of activeConfig.repos) {
          await window.openp41ge.workspaceController.removeRepo(this._activeWsId, repo.name);
        }
      }

      // Then add the edited repos
      for (const repo of this._editRepos) {
        await window.openp41ge.workspaceController.addRepo(
          this._activeWsId,
          repo.url,
          repo.name,
          repo.worktrees,
        );
      }

      // Reload workspace config
      await this._loadWorkspaces();
    } catch {
      // ignore
    }

    this._editRepos = [];
    this._renderTree();

    // Notify other windows of the store change
    window.openp41ge.workspaceController.notifyStoreChanged();
    if (this._wsDrawerEl && this._wsDrawerOpen) {
      this._renderWorkspaceDrawer(this._wsDrawerEl);
    }
  }

  private _cancelEditWorkspace(): void {
    this._editMode = false;
    this._editRepos = [];

    this._renderTree();
    if (this._wsDrawerEl && this._wsDrawerOpen) {
      this._renderWorkspaceDrawer(this._wsDrawerEl);
    }
  }

  private async _confirmAddWorkspace(): Promise<void> {
    const input = document.getElementById("ws-add-input") as HTMLInputElement | null;
    if (!input) return;
    const name = input.value.trim();
    if (!name) return;

    try {
      // Create workspace
      const record = await window.openp41ge.workspaceController.createWorkspace(name);

      // Copy active workspace config into new one
      if (this._activeWsConfig && this._activeWsId) {
        for (const repo of this._activeWsConfig.repos) {
          if (repo.worktrees.length > 0) {
            await window.openp41ge.workspaceController.addRepo(
              record.id,
              repo.url,
              repo.name,
              repo.worktrees,
            );
          } else {
            await window.openp41ge.workspaceController.addRepo(record.id, repo.url, repo.name);
          }
        }
      }

      this._workspaceList.push(record as WorkspaceStoreRecord);
      await this._setActiveWorkspace(record.id);

      // Re-render workspace drawer with new workspace visible
      this._addWsContainer = null;
      const dd = this._wsDrawerEl;
      if (dd) {
        this._renderWorkspaceDrawer(dd);
      }

      // Notify other windows of the store change
      window.openp41ge.workspaceController.notifyStoreChanged();
    } catch {
      // ignore
    }
    this._addWsContainer = null;
  }
  // ── Clone dialog ─────────────────────────────────────────────────────

  private _cloneUrl = "";
  private _cloneProgressBar: HTMLElement | null = null;

  private _showCloneDialog(): void {
    _showingCloneInput = true;
    this.requestUpdate();
  }
  private _cancelClone(): void {
    _showingCloneInput = false;
    if (_cloneDestroy) {
      _cloneDestroy();
      _cloneDestroy = null;
    }
    this._loadRepos();
  }

  private _confirmClone(): void {
    const input = this._treeEl?.querySelector("#wt-clone-input") as HTMLInputElement | null;
    if (!input) return;

    const url = input.value.trim();
    if (!url) {
      toastService.show("Please enter a URL", "error");
      return;
    }
    if (!url.startsWith("http") && !url.startsWith("git@") && !url.startsWith("ssh://")) {
      toastService.show("Invalid URL format. Use https://, git@, or ssh://", "error");
      return;
    }

    // Replace input row with spinner + progress bar
    const row = input.closest("[style*='height:30px']") as HTMLElement | null;
    if (row) {
      row.innerHTML = `
        <span style="width:16px;display:flex;align-items:center;justify-content:center;">
          <svg width="10" height="10" viewBox="0 0 16 16" fill="none"><polyline points="6,4 10,8 6,12" stroke="#666" stroke-width="1.5" fill="none"/></svg>
        </span>
        <span style="margin-left:6px;flex:1;color:var(--text-secondary);font-size:12px;">${this._escapeHtml(url)}</span>
        <div class="wt-spinner" style="width:14px;height:14px;flex-shrink:0;border:2px solid #444;border-top-color:var(--accent-hover);border-radius:50%;animation:wt-spin 0.8s linear infinite;"></div>
      `;
    }

    // Show progress bar
    if (this._cloneProgressBar) {
      this._cloneProgressBar.style.display = "block";
      this._cloneProgressBar.style.width = "0%";
    }

    this._cloneUrl = url;
    this._startClone(url);
  }

  private async _startClone(url: string): Promise<void> {
    if (!this._treeEl) return;
    this._ensureOpen();

    try {
      const session = this._gitService.clone(url);
      _cloneDestroy = () => session.destroy();

      session.onProgress((progress: { percent: number; message: string }) => {
        if (this._cloneProgressBar) {
          this._cloneProgressBar.style.width = progress.percent + "%";
        }
        // Show status in bottom bar via toast or just progress bar width
      });

      const result = await session.promise;

      if (result.success) {
        // Fill progress bar to 100%
        if (this._cloneProgressBar) {
          this._cloneProgressBar.style.width = "100%";
        }
        // Replace spinner with check icon in the row
        if (this._treeEl) {
          const spinner = this._treeEl.querySelector(".wt-spinner") as HTMLElement | null;
          if (spinner) {
            spinner.outerHTML =
              '<span class="wt-check-icon" style="color:#4caf50;font-size:14px;font-weight:bold;">\u2713</span>';
          }
        }
        toastService.show("Repository cloned successfully", "success");
        // Clear the flag so _loadRepos() can render the tree
        _showingCloneInput = false;
        // Brief delay so the check icon is visible before tree reloads
        await new Promise((r) => setTimeout(r, 800));
        await this._loadRepos();
      } else {
        toastService.show(result.error || "Clone failed", "error", 5000);
        if (!this._treeEl) return;
        repoTreeRenderer.renderError(
          this._treeEl,
          result.error || "Clone failed. Please check the URL and try again.",
          () => this._showCloneDialog(),
        );
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toastService.show(msg, "error", 5000);
    } finally {
      _cloneDestroy = null;
      _showingCloneInput = false;
    }
  }

  private _ensureOpen(): void {
    if (!_isOpen) {
      const myWindowId = window.openp41ge?.workspace?.getWindowId?.() ?? "";
      if (myWindowId) {
        window.openp41ge?.workspace?.dispatch?.("setSidebarViewOp", myWindowId, "explorer");
      }
      _isOpen = true;
      updateDrawerVisibility();
      _clearGridCellFocus();
    }
  }

  // ── Tree rendering ────────────────────────────────────────────────────

  private _renderChain: Promise<void> = Promise.resolve();

  private async _renderTree(): Promise<void> {
    // Data is now rendered by Lit template via @state repos/worktrees.
    // This method is kept for backward compatibility - triggers re-render.
    this.requestUpdate();
  }
  private async _toggleRepo(name: string): Promise<void> {
    if (_expandedRepos.has(name)) {
      _expandedRepos.delete(name);
    } else {
      _expandedRepos.add(name);
    }
    savePersistedState();
    await this._renderTree();
  }

  private _toggleDir(path: string, repoName: string): void {
    const worktrees = this._worktreesByRepo.get(repoName) ?? [];
    // Check if it's a worktree branch or a directory
    const isWorktree = worktrees.some((w) => w.branch === path);

    if (isWorktree) {
      const key = repoName + ":" + path;
      if (_expandedWorktrees.has(key)) {
        _expandedWorktrees.delete(key);
      } else {
        _expandedWorktrees.add(key);
        // Fetch files for re-render
        const wt = worktrees.find((w) => w.branch === path);
        if (wt && wt.exists) {
          window.openp41ge.file.readdir(wt.path).then(() => {
            this._renderTree();
          });
        }
      }
    } else {
      // Directory toggle
      if (_expandedDirs.has(path)) {
        _expandedDirs.delete(path);
      } else {
        _expandedDirs.add(path);
      }
    }

    savePersistedState();
    this._renderTree();
  }

  // ── File opening ───────────────────────────────────────────────────────

  private _openFile(filePath: string, fileName: string, pinned: boolean): void {
    document.dispatchEvent(
      new CustomEvent("openp41ge:open-file", {
        detail: { path: filePath, name: fileName, pinned },
      }),
    );

    // Keep focus if unpinned
    if (!pinned && _isOpen) {
      let tries = 0;
      const refocus = () => {
        if (tries >= 200 || !_isOpen || !this.isConnected) return;
        tries++;
        if (document.activeElement !== this && !this.contains(document.activeElement)) {
          const activeParent = document.activeElement?.closest(".grid-cell, tab-content");
          if (!activeParent) {
            this.focus();
          }
        }
        requestAnimationFrame(refocus);
      };
      requestAnimationFrame(refocus);
    }
  }

  // ── Context menus ─────────────────────────────────────────────────────

  private _onWorktreeContextMenu = (e: CustomEvent): void => {
    const { repoName, branch, x, y } = e.detail;
    this._showWorktreeContextMenu(repoName, branch, x, y);
  };

  private _onRepoContextMenu = (e: CustomEvent): void => {
    const { repoName, x, y } = e.detail;
    this._showRepoContextMenu(repoName, x, y);
  };

  private _onWorktreeRefresh = (_e: CustomEvent): void => {
    this._loadRepos();
  };

  private _onRepoRefresh = (_e: CustomEvent): void => {
    this._loadRepos();
  };

  private async _showWorktreeContextMenu(
    repoName: string,
    branch: string,
    _x: number,
    _y: number,
  ): Promise<void> {
    const worktrees = this._worktreesByRepo.get(repoName) ?? [];
    const items: Array<{ label: string; id: string }> = [];

    if (worktrees.some((w) => w.branch === branch && w.exists)) {
      items.push({ label: "Open in terminal", id: "terminal" });
      items.push({ label: "Pull", id: "pull" });
    }

    setContextMenuActive(true);
    const id = await window.openp41ge.showContextMenu(items);
    setTimeout(() => setContextMenuActive(false), 0);
    if (!id) return;

    switch (id) {
      case "terminal": {
        const winId = window.openp41ge.workspace.getWindowId();
        if (winId) {
          window.openp41ge.workspace.dispatch("addColumnTab", winId, "terminal");
        }
        break;
      }
      case "pull": {
        // Find the repo-tree-item that owns this worktree
        const repoItems = document.querySelectorAll("openp41ge-repo-tree-item");
        let targetItem:
          | (Element & {
              repoName?: string;
              startPullAnimation?: (repoName: string) => void;
              completePullAnimation?: (branch: string) => void;
              _fileLoader?: {
                isWorktreeLoaded: (branch: string) => boolean;
                clearWorktreeFiles: (branch: string) => void;
              };
            })
          | null = null;
        for (const item of repoItems) {
          const ri = item as Element & {
            repoName?: string;
            startPullAnimation?: (repoName: string) => void;
            completePullAnimation?: (branch: string) => void;
            _fileLoader?: {
              isWorktreeLoaded: (branch: string) => boolean;
              clearWorktreeFiles: (branch: string) => void;
            };
          };
          if (ri.repoName === repoName && ri.startPullAnimation) {
            // Found the right repo — start animation on every visible worktree row
            targetItem = ri;
            break;
          }
        }

        if (targetItem) {
          targetItem.startPullAnimation?.(branch);
        }

        try {
          await window.openp41ge.workspaceController.pullBranch(repoName, branch);
          const path = worktrees.find((w) => w.branch === branch)?.path;
          if (path && targetItem) {
            const fileLoader = targetItem._fileLoader;
            if (fileLoader?.isWorktreeLoaded(branch)) {
              fileLoader.clearWorktreeFiles(branch);
              targetItem.completePullAnimation?.(branch);
            } else {
              targetItem.completePullAnimation?.(branch);
            }
          }
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error("Pull failed:", err);
          // Still clear the animation state on failure
          if (targetItem) {
            targetItem.completePullAnimation?.(branch);
          }
        }
        break;
      }
    }
  }

  private async _showRepoContextMenu(repoName: string, _x: number, _y: number): Promise<void> {
    const items: Array<{ label: string; id: string }> = [];

    items.push({ label: "Show git info", id: "git-info" });
    items.push({ label: "Add worktree", id: "add-worktree" });

    setContextMenuActive(true);
    const id = await window.openp41ge.showContextMenu(items);
    setTimeout(() => setContextMenuActive(false), 0);
    if (!id) return;

    switch (id) {
      case "git-info":
        this._openGitTab(repoName);
        break;
      case "add-worktree":
        this._showAddWorktreeDialog(repoName);
        break;
    }
  }

  private _showWorkspaceContextMenu(wsId: string, wsName: string, x: number, y: number): void {
    document.querySelectorAll("openp41ge-contextmenu").forEach((el) => el.remove());

    const menuItems: Array<{ label?: string; action?: () => void; type?: "separator" }> = [];

    menuItems.push({
      label: "Delete workspace",
      action: () => this._deleteWorkspace(wsId),
    });

    const ctx = createOpenp41geContextMenu({
      x,
      y,
      items: menuItems,
      onclose: () => {},
    });
    document.body.appendChild(ctx);
  }

  private async _deleteWorkspace(wsId: string): Promise<void> {
    try {
      await window.openp41ge.workspaceController.deleteWorkspace(wsId);
      const idx = this._workspaceList.findIndex((w) => w.id === wsId);
      if (idx >= 0) this._workspaceList.splice(idx, 1);

      // If deleted the active workspace, switch to first available or none
      if (this._activeWsId === wsId) {
        const next = this._workspaceList[0]?.id ?? null;
        await this._setActiveWorkspace(next);
      }

      // Re-render the drawer
      if (this._wsDrawerEl) {
        this._renderWorkspaceDrawer(this._wsDrawerEl);
      }

      // Notify other windows of the store change
      window.openp41ge.workspaceController.notifyStoreChanged();
    } catch {
      // ignore
    }
  }

  private async _confirmRename(wsId: string): Promise<void> {
    const input = document.getElementById(`ws-rename-input-${wsId}`) as HTMLInputElement | null;
    if (!input) return;
    const newName = input.value.trim();
    if (!newName) return;

    try {
      await window.openp41ge.workspaceController.renameWorkspace(wsId, newName);

      // Update local workspace list
      const ws = this._workspaceList.find((w) => w.id === wsId);
      if (ws) {
        ws.name = newName;
      }

      this._renamingWsId = null;

      // Re-render drawer
      if (this._wsDrawerEl && this._wsDrawerOpen) {
        this._renderWorkspaceDrawer(this._wsDrawerEl);
      }

      // Notify other windows
      window.openp41ge.workspaceController.notifyStoreChanged();
    } catch {
      // ignore
    }
  }

  private async _deleteWorktree(repoName: string, branch: string): Promise<void> {
    const confirmed = await showConfirmModal({
      message: `Delete worktree "${branch}"?`,
      detail: "This will remove the worktree files and prune the git worktree.",
      confirmLabel: "Delete",
    });
    if (!confirmed) return;

    try {
      const repo = await this._repoService.getRepo(repoName);
      if (repo) {
        await repo.deleteWorktree(branch);
      } else {
        await window.openp41ge.workspaceController.deleteWorktree(repoName, branch);
      }
      toastService.show(`Worktree "${branch}" deleted`, "success");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toastService.show(msg, "error", 5000);
    }
    await this._loadRepos();
  }

  private _showFileContextMenu(path: string, name: string, x: number, y: number): void {
    document.querySelectorAll("openp41ge-contextmenu").forEach((el) => el.remove());
    const ctx = createOpenp41geContextMenu({
      x,
      y,
      items: [
        {
          label: "Open preview",
          action: () => this._openFile(path, name, false),
        },
        {
          label: "Open in editor",
          action: () => this._openFile(path, name, true),
        },
      ],
      onclose: () => {},
    });
    document.body.appendChild(ctx);
  }

  // ── Add worktree dialog ───────────────────────────────────────────────

  // ── Inline add worktree ──

  private async _doAddWorktree(repoName: string, branch: string): Promise<void> {
    if (!repoName || !branch) {
      toastService.show("Invalid repo or branch name", "error");
      return;
    }

    try {
      toastService.show(`Creating worktree "${branch}"...`, "info");
      const repo = await this._repoService.getRepo(repoName);
      if (repo) {
        await repo.checkoutWorktree(branch);
      } else {
        await window.openp41ge.workspaceController.checkoutWorktree(repoName, branch);
      }
      toastService.show(`Worktree "${branch}" created`, "success");
      await window.openp41ge.workspaceController.worksetAddWorktreeToRepo(repoName, branch);
      if (this._activeWsId) {
        await window.openp41ge.workspaceController.addWorktree(this._activeWsId, repoName, branch);
        window.openp41ge.workspaceController.notifyStoreChanged();
      }
      await this._loadRepos();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toastService.show(msg, "error", 5000);
      await this._loadRepos();
    }
  }

  // ── Add repo inline ──────────────────────────────────────────────────

  private _renderAddRepoInput(): void {
    _showingAddRepo = true;
    this.requestUpdate();
    // Focus the input after render
    requestAnimationFrame(() => {
      (this.querySelector("#wt-addrepo-input") as HTMLInputElement | null)?.focus();
    });
  }
  private _showAddRepoInline(): void {
    this._renderAddRepoInput();
  }

  private _cancelAddRepo(): void {
    _showingAddRepo = false;
    this._cloneUrl = "";
    this.requestUpdate();
  }

  private async _confirmAddRepo(): Promise<void> {
    const input = this.querySelector("#wt-addrepo-input") as HTMLInputElement | null;
    if (!input) return;

    const url = input.value.trim();
    if (!url) {
      toastService.show("Please enter a URL", "error");
      return;
    }
    if (!url.startsWith("http") && !url.startsWith("git@") && !url.startsWith("ssh://")) {
      toastService.show("Invalid URL format. Use https://, git@, or ssh://", "error");
      return;
    }

    // Stop rendering the input — we'll show spinner via DOM manipulation
    _showingAddRepo = false;

    // Replace input row with spinner
    const row = this.querySelector("#wt-addrepo-row") as HTMLElement | null;
    if (row) {
      row.innerHTML = `
        <span style="width:16px;display:flex;align-items:center;justify-content:center;">
          <svg width="10" height="10" viewBox="0 0 16 16" fill="none"><polyline points="6,4 10,8 6,12" stroke="#666" stroke-width="1.5" fill="none"/></svg>
        </span>
        <span style="margin-left:6px;flex:1;color:var(--text-secondary);font-size:12px;">${this._escapeHtml(url)}</span>
        <div class="wt-spinner" style="width:14px;height:14px;flex-shrink:0;border:2px solid #444;border-top-color:var(--accent-hover);border-radius:50%;animation:wt-spin 0.8s linear infinite;"></div>
      `;
    }

    // Create progress bar if needed
    if (!this._cloneProgressBar) {
      this._cloneProgressBar = document.createElement("div");
      this._cloneProgressBar.style.cssText =
        "display:none;height:3px;background:var(--accent);width:0%;transition:width 0.3s ease;";
      this._treeEl?.appendChild(this._cloneProgressBar);
    }
    if (this._cloneProgressBar) {
      this._cloneProgressBar.style.display = "block";
      this._cloneProgressBar.style.width = "0%";
    }

    this._cloneUrl = url;
    await this._startClone(url);
  }

  private async _showAddWorktreeDialog(repoName: string = ""): Promise<void> {
    if (!repoName) return;

    let branches: string[] = [];
    try {
      branches = await window.openp41ge.workspaceController.listBranches(repoName);
    } catch {
      branches = [];
    }

    const overlay = document.createElement("div");
    overlay.style.cssText = `
      position:fixed;inset:0;z-index:1000;
      background:rgba(0,0,0,0.5);
      display:flex;align-items:center;justify-content:center;
    `;

    const dialog = document.createElement("div");
    dialog.style.cssText = `
      background:var(--bg-tertiary);border:1px solid var(--border-color);border-radius:8px;
      padding:24px;width:360px;max-width:90vw;
      box-shadow:0 8px 32px rgba(0,0,0,0.4);
    `;

    const branchOptions = branches
      .map((b) => `<option value="${b.replace(/"/g, "&quot;")}">${this._escapeHtml(b)}</option>`)
      .join("");

    dialog.innerHTML = `
      <div style="margin-bottom:16px;">
        <div style="color:#eee;font-size:14px;font-weight:600;margin-bottom:4px;">Add Worktree</div>
        <div style="color:var(--text-muted);font-size:11px;">Select or type a branch name for ${this._escapeHtml(repoName)}</div>
      </div>
      <div style="margin-bottom:8px;">
        <select id="wt-branch-select" style="
          width:100%;box-sizing:border-box;padding:8px 10px;
          background:var(--bg-gutter);border:1px solid var(--border-color);border-radius:4px;
          color:#ddd;font-size:12px;
        ">
          <option value="">-- Type a new branch or select --</option>
          ${branchOptions}
        </select>
      </div>
      <input id="wt-branch-input" type="text" placeholder="Or type a new branch name"
        style="
          width:100%;box-sizing:border-box;padding:8px 10px;
          background:var(--bg-gutter);border:1px solid var(--border-color);border-radius:4px;
          color:#ddd;font-size:13px;
        "
      />
      <div id="wt-addwt-error" style="color:#c55;font-size:11px;margin-top:6px;display:none;"></div>
      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:16px;">
        <button id="wt-addwt-cancel" style="
          background:var(--bg-tertiary);border:1px solid var(--border-light);border-radius:4px;
          color:#aaa;font-size:12px;padding:6px 16px;cursor:pointer;
        ">Cancel</button>
        <button id="wt-addwt-confirm" style="
          background:var(--accent);border:none;border-radius:4px;
          color:#fff;font-size:12px;padding:6px 16px;cursor:pointer;
        ">Add</button>
      </div>
    `;

    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    const select = dialog.querySelector("#wt-branch-select") as HTMLSelectElement;
    const input = dialog.querySelector("#wt-branch-input") as HTMLInputElement;
    const errorEl = dialog.querySelector("#wt-addwt-error") as HTMLElement;
    const cancelBtn = dialog.querySelector("#wt-addwt-cancel") as HTMLElement;
    const confirmBtn = dialog.querySelector("#wt-addwt-confirm") as HTMLElement;

    // Sync select and input
    select.addEventListener("change", () => {
      if (select.value) {
        input.value = select.value;
      }
    });

    const close = () => overlay.remove();

    input.focus();
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") confirmBtn.click();
      if (e.key === "Escape") close();
    });
    cancelBtn.addEventListener("click", close);
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) close();
    });

    confirmBtn.addEventListener("click", async () => {
      let branch = input.value.trim();
      if (!branch) {
        branch = select.value;
      }
      if (!branch) {
        errorEl.textContent = "Please select or enter a branch name";
        errorEl.style.display = "block";
        return;
      }

      errorEl.style.display = "none";
      close();

      try {
        await this._gitService.addWorktree(repoName, branch);
        toastService.show(`Worktree "${branch}" created`, "success");
        await this._loadRepos();
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        toastService.show(msg, "error", 5000);
      }
    });
  }

  // ── Public API ────────────────────────────────────────────────────────

  isOpen(): boolean {
    return _isOpen;
  }

  /**
   * Dispatch setSidebarViewOp to persist the open state,
   * then immediately update the DOM for responsiveness.
   */
  open(): void {
    // Dispatch operation to persist
    const myWindowId = window.openp41ge?.workspace?.getWindowId?.() ?? "";
    if (myWindowId) {
      window.openp41ge?.workspace?.dispatch?.("setSidebarViewOp", myWindowId, "explorer");
    }
    _isOpen = true;
    updateDrawerVisibility();
    this.focus();
    _clearGridCellFocus();
    this._loadRepos();
  }

  close(): void {
    // Dispatch operation to persist
    const myWindowId = window.openp41ge?.workspace?.getWindowId?.() ?? "";
    if (myWindowId) {
      window.openp41ge?.workspace?.dispatch?.("setSidebarViewOp", myWindowId, null);
    }
    _isOpen = false;
    updateDrawerVisibility();
    _restoreGridFocus();
    this.blur();
  }

  toggle(): void {
    if (_isOpen) {
      this.close();
    } else {
      this.open();
    }
  }

  /** Toggle visibility edit mode. Called from the sidebar bottom bar. */
  toggleEditMode(): void {
    this._toggleEditMode();
  }

  /**
   * Get the last active grid cell column, or 0 if unknown.
   */
  private _getLastActiveCellCol(): number {
    // Use Openp41geTabsEventHandler tracking
    const tabGrid = document.querySelector("tab-grid");
    if (tabGrid) {
      const winId =
        (tabGrid as HTMLElement & { winId?: string }).winId ||
        window.openp41ge.workspace.getWindowId();
      if (winId) {
        return Openp41geTabsEventHandler.getLastFocusedCol(winId);
      }
    }
    return 0;
  }

  /**
   * Check if a git-repository tab for this repo already exists in the target column.
   * If found, activates it and returns true.
   */
  private _activateExistingGitTabInCell(
    repoName: string,
    winId: string,
    targetCol: number,
    ws: Workspace,
  ): boolean {
    const tabs = ws.tabs as Record<string, Tab | undefined>;
    const win = ws.windows.find((w) => w.id === winId);
    if (!win) return false;
    const placement = win.grid.placements.find(
      (p) => p.position.row === 0 && p.position.col === targetCol,
    );
    if (!placement) return false;

    for (const tabId of placement.tabIds) {
      const tab = tabs[tabId];
      if (tab && tab.appType === "git-repository" && tab.config?.filePath === repoName) {
        window.openp41ge.workspace.dispatch("activateTabInCell", winId, tabId);
        return true;
      }
    }
    return false;
  }

  /**
   * Open the git repository for a given repo in a new tab.
   * Opens in the last active grid cell. Reuses an existing tab only
   * if the last active cell already has a git-repository tab for this repo.
   */
  private _openGitTab(repoName: string): void {
    const winId = window.openp41ge.workspace.getWindowId();
    if (!winId) return;

    const ws = appServices.workspaceState.getWorkspace();
    if (!ws) {
      toastService.show("Select a workspace to view git info", "info", 3000);
      return;
    }
    const win = ws.windows.find((w) => w.id === winId);
    if (!win) return;

    const targetCol = this._getLastActiveCellCol();

    // Only reuse if the last active cell already has the git tab for this repo
    if (this._activateExistingGitTabInCell(repoName, winId, targetCol, ws)) {
      (window as unknown as Record<string, unknown>).__pendingGitRepo = repoName;
      return;
    }

    // No existing tab in the target cell — create a new one in the last active cell
    (window as unknown as Record<string, unknown>).__pendingGitRepo = repoName;
    window.openp41ge.workspace.dispatch(
      "addColumnTabAt",
      winId,
      "git-repository",
      repoName,
      repoName,
      targetCol,
    );
  }

  private _escapeHtml(str: string): string {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
}

// ─── Register element ──────────────────────────────────────────────────
customElements.define("openp41ge-worktree-tree", Openp41geWorktreeTree);

export { Openp41geWorktreeTree };
