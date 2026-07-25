/**
 * <openp41ge-bottom-button> — bottom bar button (Lit).
 *
 * A uniform button for the bottom toolbar. Hover highlights in blue.
 * The `flat` variant has extra right padding for the rightmost button
 * so its icon isn't clipped by the window's rounded corner.
 */

import { LitElement, html } from "lit";
import { property } from "lit/decorators.js";

export class Openp41geBottomButton extends LitElement {
  /** When true, adds extra right padding (for the rightmost button). */
  @property({ type: Boolean, reflect: true })
  flat = false;

  render() {
    const padding = this.flat ? "0 18px 0 6px" : "0 6px";
    return html`
      <button
        style="display:flex;align-items:center;background:transparent;border:none;color:var(--text-secondary);cursor:pointer;padding:${padding};height:100%;outline:none;transition:color 0.1s;"
        @mouseenter=${(e: MouseEvent) => {
          (e.currentTarget as HTMLElement).style.color = "#4a9eff";
        }}
        @mouseleave=${(e: MouseEvent) => {
          (e.currentTarget as HTMLElement).style.color = "#888";
        }}
      >
        <slot></slot>
      </button>
    `;
  }
}

customElements.define("openp41ge-bottom-button", Openp41geBottomButton);
