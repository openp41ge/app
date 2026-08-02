/**
 * <openp41ge-windowview> — top-level component for a Openp41ge window (Lit).
 *
 * Owns the sidebar resize handles. Bottom area uses a thin bottom bar
 * with a workspace indicator. System tabs replaced by a service modal.
 */

import { LitElement, html, nothing, type TemplateResult } from "lit";
import { property, state } from "lit/decorators.js";
import type { Window, Workspace, Rect, SystemTabId } from "../../layout/types";
import { emitEvent } from "../app";
import { serviceModalService } from "../services/service-modal-service";

import { setContextMenuActive } from "../services/drag-context";
import { MIN_SIDEBAR_WIDTH, MAX_SIDEBAR_WIDTH, NOTCH_WIDTH, NOTCH_OVERFLOW, TITLEBAR_HEIGHT } from "openp41ge-constants";

import "./openp41ge-sidebar";

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

  // ── Context menu ─────────────────────────────────────────────────────

  private _contextMenu: { x: number; y: number; paneId?: string } | null = null;
  private _skeletonInitialized = false;

  connectedCallback(): void {
    super.connectedCallback();
    this._ensureSkeleton();
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
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
        this._leftWidth = newWidth;
        break;
      }
      case "right": {
        const newWidth = Math.max(MIN_SIDEBAR_WIDTH, Math.min(MAX_SIDEBAR_WIDTH, this._dragStartRightWidth - dx));
        this._rightWidth = newWidth;
        break;
      }
    }
  };

  private _onResizeEnd = (): void => {
    this._activeHandle = null;
    document.removeEventListener("mousemove", this._onResizeMove);
    document.removeEventListener("mouseup", this._onResizeEnd);

    // Reset cursor
    document.body.style.cursor = "";

    // Persist widths
    localStorage.setItem("openp41ge:sidebar-width-left", String(this._leftWidth));
    localStorage.setItem("openp41ge:sidebar-width-right", String(this._rightWidth));
  };

  // ═══ Bottom bar handlers ──────────────────────────────────────────────

  private _onBarWorkspaceClick(): void {
    serviceModalService.openModal("workspace-manager");
  }

  private _openSettings(): void {
    serviceModalService.openModal("settings");
  }

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
          margin-left: -${NOTCH_OVERFLOW}px;
          margin-right: -${NOTCH_OVERFLOW}px;
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
        .wv-notch-v.left-notch::before { left: 2px; }
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
        </div>

        <!-- Service modal (fixed overlay, renders above grid) -->
        <openp41ge-service-modal></openp41ge-service-modal>

        <!-- Bottom bar: workspace indicator + settings, right-aligned -->
        <div
          class="wv-bottom-bar"
          style="border-top:1px solid var(--divider,#333);height:24px;flex-shrink:0;display:flex;align-items:center;padding:0 4px;font-size:12px;color:var(--text-secondary,#999);background:var(--bg-secondary,#252526);"
        >
          <span style="flex:1"></span>
          <openp41ge-bottom-bar-btn
            title="Open workspaces"
            @click=${() => this._onBarWorkspaceClick()}
          >
            <svg width="14" height="14" viewBox="0 -960 960 960" fill="currentColor">
              <path d="M160-240v-480 520-40Zm0 80q-33 0-56.5-23.5T80-240v-480q0-33 23.5-56.5T160-800h240l80 80h320q33 0 56.5 23.5T880-640v200h-80v-200H447l-80-80H160v480h200v80H160ZM584-56 440-200l144-144 56 57-87 87 87 87-56 57Zm192 0-56-57 87-87-87-87 56-57 144 144L776-56Z"/>
            </svg>
          </openp41ge-bottom-bar-btn>
          <openp41ge-bottom-bar-btn
            title="Settings"
            @click=${() => this._openSettings()}
          >
            <svg width="14" height="14" viewBox="0 -960 960 960" fill="currentColor">
              <path d="m370-80-16-128q-13-5-24.5-12T307-235l-119 50L78-375l103-78q-1-7-1-13.5v-27q0-6.5 1-13.5L78-585l110-190 119 50q11-8 23-15t24-12l16-128h220l16 128q13 5 24.5 12t22.5 15l119-50 110 190-103 78q1 7 1 13.5v27q0 6.5-2 13.5l103 78-110 190-118-50q-11 8-23 15t-24 12L590-80H370Zm70-80h79l14-106q31-8 57.5-23.5T639-327l99 41 39-68-86-65q5-14 7-29.5t2-31.5q0-16-2-31.5t-7-29.5l86-65-39-68-99 42q-22-23-48.5-38.5T533-694l-13-106h-79l-14 106q-31 8-57.5 23.5T321-633l-99-41-39 68 86 64q-5 15-7 30t-2 32q0 16 2 31t7 30l-86 65 39 68 99-42q22 23 48.5 38.5T427-266l13 106Zm42-180q58 0 99-41t41-99q0-58-41-99t-99-41q-59 0-99.5 41T342-480q0 58 40.5 99t99.5 41Zm-2-140Z"/>
            </svg>
          </openp41ge-bottom-bar-btn>
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
