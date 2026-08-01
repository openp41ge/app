/**
 * <openp41ge-windowview> — top-level component for a Openp41ge window (Lit).
 *
 * Owns all three resize handles (left sidebar, right sidebar, bottom pane)
 * so corner drag works naturally without cross-component events.
 */

import { LitElement, html, nothing, type TemplateResult } from "lit";
import { property, state } from "lit/decorators.js";
import type { Window, Workspace, Rect, SystemTab, SystemTabId } from "../../layout/types";
import { emitEvent } from "../app";
import { workspaceFileService } from "../services/workspace-file-service";

import { setContextMenuActive } from "../services/drag-context";
import "./openp41ge-sidebar";
import "./openp41ge-bottom-pane";
import type { SystemTabInfo } from "./openp41ge-bottom-pane";

const MIN_SIDEBAR_WIDTH = 160;
const MAX_SIDEBAR_WIDTH = 600;
const TAB_BAR_HEIGHT = 30;
const TITLEBAR_HEIGHT = 38;
const NOTCH_WIDTH = 7;
const NOTCH_OVERFLOW = 3; // how far the notch extends beyond the sidebar edge

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

  /** Bottom pane height in pixels. Starts collapsed (tab bar only). */
  @state()
  private _paneHeight = TAB_BAR_HEIGHT;

  // ── Drag state ────────────────────────────────────────────────────────

  private _activeHandle: "left" | "right" | "bottom" | "bottom-left" | "bottom-right" | null = null;
  private _dragStartX = 0;
  private _dragStartY = 0;
  private _dragStartLeftWidth = 280;
  private _dragStartRightWidth = 280;
  private _dragStartPaneHeight = TAB_BAR_HEIGHT;

  // ── Context menu ─────────────────────────────────────────────────────

  private _contextMenu: { x: number; y: number; paneId?: string } | null = null;
  private _skeletonInitialized = false;

  connectedCallback(): void {
    super.connectedCallback();
    this._ensureSkeleton();
    document.addEventListener("workspaces-tab:update", this._onWorkspacesUpdate);
    document.addEventListener("workspace-file-changed", this._onWorkspacesUpdate);
    this.addEventListener("bp-expand", this._onBottomPaneExpand);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    document.removeEventListener("workspaces-tab:update", this._onWorkspacesUpdate);
    document.removeEventListener("workspace-file-changed", this._onWorkspacesUpdate);
    this.removeEventListener("bp-expand", this._onBottomPaneExpand);
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

  private _onResizeStart(e: MouseEvent, handle: "left" | "right" | "bottom" | "bottom-left" | "bottom-right"): void {
    e.preventDefault();
    this._activeHandle = handle;
    this._dragStartX = e.clientX;
    this._dragStartY = e.clientY;
    this._dragStartLeftWidth = this._leftWidth;
    this._dragStartRightWidth = this._rightWidth;
    this._dragStartPaneHeight = this._paneHeight;

    document.addEventListener("mousemove", this._onResizeMove);
    document.addEventListener("mouseup", this._onResizeEnd);
  }

  private _onResizeMove = (e: MouseEvent): void => {
    if (!this._activeHandle) return;

    const dx = e.clientX - this._dragStartX;
    const dy = this._dragStartY - e.clientY; // positive = drag up

    const maxPaneHeight = window.innerHeight - TITLEBAR_HEIGHT;
    const minPaneHeight = TAB_BAR_HEIGHT;

    // Set cursor during drag for corner handles
    if (this._activeHandle === "bottom-left" || this._activeHandle === "bottom-right") {
      document.body.style.cursor = "move";
    } else if (this._activeHandle === "bottom") {
      document.body.style.cursor = "ns-resize";
    } else {
      document.body.style.cursor = "col-resize";
    }

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
      case "bottom": {
        const newHeight = Math.max(minPaneHeight, Math.min(maxPaneHeight, this._dragStartPaneHeight + dy));
        this._paneHeight = newHeight;
        break;
      }
      case "bottom-left": {
        const lw = Math.max(MIN_SIDEBAR_WIDTH, Math.min(MAX_SIDEBAR_WIDTH, this._dragStartLeftWidth + dx));
        this._leftWidth = lw;
        const ph = Math.max(minPaneHeight, Math.min(maxPaneHeight, this._dragStartPaneHeight + dy));
        this._paneHeight = ph;
        break;
      }
      case "bottom-right": {
        const rw = Math.max(MIN_SIDEBAR_WIDTH, Math.min(MAX_SIDEBAR_WIDTH, this._dragStartRightWidth - dx));
        this._rightWidth = rw;
        const ph = Math.max(minPaneHeight, Math.min(maxPaneHeight, this._dragStartPaneHeight + dy));
        this._paneHeight = ph;
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

  private _onBottomPaneToggle(): void {
    if (this._paneHeight > TAB_BAR_HEIGHT) {
      this._paneHeight = TAB_BAR_HEIGHT;
    } else {
      this._paneHeight = 300;
    }
  }

  private _onBottomPaneExpand(): void {
    if (this._paneHeight <= TAB_BAR_HEIGHT) {
      this._paneHeight = 300;
    }
  }

  /** Highlight both the sidebar notch and bottom drag bar when hovering a corner. */
  private _highlightCorners(corner: "bottom-left" | "bottom-right", show: boolean): void {
    const side = corner === "bottom-left" ? "left" : "right";
    const notch = this.querySelector(`.wv-notch-v.${side}-notch`);
    const dragBar = this.querySelector(".bp-drag-bar");
    if (!notch || !dragBar) return;
    notch.classList.toggle("dragging", show);
    dragBar.classList.toggle("dragging", show);
  }

  // ═══ Helpers ─────────────────────────────────────────────────────────

  private _getSystemTabTitle(tabId: string): string {
    const sysTab = this.workspaceData?.systemTabs?.[tabId as SystemTabId];
    if (sysTab?.title) return sysTab.title;
    // Editor system tabs don't store metadata in systemTabs — extract from ID
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
    // Editor system tabs embed appType in the ID: editor-sys-{appType}-{timestamp}
    const match = tabId.match(/^editor-sys-([a-z-]+)-\d+$/);
    return match?.[1] ?? "unknown";
  }

  private _getSystemTabPinned(tabId: string): boolean {
    const sysTab = this.workspaceData?.systemTabs?.[tabId as SystemTabId];
    return sysTab?.pinned ?? false;
  }

  /** Build the system tab info list for the bottom pane tab bar. */
  private _getSystemTabInfos(win: Window): SystemTabInfo[] {
    return win.editorSystemTabIds.map((id) => {
      const appType = id.replace(/^editor-sys-/, "").replace(/-\d+$/, "");
      return {
        id,
        title: this._getSystemTabTitle(id) || appType,
        appType,
        active: id === win.editorSystemActiveTabId,
      };
    });
  }

  private async _onWorkspaceClick(): Promise<void> {
    const win = this.windowData;
    if (!win) return;
    if (!workspaceFileService.activeData) {
      await workspaceFileService.openDialog();
      return;
    }
    emitEvent("system-tab-open", { windowId: win.id, appType: "workspace-manager" });
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

    const sysTabInfos = win.editorSystemTabIds.length > 0 ? this._getSystemTabInfos(win) : [];

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
            class="wv-notch-v left-notch"
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
            class="wv-notch-v right-notch"
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

        <!-- Bottom pane (position: fixed, overlays everything) -->
        <openp41ge-bottom-pane
          .windowId=${win.id}
          .tabs=${sysTabInfos}
          .activeTabId=${win.editorSystemActiveTabId}
          .paneHeight=${this._paneHeight}
          @bp-toggle=${this._onBottomPaneToggle}
          @bp-expand=${this._onBottomPaneExpand}
        ></openp41ge-bottom-pane>

        <!-- Bottom pane drag bar (invisible until hovered, centered over bottom pane's top border) -->
        <div
          class="bp-drag-bar"
          @mousedown=${(e: MouseEvent) => this._onResizeStart(e, "bottom")}
        ></div>

        <!-- Corner zones: combine bottom drag with sidebar notches -->
        <div
          class="wv-corner bottom-left"
          @mousedown=${(e: MouseEvent) => this._onResizeStart(e, "bottom-left")}
          @mouseenter=${() => this._highlightCorners("bottom-left", true)}
          @mouseleave=${() => this._highlightCorners("bottom-left", false)}
        ></div>
        <div
          class="wv-corner bottom-right"
          @mousedown=${(e: MouseEvent) => this._onResizeStart(e, "bottom-right")}
          @mouseenter=${() => this._highlightCorners("bottom-right", true)}
          @mouseleave=${() => this._highlightCorners("bottom-right", false)}
        ></div>
      </div>

      <style>
        .bp-drag-bar {
          position: fixed;
          bottom: ${this._paneHeight}px;
          left: 0;
          right: 0;
          height: 8px;
          margin-bottom: -4px;
          cursor: ns-resize;
          z-index: 101;
          pointer-events: auto;
          background: transparent;
        }
        .bp-drag-bar::before {
          content: "";
          position: absolute;
          top: 3px;
          left: 0;
          right: 0;
          height: 2px;
          background: rgba(74, 158, 255, 0.7);
          opacity: 0;
          transition: opacity 0.12s ease;
          pointer-events: none;
        }
        .bp-drag-bar:hover::before,
        .bp-drag-bar.dragging::before { opacity: 1; }

        .wv-corner {
          position: fixed;
          bottom: ${this._paneHeight}px;
          width: 12px;
          height: 12px;
          margin-bottom: -6px;
          z-index: 102;
          pointer-events: auto;
          background: transparent;
        }
        .wv-corner.bottom-left { left: ${this._leftWidth - 6}px; cursor: move; }
        .wv-corner.bottom-right { right: ${this._rightWidth - 6}px; cursor: move; }
      </style>
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
