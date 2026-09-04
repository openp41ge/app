/**
 * OverlayScrollbar — a reusable, native-hiding overlay scrollbar.
 *
 * Unlike a native `::-webkit-scrollbar` (which reserves layout gutter and can't
 * float over content), this draws its own track + thumb as an absolutely
 * positioned overlay that floats over the content:
 *
 * - Hides the native scrollbar on the scroll target (`scrollbar-width: none`).
 * - Renders a track (optionally fading in) and a thumb positioned along it.
 * - The thumb is thin and translucent, has SQUARE corners (no border radius),
 *   and carries a subtle faded/transparent inner border on the content-facing
 *   edge (left border for a vertical bar, top border for a horizontal bar).
 * - The thumb springs thicker (and brighter) on hover / active / drag, using an
 *   overshooting cubic-bezier for a spring feel.
 *
 * The track/thumb are placed in a `container` element (which must be
 * `position: relative` and must NOT be the scrolling target), so they never
 * scroll away with the content.  If no container is supplied, the component
 * wraps the scroll target in a relative wrapper instead.
 *
 * Geometry is pure and exported for unit testing (`computeThumbLength`,
 * `computeThumbPosition`).
 *
 * Usage:
 *   const sb = OverlayScrollbar.attach(trackEl, { container: wrapper, axis: "vertical" });
 *   ...later...
 *   sb.destroy();
 */

export type ScrollbarAxis = "vertical" | "horizontal" | "both";

export interface OverlayScrollbarOptions {
  /** Scroll axes to render.  Default: "vertical". */
  axis?: ScrollbarAxis;
  /** Presented thickness of the thumb at rest (px).  Default: 6. */
  size?: number;
  /** Thickness the thumb animates to on hover/active/drag (px).  Default: 10. */
  hoverSize?: number;
  /** Shortest the thumb may be rendered (px).  Default: 24. */
  minThumbSize?: number;
  /** Element the track/thumb are placed in.  Must be position:relative and not
   *  the scroll target.  When omitted, the scroll target is wrapped. */
  container?: HTMLElement;
  /** CSS inset for the track within the container (e.g. `{ top: "44px" }` to
   *  start below a header).  Default: all 0. */
  inset?: { top?: string; right?: string; bottom?: string; left?: string };
  /** Stacking order of the track (default 20).  Pass a low value when the track
   *  must sit under sibling overlays (e.g. drawers/modals). */
  zIndex?: number;
  /** Thumb fill colour (default: translucent white).  Set CSS-friendly rgba/hex. */
  thumbColor?: string;
  /** Thumb fill colour on hover / active / drag (default: brighter translucent white). */
  thumbHoverColor?: string;
}

/** A spring-like, overshooting CSS easing for the thicken/brighter animation. */
export const SPRING_EASE = "cubic-bezier(0.34, 1.56, 0.64, 1)";

const DEFAULT_SIZE = 6;
const DEFAULT_HOVER_SIZE = 10;
const DEFAULT_MIN_THUMB = 24;
const DEFAULT_THUMB_COLOR = "rgba(255,255,255,0.22)";
const DEFAULT_THUMB_HOVER_COLOR = "rgba(255,255,255,0.42)";

// ─── Pure geometry (unit-testable) ───────────────────────────────────────

/**
 * Length of the thumb along the track.
 * `viewport`/`scrollLen` are the scroll target's visible and full content
 * lengths along the axis.  The thumb is proportional to the visible fraction,
 * clamped to at least `minThumbSize`.
 */
export function computeThumbLength(
  viewport: number,
  scrollLen: number,
  trackLen: number,
  minThumbSize: number = DEFAULT_MIN_THUMB,
): number {
  if (viewport <= 0 || scrollLen <= 0 || scrollLen <= viewport) return trackLen;
  const len = (viewport / scrollLen) * trackLen;
  // Clamp to the track length so a tiny track never overflows the thumb.
  return Math.min(trackLen, Math.max(minThumbSize, len));
}

/**
 * Offset of the thumb along the track, proportional to the scroll position.
 * `scrollPos` ranges over `[0, scrollLen - viewport]`, mapped onto the
 * `[0, trackLen - thumbLen]` travel of the thumb.
 */
export function computeThumbPosition(
  scrollPos: number,
  scrollLen: number,
  viewport: number,
  trackLen: number,
  thumbLen: number,
): number {
  const travel = scrollLen - viewport;
  if (travel <= 0) return 0;
  const maxOffset = trackLen - thumbLen;
  if (maxOffset <= 0) return 0;
  return (Math.max(0, scrollPos) / travel) * maxOffset;
}

// ─── Component ───────────────────────────────────────────────────────────

interface AxisState {
  track: HTMLElement;
  thumb: HTMLElement;
}

export class OverlayScrollbar {
  private _target: HTMLElement;
  private _wrap: HTMLElement | null = null;
  private _container: HTMLElement;
  private _axis: ScrollbarAxis;
  private _size: number;
  private _hoverSize: number;
  private _minThumbSize: number;
  private _inset: { top?: string; right?: string; bottom?: string; left?: string };
  private _zIndex: number;
  private _thumbColor: string;
  private _thumbHoverColor: string;
  private _axes: Partial<Record<ScrollbarAxis, AxisState>> = {};
  private _destroyed = false;
  private _onScroll: () => void = () => {};
  private _ro: ResizeObserver | null = null;
  private _mo: MutationObserver | null = null;
  private _raf = 0;

  private constructor(target: HTMLElement, container: HTMLElement, options: OverlayScrollbarOptions) {
    this._target = target;
    this._container = container;
    this._axis = options.axis ?? "vertical";
    this._size = options.size ?? DEFAULT_SIZE;
    this._hoverSize = options.hoverSize ?? DEFAULT_HOVER_SIZE;
    this._minThumbSize = options.minThumbSize ?? DEFAULT_MIN_THUMB;
    this._inset = options.inset ?? {};
    this._zIndex = options.zIndex ?? 20;
    this._thumbColor = options.thumbColor ?? DEFAULT_THUMB_COLOR;
    this._thumbHoverColor = options.thumbHoverColor ?? DEFAULT_THUMB_HOVER_COLOR;
  }

  /**
   * Attach an overlay scrollbar to `target`.
   * When `options.container` is omitted, `target` is wrapped in a relative
   * wrapper so the track/thumb have a non-scrolling containing block.
   */
  static attach(target: HTMLElement, options: OverlayScrollbarOptions = {}): OverlayScrollbar {
    let container = options.container;
    let wrap: HTMLElement | null = null;
    if (!container) {
      wrap = document.createElement("div");
      wrap.style.position = "relative";
      wrap.style.overflow = "hidden";
      // Keep the target's box for common flex/absolute placements.
      wrap.style.flex = "1";
      wrap.style.minHeight = "0";
      wrap.style.height = "100%";
      const parent = target.parentElement;
      if (parent) {
        parent.insertBefore(wrap, target);
        wrap.appendChild(target);
      } else {
        wrap.appendChild(target);
      }
      container = wrap;
    }
    const sb = new OverlayScrollbar(target, container, options);
    sb._wrap = wrap;
    sb._mount();
    return sb;
  }

  private _mount(): void {
    // Hide the native scrollbar on the scroll target.
    this._target.style.scrollbarWidth = "none";
    this._target.setAttribute("data-overlay-scrollbar", "");
    // Scoped CSS to hide webkit scrollbars on this exact element.
    this._injectScopedStyles();

    if (this._axis === "vertical" || this._axis === "both") this._buildAxis("vertical");
    if (this._axis === "horizontal" || this._axis === "both") this._buildAxis("horizontal");

    this._onScroll = () => this.update();
    this._target.addEventListener("scroll", this._onScroll, { passive: true });
    this._ro = new ResizeObserver(() => this.update());
    this._ro.observe(this._target);
    // Content can grow/shrink without the scroll box resizing (e.g. child
    // re-renders), which changes scrollHeight/clientHeight but not the target's
    // box. Watch the subtree so the thumb stays in sync.
    this._mo = new MutationObserver(() => {
      if (this._raf) return;
      this._raf = requestAnimationFrame(() => {
        this._raf = 0;
        this.update();
      });
    });
    this._mo.observe(this._target, { childList: true, subtree: true });
    this.update();
  }

  private _injectScopedStyles(): void {
    const id = "overlay-scrollbar-style";
    if (document.getElementById(id)) return;
    const s = document.createElement("style");
    s.id = id;
    s.textContent = `
      [data-overlay-scrollbar]::-webkit-scrollbar { width: 0 !important; height: 0 !important; }
      .os-track { position: absolute; z-index: 20; pointer-events: auto; box-sizing: border-box; }
      /* Faded/transparent content-facing edge on the WHOLE scroll zone (track). */
      .os-track--v { border-left: 1px solid rgba(128,128,128,0.25); }
      .os-track--h { border-top: 1px solid rgba(128,128,128,0.25); }
      .os-thumb {
        position: absolute; background: var(--os-thumb, ${DEFAULT_THUMB_COLOR}); border-radius: 0;
        box-sizing: border-box; pointer-events: auto; cursor: default;
        transition: width ${SPRING_EASE} 0.18s, height ${SPRING_EASE} 0.18s,
                    background-color 0.15s ease, left ${SPRING_EASE} 0.18s, top ${SPRING_EASE} 0.18s;
      }
      .os-thumb:hover, .os-thumb.dragging { background: var(--os-thumb-hover, ${DEFAULT_THUMB_HOVER_COLOR}); }
      .os-track--v .os-thumb {
        height: 100%; right: 0;
        width: var(--os-size, ${this._size}px);
      }
      .os-track--v:hover .os-thumb, .os-track--v .os-thumb.dragging { width: var(--os-hover, ${this._hoverSize}px); }
      .os-track--h .os-thumb {
        width: 100%; bottom: 0;
        height: var(--os-size, ${this._size}px);
      }
      .os-track--h:hover .os-thumb, .os-track--h .os-thumb.dragging { height: var(--os-hover, ${this._hoverSize}px); }
    `;
    document.head.appendChild(s);
  }

  private _buildAxis(axis: ScrollbarAxis): void {
    const track = document.createElement("div");
    track.className = `os-track os-track--${axis === "vertical" ? "v" : "h"}`;
    track.style.zIndex = String(this._zIndex);
    const ins = this._inset;
    if (axis === "vertical") {
      Object.assign(track.style, {
        top: ins.top ?? "0",
        right: ins.right ?? "0",
        bottom: ins.bottom ?? "0",
        width: `${this._hoverSize}px`,
      });
    } else {
      Object.assign(track.style, {
        left: ins.left ?? "0",
        right: ins.right ?? "0",
        bottom: ins.bottom ?? "0",
        height: `${this._hoverSize}px`,
      });
    }
    // Thickness is driven by CSS vars so the hover/active spring can animate it.
    track.style.setProperty("--os-size", `${this._size}px`);
    track.style.setProperty("--os-hover", `${this._hoverSize}px`);
    // Thumb colour is a var so each instance can theme its thumb (e.g. the file
    // editor matches its dark .fe-hscroll bar while the window manager stays
    // translucent white).
    track.style.setProperty("--os-thumb", this._thumbColor);
    track.style.setProperty("--os-thumb-hover", this._thumbHoverColor);
    const thumb = document.createElement("div");
    thumb.className = "os-thumb";
    thumb.setAttribute("data-os-axis", axis);
    track.appendChild(thumb);
    this._container.appendChild(track);
    this._axes[axis] = { track, thumb };

    thumb.addEventListener("pointerdown", (e: PointerEvent) => this._onThumbPointerDown(e, axis));
    track.addEventListener("pointerdown", (e: PointerEvent) => {
      if (e.target !== track) return;
      // Click the track → jump the scroll position toward the click.
      this._onTrackClick(e, axis);
    });
  }

  private _onThumbPointerDown(e: PointerEvent, axis: ScrollbarAxis): void {
    e.preventDefault();
    e.stopPropagation();
    const state = this._axes[axis];
    if (!state) return;
    state.thumb.classList.add("dragging");
    const rect = state.track.getBoundingClientRect();
    const startPos = axis === "vertical" ? e.clientY : e.clientX;
    const startScroll = axis === "vertical" ? this._target.scrollTop : this._target.scrollLeft;
    const onMove = (ev: PointerEvent) => {
      const cur = axis === "vertical" ? ev.clientY : ev.clientX;
      const trackLen = axis === "vertical" ? rect.height : rect.width;
      const thumbLen = axis === "vertical" ? state.thumb.offsetHeight : state.thumb.offsetWidth;
      const travel = trackLen - thumbLen;
      if (travel <= 0) return;
      const frac = (cur - startPos) / travel;
      const scrollLen =
        (axis === "vertical" ? this._target.scrollHeight : this._target.scrollWidth) -
        (axis === "vertical" ? this._target.clientHeight : this._target.clientWidth);
      const next = Math.max(0, Math.min(scrollLen, startScroll + frac * scrollLen));
      if (axis === "vertical") this._target.scrollTop = next;
      else this._target.scrollLeft = next;
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      state.thumb.classList.remove("dragging");
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  private _onTrackClick(e: PointerEvent, axis: ScrollbarAxis): void {
    e.preventDefault();
    const state = this._axes[axis];
    if (!state) return;
    const rect = state.track.getBoundingClientRect();
    const startPos = axis === "vertical" ? e.clientY : e.clientX;
    const trackLen = axis === "vertical" ? rect.height : rect.width;
    const thumbLen = axis === "vertical" ? state.thumb.offsetHeight : state.thumb.offsetWidth;
    const travel = trackLen - thumbLen;
    if (travel <= 0) return;
    const thumbPos = axis === "vertical"
      ? state.thumb.offsetTop - state.track.offsetTop
      : state.thumb.offsetLeft - state.track.offsetLeft;
    const frac = (startPos - state.track.offsetTop - thumbPos) / travel;
    const targetScroll =
      (axis === "vertical" ? this._target.scrollHeight : this._target.scrollWidth) -
      (axis === "vertical" ? this._target.clientHeight : this._target.clientWidth);
    const next = frac * targetScroll;
    if (axis === "vertical") this._target.scrollTop = Math.max(0, next);
    else this._target.scrollLeft = Math.max(0, next);
  }

  /** Recompute the thumb length + position from the current scroll geometry. */
  update(): void {
    if (this._destroyed) return;
    this._paintAxis("vertical");
    this._paintAxis("horizontal");
  }

  private _paintAxis(axis: ScrollbarAxis): void {
    const state = this._axes[axis];
    if (!state) return;
    const { track, thumb } = state;
    if (axis === "vertical") {
      const viewport = this._target.clientHeight;
      const scrollLen = this._target.scrollHeight;
      const trackLen = track.clientHeight;
      if (scrollLen <= viewport) {
        thumb.style.display = "none";
        track.style.display = "none";
        return;
      }
      thumb.style.display = "";
      track.style.display = "";
      const len = computeThumbLength(viewport, scrollLen, trackLen, this._minThumbSize);
      const pos = computeThumbPosition(this._target.scrollTop, scrollLen, viewport, trackLen, len);
      thumb.style.height = `${Math.max(this._minThumbSize, len)}px`;
      thumb.style.top = `${pos}px`;
    } else {
      const viewport = this._target.clientWidth;
      const scrollLen = this._target.scrollWidth;
      const trackLen = track.clientWidth;
      if (scrollLen <= viewport) {
        thumb.style.display = "none";
        track.style.display = "none";
        return;
      }
      thumb.style.display = "";
      track.style.display = "";
      const len = computeThumbLength(viewport, scrollLen, trackLen, this._minThumbSize);
      const pos = computeThumbPosition(this._target.scrollLeft, scrollLen, viewport, trackLen, len);
      thumb.style.width = `${Math.max(this._minThumbSize, len)}px`;
      thumb.style.left = `${pos}px`;
    }
  }

  /** Clean up listeners, observers, and any wrapper we created. */
  destroy(): void {
    if (this._destroyed) return;
    this._destroyed = true;
    this._target.removeEventListener("scroll", this._onScroll);
    this._ro?.disconnect();
    this._ro = null;
    this._mo?.disconnect();
    this._mo = null;
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = 0;
    for (const key of Object.keys(this._axes) as ScrollbarAxis[]) {
      const state = this._axes[key];
      if (state) state.track.remove();
    }
    this._axes = {};
    this._target.removeAttribute("data-overlay-scrollbar");
    if (this._wrap && this._wrap.parentElement) {
      // Un-wrap: move the target back into the wrapper's place.
      const parent = this._wrap.parentElement;
      parent?.insertBefore(this._target, this._wrap);
      this._wrap.remove();
    }
  }
}
