/**
 * <overdraw-line> — a 1px fade-out accent line that extends a box's border
 * past its corners (or a divider's ends) toward an outer tip.
 *
 * The line is a single 1px stroke that is solid where it meets the box border
 * and fades to transparent over its length. Its length is taken from a
 * DOCUMENT-WIDE ordinal (`overdrawLengthForOrdinal`) — not from a local
 * `:nth-child` index, which only varies within one shadow root / sibling
 * group and therefore repeated the same lengths across components. The global
 * ordinal means the next drawn line anywhere in the app gets the next varied
 * length, so nearby lines look uneven (hand-drawn) rather than uniform.
 *
 * Once drawn, the resolved length is frozen onto the host inline, so it never
 * changes afterwards — re-renders, re-ordering, and streaming all keep the
 * same line the same length. The ordinal is assigned only on first draw, so
 * the sequence is stable: same draw order ⇒ same lengths every time.
 *
 * The host is `position: absolute`, so the consumer must give it a positioned
 * ancestor and place it (a `position: relative` box). `dir` is the direction
 * the line fades toward; the opposite (solid) edge should sit on the box
 * border so the line reads as a continuation of that border.
 *
 * ```html
 * <overdraw-line dir="left" corner="tl"></overdraw-line>
 * <overdraw-line dir="up"   corner="tl"></overdraw-line>
 * ```
 * (`corner` is a free-form hint the consumer may use to position the host.)
 *
 * Styling hooks on the host:
 *  - `--overdraw-color`  — line color; defaults to `var(--border-color)`.
 *  - `--overdraw-length` — length (px); normally set on first draw, but can
 *                          be overridden per-host.
 */

import { LitElement, html, css } from "lit";
import { property } from "lit/decorators.js";

export type OverdrawDirection = "left" | "right" | "up" | "down";

/** Length cycle in px. Deliberately uneven so consecutive ordinals differ;
 *  every value is in a narrow 4–10px band so lines read as one style. */
export const OVERDRAW_LENGTHS = [4, 8, 5, 10, 6, 9, 7] as const;

/** Deterministically map a draw ordinal to a length. Same ordinal ⇒ same
 *  length, every time; consecutive ordinals always differ, so a run of lines
 *  looks uneven rather than uniform. Pure, so it is directly testable. */
export function overdrawLengthForOrdinal(ordinal: number): number {
  const n = ((ordinal % OVERDRAW_LENGTHS.length) + OVERDRAW_LENGTHS.length) % OVERDRAW_LENGTHS.length;
  return OVERDRAW_LENGTHS[n];
}

/** Document-wide counter: the next drawn line anywhere takes the next ordinal,
 *  so indices group across every component rather than restarting per shadow
 *  root. (Kept in the module, so it is shared by all bundled instances.) */
let nextOrdinal = 0;

export class OverdrawLine extends LitElement {
  /** Direction the line fades toward. The opposite (solid) end anchors on the box border. */
  @property({ reflect: true }) dir: OverdrawDirection = "right";

  static styles = css`
    :host {
      position: absolute;
      display: block;
      pointer-events: none;
      box-sizing: content-box;
      --overdraw-color: var(--border-color, #2a2a2a);
      /* Pre-draw default; replaced with the ordinal-derived length on first draw. */
      --overdraw-length: 6px;
      /* Perpendicular thickness (the solid stroke width). Default 1px; an
         accent that must match a thicker box border can override it (e.g.
         the drop-box indicator's 3px border). */
      --overdraw-thickness: 1px;
    }

    :host([dir="left"]),
    :host([dir="right"]) {
      width: var(--overdraw-length);
      height: var(--overdraw-thickness);
    }
    :host([dir="up"]),
    :host([dir="down"]) {
      width: var(--overdraw-thickness);
      height: var(--overdraw-length);
    }

    :host([dir="left"]) {
      background: linear-gradient(
        to left,
        var(--overdraw-color) 40%,
        transparent 100%
      );
    }
    :host([dir="right"]) {
      background: linear-gradient(
        to right,
        var(--overdraw-color) 40%,
        transparent 100%
      );
    }
    :host([dir="up"]) {
      background: linear-gradient(
        to top,
        var(--overdraw-color) 40%,
        transparent 100%
      );
    }
    :host([dir="down"]) {
      background: linear-gradient(
        to bottom,
        var(--overdraw-color) 40%,
        transparent 100%
      );
    }
  `;

  private _frozen = false;
  private _ordinal = -1;

  protected firstUpdated(): void {
    // Assign a document-wide ordinal once and pin the resulting length inline
    // so the line never changes afterwards (consistent across re-renders, and
    // the sequence is deterministic for the same draw order).
    if (this._frozen) return;
    this._frozen = true;
    if (this._ordinal < 0) this._ordinal = nextOrdinal++;
    const length = overdrawLengthForOrdinal(this._ordinal);
    this.style.setProperty("--overdraw-length", `${length}px`);
  }

  render() {
    return html``;
  }
}

if (!customElements.get("overdraw-line")) {
  customElements.define("overdraw-line", OverdrawLine);
}

declare global {
  interface HTMLElementTagNameMap {
    "overdraw-line": OverdrawLine;
  }
}
