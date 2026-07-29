/**
 * <side-header> — section header row with title and optional refresh button.
 *
 * Matches the explorer sidebar's section header style:
 *   - 10px uppercase title in #888
 *   - Refresh button on the right (icon only)
 *   - 28px height, flex-shrink-0
 */

import { LitElement, html } from "lit";
import { property } from "lit/decorators.js";
import { tailwindCSS } from "../generated/tailwind";
import { unsafeCSS } from "lit";

export class SideHeader extends LitElement {
  createRenderRoot() {
    return this.attachShadow({ mode: "open" });
  }

  static styles = unsafeCSS(tailwindCSS);

  @property({ type: String })
  title: string = "";

  @property({ type: Boolean })
  loading: boolean = false;

  /** Called when the refresh button is clicked. Undefined = no button. */
  @property({ attribute: false })
  onRefresh?: () => void;

  render() {
    return html`
      <div class="flex items-center h-[28px] px-2 gap-1 shrink-0 select-none">
        <span class="text-2xs text-muted font-semibold tracking-[0.5px] flex-1 uppercase">
          ${this.title}
        </span>
        ${this.onRefresh
          ? html`
              <span
                class="w-[18px] h-[18px] flex items-center justify-center cursor-pointer rounded text-muted text-sm shrink-0 hover:text-secondary hover:bg-hover"
                title="Refresh"
                @click=${(e: MouseEvent) => { e.stopPropagation(); this.onRefresh?.(); }}
              >
                ↻
              </span>
            `
          : ""}
        ${this.loading
          ? html`
              <span
                class="w-3 h-3 shrink-0 border-2 border-divider border-t-accent rounded-full animate-spin"
              ></span>
            `
          : ""}
      </div>
    `;
  }
}

customElements.define("side-header", SideHeader);
