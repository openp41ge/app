/**
 * <drop-box> — a blue-bordered, transparent-backed drop zone indicator.
 *
 * Used where a dragged item will land as a region (e.g. the settings drawer's
 * "snap to full grid width" anchor). It shares the <drop-line> blue border but
 * reads as a box rather than a line: a transparent fill, an optional soft blue
 * wash, and an optional directional `fade` that fades the box (border and wash
 * together) toward the drag target, so it melts into the drawer it is guiding.
 *
 * The host is `position: absolute`; place it with inline `left/right/top/
 * bottom` and `z-index`. Style hooks: `--drop-color`, `--drop-border`,
 * `--drop-radius`, `--drop-wash`.
 */

import { LitElement, css, html, unsafeCSS } from "lit";
import { property } from "lit/decorators.js";
import { DROP_INDICATOR_COLOR } from "./color";

export type DropFadeDirection = "none" | "left" | "right";

export class DropBox extends LitElement {
  /** Which way to fade the box out (toward the drag target). `none` = solid. */
  @property({ reflect: true }) fade: DropFadeDirection = "none";
  /** Render the soft blue wash behind the border (off = fully transparent). */
  @property({ type: Boolean, reflect: true }) wash = true;

  static styles = css`
    :host {
      position: absolute;
      display: block;
      pointer-events: none;
      box-sizing: border-box;
      --drop-color: ${unsafeCSS(DROP_INDICATOR_COLOR)};
      --drop-border: 2px;
      --drop-radius: 3px;
      --drop-wash: rgba(74, 158, 255, 0.2);
      border: var(--drop-border) solid var(--drop-color);
      border-radius: var(--drop-radius);
      background: transparent;
      box-shadow: 0 0 10px rgba(74, 158, 255, 0.6);
    }
    :host([wash]) {
      background: var(--drop-wash);
    }
    :host([fade="right"]) {
      -webkit-mask-image: linear-gradient(to right, #000, transparent);
      mask-image: linear-gradient(to right, #000, transparent);
    }
    :host([fade="left"]) {
      -webkit-mask-image: linear-gradient(to left, #000, transparent);
      mask-image: linear-gradient(to left, #000, transparent);
    }
  `;

  render() {
    return html``;
  }
}

if (!customElements.get("drop-box")) {
  customElements.define("drop-box", DropBox);
}

declare global {
  interface HTMLElementTagNameMap {
    "drop-box": DropBox;
  }
}
