/**
 * <drop-box-overdraw> — the overdraw companion to a <drop-box>.
 *
 * A <drop-box> is the blue-bordered drop-zone / anchor indicator (e.g. the
 * settings drawer's "snap to full grid width" box). This component renders
 * the overdraw accents that make the box read as a draggable anchor region:
 *
 *   - a horizontal accent continuing the box's TOP border past its far edge,
 *   - a vertical accent rising UP from the top border at the far edge,
 *   - a horizontal accent continuing the box's BOTTOM border past its far edge.
 *
 * The "far edge" is the box's SOLID side (the edge it anchors on), which is
 * the side OPPOSITE its `fade` direction: a box that fades leftward anchors on
 * its right edge, so its accents stop/bleed on the right. The accents are
 * <overdraw-line>s rendered in a fixed, viewport-wide layer, so they escape any
 * `overflow: hidden` panel (the grid wrapper) and paint over the adjacent
 * region / the top bar. They sit in the same stacking context as the drop-box
 * (its companion sibling, so the drop-box's own fade `mask` never affects
 * them), and the host is given the same `z-index` as its box so the accents
 * stay visible (un-dimmed) above the drawer's dim mask.
 *
 * The consumer places it next to its <drop-box> (in the same host):
 *
 * ```html
 * <drop-box fade="left"></drop-box>
 * <drop-box-overdraw></drop-box-overdraw>
 * ```
 *
 * It resolves the sibling <drop-box>` automatically (reads its `fade`), and
 * places its accents once against the box's rect — the box anchors at a fixed
 * grid edge while shown, so its rect is static, and the accents are hidden
 * entirely when the owning host unmounts the pair.
 *
 * Styling hooks on the host:
 *  - `--drop-color` — accent colour; defaults to the shared drop indicator blue.
 *  - `--drop-border` — accent thickness (px); defaults to 3px so the accents
 *    are as wide as the drop-box's border lines (and the 3px drag line) they
 *    continue.
 */

import { LitElement, css, html, nothing, unsafeCSS } from "lit";
import { DROP_INDICATOR_COLOR } from "./color";
import "../overdraw-line/overdraw-line";

export class DropBoxOverdraw extends LitElement {
  static styles = css`
    :host {
      /* Positioned + same z-index as the box (30) so the fixed accent layer
         paints above the drawer's dim mask instead of being dimmed by it. */
      position: absolute;
      z-index: 30;
      pointer-events: none;
      --drop-color: ${unsafeCSS(DROP_INDICATOR_COLOR)};
      --drop-border: 3px;
    }
    .od-layer {
      position: fixed;
      left: 0;
      top: 0;
      right: 0;
      bottom: 0;
      pointer-events: none;
    }
    .od-layer overdraw-line {
      --overdraw-color: var(--drop-color);
      --overdraw-thickness: var(--drop-border);
      opacity: 0;
      transition: opacity 0.12s ease;
    }
  `;

  firstUpdated(): void {
    this._place();
  }

  private _findDropBox(): HTMLElement | null {
    // Re-query the live sibling each time (do NOT cache): the owning host may
    // re-render and replace the <drop-box>.
    return this.parentElement?.querySelector<HTMLElement>("drop-box") ?? null;
  }

  /** The border thickness to match (px), read from the box's `--drop-border`.
   *  Falls back to 3px (the drop-box default, matching the 3px drag line). */
  private _borderThickness(box: HTMLElement): number {
    const v = getComputedStyle(box).getPropertyValue("--drop-border");
    const n = parseFloat(v);
    return Number.isFinite(n) && n > 0 ? n : 3;
  }

  /** Place the three accents against the sibling drop-box's rect. The box is
   *  static while shown, so a single placement suffices; the accents fade in
   *  via the lines' own opacity transition (set to 1 on placement). Each
   *  accent spans the same thickness as the box's border (`--drop-border`) so
   *  it reads as that border continuing past the far edge. */
  private _place(): void {
    const box = this._findDropBox();
    if (!box) return;
    const fade = box.getAttribute("fade");
    if (!fade || fade === "none") return;
    const r = box.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return;
    const t = this._borderThickness(box);
    const far = fade === "left" ? "right" : "left";
    const out = far === "right" ? r.right : r.left;
    const topH = this._cap("od-top-h");
    const topV = this._cap("od-top-v");
    const botH = this._cap("od-bot-h");
    if (!topH || !topV || !botH) return;
    // Accents are as thick as the box's border lines they continue.
    for (const line of [topH, topV, botH]) line.style.setProperty("--overdraw-thickness", `${t}px`);
    // Horizontal accents: continue the top & bottom borders PAST the far edge.
    if (far === "right") {
      topH.style.left = `${out}px`;
      botH.style.left = `${out}px`;
    } else {
      topH.style.right = `${window.innerWidth - out}px`;
      botH.style.right = `${window.innerWidth - out}px`;
    }
    // Align each horizontal accent's span with the border it continues: the
    // top border spans [r.top, r.top + t]; the bottom spans [r.bottom - t, r.bottom].
    topH.style.top = `${r.top}px`;
    botH.style.top = `${r.bottom - t}px`;
    // Vertical accent: rises from the top border, flush with the far edge's
    // border span, so it reads as the box's solid edge continuing up.
    topV.style.left = `${far === "right" ? out - t : out}px`;
    topV.style.bottom = `${window.innerHeight - r.top}px`;
    for (const line of [topH, topV, botH]) line.style.opacity = "1";
  }

  private _cap(cls: string): HTMLElement | null {
    return this.shadowRoot?.querySelector<HTMLElement>(`.${cls}`) ?? null;
  }

  render() {
    const box = this._findDropBox();
    const fade = box?.getAttribute("fade");
    if (!fade || fade === "none") return nothing;
    const far = fade === "left" ? "right" : "left";
    return html`
      <div class="od-layer" aria-hidden="true">
        <overdraw-line class="od-cap od-top-h" dir=${far}></overdraw-line>
        <overdraw-line class="od-cap od-top-v" dir="up"></overdraw-line>
        <overdraw-line class="od-cap od-bot-h" dir=${far}></overdraw-line>
      </div>
    `;
  }
}

if (!customElements.get("drop-box-overdraw")) {
  customElements.define("drop-box-overdraw", DropBoxOverdraw);
}

declare global {
  interface HTMLElementTagNameMap {
    "drop-box-overdraw": DropBoxOverdraw;
  }
}
