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

import { LitElement, html, type nothing, type TemplateResult } from "lit";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import { state, property } from "lit/decorators.js";
import { toastService } from "./openp41ge-toast";
import { repoTreeRenderer } from "../services/repo-tree-renderer";
import { plusIconThick } from "../icons";
import { showConfirmModal } from "./openp41ge-confirm-modal";
import "./openp41ge-repo-tree-item";
import { workspaceFileService, deriveRepoName } from "../services/workspace-file-service";
import { TabActivationHistory } from "../services/tab-activation-history";
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
    const inSidebar = el.closest?.("openp41ge-sidebar") != null;
    el.style.position = "relative";
    el.style.inset = "auto";
    el.style.zIndex = "";

    if (inSidebar) {
      // Explorer tree mounted in a sidebar fills the sidebar — it is never a
      // collapsible overlay drawer there, so don't collapse it to 0 width.
      el.style.width = "100%";
      el.style.height = "100%";
      el.style.borderLeft = "none";
    } else {
      el.style.width = _isOpen ? "" : "0";
      el.style.height = "";
      el.style.borderLeft = _isOpen ? "1px solid #2a2a2a" : "none";
    }

    const drawer = el.querySelector(".wt-drawer") as HTMLElement | null;
    if (drawer) {
      drawer.style.width = "";
    }
    const notch = el.querySelector(".wt-resize-notch") as HTMLElement | null;
    if (notch) {
      notch.style.display = inSidebar ? "none" : _isOpen ? "" : "none";
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
  private _scrollResizeObserver: ResizeObserver | null = null;
  private _scrollResizeObserved = false;
  /** Explorer row currently selected by click or keyboard (VS Code-style). */
  private _focusedRowEl: HTMLElement | null = null;

  /** Row the user most recently CLICKED. Keeps a faded-blue background until
   * another row is clicked (VS Code's selection); the arrow focus is a
   * separate, moving highlight with the blue outline on top. */
  private _selectedRowEl: HTMLElement | null = null;

  /** Whether the Explorer owns keyboard focus. The arrow-focus border hides
   * when the user clicks outside the Explorer (VS Code behaviour) while the
   * clicked-file faded background stays. */
  private _navFocusVisible = true;
  @property() worksetId = "";
  private _prevWorksetId = "";
  @state() private _editMode = false;
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
  private _onProjectChanged = (): void => {
    if (this._suspended) {
      // Keep alive: a change while hidden just marks the tab dirty; it is
      // reconciled in place on the next setVisible(true) call.
      this._suspendDirty = true;
      return;
    }
    this._loadRepos();
  };

  /**
   * Route the explorer-reorder-repos event (fired by ExplorerReorderDropTarget)
   * to a reorder of the ACTIVE WORKSPACE's `repos` array + persistence. Repos
   * belong to the workspace, so the order is shared with the Workspaces overlay.
   */
  private _onExplorerReorder = async (e: Event): Promise<void> => {
    const detail = (e as CustomEvent).detail as {
      repoName: string;
      fromIndex: number;
      dropIndex: number;
    };
    if (!detail?.repoName) return;
    const data = workspaceFileService.openData;
    if (!data) return;

    const repos = [...(data.repos ?? [])];
    const fromIdx =
      detail.fromIndex >= 0
        ? detail.fromIndex
        : repos.findIndex((r) => deriveRepoName(r.url) === detail.repoName);
    if (fromIdx === -1 || fromIdx === detail.dropIndex || detail.dropIndex === fromIdx + 1) {
      return;
    }
    const [moved] = repos.splice(fromIdx, 1);
    repos.splice(detail.dropIndex > fromIdx ? detail.dropIndex - 1 : detail.dropIndex, 0, moved);
    data.repos = repos;
    await workspaceFileService.save();
    document.dispatchEvent(new CustomEvent("project:changed"));
  };

  /** Initiate a pointer-event drag to reorder a repo in the explorer tree. */
  private _loading = true;
  private _errorMessage = "";
  private _errorRetry: (() => void) | null = null;
  private _loadingRepos = false;
  private _pendingLoadAfterTreeReady = false;
  /** Guards against re-entering _loadRepos() from updated() on every Lit cycle. */
  private _hasLoadedOnce = false;

  /** Gate: without a selected workspace the explorer shows a disabled hint. */
  private _hasWorkspace = workspaceFileService.openFilePath != null;
  private _workspaceUnsub: (() => void) | null = null;
  @state() private _repos: Array<{ path: string; name: string; url: string }> = [];
  constructor() {
    super();
    this._injectStyles();
  }

  private _injectStyles(): void {
    if (document.getElementById("wt-scrollbar-style")) return;
    const s = document.createElement("style");
    s.id = "wt-scrollbar-style";
    s.textContent = `
      openp41ge-worktree-tree { outline: none; box-shadow: -6px 0 8px rgba(0,0,0,0.1); display: flex; flex-direction: column; height: 100%; }
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
      /* VS Code-style keyboard/click selection for file/folder rows AND
         repo/worktree headers. Two-class specificity keeps it above the row
         :hover highlight. The arrow cursor stays blue (background + outline).
         The last-clicked stationary row is a light grey derived from the
         border color. Header rows use CSS classes; file/folder rows use the
         inline styles painted in _paintRow (shadow roots). */
      .wt-tree-scroll openp41ge-tree {
        --tree-selected-bg: color-mix(in srgb, var(--border-divider, #2d2d2d) 60%, transparent);
      }
      .wt-row-header.wt-row-focused {
        background: rgba(74, 158, 255, 0.12);
        box-shadow: inset 0 0 0 1px var(--tree-focus, #4a9eff);
      }
      .wt-row-header.wt-row-selected {
        background: color-mix(in srgb, var(--border-divider, #2d2d2d) 60%, transparent);
      }
      /* Rows already have padding-right:8px in their inline styles, so
         the overlay scrollbar sits in the padded area — content text/buttons
         are never hidden underneath it. Row backgrounds fill the full width
         (edge to edge) because .wt-tree-scroll-content has no padding. */
      /* When the tree fills the drawer, hide the last child's bottom border
         so it cannot double up with the bottom bar's top border. */
      .wt-tree-scroll.full .wt-tree-scroll-content > :last-child { border-bottom: 0; }
      #wt-addrepo-row:focus-within,
      #wt-addwt-row:focus-within { outline: 2px solid #4a9eff; outline-offset: -2px; }
      /* The add-repo/add-worktree inputs must never paint their own focus ring —
         only the row's :focus-within outline is allowed. */
      #wt-addrepo-input:focus, #wt-addrepo-input:focus-visible,
      #wt-addwt-input:focus, #wt-addwt-input:focus-visible,
      #ws-add-input:focus, #ws-add-input:focus-visible {
        outline: none !important;
        box-shadow: none !important;
      }
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

  // ─── Keep-alive (called by the sidebar via SystemTabController.setVisible) ──

  /** True while this tab is hidden; the tree then does no background work. */
  private _suspended = false;
  /** A data change arrived while suspended → reload (in place) on show. */
  private _suspendDirty = false;

  /** Keep-alive hook: pause background reloads while the tab is hidden. The
   * browser already stops rendering a display:none subtree; this gates the
   * document-level listeners/timers display:none cannot stop. On show, reload
   * only if something changed (dirty flag) and resync the scroll/fill math. */
  public setVisible(visible: boolean): void {
    this._suspended = !visible;
    if (visible) {
      if (this._suspendDirty) {
        this._suspendDirty = false;
        void this._loadRepos();
      }
      // Sizes changed while hidden (0-sized boxes, sidebar resize) — resync
      // without a full reload.
      requestAnimationFrame(() => this._syncScrollbar());
    }
  }

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

    this.className = "flex flex-row overflow-hidden shrink-0 min-w-0 bg-gutter";
    this.style.width = _isOpen ? "280px" : "0";
    this.style.borderLeft = _isOpen ? "1px solid #2a2a2a" : "none";

    this.addEventListener("keydown", this._onKeyDown);
    this.addEventListener("click", this._onPanelClick);
    if (!this.hasAttribute("tabindex")) {
      this.setAttribute("tabindex", "-1");
    }
    this.addEventListener("mousedown", this._onMousedownFocus);
    // Hide the arrow-focus border when the user interacts anywhere outside
    // the Explorer (VS Code behaviour); show it again when they return.
    // CAPTURE phase: components elsewhere in the app (grid cells, the file
    // editor's shadow root) call stopPropagation() on mousedown, which would
    // kill a bubble-phase document listener and leave the cursor visible
    // forever. Capture fires before any of those handlers run.
    document.addEventListener("mousedown", this._onDocMousedown, true);
    // Enforce the single-border invariant the instant a row gains DOM focus
    // (capture, so it wins regardless of other handlers).
    document.addEventListener("focusin", this._onDocFocusIn, true);
    this.addEventListener("worktree-contextmenu", this._onWorktreeContextMenu as EventListener);
    this.addEventListener("repo-contextmenu", this._onRepoContextMenu as EventListener);
    // Uikit <openp41ge-tree> nodes stop propagation of the DOM click event,
    // so the panel's bubble-phase _onPanelClick never sees file/folder rows.
    // Adopt selection from the composed tree-node-* events instead, so a
    // mouse click overwrites the arrow-navigation focus the same way a
    // keypress does.
    this.addEventListener("tree-node-click", this._onTreeNodeActivated as EventListener);
    this.addEventListener("tree-node-dblclick", this._onTreeNodeActivated as EventListener);
    this.addEventListener("tree-node-toggle", this._onTreeNodeActivated as EventListener);

    // Reload when the project is switched (e.g. via project picker)
    document.addEventListener("project:changed", this._onProjectChanged);

    // Explorer repo reorder — fired by the unified drag pipeline when a repo
    // row is dropped over the explorer list (ExplorerReorderDropTarget). The
    // legacy native HTML5 reorder handlers were removed with the native drag.
    this.addEventListener("explorer-reorder-repos", this._onExplorerReorder);

    // Sync open/closed state from the workspace state on initial mount.
    // This is needed because _syncExplorerState is also called from willUpdate
    // but only fires when worksetId changes — which may not happen on first mount
    // (worksetId is often "" when the tree is first created).
    this._syncExplorerState();

    // Workspace gate: show a disabled hint until a workspace is selected. When
    // the selection changes (top-bar workspace picker) revalidate in place.
    this._workspaceUnsub = workspaceFileService.onChange(() => {
      const has = workspaceFileService.openFilePath != null;
      if (has === this._hasWorkspace) return;
      this._hasWorkspace = has;
      if (has) {
        this.requestUpdate();
        this._loadRepos();
      } else {
        this._repos = [];
        this._worktreesByRepo.clear();
        this.requestUpdate();
      }
    });

    // Initial load
    this._loadRepos();
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    window.removeEventListener("resize", this._onWindowResize);
    this._gitDisconnected = true;

    if (this._workspaceUnsub) {
      this._workspaceUnsub();
      this._workspaceUnsub = null;
    }

    if (this._scrollResizeObserver) {
      this._scrollResizeObserver.disconnect();
      this._scrollResizeObserver = null;
      this._scrollResizeObserved = false;
    }

    document.removeEventListener("project:changed", this._onProjectChanged);
    this.removeEventListener("explorer-reorder-repos", this._onExplorerReorder);
    this.removeEventListener("keydown", this._onKeyDown);
    this.removeEventListener("click", this._onPanelClick);
    this.removeEventListener("mousedown", this._onMousedownFocus);
    document.removeEventListener("mousedown", this._onDocMousedown, true);
    document.removeEventListener("focusin", this._onDocFocusIn, true);
    this.removeEventListener("worktree-contextmenu", this._onWorktreeContextMenu as EventListener);
    this.removeEventListener("repo-contextmenu", this._onRepoContextMenu as EventListener);
    this.removeEventListener("tree-node-click", this._onTreeNodeActivated as EventListener);
    this.removeEventListener("tree-node-dblclick", this._onTreeNodeActivated as EventListener);
    this.removeEventListener("tree-node-toggle", this._onTreeNodeActivated as EventListener);
  }

  // ═══ Lit template ═══════════════════════════════════════════════════

  /**
   * Lit render() outputs the outer skeleton with new sub-components.
   * The tree content (repos, worktrees) is rendered by <openp41ge-repo-tree-item>.
   * _renderTree() is still called for async data loading.
   */
  render(): TemplateResult | typeof nothing {
    // No workspace selected → a disabled placeholder instead of the tree.
    if (!this._hasWorkspace) {
      return html`
        <div
          style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;box-sizing:border-box;padding:16px;"
        >
          <div
            style="font-size:12px;line-height:1.4;text-align:center;color:var(--text-muted,#777);user-select:none;"
          >
            Select a workspace to get started
          </div>
        </div>
      `;
    }
    return html`
      <div
        class="wt-drawer flex flex-col overflow-hidden flex-1 min-h-0 w-full bg-gutter relative select-none"
      >
        <div class="wt-tree-scroll-wrapper flex-1 relative min-h-0">
          <div class="wt-tree-scroll absolute inset-0 overflow-y-auto overflow-x-hidden">
            <div class="wt-tree-scroll-content" data-explorer-drop-zone>
              ${this._repos.map((repo) => {
                const worktrees = this._worktreesByRepo.get(repo.name) ?? [];
                return html`
                  <div class="flex items-stretch w-full">
                    <openp41ge-repo-tree-item
                      class="flex-1 min-w-0"
                      .repoName=${repo.name}
                      .repoUrl=${repo.url}
                      .worksetId=${this.worksetId}
                      .worktrees=${worktrees}
                      .editMode=${this._editMode}
                      @repo-toggle-expand=${(e: CustomEvent) => {
                        const { repoName: rn, expanded } = e.detail;
                        if (expanded) _expandedRepos.add(rn);
                        else _expandedRepos.delete(rn);
                        savePersistedState();
                      }}
                      @repo-add-worktree=${(e: CustomEvent) => {
                        this._doAddWorktree(e.detail.repoName, e.detail.branch);
                      }}
                      @worktree-files-toggle=${(e: CustomEvent) => {
                        const { repoName: rn, branch, expanded } = e.detail;
                        const key = rn + ":" + branch;
                        if (expanded) _expandedWorktrees.add(key);
                        else _expandedWorktrees.delete(key);
                        savePersistedState();
                      }}
                      @dir-toggle-expand=${(e: CustomEvent) => {
                        const { branch, path, expanded } = e.detail;
                        const key = branch + ":" + path;
                        if (expanded) _expandedDirs.add(key);
                        else _expandedDirs.delete(key);
                        savePersistedState();
                      }}
                      @worktree-delete=${async (e: CustomEvent) => {
                        const { branch } = e.detail;
                        const confirmed = await showConfirmModal({
                          message: "Delete worktree",
                          detail: 'Are you sure you want to delete worktree "' + branch + '"?',
                          confirmLabel: "Delete",
                          confirmStyle: "danger",
                        });
                        if (confirmed) {
                          try {
                            await window.openp41ge.workspaceController.deleteWorktree(
                              repo.name,
                              branch,
                            );
                            workspaceFileService.removeWorktreeFromActive(repo.name, branch);
                            await workspaceFileService.save();
                            await this._loadRepos();
                          } catch {
                            /* ignore */
                          }
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
              ${(() => {
                return _showingAddRepo
                  ? html`<div
                      id="wt-addrepo-row"
                      class="flex items-center h-[30px] pl-3 pr-2 text-sm border-b border-divider outline-2 outline-[#2a6fd1] outline-offset-[-2px] transition-[background] duration-100"
                    >
                      <span class="hidden">${unsafeHTML(plusIconThick(16))}</span
                      ><input
                        id="wt-addrepo-input"
                        type="text"
                        placeholder="git clone URL"
                        class="flex-1 min-w-0 h-6 bg-transparent border-none rounded-none text-[#e0e0e0] text-xs px-1.5 outline-none font-inherit ml-2"
                        @keydown=${(e: KeyboardEvent) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            this._confirmAddRepo();
                          }
                          if (e.key === "Escape") {
                            e.preventDefault();
                            this._cancelAddRepo();
                          }
                        }}
                        @blur=${(_e: FocusEvent) => {
                          setTimeout(() => {
                            if (_showingAddRepo) this._cancelAddRepo();
                          }, 150);
                        }}
                      /><span
                        id="wt-addrepo-confirm"
                        class="w-[22px] h-[22px] flex items-center justify-center cursor-pointer rounded shrink-0 ml-1 text-secondary"
                        @click=${() => this._confirmAddRepo()}
                        @mouseenter=${(e: MouseEvent) => {
                          (e.currentTarget as HTMLElement).classList.add("bg-hover");
                        }}
                        @mouseleave=${(e: MouseEvent) => {
                          (e.currentTarget as HTMLElement).classList.remove("bg-hover");
                        }}
                        title="Confirm"
                        ><svg
                          width="14"
                          height="14"
                          viewBox="0 0 16 16"
                          fill="none"
                          stroke="currentColor"
                          stroke-width="2"
                          stroke-linecap="round"
                          stroke-linejoin="round"
                        >
                          <polyline points="4,8 7,11 12,4" /></svg></span
                      ><span
                        id="wt-addrepo-cancel"
                        class="w-[22px] h-[22px] flex items-center justify-center cursor-pointer rounded shrink-0 text-secondary"
                        @click=${() => this._cancelAddRepo()}
                        @mouseenter=${(e: MouseEvent) => {
                          (e.currentTarget as HTMLElement).classList.add("bg-hover");
                        }}
                        @mouseleave=${(e: MouseEvent) => {
                          (e.currentTarget as HTMLElement).classList.remove("bg-hover");
                        }}
                        title="Cancel"
                        ><svg
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
                          <line x1="12" y1="4" x2="4" y2="12" /></svg
                      ></span>
                    </div>`
                  : html`<div
                      class="flex items-center h-[30px] pl-3 pr-2 cursor-pointer select-none text-sm text-muted border-b border-divider transition-[color,background] duration-100"
                      @click=${() => this._showAddRepoInline()}
                      @mouseenter=${(e: MouseEvent) => {
                        (e.currentTarget as HTMLElement).classList.add("bg-hover");
                      }}
                      @mouseleave=${(e: MouseEvent) => {
                        (e.currentTarget as HTMLElement).classList.remove("bg-hover");
                      }}
                    >
                      <span class="w-[10px] h-[30px] flex items-center justify-center shrink-0"
                        ><span class="-translate-x-px inline-flex"
                          >${unsafeHTML(plusIconThick(11))}</span
                        ></span
                      ><span class="add-repo-label ml-1 text-muted flex-1">add repository</span>
                    </div>`;
              })()}
            </div>
            <!-- wt-tree-scroll-content -->
          </div>
          <!-- wt-tree-scroll -->
          <div class="wt-scrollbar-track" @mousedown=${this._onScrollbarTrackMousedown}>
            <div class="wt-scrollbar-thumb" @mousedown=${this._onScrollbarThumbMousedown}></div>
          </div>
        </div>
        <!-- wt-tree-scroll-wrapper -->
        <div
          class="sb-bottom-bar"
          style="border-top:1px solid var(--divider,#333);height:24px;flex-shrink:0;display:flex;align-items:center;padding:0 8px;font-size:12px;color:var(--text-secondary,#999);background:var(--bg-secondary,#252526);"
        >
          <span style="flex:1"></span>
          <button
            type="button"
            title="Editor settings"
            aria-label="Editor settings"
            @click=${this._onSettingsClick}
            style="height:18px;width:18px;display:flex;align-items:center;justify-content:center;padding:0;border:none;border-radius:3px;background:transparent;color:var(--text-secondary,#999);font-size:14px;line-height:1;cursor:pointer;"
          >
            ⚙
          </button>
        </div>
      </div>
    `;
  }

  /**
   * Sync the local _isOpen state from the active workset's sidebar.activeViewId.
   * This ensures the tree opens/closes when switching worksets.
   */
  private _syncExplorerState(): void {
    // When the tree is mounted inside a sidebar (Explorer tab), it is by
    // definition open — the sidebar only mounts the active tab's content, so
    // the tree must never present itself as a collapsed overlay drawer here.
    const inSidebar = this.closest?.("openp41ge-sidebar") != null;
    if (inSidebar) {
      if (!_isOpen) {
        _isOpen = true;
        _clearGridCellFocus();
        // Trigger repo loading — like open() does — so content loads promptly
        // when the explorer is restored from persisted state on startup.
        this._loadRepos();
      }
      return;
    }

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
      systemTabs?: Record<string, { appType?: string }>;
      /** Shared sidebar docking/open state (set/side/open live on the workspace). */
      sidebar?: {
        leftSidebarOpen?: boolean;
        rightSidebarOpen?: boolean;
      };
      windows?: Array<{
        id: string;
        sidebar?: {
          activeLeftTab?: string | null;
          activeRightTab?: string | null;
        };
      }>;
    };
    const win = wss.windows?.find((w: { id: string }) => w.id === myWindowId);
    const sidebar = win?.sidebar;
    if (!sidebar || !wss.sidebar) return;

    // Resolve the active sidebar system tab's appType. The sidebar model
    // persists activation in activeLeftTab/activeRightTab (resolved through
    // systemTabs[].appType), not the legacy activeViewId field. The set/side/
    // open state is shared at the workspace level.
    const resolveActive = (
      tabId: string | null | undefined,
      open: boolean | undefined,
    ): string | null => (open && tabId ? (wss.systemTabs?.[tabId]?.appType ?? null) : null);
    const activeAppType =
      resolveActive(sidebar.activeLeftTab, wss.sidebar.leftSidebarOpen) ??
      resolveActive(sidebar.activeRightTab, wss.sidebar.rightSidebarOpen);

    const shouldBeOpen = activeAppType === "explorer";
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
      // Note: _syncExplorerState should NOT call this.requestUpdate() —
      // it would re-enter the Lit update cycle from within willUpdate/updated,
      // creating an infinite loop. Lit's reactive properties handle re-renders.
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
    if (this._drawerEl) {
      updateDrawerVisibility();
    }

    // Sync custom overlay scrollbar thumb position and bind scroll listener.
    // Use requestAnimationFrame so the browser has performed layout after
    // Lit's DOM update — otherwise scrollHeight may still reflect old
    // content and the scrollbar won't be hidden when content shrinks.
    requestAnimationFrame(() => this._syncScrollbar());
    if (this._treeEl) {
      this._treeEl.removeEventListener("scroll", this._boundScroll);
      this._treeEl.addEventListener("scroll", this._boundScroll, { passive: true });
    }

    // Trigger initial data load once. The _hasLoadedOnce guard prevents
    // re-entry on subsequent Lit update cycles — without it _loadRepos()
    // calls _renderTree() which calls requestUpdate(), causing an
    // infinite Lit update loop.
    if (!this._hasLoadedOnce) {
      this._hasLoadedOnce = true;
      this._loadRepos();
    }

    // Keep the custom scrollbar in sync with content height. Tree rows are
    // rendered by the child <openp41ge-repo-tree-item>, which re-renders
    // independently of this component — so _syncScrollbar() (normally only
    // re-run on our own updated()/scroll) is never re-triggered by child
    // content growth/shrink. Observing the scroll content's box size closes
    // that gap: the track appears as soon as the list overflows and
    // disappears the moment it fits again.
    if (typeof ResizeObserver !== "undefined") {
      const contentEl = this.querySelector(".wt-tree-scroll-content") as HTMLElement | null;
      if (contentEl && !this._scrollResizeObserved) {
        this._scrollResizeObserver = new ResizeObserver(() => this._syncScrollbar());
        this._scrollResizeObserver.observe(contentEl);
        this._scrollResizeObserved = true;
      }
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

    // When the list fills the viewport, drop the *last* row's bottom border so
    // it does not stack with the bottom bar's top border into a single 2px
    // line. Mirrors the Workspaces overlay list (_syncLeftFill + the
    // `.wm-left-scroll.full` rule). CSS-only: no component state, no re-render.
    el.classList.toggle("full", el.scrollHeight >= el.clientHeight - 1);

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
    const target = e.target as HTMLElement | null;
    // Keep DOM focus on the panel for the whole tree, so arrow-key
    // navigation is owned here (VS Code behaviour). Don't steal focus from
    // text-entry controls (add-repository / add-worktree inputs etc.).
    if (target?.matches("input, textarea, select, [contenteditable]")) return;
    // A click on a file/folder row would otherwise hand DOM focus to the
    // tree node (tabindex 0), showing a second :focus-visible ring and
    // letting the inner tree own the arrow keys. The rows aren't draggable,
    // so preventing the default focus change is safe.
    if (target?.closest?.(".tree-node")) {
      e.preventDefault();
    }
    this.focus();
    this._blurFocusedTreeNode();
  };

  /** Returns true if el is a .tree-node row belonging to any of our trees. */
  private _isOurTreeNode(el: HTMLElement | null): boolean {
    if (!el || !el.classList?.contains("tree-node")) return false;
    const root = el.getRootNode();
    const host = root instanceof ShadowRoot ? root.host : null;
    return !!host && this.contains(host);
  }

  /**
   * Resolve the REAL row that currently holds DOM focus. document.activeElement
   * retargets to the <openp41ge-tree> HOST when a node inside its shadow root
   * has focus, so a plain .tree-node check misses it — reach into the host's
   * shadow root to find the focused row.
   */
  private _focusTargetIsOurRow(t: Element | null): HTMLElement | null {
    if (!t) return null;
    // Directly focused row (light-DOM case).
    if (this._isOurTreeNode(t as HTMLElement)) return t as HTMLElement;
    // Retargeted host: the real focused row lives in its shadow root.
    if (t instanceof HTMLElement && this.contains(t)) {
      const host = t as HTMLElement & { shadowRoot?: ShadowRoot | null };
      const inner = host.shadowRoot ? (host.shadowRoot.activeElement as HTMLElement | null) : null;
      if (inner && inner.classList?.contains("tree-node")) return inner;
    }
    return null;
  }

  /**
   * The uikit tree gives its rows tabindex=0, so a row can end up holding
   * real DOM focus (e.g. a browser/OS focus quirk). Its :focus-visible CSS
   * paints the SAME inset blue border as our cursor, and inline styles can't
   * clear it. Blur any such row so the only border that can ever appear is
   * our own cursor paint.
   */
  private _blurFocusedTreeNode(): void {
    const row = this._focusTargetIsOurRow(document.activeElement);
    if (row && row !== this) {
      row.blur();
      if (document.activeElement !== this) this.focus();
    }
  }

  /**
   * ENFORCE the invariant: only the arrow-cursor row may carry a blue
   * outline. Walks every Explorer row (headers and shadow-root tree nodes)
   * and strips any inline focus border / wt-row-focused class from a row
   * that is NOT the live cursor. Runs on every repaint AND on every focusin,
   * so a stray border from any source (re-render, uikit's own keyboard
   * path, :focus-visible) is corrected immediately.
   */
  private _enforceSingleBorder(): void {
    const cursor =
      this._navFocusVisible && this._focusedRowEl?.isConnected ? this._focusedRowEl : null;
    const walk = (root: ParentNode) => {
      for (const el of Array.from(root.children)) {
        if (!(el instanceof HTMLElement)) continue;
        if (el.tagName === "OPENP41GE-TREE") {
          const root2 = (el as unknown as HTMLElement & { shadowRoot?: ShadowRoot | null })
            .shadowRoot;
          if (root2) walk(root2);
        } else if (el.classList.contains("tree-node")) {
          if (el !== cursor && el.style.boxShadow) el.style.boxShadow = "";
        } else if (el.classList.contains("wt-row-header")) {
          if (el !== cursor) el.classList.remove("wt-row-focused");
        } else {
          walk(el);
        }
      }
    };
    walk(this);
  }

  /**
   * DOM focus can land on a tabindex=0 row from ANY source (mouse default
   * action, keyboard, programmatic). The moment it does, the uikit's
   * :focus-visible paints a border inline styles can't clear. This capture
   * listener blurs the row immediately and re-enforces the single-border
   * invariant. Capture phase so it wins even if another handler would stop
   * propagation on focusin.
   */
  private _onDocFocusIn = (e: FocusEvent): void => {
    const row = this._focusTargetIsOurRow(e.target as HTMLElement | null);
    if (row) {
      row.blur();
      if (document.activeElement !== this) this.focus();
      this._enforceSingleBorder();
    }
  };

  /**
   * True when a mousedown target lands on (or inside) one of our file rows
   * or a uikit tree host — used by the capture-phase guard to stop the
   * browser's default focus action before it can ever put DOM focus on a
   * tabindex=0 row.
   */
  private _isExplorerRowOrHost(el: HTMLElement): boolean {
    if (el.tagName === "OPENP41GE-TREE" && this.contains(el)) return true;
    return this._isOurTreeNode(el);
  }

  /**
   * VS Code behaviour: clicking outside the Explorer hides the arrow-focus
   * border (the navigation cursor), while the clicked-file faded background
   * stays visible. Clicking back inside restores the border.
   */
  private _onDocMousedown = (e: MouseEvent): void => {
    // Capture-phase safety net (runs before any other handler can stop
    // propagation): a real mousedown on a tabindex=0 row would otherwise
    // let the browser's DEFAULT action focus the row, and the uikit's
    // :focus-visible would paint a border inline styles can't clear. Stop
    // that default HERE so DOM focus can never land on a row.
    if (e.composedPath().some((p) => p instanceof HTMLElement && this._isExplorerRowOrHost(p))) {
      e.preventDefault();
    }
    const inside = e
      .composedPath()
      .some((p) => p instanceof Node && (p === this || this.contains(p)));
    if (inside) {
      if (!this._navFocusVisible) {
        this._navFocusVisible = true;
        this._repaintSelection();
      }
    } else if (this._navFocusVisible) {
      this._navFocusVisible = false;
      this._repaintSelection();
    }
  };

  // ── Key handler ───────────────────────────────────────────────────────

  /**
   * VS Code-style tree navigation for the whole Explorer panel.
   *
   * Rows are flattened from the live DOM in visual order:
   *   repo header → worktree headers → each worktree's file tree nodes → next repo.
   * Collapsed levels aren't in the DOM, so the flattening is always correct.
   *
   * - ArrowDown/Up, Home, End  — move selection.
   * - ArrowRight               — expand a collapsed repo/worktree/folder.
   * - ArrowLeft                — collapse an expanded one, else move to parent.
   * - Enter/Space              — toggle expandables / activate file leaves.
   */
  private _onKeyDown = (e: KeyboardEvent) => {
    this._navFocusVisible = true; // keyboard interaction re-shows the cursor
    const rows = this._navigableRows();
    if (rows.length === 0) return;

    if (this._focusedRowEl && !this._focusedRowEl.isConnected) this._focusedRowEl = null;
    const selectedIdx = this._focusedRowEl ? rows.indexOf(this._focusedRowEl) : -1;
    // With nothing focused yet, the first arrow selects the first row
    // (VS Code behaviour) instead of advancing from index 0.
    const idx = selectedIdx < 0 ? 0 : selectedIdx;
    const focusAt = (i: number) => {
      this._setFocusedRow(rows[Math.max(0, Math.min(i, rows.length - 1))]);
    };

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        focusAt(selectedIdx < 0 ? 0 : selectedIdx + 1);
        break;
      case "ArrowUp":
        e.preventDefault();
        focusAt(selectedIdx < 0 ? 0 : selectedIdx - 1);
        break;
      case "Home":
        e.preventDefault();
        focusAt(0);
        break;
      case "End":
        e.preventDefault();
        focusAt(rows.length - 1);
        break;
      case "ArrowRight": {
        e.preventDefault();
        const el = rows[idx];
        if (!this._isExpandable(el) || this._isExpanded(el)) break;
        this._fireToggle(el);
        break;
      }
      case "ArrowLeft": {
        e.preventDefault();
        const el = rows[idx];
        if (this._isExpandable(el) && this._isExpanded(el)) {
          this._fireToggle(el);
        } else {
          const parent = this._parentRow(el);
          if (parent) this._setFocusedRow(parent);
        }
        break;
      }
      case "Enter":
      case " ": {
        e.preventDefault();
        const el = rows[idx];
        if (this._isExpandable(el)) {
          this._fireToggle(el);
        } else if (el.classList.contains("tree-node")) {
          // Activate a file leaf — same as a left-click (opens preview).
          el.click();
        }
        break;
      }
    }
  };

  /** Explorer tab's settings button — opens the file-editor settings grid tab. */
  private _onSettingsClick = () => {
    document.dispatchEvent(
      new CustomEvent("openp41ge:open-explorer-settings", {
        bubbles: true,
        composed: true,
        detail: { appType: "file-editor-settings", title: "Editor" },
      }),
    );
  };

  private _onPanelClick = (e: Event) => {
    // composedPath() crosses the <openp41ge-tree> shadow boundary so we can
    // adopt selection of clicked file/folder rows too. Header rows (repo /
    // worktree) also take selection — they expand on their own click but
    // still adopt the cursor + stationary grey highlight like any other row.
    const node = e
      .composedPath()
      .find(
        (p): p is HTMLElement => p instanceof HTMLElement && p.classList?.contains("tree-node"),
      );
    const row = e
      .composedPath()
      .find(
        (p): p is HTMLElement => p instanceof HTMLElement && p.classList?.contains("wt-row-header"),
      );
    const target = node ?? row;
    if (target) {
      // Clicking selects AND focuses the row: it keeps a faded background
      // (selection) while the arrow focus adds the outline and can move away
      // without stealing it.
      this._navFocusVisible = true;
      this._selectedRowEl = target;
      this._setFocusedRow(target);
    }
  };

  /**
   * Selected/toggled a node inside a uikit <openp41ge-tree> (file or folder
   * row). The tree calls stopPropagation() on the underlying click event, so
   * _onPanelClick can't see these rows. Adopt selection here from the node's
   * data-node-id instead — this is what the user actually clicked, and arrow
   * navigation must continue from here (overwriting any prior arrow focus).
   * Adoption is synchronous (RAF schedules too late / never runs when the
   * window is backgrounded); a short deferred re-resolve only refreshes the
   * SELECTION element reference (an expand/collapse may have replaced the
   * node) — it never steals arrow focus back from a row the user moved to.
   */
  private _onTreeNodeActivated = (e: CustomEvent): void => {
    const detail = e.detail as { nodeId?: string } | undefined;
    const nodeId = detail?.nodeId;
    if (typeof nodeId !== "string" || !nodeId) return;
    const el = this._findTreeNodeByNodeId(nodeId);
    if (el) {
      this._navFocusVisible = true;
      this._selectedRowEl = el;
      this._setFocusedRow(el);
    }
    setTimeout(() => {
      const el2 = this._findTreeNodeByNodeId(nodeId);
      if (el2 && el2.isConnected && this._selectedRowEl?.dataset?.nodeId === el2.dataset?.nodeId) {
        this._selectedRowEl = el2;
        this._repaintSelection();
      }
    }, 60);
  };

  /**
   * Resolve a node id to its current .tree-node element anywhere inside the
   * panel (uikit <openp41ge-tree> shadow roots, or light DOM). Useful because
   * tree nodes are recreated on expand/collapse.
   */
  private _findTreeNodeByNodeId(nodeId: string): HTMLElement | null {
    const walk = (root: ParentNode): HTMLElement | null => {
      for (const el of Array.from(root.children)) {
        if (!(el instanceof HTMLElement)) continue;
        if (el.tagName === "OPENP41GE-TREE") {
          const sr = (el as HTMLElement & { shadowRoot?: ShadowRoot | null }).shadowRoot;
          const hit = sr ? walk(sr) : null;
          if (hit) return hit;
          continue;
        }
        if (el.dataset?.nodeId === nodeId) return el;
        const hit = walk(el);
        if (hit) return hit;
      }
      return null;
    };
    return walk(this);
  }

  /**
   * Visible, navigable rows in visual (DOM) order. Rows live partly in light
   * DOM (.wt-row-header) and partly inside <openp41ge-tree> shadow roots
   * (.tree-node), so this walks both. Hidden levels aren't in the DOM at all,
   * so the walk naturally yields: repo → worktrees → each worktree's file
   * tree (recursively) → next repo.
   */
  private _navigableRows(): HTMLElement[] {
    const out: HTMLElement[] = [];
    const walk = (root: ParentNode) => {
      for (const el of Array.from(root.children)) {
        if (!(el instanceof HTMLElement)) continue;
        if (el.tagName === "OPENP41GE-TREE") {
          const root2 = (el as unknown as HTMLElement & { shadowRoot?: ShadowRoot | null })
            .shadowRoot;
          if (root2) walk(root2);
        } else if (el.classList.contains("wt-row-header") || el.classList.contains("tree-node")) {
          out.push(el);
        } else {
          // Recurse into containers, <openp41ge-repo-tree-item>, nested wrappers.
          walk(el);
        }
      }
    };
    walk(this);
    return out;
  }

  /**
   * Clear selection on every file tree AND every Explorer row (headers and
   * shadow-root tree nodes). Runs on every repaint so no inline
   * border/background can survive a move — Lit recycling a previously-focused
   * node element could otherwise leave its painted selection behind.
   */
  private _clearAllTreeSelections(): void {
    const walk = (root: ParentNode) => {
      for (const el of Array.from(root.children)) {
        if (!(el instanceof HTMLElement)) continue;
        if (el.tagName === "OPENP41GE-TREE") {
          (el as unknown as { selectedId: string | null }).selectedId = null;
          const root2 = (el as unknown as HTMLElement & { shadowRoot?: ShadowRoot | null })
            .shadowRoot;
          if (root2) walk(root2);
        } else if (el.classList.contains("tree-node")) {
          el.style.boxShadow = "";
          el.style.background = "";
        } else if (el.classList.contains("wt-row-header")) {
          el.classList.remove("wt-row-focused");
          el.classList.remove("wt-row-selected");
          el.style.boxShadow = "";
          el.style.background = "";
        } else {
          walk(el);
        }
      }
    };
    walk(this);
  }

  /**
   * Paint the VS Code-style two-tier selection on `el` (or clear it when
   * null). Everything is re-painted from scratch on every change so nothing
   * can linger:
   *   - clicked row (_selectedRowEl): light-grey BACKGROUND only,
   *   - arrow-focused row (_focusedRowEl): blue background + blue OUTLINE.
   * Applies to file/folder rows AND repo/worktree header rows. Header rows
   * use CSS classes; file/folder rows use inline styles because they live in
   * shadow roots that global CSS cannot reach.
   */
  private _setFocusedRow(el: HTMLElement | null): void {
    if (this._focusedRowEl === el) return;
    this._focusedRowEl = el;
    this._repaintSelection();
    if (el) el.scrollIntoView({ block: "nearest" });
  }

  private _repaintSelection(): void {
    // Wipe every highlight, then re-paint from scratch. The sweep guarantees
    // a row the user arrowed away from can never keep a stale border.
    this._clearAllTreeSelections();
    const sel = this._selectedRowEl && this._selectedRowEl.isConnected ? this._selectedRowEl : null;
    const focus = this._focusedRowEl && this._focusedRowEl.isConnected ? this._focusedRowEl : null;
    if (focus && this._navFocusVisible) {
      // Cursor: faded background + outline, only while the Explorer owns
      // keyboard focus (hidden by an outside click). When sel === focus
      // (just clicked) this single paint shows background + border.
      this._paintRow(focus, true);
      // Clicked/active-file row beside the cursor: faded background, NO
      // outline — the cursor paint above already covers the coincide case.
      if (sel && sel !== focus) this._paintRow(sel, false);
    } else if (sel) {
      // Keyboard focus lost (outside click): the cursor is hidden entirely,
      // but the clicked-row fade persists (VS Code active-file selection).
      this._paintRow(sel, false);
    }
    // Never let a tabindex=0 row keep DOM focus — its :focus-visible ring
    // would paint a border inline styles cannot clear.
    this._blurFocusedTreeNode();
    // Belt-and-braces: guarantee no row other than the cursor can carry a
    // border, correcting any stray paint from re-renders or other focus
    // paths that bypassed the sweep.
    this._enforceSingleBorder();
  }

  /** Paint fade-only (focused=false) or fade + outline (focused=true) on el. */
  private _paintRow(el: HTMLElement, focused: boolean): void {
    if (!el.classList.contains("tree-node")) {
      // Header rows (repo/worktree) use CSS classes — wt-row-focused is the
      // blue cursor, wt-row-selected is the grey stationary row.
      el.classList.remove(focused ? "wt-row-selected" : "wt-row-focused");
      el.classList.add(focused ? "wt-row-focused" : "wt-row-selected");
      el.style.boxShadow = "";
      el.style.background = "";
      return;
    }
    // closest() does not cross the shadow boundary — resolve the owning
    // <openp41ge-tree> host through getRootNode() instead. The clicked
    // AND the arrow-focused row both count as the tree's selection, so
    // the uikit tree's selectedId follows either of them.
    const root = el.getRootNode();
    const host = (root instanceof ShadowRoot ? root.host : null) as
      (HTMLElement & { selectedId: string | null }) | null;
    if (host && host.tagName === "OPENP41GE-TREE")
      host.selectedId = el.getAttribute("data-node-id");
    if (focused) {
      // Arrow cursor: keep the blue background + blue outline (unchanged).
      el.style.background = "rgba(74,158,255,0.12)";
      el.style.boxShadow = "inset 0 0 0 1px var(--tree-focus, #4a9eff)";
    } else {
      // Clicked/active-file row: light grey background derived from the
      // border color, no outline — the cursor paint above already covers
      // the coincide case.
      el.style.background = "color-mix(in srgb, var(--border-divider, #2d2d2d) 60%, transparent)";
      el.style.boxShadow = "";
    }
  }

  private _isExpandable(el: HTMLElement): boolean {
    if (el.classList.contains("wt-row-header")) return true;
    if (!el.classList.contains("tree-node")) return false;
    if (el.classList.contains("has-children")) return true;
    // Lazily-loaded folders have no has-children class / aria-expanded until
    // their children are fetched, but they render a chevron — a chevron icon
    // means the row is expandable.
    return !!el.querySelector(".tree-chevron-cell openp41ge-icon");
  }

  private _isExpanded(el: HTMLElement): boolean {
    if (el.classList.contains("tree-node")) {
      return el.getAttribute("aria-expanded") === "true";
    }
    const icon = el.querySelector("openp41ge-icon");
    return icon?.getAttribute("name") === "chevron-down";
  }

  /** Toggle-open/close a row through its existing click path. */
  private _fireToggle(el: HTMLElement): void {
    if (el.classList.contains("wt-row-header")) {
      el.click(); // repo/worktree header toggles (keeps persistence + events)
      return;
    }
    const chevron = el.querySelector<HTMLElement>(".tree-chevron-cell");
    chevron?.click();
  }

  /** Parent row, or null if the row has no parent in the panel. */
  private _parentRow(el: HTMLElement): HTMLElement | null {
    if (el.classList.contains("tree-node")) {
      // Owning <openp41ge-tree> host (shadow-root aware).
      const root = el.getRootNode();
      const childTree = root instanceof ShadowRoot ? root.host : null;
      const prev = childTree?.previousElementSibling;
      if (prev) {
        if (prev.classList.contains("tree-node")) return prev as HTMLElement;
        const header = prev.querySelector<HTMLElement>(".wt-row-header");
        if (header) return header;
      }
      return null;
    }
    // Worktree header → owning repo header (first .wt-row-header in the repo).
    const repoItem = el.closest("openp41ge-repo-tree-item");
    if (repoItem) {
      const first = repoItem.querySelector<HTMLElement>(".wt-row-header");
      if (first && first !== el) return first;
    }
    return null;
  }

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
    // Disabled while no workspace is selected — repos belong to the workspace.
    if (!this._hasWorkspace) {
      this._repos = [];
      this._worktreesByRepo.clear();
      this._renderTree();
      return;
    }
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
      const wsRepos = workspaceFileService.openData?.repos ?? [];
      const repoModels = await this._repoService.listRepos();
      const byUrl = new Map(repoModels.map((rm) => [rm.url, rm]));
      const byName = new Map(repoModels.map((rm) => [rm.name, rm]));

      // Repos the workspace declares, in workspace order, resolved to their
      // on-disk clone. Workspace repos that aren't cloned yet are handled by
      // the Workspaces overlay (unverified row), not by the explorer.
      const entries: Array<{ path: string; name: string; url: string }> = [];
      for (const wsRepo of wsRepos) {
        const rm = byUrl.get(wsRepo.url) ?? byName.get(deriveRepoName(wsRepo.url));
        if (!rm) continue;
        entries.push({ path: "", name: rm.name, url: rm.url });
      }

      // Worktrees = declared in the workspace (repos[].worktrees); disk truth
      // (folder exists) comes from listWorktrees. A declared worktree whose
      // folder is missing stays as an exists:false warning row — the warning
      // opens the Workspaces overlay where it can be re-materialized.
      // Built BEFORE _repos is assigned: the worktree map is not reactive, so
      // assigning _repos must happen only once worktrees are ready or the
      // render that _repos triggers would show empty worktree lists.
      const wtsByRepo = new Map<string, Array<{ branch: string; path: string; exists: boolean }>>();
      const declaredByUrl = new Map(wsRepos.map((r) => [r.url, r.worktrees ?? []]));
      for (const repo of entries) {
        const declared = declaredByUrl.get(repo.url) ?? [];
        const rm = byUrl.get(repo.url) ?? byName.get(repo.name);
        let disk: Array<{ branch: string; path: string; exists: boolean }> = [];
        try {
          disk = ((await rm?.listWorktrees()) ?? []).map((wt) => ({
            branch: wt.branch,
            path: wt.path,
            exists: wt.exists,
          }));
        } catch {
          disk = [];
        }
        const existing = new Map(disk.filter((w) => w.exists).map((w) => [w.branch, w]));
        const wts = declared.map((branch) => {
          const d = existing.get(branch);
          return { branch, path: d?.path ?? "", exists: d !== undefined };
        });
        wtsByRepo.set(repo.name, wts);
      }
      this._worktreesByRepo = wtsByRepo;
      this._repos = entries;

      this._loadingRepos = false;
      this._renderTree();
    } catch {
      this._loadingRepos = false;
      this.requestUpdate();
    }
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
        <span class="w-4 flex items-center justify-center">
          <svg width="10" height="10" viewBox="0 0 16 16" fill="none"><polyline points="6,4 10,8 6,12" stroke="#666" stroke-width="1.5" fill="none"/></svg>
        </span>
        <span class="ml-1.5 flex-1 text-secondary text-sm">${this._escapeHtml(url)}</span>
        <div class="w-[14px] h-[14px] shrink-0 border-2 border-[#444] border-t-accent rounded-full animate-[wt-spin_0.8s_linear_infinite]"></div>
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
              '<span class="wt-check-icon text-[#4caf50] text-13 font-bold">\u2713</span>';
          }
        }
        toastService.show("Repository cloned successfully", "success");
        // Repos belong to the open workspace — register the bare clone there
        // so it appears in both the explorer and the Workspaces overlay.
        workspaceFileService.addRepoToActive(url);
        await workspaceFileService.save();
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
        window.openp41ge?.workspace?.dispatch?.("openSidebar", myWindowId, "right");
        window.openp41ge?.workspace?.dispatch?.(
          "openSystemTab",
          myWindowId,
          "right",
          "explorer",
          "Explorer",
        );
      }
      _isOpen = true;
      updateDrawerVisibility();
      _clearGridCellFocus();
    }
  }

  // ── Tree rendering ────────────────────────────────────────────────────

  private _renderChain: Promise<void> = Promise.resolve();

  private async _renderTree(): Promise<void> {
    // Data is rendered by Lit template via @state repos/worktrees.
    // Removed this.requestUpdate() — it caused an infinite Lit update loop
    // when _loadRepos() called _renderTree() from within updated().
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

  // ── Add worktree dialog ───────────────────────────────────────────────

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
      // Declare the worktree in the open workspace (repos belong to the
      // workspace — the overlay reflects this too).
      workspaceFileService.addWorktreeToActive(repoName, branch);
      await workspaceFileService.save();
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
        <span class="w-4 flex items-center justify-center">
          <svg width="10" height="10" viewBox="0 0 16 16" fill="none"><polyline points="6,4 10,8 6,12" stroke="#666" stroke-width="1.5" fill="none"/></svg>
        </span>
        <span class="ml-1.5 flex-1 text-secondary text-sm">${this._escapeHtml(url)}</span>
        <div class="w-[14px] h-[14px] shrink-0 border-2 border-[#444] border-t-accent rounded-full animate-[wt-spin_0.8s_linear_infinite]"></div>
      `;
    }

    // Create progress bar if needed
    if (!this._cloneProgressBar) {
      this._cloneProgressBar = document.createElement("div");
      this._cloneProgressBar.className =
        "hidden h-0.5 bg-accent transition-[width] duration-300 ease-[ease]";
      this._cloneProgressBar.style.width = "0%";
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
    overlay.className =
      "fixed inset-0 z-[1000] bg-[rgba(0,0,0,0.5)] flex items-center justify-center";

    const dialog = document.createElement("div");
    dialog.className =
      "bg-bg-tertiary border border-border-color rounded-lg p-6 w-[360px] max-w-[90vw] shadow-[0_8px_32px_rgba(0,0,0,0.4)]";

    const branchOptions = branches
      .map((b) => `<option value="${b.replace(/"/g, "&quot;")}">${this._escapeHtml(b)}</option>`)
      .join("");

    dialog.innerHTML = `
      <div class="mb-4">
        <div class="text-[#eee] text-13 font-semibold mb-1">Add Worktree</div>
        <div class="text-muted text-xs">Select or type a branch name for ${this._escapeHtml(repoName)}</div>
      </div>
      <div class="mb-2">
        <select id="wt-branch-select" class="
          w-full box-border px-2.5 py-2
          bg-gutter border border-border-color rounded
          text-[#ddd] text-sm
        ">
          <option value="">-- Type a new branch or select --</option>
          ${branchOptions}
        </select>
      </div>
      <input id="wt-branch-input" type="text" placeholder="Or type a new branch name"
        class="
          w-full box-border px-2.5 py-2
          bg-gutter border border-border-color rounded
          text-[#ddd] text-13
        "
      />
      <div id="wt-addwt-error" class="text-error text-xs mt-1.5 hidden"></div>
      <div class="flex justify-end gap-2 mt-4">
        <button id="wt-addwt-cancel" class="
          bg-bg-tertiary border border-border-light rounded
          text-secondary text-sm px-4 py-1.5 cursor-pointer
        ">Cancel</button>
        <button id="wt-addwt-confirm" class="
          bg-accent border-none rounded
          text-white text-sm px-4 py-1.5 cursor-pointer
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
        workspaceFileService.addWorktreeToActive(repoName, branch);
        await workspaceFileService.save();
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
   * Dispatch openSidebar to persist the open state,
   * then immediately update the DOM for responsiveness.
   */
  open(): void {
    // Dispatch operation to persist
    const myWindowId = window.openp41ge?.workspace?.getWindowId?.() ?? "";
    if (myWindowId) {
      window.openp41ge?.workspace?.dispatch?.("openSidebar", myWindowId, "right");
      window.openp41ge?.workspace?.dispatch?.(
        "openSystemTab",
        myWindowId,
        "right",
        "explorer",
        "Explorer",
      );
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
      window.openp41ge?.workspace?.dispatch?.("closeSidebar", myWindowId, "right");
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
    const tabs = ws.editorTabs as Record<string, Tab | undefined>;
    const win = ws.windows.find((w) => w.id === winId);
    if (!win) return false;
    const placement = win.grid.placements.find(
      (p) => p.position.row === 0 && p.position.col === targetCol,
    );
    if (!placement) return false;

    for (const tabId of placement.tabIds) {
      const tab = tabs[tabId];
      if (tab && tab.appType === "git-repository" && tab.config?.filePath === repoName) {
        TabActivationHistory.pushActivation(winId, tabId);
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
