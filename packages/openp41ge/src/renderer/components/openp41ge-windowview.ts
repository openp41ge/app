/**
 * <openp41ge-windowview> — top-level component for a Openp41ge window (Lit).
 *
 * Provides workspace context to children. Renders the grid, titlebar,
 * left sidebar, right sidebar, bottom bar, and overlays.
 *
 * Each window has its own grid, sidebars, and repo refs — no worksets.
 *
 * Updated for system tabs: sidebars use system tab data from the workspace
 * instead of the activity bar + single sidebar pattern.
 */

import { LitElement, html, nothing, type TemplateResult } from "lit";
import { property } from "lit/decorators.js";
import type { Window, Workspace, Rect, SystemTab, SystemTabId } from "../../layout/types";
import { emitEvent } from "../app";
import { workspaceFileService } from "../services/workspace-file-service";

import { setContextMenuActive } from "../services/drag-context";
import { getEditorSystemTabRegistration } from "../apps/app-registry";
import type { EditorSystemTabController } from "../controllers/types";
import "./openp41ge-sidebar";
import "./openp41ge-system-tab-bar";

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

  private _contextMenu: { x: number; y: number; paneId?: string } | null = null;
  private _skeletonInitialized = false;

  connectedCallback(): void {
    super.connectedCallback();
    this._ensureSkeleton();
    document.addEventListener("workspaces-tab:update", this._onWorkspacesUpdate);
    document.addEventListener("workspace-file-changed", this._onWorkspacesUpdate);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    document.removeEventListener("workspaces-tab:update", this._onWorkspacesUpdate);
    document.removeEventListener("workspace-file-changed", this._onWorkspacesUpdate);
  }

  private _onWorkspacesUpdate = (): void => {
    this.requestUpdate();
  };

  private async _onWorkspaceClick(): Promise<void> {
    const win = this.windowData;
    if (!win) return;

    if (!workspaceFileService.activeData) {
      await workspaceFileService.openDialog();
      return;
    }

    emitEvent("system-tab-open", { windowId: win.id, appType: "workspace-manager" });
  }

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

  private _onOpenProject(): void {
    this.dispatchEvent(
      new CustomEvent("windowview:open-project", { bubbles: true, composed: true }),
    );
  }

  private _onCloneRepo(): void {
    this.dispatchEvent(
      new CustomEvent("windowview:clone-repo", { bubbles: true, composed: true }),
    );
  }

  private _onOpenRecent(name: string): void {
    window.openp41ge.project.switchTo(name).then((result) => {
      if (result.success) {
        window.__openp41geProjectName = name;
      }
    });
  }

  private _onRemoveRecent(name: string): void {
    window.openp41ge.recentProjects.remove(name).then(() => this._loadRecents());
  }

  // ═══ Helpers to resolve system tab data from workspace state ────────

  /** Get the display title for a system tab ID. */
  private _getSystemTabTitle(tabId: string): string {
    const sysTab = this.workspaceData?.systemTabs?.[tabId as SystemTabId];
    return sysTab?.title ?? tabId;
  }

  /** Get the appType for a system tab ID. */
  private _getSystemTabAppType(tabId: string): string {
    const sysTab = this.workspaceData?.systemTabs?.[tabId as SystemTabId];
    return sysTab?.appType ?? "unknown";
  }

  /** Get the pinned state for a system tab ID. */
  private _getSystemTabPinned(tabId: string): boolean {
    const sysTab = this.workspaceData?.systemTabs?.[tabId as SystemTabId];
    return sysTab?.pinned ?? false;
  }

  /** Cache of editor system tab controller instances, keyed by tabId. */
  private _editorSystemTabControllers: Map<string, EditorSystemTabController> = new Map();

  /**
   * Get or create an EditorSystemTabController for the given tabId and appType.
   */
  private _getEditorSystemTabController(tabId: string, appType: string): EditorSystemTabController | null {
    const cached = this._editorSystemTabControllers.get(tabId);
    if (cached) return cached;

    const reg = getEditorSystemTabRegistration(appType);
    if (!reg) return null;

    const ctrl = reg.createController(tabId);
    this._editorSystemTabControllers.set(tabId, ctrl);
    return ctrl;
  }

  /** Build the system tab info list for the system tab bar. */
  private _getSystemTabInfos(win: Window): Array<{ id: string; title: string; active: boolean }> {
    return win.editorSystemTabIds.map((id) => {
      const appType = id.replace(/^editor-sys-/, "").replace(/-\d+$/, "");
      const ctrl = this._getEditorSystemTabController(id, appType);
      return {
        id,
        title: ctrl?.title ?? appType,
        active: id === win.editorSystemActiveTabId,
      };
    });
  }

  render(): TemplateResult | typeof nothing {
    const win = this.windowData;
    const ws = this.workspaceData;
    if (!win) return nothing;

    const hasSysTabs = win.editorSystemTabIds.length > 0;
    const sysTabInfos = hasSysTabs ? this._getSystemTabInfos(win) : [];

    // Render active system tab content
    let systemTabContent: TemplateResult | typeof nothing = nothing;
    if (hasSysTabs && win.editorSystemActiveTabId) {
      const appType = win.editorSystemActiveTabId.replace(/^editor-sys-/, "").replace(/-\d+$/, "");
      const ctrl = this._getEditorSystemTabController(win.editorSystemActiveTabId, appType);
      if (ctrl) {
        systemTabContent = html`
          <div class="system-tab-content flex-1 overflow-auto">
            ${ctrl.render()}
          </div>
        `;
      }
    }

    // Build tab-data and active-tab-ids for <tab-grid>
    const tabData: Record<
      string,
      {
        title: string;
        content: string;
        pinned: boolean;
      }
    > = {};
    const activeTabIds: Record<string, string> = {};
    for (const p of win.grid.placements) {
      const col = String(p.position.col);
      activeTabIds[col] = p.activeTabId ?? p.tabIds[0] ?? "";
      for (const tabId of p.tabIds) {
        const tidStr = String(tabId);
        const tab = ws?.editorTabs?.[tabId];
        const pinned = tab ? !tab.isPreview : true;
        tabData[tidStr] = {
          title: tab?.title ?? "untitled",
          content: "",
          pinned,
        };
      }
    }

    const effectiveCols = Math.max(1, win.grid.cols);
    const placements =
      win.grid.placements.length > 0
        ? win.grid.placements.map((p) => ({ position: { ...p.position }, tabIds: [...p.tabIds] }))
        : [{ position: { row: 0, col: 0 }, tabIds: [] as string[] }];

    // Resolve system tab data for sidebars
    const leftSysTabs = (win.sidebar?.leftSidebarTabs ?? []).map((id) => ({
      id,
      title: this._getSystemTabTitle(id),
      appType: this._getSystemTabAppType(id),
      pinned: this._getSystemTabPinned(id),
    }));
    const rightSysTabs = (win.sidebar?.rightSidebarTabs ?? []).map((id) => ({
      id,
      title: this._getSystemTabTitle(id),
      appType: this._getSystemTabAppType(id),
      pinned: this._getSystemTabPinned(id),
    }));

    return html`
      <style>
        .sidebar-element-hidden { display: none !important; }
      </style>
      <div
        class="flex flex-col w-full h-full bg-surface relative"
      >
        <openp41ge-titlebar
          .windowData=${win}
          .leftSidebarVisible=${win.sidebar?.leftSidebarOpen ?? false}
          .rightSidebarVisible=${win.sidebar?.rightSidebarOpen ?? false}
        ></openp41ge-titlebar>
        <div
          class="openp41ge-main-area flex flex-1 overflow-hidden min-h-0 relative"
        >
          <!-- Left sidebar -->
          <openp41ge-sidebar
            side="left"
            .windowId=${win.id}
            .workspaceData=${ws}
            .systemTabs=${leftSysTabs}
            .activeTabId=${win.sidebar?.activeLeftTab ?? null}
            .isOpen=${win.sidebar?.leftSidebarOpen ?? false}
            class="sidebar-element ${win.sidebar?.leftSidebarOpen ? '' : 'sidebar-element-hidden'}"
          ></openp41ge-sidebar>

          <!-- Central area: system tabs override the grid -->
          <div class="flex flex-col flex-1 overflow-hidden" style="min-width:280px">
            ${hasSysTabs ? html`
              <openp41ge-system-tab-bar
                .windowData=${win}
                .tabs=${sysTabInfos}
              ></openp41ge-system-tab-bar>
              ${systemTabContent}
            ` : html`
              <div
                class="wv-code openp41ge-grid-area relative overflow-hidden flex-1"
                style="--wv-code-min:200px"
              >
                <tab-grid
                  winId=${win.id}
                  .cols=${effectiveCols}
                  .placements=${placements}
                  .tabData=${tabData}
                  .activeTabIds=${activeTabIds}
                ></tab-grid>
              </div>
            `}
          </div>

          <!-- Right sidebar -->
          <openp41ge-sidebar
            side="right"
            .windowId=${win.id}
            .workspaceData=${ws}
            .systemTabs=${rightSysTabs}
            .activeTabId=${win.sidebar?.activeRightTab ?? null}
            .isOpen=${win.sidebar?.rightSidebarOpen ?? false}
            class="sidebar-element ${win.sidebar?.rightSidebarOpen ? '' : 'sidebar-element-hidden'}"
          ></openp41ge-sidebar>
        </div>
        <div
          class="openp41ge-bottom-bar flex items-center h-6 bg-bg-primary border-t border-divider shrink-0" style="padding-left:8px"
        >
          <div class="flex-1"></div>
          <div
            class="text-xs text-muted"
            style="padding:0 4px 0 8px;cursor:pointer;transition:background .1s"
            @click=${() => this._onWorkspaceClick()}
            @mouseenter=${(e: MouseEvent) => (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover,rgba(128,128,128,.15))'}
            @mouseleave=${(e: MouseEvent) => (e.currentTarget as HTMLElement).style.background = 'transparent'}
            title="Open workspace settings"
          >
            ${workspaceFileService.activeData
              ? html`<span style="font-family:monospace">${workspaceFileService.activeData.id.slice(0, 8)}</span>`
              : html`<span>open workspace</span>`}
          </div>
        </div>
      </div>
    `;
  }

  updated(): void {
    // Context menu is now shown synchronously from the event handler,
    // not from updated() — no need to re-trigger here.
  }

  // ═══ Context menu ─────────────────────────────────────────────────────

  private async _updateContextMenu(_win?: Window): Promise<void> {
    if (!this._contextMenu) return;
    const w = _win ?? this.windowData;
    if (!w) return;

    const items: Array<{ label: string; id: string }> = [];

    if (this._contextMenu?.paneId) {
      items.push({ label: "Move to new window", id: "detach-tab-window" });
    }
    if (this._contextMenu?.paneId) {
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
    if (!id) {
      this._contextMenu = null;
      return;
    }

    switch (id) {
      case "detach-tab-window":
        if (this._contextMenu?.paneId) {
          window.openp41ge.workspace.detachTab(w.id, this._contextMenu.paneId, {
            x: 100,
            y: 100,
            width: 800,
            height: 600,
          });
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
