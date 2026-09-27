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
import "openp41ge-uikit";
import { tooltipController, OverlayScrollbar, attachTabEdgeOverdraws } from "openp41ge-uikit";
import type { WorkspaceFileData } from "../../layout/types";
import type { Openp41geContextMenuElement } from "../interfaces/element-guards";
import { workspaceFileService, deriveRepoName } from "../services/workspace-file-service";
import { registerManagerTabBar } from "../services/init-drag-system";
import { MANAGER_TAB_REORDER_EVENT } from "../services/drop-targets/manager-tab-bar-drop-target";
import { welcomePages } from "../content/welcome";

/** Hold a skeleton this long before the drag element appears (long-press pickup). */
const HOLD_MS = 350;
/** Pointer travel past this many px starts an immediate drag (below the long-press hold). */
const DRAG_THRESHOLD = 4;

/** Mini workspace-window skeleton: width/height (at half the old carousel size). */
const THUMB_W = 66;
const THUMB_H = 42;
/** Maximum window skeletons shown side by side in each workspace row. */
const MAX_VISIBLE_THUMBS = 3;

/**
 * Attach an edge overdraw continuation to a button's edge separator.
 *
 * The separator is the button's own 1px border on its left or right edge. The
 * line extends that border past the button's top (`up`, at `bottom:100%`) or
 * bottom (`down`, at `top:100%`) edge so the divider appears to continue
 * outward. `side` selects which edge carries the separator; the line is offset
 * by the 1px border width because an absolutely-positioned child anchors to
 * the padding box (one border-width inside the border-box edge).
 *
 * A `zIndex` lifts the line into the enclosing stacking context (no ancestor is
 * given a stacking context by this helper), so an accent can paint above a
 * sibling overlay that would otherwise cover it.
 *
 * Idempotent — guarded by `data-overdraw` so repeated calls (e.g. after delete
 * mode toggles and the buttons are recreated) never duplicate the line. The
 * host is made `position: relative` so the line resolves against it.
 */
function attachEdgeOverdraw(
  host: HTMLElement,
  side: "left" | "right",
  dir: "up" | "down",
  zIndex?: string,
): void {
  // A host can carry several overdraws (e.g. a search-bar button gets both an
  // `up` and a `down` line), so accumulate the keys into a space-separated set
  // rather than a single value (which the second call would overwrite, causing
  // the first to be re-attached on the next update).
  const keys = (host.dataset.overdraw ?? "").split(/\s+/).filter(Boolean);
  const key = `${dir}-${side}`;
  if (keys.includes(key)) return;
  keys.push(key);
  host.dataset.overdraw = keys.join(" ");
  if (getComputedStyle(host).position !== "relative") {
    host.style.position = "relative";
  }
  const line = document.createElement("overdraw-line");
  line.setAttribute("dir", dir);
  line.setAttribute("aria-hidden", "true");
  line.style.setProperty(dir === "up" ? "bottom" : "top", "100%");
  line.style.setProperty(side, "-1px");
  if (zIndex) line.style.zIndex = zIndex;
  host.appendChild(line);
}

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
  /** Open tabs in the bar; the welcome intro tab is removed for now, so the
   *  window lands on Workspaces. */
  @state() private _openTabs: ManagerTabId[] = ["workspaces"];
  @state() private _activeTab: ManagerTabId = "workspaces";
  @state() private _welcomeDismissed = false;
  /** Slide-transition phase for the welcome page (out-* / in-* / "" = idle). */
  /** Prevents overlapping navigations while a slide is playing. */
  @state() private _closingDrawers: ClosingDrawer[] = [];
  @state() private _loaded = false;
  @state() private _addingRepo = false;
  @state() private _deleteMode = false;
  @state() private _selectedRepos: Set<string> = new Set();
  @state() private _addingWorkspace = false;
  @state() private _workspaceDeleteMode = false;
  /** Paths of workspaces selected in the list's delete mode. */
  @state() private _selectedWorkspaces: Set<string> = new Set();
  @state() private _addingWorktree = false;
  @state() private _worktreeDeleteMode = false;
  @state() private _selectedWorktrees: Set<string> = new Set();
  @state() private _crumbsOpen = false;
  @state() private _listOverflows = false;
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
    mode: "open" | null;
  } | null = null;
  private _holdTimer: number | null = null;
  private _offEndSession: (() => void) | null = null;
  private _offOpenWindowsChanged: (() => void) | null = null;
  private _offActivateTab: (() => void) | null = null;
  /** Subscription for a tab moved onto this window from another manager window. */
  private _offReceiveTab: (() => void) | null = null;
  /** Subscription for a tab removed from this window (moved to another/new window). */
  private _offRemoveTab: (() => void) | null = null;
  /** Unregister the tab bar from the drag system (called on disconnect). */
  private _unregisterManagerBar: (() => void) | null = null;
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
    // Another manager window moved a tab onto this one; insert it at the
    // requested index and activate it.
    this._offReceiveTab = window.openp41ge.windowManager.onReceiveTab?.(({ tabId, index }) => {
      if (!tabId) return;
      this._receiveOpenTab(tabId, typeof index === "number" ? index : this._openTabs.length);
    }) ?? null;
    // This window's tab was moved to another (or a new) manager window.
    this._offRemoveTab = window.openp41ge.windowManager.onRemoveTab?.(({ tabId }) => {
      if (!tabId) return;
      this._removeOpenTab(tabId);
    }) ?? null;
    // Fresh window opened for a specific tab (e.g. drag-out of a management
    // tab, or app menu > Settings): it should open with ONLY that tab, not
    // the default "workspaces" plus the appended launch tab.
    const launchTab = window.openp41ge.workspace.getLaunchTab();
    if (launchTab) {
      this._openTabs = [launchTab];
      this._activeTab = launchTab;
    }
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

  /** After the first render, register the tab bar with the drag system so
   *  management tabs can be reordered / dragged. Also listens for the drop
   *  target's reorder event on the bar. */
  firstUpdated(): void {
    const barEl = this.shadowRoot?.querySelector<HTMLElement>(".wm-tabbar");
    if (!barEl) return;
    this._unregisterManagerBar = registerManagerTabBar(barEl, this._myWindowId());
    barEl.addEventListener(MANAGER_TAB_REORDER_EVENT, this._onManagerTabReorder);
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
    this._offReceiveTab?.();
    this._offReceiveTab = null;
    this._offRemoveTab?.();
    this._offRemoveTab = null;
    this._unregisterManagerBar?.();
    this._unregisterManagerBar = null;
    for (const el of this._tooltipTargets) tooltipController.detach(el);
    this._tooltipTargets = [];
    this._overlayScrollbar?.destroy();
    this._overlayScrollbar = null;
  }

  /** Attach per-corner overdraw accents to each management-window tab,
   * continuing its right separator and the tab bar's bottom border past the
   * corners (the same recipe as the grid/sidebar tab bars). The strokes are
   * portalled (fixed) so the bar's `overflow-x: auto` clip cannot crop them. */
  private _attachManagerTabOverdraws(): void {
    const tabs = this.shadowRoot?.querySelectorAll<HTMLElement>(".wm-tab") ?? [];
    for (const tab of tabs) {
      attachTabEdgeOverdraws(tab, {
        edges: ["right", "bottom"],
        edgeColors: {
          right: "var(--divider, #333)",
          bottom: "var(--divider, #2d2d2d)",
        },
      });
    }
  }

  /** Attach custom tooltips to the footer tool buttons (replaces native `title`). */
  updated(): void {
    this._measureListOverflow();
    this._attachDrawerOverdraws();
    this._attachWorkspaceFooterOverdraws();
    this._attachWorkspaceSearchBarOverdraws();
    this._attachManagerTabOverdraws();
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

  /** Begin a pointer press on a workspace skeleton (drag-out). */
  private _onThumbPointerDown(e: PointerEvent, path: string, isOpen: boolean): void {
    if (e.button !== 0) return;
    // An already-open workspace isn't an interactive drag handle — avoid a second
    // open affordance on top of the already-open window.
    if (isOpen) return;
    this._teardownDrag();
    const ws = this._workspaces.find((w) => w.filePath === path);
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
   * release. Called from the long-press and from the first move past the
   * threshold.
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
      THUMB_W,
      THUMB_H,
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

  /**
   * Once the drag passes the threshold it is always a drag-out (the carousel is
   * gone, so there is no swipe gesture to disambiguate). A drag means the
   * following row click is not a navigation — suppress it so the workspace
   * doesn't open over the drag. Cleared by the next pointerdown (see
   * _onPointerDown) or by the row click itself.
   */
  private _onThumbPointerMove(e: PointerEvent): void {
    const drag = this._drag;
    if (!drag) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (drag.active) {
      if (drag.mode === "open") window.openp41ge.drag.move(e.screenX, e.screenY);
      return;
    }
    // A small movement kickstarts the drag immediately — the long-press hold
    // delay is only for grab-and-hold with no movement, not for a quick drag.
    if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    // A real drag beat the long-press timer — cancel the pending pickup.
    this._clearHoldTimer();
    drag.active = true;
    this._suppressClick = true;
    this._startOpenDrag(e.screenX, e.screenY);
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
    // A release outside this window opens the workspace.
    if (outside) this._openWorkspaceWindow(path);
  }

  private _onThumbPointerCancel(): void {
    this._clearHoldTimer();
    const drag = this._drag;
    if (!drag) return;
    if (drag.mode === "open") window.openp41ge.drag.end();
    this._teardownDrag();
  }

  private _teardownDrag(): void {
    this._clearHoldTimer();
    this._drag = null;
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

  /** Toggle + persist the "never show the welcome intro again" choice. */
  private _onWelcomeDismissToggle = (e: Event): void => {
    const on = (e as CustomEvent<{ checked: boolean }>).detail.checked;
    this._welcomeDismissed = on;
    void window.openp41ge.welcome.setDismissed(on);
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

  /** Extend the drawer bar buttons' vertical separators past their bar's
   *  horizontal border.
   *
   *  Bottom bar (`.drawer-footer`, at the window bottom) — the full-height
   *  `+`/trash buttons bleed their `border-left` separator up past the bar's
   *  top border, matching the workspace-list footer treatment. (A downward
   *  bleed would fall off the window edge, so it is not used.)
   *
   *  Top bar (`.drawer-head`) — the close button's `border-left` separator
   *  bleeds down past the head's bottom border into the body, AND bleeds up
   *  past the drawer's top edge into the window's tab bar (a `fixed` portal
   *  stroke that escapes the layer's `overflow: hidden` clip — see
   *  `_attachDrawerHeadUpBleed`).
   *
   *  Idempotent per element, safe on every re-render. */
  private _attachDrawerOverdraws(): void {
    const root = this.shadowRoot;
    if (!root) return;
    for (const btn of root.querySelectorAll<HTMLElement>(
      ".drawer-footer .dw-add, .drawer-footer .dw-delete, .drawer-footer .dw-open",
    )) {
      attachEdgeOverdraw(btn, "left", "up");
    }
    for (const close of root.querySelectorAll<HTMLElement>(
      ".drawer-actions .dw-close, .drawer-actions .dw-open",
    )) {
      attachEdgeOverdraw(close, "left", "down");
      this._attachDrawerHeadUpBleed(close);
    }
  }

  /**
   * Up-bleed for the drawer head's close button: a `fixed` portal stroke that
   * continues the button's left separator up past the drawer's top edge into
   * the window's tab bar. The drawer layer clips `overflow: hidden`, so the
   * stroke must escape it (position `fixed`). While the drawer's slide
   * animation runs, its transform makes `position: fixed` resolve against the
   * drawer (misplacing the stroke), so the stroke is hidden until it settles.
   * It tracks the button's viewport rect each frame and stops once the button
   * is removed (the drawer closed).
   */
  private _attachDrawerHeadUpBleed(close: HTMLElement): void {
    if (close.dataset.drawerHeadUpBleed === "1") return;
    close.dataset.drawerHeadUpBleed = "1";

    const line = document.createElement("overdraw-line");
    line.setAttribute("dir", "up");
    line.setAttribute("aria-hidden", "true");
    line.style.position = "fixed";
    line.style.left = "0px";
    line.style.top = "0px";
    line.style.zIndex = "1";
    line.style.opacity = "0";
    close.appendChild(line);

    // The drawer that animates the slide, so we can hide the stroke until it
    // settles (an active transform makes `fixed` resolve against the drawer).
    const drawer = close.closest<HTMLElement>(".drawer");

    let raf = 0;
    const loop = (): void => {
      if (!close.isConnected) {
        raf = 0;
        return;
      }
      const settling =
        drawer != null &&
        typeof drawer.getAnimations === "function" &&
        drawer.getAnimations().length > 0;
      const r = close.getBoundingClientRect();
      if (!settling && r.width > 0 && r.height > 0) {
        const preset = parseFloat(line.style.getPropertyValue("--overdraw-length"));
        const length = Number.isFinite(preset) && preset > 0 ? preset : 6;
        line.style.left = `${r.left}px`;
        line.style.top = `${r.top - length}px`;
        line.style.opacity = "";
      } else {
        line.style.opacity = "0";
      }
      raf = requestAnimationFrame(loop);
    };
    if (typeof requestAnimationFrame !== "function") return;
    raf = requestAnimationFrame(loop);
  }

  /** Extend each vertical separator in the workspace-list footer up past the
   *  footer's top border: one `up` overdraw per separator. The separators are
   *  the buttons' own edge borders (`dw-search` right edge, `dw-add`/`dw-delete`
   *  left edge). The accents stay inside the footer (z-index 0), which paints
   *  above the search bar (now z-order 0) so they are never covered by it.
   *  Idempotent per element, so it is safe on every re-render. */
  private _attachWorkspaceFooterOverdraws(): void {
    const root = this.shadowRoot;
    if (!root) return;
    const search = root.querySelector<HTMLElement>(".ws-list-footer .dw-search");
    if (search) attachEdgeOverdraw(search, "right", "up");
    for (const btn of root.querySelectorAll<HTMLElement>(
      ".ws-list-footer .dw-add, .ws-list-footer .dw-delete",
    )) {
      attachEdgeOverdraw(btn, "left", "up");
    }
  }

  /** Extend each vertical separator of the search bar buttons (regex, case,
   *  clear — all `border-left`) up past the search bar's top border and down
   *  past its bottom edge. The search bar is z-order 0 (so the footer's accents
   *  paint above it), so these accents are lifted with a z-index to escape and
   *  stay visible over the footer. Hidden once a workspace drawer slides in
   *  (its own z-index would otherwise poke above the drawer). */
  private _attachWorkspaceSearchBarOverdraws(): void {
    const root = this.shadowRoot;
    if (!root) return;
    for (const btn of root.querySelectorAll<HTMLElement>(
      ".wm-search-bar .wm-search-toggle, .wm-search-bar .wm-search-clear",
    )) {
      attachEdgeOverdraw(btn, "left", "up", "1");
      attachEdgeOverdraw(btn, "left", "down", "1");
    }
    const hide = this._drawers.length > 0;
    for (const line of root.querySelectorAll<HTMLElement>(".wm-search-bar overdraw-line")) {
      line.style.display = hide ? "none" : "";
    }
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

  /** This window's id (cached lazily). Used to register the bar for drags. */
  private _myWindowId(): string {
    return window.openp41ge.workspace.getWindowId() ?? "";
  }

  /** Reorder a tab to `toIndex` (after removing it from its current slot). */
  private _reorderOpenTab(tabId: string, toIndex: number): void {
    const idx = this._openTabs.indexOf(tabId as ManagerTabId);
    if (idx === -1) return;
    const next = this._openTabs.filter((t) => t !== tabId);
    const at = Math.max(0, Math.min(toIndex, next.length));
    next.splice(at, 0, tabId as ManagerTabId);
    this._openTabs = next;
  }

  /** A tab was dropped onto this window's bar from another manager window. */
  private _receiveOpenTab(tabId: string, index: number): void {
    if (!this._openTabs.includes(tabId as ManagerTabId)) {
      const next = [...this._openTabs];
      const at = Math.max(0, Math.min(index, next.length));
      next.splice(at, 0, tabId as ManagerTabId);
      this._openTabs = next;
    }
    this._activeTab = tabId as ManagerTabId;
  }

  /** A tab was moved off this window to another (or a new) manager window. */
  private _removeOpenTab(tabId: string): void {
    const idx = this._openTabs.indexOf(tabId as ManagerTabId);
    if (idx === -1) return;
    const next = this._openTabs.filter((t) => t !== tabId);
    if (next.length === 0) {
      // Never leave a manager window without any tabs.
      this._openTabs = ["workspaces"];
      this._activeTab = "workspaces";
      return;
    }
    this._openTabs = next;
    if (this._activeTab === tabId) {
      this._activeTab = next[Math.max(0, idx - 1)] ?? next[0];
    }
  }

  /** Fired by the manager tab-bar drop target after a same-window reorder drop. */
  private _onManagerTabReorder = (e: Event): void => {
    const detail = (e as CustomEvent).detail as {
      tabId: string;
      fromIndex: number;
      toIndex: number;
    };
    if (!detail?.tabId) return;
    this._reorderOpenTab(detail.tabId, detail.toIndex);
  };


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
                  aria-label="Open workspace"
                  data-tip="Open workspace"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    height="18px"
                    viewBox="0 -960 960 960"
                    width="18px"
                  >
                    <path
                      d="M200-120q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h280v80H200v560h560v-280h80v280q0 33-23.5 56.5T760-120H200Zm188-212-56-56 372-372H560v-80h280v280h-80v-144L388-332Z"
                    />
                  </svg>
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
          /* No z-index: the bar is positioned after .wm-drawer-layer in the DOM
             so it already paints above the body, while leaving the footer
             (z-index 0) above it — so the footer's overdraw accents are not
             covered when this bar is open. The bar's own accents are lifted
             with an inline z-index (see attachEdgeOverdraw). */
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
          /* Clip the horizontal page slide here (not on the pane) so the sticky
             nav/card still anchor to this scroll container. */
          overflow-x: hidden;
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
        .wm-body--welcome {
          /* The welcome slideshow controls are its own bottom bar. */
          padding-bottom: 0;
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
          align-items: center;
          gap: 12px;
          padding: 16px;
          cursor: pointer;
          border-bottom: 1px solid var(--divider, #2f3031);
          transition: background 0.1s ease;
        }
        /* No hover background on the row: a single click is a no-op, so an
           interactive-looking hover would be misleading (double-click opens). */
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

        /* Inline row of mini workspace-window skeletons (up to 3) sitting at the
           row's right edge, just before the edit button. */
        .ws-thumbs {
          display: flex;
          align-items: center;
          gap: 6px;
          flex-shrink: 0;
        }
        .ws-more {
          color: var(--text-secondary, #999);
          font-size: 11px;
          line-height: 1.25;
          user-select: none;
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          gap: 1px;
        }

        /* Mini workspace-window skeleton: title bar + window layout, half the
           old carousel height. */
        .ws-thumb {
          position: relative;
          width: 66px;
          height: 42px;
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
        .ws-thumb-chrome {
          height: 7px;
          flex-shrink: 0;
          background: var(--bg-secondary, #161616);
          border-bottom: 1px solid var(--divider, #333);
          display: flex;
          align-items: center;
          gap: 2px;
          padding: 0 4px;
        }
        .ws-thumb-dot {
          width: 3px;
          height: 3px;
          border-radius: 50%;
          background: var(--text-secondary, #999);
          opacity: 0.55;
        }
        .ws-win-body {
          flex: 1;
          min-height: 0;
          display: flex;
          gap: 2px;
          padding: 3px;
          min-width: 0;
        }
        .ws-win-side {
          width: 12px;
          flex-shrink: 0;
          background: var(--bg-secondary, #161616);
          border-radius: 2px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 1px;
          padding: 2px 0;
        }
        .ws-thumb-side-row {
          width: 8px;
          height: 2px;
          border-radius: 1px;
          background: var(--bg-active, #37373d);
        }
        .ws-win-grid {
          flex: 1;
          display: flex;
          gap: 2px;
          min-width: 0;
        }
        .ws-thumb-cell {
          flex: 1 1 0;
          min-width: 0;
          background: var(--bg-active, #37373d);
          border-radius: 2px;
        }

        /* Edit (pencil) button replacing the old chevron: rounded + hover bg. */
        .ws-edit {
          flex-shrink: 0;
          align-self: center;
          width: 28px;
          height: 28px;
          padding: 0;
          border: none;
          border-radius: 6px;
          background: transparent;
          color: var(--text-secondary, #999);
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: background 0.1s ease, color 0.1s ease;
        }
        .ws-edit:hover {
          background: var(--bg-active, #37373d);
          color: var(--text-primary, #ddd);
        }
        .ws-edit svg {
          display: block;
        }
        /* Confirm / cancel buttons on the inline "new workspace" row, sitting at
           the row's right edge (where the thumbs + edit button live on normal
           rows). Same rounded + hover treatment as the edit button. */
        .ws-new-actions {
          display: flex;
          align-items: center;
          gap: 6px;
          flex-shrink: 0;
        }
        .ws-action {
          flex-shrink: 0;
          align-self: center;
          width: 28px;
          height: 28px;
          padding: 0;
          border: none;
          border-radius: 6px;
          background: transparent;
          color: var(--text-secondary, #999);
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: background 0.1s ease, color 0.1s ease;
        }
        .ws-action:hover {
          background: var(--bg-active, #37373d);
          color: var(--text-primary, #ddd);
        }
        .ws-action svg {
          display: block;
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
        /* Application-level tab panes (Welcome / Releases placeholders). */
        .wm-tab-pane {
          padding: 16px 14px;
        }
        /* Global Settings pane: fills the body so the JSON editor goes edge-to-edge. */
        .wm-settings-pane {
          height: 100%;
          padding: 0;
          display: flex;
          flex-direction: column;
          box-sizing: border-box;
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
        .wm-welcome .wm-markdown > :last-child {
          margin-bottom: 0;
        }
        .wm-tab-placeholder {
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
        /* Welcome footer bar pinned to the bottom of the pane. */
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
        /* Settings-style card for the "never show the welcome message again"
           toggle. Rendered in flow, right below the welcome content, with
           spacing on each side so it does not touch the tab edges. */
        .wm-welcome-dismiss {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 24px;
          box-sizing: border-box;
          margin: 28px 24px 56px;
          padding: 10px 16px;
          border-radius: 10px;
          background: var(--bg-active, #23232a);
          border: 1px solid var(--divider, #333);
          color: var(--text-primary, #eee);
          font-family: inherit;
          user-select: none;
        }
        .wm-welcome-dismiss-label {
          font-size: 13px;
          font-weight: 500;
        }
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
          flex-shrink: 0;
          /* Stretch so the close button can be a full-height square tile. */
          align-self: stretch;
        }
        .dw-open {
          border: none;
          border-left: 1px solid var(--divider, #333);
          border-radius: 0;
          background: transparent;
          color: var(--text-secondary, #999);
          /* Full-height square tile, like .dw-close / the footer action
             buttons, with a left separator continuing the drawer edge. */
          height: 100%;
          aspect-ratio: 1 / 1;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 0;
          cursor: pointer;
        }
        .dw-open:hover {
          background: var(--bg-active, #37373d);
          color: var(--text-primary, #ddd);
        }
        .dw-open svg {
          fill: currentColor;
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
          <div class="wm-body${this._searchOpen ? " wm-body--searching" : ""}${this._activeTab === "welcome" ? " wm-body--welcome" : ""}" @click=${this._onBackgroundClick}>
            ${
              this._activeTab === "welcome"
                ? html`
                    <div class="wm-tab-pane wm-welcome">
                      <div class="wm-markdown">${unsafeHTML(welcomePages[0] ?? "")}</div>
                      <div class="wm-welcome-dismiss">
                        <span class="wm-welcome-dismiss-label">Never show the welcome message again</span>
                        <openp41ge-toggle
                          .checked=${this._welcomeDismissed}
                          label="Never show the welcome message again"
                          .onLabel=${"Yes"}
                          .offLabel=${"No"}
                          @change=${this._onWelcomeDismissToggle}
                        ></openp41ge-toggle>
                      </div>
                      <div class="wm-slideshow-nav"></div>
                    </div>
                  `
                : this._activeTab === "releases"
                ? html`<div class="wm-tab-pane"><p class="wm-tab-placeholder">Releases</p></div>`
                : this._activeTab === "settings"
                ? html`<div class="wm-settings-pane"><openp41ge-manager-settings></openp41ge-manager-settings></div>`
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
                                  <div class="ws-info">
                                    <input
                                      class="wm-new-ws-input"
                                      placeholder="Enter workspace name"
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
                                  <div class="ws-new-actions">
                                    <button
                                      class="ws-action ws-action--confirm"
                                      aria-label="Create workspace"
                                      title="Create workspace"
                                      @mousedown=${(e: MouseEvent) => e.preventDefault()}
                                      @click=${(e: Event) => {
                                        e.stopPropagation();
                                        void this._createWorkspaceFromInput();
                                      }}
                                    >
                                      <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#e3e3e3"><path d="M382-240 154-468l57-57 171 171 367-367 57 57-424 424Z"/></svg>
                                    </button>
                                    <button
                                      class="ws-action ws-action--cancel"
                                      aria-label="Cancel"
                                      title="Cancel"
                                      @mousedown=${(e: MouseEvent) => e.preventDefault()}
                                      @click=${(e: Event) => {
                                        e.stopPropagation();
                                        this._addingWorkspace = false;
                                      }}
                                    >
                                      <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#e3e3e3"><path d="m256-200-56-56 224-224-224-224 56-56 224 224 224-224 56 56-224 224 224 224-56 56-224-224-224 224Z"/></svg>
                                    </button>
                                  </div>
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
                          // Up to 3 thumbnails; once the row overflows, trade one
                          // thumbnail for a "+ N more" counter (4 windows shows
                          // 2 thumbs + "+ 2 more", never "+ 1 more").
                          const showMore = wins.length > MAX_VISIBLE_THUMBS;
                          const visibleWins = wins.slice(
                            0,
                            showMore ? MAX_VISIBLE_THUMBS - 1 : MAX_VISIBLE_THUMBS,
                          );
                          const moreCount = showMore ? wins.length - (MAX_VISIBLE_THUMBS - 1) : 0;
                          const isLast = i === filtered.length - 1;
                          const sideRows = html`<span class="ws-thumb-side-row"></span
                            ><span class="ws-thumb-side-row"></span
                            ><span class="ws-thumb-side-row"></span>`;
                          const renderThumb = (
                            win: { grid?: { placements?: unknown[]; cols?: number } } | undefined,
                          ) => html`
                            <div
                              class="ws-thumb"
                              @pointerenter=${(e: PointerEvent) => this._onThumbPointerEnter(e, w.filePath, isOpen)}
                              @pointerdown=${(e: PointerEvent) => this._onThumbPointerDown(e, w.filePath, isOpen)}
                              @pointermove=${this._onThumbPointerMove}
                              @pointerup=${this._onThumbPointerUp}
                              @pointercancel=${this._onThumbPointerCancel}
                            >
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
                          `;
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
                              }}
                              @dblclick=${(e: Event) => {
                                e.stopPropagation();
                                if (this._workspaceDeleteMode) return;
                                this._openWorkspaceWindow(w.filePath);
                              }}
                            >
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
                              <div class="ws-thumbs">
                                ${visibleWins.map(renderThumb)}
                                ${
                                  moreCount > 0
                                    ? html`<span class="ws-more"
                                        ><span class="ws-more-count">+ ${moreCount}</span
                                        ><span class="ws-more-word">more</span></span
                                      >`
                                    : nothing
                                }
                              </div>
                              ${
                                this._workspaceDeleteMode
                                  ? html`<span
                                      class="dw-checkbox ${this._selectedWorkspaces.has(w.filePath) ? "dw-checkbox--checked" : ""}"
                                    ></span>`
                                  : html`
                                      <button
                                        class="ws-edit"
                                        aria-label="Edit ${name}"
                                        @click=${(e: Event) => {
                                          e.stopPropagation();
                                          this._openWorkspace(w);
                                        }}
                                      >
                                        <svg
                                          xmlns="http://www.w3.org/2000/svg"
                                          width="16"
                                          height="16"
                                          viewBox="0 -960 960 960"
                                          fill="currentColor"
                                        >
                                          <path d="M200-200h57l391-391-57-57-391 391v57Zm-80 80v-170l528-527q12-11 26.5-17t30.5-6q16 0 31 6t26 18l55 56q12 11 17.5 26t5.5 30q0 16-5.5 30.5T817-647L290-120H120Zm640-584-56-56 56 56Zm-141 85-28-29 57 57-29-28Z"/>
                                        </svg>
                                      </button>
                                    `
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
                            aria-label="Open workspace"
                            data-tip="Open workspace"
                          >
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              height="18px"
                              viewBox="0 -960 960 960"
                              width="18px"
                            >
                              <path
                                d="M200-120q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h280v80H200v560h560v-280h80v280q0 33-23.5 56.5T760-120H200Zm188-212-56-56 372-372H560v-80h280v280h-80v-144L388-332Z"
                              />
                            </svg>
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
        ${this._searchOpen && this._activeTab !== "welcome"
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
        ${this._activeTab !== "welcome" ? this._workspaceListFooter() : nothing}
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
