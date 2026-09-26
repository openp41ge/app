/**
 * <drag-line-overdraw> — the overdraw companion to a <drag-line>.
 *
 * A <drag-line> is the translucent blue vertical line you hover over to drag
 * a sidebar / window boundary. This component renders an <overdraw-line>-style
 * accent at the TOP of that drag line: the same colour and the SAME WIDTH as
 * the drag line, positioned over it, extending upward past the panel boundary
 * and INTO the apps top bar, fading out. It appears only while the drag line
 * is visible (hovered / dragging), so it reads as the drag line continuing up
 * into the top bar.
 *
 * The line is `position: fixed`, so it escapes any `overflow: hidden` panel
 * and paints over the top bar; its `left`/`top` track the drag line's viewport
 * rect. Because the drag line can move while it is being dragged (a sidebar
 * resize), the component re-places itself every animation frame while shown —
 * cheap, since it only runs while the line is visible and only reads one rect.
 *
 * The consumer places it next to its <drag-line> (in the same resize notch):
 *
 * ```html
 * <drag-line orientation="vertical"></drag-line>
 * <drag-line-overdraw></drag-line-overdraw>
 * ```
 *
 * It resolves the sibling <drag-line> automatically, mirrors its `show`
 * attribute (fading in/out with the same 0.12s ease), and hides entirely (via
 * the ancestor's `display: none`) when the owning panel is closed.
 *
 * Styling hooks on the host:
 *  - `--drop-color`            — line colour; mirrors the drag line's.
 *  - `--drop-width`            — line width; mirrors the drag line's.
 *  - `--drop-overdraw-length`  — how far it extends up (px).
 */

import { LitElement, html, css } from "lit";

export class DragLineOverdraw extends LitElement {
  static styles = css`
    :host {
      display: block;
      /* Defaults mirror <drag-line>; consumers may override to match. */
      --drop-color: rgba(74, 158, 255, 0.7);
      --drop-width: 3px;
      --drop-overdraw-length: 14px;
    }
    .od {
      position: fixed;
      left: 0;
      top: 0;
      width: var(--drop-width);
      height: var(--drop-overdraw-length);
      background: linear-gradient(to top, var(--drop-color) 40%, transparent 100%);
      opacity: 0;
      transition: opacity 0.12s ease;
      pointer-events: none;
      /* Above page chrome (grid tabs, sidebars, top bar) but below the drawer
         host (z-index 1001), so an open drawer covers it. */
      z-index: 999;
    }
  `;

  private _dragLine: HTMLElement | null = null;
  private _raf = 0;

  connectedCallback(): void {
    super.connectedCallback();
    this._retargetObserver();
    this._sync();
  }

  // The `.od` line may not have rendered yet when `connectedCallback` first
  // syncs (the shadow root's first render happens after connect), so re-sync
  // once the line exists — covers the case where `show` is already set.
  firstUpdated(): void {
    this._sync();
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this._stopLoop();
    this._observer?.disconnect();
    this._observer = null;
  }

  private _observer: MutationObserver | null = null;

  private _findDragLine(): HTMLElement | null {
    // Re-query the live sibling each time (do NOT cache): the owning panel may
    // re-render and replace the <drag-line>, and a stale reference would leave
    // the observer watching a detached element (so `show` changes are missed).
    return this.parentElement?.querySelector<HTMLElement>("drag-line") ?? null;
  }

  /** Point the observer at the current sibling <drag-line>, re-targeting if it
   *  has been replaced. Also watches the parent's child list so a panel
   *  re-render that recreates the <drag-line> is detected. No-op while the
   *  target is unchanged. */
  private _retargetObserver(): void {
    const dragLine = this._findDragLine();
    if (dragLine === this._dragLine && this._observer) return;
    this._observer?.disconnect();
    this._observer = null;
    this._dragLine = dragLine;
    if (typeof MutationObserver === "undefined") return;
    this._observer = new MutationObserver(() => this._sync());
    // Catch a sibling <drag-line> being added/removed (a panel re-render that
    // recreates it) so the observer is re-pointed at the live element.
    const parent = this.parentElement;
    if (parent) this._observer.observe(parent, { childList: true });
    if (dragLine) this._observer.observe(dragLine, { attributes: true, attributeFilter: ["show"] });
  }

  /** Mirror the drag line's visibility: shown ⇒ re-place each frame (it can
   *  move while dragging); hidden ⇒ fade out and stop the frame loop. */
  private _sync(): void {
    this._retargetObserver();
    const dragLine = this._dragLine;
    const od = this._od;
    if (!od) return;
    const shown = !!dragLine?.hasAttribute("show");
    od.style.opacity = shown ? "1" : "0";
    if (shown) {
      // Place immediately (a throttled/backgrounded tab may not run the frame
      // loop promptly), then keep tracking for drag movement.
      this._place();
      this._startLoop();
    } else {
      this._stopLoop();
    }
  }

  private _startLoop(): void {
    if (this._raf) return;
    if (typeof requestAnimationFrame !== "function") {
      // No frame loop available (e.g. jsdom unit tests) — place once so the
      // position is still computed on show.
      this._place();
      return;
    }
    const tick = (): void => {
      this._place();
      this._raf = requestAnimationFrame(tick);
    };
    this._raf = requestAnimationFrame(tick);
  }

  private _stopLoop(): void {
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = 0;
  }

  /** Align the overdraw over the drag line's top edge and drive it upward. */
  private _place(): void {
    const dragLine = this._findDragLine();
    const od = this._od;
    if (!dragLine || !od) return;
    const r = dragLine.getBoundingClientRect();
    // Track the drag line's actual width and position so the overdraw reads
    // as the drag line continuing up (whatever width it is drawn at).
    od.style.width = `${r.width}px`;
    od.style.left = `${r.left}px`;
    od.style.top = `${r.top - od.offsetHeight}px`;
  }

  private get _od(): HTMLElement | null {
    return this.shadowRoot?.querySelector<HTMLElement>(".od") ?? null;
  }

  render() {
    return html`<div class="od" aria-hidden="true"></div>`;
  }
}

if (!customElements.get("drag-line-overdraw")) {
  customElements.define("drag-line-overdraw", DragLineOverdraw);
}

declare global {
  interface HTMLElementTagNameMap {
    "drag-line-overdraw": DragLineOverdraw;
  }
}
