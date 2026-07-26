/**
 * <tab-view> — renders tab content with preserve-on-inactive behavior.
 *
 * Light DOM for compatibility with elementFromPoint and query selectors.
 * Only the active tab is visible; inactive tabs remain in the DOM (hidden)
 * so their state is preserved when switching back.
 */

import { LitElement, html } from "lit";
import { property } from "lit/decorators.js";
import { unsafeHTML } from "lit/directives/unsafe-html.js";

export class TabView extends LitElement {
  @property({ type: Array }) tabIds: string[] = [];
  @property({ type: String }) activeTabId: string = "";
  @property({ type: Object }) tabs: Record<string, { content: string }> = {};

  createRenderRoot() {
    return this;
  }

  render() {
    if (this.tabIds.length === 0) {
      return html`
        <div
          style="display:flex;align-items:center;justify-content:center;height:100%;color:#666;font-style:italic;"
        >
          ${['🪟', '🔲', '🫙', '🌌', '◻️', '📑'][Math.floor(Math.random() * 6)]}
        </div>
      `;
    }
    return html`
      ${this.tabIds.map(
        (id) => html`
          <div
            data-tab-id=${id}
            ?hidden=${id !== this.activeTabId}
            style="padding:16px;overflow-y:auto;height:100%;box-sizing:border-box;"
          >
            ${this.tabs[id] ? unsafeHTML(this.tabs[id].content) : ""}
          </div>
        `,
      )}
    `;
  }
}

customElements.define("tab-view", TabView);
