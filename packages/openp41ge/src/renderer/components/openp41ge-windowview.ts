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

    document.addEventListener("fe:cursor-changed", (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail) return;
      const posEl = this.querySelector("#cursor-position");
      if (posEl) {
        posEl.textContent = "Ln " + detail.lineNumber + ", Col " + detail.column;
      }
    });
  }

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
        const tab = ws?.tabs?.[tabId as string];
        const pinned = tab ? !(tab as { isPreview?: boolean }).isPreview : true;
        tabData[tabId as string] = { title: tab?.title ?? "untitled", content: "", pinned };
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
        style="display:flex;flex-direction:column;width:100%;height:100%;background:var(--bg-surface);position:relative"
      >
        <openp41ge-titlebar .windowData=${win}></openp41ge-titlebar>
        <div
          class="openp41ge-main-area"
          style="display:flex;flex:1;overflow:hidden;min-height:0;position:relative;"
        >
          <div
            class="openp41ge-grid-area"
            style="flex:1 1 200px;min-width:200px;position:relative;overflow:hidden"
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
          class="openp41ge-bottom-bar"
          style="display:flex;align-items:center;height:28px;background:var(--bg-primary);border-top:1px solid var(--border-divider);flex-shrink:0;"
        >
          <span
            id="cursor-position"
            style="color:var(--text-muted);font-size:11px;padding:0 8px;font-style:normal;white-space:nowrap;"
          ></span>
          <div style="flex:1"></div>
          <openp41ge-bottom-button
            @click=${(e: MouseEvent) => {
              e.stopPropagation();
              this._togglePromptOverlay();
            }}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              height="16px"
              viewBox="0 -960 960 960"
              width="16px"
              fill="currentColor"
            >
              <path
                d="M80-80v-720q0-33 23.5-56.5T160-880h640q33 0 56.5 23.5T880-800v480q0 33-23.5 56.5T800-240H240L80-80Zm126-240h594v-480H160v525l46-45Zm-46 0v-480 480Z"
              />
            </svg>
          </openp41ge-bottom-button>
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
                      style="margin-top:-1px"
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
                      style="margin-top:-1px"
                    >
                      <path
                        d="M480-80q-82 0-155-31.5t-127.5-86Q143-252 111.5-325T80-480q0-83 31.5-155.5t86-127Q252-817 325-848.5T480-880q83 0 155.5 31.5t127 86.5q54.5 55 86 127T880-480h-80q0-133-93.5-226.5T480-800q-133 0-226.5 93.5T160-480q0 133 93.5 226.5T480-160q97 0 183-57t115-143h82q-31 114-123 187T480-80Zm238-240-56-58 102-102H520v-80h244L662-662l56-58 162 162-162 238Z"
                      />
                    </svg>
                  </openp41ge-bottom-button>`
              : nothing
          }
        </div>
        <div
          class="prompt-overlay"
          style="position:absolute;bottom:36px;left:50%;transform:translateX(-50%) scale(0.85) translateY(8px);width:520px;max-width:90vw;background:var(--bg-primary);border:1px solid var(--border-color);border-radius:12px;padding:8px 12px;z-index:50;box-shadow:0 -4px 20px rgba(0,0,0,0.4);flex-shrink:0;opacity:0;visibility:hidden;pointer-events:none;transition:opacity 0.15s ease,transform 0.15s ease,box-shadow 0.15s ease;transform-origin:bottom center;"
        >
          <div style="display:flex;align-items:flex-start;gap:8px;">
            <textarea
              class="prompt-input"
              placeholder="Type a command or ask a question…"
              rows="2"
              style="flex:1;background:transparent;border:none;color:#e0e0e0;font-size:13px;padding:4px 0;outline:none;font-family:inherit;resize:none;line-height:1.5;min-height:47px;max-height:203px;overflow-y:auto;"
              @keydown=${(e: KeyboardEvent) => {
                if (e.key === "Escape") this._hidePromptOverlay();
              }}
              @input=${(e: InputEvent) => {
                const ta = e.target as HTMLTextAreaElement;
                ta.style.height = "auto";
                ta.style.height = ta.scrollHeight + "px";
              }}
              @focus=${() => {
                this.querySelector(".prompt-overlay")?.classList.add("prompt-focus");
              }}
              @blur=${() => {
                this.querySelector(".prompt-overlay")?.classList.remove("prompt-focus");
              }}
            ></textarea>
            <button
              class="prompt-submit"
              style="background:var(--accent);border:none;border-radius:50%;width:24px;height:24px;display:flex;align-items:center;justify-content:center;color:#fff;font-size:12px;cursor:pointer;line-height:1;padding:0;flex-shrink:0;margin-top:2px;"
              @click=${() => {
                const input = this.querySelector(".prompt-input") as HTMLTextAreaElement | null;
                if (input) input.value = "";
                this._hidePromptOverlay();
              }}
            >
              →
            </button>
          </div>
        </div>
        <style>
          .bottom-prompt-btn:hover {
            color: #e0e0e0 !important;
            background: var(--accent) !important;
          }
          .bottom-gear:hover {
            color: #e0e0e0 !important;
            background: var(--bg-tertiary) !important;
          }
          .prompt-overlay.prompt-open {
            opacity: 1 !important;
            visibility: visible !important;
            pointer-events: auto !important;
            transform: translateX(-50%) scale(1) translateY(0) !important;
          }
          .prompt-overlay.prompt-focus {
            border-color: var(--accent-hover) !important;
            box-shadow:
              0 -4px 20px rgba(0, 0, 0, 0.4),
              0 0 0 1px #4a9eff !important;
          }
        </style>
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

  // ═══ Prompt overlay ───────────────────────────────────────────────────

  private _togglePromptOverlay(): void {
    const overlay = this.querySelector(".prompt-overlay") as HTMLElement | null;
    const input = this.querySelector(".prompt-input") as HTMLTextAreaElement | null;
    if (!overlay) return;

    if (!overlay.classList.contains("prompt-open")) {
      overlay.classList.add("prompt-open");
      if (input) {
        input.value = "";
        requestAnimationFrame(() => input.focus());
        input.style.height = "auto";
        input.style.height = input.scrollHeight + "px";
      }
    } else {
      this._hidePromptOverlay();
    }
  }

  private _hidePromptOverlay(): void {
    const overlay = this.querySelector(".prompt-overlay") as HTMLElement | null;
    const input = this.querySelector(".prompt-input") as HTMLTextAreaElement | null;
    if (overlay) {
      overlay.classList.remove("prompt-open");
      overlay.classList.remove("prompt-focus");
    }
    if (input) input.value = "";
  }
}

customElements.define("openp41ge-windowview", Openp41geWindowView);
