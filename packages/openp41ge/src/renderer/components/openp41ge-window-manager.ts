/**
 * <openp41ge-window-manager> — Window Manager window with a drawer system.
 *
 * The top level is a simple list of workspaces. Clicking a card opens a drawer
 * from the right (75% width, full height, scrollable) showing that workspace's
 * detail. Drilling further (workspace → repo → worktree) opens stacked drawers:
 * the deepest is always 75% wide, its direct parent moves to 80%, and every
 * ancestor above that caps at 85%. Clicking a card opens the workspace detail
 * drawer with an "Open" button (the old "Activate" action); the top-level cards
 * themselves carry no Open button — only an "Opened" pill when the workspace is
 * already open.
 */

import { html, nothing, type TemplateResult } from "lit";
import { LitElement } from "lit";
import { state } from "lit/decorators.js";
import { tooltipController } from "openp41ge-uikit";
import type { WorkspaceFileData } from "../../layout/types";
import { workspaceFileService, deriveRepoName } from "../services/workspace-file-service";

/** Hold a skeleton this long before the drag element appears (long-press pickup). */
const HOLD_MS = 350;
/** Pointer travel past this many px starts an immediate drag (below the long-press hold). */
const DRAG_THRESHOLD = 4;

const isMac = (() => {
  try {
    return window.openp41ge?.platform === "darwin" || navigator.platform.startsWith("Mac");
  } catch {
    return false;
  }
})();

interface OpenWindowSummary {
  windowId: string;
  windowType: "workspace" | "window-manager";
  workspacePath: string | null;
}

interface DrawerState {
  id: string;
  kind: "workspace" | "repo" | "worktree";
  workspacePath: string;
  data: WorkspaceFileData;
  repoUrl?: string;
  worktree?: string;
  title: string;
}

/** A drawer that is animating out; keeps its last width so it exits in place. */
interface ClosingDrawer extends DrawerState {
  width: number;
}

export class Openp41geWindowManager extends LitElement {
  @state() private _workspaces: Array<{ filePath: string; data: WorkspaceFileData }> = [];
  @state() private _openWindows: OpenWindowSummary[] = [];
  @state() private _drawers: DrawerState[] = [];
  @state() private _closingDrawers: ClosingDrawer[] = [];
  @state() private _loaded = false;
  @state() private _addingRepo = false;
  @state() private _deleteMode = false;
  @state() private _selectedRepos: Set<string> = new Set();
  @state() private _addingWorkspace = false;
  @state() private _workspaceDeleteMode = false;
  @state() private _selectedWorkspaces: Set<string> = new Set();
  @state() private _addingWorktree = false;
  @state() private _worktreeDeleteMode = false;
  @state() private _selectedWorktrees: Set<string> = new Set();
  @state() private _crumbsOpen = false;
  @state() private _listOverflows = false;
  /** Active carousel window index per workspace path (reactive — drives track + dots). */
  @state() private _carouselIndex: Map<string, number> = new Map();
  /** True while a carousel swipe follows the pointer (disables the slide transition). */
  @state() private _carouselLive = false;
  private _drag: {
    startX: number;
    startY: number;
    startScreenX: number;
    startScreenY: number;
    captureRect: { x: number; y: number; width: number; height: number } | null;
    path: string;
    label: string;
    active: boolean;
    mode: "carousel" | "open" | null;
    windowCount: number;
    baseIndex: number;
  } | null = null;
  private _holdTimer: number | null = null;
  private _offEndSession: (() => void) | null = null;
  /** Suppress the following row click after a drag/swipe, so the drawer doesn't pop open. */
  private _suppressClick = false;
  private _tooltipTargets: Element[] = [];

  connectedCallback(): void {
    super.connectedCallback();
    window.addEventListener("focus", this._onFocus);
    window.addEventListener("resize", this._measureListOverflow);
    document.addEventListener("keydown", this._onKeydown);
    document.addEventListener("click", this._onDocumentClick);
    // Any new pointer press clears the drag-follow-up suppression. A click can
    // only follow a drag within the same gesture (no pointerdown between), so a
    // fresh press always means the previous drag's follow-up click is moot.
    document.addEventListener("pointerdown", this._onPointerDown);
    // When a drag-out opens a workspace window in the main process (cursor left
    // the window), the main process ends the session and notifies us to clear
    // the in-flight drag state.
    this._offEndSession = window.openp41ge.drag.onEndSession(() => this._teardownDrag());
    void this._load();
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    window.removeEventListener("focus", this._onFocus);
    window.removeEventListener("resize", this._measureListOverflow);
    document.removeEventListener("keydown", this._onKeydown);
    document.removeEventListener("click", this._onDocumentClick);
    document.removeEventListener("pointerdown", this._onPointerDown);
    this._offEndSession?.();
    for (const el of this._tooltipTargets) tooltipController.detach(el);
    this._tooltipTargets = [];
  }

  /** Attach custom tooltips to the footer tool buttons (replaces native `title`). */
  updated(): void {
    this._measureListOverflow();
    const btns = this.shadowRoot?.querySelectorAll<HTMLElement>(
      ".dw-add, .dw-delete, .dw-delete-cancel, .dw-delete-confirm, .dw-close",
    );
    const live = new Set<Element>();
    if (btns) {
      for (const btn of btns) {
        const text = btn.getAttribute("data-tip");
        if (text) {
          tooltipController.attach(btn, { type: "simple", text });
          live.add(btn);
        }
      }
    }
    for (const el of this._tooltipTargets) {
      if (!live.has(el)) tooltipController.detach(el);
    }
    this._tooltipTargets = [...live];
  }

  /**
   * The last row shows a trailing separator only when the list doesn't overflow
   * (content fits the viewport). When the list scrolls, the trailing separator is
   * removed so a scrolled-to-bottom last row doesn't double up with the viewport
   * edge. Measure after every render and on window resize.
   */
  private _measureListOverflow = (): void => {
    const body = this.shadowRoot?.querySelector(".wm-body");
    if (!body) return;
    const overflow = body.scrollHeight > body.clientHeight + 1;
    if (overflow !== this._listOverflows) this._listOverflows = overflow;
  };

  /** A click outside the breadcrumb trail closes the collapse menu. */
  private _onDocumentClick = (e: MouseEvent): void => {
    if (!this._crumbsOpen) return;
    const target = e.target as HTMLElement | null;
    if (target?.closest?.(".crumbs")) return;
    this._crumbsOpen = false;
  };

  /** Begin a pointer press on a workspace skeleton (drag-out or carousel swipe). */
  private _onThumbPointerDown(e: PointerEvent, path: string, isOpen: boolean): void {
    if (e.button !== 0) return;
    // An already-open workspace isn't an interactive drag handle — avoid a second
    // open affordance on top of the already-open window.
    if (isOpen) return;
    this._teardownDrag();
    const ws = this._workspaces.find((w) => w.filePath === path);
    const winCount = ws?.data.windows?.length ?? 1;
    const thumb = e.currentTarget as HTMLElement;
    const rect = thumb.getBoundingClientRect();
    this._drag = {
      startX: e.clientX,
      startY: e.clientY,
      startScreenX: e.screenX,
      startScreenY: e.screenY,
      captureRect: {
        x: Math.round(rect.left),
        y: Math.round(rect.top),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      },
      path,
      label: ws?.data.name?.trim() || "Unnamed",
      active: false,
      mode: null,
      windowCount: Math.max(1, winCount),
      baseIndex: this._carouselIndex.get(path) ?? 0,
    };
    try {
      thumb.setPointerCapture?.(e.pointerId);
    } catch {
      /* synthetic events have no active pointer */
    }
    // A short hold shows the drag element without any pointer movement (long-press
    // pickup). A quick drag that crosses the threshold clears this timer and starts
    // the drag from the move handler instead.
    this._clearHoldTimer();
    this._holdTimer = window.setTimeout(() => this._beginOpenDrag(), HOLD_MS);
  }

  /** Long-press fired: show the drag element (open mode) at the press point. */
  private _beginOpenDrag(): void {
    this._holdTimer = null;
    const drag = this._drag;
    if (!drag || drag.active) return;
    drag.active = true;
    this._suppressClick = true;
    drag.mode = "open";
    window.openp41ge.drag.start(
      drag.label,
      drag.startScreenX,
      drag.startScreenY,
      "🗂",
      undefined,
      undefined,
      undefined,
      132,
      84,
      66,
      42,
      "workspace",
      drag.path,
      drag.captureRect ?? undefined,
      0,
    );
    window.openp41ge.drag.activate();
    window.openp41ge.drag.move(drag.startScreenX, drag.startScreenY);
  }

  private _clearHoldTimer(): void {
    if (this._holdTimer !== null) {
      window.clearTimeout(this._holdTimer);
      this._holdTimer = null;
    }
  }

  /** Once the drag passes the threshold, decide the gesture by dominant axis. */
  private _onThumbPointerMove(e: PointerEvent): void {
    const drag = this._drag;
    if (!drag) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (!drag.active) {
      // A small movement kickstarts the drag immediately — the long-press hold
      // delay is only for grab-and-hold with no movement, not for a quick drag.
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      // A real drag beat the long-press timer — cancel the pending pickup.
      this._clearHoldTimer();
      drag.active = true;
      // A drag/swipe means the following row click is not a navigation — suppress
      // it so the drawer doesn't pop open over the drag. Cleared by the next
      // pointerdown (see _onPointerDown) or by the row click itself.
      this._suppressClick = true;
      // Horizontal swipe → carousel; vertical drag → open the workspace window.
      drag.mode = Math.abs(dx) > Math.abs(dy) ? "carousel" : "open";
      if (drag.mode === "open") {
        // Start a real (native) drag so it can leave the window. Pass the
        // skeleton's capture rect so the main process swaps in a bitmap of the
        // actual skeleton (not just a label). The window opens on the drop, only
        // if the cursor is outside this window at release.
        window.openp41ge.drag.start(
          drag.label,
          e.screenX,
          e.screenY,
          "🗂",
          undefined,
          undefined,
          undefined,
          132,
          84,
          66,
          42,
          "workspace",
          drag.path,
          drag.captureRect ?? undefined,
          0,
        );
        window.openp41ge.drag.activate();
      }
    }
    if (drag.mode === "open") {
      window.openp41ge.drag.move(e.screenX, e.screenY);
    } else if (drag.mode === "carousel") {
      const width = (e.currentTarget as HTMLElement).clientWidth || 132;
      const step = Math.max(20, width / 2);
      const pages = Math.round(dx / step);
      const idx = Math.max(0, Math.min(drag.windowCount - 1, drag.baseIndex - pages));
      this._setCarouselIndex(drag.path, idx, true);
    }
  }

  /** Release: open the workspace only if the cursor was outside this window at the drop. */
  private _onThumbPointerUp(e: PointerEvent): void {
    this._clearHoldTimer();
    const drag = this._drag;
    if (!drag) return;
    const { mode, path } = drag;
    this._teardownDrag();
    if (mode === "open") {
      // Compute outside synchronously (window.screenX/screenY match the main
      // process window bounds) and end the drag in the same tick. Awaiting an
      // IPC before drag.end() left a window in which a second drag could start
      // and have its session/ghost clobbered by the delayed drag.end().
      const outside =
        e.screenX < window.screenX ||
        e.screenX > window.screenX + window.outerWidth ||
        e.screenY < window.screenY ||
        e.screenY > window.screenY + window.outerHeight;
      window.openp41ge.drag.end();
      if (outside) this._openWorkspaceWindow(path);
    }
  }

  private _onThumbPointerCancel(): void {
    this._clearHoldTimer();
    const drag = this._drag;
    if (!drag) return;
    if (drag.mode === "open") window.openp41ge.drag.end();
    this._teardownDrag();
  }

  /** Move the carousel to index `idx` for a workspace path. `live` = follows the pointer (no animation). */
  private _setCarouselIndex(path: string, idx: number, live: boolean): void {
    const cur = this._carouselIndex.get(path) ?? 0;
    if (cur === idx && this._carouselLive === live) return;
    this._carouselLive = live;
    this._carouselIndex = new Map(this._carouselIndex).set(path, idx);
  }

  /** Arrow click: step to the previous/next window skeleton (animated). */
  private _gotoCarousel(path: string, idx: number): void {
    const count = this._workspaces.find((w) => w.filePath === path)?.data.windows?.length ?? 1;
    const clamped = Math.max(0, Math.min(count - 1, idx));
    this._setCarouselIndex(path, clamped, false);
  }

  private _teardownDrag(): void {
    this._clearHoldTimer();
    this._drag = null;
    this._carouselLive = false;
  }

  /** A fresh pointer press marks the end of any drag-follow-up click window. */
  private _onPointerDown = (): void => {
    this._suppressClick = false;
  };

  /** Escape cancels delete modes, closes an add card, or closes the crumb menu. */
  private _onKeydown = (e: KeyboardEvent): void => {
    if (e.key !== "Escape") return;
    if (this._crumbsOpen) {
      this._crumbsOpen = false;
      return;
    }
    if (this._addingRepo || this._addingWorkspace || this._addingWorktree) {
      this._addingRepo = false;
      this._addingWorkspace = false;
      this._addingWorktree = false;
    } else if (this._workspaceDeleteMode) this._cancelWorkspaceDeleteMode();
    else if (this._deleteMode) this._cancelDeleteMode();
    else if (this._worktreeDeleteMode) this._cancelWorktreeDeleteMode();
  };

  private _onFocus = (): void => {
    void this._load();
  };

  private async _load(): Promise<void> {
    try {
      this._workspaces = await workspaceFileService.listWorkspaces();
    } catch {
      this._workspaces = [];
    }
    try {
      this._openWindows = await window.openp41ge.windowManager.openWindowSummaries();
    } catch {
      this._openWindows = [];
    }
    this._loaded = true;
  }

  private _nextId(): string {
    return `d-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  }

  /** Open (or re-focus) a workspace-bound window; refresh open-state pills. */
  private _openWorkspaceWindow(path: string): void {
    window.openp41ge.windowManager.openWorkspaceWindow(path);
    window.setTimeout(() => void this._load(), 350);
  }

  /** Clicking the row's "Open" pill focuses the already-open workspace window. */
  private _onRowPillOpen(e: Event, path: string): void {
    e.stopPropagation();
    window.openp41ge.windowManager.focusWorkspaceWindow(path);
  }

  /** Reset the transient add/delete modes when the drawer stack navigates. */
  private _resetDrawerModes(): void {
    this._addingRepo = false;
    this._deleteMode = false;
    this._selectedRepos = new Set();
    this._addingWorkspace = false;
    this._workspaceDeleteMode = false;
    this._selectedWorkspaces = new Set();
    this._addingWorktree = false;
    this._worktreeDeleteMode = false;
    this._selectedWorktrees = new Set();
  }

  /** Clicking a top-level card resets the drawer stack to that workspace's detail. */
  private _openWorkspace(ws: { filePath: string; data: WorkspaceFileData }): void {
    this._resetDrawerModes();
    this._drawers = [
      {
        id: this._nextId(),
        kind: "workspace",
        workspacePath: ws.filePath,
        data: ws.data,
        title: ws.data.name?.trim() || "Unnamed",
      },
    ];
  }

  /** Drill from a workspace drawer into one of its repositories. */
  private _openRepo(d: DrawerState, repo: { url: string; worktrees: string[] }): void {
    this._resetDrawerModes();
    this._drawers = [
      ...this._drawers,
      {
        id: this._nextId(),
        kind: "repo",
        workspacePath: d.workspacePath,
        data: d.data,
        repoUrl: repo.url,
        title: deriveRepoName(repo.url),
      },
    ];
  }

  /** Drill from a repo drawer into one of its worktrees. */
  private _openWorktree(d: DrawerState, worktree: string): void {
    this._resetDrawerModes();
    this._drawers = [
      ...this._drawers,
      {
        id: this._nextId(),
        kind: "worktree",
        workspacePath: d.workspacePath,
        data: d.data,
        repoUrl: d.repoUrl,
        worktree,
        title: worktree,
      },
    ];
  }

  /** Toggle the inline "add repo" row in the workspace drawer. */
  private _toggleAddRepo(): void {
    this._deleteMode = false;
    this._addingRepo = !this._addingRepo;
    if (this._addingRepo) {
      void this.updateComplete.then(() => {
        this.shadowRoot?.querySelector<HTMLInputElement>(".dw-new-input")?.focus();
      });
    }
  }

  /** Enter commits, Escape cancels the inline add-repo row. */
  private _onNewRepoKeydown(e: KeyboardEvent, d: DrawerState): void {
    if (e.key === "Enter") {
      e.preventDefault();
      this._commitNewRepo(d, e);
    } else if (e.key === "Escape") {
      e.preventDefault();
      this._addingRepo = false;
    }
  }

  /** Blur/Enter commits the typed URL; empty input closes the row. */
  private _commitNewRepo(d: DrawerState, e: Event): void {
    if (!this._addingRepo) return;
    const value = (e.target as HTMLInputElement).value.trim();
    void this._addRepoToWorkspace(d, value);
  }

  /** Persist a new repo URL to the workspace file, then refresh the view. */
  private async _addRepoToWorkspace(d: DrawerState, url: string): Promise<void> {
    const repo = url.trim();
    this._addingRepo = false;
    if (!repo) return;
    // Exact-match already present: just refresh (e.g. duplicate submit / blur).
    if ((d.data.repos ?? []).some((r) => r.url === repo)) {
      await this._load();
      return;
    }
    const data: WorkspaceFileData = {
      ...d.data,
      repos: [...(d.data.repos ?? []), { url: repo, worktrees: [] }],
    };
    try {
      await window.openp41ge.dialog.writeWorkspaceFile(d.workspacePath, data);
    } catch {
      return;
    }
    // Keep the drawer showing the freshly-added repo, and refresh the card list.
    this._drawers = this._drawers.map((x) => (x.id === d.id ? { ...x, data } : x));
    await this._load();
  }

  /** Footer for the top-level workspace list (+ / trashcan, delete mode). */
  private _workspaceListFooter(): TemplateResult {
    return html`
      <div class="ws-list-footer">
        ${this._workspaceDeleteMode
          ? html`
              <button class="dw-delete-cancel" @click=${(e: Event) => { e.stopPropagation(); this._cancelWorkspaceDeleteMode(); }} data-tip="Cancel">Cancel</button>
              <button class="dw-delete-confirm" @click=${(e: Event) => { e.stopPropagation(); void this._deleteSelectedWorkspaces(); }} data-tip="Delete selected workspaces" ?disabled=${this._selectedWorkspaces.size === 0}>Delete</button>
            `
          : html`
              <button class="dw-add" @click=${(e: Event) => { e.stopPropagation(); this._toggleAddWorkspace(); }} aria-label="New workspace" data-tip="New workspace">＋</button>
              <button class="dw-delete" @click=${(e: Event) => { e.stopPropagation(); this._activateWorkspaceDeleteMode(); }} aria-label="Delete workspaces" data-tip="Delete workspaces">
                <svg xmlns="http://www.w3.org/2000/svg" height="18px" viewBox="0 -960 960 960" width="18px" fill="currentColor"><path d="M280-120q-33 0-56.5-23.5T200-200v-520h-40v-80h200v-40h240v40h200v80h-40v520q0 33-23.5 56.5T680-120H280Zm400-600H280v520h400v-520ZM360-280h80v-360h-80v360Zm160 0h80v-360h-80v360ZM280-720v520-520Z"/></svg>
              </button>
            `}
      </div>
    `;
  }

  /** Toggle the inline "new workspace" name row on the top-level list. */
  private _toggleAddWorkspace(): void {
    this._workspaceDeleteMode = false;
    this._addingWorkspace = !this._addingWorkspace;
    if (this._addingWorkspace) {
      void this.updateComplete.then(() => {
        this.shadowRoot?.querySelector<HTMLInputElement>(".wm-new-ws-input")?.focus();
      });
    }
  }

  /** Enter commits, Escape cancels the new-workspace name row. */
  private _onNewWorkspaceKeydown(e: KeyboardEvent): void {
    if (e.key === "Enter") {
      e.preventDefault();
      void this._createWorkspaceFromInput();
    } else if (e.key === "Escape") {
      e.preventDefault();
      this._addingWorkspace = false;
    }
  }

  /** Create a workspace from the inline name input, then refresh the list. */
  private async _createWorkspaceFromInput(): Promise<void> {
    const input = this.shadowRoot?.querySelector<HTMLInputElement>(".wm-new-ws-input");
    const name = input?.value.trim() ?? "";
    this._addingWorkspace = false;
    if (!name) return;
    try {
      await workspaceFileService.createWorkspace(name);
    } catch {
      return;
    }
    await this._load();
  }

  /** Enter workspace delete mode: cards become checkbox-selectable. */
  private _activateWorkspaceDeleteMode(): void {
    this._addingWorkspace = false;
    this._workspaceDeleteMode = true;
    this._selectedWorkspaces = new Set();
  }

  /** Leave workspace delete mode and clear the selection. */
  private _cancelWorkspaceDeleteMode(): void {
    this._workspaceDeleteMode = false;
    this._selectedWorkspaces = new Set();
  }

  /** Toggle whether a workspace card is selected for deletion. */
  private _toggleWorkspaceSelection(filePath: string): void {
    const next = new Set(this._selectedWorkspaces);
    if (next.has(filePath)) next.delete(filePath);
    else next.add(filePath);
    this._selectedWorkspaces = next;
  }

  /** Delete the selected workspace files (keeping their data dirs), then refresh. */
  private async _deleteSelectedWorkspaces(): Promise<void> {
    const selected = this._selectedWorkspaces;
    this._workspaceDeleteMode = false;
    this._selectedWorkspaces = new Set();
    if (selected.size === 0) return;
    for (const path of selected) {
      try {
        await window.openp41ge.dialog.deleteWorkspaceFile(path, false);
      } catch {
        // ignore individual failures
      }
    }
    await this._load();
  }

  /** Enter delete mode: repo cards become checkbox-selectable. */
  private _activateDeleteMode(): void {
    this._addingRepo = false;
    this._deleteMode = true;
    this._selectedRepos = new Set();
  }

  /** Leave delete mode and clear any selection. */
  private _cancelDeleteMode(): void {
    this._deleteMode = false;
    this._selectedRepos = new Set();
  }

  /** Toggle whether a repo card is selected for deletion. */
  private _toggleRepoSelection(url: string): void {
    const next = new Set(this._selectedRepos);
    if (next.has(url)) next.delete(url);
    else next.add(url);
    this._selectedRepos = next;
  }

  /** Remove every selected repo from the workspace file, then refresh. */
  private async _deleteSelectedRepos(d: DrawerState): Promise<void> {
    const selected = this._selectedRepos;
    this._deleteMode = false;
    this._selectedRepos = new Set();
    if (selected.size === 0) return;
    const data: WorkspaceFileData = {
      ...d.data,
      repos: (d.data.repos ?? []).filter((r) => !selected.has(r.url)),
    };
    try {
      await window.openp41ge.dialog.writeWorkspaceFile(d.workspacePath, data);
    } catch {
      return;
    }
    this._drawers = this._drawers.map((x) => (x.id === d.id ? { ...x, data } : x));
    await this._load();
  }

  /** Toggle the inline "add worktree" row on the worktree list drawer. */
  private _toggleAddWorktree(): void {
    this._worktreeDeleteMode = false;
    this._addingWorktree = !this._addingWorktree;
    if (this._addingWorktree) {
      void this.updateComplete.then(() => {
        this.shadowRoot?.querySelector<HTMLInputElement>(".dw-new-input")?.focus();
      });
    }
  }

  /** Enter commits, Escape cancels the inline add-worktree row. */
  private _onNewWorktreeKeydown(e: KeyboardEvent, d: DrawerState): void {
    if (e.key === "Enter") {
      e.preventDefault();
      this._commitNewWorktree(d, e);
    } else if (e.key === "Escape") {
      e.preventDefault();
      this._addingWorktree = false;
    }
  }

  /** Blur/Enter commits the typed worktree branch; empty input closes the row. */
  private _commitNewWorktree(d: DrawerState, e: Event): void {
    if (!this._addingWorktree) return;
    const value = (e.target as HTMLInputElement).value.trim();
    void this._addWorktreeToWorkspace(d, value);
  }

  /** Append a worktree branch to the repo in the workspace file, then refresh. */
  private async _addWorktreeToWorkspace(d: DrawerState, branch: string): Promise<void> {
    const b = branch.trim();
    this._addingWorktree = false;
    if (!b) return;
    const repo = d.data.repos?.find((r) => r.url === d.repoUrl);
    if (!repo) return;
    if ((repo.worktrees ?? []).includes(b)) {
      await this._load();
      return;
    }
    const data: WorkspaceFileData = {
      ...d.data,
      repos: (d.data.repos ?? []).map((r) =>
        r.url === d.repoUrl ? { ...r, worktrees: [...(r.worktrees ?? []), b] } : r,
      ),
    };
    try {
      await window.openp41ge.dialog.writeWorkspaceFile(d.workspacePath, data);
    } catch {
      return;
    }
    this._drawers = this._drawers.map((x) => (x.id === d.id ? { ...x, data } : x));
    await this._load();
  }

  /** Enter worktree delete mode: worktree cards become checkbox-selectable. */
  private _activateWorktreeDeleteMode(): void {
    this._addingWorktree = false;
    this._worktreeDeleteMode = true;
    this._selectedWorktrees = new Set();
  }

  /** Leave worktree delete mode and clear the selection. */
  private _cancelWorktreeDeleteMode(): void {
    this._worktreeDeleteMode = false;
    this._selectedWorktrees = new Set();
  }

  /** Toggle whether a worktree card is selected for deletion. */
  private _toggleWorktreeSelection(branch: string): void {
    const next = new Set(this._selectedWorktrees);
    if (next.has(branch)) next.delete(branch);
    else next.add(branch);
    this._selectedWorktrees = next;
  }

  /** Remove the selected worktrees from the repo in the workspace file, then refresh. */
  private async _deleteSelectedWorktrees(d: DrawerState): Promise<void> {
    const selected = this._selectedWorktrees;
    this._worktreeDeleteMode = false;
    this._selectedWorktrees = new Set();
    if (selected.size === 0) return;
    const data: WorkspaceFileData = {
      ...d.data,
      repos: (d.data.repos ?? []).map((r) =>
        r.url === d.repoUrl
          ? { ...r, worktrees: (r.worktrees ?? []).filter((wt) => !selected.has(wt)) }
          : r,
      ),
    };
    try {
      await window.openp41ge.dialog.writeWorkspaceFile(d.workspacePath, data);
    } catch {
      return;
    }
    this._drawers = this._drawers.map((x) => (x.id === d.id ? { ...x, data } : x));
    await this._load();
  }

  /** Footer bar specific to a drawer kind (add / delete controls). */
  private _drawerFooter(d: DrawerState): TemplateResult | typeof nothing {
    if (d.kind === "workspace") {
      return html`
        <div class="drawer-footer">
          ${this._deleteMode
            ? html`
                <button class="dw-delete-cancel" @click=${(e: Event) => { e.stopPropagation(); this._cancelDeleteMode(); }} data-tip="Cancel">Cancel</button>
                <button class="dw-delete-confirm" @click=${(e: Event) => { e.stopPropagation(); void this._deleteSelectedRepos(d); }} data-tip="Delete selected repositories" ?disabled=${this._selectedRepos.size === 0}>Delete</button>
              `
            : html`
                <button class="dw-add" @click=${(e: Event) => { e.stopPropagation(); this._toggleAddRepo(); }} aria-label="Add repository" data-tip="Add repository">＋</button>
                <button class="dw-delete" @click=${(e: Event) => { e.stopPropagation(); this._activateDeleteMode(); }} aria-label="Delete repositories" data-tip="Delete repositories">
                  <svg xmlns="http://www.w3.org/2000/svg" height="18px" viewBox="0 -960 960 960" width="18px" fill="currentColor"><path d="M280-120q-33 0-56.5-23.5T200-200v-520h-40v-80h200v-40h240v40h200v80h-40v520q0 33-23.5 56.5T680-120H280Zm400-600H280v520h400v-520ZM360-280h80v-360h-80v360Zm160 0h80v-360h-80v360ZM280-720v520-520Z"/></svg>
                </button>
              `}
        </div>
      `;
    }
    if (d.kind === "repo") {
      return html`
        <div class="drawer-footer">
          ${this._worktreeDeleteMode
            ? html`
                <button class="dw-delete-cancel" @click=${(e: Event) => { e.stopPropagation(); this._cancelWorktreeDeleteMode(); }} data-tip="Cancel">Cancel</button>
                <button class="dw-delete-confirm" @click=${(e: Event) => { e.stopPropagation(); void this._deleteSelectedWorktrees(d); }} data-tip="Delete selected worktrees" ?disabled=${this._selectedWorktrees.size === 0}>Delete</button>
              `
            : html`
                <button class="dw-add" @click=${(e: Event) => { e.stopPropagation(); this._toggleAddWorktree(); }} aria-label="Add worktree" data-tip="Add worktree">＋</button>
                <button class="dw-delete" @click=${(e: Event) => { e.stopPropagation(); this._activateWorktreeDeleteMode(); }} aria-label="Delete worktrees" data-tip="Delete worktrees">
                  <svg xmlns="http://www.w3.org/2000/svg" height="18px" viewBox="0 -960 960 960" width="18px" fill="currentColor"><path d="M280-120q-33 0-56.5-23.5T200-200v-520h-40v-80h200v-40h240v40h200v80h-40v520q0 33-23.5 56.5T680-120H280Zm400-600H280v520h400v-520ZM360-280h80v-360h-80v360Zm160 0h80v-360h-80v360ZM280-720v520-520Z"/></svg>
                </button>
              `}
        </div>
      `;
    }
    if (d.kind === "worktree") {
      return html`
        <div class="drawer-footer">
          ${!this._openPaths.has(d.workspacePath)
            ? html`<button class="dw-open" @click=${(e: Event) => { e.stopPropagation(); this._openWorkspaceWindow(d.workspacePath); }}>Open</button>`
            : nothing}
          <button class="dw-delete" @click=${(e: Event) => { e.stopPropagation(); void this._deleteWorktree(d); }} aria-label="Delete worktree" data-tip="Delete worktree">
            <svg xmlns="http://www.w3.org/2000/svg" height="18px" viewBox="0 -960 960 960" width="18px" fill="currentColor"><path d="M280-120q-33 0-56.5-23.5T200-200v-520h-40v-80h200v-40h240v40h200v80h-40v520q0 33-23.5 56.5T680-120H280Zm400-600H280v520h400v-520ZM360-280h80v-360h-80v360Zm160 0h80v-360h-80v360ZM280-720v520-520Z"/></svg>
          </button>
        </div>
      `;
    }
    return nothing;
  }

  /** Delete the worktree the drawer currently points at, then return to its repo. */
  private async _deleteWorktree(d: DrawerState): Promise<void> {
    const worktree = d.worktree ?? "";
    const data: WorkspaceFileData = {
      ...d.data,
      repos: (d.data.repos ?? []).map((r) =>
        r.url === d.repoUrl
          ? { ...r, worktrees: (r.worktrees ?? []).filter((wt) => wt !== worktree) }
          : r,
      ),
    };
    try {
      await window.openp41ge.dialog.writeWorkspaceFile(d.workspacePath, data);
    } catch {
      return;
    }
    this._drawers = this._drawers.map((x) => (x.id === d.id ? { ...x, data } : x));
    const idx = this._drawers.findIndex((x) => x.id === d.id);
    if (idx >= 0) this._closeDeeper(idx - 1);
    await this._load();
  }

  private _closeDrawer(id: string): void {
    this._resetDrawerModes();
    const idx = this._drawers.findIndex((d) => d.id === id);
    if (idx === -1) return;
    const width = this._widthFor(idx);
    const closing = this._drawers[idx];
    this._drawers = this._drawers.filter((d) => d.id !== id);
    this._finalizeClose([{ ...closing, width }]);
  }

  /** Close every drawer deeper than `index` (clicking a parent/grandparent sliver). */
  private _closeDeeper(index: number): void {
    this._resetDrawerModes();
    const closing = this._drawers
      .slice(index + 1)
      .map((d, i) => ({ ...d, width: this._widthFor(index + 1 + i) }));
    this._drawers = this._drawers.slice(0, index + 1);
    this._finalizeClose(closing);
  }

  /** Close every drawer (background click). */
  private _closeAll(): void {
    this._resetDrawerModes();
    const closing = this._drawers.map((d, i) => ({ ...d, width: this._widthFor(i) }));
    this._drawers = [];
    this._finalizeClose(closing);
  }

  /** Queue closed drawers to animate out, then drop them after the exit. */
  private _finalizeClose(closing: ClosingDrawer[]): void {
    if (closing.length === 0) return;
    this._closingDrawers = [...this._closingDrawers, ...closing];
    const ids = new Set(closing.map((c) => c.id));
    window.setTimeout(() => {
      this._closingDrawers = this._closingDrawers.filter((c) => !ids.has(c.id));
    }, 220);
  }

  /** Width of the single shared shadow, matching the widest (outermost) drawer. */
  private _stackWidth(): number {
    return this._drawers.length ? this._widthFor(0) : 0;
  }

  /** Clicking the background (card list area) closes all drawers. */
  private _onBackgroundClick = (e: Event): void => {
    if (this._drawers.length === 0) return;
    // A click on a card opens that workspace's drawer instead of closing all.
    if ((e.target as HTMLElement | null)?.closest?.(".ws-row")) return;
    this._closeAll();
  };

  /**
   * Drawer width rules: the deepest drawer is 75%, its direct parent 80%, and
   * every ancestor above that caps at 85%.
   */
  private _widthFor(index: number): number {
    const L = this._drawers.length;
    if (index === L - 1) return 75;
    if (index === L - 2) return 80;
    return 85;
  }

  /** "2 repos" / "1 repo" style label. */
  private _countLabel(n: number, singular: string): string {
    return `${n} ${n === 1 ? singular : singular + "s"}`;
  }

  /** Number of vertical columns/cells to draw for a window in the skeleton.
   *  The workspace grid only splits horizontally, so cells are one per column. */
  private _skeletonCells(win: { grid?: { placements?: unknown[]; cols?: number } } | undefined): number {
    const g = win?.grid;
    if (!g) return 1;
    return g.placements?.length || g.cols || 1;
  }

  /** The path of drawer titles leading up to (and including) drawer `i`. */
  private _breadcrumbModel(i: number): {
    visible: Array<{ label: string; index: number }>;
    hidden: Array<{ label: string; index: number }>;
    collapsed: boolean;
  } {
    const crumbs = this._drawers.slice(0, i + 1).map((d, idx) => ({ label: d.title, index: idx }));
    const total = crumbs.reduce((n, c) => n + c.label.length, 0);
    // Collapse the earlier crumbs into the … menu when the trail is too long.
    const collapsed = crumbs.length > 4 || total > 52;
    const tail = 2;
    return collapsed
      ? { visible: crumbs.slice(-tail), hidden: crumbs.slice(0, crumbs.length - tail), collapsed }
      : { visible: crumbs, hidden: [], collapsed };
  }

  /** Breadcrumb trail for the top drawer; earlier levels navigate back. */
  private _drawerBreadcrumbs(i: number): TemplateResult {
    const { visible, hidden, collapsed } = this._breadcrumbModel(i);
    const parts: TemplateResult[] = [];
    if (collapsed) {
      parts.push(html`
        <span class="crumbs-more">
          <button
            class="crumbs-ellipsis"
            @click=${(e: Event) => { e.stopPropagation(); this._crumbsOpen = !this._crumbsOpen; }}
            aria-label="Show earlier locations"
            aria-expanded=${this._crumbsOpen}
          >…</button>
          ${this._crumbsOpen
            ? html`<menu class="crumbs-menu" @click=${(e: Event) => e.stopPropagation()}>
                ${hidden.map((c) => html`<li><button class="crumbs-menu-item" @click=${(e: Event) => { e.stopPropagation(); this._navigateCrumb(c.index); }}>${c.label}</button></li>`)}
              </menu>`
            : nothing}
        </span>
      `);
    }
    visible.forEach((c, k) => {
      if (parts.length > 0) parts.push(html`<span class="crumbs-sep">/</span>`);
      if (k === visible.length - 1) {
        parts.push(html`<span class="crumbs-current">${c.label}</span>`);
      } else {
        parts.push(html`<button class="crumbs-item" @click=${(e: Event) => { e.stopPropagation(); this._navigateCrumb(c.index); }}>${c.label}</button>`);
      }
    });
    return html`<nav class="crumbs" @click=${(e: Event) => e.stopPropagation()}>${parts}</nav>`;
  }

  /** Navigate back to a drawer level, closing every deeper drawer. */
  private _navigateCrumb(index: number): void {
    this._crumbsOpen = false;
    this._closeDeeper(index);
  }

  /** Workspace paths that already have at least one live workspace window. */
  private get _openPaths(): Set<string> {
    return new Set(
      this._openWindows
        .filter((w) => w.windowType === "workspace" && w.workspacePath)
        .map((w) => w.workspacePath as string),
    );
  }

  render(): TemplateResult {
    // Workspaces that already have at least one live workspace window.
    const openPaths = this._openPaths;

    return html`
      <style>
        *, *::before, *::after { box-sizing: border-box; }
        :host {
          display: flex;
          height: 100vh;
          background: var(--bg, #1e1e1e);
          color: var(--text-primary, #ddd);
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }
        .wm-root {
          display: flex;
          flex-direction: column;
          flex: 1;
          min-width: 0;
          height: 100%;
          position: relative;
        }
        /* Draggable top bar (native drag region) with a macOS traffic-light spacer. */
        .wm-titlebar {
          display: flex;
          align-items: center;
          flex-shrink: 0;
          height: 32px;
          padding-left: ${isMac ? 85 : 12}px;
          box-sizing: border-box;
          -webkit-app-region: drag;
          user-select: none;
          background: var(--bg-secondary, #252526);
          border-bottom: 1px solid var(--divider, #333);
        }
        .wm-title {
          font-size: 12px;
          font-weight: 600;
          letter-spacing: 0.02em;
          color: var(--text-secondary, #999);
        }
        .wm-drawer-layer {
          position: relative;
          flex: 1;
          min-height: 0;
          overflow: hidden;
        }
        .wm-body {
          position: absolute;
          inset: 0;
          overflow-y: auto;
          /* No horizontal padding so rows + separators span the full window width;
             the rows keep their own content inset. No top padding — the title bar
             is the top of the view, so the list starts right below it. Bottom
             padding clears the overlaying bottom bar (44px) + scroll space. */
          padding: 0 0 64px;
          box-sizing: border-box;
        }
        ul { list-style: none; margin: 0; padding: 0; }
        li.ws-row {
          position: relative;
          display: flex;
          align-items: stretch;
          gap: 12px;
          padding: 16px;
          cursor: pointer;
          border-bottom: 1px solid var(--divider, #2f3031);
          transition: background 0.1s ease;
        }
        li.ws-row:hover { background: var(--bg-hover, #2a2d2e); }
        /* The last row's trailing separator only renders when the list fits the
           viewport (not below the fold), so a folded last row never shows a
           second bottom border when it scrolls into view. */
        li.ws-row--last:not(.ws-row--last-visible) { border-bottom: none; }
        .ws-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
        .ws-name {
          min-width: 0;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          font-size: 14px;
          font-weight: 600;
        }
        .ws-meta { color: var(--text-secondary, #999); font-size: 12px; }
        /* Bottom-left action pills (Open + window count) in each row. */
        .ws-pills { display: flex; align-items: center; gap: 6px; margin-top: auto; }
        .ws-pill {
          display: inline-flex;
          align-items: center;
          border-radius: 999px;
          padding: 2px 9px;
          font-size: 11px;
          font-weight: 600;
          font-family: inherit;
          color: var(--text-secondary, #999);
          background: var(--bg-active, #37373d);
          white-space: nowrap;
          user-select: none;
        }
        .ws-pill--open {
          color: var(--accent, #569cd6);
          background: rgba(86, 156, 214, 0.15);
          cursor: pointer;
        }
        .ws-pill--open:hover { background: rgba(86, 156, 214, 0.25); }
        .ws-chevron { flex-shrink: 0; display: block; align-self: center; color: var(--accent, #569cd6); }

        /* Skeleton + its carousel dots stacking. The dots stay inside the row's
           bottom padding area, absolutely positioned so they never push content. */
        .ws-thumb-wrap {
          position: relative;
          display: flex;
          flex-direction: column;
          align-items: center;
          flex-shrink: 0;
          align-self: flex-start;
        }

        /* Mini workspace-window skeleton: title bar + carousel of window layouts. */
        .ws-thumb {
          position: relative;
          width: 132px;
          height: 84px;
          flex-shrink: 0;
          border-radius: 6px;
          background: var(--bg, #1e1e1e);
          border: 1px solid var(--divider, #444);
          overflow: hidden;
          display: flex;
          flex-direction: column;
          cursor: grab;
        }
        .ws-thumb:active { cursor: grabbing; }
        .ws-row--open .ws-thumb { cursor: default; }
        .ws-thumb--skeleton { opacity: 0.75; animation: ws-skeleton-pulse 1.3s ease-in-out infinite; }
        .ws-thumb-chrome {
          height: 12px;
          flex-shrink: 0;
          background: var(--bg-secondary, #252526);
          border-bottom: 1px solid var(--divider, #333);
          display: flex;
          align-items: center;
          gap: 3px;
          padding: 0 5px;
        }
        .ws-thumb-dot { width: 4px; height: 4px; border-radius: 50%; background: var(--text-secondary, #999); opacity: 0.55; }
        .ws-carousel { flex: 1; min-height: 0; overflow: hidden; display: flex; }
        .ws-carousel-track {
          display: flex;
          height: 100%;
          width: 100%;
          will-change: transform;
          transition: transform 0.25s ease;
        }
        /* While a swipe follows the pointer, disable the slide transition. */
        .ws-carousel-track--live { transition: none; }
        .ws-win { flex: 0 0 100%; display: flex; flex-direction: column; min-width: 0; min-height: 0; }
        .ws-win-body { flex: 1; min-height: 0; display: flex; gap: 3px; padding: 4px; min-width: 0; }
        .ws-win-side {
          width: 18px;
          flex-shrink: 0;
          background: var(--bg-secondary, #252526);
          border-radius: 3px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 2px;
          padding: 4px 0;
        }
        .ws-thumb-side-row { width: 12px; height: 4px; border-radius: 2px; background: var(--bg-active, #37373d); }
        .ws-win-grid { flex: 1; display: flex; gap: 3px; min-width: 0; }
        .ws-thumb-cell { flex: 1 1 0; min-width: 0; background: var(--bg-active, #37373d); border-radius: 3px; }
        /* Carousel page dots — absolutely positioned just below the skeleton so
           they add no height, but a few px above the row's bottom separator. */
        .ws-carousel-dots {
          position: absolute;
          left: 0;
          right: 0;
          bottom: -9px;
          display: flex;
          justify-content: center;
          gap: 3px;
          pointer-events: none;
        }
        .ws-dot { width: 4px; height: 4px; border-radius: 50%; background: var(--text-secondary, #999); opacity: 0.4; }
        .ws-dot--active { opacity: 1; background: var(--accent, #569cd6); }
        /* Hover arrows to step the carousel to the next/previous window skeleton. */
        .ws-carousel-arrow {
          position: absolute;
          top: 50%;
          transform: translateY(-50%);
          width: 18px;
          height: 18px;
          padding: 0;
          border-radius: 50%;
          border: none;
          background: rgba(0, 0, 0, 0.35);
          color: var(--text-primary, #ddd);
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          opacity: 0;
          pointer-events: none;
          transition: opacity 0.12s ease, background 0.12s ease;
          z-index: 2;
        }
        .ws-carousel-arrow:hover { background: rgba(0, 0, 0, 0.55); }
        .ws-carousel-arrow svg { display: block; }
        .ws-carousel-arrow:disabled { opacity: 0; pointer-events: none; }
        .ws-carousel-arrow--prev { left: 4px; }
        .ws-carousel-arrow--next { right: 4px; }
        .ws-thumb:hover .ws-carousel-arrow { opacity: 1; pointer-events: auto; }
        /* Workspace-list delete mode + inline "new workspace" row. */
        .ws-row--select { cursor: pointer; }
        /* The inline "new workspace" row is a normal full-width row — only the
           top/bottom edges get the dashed "add" affordance, not the sides. */
        .ws-row--new {
          cursor: default;
          border-top: 1px dashed var(--divider, #444);
          border-bottom: 1px dashed var(--divider, #444);
        }
        .ws-row--new:hover { background: var(--bg-hover, #2a2d2e); }
        .wm-new-ws-input {
          min-width: 0;
          background: transparent;
          border: none;
          outline: none;
          color: var(--text-primary, #ddd);
          font-size: 14px;
          font-family: inherit;
          font-weight: 600;
          padding: 0;
          /* Align the placeholder with the workspace name in the other rows. */
          height: auto;
          align-self: flex-start;
        }
        .wm-new-ws-input::placeholder { color: var(--text-secondary, #777); font-weight: 400; }
        /* Skeleton placeholders for the inline "new workspace" card. */
        @keyframes ws-skeleton-pulse {
          0%, 100% { opacity: 0.45; }
          50% { opacity: 1; }
        }
        .ws-skeleton {
          display: inline-block;
          border-radius: 4px;
          background: var(--bg-active, #37373d);
          animation: ws-skeleton-pulse 1.3s ease-in-out infinite;
        }
        .ws-skeleton--num { width: 118px; height: 12px; vertical-align: middle; margin-top: 4px; }
        .ws-skeleton--pill { width: 64px; height: 16px; border-radius: 999px; }
        .ws-skeleton--chevron {
          align-self: center;
          width: 16px;
          height: 16px;
          border-radius: 4px;
          background: rgba(86, 156, 214, 0.35);
        }
        .empty { color: var(--text-secondary, #777); font-size: 13px; padding: 0 16px; }
        /* ── Drawer ─────────────────────────────────────────────── */
        /* A single shared shadow element whose width tracks the widest drawer,
           so the stack never stacks multiple shadows on top of each other. */
        .drawer-shadow {
          position: absolute;
          top: 0;
          right: 0;
          bottom: 0;
          pointer-events: none;
          box-shadow: -8px 0 24px rgba(0, 0, 0, 0.35);
          transition: width 0.2s ease;
          /* Slide out with the first drawer so the shadow emerges in lockstep,
             rather than popping in at full width. */
          animation: dw-slide 0.18s ease;
        }
        .drawer {
          position: absolute;
          top: 0;
          right: 0;
          bottom: 0;
          display: flex;
          flex-direction: column;
          min-width: 0;
          background: var(--bg-secondary, #252526);
          border-left: 1px solid var(--divider, #444);
          transition: width 0.2s ease;
          animation: dw-slide 0.18s ease;
        }
        /* Mask over any non-top drawer: blocks its buttons/items (no tint — the
           drawer keeps the same colour). Clicking the exposed sliver closes the
           deeper drawers. */
        .drawer-mask {
          position: absolute;
          inset: 0;
          z-index: 2;
          background: transparent;
          cursor: pointer;
        }
        @keyframes dw-slide {
          from { transform: translateX(24px); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        @keyframes dw-slide-out {
          from { transform: translateX(0); opacity: 1; }
          to { transform: translateX(24px); opacity: 0; }
        }
        /* A drawer that is leaving slides out to the right and fades. */
        .drawer--closing {
          animation: dw-slide-out 0.18s ease forwards;
          pointer-events: none;
          z-index: 1000;
        }
        .drawer-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          flex-shrink: 0;
          height: 44px;
          padding: 0 14px;
          border-bottom: 1px solid var(--divider, #333);
        }
        .drawer-title {
          font-size: 13px;
          font-weight: 600;
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .crumbs {
          flex: 1;
          min-width: 0;
          display: flex;
          align-items: center;
          gap: 2px;
          overflow: visible;
          white-space: nowrap;
        }
        .crumbs-sep { color: var(--text-secondary, #999); margin: 0 2px; flex-shrink: 0; }
        .crumbs-item {
          border: none;
          background: transparent;
          color: var(--accent, #569cd6);
          font-size: 13px;
          padding: 2px 4px;
          border-radius: 4px;
          cursor: pointer;
          max-width: 20em;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          flex-shrink: 1;
          min-width: 0;
        }
        .crumbs-item:hover { background: var(--bg-active, #37373d); }
        .crumbs-current {
          color: var(--text-primary, #e8e8e8);
          font-size: 13px;
          font-weight: 600;
          max-width: 20em;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          flex-shrink: 1;
          min-width: 0;
        }
        .crumbs-more { position: relative; display: inline-flex; flex-shrink: 0; }
        .crumbs-ellipsis {
          border: none;
          background: transparent;
          color: var(--accent, #569cd6);
          font-size: 13px;
          padding: 2px 6px;
          border-radius: 4px;
          cursor: pointer;
        }
        .crumbs-ellipsis:hover { background: var(--bg-active, #37373d); }
        .crumbs-menu {
          position: absolute;
          top: 26px;
          left: 0;
          z-index: 30;
          min-width: 180px;
          max-height: 260px;
          overflow-y: auto;
          margin: 0;
          padding: 4px;
          list-style: none;
          background: var(--bg-secondary, #252526);
          border: 1px solid var(--divider, #333);
          border-radius: 6px;
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
        }
        .crumbs-menu-item {
          width: 100%;
          border: none;
          background: transparent;
          color: var(--text-primary, #e8e8e8);
          font-size: 13px;
          text-align: left;
          padding: 6px 10px;
          border-radius: 4px;
          cursor: pointer;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .crumbs-menu-item:hover { background: var(--bg-active, #37373d); }
        .drawer-actions { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
        .dw-open {
          border: none;
          border-radius: 4px;
          background: rgba(86, 156, 214, 0.15);
          color: var(--accent, #569cd6);
          font-size: 12px;
          font-weight: 600;
          padding: 4px 10px;
          cursor: pointer;
        }
        .dw-open:hover { background: rgba(86, 156, 214, 0.25); }
        .dw-close {
          border: none;
          background: transparent;
          color: var(--text-secondary, #999);
          font-size: 16px;
          width: 26px;
          height: 26px;
          border-radius: 4px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
        }
        .dw-close:hover { background: var(--bg-active, #37373d); color: var(--text-primary, #ddd); }
        .drawer-body { flex: 1; min-height: 0; overflow-y: auto; padding: 14px; }
        .drawer-footer {
          display: flex;
          align-items: center;
          gap: 6px;
          justify-content: flex-end;
          flex-shrink: 0;
          height: 44px;
          padding: 0 14px;
          border-top: 1px solid var(--divider, #333);
        }
        /* Persistent bottom bar of the top-level workspace list. Sits at the
           window bottom, behind the drawer layer — a drawer slides over it. */
        .ws-list-footer {
          position: absolute;
          left: 0;
          right: 0;
          bottom: 0;
          /* Below the drawers (z-index 1+) so a slide-in drawer covers it. */
          z-index: 0;
          display: flex;
          align-items: center;
          gap: 6px;
          justify-content: flex-end;
          flex-shrink: 0;
          height: 44px;
          padding: 0 14px;
          border-top: 1px solid var(--divider, #333);
          background: var(--bg-secondary, #252526);
        }
        .dw-add {
          border: none;
          background: transparent;
          color: var(--text-secondary, #999);
          font-size: 20px;
          width: 28px;
          height: 28px;
          border-radius: 6px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          user-select: none;
        }
        .dw-add:hover { background: var(--bg-active, #37373d); color: var(--text-primary, #ddd); }
        .dw-delete,
        .dw-delete-confirm {
          border: none;
          border-radius: 6px;
          padding: 4px 10px;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
        }
        .dw-delete {
          border: none;
          background: transparent;
          color: var(--text-secondary, #999);
          width: 28px;
          height: 28px;
          border-radius: 6px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          padding: 0;
        }
        .dw-delete:hover {
          background: rgba(224, 108, 117, 0.15);
          color: #e06c75;
        }
        .dw-delete svg { fill: currentColor; }
        .dw-delete-confirm {
          background: rgba(224, 108, 117, 0.15);
          color: #e06c75;
        }
        .dw-delete-confirm:hover { background: rgba(224, 108, 117, 0.25); }
        .dw-delete-confirm:disabled { opacity: 0.4; cursor: default; }
        .dw-delete-cancel {
          border: none;
          background: transparent;
          color: var(--text-secondary, #999);
          font-size: 12px;
          font-weight: 600;
          padding: 4px 10px;
          cursor: pointer;
          border-radius: 6px;
        }
        .dw-delete-cancel:hover { background: var(--bg-active, #37373d); color: var(--text-primary, #ddd); }
        .dw-list { list-style: none; margin: 0; padding: 0; }
        .dw-item {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 10px;
          margin-bottom: 4px;
          border-radius: 4px;
          cursor: pointer;
        }
        .dw-item:hover { background: var(--bg-active, #37373d); }
        .dw-item--new {
          cursor: default;
          border: 1px dashed var(--divider, #444);
        }
        .dw-item--new:hover { background: transparent; }
        .dw-new-input {
          flex: 1;
          min-width: 0;
          background: transparent;
          border: none;
          outline: none;
          color: var(--text-primary, #ddd);
          font-size: 13px;
          font-family: inherit;
          padding: 0;
        }
        .dw-new-input::placeholder { color: var(--text-secondary, #777); }
        .dw-item--selectable { cursor: pointer; }
        .dw-item--selected { background: var(--bg-active, #37373d); }
        .dw-checkbox {
          width: 14px;
          height: 14px;
          border: 1px solid var(--text-secondary, #999);
          border-radius: 3px;
          flex-shrink: 0;
          align-self: center;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          color: transparent;
        }
        .dw-checkbox--checked {
          background: var(--accent, #569cd6);
          border-color: var(--accent, #569cd6);
          color: #fff;
        }
        .dw-checkbox--checked::after { content: "✓"; font-size: 11px; line-height: 1; }
        .dw-item-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .dw-item-meta { color: var(--text-secondary, #999); font-size: 12px; }
        .dw-meta-block { color: var(--text-secondary, #999); font-size: 12px; line-height: 1.6; }
      </style>
      <div class="wm-root">
        <div class="wm-titlebar">
          <span class="wm-title">Workspace Manager</span>
        </div>
        <div class="wm-drawer-layer">
          <div class="wm-body" @click=${this._onBackgroundClick}>
            ${this._loaded && this._workspaces.length === 0 && !this._addingWorkspace
              ? html`<p class="empty">No workspaces yet. Create one from an open workspace window.</p>`
              : html`
                  <ul>
                    ${this._addingWorkspace
                      ? html`
                          <li class="ws-row ws-row--new">
                            <div class="ws-thumb ws-thumb--skeleton">
                              <div class="ws-carousel"><div class="ws-carousel-track">
                                <div class="ws-win">
                                  <div class="ws-thumb-chrome"><span class="ws-thumb-dot"></span><span class="ws-thumb-dot"></span><span class="ws-thumb-dot"></span></div>
                                  <div class="ws-win-body">
                                    <div class="ws-win-grid"><div class="ws-thumb-cell"></div><div class="ws-thumb-cell"></div></div>
                                  </div>
                                </div>
                              </div></div>
                            </div>
                            <div class="ws-info">
                              <input
                                class="wm-new-ws-input"
                                placeholder="Workspace name"
                                spellcheck="false"
                                @keydown=${(e: KeyboardEvent) => this._onNewWorkspaceKeydown(e)}
                                @blur=${() => { if (this._addingWorkspace) void this._createWorkspaceFromInput(); }}
                              />
                              <div class="ws-meta"><span class="ws-skeleton ws-skeleton--num"></span></div>
                              <div class="ws-pills"><span class="ws-skeleton ws-skeleton--pill"></span></div>
                            </div>
                            <span class="ws-skeleton ws-skeleton--chevron"></span>
                          </li>
                        `
                      : nothing}
                    ${this._workspaces.map((w, i) => {
                      const name = w.data.name?.trim() || "Unnamed";
                      const repos = w.data.repos?.length ?? 0;
                      const worktrees = (w.data.repos ?? []).reduce(
                        (n, r) => n + (r.worktrees?.length ?? 0),
                        0,
                      );
                      const isOpen = openPaths.has(w.filePath);
                      const windows = w.data.windows ?? [];
                      const shared = w.data.sharedSidebars;
                      const leftOpen = !!shared?.leftSidebarOpen;
                      const rightOpen = !!shared?.rightSidebarOpen;
                      const wins = windows.length > 0 ? windows : [undefined];
                      const idx = Math.min(this._carouselIndex.get(w.filePath) ?? 0, wins.length - 1);
                      const isLast = i === this._workspaces.length - 1;
                      const sideRows = html`<span class="ws-thumb-side-row"></span><span class="ws-thumb-side-row"></span><span class="ws-thumb-side-row"></span>`;
                      return html`
                        <li
                          class="ws-row ${this._workspaceDeleteMode ? "ws-row--select" : ""} ${isOpen && !this._workspaceDeleteMode ? "ws-row--open" : ""} ${isLast ? "ws-row--last" : ""} ${isLast && !this._listOverflows ? "ws-row--last-visible" : ""}"
                          @click=${(e: Event) => { e.stopPropagation(); if (this._suppressClick) { this._suppressClick = false; return; } if (this._workspaceDeleteMode) this._toggleWorkspaceSelection(w.filePath); else this._openWorkspace(w); }}
                        >
                          <div class="ws-thumb-wrap">
                            <div
                              class="ws-thumb"
                              @pointerdown=${(e: PointerEvent) => this._onThumbPointerDown(e, w.filePath, isOpen)}
                              @pointermove=${this._onThumbPointerMove}
                              @pointerup=${this._onThumbPointerUp}
                              @pointercancel=${this._onThumbPointerCancel}
                            >
                              <div class="ws-carousel">
                                <div class="ws-carousel-track ${this._carouselLive ? "ws-carousel-track--live" : ""}" style="transform: translateX(${-idx * 100}%)">
                                  ${wins.map((win) => html`
                                    <div class="ws-win">
                                      <div class="ws-thumb-chrome"><span class="ws-thumb-dot"></span><span class="ws-thumb-dot"></span><span class="ws-thumb-dot"></span></div>
                                      <div class="ws-win-body">
                                        ${leftOpen ? html`<div class="ws-win-side">${sideRows}</div>` : nothing}
                                        <div class="ws-win-grid">${Array.from({ length: this._skeletonCells(win) }, () => html`<div class="ws-thumb-cell"></div>`)}</div>
                                        ${rightOpen ? html`<div class="ws-win-side">${sideRows}</div>` : nothing}
                                      </div>
                                    </div>
                                  `)}
                                </div>
                              </div>
                              ${wins.length > 1
                                ? html`
                                    <button
                                      class="ws-carousel-arrow ws-carousel-arrow--prev"
                                      ?disabled=${idx === 0}
                                      aria-label="Previous window"
                                      @pointerdown=${(e: Event) => e.stopPropagation()}
                                      @click=${(e: Event) => {
                                        e.stopPropagation();
                                        this._gotoCarousel(w.filePath, idx - 1);
                                      }}
                                    ><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg></button>
                                    <button
                                      class="ws-carousel-arrow ws-carousel-arrow--next"
                                      ?disabled=${idx === wins.length - 1}
                                      aria-label="Next window"
                                      @pointerdown=${(e: Event) => e.stopPropagation()}
                                      @click=${(e: Event) => {
                                        e.stopPropagation();
                                        this._gotoCarousel(w.filePath, idx + 1);
                                      }}
                                    ><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg></button>
                                  `
                                : nothing}
                            </div>
                            ${wins.length > 1
                              ? html`<div class="ws-carousel-dots">${wins.map((_win, wi) => html`<span class="ws-dot ${wi === idx ? "ws-dot--active" : ""}"></span>`)}</div>`
                              : nothing}
                          </div>
                          <div class="ws-info">
                            <div class="ws-name">${name}</div>
                            <div class="ws-meta">${this._countLabel(repos, "repo")} · ${this._countLabel(worktrees, "worktree")}</div>
                            ${this._workspaceDeleteMode
                              ? nothing
                              : html`
                                  <div class="ws-pills">
                                    ${isOpen
                                      ? html`<span class="ws-pill ws-pill--open" role="button" tabindex="0" @click=${(e: Event) => this._onRowPillOpen(e, w.filePath)}>Open</span>`
                                      : nothing}
                                    <span class="ws-pill">${this._countLabel(w.data.windows?.length ?? 0, "window")}</span>
                                  </div>
                                `}
                          </div>
                          ${this._workspaceDeleteMode
                            ? html`<span class="dw-checkbox ${this._selectedWorkspaces.has(w.filePath) ? "dw-checkbox--checked" : ""}"></span>`
                            : html`<svg class="ws-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>`}
                        </li>
                      `;
                    })}
                  </ul>
                `}
          </div>
          ${this._drawers.length > 0
            ? html`<div class="drawer-shadow" style="width:${this._stackWidth()}%"></div>`
            : nothing}
          ${this._drawers.map(
            (d, i) => html`
              <div class="drawer" style="width:${this._widthFor(i)}%; z-index:${i + 1}">
                ${i < this._drawers.length - 1
                  ? html`<div class="drawer-mask" @click=${(e: Event) => { e.stopPropagation(); this._closeDeeper(i); }}></div>`
                  : nothing}
                <div class="drawer-head">
                  ${i === this._drawers.length - 1
                    ? this._drawerBreadcrumbs(i)
                    : html`<span class="drawer-title">${d.title}</span>`}
                  <div class="drawer-actions">
                    ${d.kind === "workspace" && !openPaths.has(d.workspacePath)
                      ? html`<button class="dw-open" @click=${(e: Event) => { e.stopPropagation(); this._openWorkspaceWindow(d.workspacePath); }}>Open</button>`
                      : nothing}
                    <button class="dw-close" @click=${(e: Event) => { e.stopPropagation(); this._closeDrawer(d.id); }} aria-label="Close" data-tip="Close">✕</button>
                  </div>
                </div>
                <div class="drawer-body">${this._drawerContent(d)}</div>
                ${this._drawerFooter(d)}
              </div>
            `,
          )}
          ${this._closingDrawers.map(
            (c) => html`
              <div class="drawer drawer--closing" style="width:${c.width}%">
                <div class="drawer-head">
                  <span class="drawer-title">${c.title}</span>
                </div>
                <div class="drawer-body">${this._drawerContent(c)}</div>
              </div>
            `,
          )}
        </div>
        ${this._workspaceListFooter()}
      </div>
    `;
  }

  private _drawerContent(d: DrawerState): TemplateResult {
    if (d.kind === "workspace") {
      const repos = d.data.repos ?? [];
      return html`
        <ul class="dw-list">
          ${this._addingRepo
            ? html`
                <li class="dw-item dw-item--new">
                  <input
                    class="dw-new-input"
                    placeholder="Repo URL"
                    spellcheck="false"
                    @keydown=${(e: KeyboardEvent) => this._onNewRepoKeydown(e, d)}
                    @blur=${(e: Event) => this._commitNewRepo(d, e)}
                  />
                </li>
              `
            : nothing}
          ${repos.length === 0 && !this._addingRepo
            ? html`<p class="empty">No repositories in this workspace.</p>`
            : nothing}
          ${repos.map(
            (repo) => html`
              <li
                class="dw-item ${this._deleteMode ? "dw-item--selectable" : ""} ${this._selectedRepos.has(repo.url) ? "dw-item--selected" : ""}"
                @click=${(e: Event) => { e.stopPropagation(); if (this._deleteMode) this._toggleRepoSelection(repo.url); else this._openRepo(d, repo); }}
              >
                <span class="dw-item-name">${deriveRepoName(repo.url)}</span>
                ${this._deleteMode
                  ? html`<span class="dw-checkbox ${this._selectedRepos.has(repo.url) ? "dw-checkbox--checked" : ""}"></span>`
                  : html`<span class="dw-item-meta">${repo.worktrees?.length ?? 0} worktree${(repo.worktrees?.length ?? 0) === 1 ? "" : "s"}</span>`}
              </li>
            `,
          )}
        </ul>
      `;
    }

    if (d.kind === "repo") {
      const repo = d.data.repos?.find((r) => r.url === d.repoUrl);
      const wts = repo?.worktrees ?? [];
      return html`
        <ul class="dw-list">
          ${this._addingWorktree
            ? html`
                <li class="dw-item dw-item--new">
                  <input
                    class="dw-new-input"
                    placeholder="Worktree branch"
                    spellcheck="false"
                    @keydown=${(e: KeyboardEvent) => this._onNewWorktreeKeydown(e, d)}
                    @blur=${(e: Event) => this._commitNewWorktree(d, e)}
                  />
                </li>
              `
            : nothing}
          ${wts.length === 0 && !this._addingWorktree
            ? html`<p class="empty">No worktrees yet.</p>`
            : nothing}
          ${wts.map(
            (wt) => html`
              <li
                class="dw-item ${this._worktreeDeleteMode ? "dw-item--selectable" : ""} ${this._selectedWorktrees.has(wt) ? "dw-item--selected" : ""}"
                @click=${(e: Event) => { e.stopPropagation(); if (this._worktreeDeleteMode) this._toggleWorktreeSelection(wt); else this._openWorktree(d, wt); }}
              >
                <span class="dw-item-name">${wt}</span>
                ${this._worktreeDeleteMode
                  ? html`<span class="dw-checkbox ${this._selectedWorktrees.has(wt) ? "dw-checkbox--checked" : ""}"></span>`
                  : html`<span class="dw-item-meta">worktree</span>`}
              </li>
            `,
          )}
        </ul>
      `;
    }

    // worktree detail
    const repoName = d.repoUrl ? deriveRepoName(d.repoUrl) : d.title;
    return html`
      <p class="empty">${d.worktree ?? ""}</p>
      <p class="dw-meta-block">Workspace: ${d.data.name?.trim() || "Unnamed"}<br />Repo: ${repoName}</p>
    `;
  }
}

customElements.define("openp41ge-window-manager", Openp41geWindowManager);
