/**
 * <openp41ge-bottom-button> — bottom bar button (Lit).
 *
 * A uniform button for the bottom toolbar. Hover highlights in blue.
 * The `flat` variant has extra right padding for the rightmost button
 * so its icon isn't clipped by the window's rounded corner.
 */

import { LitElement, html, unsafeCSS } from "lit";
import { property } from "lit/decorators.js";
import { tailwindCSS } from "openp41ge-components";

export class Openp41geBottomButton extends LitElement {
  static styles = unsafeCSS(tailwindCSS);

  /** When true, adds extra right padding (for the rightmost button). */
  @property({ type: Boolean, reflect: true })
  flat = false;

  render() {
    const padding = this.flat ? "0 18px 0 6px" : "0 6px";
    return html`
      <button
        class="flex items-center bg-transparent border-none text-secondary cursor-pointer outline-none transition-[color] duration-100"
        style="padding:${padding};height:100%;"
        @mouseenter=${(e: MouseEvent) => {
          (e.currentTarget as HTMLElement).classList.add("text-accent");
        }}
        @mouseleave=${(e: MouseEvent) => {
          (e.currentTarget as HTMLElement).classList.remove("text-accent");
        }}
      >
        <slot></slot>
      </button>
    `;
  }
}

customElements.define("openp41ge-bottom-button", Openp41geBottomButton);
