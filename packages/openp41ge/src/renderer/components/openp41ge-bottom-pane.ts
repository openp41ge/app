/**
 * <openp41ge-bottom-pane> — system tab bottom pane.
 *
 * A `position: fixed` panel that overlays the full viewport width below the
 * titlebar. Always visible at the bottom of the window.
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
import { TAB_BAR_HEIGHT, TITLEBAR_HEIGHT, BP_EXPAND_EVENT, BP_TOGGLE_EVENT, BP_FULLSIZE_EVENT, BP_SHRINK_EVENT, BP_CLOSE_EVENT } from "openp41ge-constants";

export interface SystemTabInfo {
  id: string;
  title: string;
  active: boolean;
  appType: string;
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
      // Toggle collapse/expand via DOM event so parent windowview can catch it
      this.dispatchEvent(new CustomEvent(BP_TOGGLE_EVENT, { bubbles: true, composed: true }));
      return;
    }

    emitEvent("system-tab-activate", { windowId: this.windowId, tabId });
    // If collapsed, request expand so content becomes visible
    if (!this._isExpanded) {
      this.dispatchEvent(new CustomEvent(BP_EXPAND_EVENT, { bubbles: true, composed: true }));
    }
  }

  private _onTabClose(e: MouseEvent, tabId: string): void {
    e.stopPropagation();
    emitEvent("system-tab-close", { windowId: this.windowId, tabId });
  }

  // ═══ Render ──────────────────────────────────────────────────────────

  render(): TemplateResult {
    const isExpanded = this._isExpanded;
    const activeTab = this.tabs.find((t) => t.id === this.activeTabId);

    let content: TemplateResult | typeof nothing = nothing;
    if (activeTab && isExpanded) {
      const ctrl = this._getController(activeTab);
      if (ctrl) {
        content = ctrl.render() as TemplateResult;
      }
    }

    const contentHeight = this.paneHeight - TAB_BAR_HEIGHT;

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
      </style>
      <div
        class="bp-container"
        style="height:${this.paneHeight}px"
      >
        <!-- Tab bar — always visible -->
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
                  <path d="M120-120v-200h80v120h120v80H120Zm520 0v-80h120v-120h80v200H640ZM120-640v-200h200v80H200v120h-80Zm640 0v-120H640v-80h200v200h-80Z"/>
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
            <div
              class="bp-action-btn"
              title="Close pane"
              @click=${() => this.dispatchEvent(new CustomEvent(BP_CLOSE_EVENT, { bubbles: true, composed: true }))}
            >
              <svg width="16" height="16" viewBox="0 -960 960 960" fill="currentColor">
                <path d="m480-500 160-160H320l160 160Zm280-340q33 0 56.5 23.5T840-760v560q0 33-23.5 56.5T760-120H200q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h560ZM200-320v120h560v-120H200Zm560-80v-360H200v360h560Zm-560 80v120-120Z"/>
              </svg>
            </div>
          </div>
        </div>
        <!-- Content area — only when expanded -->
        ${isExpanded ? html`
          <div class="bp-content" style="height:${contentHeight}px">
            ${content}
          </div>
        ` : nothing}
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
