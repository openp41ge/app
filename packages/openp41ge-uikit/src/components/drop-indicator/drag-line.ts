/**
 * <drag-line> — the blue line you hover over to drag a sidebar / window
 * boundary.
 *
 * Unlike <drop-line> (a solid, glowing "you will drop here" marker), this is a
 * quieter affordance: a flat blue line (no glow) that fades in while you hover
 * or drag (driven by the consumer toggling the `show` attribute, since the
 * 3px strip is too thin to be reliably hovered itself). It shares the same
 * blue family so it reads as related to the drop markers, and it is OPAQUE so
 * it renders identically whatever background it crosses — a translucent line
 * would let a brighter separator or a different-titlebar background show
 * through and make the bar read as a different colour from its overdraw fade.
 *
 * The host is `position: absolute`; place it with inline `left/right/top/
 * bottom`, set `z-index` as needed. `--drop-color` / `--drop-width` override
 * the translucency and thickness.
 *
 * The host itself paints only the transparent slot: its colour is drawn by the
 * companion <drag-line-overdraw> mirror, which sits just beneath it and is the
 * sole painter of the line (full height + the fade above). This keeps the line
 * a SINGLE translucent layer — if the drag-line also painted, it would stack
 * over the mirror and come out visibly brighter, creating a hard colour step
 * where the overdraw fade meets the line.
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
      --drop-color: rgb(74, 158, 255);
      --drop-width: 3px;
      top: 0;
      bottom: 0;
      /* The mirror paints the line (full height + top fade); the host only
         supplies the position, thickness and the show signal. Painting here
         too would stack over the mirror and look brighter than the fade. */
      background: transparent;
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
