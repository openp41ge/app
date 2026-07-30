/**
 * <openp41ge-windowview> — top-level component for a Openp41ge window (Lit).
 *
 * Provides workspace context to children. Renders the grid, titlebar,
 * worktree tree, bottom bar, and overlays.
 *
 * Each window has its own grid, sidebar, and repo refs — no worksets.
 */

import { LitElement, html, nothing, type TemplateResult } from "lit";
import { property } from "lit/decorators.js";
import type { Window, Workspace, Rect } from "../../layout/types";
import { dispatch } from "../app";

import { setContextMenuActive } from "../services/drag-context";
import "./openp41ge-bottom-button";
import "./openp41ge-activity-bar";
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

  private _contextMenu: { x: number; y: number; paneId?: string } | null = null;
  private _skeletonInitialized = false;

  connectedCallback(): void {
    super.connectedCallback();
    this._ensureSkeleton();

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

  render(): TemplateResult | typeof nothing {
    const win = this.windowData;
    const ws = this.workspaceData;
    if (!win) return nothing;

    // Build tab-data and active-tab-ids for <tab-grid>
    const tabData: Record<
      string,
      {
        title: string;
        content: string;
        pinned: boolean;
        ephemeral?: boolean;
        ephemeralPinned?: boolean;
      }
    > = {};
    const activeTabIds: Record<string, string> = {};
    for (const p of win.grid.placements) {
      const col = String(p.position.col);
      activeTabIds[col] = p.activeTabId ?? p.tabIds[0] ?? "";
      for (const tabId of p.tabIds) {
        const tidStr = String(tabId);
        const tab = ws?.tabs?.[tabId];
        const isEphemeral = tab ? tab.isEphemeral ?? false : false;
        const ephemeralPinned = tab ? tab.ephemeralPinned ?? false : false;
        // Ephemeral tabs are not pinned; regular tabs are pinned if not a preview
        const pinned = tab ? !tab.isPreview && !isEphemeral : true;
        tabData[tidStr] = {
          title: tab?.title ?? "untitled",
          content: "",
          pinned,
          ephemeral: isEphemeral,
          ephemeralPinned,
        };
      }
    }

    // Ensure at least 1 column for an empty grid so the tab-grid renders
    const effectiveCols = Math.max(1, win.grid.cols);
    const placements =
      win.grid.placements.length > 0
        ? win.grid.placements.map((p) => ({ position: { ...p.position }, tabIds: [...p.tabIds] }))
        : [{ position: { row: 0, col: 0 }, tabIds: [] as string[] }];

    return html`
      <div
        class="flex flex-col w-full h-full bg-surface relative"
      >
        <openp41ge-titlebar .windowData=${win}></openp41ge-titlebar>
        <div
          class="openp41ge-main-area flex flex-1 overflow-hidden min-h-0 relative"
        >
          <div
            class="wv-code openp41ge-grid-area relative overflow-hidden"
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
          <openp41ge-sidebar
            .windowId=${win.id}
            .activeViewId=${win.sidebar?.activeViewId ?? null}
          ></openp41ge-sidebar>
          <openp41ge-activity-bar
            .activeViewId=${win.sidebar?.activeViewId ?? null}
          ></openp41ge-activity-bar>
        </div>
        <div
          class="openp41ge-bottom-bar flex items-center h-7 bg-bg-primary border-t border-divider shrink-0"
        >
          <div class="flex-1"></div>

          ${
            window.openp41ge.isDev()
              ? html`<openp41ge-bottom-button
                    title="Toggle DevTools"
                    @click=${(e: MouseEvent) => {
                      e.stopPropagation();
                      window.openp41ge.window.openDevTools();
                    }}
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      height="16px"
                      viewBox="0 -960 960 960"
                      width="16px"
                      fill="currentColor"
                      class="-mt-px"
                    >
                      <path
                        d="M756-120 537-339l84-84 219 219-84 84Zm-552 0-84-84 276-276-68-68-28 28-51-51v82l-28 28-121-121 28-28h82l-50-50 142-142q20-20 43-29t47-9q24 0 47 9t43 29l-92 92 50 50-28 28 68 68 90-90q-4-11-6.5-23t-2.5-24q0-59 40.5-99.5T701-841q15 0 28.5 3t27.5 9l-99 99 72 72 99-99q7 14 9.5 27.5T841-701q0 59-40.5 99.5T701-561q-12 0-24-2t-23-7L204-120Z"
                      />
                    </svg>
                  </openp41ge-bottom-button>
                  <openp41ge-bottom-button
                    flat
                    title="Reset app state"
                    @click=${(e: MouseEvent) => {
                      e.stopPropagation();
                      window.openp41ge.workspace.reset();
                    }}
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      height="16px"
                      viewBox="0 -960 960 960"
                      width="16px"
                      fill="currentColor"
                      class="-mt-px"
                    >
                      <path
                        d="M480-80q-82 0-155-31.5t-127.5-86Q143-252 111.5-325T80-480q0-83 31.5-155.5t86-127Q252-817 325-848.5T480-880q83 0 155.5 31.5t127 86.5q54.5 55 86 127T880-480h-80q0-133-93.5-226.5T480-800q-133 0-226.5 93.5T160-480q0 133 93.5 226.5T480-160q97 0 183-57t115-143h82q-31 114-123 187T480-80Zm238-240-56-58 102-102H520v-80h244L662-662l56-58 162 162-162 238Z"
                      />
                    </svg>
                  </openp41ge-bottom-button>`
              : nothing
          }
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
          dispatch("removeTabFromCell", w.id, this._contextMenu.paneId);
        }
        break;
    }
    this._contextMenu = null;
  }


}

customElements.define("openp41ge-windowview", Openp41geWindowView);
