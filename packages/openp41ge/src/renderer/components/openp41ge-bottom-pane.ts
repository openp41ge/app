/**
 * <openp41ge-bottom-pane> — system tab bottom pane with column grid.
 *
 * A `position: fixed` panel that overlays the full viewport width below the
 * titlebar. Always visible at the bottom of the window.
 *
 * System tabs are arranged in a column-based grid. The global tab bar at the
 * top shows all system tabs. Below it, columns render side-by-side, each with
 * its own mini tab bar and the active tab's content.
 *
 * Height is controlled by parent <openp41ge-windowview> via the `paneHeight`
 * property. The drag handle is rendered by windowview — not by this component.
 *
 * The grid and sidebars continue rendering underneath — never hidden.
 */

import { LitElement, html, nothing, type TemplateResult } from "lit";
import { property } from "lit/decorators.js";
import { emitEvent } from "../app";
import { getEditorSystemTabRegistration } from "../apps/app-registry";
import type { EditorSystemTabController } from "../controllers/types";
import { TAB_BAR_HEIGHT, TITLEBAR_HEIGHT, BP_EXPAND_EVENT, BP_TOGGLE_EVENT, BP_FULLSIZE_EVENT, BP_SHRINK_EVENT } from "openp41ge-constants";

export interface SystemTabInfo {
  id: string;
  title: string;
  active?: boolean;
  appType: string;
}

/**
 * A single column's data: which tabs it holds and which is active.
 */
export interface BottomPaneColumn {
  /** Tab IDs in this column, in display order. */
  tabIds: string[];
  /** Active tab ID in this column. */
  activeTabId: string | null;
}

/**
 * The full bottom pane grid layout.
 * May be expanded later to include divider ratios and column spans.
 */
export interface BottomPaneGrid {
  columns: BottomPaneColumn[];
}

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

  /**
   * Column grid data for the bottom pane content area.
   * If provided, columns are rendered side-by-side with per-column tab bars.
   */
  @property({ attribute: false })
  grid: BottomPaneGrid | null = null;

  /** Pane height in pixels, set by parent <openp41ge-windowview>. */
  @property({ type: Number })
  paneHeight: number = TAB_BAR_HEIGHT;

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

  /** Get a controller by tab ID only (creates if needed). */
  private _getControllerById(tabId: string): EditorSystemTabController | null {
    const tab = this.tabs.find((t) => t.id === tabId);
    if (!tab) return null;
    return this._getController(tab);
  }

  /** True when the pane shows more than just the minimum. */
  private get _isExpanded(): boolean {
    return this.paneHeight > TAB_BAR_HEIGHT && this.tabs.length > 0;
  }

  // ═══ Tab interactions ────────────────────────────────────────────────

  private _onTabClick(tabId: string, e: MouseEvent): void {
    if (e.button === 1) {
      e.preventDefault();
      emitEvent("system-tab-close", { windowId: this.windowId, tabId });
      return;
    }
    if (e.button !== 0) return;

    if (tabId === this.activeTabId && this.tabs.length > 0) {
      this.dispatchEvent(new CustomEvent(BP_TOGGLE_EVENT, { bubbles: true, composed: true }));
      return;
    }

    emitEvent("system-tab-activate", { windowId: this.windowId, tabId });
    if (!this._isExpanded) {
      this.dispatchEvent(new CustomEvent(BP_EXPAND_EVENT, { bubbles: true, composed: true }));
    }
  }

  private _onTabClose(e: MouseEvent, tabId: string): void {
    e.stopPropagation();
    emitEvent("system-tab-close", { windowId: this.windowId, tabId });
  }

  /** Click a tab in a column's mini tab bar. */
  private _onColumnTabClick(tabId: string, e: MouseEvent): void {
    if (e.button === 1) {
      e.preventDefault();
      emitEvent("system-tab-close", { windowId: this.windowId, tabId });
      return;
    }
    if (e.button !== 0) return;

    emitEvent("system-tab-activate", { windowId: this.windowId, tabId });
    if (!this._isExpanded) {
      this.dispatchEvent(new CustomEvent(BP_EXPAND_EVENT, { bubbles: true, composed: true }));
    }
  }

  // ═══ Render: tab bar ─────────────────────────────────────────────────

  private _renderTabBar(): TemplateResult {
    return html`
      <div class="bp-tab-bar">
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
                @mousedown=${(e: MouseEvent) => e.stopPropagation()}
                @click=${(e: MouseEvent) => this._onTabClose(e, tab.id)}
                title="Close"
              >✕</span>
            </div>
          `,
        )}
        <div class="bp-actions">
          ${this.paneHeight >= window.innerHeight - TITLEBAR_HEIGHT ? html`
            <div
              class="bp-action-btn"
              title="Shrink to default"
              @click=${() => this.dispatchEvent(new CustomEvent(BP_SHRINK_EVENT, { bubbles: true, composed: true }))}
            >
              <svg width="16" height="16" viewBox="0 -960 960 960" fill="currentColor">
                <path d="M240-120v-120H120v-80h200v200h-80Zm400 0v-200h200v80H720v120h-80ZM120-640v-80h120v-120h80v200H120Zm520 0v-200h80v120h120v80H640Z"/>
              </svg>
            </div>
          ` : html`
            <div
              class="bp-action-btn"
              title="Full size"
              @click=${() => this.dispatchEvent(new CustomEvent(BP_FULLSIZE_EVENT, { bubbles: true, composed: true }))}
            >
              <svg width="16" height="16" viewBox="0 -960 960 960" fill="currentColor">
                <path d="M120-120v-200h80v120h120v80H120Zm520 0v-80h120v-120h80v200H640ZM120-640v-200h200v80H200v120h-80Zm640 0v-120H640v-80h200v200h-80Z"/>
              </svg>
            </div>
          `}
        </div>
      </div>
    `;
  }

  // ═══ Render: content with columns ────────────────────────────────────

  private _renderColumn(col: BottomPaneColumn, colIndex: number): TemplateResult {
    const tabId = col.activeTabId;
    const tab = tabId ? this.tabs.find((t) => t.id === tabId) : null;
    const ctrl = tab ? this._getController(tab) : null;

    const colTabs = col.tabIds
      .map((id) => this.tabs.find((t) => t.id === id))
      .filter(Boolean) as SystemTabInfo[];

    return html`
      <div class="bp-column" style="flex:1;min-width:200px;${colIndex > 0 ? 'border-left:1px solid var(--divider,#333);' : ''}">
        <!-- Per-column mini tab bar -->
        <div class="bp-col-tab-bar">
          ${colTabs.map(
            (t) => html`
              <div
                class="bp-col-tab ${t.id === tabId ? 'active' : ''}"
                @mousedown=${(e: MouseEvent) => this._onColumnTabClick(t.id, e)}
              >
                <span>${t.title}</span>
                <span
                  class="bp-tab-close"
                  @mousedown=${(e: MouseEvent) => e.stopPropagation()}
                  @click=${(e: MouseEvent) => this._onTabClose(e, t.id)}
                  title="Close"
                >✕</span>
              </div>
            `,
          )}
        </div>
        <!-- Column content -->
        <div class="bp-col-content">
          ${ctrl ? ctrl.render() as TemplateResult : nothing}
        </div>
      </div>
    `;
  }

  private _renderContent(): TemplateResult | typeof nothing {
    if (!this._isExpanded) return nothing;

    const contentHeight = this.paneHeight - TAB_BAR_HEIGHT;

    // If we have grid data with columns, render them side-by-side
    if (this.grid && this.grid.columns.length > 0) {
      return html`
        <div class="bp-columns" style="height:${contentHeight}px;display:flex;flex-direction:row;overflow:hidden;">
          ${this.grid.columns.map((col, i) => this._renderColumn(col, i))}
        </div>
      `;
    }

    // Fallback: single-content area (legacy behaviour)
    const activeTab = this.tabs.find((t) => t.id === this.activeTabId);
    let content: TemplateResult | typeof nothing = nothing;
    if (activeTab) {
      const ctrl = this._getController(activeTab);
      if (ctrl) {
        content = ctrl.render() as TemplateResult;
      }
    }

    return html`
      <div class="bp-content" style="height:${contentHeight}px">
        ${content}
      </div>
    `;
  }

  // ═══ Render ──────────────────────────────────────────────────────────

  render(): TemplateResult {
    return html`
      <style>
        .bp-container {
          position: fixed;
          bottom: 0;
          left: 0;
          right: 0;
          z-index: 100;
          display: flex;
          flex-direction: column;
          background: var(--bg-primary, #1e1e1e);
          user-select: none;
          border-top: 1px solid var(--divider, #333);
        }
        .bp-tab-bar {
          display: flex;
          align-items: center;
          height: ${TAB_BAR_HEIGHT}px;
          flex-shrink: 0;
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
          gap: 10px;
          flex-shrink: 0;
        }
        .bp-tab:first-child {
          padding-left: 18px;
        }
        .bp-tab:hover {
          background: var(--bg-hover, #2a2a2a);
          color: var(--text-primary, #ccc);
        }
        .bp-tab.active {
          color: var(--text-primary, #ccc);
          background: var(--bg-primary, #1e1e1e);
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
          color: var(--text-secondary, #999);
        }
        .bp-tab-close:hover {
          background: var(--bg-hover-strong, #444);
          color: var(--text-primary, #ccc);
        }
        .bp-content {
          flex: 1;
          overflow: auto;
          min-height: 0;
          background: var(--bg-primary, #1e1e1e);
        }
        .bp-actions {
          margin-left: auto;
          display: flex;
          align-items: center;
          height: 100%;
          padding: 0 4px;
          gap: 2px;
          flex-shrink: 0;
        }
        .bp-action-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 24px;
          height: 24px;
          border-radius: 4px;
          cursor: pointer;
          color: var(--text-secondary, #999);
          flex-shrink: 0;
        }
        .bp-action-btn:hover {
          background: var(--bg-hover, #2a2a2a);
          color: var(--text-primary, #ccc);
        }

        /* ── Column layout ── */
        .bp-columns {
          display: flex;
          flex-direction: row;
          overflow: hidden;
          background: var(--bg-primary, #1e1e1e);
        }
        .bp-column {
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        .bp-col-tab-bar {
          display: flex;
          align-items: center;
          height: 24px;
          flex-shrink: 0;
          background: var(--bg-secondary, #252526);
          border-bottom: 1px solid var(--divider, #333);
          overflow-x: auto;
        }
        .bp-col-tab {
          display: flex;
          align-items: center;
          height: 100%;
          padding: 0 8px;
          font-size: 12px;
          color: var(--text-secondary, #999);
          border-right: 1px solid var(--divider, #333);
          cursor: pointer;
          white-space: nowrap;
          user-select: none;
          gap: 6px;
          flex-shrink: 0;
        }
        .bp-col-tab:hover {
          background: var(--bg-hover, #2a2a2a);
          color: var(--text-primary, #ccc);
        }
        .bp-col-tab.active {
          color: var(--text-primary, #ccc);
          background: var(--bg-primary, #1e1e1e);
        }
        .bp-col-content {
          flex: 1;
          overflow: auto;
          min-height: 0;
        }
      </style>
      <div class="bp-container" style="height:${this.paneHeight}px">
        ${this._renderTabBar()}
        ${this._renderContent()}
      </div>
    `;
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    for (const ctrl of this._controllers.values()) {
      const maybe = ctrl as unknown as { destroy?: () => void };
      maybe.destroy?.();
    }
    this._controllers.clear();
  }
}

customElements.define("openp41ge-bottom-pane", Openp41geBottomPane);
export { Openp41geBottomPane };
