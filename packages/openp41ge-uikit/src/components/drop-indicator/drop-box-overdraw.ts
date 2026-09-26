/**
 * <drop-box-overdraw> — the overdraw companion to a <drop-box>.
 *
 * A <drop-box> is the blue-bordered drop-zone / anchor indicator. This
 * component renders the overdraw accents that make the box read as a
 * draggable anchor region. The accents depend on whether the box is a SOLID
 * landing target or a faded, directional anchor:
 *
 *   - A SOLID box (no `fade`), e.g. the grid's drop target: the box must stay
 *     fully visible, so it is never masked — instead its border bleeds
 *     OUTWARD at ALL FOUR corners. Each corner draws the two lines that
 *     continue the borders meeting there (the top/bottom border extending
 *     horizontally past the corner, the left/right border extending
 *     vertically past the corner), fading out into the surrounding chrome.
 *
 *   - A FADED box (`fade="left"`/"right"), e.g. the settings drawer's
 *     edge-snap anchor: the box melts toward the drawer and its three accents
 *     sit on the far (solid) edge — a horizontal accent continuing the top
 *     border past it, a vertical accent rising from the top corner, and a
 *     horizontal accent continuing the bottom border past it.
 *
 * The accents are <overdraw-line>s rendered in a fixed, viewport-wide layer,
 * so they escape any `overflow: hidden` panel (the grid wrapper) and paint
 * over the adjacent region / the top bar. They sit in the same stacking
 * context as the drop-box (its companion sibling, so the drop-box's own fade
 * `mask` never affects them).
 *
 * The consumer places it next to its <drop-box> (in the same host):
 *
 * ```html
 * <drop-box></drop-box>
 * <drop-box-overdraw></drop-box-overdraw>
 * ```
 *
 * It resolves the sibling <drop-box>` automatically (reads its `fade`),
 * places its accents against the box's rect, and re-places them whenever the
 * box's geometry changes — a drag can move the landing box in place (from a
 * full cell to a split half, or slide it to a new split position in the same
 * column) without re-creating the overdraw, so the accents must follow. A
 * ResizeObserver would only catch size changes, so the box's rect is tracked
 * each frame and the accents re-place on any change (size OR position). The
 * accents are hidden entirely when the owning host unmounts the pair.
 *
 * Styling hooks on the host:
 *  - `--drop-color` — accent colour; defaults to the shared drop indicator blue.
 *  - `--drop-border` — accent thickness (px); defaults to 3px so the accents
 *    are as wide as the drop-box's border lines they continue.
 */

import { LitElement, css, html, unsafeCSS } from "lit";
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
    this._startLoop();
  }

  disconnectedCallback(): void {
    if (this._rafId) cancelAnimationFrame(this._rafId);
    this._rafId = 0;
    super.disconnectedCallback();
  }

  private _rafId = 0;
  private _lastRect = "";

  /**
   * Track the sibling <drop-box>'s rect every frame and re-place the accents
   * on ANY change. The box can stay in the SAME column across some drop
   * transitions while moving in place — e.g. sliding across a column boundary
   * between two split halves keeps the landing box in the same column but
   * shifts its position (same size, so a ResizeObserver would NOT fire), and
   * moving from a cell-centre target to a split target resizes it from a full
   * cell to a half-cell. The overdraw is not re-created in either case (only
   * re-created when the landing column changes), so it must re-place itself
   * when the box moves or resizes. A ResizeObserver alone misses the
   * position-only shifts, so track the rect per frame instead. The loop only
   * runs while mounted and is cancelled on disconnect; where
   * requestAnimationFrame is unavailable (jsdom) the one-time `firstUpdated`
   * placement still applies.
   */
  private _startLoop(): void {
    if (typeof requestAnimationFrame !== "function") return;
    this._rafId = requestAnimationFrame(this._tick);
  }

  private _tick = (): void => {
    this._rafId = requestAnimationFrame(this._tick);
    const box = this._findDropBox();
    if (!box) return;
    const r = box.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return;
    const key = `${r.left}|${r.top}|${r.width}|${r.height}`;
    if (key === this._lastRect) return;
    this._lastRect = key;
    this._place();
  };

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
    const r = box.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return;
    const t = this._borderThickness(box);
    const fade = box.getAttribute("fade");
    // A solid box (no fade) is a landing target that must stay fully visible,
    // so it is never masked: its border bleeds outward at all four corners.
    if (!fade || fade === "none") {
      this._placeCorners(r, t);
      return;
    }
    const far = fade === "left" ? "right" : "left";
    const out = far === "right" ? r.right : r.left;
    const topH = this._cap("od-top-h");
    const topV = this._cap("od-top-v");
    const botH = this._cap("od-bot-h");
    if (!topH || !topV || !botH) return;
    // Accents are as thick as the box's border lines they continue.
    for (const line of [topH, topV, botH]) line.style.setProperty("--overdraw-thickness", `${t}px`);
    // Longer, smoother fade-out: these accents are as wide as the box's 3px
    // border, so a short fade (the default 4-10px length with a 40% solid
    // hold) reads as a hard line. Give them a longer length scaled to the
    // stroke and a smaller solid hold, so they melt away gradually. The length
    // is pre-set here (before/over the ordinal-derived length) so it stays.
    const fadeLen = `${Math.max(Math.round(t * 5), 16)}px`;
    for (const line of [topH, topV, botH]) {
      line.style.setProperty("--overdraw-length", fadeLen);
      line.style.setProperty("--overdraw-hold", "30%");
    }
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

  /**
   * Place the four-corner accents on a SOLID (non-faded) box. Each corner
   * draws the two lines that continue the borders meeting there, extending
   * OUTWARD and fading into the surrounding chrome:
   *
   *   - tl: top border → left (dir=left);        left border → up (dir=up)
   *   - tr: top border → right (dir=right);      right border → up (dir=up)
   *   - bl: bottom border → left (dir=left);     left border → down (dir=down)
   *   - br: bottom border → right (dir=right);   right border → down (dir=down)
   *
   * Each horizontal accent is aligned with the horizontal border span it
   * continues ([r.top, r.top+t] or [r.bottom-t, r.bottom]); each vertical
   * accent is aligned with the vertical border span ([r.left, r.left+t] or
   * [r.right-t, r.right]) and starts at the box edge it extends past.
   */
  private _placeCorners(r: DOMRect, t: number): void {
    const tlH = this._cap("od-tl-h");
    const tlV = this._cap("od-tl-v");
    const trH = this._cap("od-tr-h");
    const trV = this._cap("od-tr-v");
    const blH = this._cap("od-bl-h");
    const blV = this._cap("od-bl-v");
    const brH = this._cap("od-br-h");
    const brV = this._cap("od-br-v");
    if (!tlH || !tlV || !trH || !trV || !blH || !blV || !brH || !brV) return;
    const lines = [tlH, tlV, trH, trV, blH, blV, brH, brV];
    for (const line of lines) {
      line.style.setProperty("--overdraw-thickness", `${t}px`);
      // Slightly shorter than the single far-edge accents: four corners bleed
      // in many directions at once, so a modest length keeps it from crowding.
      line.style.setProperty("--overdraw-length", `${Math.max(Math.round(t * 4), 14)}px`);
      line.style.setProperty("--overdraw-hold", "30%");
    }
    // Top border continues horizontally past the two top corners.
    tlH.style.top = `${r.top}px`;
    tlH.style.right = `${window.innerWidth - r.left}px`;
    trH.style.top = `${r.top}px`;
    trH.style.left = `${r.right}px`;
    // Bottom border continues horizontally past the two bottom corners.
    blH.style.top = `${r.bottom - t}px`;
    blH.style.right = `${window.innerWidth - r.left}px`;
    brH.style.top = `${r.bottom - t}px`;
    brH.style.left = `${r.right}px`;
    // Left border continues vertically past the two left corners.
    tlV.style.left = `${r.left}px`;
    tlV.style.bottom = `${window.innerHeight - r.top}px`;
    blV.style.left = `${r.left}px`;
    blV.style.top = `${r.bottom}px`;
    // Right border continues vertically past the two right corners.
    trV.style.left = `${r.right - t}px`;
    trV.style.bottom = `${window.innerHeight - r.top}px`;
    brV.style.left = `${r.right - t}px`;
    brV.style.top = `${r.bottom}px`;
    for (const line of lines) line.style.opacity = "1";
  }

  private _cap(cls: string): HTMLElement | null {
    return this.shadowRoot?.querySelector<HTMLElement>(`.${cls}`) ?? null;
  }

  render() {
    const box = this._findDropBox();
    const fade = box?.getAttribute("fade");
    // A solid box gets the four-corner bleed; a faded (directional) box gets
    // the far-edge accents (the drawer's slide-to-fill anchor).
    if (!fade || fade === "none") {
      return html`
        <div class="od-layer" aria-hidden="true">
          <overdraw-line class="od-corner od-tl-h" dir="left"></overdraw-line>
          <overdraw-line class="od-corner od-tl-v" dir="up"></overdraw-line>
          <overdraw-line class="od-corner od-tr-h" dir="right"></overdraw-line>
          <overdraw-line class="od-corner od-tr-v" dir="up"></overdraw-line>
          <overdraw-line class="od-corner od-bl-h" dir="left"></overdraw-line>
          <overdraw-line class="od-corner od-bl-v" dir="down"></overdraw-line>
          <overdraw-line class="od-corner od-br-h" dir="right"></overdraw-line>
          <overdraw-line class="od-corner od-br-v" dir="down"></overdraw-line>
        </div>
      `;
    }
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
