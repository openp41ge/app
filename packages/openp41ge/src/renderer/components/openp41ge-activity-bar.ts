/**
 * <openp41ge-activity-bar> — fixed-width vertical bar on the right edge.
 *
 * Renders icon buttons, one per registered activity. The active button
 * is highlighted. Clicking toggles the associated sidebar view.
 *
 * Architecture (SOLID):
 *   - Single Responsibility: only manages the activity button strip
 *   - Open/Closed: new activities can be added without modifying this component
 *   - Communication: dispatches CustomEvent "openp41ge:activity-click" with { viewId }
 *
 * For now, only the "explorer" (file icon) button is registered.
 * Future buttons: search, source control, extensions.
 */

import { LitElement, html, nothing, type TemplateResult } from "lit";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import { property } from "lit/decorators.js";
import { fileIcon, projectsIcon } from "../icons";

export interface ActivityBarItem {
  id: string;
  label: string;
  icon: string; // SVG or icon name
}

const DEFAULT_ACTIVITIES: ActivityBarItem[] = [
  { id: "projects", label: "Projects", icon: "projects" },
  { id: "explorer", label: "Explorer", icon: "file" },
];

const ACTIVITY_BAR_WIDTH = 48;

class Openp41geActivityBar extends LitElement {
  protected createRenderRoot(): HTMLElement | DocumentFragment {
    return this;
  }

  @property({ attribute: false })
  activeViewId: string | null = null;

  @property({ attribute: false })
  activities: ActivityBarItem[] = DEFAULT_ACTIVITIES;

  private _handleClick(viewId: string): void {
    this.dispatchEvent(
      new CustomEvent("openp41ge:activity-click", {
        bubbles: true,
        composed: true,
        detail: { viewId },
      }),
    );
  }

  private _renderIcon(activity: ActivityBarItem): TemplateResult {
    if (activity.id === "explorer") {
      return html`${unsafeHTML(fileIcon(20))}`;
    }
    if (activity.id === "projects") {
      return html`${unsafeHTML(projectsIcon(20))}`;
    }
    // Fallback: use the icon string as raw HTML
    return html`<span style="font-size:20px;">${activity.icon}</span>`;
  }

  render(): TemplateResult | typeof nothing {
    return html`
      <div
        style="display:flex;flex-direction:column;align-items:center;width:${ACTIVITY_BAR_WIDTH}px;height:100%;background:var(--bg-gutter);border-left:1px solid var(--border-divider);flex-shrink:0;user-select:none;"
      >
        <!-- Activity buttons -->
        <div
          style="display:flex;flex-direction:column;align-items:center;gap:4px;padding-top:8px;flex:1;"
        >
          ${this.activities.map(
            (activity) => html`
              <div
                data-activity-id="${activity.id}"
                title="${activity.label}"
                style="display:flex;align-items:center;justify-content:center;width:36px;height:36px;border-radius:8px;cursor:pointer;color:${this.activeViewId === activity.id ? "var(--accent-hover, #4a9eff)" : "var(--text-secondary, #888)"};background:${this.activeViewId === activity.id ? "rgba(74,158,255,0.12)" : "transparent"};transition:color 0.1s;position:relative;"
                @click=${() => this._handleClick(activity.id)}
                @mouseenter=${(e: MouseEvent) => {
                  if (this.activeViewId !== activity.id) {
                    (e.currentTarget as HTMLElement).style.color = "#e0e0e0";
                  }
                }}
                @mouseleave=${(e: MouseEvent) => {
                  if (this.activeViewId !== activity.id) {
                    (e.currentTarget as HTMLElement).style.color = "#888";
                  }
                }}
              >
                ${this._renderIcon(activity)}
                ${
                  this.activeViewId === activity.id
                    ? html`<div
                        style="position:absolute;left:-1px;top:50%;transform:translateY(-50%);width:2px;height:20px;background:var(--accent-hover, #4a9eff);border-radius:1px;"
                      ></div>`
                    : nothing
                }
              </div>
            `,
          )}
        </div>

        <!-- Bottom spacer -->
        <div style="height:8px;"></div>
      </div>
    `;
  }
}

customElements.define("openp41ge-activity-bar", Openp41geActivityBar);

export { Openp41geActivityBar, ACTIVITY_BAR_WIDTH };
