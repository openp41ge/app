/**
 * <openp41ge-system-tab-bar> — tab bar for editor-area system tabs.
 *
 * Renders above the editor grid when system tabs are open.
 * System tabs cannot be dragged; they are reorderable via click only.
 * Each tab has a close button.
 */

import { LitElement, html, nothing, type TemplateResult } from "lit";
import { property } from "lit/decorators.js";
import type { Window } from "../../layout/types";
import { emitEvent } from "../app";

interface SystemTabInfo {
  id: string;
  title: string;
  active: boolean;
}

class Openp41geSystemTabBar extends LitElement {
  protected createRenderRoot(): HTMLElement | DocumentFragment {
    return this;
  }

  @property({ attribute: false })
  windowData: Window | null = null;

  /** Pre-resolved system tab info list, in display order. */
  @property({ attribute: false })
  tabs: SystemTabInfo[] = [];

  render(): TemplateResult | typeof nothing {
    if (!this.tabs || this.tabs.length === 0) return nothing;

    return html`
      <style>
        .system-tab-bar {
          display: flex;
          align-items: center;
          height: 36px;
          background: var(--bg-secondary, #1e1e1e);
          border-bottom: 1px solid var(--divider, #333);
          overflow-x: auto;
          flex-shrink: 0;
        }
        .system-tab {
          display: flex;
          align-items: center;
          height: 100%;
          padding: 0 12px;
          font-size: 13px;
          color: var(--text-secondary, #999);
          border-right: 1px solid var(--divider, #333);
          cursor: pointer;
          white-space: nowrap;
          user-select: none;
          gap: 6px;
          min-width: 0;
        }
        .system-tab:hover {
          background: var(--bg-hover, #2a2a2a);
          color: var(--text-primary, #ccc);
        }
        .system-tab.active {
          color: var(--text-primary, #ccc);
          background: var(--bg-primary, #252526);
          border-bottom: 1px solid var(--accent, #007acc);
        }
        .system-tab-close {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 18px;
          height: 18px;
          border-radius: 3px;
          font-size: 14px;
          line-height: 1;
          opacity: 0;
          transition: opacity 0.1s;
          color: var(--text-secondary, #999);
        }
        .system-tab:hover .system-tab-close {
          opacity: 1;
        }
        .system-tab-close:hover {
          background: var(--bg-hover-strong, #444);
          color: var(--text-primary, #ccc);
        }
        .system-tab.active .system-tab-close {
          opacity: 0.6;
        }
        .system-tab.active:hover .system-tab-close {
          opacity: 1;
        }
      </style>
      <div class="system-tab-bar">
        ${this.tabs.map(
          (tab) => html`
            <div
              class="system-tab ${tab.active ? 'active' : ''}"
              @mousedown=${(e: MouseEvent) => this._onTabMouseDown(e, tab.id)}
            >
              <span>${tab.title}</span>
              <span
                class="system-tab-close"
                @click=${(e: MouseEvent) => this._onCloseClick(e, tab.id)}
                title="Close"
              >✕</span>
            </div>
          `,
        )}
      </div>
    `;
  }

  private _onTabMouseDown(e: MouseEvent, tabId: string): void {
    // Middle-click to close
    if (e.button === 1) {
      e.preventDefault();
      this._closeTab(tabId);
      return;
    }
    // Left-click to activate
    if (e.button === 0) {
      e.preventDefault();
      emitEvent("system-tab-activate", {
        windowId: this.windowData?.id,
        tabId,
      });
    }
  }

  private _onCloseClick(e: MouseEvent, tabId: string): void {
    e.stopPropagation();
    this._closeTab(tabId);
  }

  private _closeTab(tabId: string): void {
    emitEvent("system-tab-close", {
      windowId: this.windowData?.id,
      tabId,
    });
  }
}

export { Openp41geSystemTabBar };

customElements.define("openp41ge-system-tab-bar", Openp41geSystemTabBar);
