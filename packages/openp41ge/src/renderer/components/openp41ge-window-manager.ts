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
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import { LitElement } from "lit";
import { state } from "lit/decorators.js";
import { REGEX_ICON, CASE_ON_ICON } from "../apps/git-commit-search/search-icons";
import { tooltipController, OverlayScrollbar } from "openp41ge-uikit";
import type { WorkspaceFileData } from "../../layout/types";
import type { Openp41geContextMenuElement } from "../interfaces/element-guards";
import { workspaceFileService, deriveRepoName } from "../services/workspace-file-service";
import { welcomePages } from "../content/welcome";

/** Unchecked / checked icons for the "never show welcome" toggle. */
const WELCOME_UNCHECKED_ICON = '<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#e3e3e3"><path d="M480-80q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Zm0-80q134 0 227-93t93-227q0-134-93-227t-227-93q-134 0-227 93t-93 227q0 134 93 227t227 93Zm0-320Z"/></svg>';
const WELCOME_CHECKED_ICON = '<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#e3e3e3"><path d="m424-296 282-282-56-56-226 226-114-114-56 56 170 170Zm56 216q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Zm0-80q134 0 227-93t93-227q0-134-93-227t-227-93q-134 0-227 93t-93 227q0 134 93 227t227 93Zm0-320Z"/></svg>';
import "./openp41ge-sidebar-demo";
import "./openp41ge-sidebar-move-demo";
import "./openp41ge-grid-demo";
import "./openp41ge-window-intro-demo";
import "./openp41ge-stack-demo";

/** Hold a skeleton this long before the drag element appears (long-press pickup). */
const HOLD_MS = 350;
/** Pointer travel past this many px starts an immediate drag (below the long-press hold). */
const DRAG_THRESHOLD = 4;
/** A carousel swipe has to be this much more horizontal than vertical. The skeleton
 *  sits at the left edge of the row, so pulling a workspace out of the window is
 *  itself a mostly-horizontal move — only a decisively sideways one is a swipe. */
const SWIPE_AXIS_RATIO = 1.6;
/** Vertical travel past this fraction of the skeleton's height ends a swipe: the
 *  pointer has left the row, so the gesture is a drag-out after all. */
const SWIPE_EXIT_DY = 0.75;
/** Within this many px of a window edge the pointer counts as on its way out. */
const WINDOW_EDGE_MARGIN = 2;

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

/** Tabs available in the manager window's tab bar. */
type ManagerTabId = "workspaces" | "settings" | "welcome" | "releases";

/** Labels for each manager tab, keyed by id. */
const MANAGER_TAB_LABELS: Record<ManagerTabId, string> = {
  welcome: "Welcome",
  workspaces: "Workspaces",
  settings: "Settings",
  releases: "Releases",
};

export class Openp41geWindowManager extends LitElement {
  @state() private _workspaces: Array<{ filePath: string; data: WorkspaceFileData }> = [];
  @state() private _openWindows: OpenWindowSummary[] = [];
  @state() private _drawers: DrawerState[] = [];
  @state() private _openTabs: ManagerTabId[] = ["welcome"];
  @state() private _activeTab: ManagerTabId = "welcome";
  @state() private _welcomePage = 0;
  @state() private _welcomeDismissed = false;
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
  /** The header is expanded into the workspace search bar. */
  @state() private _searchOpen = false;
  /** Raw text in the header search input. */
  @state() private _searchQuery = "";
  /** Match case in the header search. */
  @state() private _caseSensitive = false;
  /** Treat the header search query as a regular expression. */
  @state() private _useRegex = false;
  private _drag: {
    startX: number;
    startY: number;
    startScreenX: number;
    startScreenY: number;
    /** Cursor offset within the skeleton element (grab point), so the drag
     * element hangs from where the user actually grabbed it, not centred. */
    offsetX: number;
    offsetY: number;
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
  private _offOpenWindowsChanged: (() => void) | null = null;
  private _offActivateTab: (() => void) | null = null;
  /** Suppress the following row click after a drag/swipe, so the drawer doesn't pop open. */
  private _suppressClick = false;
  private _tooltipTargets: Element[] = [];
  private _overlayScrollbar: OverlayScrollbar | null = null;

  connectedCallback(): void {
    super.connectedCallback();
    window.addEventListener("focus", this._onFocus);
    window.addEventListener("resize", this._measureListOverflow);
    document.addEventListener("keydown", this._onKeydown);
    document.addEventListener("click", this._onDocumentClick);
    // Welcome intro action buttons live inside the shadow DOM, so clicks are
    // delegated at the shadow root (they're retargeted to the host by the time
    // they reach a document listener).
    this.shadowRoot?.addEventListener("click", this._onShadowClick);
    // Any new pointer press clears the drag-follow-up suppression. A click can
    // only follow a drag within the same gesture (no pointerdown between), so a
    // fresh press always means the previous drag's follow-up click is moot.
    document.addEventListener("pointerdown", this._onPointerDown);
    // When a drag-out opens a workspace window in the main process (cursor left
    // the window), the main process ends the session and notifies us to clear
    // the in-flight drag state.
    this._offEndSession = window.openp41ge.drag.onEndSession(() => this._teardownDrag());
    // Refresh the open-windows column immediately when any window opens/closes,
    // rather than waiting for this window to regain focus.
    this._offOpenWindowsChanged = window.openp41ge.windowManager.onOpenWindowsChanged(() => {
      void this._load();
    });
    // A menu item may request a specific tab when the manager window is already
    // open; activate it and bring the window to front (done in main).
    this._offActivateTab = window.openp41ge.windowManager.onActivateTab((tab) => {
      if (tab === "workspaces" || tab === "settings" || tab === "welcome" || tab === "releases") {
        this._activateTab(tab);
      }
    });
    // Fresh window opened for a specific tab (e.g. app menu > Settings).
    const launchTab = window.openp41ge.workspace.getLaunchTab();
    if (launchTab) this._activateTab(launchTab);
    void this._load();
    // If the user opted out of the welcome intro, don't land on it (or open it)
    // on future launches. Dismissal is a marker file in the app-data dir.
    void window.openp41ge.welcome.isDismissed().then((dismissed) => {
      if (dismissed) {
        this._welcomeDismissed = true;
        if (this._activeTab === "welcome") {
          this._activateTab("workspaces");
          this._closeTab("welcome");
        }
      }
    });
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    window.removeEventListener("focus", this._onFocus);
    window.removeEventListener("resize", this._measureListOverflow);
    document.removeEventListener("keydown", this._onKeydown);
    document.removeEventListener("click", this._onDocumentClick);
    this.shadowRoot?.removeEventListener("click", this._onShadowClick);
    document.removeEventListener("pointerdown", this._onPointerDown);
    this._offEndSession?.();
    this._offOpenWindowsChanged?.();
    this._offOpenWindowsChanged = null;
    this._offActivateTab?.();
    this._offActivateTab = null;
    for (const el of this._tooltipTargets) tooltipController.detach(el);
    this._tooltipTargets = [];
    this._overlayScrollbar?.destroy();
    this._overlayScrollbar = null;
  }

  /** Attach custom tooltips to the footer tool buttons (replaces native `title`). */
  updated(): void {
    this._measureListOverflow();
    const btns = this.shadowRoot?.querySelectorAll<HTMLElement>(
      ".dw-search, .wm-search-toggle, .wm-search-clear, .dw-add, .dw-delete, .dw-delete-cancel, .dw-delete-confirm, .dw-close, .wm-tab-close, .wm-tabbar-add",
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

    // Attach the custom overlay scrollbar to the workspace list once. It floats
    // over the list (no reserved gutter) and sits below the drawer mask/drawers.
    if (!this._overlayScrollbar) {
      const body = this.shadowRoot?.querySelector<HTMLElement>(".wm-body");
      const layer = this.shadowRoot?.querySelector<HTMLElement>(".wm-drawer-layer");
      if (body && layer) {
        this._overlayScrollbar = OverlayScrollbar.attach(body, {
          axis: "vertical",
          container: layer,
          inset: { top: "35px" },
          zIndex: 0,
          size: 9,
          autoHide: true,
          // The track lives in this component's shadow root, so inject the
          // overlay styles there (document-level styles don't cross the
          // shadow boundary).
          styleTarget: this.shadowRoot ?? undefined,
        });
      }
    }
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

  /** Welcome intro action buttons (e.g. "Open Workspaces") activate their tab. */
  private _onShadowClick = (e: Event): void => {
    const target = e.target as HTMLElement | null;
    const btn = target?.closest?.("button.wm-md-button[data-tab]") as HTMLElement | null;
    if (!btn) return;
    const tab = btn.dataset.tab ?? "";
    if (tab === "workspaces" || tab === "settings" || tab === "welcome" || tab === "releases") {
      this._activateTab(tab);
    }
  };

  /** Hover a workspace skeleton: pre-capture its bitmap so the drag ghost has
   * the real skeleton ready at drag.start even for a fast grab-and-drag. The
   * pointer-down re-request reuses this cache (see the prepare-bitmap handler). */
  private _onThumbPointerEnter(e: PointerEvent, path: string, isOpen: boolean): void {
    if (isOpen) return;
    const thumb = e.currentTarget as HTMLElement;
    const rect = thumb.getBoundingClientRect();
    window.openp41ge.drag.prepareBitmap({
      x: Math.round(rect.left),
      y: Math.round(rect.top),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    });
  }

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
    const captureRect = {
      x: Math.round(rect.left),
      y: Math.round(rect.top),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    };
    // Pre-capture the skeleton bitmap now so the ghost can pop with the real
    // skeleton the instant the drag starts, rather than waiting for the async
    // capture that runs after drag.start.
    window.openp41ge.drag.prepareBitmap(captureRect);
    this._drag = {
      startX: e.clientX,
      startY: e.clientY,
      startScreenX: e.screenX,
      startScreenY: e.screenY,
      offsetX: e.clientX - rect.left,
      offsetY: e.clientY - rect.top,
      captureRect,
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
    this._startOpenDrag(drag.startScreenX, drag.startScreenY);
    window.openp41ge.drag.move(drag.startScreenX, drag.startScreenY);
  }

  /**
   * Put the in-flight gesture into open mode: start a real (native) drag so the
   * ghost can leave the window. Passes the skeleton's capture rect so the main
   * process swaps in a bitmap of the actual skeleton (not just a label). The
   * window opens on the drop, only if the cursor is outside this window at
   * release. Called from the long-press, from the first move past the threshold,
   * and when a carousel swipe turns out to be a drag-out.
   */
  private _startOpenDrag(screenX: number, screenY: number): void {
    const drag = this._drag;
    if (!drag) return;
    drag.mode = "open";
    window.openp41ge.drag.start(
      drag.label,
      screenX,
      screenY,
      "🗂",
      undefined,
      undefined,
      undefined,
      132,
      84,
      drag.offsetX,
      drag.offsetY,
      "workspace",
      drag.path,
      drag.captureRect ?? undefined,
      0,
    );
    window.openp41ge.drag.activate();
  }

  private _clearHoldTimer(): void {
    if (this._holdTimer !== null) {
      window.clearTimeout(this._holdTimer);
      this._holdTimer = null;
    }
  }

  /** True once the pointer is at (or past) a window edge, so the gesture is on its
   * way out of the window rather than staying in the row. */
  private _headingOutOfWindow(x: number, y: number): boolean {
    const m = WINDOW_EDGE_MARGIN;
    return x <= m || y <= m || x >= window.innerWidth - m || y >= window.innerHeight - m;
  }

  /** True when a carousel swipe has stopped looking like one: the pointer left the
   * row vertically, or it is heading out of the window. Either way the user is
   * pulling the workspace out, not paging its windows. */
  private _swipeBroken(x: number, y: number): boolean {
    const drag = this._drag;
    if (!drag) return false;
    const rect = drag.captureRect;
    if (rect && Math.abs(y - drag.startY) > rect.height * SWIPE_EXIT_DY) return true;
    return this._headingOutOfWindow(x, y);
  }

  /**
   * Once the drag passes the threshold, decide the gesture.
   *
   * Everything is a drag-out unless it reads unmistakably as a carousel swipe: a
   * workspace with more than one window, a decisively horizontal move, and a
   * pointer still inside the window. A drag-out starts from a skeleton at the left
   * edge of the row, so it is mostly horizontal too — the old "dominant axis" split
   * handed a fast sideways flick to the carousel (and to nothing at all for a
   * single-window workspace, which has no carousel to page).
   *
   * The call also stays revisable: the first pointermove of a fast flick is one
   * coarse sample, so a "swipe" that later leaves the row or reaches the window
   * edge is promoted to a drag-out mid-gesture.
   */
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
      const isSwipe =
        drag.windowCount > 1 &&
        Math.abs(dx) > Math.abs(dy) * SWIPE_AXIS_RATIO &&
        !this._swipeBroken(e.clientX, e.clientY);
      if (isSwipe) drag.mode = "carousel";
      else this._startOpenDrag(e.screenX, e.screenY);
    } else if (drag.mode === "carousel" && this._swipeBroken(e.clientX, e.clientY)) {
      // The swipe turned into a pull away from the row — snap the carousel back to
      // where the press started and pick the workspace up instead.
      this._setCarouselIndex(drag.path, drag.baseIndex, false);
      this._startOpenDrag(e.screenX, e.screenY);
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
    if (mode === null) return;
    // Compute outside synchronously (window.screenX/screenY match the main
    // process window bounds) and end the drag in the same tick. Awaiting an
    // IPC before drag.end() left a window in which a second drag could start
    // and have its session/ghost clobbered by the delayed drag.end().
    const outside =
      e.screenX < window.screenX ||
      e.screenX > window.screenX + window.outerWidth ||
      e.screenY < window.screenY ||
      e.screenY > window.screenY + window.outerHeight;
    // Only an open drag has a ghost session to tear down.
    if (mode === "open") window.openp41ge.drag.end();
    // A release outside this window opens the workspace whatever we read the
    // gesture as. A flick fast enough to leave the window before the next
    // pointermove lands can still be sitting in carousel mode here, and the drop
    // point is the real signal of intent.
    if (outside) this._openWorkspaceWindow(path);
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
    if (this._activeTab === "welcome") {
      if (e.key === "ArrowLeft") {
        this._welcomeNav(-1);
        return;
      }
      if (e.key === "ArrowRight") {
        this._welcomeNav(1);
        return;
      }
    }
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

  private _welcomeNav(delta: number): void {
    const next = Math.min(welcomePages.length - 1, Math.max(0, this._welcomePage + delta));
    if (next !== this._welcomePage) this._welcomePage = next;
  }

  /** Toggle + persist the "never show the welcome intro again" choice. */
  private _onWelcomeDismissToggle = (): void => {
    this._welcomeDismissed = !this._welcomeDismissed;
    void window.openp41ge.welcome.setDismissed(this._welcomeDismissed);
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
        <button
          class="dw-search"
          aria-label="Search workspaces"
          aria-pressed=${this._searchOpen}
          data-tip="Search workspaces"
          @click=${(e: Event) => {
            e.stopPropagation();
            if (this._searchOpen) {
              this._exitSearch();
            } else {
              this._startSearch();
            }
          }}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
        </button>
        <span class="wm-footer-spacer"></span>
        ${
          this._workspaceDeleteMode
            ? html`
                <button
                  class="dw-delete-cancel"
                  @click=${(e: Event) => {
                    e.stopPropagation();
                    this._cancelWorkspaceDeleteMode();
                  }}
                  data-tip="Cancel"
                >
                  Cancel
                </button>
                <button
                  class="dw-delete-confirm"
                  @click=${(e: Event) => {
                    e.stopPropagation();
                    void this._deleteSelectedWorkspaces();
                  }}
                  data-tip="Delete selected workspaces"
                  ?disabled=${this._selectedWorkspaces.size === 0}
                >
                  Delete
                </button>
              `
            : html`
                <button
                  class="dw-add"
                  @click=${(e: Event) => {
                    e.stopPropagation();
                    this._toggleAddWorkspace();
                  }}
                  aria-label="New workspace"
                  data-tip="New workspace"
                >
                  ＋
                </button>
                <button
                  class="dw-delete"
                  @click=${(e: Event) => {
                    e.stopPropagation();
                    this._activateWorkspaceDeleteMode();
                  }}
                  aria-label="Delete workspaces"
                  data-tip="Delete workspaces"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    height="18px"
                    viewBox="0 -960 960 960"
                    width="18px"
                    fill="currentColor"
                  >
                    <path
                      d="M280-120q-33 0-56.5-23.5T200-200v-520h-40v-80h200v-40h240v40h200v80h-40v520q0 33-23.5 56.5T680-120H280Zm400-600H280v520h400v-520ZM360-280h80v-360h-80v360Zm160 0h80v-360h-80v360ZM280-720v520-520Z"
                    />
                  </svg>
                </button>
              `
        }
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

  /** Whether a workspace matches the header search query (name / repo URL / worktree). */
  private _matchesQuery(
    ws: { data: WorkspaceFileData },
    query: string,
    caseSensitive: boolean,
    useRegex: boolean,
  ): boolean {
    if (!query) return true;
    const name = ws.data.name?.trim() || "Unnamed";
    const haystacks = [
      name,
      ...(ws.data.repos ?? []).map((r) => r.url),
      ...(ws.data.repos ?? []).flatMap((r) => r.worktrees ?? []),
    ];
    if (useRegex) {
      try {
        const re = new RegExp(query, caseSensitive ? "" : "i");
        return haystacks.some((h) => re.test(h));
      } catch {
        return false;
      }
    }
    const needle = caseSensitive ? query : query.toLowerCase();
    return haystacks.some((h) =>
      caseSensitive ? h.includes(query) : h.toLowerCase().includes(needle),
    );
  }

  /** Workspaces shown in the list, honouring the header search query + toggles. */
  private get _filteredWorkspaces(): Array<{ filePath: string; data: WorkspaceFileData }> {
    const q = this._searchQuery;
    if (!q.trim()) return this._workspaces;
    return this._workspaces.filter((w) =>
      this._matchesQuery(w, q, this._caseSensitive, this._useRegex),
    );
  }

  /** Expand the header into the search bar and focus the input. */
  /** Activate a tab, opening it in the bar first if needed. */
  private _activateTab(id: ManagerTabId): void {
    if (!this._openTabs.includes(id)) this._openTabs = [...this._openTabs, id];
    this._activeTab = id;
  }

  /** Close a tab; the last remaining tab cannot be closed. */
  private _closeTab(id: ManagerTabId): void {
    const idx = this._openTabs.indexOf(id);
    if (idx === -1) return;
    const next = this._openTabs.filter((t) => t !== id);
    if (next.length === 0) return;
    this._openTabs = next;
    if (this._activeTab === id) {
      this._activeTab = next[Math.max(0, idx - 1)] ?? next[0];
    }
  }

  /** Open the inline + menu listing the available tabs, with an "O" badge on
   *  the right marking each tab already open in the bar. */
  private _onTabAddClick(e: Event): void {
    const btn = e.currentTarget as HTMLElement | null;
    const r = btn?.getBoundingClientRect();
    const menu = document.createElement("openp41ge-contextmenu") as Openp41geContextMenuElement;
    menu.x = Math.max(8, (r?.right ?? 160) - 160);
    menu.y = (r?.bottom ?? 0) + 2;
    // The Welcome tab is the landing tab and can't be opened again, so it is
    // not offered in the + menu (only Workspaces / Settings / Releases).
    menu.items = (Object.keys(MANAGER_TAB_LABELS) as ManagerTabId[])
      .filter((id) => id !== "welcome")
      .map((id) => ({
        label: MANAGER_TAB_LABELS[id],
        // Boxed "O" marker (mirrors the sidebar + menu) for tabs already open.
        badge: this._openTabs.includes(id) ? "O" : undefined,
        action: () => this._activateTab(id),
      }));
    document.body.appendChild(menu);
  }

  private _startSearch(): void {
    this._searchOpen = true;
    void this.updateComplete.then(() => {
      this.shadowRoot?.querySelector<HTMLInputElement>(".wm-search-input")?.focus();
    });
  }

  /** Collapse the search bar, clear the query, and reset the toggles. */
  private _exitSearch(): void {
    this._searchOpen = false;
    this._searchQuery = "";
    this._caseSensitive = false;
    this._useRegex = false;
  }

  private _onSearchInput(e: Event): void {
    this._searchQuery = (e.target as HTMLInputElement).value;
  }

  private _onSearchKeydown(e: KeyboardEvent): void {
    if (e.key === "Escape") {
      e.preventDefault();
      this._exitSearch();
    }
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
          ${
            this._deleteMode
              ? html`
                  <button
                    class="dw-delete-cancel"
                    @click=${(e: Event) => {
                      e.stopPropagation();
                      this._cancelDeleteMode();
                    }}
                    data-tip="Cancel"
                  >
                    Cancel
                  </button>
                  <button
                    class="dw-delete-confirm"
                    @click=${(e: Event) => {
                      e.stopPropagation();
                      void this._deleteSelectedRepos(d);
                    }}
                    data-tip="Delete selected repositories"
                    ?disabled=${this._selectedRepos.size === 0}
                  >
                    Delete
                  </button>
                `
              : html`
                  <button
                    class="dw-add"
                    @click=${(e: Event) => {
                      e.stopPropagation();
                      this._toggleAddRepo();
                    }}
                    aria-label="Add repository"
                    data-tip="Add repository"
                  >
                    ＋
                  </button>
                  <button
                    class="dw-delete"
                    @click=${(e: Event) => {
                      e.stopPropagation();
                      this._activateDeleteMode();
                    }}
                    aria-label="Delete repositories"
                    data-tip="Delete repositories"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      height="18px"
                      viewBox="0 -960 960 960"
                      width="18px"
                      fill="currentColor"
                    >
                      <path
                        d="M280-120q-33 0-56.5-23.5T200-200v-520h-40v-80h200v-40h240v40h200v80h-40v520q0 33-23.5 56.5T680-120H280Zm400-600H280v520h400v-520ZM360-280h80v-360h-80v360Zm160 0h80v-360h-80v360ZM280-720v520-520Z"
                      />
                    </svg>
                  </button>
                `
          }
        </div>
      `;
    }
    if (d.kind === "repo") {
      return html`
        <div class="drawer-footer">
          ${
            this._worktreeDeleteMode
              ? html`
                  <button
                    class="dw-delete-cancel"
                    @click=${(e: Event) => {
                      e.stopPropagation();
                      this._cancelWorktreeDeleteMode();
                    }}
                    data-tip="Cancel"
                  >
                    Cancel
                  </button>
                  <button
                    class="dw-delete-confirm"
                    @click=${(e: Event) => {
                      e.stopPropagation();
                      void this._deleteSelectedWorktrees(d);
                    }}
                    data-tip="Delete selected worktrees"
                    ?disabled=${this._selectedWorktrees.size === 0}
                  >
                    Delete
                  </button>
                `
              : html`
                  <button
                    class="dw-add"
                    @click=${(e: Event) => {
                      e.stopPropagation();
                      this._toggleAddWorktree();
                    }}
                    aria-label="Add worktree"
                    data-tip="Add worktree"
                  >
                    ＋
                  </button>
                  <button
                    class="dw-delete"
                    @click=${(e: Event) => {
                      e.stopPropagation();
                      this._activateWorktreeDeleteMode();
                    }}
                    aria-label="Delete worktrees"
                    data-tip="Delete worktrees"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      height="18px"
                      viewBox="0 -960 960 960"
                      width="18px"
                      fill="currentColor"
                    >
                      <path
                        d="M280-120q-33 0-56.5-23.5T200-200v-520h-40v-80h200v-40h240v40h200v80h-40v520q0 33-23.5 56.5T680-120H280Zm400-600H280v520h400v-520ZM360-280h80v-360h-80v360Zm160 0h80v-360h-80v360ZM280-720v520-520Z"
                      />
                    </svg>
                  </button>
                `
          }
        </div>
      `;
    }
    if (d.kind === "worktree") {
      return html`
        <div class="drawer-footer">
          ${
            !this._openPaths.has(d.workspacePath)
              ? html`<button
                  class="dw-open"
                  @click=${(e: Event) => {
                    e.stopPropagation();
                    this._openWorkspaceWindow(d.workspacePath);
                  }}
                >
                  Open
                </button>`
              : nothing
          }
          <button
            class="dw-delete"
            @click=${(e: Event) => {
              e.stopPropagation();
              void this._deleteWorktree(d);
            }}
            aria-label="Delete worktree"
            data-tip="Delete worktree"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              height="18px"
              viewBox="0 -960 960 960"
              width="18px"
              fill="currentColor"
            >
              <path
                d="M280-120q-33 0-56.5-23.5T200-200v-520h-40v-80h200v-40h240v40h200v80h-40v520q0 33-23.5 56.5T680-120H280Zm400-600H280v520h400v-520ZM360-280h80v-360h-80v360Zm160 0h80v-360h-80v360ZM280-720v520-520Z"
              />
            </svg>
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
  private _skeletonCells(
    win: { grid?: { placements?: unknown[]; cols?: number } } | undefined,
  ): number {
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
            @click=${(e: Event) => {
              e.stopPropagation();
              this._crumbsOpen = !this._crumbsOpen;
            }}
            aria-label="Show earlier locations"
            aria-expanded=${this._crumbsOpen}
          >
            …
          </button>
          ${
            this._crumbsOpen
              ? html`<menu class="crumbs-menu" @click=${(e: Event) => e.stopPropagation()}>
                  ${hidden.map(
                    (c) =>
                      html`<li>
                        <button
                          class="crumbs-menu-item"
                          @click=${(e: Event) => {
                            e.stopPropagation();
                            this._navigateCrumb(c.index);
                          }}
                        >
                          ${c.label}
                        </button>
                      </li>`,
                  )}
                </menu>`
              : nothing
          }
        </span>
      `);
    }
    visible.forEach((c, k) => {
      if (parts.length > 0) parts.push(html`<span class="crumbs-sep">/</span>`);
      if (k === visible.length - 1) {
        parts.push(html`<span class="crumbs-current">${c.label}</span>`);
      } else {
        parts.push(
          html`<button
            class="crumbs-item"
            @click=${(e: Event) => {
              e.stopPropagation();
              this._navigateCrumb(c.index);
            }}
          >
            ${c.label}
          </button>`,
        );
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
    // Rows shown in the list — filtered by the header search when it is active.
    const filtered = this._searchQuery.trim() ? this._filteredWorkspaces : this._workspaces;

    return html`
      <style>
        *,
        *::before,
        *::after {
          box-sizing: border-box;
        }
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
        /* Frameless window title bar (native drag region). The Window Manager is
           not fullscreenable, so it renders its own close/minimize traffic-light
           buttons (no fullscreen/green) here. */
        .wm-titlebar {
          display: flex;
          align-items: center;
          flex-shrink: 0;
          height: 32px;
          padding: 0 14px;
          gap: 12px;
          box-sizing: border-box;
          -webkit-app-region: drag;
          user-select: none;
          background: var(--bg-secondary, #161616);
          border-bottom: 1px solid var(--divider, #333);
        }
        .wm-winbtns {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-shrink: 0;
          -webkit-app-region: no-drag;
        }
        .wm-winbtn {
          width: 12px;
          height: 12px;
          border-radius: 50%;
          border: none;
          padding: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          color: transparent;
          font-size: 9px;
          line-height: 1;
          cursor: pointer;
        }
        .wm-winbtn span {
          opacity: 0;
        }
        .wm-winbtn:hover {
          color: #222;
        }
        .wm-winbtn:hover span {
          opacity: 1;
        }
        .wm-winbtn--close {
          background: #ff5f57;
        }
        .wm-winbtn--min {
          background: #febc2e;
        }
        /* Tab bar: persistent navigation row below the window title bar, styled
           like the workspace window's <tab-bar>. Hosts the "Workspaces" tab
           (active), a per-tab close button, and a trailing "+" new-tab button. */
        .wm-tabbar {
          display: flex;
          align-items: center;
          flex-shrink: 0;
          height: 35px;
          padding: 0;
          background: var(--bg-secondary, #161616);
          border-bottom: 1px solid var(--divider, #2d2d2d);
          overflow-x: auto;
          scrollbar-width: none;
          user-select: none;
        }
        .wm-tabbar::-webkit-scrollbar {
          display: none;
        }
        .wm-tab {
          display: inline-flex;
          align-items: center;
          flex-shrink: 0;
          min-width: var(--tab-min-width, 120px);
          height: 34px;
          padding: 0 0 0 10px;
          border-right: 1px solid var(--divider, #333);
          font-size: 13px;
          line-height: 34px;
          cursor: pointer;
          white-space: nowrap;
          user-select: none;
          color: var(--text-secondary, #999);
        }
        .wm-tab--active {
          background: var(--border-divider, #2d2d2d);
          color: var(--text-primary, #ccc);
        }
        .wm-tab:hover {
          color: var(--text-primary, #ccc);
        }
        .wm-tab-title {
          flex: 1;
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .wm-tab-close {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          margin-left: 10px;
          width: 34px;
          height: 34px;
          font-size: 13px;
          font-style: normal;
          line-height: 1;
          color: #666;
          cursor: pointer;
          border-radius: 0;
          transition:
            background 0.15s,
            color 0.15s;
        }
        .wm-tab-close:hover {
          background: var(--border-divider, #2d2d2d);
          color: #fff;
        }
        .wm-tab--active .wm-tab-close:hover {
          background: var(--bg-hover-strong, #444);
          color: #fff;
        }
        /* Trailing "+" new-tab button, full-height square pinned to the right
           side of the bar (margin-left:auto pushes it to the end). */
        .wm-tabbar-add {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          width: 34px;
          height: 34px;
          margin: 0 0 0 auto;
          font-size: 16px;
          line-height: 1;
          color: var(--text-secondary, #999);
          cursor: pointer;
          border-radius: 0;
          user-select: none;
          transition:
            background 0.15s,
            color 0.15s;
        }
        .wm-tabbar-add:hover {
          background: var(--border-divider, #2d2d2d);
          color: #eee;
        }
        .wm-tabbar-add-glyph {
          display: block;
          line-height: 1;
          /* The + glyph renders low in its 34px button; lift just the glyph,
             leaving the hover fill square in place. */
          transform: translateY(-2px);
        }
        /* Search toggle: full-height square icon button on the far left of
           the persistent bottom bar; toggles the search bar that slides up
           above the footer. */
        .dw-search {
          flex: none;
          border: none;
          background: transparent;
          color: var(--text-secondary, #999);
          border-radius: 0;
          height: 100%;
          aspect-ratio: 1 / 1;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          padding: 0;
          /* Right-side separator between the search utility and the
             right-aligned add/delete action group. */
          border-right: 1px solid var(--divider, #333);
          /* Flush against the window's rounded bottom-left corner:
             content-box keeps the icon centred in the square content
             (like .wt-refresh-btn) while the 8px left padding grows the
             tile outward over the bar's removed left padding, insetting
             the icon from the corner while the hover fill touches the
             window edge. */
          box-sizing: content-box;
          padding-left: 8px;
          user-select: none;
        }
        .dw-search:hover,
        .dw-search[aria-pressed="true"] {
          background: var(--bg-active, #37373d);
          color: var(--text-primary, #ddd);
        }
        .wm-footer-spacer {
          flex: 1;
        }
        /* Search bar: appears as a row just above the persistent bottom bar
           (like the file-editor tabs). Toggled by the footer search button. */
        .wm-search-bar {
          position: absolute;
          left: 0;
          right: 0;
          bottom: 34px;
          z-index: 1;
          display: flex;
          align-items: stretch;
          height: 34px;
          padding: 0;
          box-sizing: border-box;
          background: var(--bg-secondary, #161616);
          border-top: 1px solid var(--divider, #333);
        }
        .wm-search {
          display: flex;
          align-items: stretch;
          flex: 1;
          min-width: 0;
          height: 100%;
        }
        .wm-search-input {
          flex: 1;
          min-width: 0;
          height: 100%;
          background: transparent;
          color: var(--text-primary, #ddd);
          border: none;
          padding: 0 10px 0 14px;
          font-size: 13px;
          outline: none;
          caret-color: var(--text-primary, #ddd);
        }
        .wm-search-input::placeholder {
          color: var(--text-secondary, #777);
          font-weight: 400;
        }
        /* Full-height square action buttons (regex, case, clear) separated by
           border-left — mirrors the bottom bar's .p41ge-icon-btn look. */
        .wm-search-toggle,
        .wm-search-clear {
          flex: none;
          display: flex;
          align-items: center;
          justify-content: center;
          height: 100%;
          aspect-ratio: 1 / 1;
          padding: 0;
          border: none;
          border-left: 1px solid var(--divider, #333);
          border-radius: 0;
          background: transparent;
          color: var(--text-secondary, #999);
          cursor: pointer;
          transition:
            color 0.1s ease,
            background 0.1s ease;
        }
        .wm-search-toggle:hover,
        .wm-search-clear:hover {
          color: var(--text-primary, #ddd);
          background: var(--bg-hover, #2a2d2e);
        }
        .wm-search-toggle--on {
          color: var(--text-primary, #ddd);
        }
        .wm-search-toggle--on:hover {
          color: var(--text-primary, #ddd);
        }
        .wm-drawer-layer {
          position: relative;
          flex: 1;
          min-height: 0;
          overflow: hidden;
        }
        .wm-body {
          position: absolute;
          top: 35px;
          left: 0;
          right: 0;
          bottom: 0;
          overflow-y: auto;
          /* Match the content view surface to the bottom bar / tab bar. */
          background: var(--bg-secondary, #161616);
          /* No horizontal padding so rows + separators span the full window width;
             the rows keep their own content inset. The list starts below the
             tab bar, and the bottom padding clears the overlaying bottom bar
             (34px) so scrolling content ends flush above it. */
          padding: 0 0 34px;
          box-sizing: border-box;
        }
        .wm-body--searching {
          /* Footer (34px) + search bar (34px) + scroll gap. */
          padding-bottom: 88px;
        }
        /* Invisible mask over the workspace list while a drawer is open, so a
           click on a card closes the drawer instead of opening another
           workspace. Sits over .wm-body but under the drawers (which are later
           siblings with a higher z-index), so drawer interactions still work. */
        .wm-list-mask {
          position: absolute;
          top: 35px;
          left: 0;
          right: 0;
          bottom: 0;
          z-index: 1;
          background: transparent;
          cursor: default;
        }
        ul {
          list-style: none;
          margin: 0;
          padding: 0;
        }
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
        li.ws-row:hover {
          background: var(--bg-hover, #2a2d2e);
        }
        /* The last row's trailing separator only renders when the list fits the
           viewport (not below the fold), so a folded last row never shows a
           second bottom border when it scrolls into view. */
        li.ws-row--last:not(.ws-row--last-visible) {
          border-bottom: none;
        }
        .ws-info {
          flex: 1;
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 3px;
        }
        .ws-name {
          min-width: 0;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          font-size: 14px;
          font-weight: 600;
        }
        .ws-meta {
          color: var(--text-secondary, #999);
          font-size: 12px;
        }
        /* Bottom-left action pills (Open + window count) in each row. */
        .ws-pills {
          display: flex;
          align-items: center;
          gap: 6px;
          margin-top: auto;
        }
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
        .ws-pill--open:hover {
          background: rgba(86, 156, 214, 0.25);
        }
        .ws-chevron {
          flex-shrink: 0;
          display: block;
          align-self: center;
          color: var(--accent, #569cd6);
        }

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
        .ws-thumb:active {
          cursor: grabbing;
        }
        .ws-row--open .ws-thumb {
          cursor: default;
        }
        .ws-thumb--skeleton {
          opacity: 0.75;
          animation: ws-skeleton-pulse 1.3s ease-in-out infinite;
        }
        .ws-thumb-chrome {
          height: 12px;
          flex-shrink: 0;
          background: var(--bg-secondary, #161616);
          border-bottom: 1px solid var(--divider, #333);
          display: flex;
          align-items: center;
          gap: 3px;
          padding: 0 5px;
        }
        .ws-thumb-dot {
          width: 4px;
          height: 4px;
          border-radius: 50%;
          background: var(--text-secondary, #999);
          opacity: 0.55;
        }
        .ws-carousel {
          flex: 1;
          min-height: 0;
          overflow: hidden;
          display: flex;
        }
        .ws-carousel-track {
          display: flex;
          height: 100%;
          width: 100%;
          will-change: transform;
          transition: transform 0.25s ease;
        }
        /* While a swipe follows the pointer, disable the slide transition. */
        .ws-carousel-track--live {
          transition: none;
        }
        .ws-win {
          flex: 0 0 100%;
          display: flex;
          flex-direction: column;
          min-width: 0;
          min-height: 0;
        }
        .ws-win-body {
          flex: 1;
          min-height: 0;
          display: flex;
          gap: 3px;
          padding: 4px;
          min-width: 0;
        }
        .ws-win-side {
          width: 18px;
          flex-shrink: 0;
          background: var(--bg-secondary, #161616);
          border-radius: 3px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 2px;
          padding: 4px 0;
        }
        .ws-thumb-side-row {
          width: 12px;
          height: 4px;
          border-radius: 2px;
          background: var(--bg-active, #37373d);
        }
        .ws-win-grid {
          flex: 1;
          display: flex;
          gap: 3px;
          min-width: 0;
        }
        .ws-thumb-cell {
          flex: 1 1 0;
          min-width: 0;
          background: var(--bg-active, #37373d);
          border-radius: 3px;
        }
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
        .ws-dot {
          width: 4px;
          height: 4px;
          border-radius: 50%;
          background: var(--text-secondary, #999);
          opacity: 0.4;
        }
        .ws-dot--active {
          opacity: 1;
          background: var(--accent, #569cd6);
        }
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
          transition:
            opacity 0.12s ease,
            background 0.12s ease;
          z-index: 2;
        }
        .ws-carousel-arrow:hover {
          background: rgba(0, 0, 0, 0.55);
        }
        .ws-carousel-arrow svg {
          display: block;
        }
        .ws-carousel-arrow:disabled {
          opacity: 0;
          pointer-events: none;
        }
        .ws-carousel-arrow--prev {
          left: 4px;
        }
        .ws-carousel-arrow--next {
          right: 4px;
        }
        .ws-thumb:hover .ws-carousel-arrow {
          opacity: 1;
          pointer-events: auto;
        }
        /* Workspace-list delete mode + inline "new workspace" row. */
        .ws-row--select {
          cursor: pointer;
        }
        /* The inline "new workspace" row uses the standard solid separator; the
           dashed outline distinguishes it from a normal workspace row. */
        .ws-row--new {
          cursor: default;
        }
        .ws-row--new:hover {
          background: var(--bg-hover, #2a2d2e);
        }
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
        .wm-new-ws-input::placeholder {
          color: var(--text-secondary, #777);
          font-weight: 400;
        }
        /* Skeleton placeholders for the inline "new workspace" card. */
        @keyframes ws-skeleton-pulse {
          0%,
          100% {
            opacity: 0.45;
          }
          50% {
            opacity: 1;
          }
        }
        .ws-skeleton {
          display: inline-block;
          border-radius: 4px;
          background: var(--bg-active, #37373d);
          animation: ws-skeleton-pulse 1.3s ease-in-out infinite;
        }
        .ws-skeleton--num {
          width: 118px;
          height: 12px;
          vertical-align: middle;
          margin-top: 4px;
        }
        .ws-skeleton--pill {
          width: 64px;
          height: 16px;
          border-radius: 999px;
        }
        .ws-skeleton--chevron {
          align-self: center;
          width: 16px;
          height: 16px;
          border-radius: 4px;
          background: rgba(86, 156, 214, 0.35);
        }
        .empty {
          color: var(--text-secondary, #777);
          font-size: 13px;
          padding: 0 16px;
          text-align: center;
        }
        /* The workspace-list empty state is centred both horizontally and
           vertically within the list body. Scoped to .wm-body so drawer
           empty states (e.g. "No repositories…") keep their top-left layout. */
        .wm-body > .empty {
          display: flex;
          align-items: center;
          justify-content: center;
          height: 100%;
        }
        /* Application-level tab panes (Welcome / Releases / Settings placeholders). */
        .wm-tab-pane,
        .wm-settings-pane {
          padding: 16px 14px;
        }
        /* Welcome slideshow pane: a flex column so the page content scrolls
           (in .wm-body) while the nav bar stays pinned to the bottom. */
        .wm-welcome {
          display: flex;
          flex-direction: column;
          min-height: 100%;
          box-sizing: border-box;
          padding: 16px 14px 0;
        }
        .wm-welcome .wm-markdown {
          flex: 1;
        }
        .wm-welcome .wm-markdown > :last-child {
          margin-bottom: 0;
        }
        .wm-tab-placeholder,
        .wm-settings-placeholder {
          margin: 0;
          font-size: 13px;
          color: var(--text-secondary, #999);
        }
        /* Welcome intro: typographic layout for the rendered markdown. */
        .wm-markdown {
          font-size: 14px;
          line-height: 1.75;
          color: var(--text-secondary, #a6a6a6);
          max-width: 68ch;
        }
        .wm-markdown h1 {
          font-size: 22px;
          margin: 0 0 18px;
          font-weight: 700;
          letter-spacing: -0.02em;
          color: var(--text-primary, #f5f5f5);
        }
        .wm-markdown h2 {
          font-size: 15px;
          margin: 28px 0 12px;
          padding-bottom: 6px;
          font-weight: 700;
          letter-spacing: 0.02em;
          color: var(--text-primary, #f0f0f0);
          border-bottom: 1px solid var(--divider, #333);
        }
        .wm-markdown p {
          margin: 0 0 14px;
        }
        .wm-markdown ul,
        .wm-markdown ol {
          margin: 0 0 14px;
          padding-left: 22px;
        }
        .wm-markdown li {
          margin: 5px 0;
        }
        .wm-markdown strong {
          color: var(--text-primary, #ffffff);
          font-weight: 700;
        }
        .wm-markdown code {
          background: var(--bg-active, #37373d);
          padding: 1px 4px;
          border-radius: 3px;
          font-size: 12px;
        }
        .wm-markdown a {
          color: var(--accent, #79c0ff);
        }
        .wm-markdown .wm-md-button {
          display: inline-flex;
          align-items: center;
          margin: 4px 0 14px;
          padding: 6px 14px;
          font: inherit;
          font-size: 13px;
          font-weight: 600;
          color: var(--text-primary, #eee);
          background: var(--bg-active, #37373d);
          border: 1px solid var(--divider, #444);
          border-radius: 5px;
          cursor: pointer;
        }
        .wm-markdown .wm-md-button:hover {
          background: var(--bg-hover, #45454d);
          color: var(--text-primary, #fff);
        }
        /* Info notes (markdown blockquote): indented box with an accent left rule. */
        .wm-markdown .wm-md-quote {
          margin: 0 0 14px;
          padding: 8px 12px;
          font-size: 13px;
          color: var(--text-secondary, #b0b0b0);
          background: var(--bg-active, #23232a);
          border-left: 3px solid var(--accent, #79c0ff);
          border-radius: 0 4px 4px 0;
        }
        .wm-markdown .wm-md-quote p {
          margin: 0;
        }
        /* Welcome slideshow: a compact controls bar pinned to the bottom of the
           pane. One line holds the prev/next chevrons on either side of the
           page dots; the page counter sits below it. */
        .wm-slideshow-nav {
          position: sticky;
          bottom: 0;
          flex-shrink: 0;
          display: flex;
          align-items: stretch;
          justify-content: space-between;
          height: 34px;
          /* Break out of the pane's 14px side padding so the bar spans the full window width. */
          margin: 0 -14px;
          background: var(--bg-secondary, #161616);
          border-top: 1px solid var(--divider, #333);
        }
        .wm-slideshow-btn {
          box-sizing: border-box;
          display: flex;
          align-items: center;
          justify-content: center;
          height: 100%;
          width: 33px;
          font-size: 17px;
          line-height: 1;
          color: var(--text-secondary, #999);
          background: none;
          border: none;
          cursor: pointer;
        }
        .wm-slideshow-btn:first-child { border-right: 1px solid var(--divider, #333); }
        .wm-slideshow-btn:last-child { border-left: 1px solid var(--divider, #333); }
        .wm-slideshow-btn:hover:not(:disabled) {
          color: var(--text-primary, #eee);
          background: var(--bg-active, #26262d);
        }
        .wm-slideshow-btn:disabled { opacity: 0.35; cursor: default; }
        .wm-slideshow-dots {
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .wm-slideshow-dot {
          width: 10px;
          height: 10px;
          border-radius: 999px;
          padding: 0;
          background: var(--bg-active, #3a3a42);
          border: 1px solid var(--divider, #444);
          cursor: pointer;
          transition: width 0.25s ease;
        }
        .wm-slideshow-dot--active {
          width: 30px;
          background: var(--accent, #79c0ff);
          border-color: var(--accent, #79c0ff);
        }
        .wm-welcome-dismiss {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          width: 100%;
          margin-top: 18px;
          margin-bottom: 12px;
          padding: 12px 16px;
          font-size: 13px;
          font-family: inherit;
          text-align: left;
          color: var(--text-secondary, #b0b0b0);
          background: var(--bg-active, #23232a);
          border: 1px solid var(--divider, #333);
          /* Rounded to echo the circular icon's curve, carried further out. */
          border-radius: 16px;
          cursor: pointer;
          user-select: none;
        }
        .wm-welcome-dismiss:hover {
          color: var(--text-primary, #eee);
          background: var(--bg-hover, #2a2a31);
        }
        .wm-welcome-dismiss-label { flex: 1; }
        .wm-welcome-dismiss-icon {
          display: flex;
          align-items: center;
          flex-shrink: 0;
        }
        .wm-welcome-dismiss-icon svg { display: block; }
        /* Workspace-window explainer: the animated demo spans 80% of the
           available width, and the explanation text (and any shortcut hints)
           stacks underneath it. The demo never changes its own width; the
           sidebars slide within it. */
        .wm-window-stage {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 18px;
          margin: 30px 0 40px;
        }
        .wm-window-stage > :first-child {
          width: 80%;
          flex: none;
        }
        .wm-window-stage > .wm-window-copy {
          width: 100%;
          flex: none;
        }
        .wm-window-stage strong {
          color: var(--text-primary, #fff);
        }
        /* The description column under the demo: text and any shortcut hints
           stack below the skeleton. */
        .wm-window-copy {
          display: flex;
          flex-direction: column;
          min-width: 0;
        }
        /* Keyboard-shortcut hints under the explanation text. */
        .wm-markdown .wm-shortcuts {
          margin: 14px 0 0;
          display: flex;
          flex-direction: column;
          gap: 10px;
          font-size: 12px;
          color: var(--text-secondary, #b0b0b0);
        }
        .wm-markdown .wm-shortcut {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .wm-markdown .wm-shortcuts .kbd {
          font-family: var(--font-mono, ui-monospace, monospace);
          font-size: 11px;
          color: var(--text-primary, #eee);
          background: var(--bg-active, #2b2b31);
          border: 1px solid var(--divider, #3c3c3c);
          border-bottom-width: 2px;
          border-radius: 4px;
          padding: 3px 6px;
          line-height: 1;
          white-space: nowrap;
        }
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
          background: var(--bg-secondary, #161616);
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
          from {
            transform: translateX(24px);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
        @keyframes dw-slide-out {
          from {
            transform: translateX(0);
            opacity: 1;
          }
          to {
            transform: translateX(24px);
            opacity: 0;
          }
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
          height: 35px;
          padding: 0 0 0 14px;
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
        .crumbs-sep {
          color: var(--text-secondary, #999);
          margin: 0 2px;
          flex-shrink: 0;
        }
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
        .crumbs-item:hover {
          background: var(--bg-active, #37373d);
        }
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
        .crumbs-more {
          position: relative;
          display: inline-flex;
          flex-shrink: 0;
        }
        .crumbs-ellipsis {
          border: none;
          background: transparent;
          color: var(--accent, #569cd6);
          font-size: 13px;
          padding: 2px 6px;
          border-radius: 4px;
          cursor: pointer;
        }
        .crumbs-ellipsis:hover {
          background: var(--bg-active, #37373d);
        }
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
          background: var(--bg-secondary, #161616);
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
        .crumbs-menu-item:hover {
          background: var(--bg-active, #37373d);
        }
        .drawer-actions {
          display: flex;
          align-items: center;
          gap: 6px;
          flex-shrink: 0;
          /* Stretch so the close button can be a full-height square tile. */
          align-self: stretch;
        }
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
        .dw-open:hover {
          background: rgba(86, 156, 214, 0.25);
        }
        .dw-close {
          border: none;
          border-left: 1px solid var(--divider, #333);
          border-radius: 0;
          background: transparent;
          color: var(--text-secondary, #999);
          font-size: 16px;
          /* Full-height square tile, flush against the drawer's right edge. */
          height: 100%;
          aspect-ratio: 1 / 1;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
        }
        .dw-close:hover {
          background: var(--bg-active, #37373d);
          color: var(--text-primary, #ddd);
        }
        .drawer-body {
          flex: 1;
          min-height: 0;
          overflow-y: auto;
          padding: 14px;
        }
        .drawer-footer {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          flex-shrink: 0;
          height: 34px;
          padding: 0px 0px 0px 14px;
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
          justify-content: flex-end;
          flex-shrink: 0;
          height: 34px;
          padding: 0;
          border-top: 1px solid var(--divider, #333);
          background: var(--bg-secondary, #161616);
        }
        .dw-add {
          border: none;
          background: transparent;
          color: var(--text-secondary, #999);
          font-size: 20px;
          border-radius: 0;
          /* Full-height, square action button like the workspace window's
             .p41ge-icon-btn: fills the bottom bar, square, with a cap
             separator on the group's outer (left) edge. */
          height: 100%;
          aspect-ratio: 1 / 1;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          user-select: none;
          border-left: 1px solid var(--divider, #333);
        }
        .dw-add:hover {
          background: var(--bg-active, #37373d);
          color: var(--text-primary, #ddd);
        }
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
          border-radius: 0;
          /* Full-height, square action button with a separator line
             between it and the adjacent add button. */
          height: 100%;
          aspect-ratio: 1 / 1;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          padding: 0;
          border-left: 1px solid var(--divider, #333);
        }
        .dw-delete:hover {
          background: var(--bg-active, #37373d);
          color: var(--text-primary, #ddd);
        }
        .dw-delete svg {
          fill: currentColor;
        }
        /* The rightmost bottom-bar button sits flush against the macOS
           window edge. content-box keeps the icon centred in the square
           content area (like .wt-refresh-btn) while the 8px padding grows
           the tile outward, insetting the icon from the rounded corner. */
        .ws-list-footer > :last-child,
        .drawer-footer > :last-child {
          box-sizing: content-box;
          padding-right: 8px;
        }
        .dw-delete-confirm {
          background: transparent;
          color: var(--text-secondary, #999);
        }
        .dw-delete-confirm:hover {
          background: var(--bg-active, #37373d);
          color: var(--text-primary, #ddd);
        }
        .dw-delete-confirm:disabled {
          opacity: 0.4;
          cursor: default;
        }
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
        .dw-delete-cancel:hover {
          background: var(--bg-active, #37373d);
          color: var(--text-primary, #ddd);
        }
        .dw-list {
          list-style: none;
          margin: 0;
          padding: 0;
        }
        .dw-item {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 10px;
          margin-bottom: 4px;
          border-radius: 4px;
          cursor: pointer;
        }
        .dw-item:hover {
          background: var(--bg-active, #37373d);
        }
        .dw-item--new {
          cursor: default;
          border: 1px dashed var(--divider, #444);
        }
        .dw-item--new:hover {
          background: transparent;
        }
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
        .dw-new-input::placeholder {
          color: var(--text-secondary, #777);
        }
        .dw-item--selectable {
          cursor: pointer;
        }
        .dw-item--selected {
          background: var(--bg-active, #37373d);
        }
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
        .dw-checkbox--checked::after {
          content: "✓";
          font-size: 11px;
          line-height: 1;
        }
        .dw-item-name {
          flex: 1;
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .dw-item-meta {
          color: var(--text-secondary, #999);
          font-size: 12px;
        }
        .dw-meta-block {
          color: var(--text-secondary, #999);
          font-size: 12px;
          line-height: 1.6;
        }
      </style>
      <div class="wm-root">
        <div class="wm-titlebar">
          <div class="wm-winbtns">
            <button
              class="wm-winbtn wm-winbtn--close"
              aria-label="Close window"
              @click=${() => window.openp41ge?.window.close()}
            >
              <span>✕</span>
            </button>
            <button
              class="wm-winbtn wm-winbtn--min"
              aria-label="Minimize window"
              @click=${() => window.openp41ge?.window.minimize()}
            >
              <span>─</span>
            </button>
          </div>
        </div>
        <div class="wm-drawer-layer">
        <div class="wm-tabbar">
          ${this._openTabs.map(
            (id) => html`
              <div
                class="wm-tab ${this._activeTab === id ? "wm-tab--active" : ""}"
                data-manager-tab=${id}
                @click=${() => this._activateTab(id)}
              >
                <span class="wm-tab-title">${MANAGER_TAB_LABELS[id]}</span>
                <span
                  class="wm-tab-close"
                  aria-label="Close tab"
                  data-tip="Close tab"
                  @click=${(e: Event) => {
                    e.stopPropagation();
                    this._closeTab(id);
                  }}
                >✕</span>
              </div>
            `,
          )}
          <div class="wm-tabbar-add" aria-label="New tab" data-tip="New tab" @click=${this._onTabAddClick}><span class="wm-tabbar-add-glyph">+</span></div>
        </div>
          <div class="wm-body${this._searchOpen ? " wm-body--searching" : ''}" @click=${this._onBackgroundClick}>
            ${
              this._activeTab === "welcome"
                ? html`
                    <div class="wm-tab-pane wm-welcome">
                      <div class="wm-markdown">${unsafeHTML(welcomePages[this._welcomePage] ?? "")}</div>
                      ${
                        this._welcomePage === 0
                          ? html`
                              <button
                                class="wm-welcome-dismiss"
                                role="checkbox"
                                aria-checked=${this._welcomeDismissed}
                                @click=${this._onWelcomeDismissToggle}
                              >
                                <span class="wm-welcome-dismiss-label">Never show the welcome message again</span>
                                <span class="wm-welcome-dismiss-icon">
                                  ${unsafeHTML(this._welcomeDismissed ? WELCOME_CHECKED_ICON : WELCOME_UNCHECKED_ICON)}
                                </span>
                              </button>
                            `
                          : nothing
                      }
                      <div class="wm-slideshow-nav">
                        <button class="wm-slideshow-btn" aria-label="Previous page" ?disabled=${this._welcomePage === 0} @click=${() => this._welcomeNav(-1)}>&#8249;</button>
                        <div class="wm-slideshow-dots">
                          ${welcomePages.map(
                            (_, i) => html`
                              <button
                                class="wm-slideshow-dot${i === this._welcomePage ? " wm-slideshow-dot--active" : ""}"
                                aria-label="Page ${i + 1}"
                                @click=${() => (this._welcomePage = i)}
                              ></button>
                            `,
                          )}
                        </div>
                        <button class="wm-slideshow-btn" aria-label="Next page" ?disabled=${this._welcomePage === welcomePages.length - 1} @click=${() => this._welcomeNav(1)}>&#8250;</button>
                      </div>
                    </div>
                  `
                : this._activeTab === "releases"
                ? html`<div class="wm-tab-pane"><p class="wm-tab-placeholder">Releases</p></div>`
                : this._activeTab === "settings"
                ? html`<div class="wm-settings-pane"><p class="wm-settings-placeholder">Settings</p></div>`
                : this._loaded && this._workspaces.length === 0 && !this._addingWorkspace
                ? html`<p class="empty">No workspaces yet.</p>`
                : this._searchOpen && this._workspaces.length > 0 && filtered.length === 0
                  ? html`<p class="empty">No workspaces match “${this._searchQuery}”.</p>`
                  : html`
                      <ul>
                        ${
                          this._addingWorkspace
                            ? html`
                                <li class="ws-row ws-row--new">
                                  <div class="ws-thumb ws-thumb--skeleton">
                                    <div class="ws-carousel">
                                      <div class="ws-carousel-track">
                                        <div class="ws-win">
                                          <div class="ws-thumb-chrome">
                                            <span class="ws-thumb-dot"></span
                                            ><span class="ws-thumb-dot"></span
                                            ><span class="ws-thumb-dot"></span>
                                          </div>
                                          <div class="ws-win-body">
                                            <div class="ws-win-grid">
                                              <div class="ws-thumb-cell"></div>
                                              <div class="ws-thumb-cell"></div>
                                            </div>
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                  <div class="ws-info">
                                    <input
                                      class="wm-new-ws-input"
                                      placeholder="Workspace name"
                                      spellcheck="false"
                                      @keydown=${(e: KeyboardEvent) => this._onNewWorkspaceKeydown(e)}
                                      @blur=${() => {
                                        if (this._addingWorkspace)
                                          void this._createWorkspaceFromInput();
                                      }}
                                    />
                                    <div class="ws-meta">
                                      <span class="ws-skeleton ws-skeleton--num"></span>
                                    </div>
                                    <div class="ws-pills">
                                      <span class="ws-skeleton ws-skeleton--pill"></span>
                                    </div>
                                  </div>
                                  <span class="ws-skeleton ws-skeleton--chevron"></span>
                                </li>
                              `
                            : nothing
                        }
                        ${filtered.map((w, i) => {
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
                          const idx = Math.min(
                            this._carouselIndex.get(w.filePath) ?? 0,
                            wins.length - 1,
                          );
                          const isLast = i === filtered.length - 1;
                          const sideRows = html`<span class="ws-thumb-side-row"></span
                            ><span class="ws-thumb-side-row"></span
                            ><span class="ws-thumb-side-row"></span>`;
                          return html`
                            <li
                              class="ws-row ${this._workspaceDeleteMode ? "ws-row--select" : ""} ${isOpen && !this._workspaceDeleteMode ? "ws-row--open" : ""} ${isLast ? "ws-row--last" : ""} ${isLast && !this._listOverflows ? "ws-row--last-visible" : ""}"
                              @click=${(e: Event) => {
                                e.stopPropagation();
                                if (this._suppressClick) {
                                  this._suppressClick = false;
                                  return;
                                }
                                if (this._workspaceDeleteMode)
                                  this._toggleWorkspaceSelection(w.filePath);
                                else this._openWorkspace(w);
                              }}
                            >
                              <div class="ws-thumb-wrap">
                                <div
                                  class="ws-thumb"
                                  @pointerenter=${(e: PointerEvent) => this._onThumbPointerEnter(e, w.filePath, isOpen)}
                                  @pointerdown=${(e: PointerEvent) => this._onThumbPointerDown(e, w.filePath, isOpen)}
                                  @pointermove=${this._onThumbPointerMove}
                                  @pointerup=${this._onThumbPointerUp}
                                  @pointercancel=${this._onThumbPointerCancel}
                                >
                                  <div class="ws-carousel">
                                    <div
                                      class="ws-carousel-track ${this._carouselLive ? "ws-carousel-track--live" : ""}"
                                      style="transform: translateX(${-idx * 100}%)"
                                    >
                                      ${wins.map(
                                        (win) => html`
                                          <div class="ws-win">
                                            <div class="ws-thumb-chrome">
                                              <span class="ws-thumb-dot"></span
                                              ><span class="ws-thumb-dot"></span
                                              ><span class="ws-thumb-dot"></span>
                                            </div>
                                            <div class="ws-win-body">
                                              ${leftOpen ? html`<div class="ws-win-side">${sideRows}</div>` : nothing}
                                              <div class="ws-win-grid">
                                                ${Array.from({ length: this._skeletonCells(win) }, () => html`<div class="ws-thumb-cell"></div>`)}
                                              </div>
                                              ${rightOpen ? html`<div class="ws-win-side">${sideRows}</div>` : nothing}
                                            </div>
                                          </div>
                                        `,
                                      )}
                                    </div>
                                  </div>
                                  ${
                                    wins.length > 1
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
                                          >
                                            <svg
                                              width="10"
                                              height="10"
                                              viewBox="0 0 24 24"
                                              fill="none"
                                              stroke="currentColor"
                                              stroke-width="3"
                                              stroke-linecap="round"
                                              stroke-linejoin="round"
                                            >
                                              <path d="M15 18l-6-6 6-6" />
                                            </svg>
                                          </button>
                                          <button
                                            class="ws-carousel-arrow ws-carousel-arrow--next"
                                            ?disabled=${idx === wins.length - 1}
                                            aria-label="Next window"
                                            @pointerdown=${(e: Event) => e.stopPropagation()}
                                            @click=${(e: Event) => {
                                              e.stopPropagation();
                                              this._gotoCarousel(w.filePath, idx + 1);
                                            }}
                                          >
                                            <svg
                                              width="10"
                                              height="10"
                                              viewBox="0 0 24 24"
                                              fill="none"
                                              stroke="currentColor"
                                              stroke-width="3"
                                              stroke-linecap="round"
                                              stroke-linejoin="round"
                                            >
                                              <path d="M9 18l6-6-6-6" />
                                            </svg>
                                          </button>
                                        `
                                      : nothing
                                  }
                                </div>
                                ${
                                  wins.length > 1
                                    ? html`<div class="ws-carousel-dots">
                                        ${wins.map((_win, wi) => html`<span class="ws-dot ${wi === idx ? "ws-dot--active" : ""}"></span>`)}
                                      </div>`
                                    : nothing
                                }
                              </div>
                              <div class="ws-info">
                                <div class="ws-name">${name}</div>
                                <div class="ws-meta">
                                  ${this._countLabel(repos, "repo")} ·
                                  ${this._countLabel(worktrees, "worktree")}
                                </div>
                                ${
                                  this._workspaceDeleteMode
                                    ? nothing
                                    : html`
                                        <div class="ws-pills">
                                          ${
                                            isOpen
                                              ? html`<span
                                                  class="ws-pill ws-pill--open"
                                                  role="button"
                                                  tabindex="0"
                                                  @click=${(e: Event) => this._onRowPillOpen(e, w.filePath)}
                                                  >Open</span
                                                >`
                                              : nothing
                                          }
                                          <span class="ws-pill"
                                            >${this._countLabel(w.data.windows?.length ?? 0, "window")}</span
                                          >
                                        </div>
                                      `
                                }
                              </div>
                              ${
                                this._workspaceDeleteMode
                                  ? html`<span
                                      class="dw-checkbox ${this._selectedWorkspaces.has(w.filePath) ? "dw-checkbox--checked" : ""}"
                                    ></span>`
                                  : html`<svg
                                      class="ws-chevron"
                                      width="16"
                                      height="16"
                                      viewBox="0 0 24 24"
                                      fill="none"
                                      stroke="currentColor"
                                      stroke-width="2"
                                      stroke-linecap="round"
                                      stroke-linejoin="round"
                                    >
                                      <path d="M9 6l6 6-6 6" />
                                    </svg>`
                              }
                            </li>
                          `;
                        })}
                      </ul>
                    `
            }
          </div>
          ${
            this._drawers.length > 0
              ? html`<div
                  class="wm-list-mask"
                  @click=${(e: Event) => {
                    e.stopPropagation();
                    this._closeAll();
                  }}
                ></div>`
              : nothing
          }
          ${
            this._drawers.length > 0
              ? html`<div class="drawer-shadow" style="width:${this._stackWidth()}%"></div>`
              : nothing
          }
          ${this._drawers.map(
            (d, i) => html`
              <div class="drawer" style="width:${this._widthFor(i)}%; z-index:${i + 1}">
                ${
                  i < this._drawers.length - 1
                    ? html`<div
                        class="drawer-mask"
                        @click=${(e: Event) => {
                          e.stopPropagation();
                          this._closeDeeper(i);
                        }}
                      ></div>`
                    : nothing
                }
                <div class="drawer-head">
                  ${
                    i === this._drawers.length - 1
                      ? this._drawerBreadcrumbs(i)
                      : html`<span class="drawer-title">${d.title}</span>`
                  }
                  <div class="drawer-actions">
                    ${
                      d.kind === "workspace" && !openPaths.has(d.workspacePath)
                        ? html`<button
                            class="dw-open"
                            @click=${(e: Event) => {
                              e.stopPropagation();
                              this._openWorkspaceWindow(d.workspacePath);
                            }}
                          >
                            Open
                          </button>`
                        : nothing
                    }
                    <button
                      class="dw-close"
                      @click=${(e: Event) => {
                        e.stopPropagation();
                        this._closeDrawer(d.id);
                      }}
                      aria-label="Close"
                      data-tip="Close"
                    >
                      ✕
                    </button>
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
        ${this._searchOpen
          ? html`
              <div class="wm-search-bar">
                <div class="wm-search">
                  <input
                    class="wm-search-input"
                    placeholder="Search workspaces…"
                    spellcheck="false"
                    .value=${this._searchQuery}
                    @input=${this._onSearchInput}
                    @keydown=${this._onSearchKeydown}
                  />
                  <button
                    class="wm-search-toggle ${this._useRegex ? "wm-search-toggle--on" : ""}"
                    aria-label="Regex search"
                    aria-pressed=${this._useRegex}
                    data-tip="Regex search"
                    @click=${() => {
                      this._useRegex = !this._useRegex;
                    }}
                  >
                    ${unsafeHTML(REGEX_ICON)}
                  </button>
                  <button
                    class="wm-search-toggle ${this._caseSensitive ? "wm-search-toggle--on" : ""}"
                    aria-label="Match case"
                    aria-pressed=${this._caseSensitive}
                    data-tip=${this._caseSensitive ? "Match case (on)" : "Match case (off)"}
                    @click=${() => {
                      this._caseSensitive = !this._caseSensitive;
                    }}
                  >
                    ${unsafeHTML(CASE_ON_ICON)}
                  </button>
                  <button
                    class="wm-search-clear"
                    aria-label="Clear search"
                    data-tip="Close search"
                    @click=${this._exitSearch}
                  >
                    ✕
                  </button>
                </div>
              </div>
            `
          : nothing}
        ${this._workspaceListFooter()}
      </div>
    `;
  }

  private _drawerContent(d: DrawerState): TemplateResult {
    if (d.kind === "workspace") {
      const repos = d.data.repos ?? [];
      return html`
        <ul class="dw-list">
          ${
            this._addingRepo
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
              : nothing
          }
          ${
            repos.length === 0 && !this._addingRepo
              ? html`<p class="empty">No repositories in this workspace.</p>`
              : nothing
          }
          ${repos.map(
            (repo) => html`
              <li
                class="dw-item ${this._deleteMode ? "dw-item--selectable" : ""} ${this._selectedRepos.has(repo.url) ? "dw-item--selected" : ""}"
                @click=${(e: Event) => {
                  e.stopPropagation();
                  if (this._deleteMode) this._toggleRepoSelection(repo.url);
                  else this._openRepo(d, repo);
                }}
              >
                <span class="dw-item-name">${deriveRepoName(repo.url)}</span>
                ${
                  this._deleteMode
                    ? html`<span
                        class="dw-checkbox ${this._selectedRepos.has(repo.url) ? "dw-checkbox--checked" : ""}"
                      ></span>`
                    : html`<span class="dw-item-meta"
                        >${repo.worktrees?.length ?? 0}
                        worktree${(repo.worktrees?.length ?? 0) === 1 ? "" : "s"}</span
                      >`
                }
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
          ${
            this._addingWorktree
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
              : nothing
          }
          ${
            wts.length === 0 && !this._addingWorktree
              ? html`<p class="empty">No worktrees yet.</p>`
              : nothing
          }
          ${wts.map(
            (wt) => html`
              <li
                class="dw-item ${this._worktreeDeleteMode ? "dw-item--selectable" : ""} ${this._selectedWorktrees.has(wt) ? "dw-item--selected" : ""}"
                @click=${(e: Event) => {
                  e.stopPropagation();
                  if (this._worktreeDeleteMode) this._toggleWorktreeSelection(wt);
                  else this._openWorktree(d, wt);
                }}
              >
                <span class="dw-item-name">${wt}</span>
                ${
                  this._worktreeDeleteMode
                    ? html`<span
                        class="dw-checkbox ${this._selectedWorktrees.has(wt) ? "dw-checkbox--checked" : ""}"
                      ></span>`
                    : html`<span class="dw-item-meta">worktree</span>`
                }
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
      <p class="dw-meta-block">
        Workspace: ${d.data.name?.trim() || "Unnamed"}<br />Repo: ${repoName}
      </p>
    `;
  }
}

customElements.define("openp41ge-window-manager", Openp41geWindowManager);
