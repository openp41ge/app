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
import { fileIcon, gitIcon } from "../icons";

export interface ActivityBarItem {
  id: string;
  label: string;
  icon: string; // SVG or icon name
}

const DEFAULT_ACTIVITIES: ActivityBarItem[] = [
  { id: "explorer", label: "Explorer", icon: "file" },
  { id: "git", label: "Git", icon: "git" },
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
    if (activity.id === "git") {
      return html`${unsafeHTML(gitIcon(20))}`;
    }
    // Fallback: use the icon string as raw HTML
    return html`<span class="text-[20px]">${activity.icon}</span>`;
  }

  render(): TemplateResult | typeof nothing {
    return html`
      <div
        class="flex flex-col items-center bg-gutter border-l border-divider shrink-0 select-none"
        class="ab-panel h-full" style="--ab-w:${ACTIVITY_BAR_WIDTH}px"
      >
        <!-- Activity buttons -->
        <div
          class="flex flex-col items-center gap-1 pt-2 flex-1"
        >
          ${this.activities.map(
            (activity) => html`
              <div
                data-activity-id="${activity.id}"
                title="${activity.label}"
                class="ab-item flex items-center justify-center w-9 h-9 rounded-lg cursor-pointer transition-[color] duration-100 relative"
                style="--ab-c:${this.activeViewId === activity.id ? "var(--accent-hover, #4a9eff)" : "var(--text-secondary, #888)"};--ab-bg:${this.activeViewId === activity.id ? "rgba(74,158,255,0.12)" : "transparent"}"
                @click=${() => this._handleClick(activity.id)}
                @mouseenter=${(e: MouseEvent) => {
                  if (this.activeViewId !== activity.id) {
                    (e.currentTarget as HTMLElement).style.setProperty("--ab-c", "#e0e0e0");
                  }
                }}
                @mouseleave=${(e: MouseEvent) => {
                  if (this.activeViewId !== activity.id) {
                    (e.currentTarget as HTMLElement).style.setProperty("--ab-c", "#888");
                  }
                }}
              >
                ${this._renderIcon(activity)}
                ${
                  this.activeViewId === activity.id
                    ? html`<div
                        class="absolute -left-px top-1/2 -translate-y-1/2 w-0.5 h-5 bg-accent rounded-sm"
                      ></div>`
                    : nothing
                }
              </div>
            `,
          )}
        </div>

        <!-- Bottom spacer -->
        <div class="h-2"></div>
      </div>
    `;
  }
}

customElements.define("openp41ge-activity-bar", Openp41geActivityBar);

export { Openp41geActivityBar, ACTIVITY_BAR_WIDTH };
