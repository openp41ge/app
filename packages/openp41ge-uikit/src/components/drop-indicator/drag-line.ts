/**
 * <drag-line> — the semi-transparent blue line you hover over to drag a
 * sidebar / window boundary.
 *
 * Unlike <drop-line> (a solid, glowing "you will drop here" marker), this is a
 * quieter affordance: a translucent blue line that fades in while you hover
 * or drag (driven by the consumer toggling the `show` attribute, since the
 * 3px strip is too thin to be reliably hovered itself). It shares the same
 * blue family so it reads as related to the drop markers.
 *
 * The host is `position: absolute`; place it with inline `left/right/top/
 * bottom`, set `z-index` as needed. `--drop-color` / `--drop-width` override
 * the translucency and thickness.
 */

import { LitElement, css, html } from "lit";
import { property } from "lit/decorators.js";

export class DragLine extends LitElement {
  /** Which way the line runs. Defaults to `vertical`. */
  @property({ reflect: true }) orientation: "vertical" | "horizontal" = "vertical";
  /** Whether the line is visible (consumer toggles this on hover / drag). */
  @property({ type: Boolean, reflect: true }) show = false;
  /** Fade the two tips (overdraw-style) instead of hard ends. */
  @property({ type: Boolean, reflect: true }) overdraw = false;

  static styles = css`
    :host {
      position: absolute;
      display: block;
      pointer-events: none;
      box-sizing: border-box;
      --drop-color: rgba(74, 158, 255, 0.7);
      --drop-width: 3px;
      top: 0;
      bottom: 0;
      background: var(--drop-color);
      opacity: 0;
      transition: opacity 0.12s ease;
    }
    :host([show]) {
      opacity: 1;
    }
    :host([orientation="horizontal"]) {
      width: 100%;
      height: var(--drop-width);
    }
    :host([orientation="vertical"]) {
      width: var(--drop-width);
      height: 100%;
    }
  `;

  render() {
    return html``;
  }
}

if (!customElements.get("drag-line")) {
  customElements.define("drag-line", DragLine);
}

declare global {
  interface HTMLElementTagNameMap {
    "drag-line": DragLine;
  }
}
