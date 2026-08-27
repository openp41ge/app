/**
 * <openp41ge-windowview> — top-level component for a Openp41ge window (Lit).
 *
 * Owns the sidebar resize handles. Bottom area uses a thin (empty) bar
 * reserved for future use. System tabs replaced by a service modal.
 */

import { LitElement, html, nothing, type TemplateResult } from "lit";
import { property, state } from "lit/decorators.js";
import type { Window, Workspace, Rect, SystemTabId } from "../../layout/types";
import { emitEvent } from "../app";

import { setContextMenuActive } from "../services/drag-context";
import { MIN_SIDEBAR_WIDTH, MAX_SIDEBAR_WIDTH, NOTCH_WIDTH, NOTCH_OVERFLOW } from "openp41ge-constants";

import "./openp41ge-sidebar";
import "./openp41ge-workspaces-overlay";

class Openp41geWindowView extends LitElement {
  protected createRenderRoot(): HTMLElement | DocumentFragment {
    return this;
  }

  @property({ attribute: false })
  windowData: Window | null = null;

  @property({ attribute: false })
  workspaceData: Workspace | null = null;

  @property({ attribute: false })
  layouts: Map<string, Map<string, Rect>> = new Map();

  // ═══ Resize state (owned by windowview for unified corner handling) ──

  /** Left sidebar width in pixels. */
  @state()
  private _leftWidth = parseInt(localStorage.getItem("openp41ge:sidebar-width-left") ?? "280", 10);

  /** Right sidebar width in pixels. */
  @state()
  private _rightWidth = parseInt(localStorage.getItem("openp41ge:sidebar-width-right") ?? "280", 10);

  // ── Drag state ────────────────────────────────────────────────────────

  private _activeHandle: "left" | "right" | null = null;
  private _dragStartX = 0;
  private _dragStartY = 0;
  private _dragStartLeftWidth = 280;
  private _dragStartRightWidth = 280;
  /** Latest applied width during an active drag (written straight to the DOM so
   * the handle tracks the mouse every move, without a full re-render per mousemove). */
  private _dragLeftWidth = 280;
  private _dragRightWidth = 280;

  // ── Context menu ─────────────────────────────────────────────────────

  private _contextMenu: { x: number; y: number; paneId?: string } | null = null;
  private _skeletonInitialized = false;
  private _resizeRaf = 0;

  /**
   * On every window resize, force a top-level Lit re-render (rAF-throttled).
   * The CSS shell already tracks the viewport, but JS-measured sub-layouts
   * (sidebar heights, editor/tree viewports, bottom pane) capture pixel sizes
   * during render — so they must re-render as the window grows or they go
   * stale until some later event. The macOS native maximize animation is a
   * particular case where this matters.
   */
  private _onWindowResize = (): void => {
    if (this._resizeRaf) return;
    this._resizeRaf = requestAnimationFrame(() => {
      this._resizeRaf = 0;
      this.requestUpdate();
    });
  };

  connectedCallback(): void {
    super.connectedCallback();
    this._ensureSkeleton();
    window.addEventListener("resize", this._onWindowResize);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    window.removeEventListener("resize", this._onWindowResize);
    if (this._resizeRaf) {
      cancelAnimationFrame(this._resizeRaf);
      this._resizeRaf = 0;
    }
    document.removeEventListener("mousemove", this._onResizeMove);
    document.removeEventListener("mouseup", this._onResizeEnd);
  }

  private _onWorkspacesUpdate = (): void => {
    this.requestUpdate();
  };

  private _ensureSkeleton(): void {
    if (this._skeletonInitialized) return;
    this._skeletonInitialized = true;

    this.addEventListener("contextmenu", (e: MouseEvent) => {
      const gridArea = this.querySelector(".openp41ge-grid-area");
      if (!gridArea || !gridArea.contains(e.target as Node)) return;
      e.preventDefault();
      if (!(e.target instanceof HTMLElement)) return;
      const paneEl = e.target.closest("[data-pane-id]");
      if (!(paneEl instanceof HTMLElement)) {
        this._contextMenu = { x: e.clientX, y: e.clientY, paneId: undefined };
      } else {
        const paneId = paneEl.getAttribute("data-pane-id") ?? undefined;
        this._contextMenu = { x: e.clientX, y: e.clientY, paneId };
      }
      this._updateContextMenu();
    });
  }

  // ═══ Resize handlers ──────────────────────────────────────────────────

  private _onResizeStart(e: MouseEvent, handle: "left" | "right"): void {
    e.preventDefault();
    this._activeHandle = handle;
    this._dragStartX = e.clientX;
    this._dragStartY = e.clientY;
    this._dragStartLeftWidth = this._leftWidth;
    this._dragStartRightWidth = this._rightWidth;
    this._dragLeftWidth = this._leftWidth;
    this._dragRightWidth = this._rightWidth;

    document.addEventListener("mousemove", this._onResizeMove);
    document.addEventListener("mouseup", this._onResizeEnd);
  }

  private _onResizeMove = (e: MouseEvent): void => {
    if (!this._activeHandle) return;

    const dx = e.clientX - this._dragStartX;

    document.body.style.cursor = "col-resize";

    switch (this._activeHandle) {
      case "left": {
        const newWidth = Math.max(MIN_SIDEBAR_WIDTH, Math.min(MAX_SIDEBAR_WIDTH, this._dragStartLeftWidth + dx));
        this._dragLeftWidth = newWidth;
        this._applyWidth("left", newWidth);
        break;
      }
      case "right": {
        const newWidth = Math.max(MIN_SIDEBAR_WIDTH, Math.min(MAX_SIDEBAR_WIDTH, this._dragStartRightWidth - dx));
        this._dragRightWidth = newWidth;
        this._applyWidth("right", newWidth);
        break;
      }
    }
  };

  /**
   * Write a sidebar width straight to its DOM host element. Bypasses Lit
   * re-rendering so the resize handle tracks the mouse position on every
   * mousemove — even very fast ones — instead of lagging behind.
   */
  private _applyWidth(side: "left" | "right", width: number): void {
    const el = this.querySelector<HTMLElement>(`openp41ge-sidebar[side="${side}"]`);
    if (!el) return;
    el.style.flex = `0 1 ${width}px`;
    // Mirror the template's max-width clamp (sidebar fills up to 35% viewport).
    el.style.maxWidth = `min(${width}px, 35vw)`;
  }

  private _onResizeEnd = (): void => {
    this._activeHandle = null;
    document.removeEventListener("mousemove", this._onResizeMove);
    document.removeEventListener("mouseup", this._onResizeEnd);

    // Reset cursor
    document.body.style.cursor = "";

    // Commit the final drag width into reactive state (single render) and persist
    this._leftWidth = this._dragLeftWidth;
    this._rightWidth = this._dragRightWidth;
    localStorage.setItem("openp41ge:sidebar-width-left", String(this._leftWidth));
    localStorage.setItem("openp41ge:sidebar-width-right", String(this._rightWidth));
  };

  // ═══ Helpers ─────────────────────────────────────────────────────────

  private _getSystemTabTitle(tabId: string): string {
    const sysTab = this.workspaceData?.systemTabs?.[tabId as SystemTabId];
    if (sysTab?.title) return sysTab.title;
    // Sidebar tabs embed appType in the ID
    const appType = this._getSystemTabAppType(tabId);
    if (appType !== "unknown") {
      const names: Record<string, string> = {
        "workspace-manager": "Workspaces",
        settings: "Settings",
        explorer: "Explorer",
        git: "Git",
        search: "Search",
      };
      return names[appType] ?? appType;
    }
    return tabId;
  }

  private _getSystemTabAppType(tabId: string): string {
    const sysTab = this.workspaceData?.systemTabs?.[tabId as SystemTabId];
    if (sysTab?.appType) return sysTab.appType;
    const match = tabId.match(/^editor-sys-([a-z-]+)-\d+$/);
    return match?.[1] ?? "unknown";
  }

  private _getSystemTabPinned(tabId: string): boolean {
    const sysTab = this.workspaceData?.systemTabs?.[tabId as SystemTabId];
    return sysTab?.pinned ?? false;
  }

  // ═══ Render ──────────────────────────────────────────────────────────

  render(): TemplateResult | typeof nothing {
    const win = this.windowData;
    const ws = this.workspaceData;
    if (!win) return nothing;

    // Build tab-data and active-tab-ids for <tab-grid>
    const tabData: Record<string, { title: string; content: string; pinned: boolean }> = {};
    const activeTabIds: Record<string, string> = {};
    for (const p of win.grid.placements) {
      const col = String(p.position.col);
      activeTabIds[col] = p.activeTabId ?? p.tabIds[0] ?? "";
      for (const tabId of p.tabIds) {
        const tidStr = String(tabId);
        const tab = ws?.editorTabs?.[tabId];
        const pinned = tab ? !tab.isPreview : true;
        tabData[tidStr] = { title: tab?.title ?? "untitled", content: "", pinned };
      }
    }

    const effectiveCols = Math.max(1, win.grid.cols);
    const placements = win.grid.placements.length > 0
      ? win.grid.placements.map((p) => ({ position: { ...p.position }, tabIds: [...p.tabIds] }))
      : [{ position: { row: 0, col: 0 }, tabIds: [] as string[] }];

    // Resolve system tab data for sidebars
    const leftSysTabs = (win.sidebar?.leftSidebarTabs ?? []).map((id) => ({
      id, title: this._getSystemTabTitle(id), appType: this._getSystemTabAppType(id), pinned: this._getSystemTabPinned(id),
    }));
    const rightSysTabs = (win.sidebar?.rightSidebarTabs ?? []).map((id) => ({
      id, title: this._getSystemTabTitle(id), appType: this._getSystemTabAppType(id), pinned: this._getSystemTabPinned(id),
    }));

    return html`
      <style>
        .sidebar-element-hidden { display: none !important; }

        /* ── Resize notches (like sidebar notches but owned by windowview) ── */
        .wv-notch-v {
          width: ${NOTCH_WIDTH}px;
          flex-shrink: 0;
          cursor: col-resize;
          position: relative;
          z-index: 5;
          background: transparent;
          /* Asymmetric negative margins cancel the 7px width to a ZERO-width
             flex track (margin-box 7 - 3 - 4 = 0), so the sidebar border sits
             flush against the grid — no hairline gap — while the 7px element
             and its hover highlight bar still overlap the boundary. */
          margin-left: -${NOTCH_OVERFLOW}px;
          margin-right: -${NOTCH_WIDTH - NOTCH_OVERFLOW}px;
        }
        .wv-notch-v::before {
          content: "";
          position: absolute;
          top: 0;
          width: 3px;
          height: 100%;
          background: rgba(74, 158, 255, 0.7);
          opacity: 0;
          transition: opacity 0.12s ease;
          pointer-events: none;
        }
        .wv-notch-v:hover::before,
        .wv-notch-v.dragging::before { opacity: 1; }
        .wv-notch-v.left-notch::before { left: 1px; }
        .wv-notch-v.right-notch::before { right: 2px; }

        /* ── Bottom bar icon hover ── */
      </style>
      <div class="flex flex-col w-full h-full bg-surface relative">
        <openp41ge-titlebar
          .windowData=${win}
          .leftSidebarVisible=${win.sidebar?.leftSidebarOpen ?? false}
          .rightSidebarVisible=${win.sidebar?.rightSidebarOpen ?? false}
        ></openp41ge-titlebar>

        <div class="openp41ge-main-area flex flex-1 overflow-hidden min-h-0 relative">
          <!-- Left sidebar -->
          <openp41ge-sidebar
            side="left"
            .windowId=${win.id}
            .workspaceData=${ws}
            .systemTabs=${leftSysTabs}
            .activeTabId=${win.sidebar?.activeLeftTab ?? null}
            .isOpen=${win.sidebar?.leftSidebarOpen ?? false}
            class="sidebar-element ${win.sidebar?.leftSidebarOpen ? '' : 'sidebar-element-hidden'}"
            style="flex: 0 1 ${this._leftWidth}px; max-width: min(${this._leftWidth}px, 35vw)"
          ></openp41ge-sidebar>

          <!-- Left resize notch (between left sidebar and grid) -->
          <div
            class="wv-notch-v left-notch ${win.sidebar?.leftSidebarOpen ? '' : 'sidebar-element-hidden'}"
            @mousedown=${(e: MouseEvent) => this._onResizeStart(e, "left")}
          ></div>

          <!-- Central area: grid always renders -->
          <div class="flex flex-col flex-1 overflow-hidden" style="min-width:280px">
            <div class="wv-code openp41ge-grid-area relative overflow-hidden flex-1" style="--wv-code-min:200px">
              <tab-grid
                winId=${win.id}
                .cols=${effectiveCols}
                .placements=${placements}
                .tabData=${tabData}
                .activeTabIds=${activeTabIds}
              ></tab-grid>
            </div>
          </div>

          <!-- Right resize notch (between grid and right sidebar) -->
          <div
            class="wv-notch-v right-notch ${win.sidebar?.rightSidebarOpen ? '' : 'sidebar-element-hidden'}"
            @mousedown=${(e: MouseEvent) => this._onResizeStart(e, "right")}
          ></div>

          <!-- Right sidebar -->
          <openp41ge-sidebar
            side="right"
            .windowId=${win.id}
            .workspaceData=${ws}
            .systemTabs=${rightSysTabs}
            .activeTabId=${win.sidebar?.activeRightTab ?? null}
            .isOpen=${win.sidebar?.rightSidebarOpen ?? false}
            class="sidebar-element ${win.sidebar?.rightSidebarOpen ? '' : 'sidebar-element-hidden'}"
            style="flex: 0 1 ${this._rightWidth}px; max-width: min(${this._rightWidth}px, 35vw)"
          ></openp41ge-sidebar>
          <!-- Workspaces overlay: covers the tab + sidebar area only -->
          <openp41ge-workspaces-overlay></openp41ge-workspaces-overlay>
        </div>

        <!-- Service modal (fixed overlay, renders above grid) -->
        <openp41ge-service-modal></openp41ge-service-modal>

        <!-- Bottom bar: empty placeholder bar (kept for future use) -->
        <div
          class="wv-bottom-bar"
          style="border-top:1px solid var(--divider,#333);height:24px;flex-shrink:0;display:flex;align-items:center;padding:0 4px;font-size:12px;color:var(--text-secondary,#999);background:var(--bg-secondary,#252526);"
        >
          <span style="flex:1"></span>
        </div>
      </div>
    `;
  }

  updated(): void {
    // Context menu is shown synchronously from the event handler
  }

  // ═══ Context menu ─────────────────────────────────────────────────────

  private async _updateContextMenu(_win?: Window): Promise<void> {
    if (!this._contextMenu) return;
    const w = _win ?? this.windowData;
    if (!w) return;

    const items: Array<{ label: string; id: string }> = [];
    if (this._contextMenu?.paneId) {
      items.push({ label: "Move to new window", id: "detach-tab-window" });
      items.push({ label: "Close", id: "close-tab" });
    }

    setContextMenuActive(true);
    const blockNextMousedown = (e: MouseEvent) => {
      e.stopImmediatePropagation();
      e.preventDefault();
      document.removeEventListener("mousedown", blockNextMousedown, true);
    };
    document.addEventListener("mousedown", blockNextMousedown, true);
    const id = await window.openp41ge.showContextMenu(items);
    document.removeEventListener("mousedown", blockNextMousedown, true);
    setTimeout(() => setContextMenuActive(false), 0);
    if (!id) { this._contextMenu = null; return; }

    switch (id) {
      case "detach-tab-window":
        if (this._contextMenu?.paneId) {
          window.openp41ge.workspace.detachTab(w.id, this._contextMenu.paneId, { x: 100, y: 100, width: 800, height: 600 });
        }
        break;
      case "close-tab":
        if (this._contextMenu?.paneId) {
          emitEvent("tab-remove-from-cell", { windowId: w.id, paneId: this._contextMenu.paneId });
        }
        break;
    }
    this._contextMenu = null;
  }
}

customElements.define("openp41ge-windowview", Openp41geWindowView);
