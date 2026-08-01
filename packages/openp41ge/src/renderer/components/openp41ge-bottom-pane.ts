/**
 * <openp41ge-bottom-pane> — system tab bottom pane.
 *
 * A `position: fixed` panel that overlays the full viewport width below the
 * titlebar. Contains a tab bar (always visible at the bottom) with system
 * tab buttons and the workspace indicator. The content area appears above
 * the tab bar when the pane is expanded via the drag handle.
 *
 * The grid and sidebars continue rendering underneath — never hidden.
 */

import { LitElement, html, nothing, type TemplateResult } from "lit";
import { property, state } from "lit/decorators.js";
import { emitEvent } from "../app";
import { workspaceFileService } from "../services/workspace-file-service";
import { getEditorSystemTabRegistration } from "../apps/app-registry";
import type { EditorSystemTabController } from "../controllers/types";

export interface SystemTabInfo {
  id: string;
  title: string;
  active: boolean;
  appType: string;
}

const TAB_BAR_HEIGHT = 30;
const TITLEBAR_HEIGHT = 38;

class Openp41geBottomPane extends LitElement {
  protected createRenderRoot(): HTMLElement | DocumentFragment {
    return this;
  }

  @property({ type: String })
  windowId: string = "";

  @property({ attribute: false })
  tabs: SystemTabInfo[] = [];

  @property({ type: String })
  activeTabId: string | null = null;

  /** Height of the pane in pixels. Starts collapsed (tab bar only). */
  @state()
  private _paneHeight = TAB_BAR_HEIGHT;

  private _isDragging = false;
  private _dragStartY = 0;
  private _dragStartHeight = TAB_BAR_HEIGHT;

  /** Cache of editor system tab controller instances, keyed by tabId. */
  private _controllers: Map<string, EditorSystemTabController> = new Map();

  /** Get or create a controller for the given tab. */
  private _getController(tab: SystemTabInfo): EditorSystemTabController | null {
    const cached = this._controllers.get(tab.id);
    if (cached) return cached;

    const reg = getEditorSystemTabRegistration(tab.appType);
    if (!reg) return null;

    const ctrl = reg.createController(tab.id);
    this._controllers.set(tab.id, ctrl);
    return ctrl;
  }

  private _activeContent: TemplateResult | typeof nothing = nothing;

  // ═══ Drag resize ─────────────────────────────────────────────────────

  private _onDragStart(e: MouseEvent): void {
    // Ignore if the target is a tab button or workspace indicator
    const target = e.target as HTMLElement;
    if (target.closest("[data-tab-button]") || target.closest("[data-workspace-indicator]")) return;

    this._isDragging = true;
    this._dragStartY = e.clientY;
    this._dragStartHeight = this._paneHeight;

    document.addEventListener("mousemove", this._onDragMove);
    document.addEventListener("mouseup", this._onDragEnd);
    e.preventDefault();
  }

  private _onDragMove = (e: MouseEvent): void => {
    if (!this._isDragging) return;

    const delta = this._dragStartY - e.clientY; // positive = drag up = expand
    const maxHeight = window.innerHeight - TITLEBAR_HEIGHT;
    const newHeight = Math.max(TAB_BAR_HEIGHT, Math.min(maxHeight, this._dragStartHeight + delta));

    this._paneHeight = newHeight;
  };

  private _onDragEnd = (): void => {
    this._isDragging = false;
    document.removeEventListener("mousemove", this._onDragMove);
    document.removeEventListener("mouseup", this._onDragEnd);
  };

  // ═══ Tab interactions ────────────────────────────────────────────────

  private _onTabClick(tabId: string, e: MouseEvent): void {
    // Middle-click to close
    if (e.button === 1) {
      e.preventDefault();
      emitEvent("system-tab-close", { windowId: this.windowId, tabId });
      return;
    }

    // Left-click only beyond this point
    if (e.button !== 0) return;

    // If clicking the active tab, toggle collapse/expand
    if (tabId === this.activeTabId) {
      if (this._paneHeight > TAB_BAR_HEIGHT) {
        this._paneHeight = TAB_BAR_HEIGHT;
      } else {
        this._paneHeight = Math.max(TAB_BAR_HEIGHT + 100, this._paneHeight);
        if (this._paneHeight === TAB_BAR_HEIGHT) {
          this._paneHeight = 300; // default expanded height
        }
      }
      return;
    }

    // Activate a different tab — expand if collapsed
    emitEvent("system-tab-activate", { windowId: this.windowId, tabId });

    if (this._paneHeight <= TAB_BAR_HEIGHT) {
      this._paneHeight = 300; // default expanded height
    }
  }

  private _onTabClose(e: MouseEvent, tabId: string): void {
    e.stopPropagation();
    emitEvent("system-tab-close", { windowId: this.windowId, tabId });
  }

  private async _onWorkspaceClick(): Promise<void> {
    if (!workspaceFileService.activeData) {
      await workspaceFileService.openDialog();
      return;
    }
    // Open workspace manager tab in the bottom pane
    emitEvent("system-tab-open", { windowId: this.windowId, appType: "workspace-manager" });
  }

  // ═══ Render ──────────────────────────────────────────────────────────

  render(): TemplateResult | typeof nothing {
    if (!this.tabs || this.tabs.length === 0) return nothing;

    const isExpanded = this._paneHeight > TAB_BAR_HEIGHT;
    const activeTab = this.tabs.find((t) => t.id === this.activeTabId);

    // Get content for active tab
    let content: TemplateResult | typeof nothing = nothing;
    if (activeTab) {
      const ctrl = this._getController(activeTab);
      if (ctrl) {
        content = ctrl.render() as TemplateResult;
      }
    }

    const contentHeight = this._paneHeight - TAB_BAR_HEIGHT;

    return html`
      <style>
        .bottom-pane-container {
          position: fixed;
          bottom: 0;
          left: 0;
          right: 0;
          z-index: 100;
          display: flex;
          flex-direction: column;
          background: var(--bg-primary, #1e1e1e);
          border-top: 1px solid var(--divider, #333);
          overflow: hidden;
          user-select: none;
        }
        .bp-tab-bar {
          display: flex;
          align-items: center;
          height: ${TAB_BAR_HEIGHT}px;
          flex-shrink: 0;
          cursor: ns-resize;
          overflow-x: auto;
          background: var(--bg-secondary, #252526);
        }
        .bp-tab {
          display: flex;
          align-items: center;
          height: 100%;
          padding: 0 10px;
          font-size: 13px;
          color: var(--text-secondary, #999);
          border-right: 1px solid var(--divider, #333);
          cursor: pointer;
          white-space: nowrap;
          user-select: none;
          gap: 4px;
          flex-shrink: 0;
        }
        .bp-tab:hover {
          background: var(--bg-hover, #2a2a2a);
          color: var(--text-primary, #ccc);
        }
        .bp-tab.active {
          color: var(--text-primary, #ccc);
          background: var(--bg-primary, #1e1e1e);
          border-top: 1px solid var(--accent, #007acc);
        }
        .bp-tab-close {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 16px;
          height: 16px;
          border-radius: 3px;
          font-size: 12px;
          line-height: 1;
          opacity: 0;
          transition: opacity 0.1s;
          color: var(--text-secondary, #999);
        }
        .bp-tab:hover .bp-tab-close {
          opacity: 1;
        }
        .bp-tab-close:hover {
          background: var(--bg-hover-strong, #444);
          color: var(--text-primary, #ccc);
        }
        .bp-workspace-indicator {
          display: flex;
          align-items: center;
          height: 100%;
          padding: 0 12px;
          font-size: 11px;
          cursor: pointer;
          color: var(--text-muted, #777);
          flex-shrink: 0;
          margin-left: auto;
          gap: 4px;
        }
        .bp-workspace-indicator:hover {
          color: var(--accent, #569cd6);
        }
        .bp-content {
          flex: 1;
          overflow: auto;
          min-height: 0;
          background: var(--bg-primary, #1e1e1e);
        }
      </style>
      <div
        class="bottom-pane-container"
        style="height:${this._paneHeight}px"
      >
        <!-- Content area (visible when expanded) -->
        ${isExpanded ? html`
          <div class="bp-content" style="height:${contentHeight}px">
            ${content}
          </div>
        ` : nothing}

        <!-- Tab bar — always visible, acts as drag handle -->
        <div class="bp-tab-bar" @mousedown=${this._onDragStart}>
          ${this.tabs.map(
            (tab) => html`
              <div
                class="bp-tab ${tab.id === this.activeTabId ? 'active' : ''}"
                data-tab-button
                @mousedown=${(e: MouseEvent) => this._onTabClick(tab.id, e)}
              >
                <span>${tab.title}</span>
                <span
                  class="bp-tab-close"
                  data-tab-close
                  @click=${(e: MouseEvent) => this._onTabClose(e, tab.id)}
                  title="Close"
                >✕</span>
              </div>
            `,
          )}

          <div style="flex:1;min-width:0"></div>

          <!-- Workspace indicator -->
          <div
            class="bp-workspace-indicator"
            data-workspace-indicator
            @click=${this._onWorkspaceClick}
            title="${workspaceFileService.activeData ? 'Open workspace settings' : 'Open workspace'}"
          >
            <svg width="12" height="12" viewBox="0 -960 960 960" fill="currentColor" style="margin-top:-1px">
              <path d="M160-240v-480 520-40Zm0 80q-33 0-56.5-23.5T80-240v-480q0-33 23.5-56.5T160-800h240l80 80h320q33 0 56.5 23.5T880-640v200h-80v-200H447l-80-80H160v480h200v80H160ZM584-56 440-200l144-144 56 57-87 87 87 87-56 57Zm192 0-56-57 87-87-87-87 56-57 144 144L776-56Z"/>
            </svg>
            ${workspaceFileService.activeData
              ? html`<span style="font-family:monospace">${workspaceFileService.activeData.id.slice(0, 8)}</span>`
              : html`<span>open workspace</span>`}
          </div>
        </div>
      </div>
    `;
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    // Clean up drag listeners if unmounted mid-drag
    document.removeEventListener("mousemove", this._onDragMove);
    document.removeEventListener("mouseup", this._onDragEnd);

    // Destroy all controllers
    for (const ctrl of this._controllers.values()) {
      const maybe = ctrl as unknown as { destroy?: () => void };
      maybe.destroy?.();
    }
    this._controllers.clear();
  }
}

customElements.define("openp41ge-bottom-pane", Openp41geBottomPane);
export { Openp41geBottomPane };
