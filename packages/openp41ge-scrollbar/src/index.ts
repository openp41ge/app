/**
 * Openp41geScrollbar — consistent custom scrollbars for all scrollable
 * containers in Openp41ge.
 *
 * Features:
 * - Classic (non-overlay) scrollbars on all platforms via custom
 *   `::-webkit-scrollbar` styles with square corners and dark colours.
 * - Both vertical and horizontal scrollbar support.
 * - Optional auto-hide behaviour (replaces the older ScrollbarActivity
 *   overlay-strip approach).
 * - Works inside shadow roots: pass `styleTarget: shadowRoot` so the
 *   shared styles are injected into the shadow tree (global styles do
 *   not reach shadow-DOM scrollbars).
 *
 * Styles are injected once per target (document head by default).
 * Each scrollable container gets the proper `overflow` and
 * `scrollbar-gutter` CSS so scrollbars always occupy layout space and
 * never obscure borders or outlines.
 *
 * Usage – apply to an existing element (light DOM):
 *   Openp41geScrollbar.apply(el, { axis: "vertical" });
 *
 * Usage – apply inside a shadow root (e.g. the agents chat panel):
 *   Openp41geScrollbar.apply(el, { axis: "vertical", styleTarget: shadowRoot });
 *
 * Usage – create a new scrollable viewport inside a parent:
 *   const vp = Openp41geScrollbar.createViewport(parent, { axis: "both" });
 *
 * Usage – auto-hide (scrollbar widens on scroll, slims when idle):
 *   const sb = new Openp41geScrollbar(el, { axis: "vertical", autoHide: true });
 *   sb.destroy();
 */

import { SCROLLBAR_SIZE } from "openp41ge-constants";

export interface ScrollbarOptions {
  /** Scroll axes.  Default: "vertical". */
  axis?: "vertical" | "horizontal" | "both";
  /** When true, the scrollbar is nearly invisible at rest and widens on
   *  scroll (matching the original ScrollbarActivity behaviour). */
  autoHide?: boolean;
  /** Background color for the auto-hide overlay strip. */
  bgColor?: string;
  /** Where to inject the shared scrollbar styles.  Pass a `ShadowRoot`
   *  when the target element lives in a shadow tree, otherwise the
   *  styles are injected (once) into `document.head`. */
  styleTarget?: Document | ShadowRoot;
}

const AUTO_HIDE_IDLE = 600;

const STYLE_ID = "openp41ge-scrollbar-style";

const STYLE_TEXT = [
  "::-webkit-scrollbar { width: 8px; height: 8px; }",
  "::-webkit-scrollbar-track { background: transparent; box-sizing: border-box; }",
  "::-webkit-scrollbar-track:vertical { border-left: 1px solid rgba(128,128,128,0.25); }",
  "::-webkit-scrollbar-track:horizontal { border-top: 1px solid rgba(128,128,128,0.25); }",
  "::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.16); border-radius: 0; min-height: 28px; }",
  "::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.34); }",
  "::-webkit-scrollbar-corner { background: transparent; }",
].join("\n");

// ── Style injection ──

let _injectedDocument = false;

function injectStyles(target?: Document | ShadowRoot): void {
  if (target instanceof ShadowRoot) {
    // Each shadow root carries its own copy of the stylesheet, because
    // global (document-level) styles never reach shadow-DOM scrollbars.
    if (target.getElementById(STYLE_ID)) return;
    const s = document.createElement("style");
    s.id = STYLE_ID;
    s.textContent = STYLE_TEXT;
    target.appendChild(s);
    return;
  }

  if (_injectedDocument) return;
  _injectedDocument = true;

  const head = (target ?? document).head;
  if (!head) return;
  if (document.getElementById(STYLE_ID)) return;

  const s = document.createElement("style");
  s.id = STYLE_ID;
  s.textContent = STYLE_TEXT;
  head.appendChild(s);
}

function axisOverflow(axis: "vertical" | "horizontal" | "both"): {
  overflowY: string;
  overflowX: string;
} {
  switch (axis) {
    case "vertical":
      return { overflowY: "auto", overflowX: "hidden" };
    case "horizontal":
      return { overflowY: "hidden", overflowX: "auto" };
    case "both":
      return { overflowY: "auto", overflowX: "auto" };
  }
}

// ── Component ──

export class Openp41geScrollbar {
  private _el: HTMLElement;
  private _axis: "vertical" | "horizontal" | "both";
  private _autoHide: boolean;
  private _strip: HTMLElement | null = null;
  private _timer: ReturnType<typeof setTimeout> | null = null;
  private _isWide: boolean = false;
  private _onScroll: (() => void) | null = null;
  private _destroyed: boolean = false;

  /**
   * Apply consistent scrollbar styling to an existing element.
   * Sets overflow properties and scrollbar-gutter so the scrollbar
   * occupies layout space.
   */
  static apply(el: HTMLElement, options?: ScrollbarOptions): void {
    injectStyles(options?.styleTarget);
    const axis = options?.axis ?? "vertical";
    const ov = axisOverflow(axis);
    el.style.overflowY = ov.overflowY;
    el.style.overflowX = ov.overflowX;
    el.style.scrollbarGutter = "stable";
  }

  /**
   * Create a new scrollable viewport inside a parent element and return it.
   * The viewport is a `<div>` with `flex:1` and `min-height:0` so it
   * works correctly in flex layouts.
   */
  static createViewport(
    parent: HTMLElement,
    options?: ScrollbarOptions & { height?: string },
  ): HTMLElement {
    const el = document.createElement("div");
    el.style.cssText = ["flex:1", "min-height:0", "box-sizing:border-box"].join(";");
    if (options?.height) el.style.height = options.height;
    Openp41geScrollbar.apply(el, options);
    parent.appendChild(el);
    return el;
  }

  /**
   * Create an auto-hide instance.
   *
   * The scrollbar track/strip is nearly invisible at rest and widens on
   * scroll.  After `AUTO_HIDE_IDLE` ms of inactivity it slims back down.
   *
   * Call `destroy()` to clean up listeners and the overlay strip.
   */
  constructor(el: HTMLElement, options?: ScrollbarOptions) {
    injectStyles(options?.styleTarget);
    this._el = el;
    this._axis = options?.axis ?? "vertical";
    this._autoHide = options?.autoHide ?? false;

    Openp41geScrollbar.apply(el, options);

    if (this._autoHide) {
      this._setupAutoHide(options?.bgColor);
    }
  }

  private _setupAutoHide(bgColor?: string): void {
    // Determine background colour for the strip
    const bg = bgColor ?? getComputedStyle(this._el).backgroundColor;
    const fill = bg && bg !== "rgba(0, 0, 0, 0)" ? bg : "#1a1a1a";

    // Ensure positioned so the absolute strip is relative to this element
    const pos = getComputedStyle(this._el).position;
    if (pos === "static" || pos === "") {
      this._el.style.position = "relative";
    }

    // Create an overlay strip that covers most of the scrollbar width,
    // leaving only ~3px visible.  On scroll the strip slides away.
    const isVertical = this._axis === "vertical" || this._axis === "both";
    const isHorizontal = this._axis === "horizontal" || this._axis === "both";

    // Build the strip with the proper axis
    const stripWidth = SCROLLBAR_SIZE - 3; // 5px
    const props: string[] = [
      "position:absolute",
      "pointer-events:none",
      "z-index:5",
      `background:${fill}`,
      "transform:translate(0,0)",
      "transition:transform 0.15s ease",
    ];
    if (isVertical) {
      props.push("right:0", "top:0", `width:${stripWidth}px`, "height:100%");
    }
    if (isHorizontal && this._axis === "both") {
      // For both axes, the strip covers only the vertical track;
      // the horizontal one also gets covered by overflow-x on the parent.
    }

    this._strip = document.createElement("div");
    this._strip.style.cssText = props.join(";");
    this._el.appendChild(this._strip);

    this._onScroll = () => {
      if (this._destroyed) return;
      if (!this._isWide) {
        this._isWide = true;
        if (this._strip) {
          this._strip.style.transform = "translateX(5px)";
        }
      }
      if (this._timer) clearTimeout(this._timer);
      this._timer = setTimeout(() => {
        if (this._destroyed) return;
        this._isWide = false;
        if (this._strip) {
          this._strip.style.transform = "translate(0,0)";
        }
      }, AUTO_HIDE_IDLE);
    };

    this._el.addEventListener("scroll", this._onScroll, { passive: true });
  }

  /** Clean up listeners and overlay strip. */
  destroy(): void {
    this._destroyed = true;
    if (this._timer) clearTimeout(this._timer);
    if (this._onScroll) {
      this._el.removeEventListener("scroll", this._onScroll);
      this._onScroll = null;
    }
    if (this._strip && this._strip.parentElement) {
      this._strip.remove();
    }
    this._strip = null;
  }
}

// ─── OverlayScrollbar (floating overlay scrollbar, used by the file editor
//     and window manager) ────────────────────────────────────────────────

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
  /** Where to inject the overlay styles.  Pass a `ShadowRoot` when the target
   *  element lives in a shadow tree (global styles never reach it). */
  styleTarget?: Document | ShadowRoot;
  /** Fade the scrollbar out after the cursor leaves the scroll area (default false). */
  autoHide?: boolean;
  /** Milliseconds to wait after the cursor leaves before fading out (default 2500). */
  autoHideDelay?: number;
}

/** A spring-like, overshooting CSS easing for the thicken/brighter animation. */
export const SPRING_EASE = "cubic-bezier(0.34, 1.56, 0.64, 1)";

const OVERLAY_DEFAULT_SIZE = 6;
const OVERLAY_DEFAULT_HOVER_SIZE = 10;
const OVERLAY_DEFAULT_MIN_THUMB = 24;
const OVERLAY_DEFAULT_THUMB_COLOR = "rgba(255,255,255,0.22)";
const OVERLAY_DEFAULT_THUMB_HOVER_COLOR = "rgba(255,255,255,0.42)";
const OVERLAY_DEFAULT_AUTO_HIDE_DELAY = 2500;
const OVERLAY_FADE_MS = 250;

// ─── Pure geometry (unit-testable) ─────────────────────────────────────

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
  minThumbSize: number = OVERLAY_DEFAULT_MIN_THUMB,
): number {
  if (viewport <= 0 || scrollLen <= 0 || scrollLen <= viewport) return trackLen;
  const len = (viewport / scrollLen) * trackLen;
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

// ─── Component ─────────────────────────────────────────────────────────

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
  private _styleTarget: Document | ShadowRoot | undefined;
  private _axes: Partial<Record<ScrollbarAxis, AxisState>> = {};
  private _destroyed = false;
  private _autoHide = false;
  private _autoHideDelay = OVERLAY_DEFAULT_AUTO_HIDE_DELAY;
  private _hideTimer = 0;
  private _pointerInside = false;
  private _onPointerEnter: () => void = () => {};
  private _onPointerLeave: () => void = () => {};
  private _onScroll: () => void = () => {};
  private _ro: ResizeObserver | null = null;
  private _mo: MutationObserver | null = null;
  private _raf = 0;

  private constructor(target: HTMLElement, container: HTMLElement, options: OverlayScrollbarOptions) {
    this._target = target;
    this._container = container;
    this._axis = options.axis ?? "vertical";
    this._size = options.size ?? OVERLAY_DEFAULT_SIZE;
    this._hoverSize = options.hoverSize ?? OVERLAY_DEFAULT_HOVER_SIZE;
    this._minThumbSize = options.minThumbSize ?? OVERLAY_DEFAULT_MIN_THUMB;
    this._inset = options.inset ?? {};
    this._zIndex = options.zIndex ?? 20;
    this._thumbColor = options.thumbColor ?? OVERLAY_DEFAULT_THUMB_COLOR;
    this._thumbHoverColor = options.thumbHoverColor ?? OVERLAY_DEFAULT_THUMB_HOVER_COLOR;
    this._styleTarget = options.styleTarget;
    this._autoHide = options.autoHide ?? false;
    this._autoHideDelay = options.autoHideDelay ?? OVERLAY_DEFAULT_AUTO_HIDE_DELAY;
  }

  static attach(target: HTMLElement, options: OverlayScrollbarOptions = {}): OverlayScrollbar {
    let container = options.container;
    let wrap: HTMLElement | null = null;
    if (!container) {
      wrap = document.createElement("div");
      wrap.style.position = "relative";
      wrap.style.overflow = "hidden";
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
    this._target.style.scrollbarWidth = "none";
    this._target.setAttribute("data-overlay-scrollbar", "");
    this._injectScopedStyles();

    if (this._axis === "vertical" || this._axis === "both") this._buildAxis("vertical");
    if (this._axis === "horizontal" || this._axis === "both") this._buildAxis("horizontal");

    this._onScroll = () => {
      this.update();
      this._poke();
    };
    this._target.addEventListener("scroll", this._onScroll, { passive: true });
    this._ro = new ResizeObserver(() => this.update());
    this._ro.observe(this._target);
    this._mo = new MutationObserver(() => {
      if (this._raf) return;
      this._raf = requestAnimationFrame(() => {
        this._raf = 0;
        this.update();
      });
    });
    this._mo.observe(this._target, { childList: true, subtree: true });

    if (this._autoHide) {
      this._onPointerEnter = () => {
        this._pointerInside = true;
        this._show();
      };
      this._onPointerLeave = () => {
        this._pointerInside = false;
        this._scheduleHide();
      };
      this._container.addEventListener("pointerenter", this._onPointerEnter);
      this._container.addEventListener("pointerleave", this._onPointerLeave);
      // Start visible, then fade if the cursor hasn't entered after the delay.
      this._setVisible(true);
      this._scheduleHide();
    }

    this.update();
  }

  private _injectScopedStyles(): void {
    const id = "overlay-scrollbar-style";
    const text = `
      [data-overlay-scrollbar]::-webkit-scrollbar { width: 0 !important; height: 0 !important; }
      .os-track { position: absolute; z-index: 20; pointer-events: auto; box-sizing: border-box;
        opacity: 1; transition: opacity ${OVERLAY_FADE_MS}ms ease; }
      .os-track.os-hidden { opacity: 0; pointer-events: none; }
      .os-track--v { border-left: 1px solid rgba(128,128,128,0.25); }
      .os-track--h { border-top: 1px solid rgba(128,128,128,0.25); }
      .os-thumb {
        position: absolute; background: var(--os-thumb, ${OVERLAY_DEFAULT_THUMB_COLOR}); border-radius: 0;
        box-sizing: border-box; pointer-events: auto; cursor: default;
        transition: width ${SPRING_EASE} 0.18s, height ${SPRING_EASE} 0.18s,
                    background-color 0.15s ease, left ${SPRING_EASE} 0.18s, top ${SPRING_EASE} 0.18s;
      }
      .os-thumb:hover, .os-thumb.dragging { background: var(--os-thumb-hover, ${OVERLAY_DEFAULT_THUMB_HOVER_COLOR}); }
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
    const root = this._styleTarget;
    if (root instanceof ShadowRoot) {
      if (root.getElementById(id)) return;
      const s = document.createElement("style");
      s.id = id;
      s.textContent = text;
      root.appendChild(s);
      return;
    }
    if (document.getElementById(id)) return;
    const s = document.createElement("style");
    s.id = id;
    s.textContent = text;
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
    track.style.setProperty("--os-size", `${this._size}px`);
    track.style.setProperty("--os-hover", `${this._hoverSize}px`);
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

  /** Show the scrollbar and cancel any pending auto-hide. */
  private _show(): void {
    if (!this._autoHide) return;
    this._setVisible(true);
    this._clearHideTimer();
  }

  /** Show on scroll activity, then re-arm the auto-hide timer. */
  private _poke(): void {
    if (!this._autoHide) return;
    this._setVisible(true);
    this._scheduleHide();
  }

  /** Start (or restart) the delay before fading out after the cursor leaves. */
  private _scheduleHide(): void {
    if (!this._autoHide) return;
    this._clearHideTimer();
    this._hideTimer = window.setTimeout(() => {
      this._hideTimer = 0;
      if (this._destroyed) return;
      // Keep it visible while the cursor is inside, or while the user is dragging.
      if (this._pointerInside || this._isDragging()) {
        this._setVisible(true);
        return;
      }
      this._setVisible(false);
    }, this._autoHideDelay);
  }

  private _setVisible(visible: boolean): void {
    for (const key of Object.keys(this._axes) as ScrollbarAxis[]) {
      const state = this._axes[key];
      if (state) state.track.classList.toggle("os-hidden", !visible);
    }
  }

  private _isDragging(): boolean {
    for (const key of Object.keys(this._axes) as ScrollbarAxis[]) {
      const state = this._axes[key];
      if (state?.thumb.classList.contains("dragging")) return true;
    }
    return false;
  }

  private _clearHideTimer(): void {
    if (this._hideTimer) {
      window.clearTimeout(this._hideTimer);
      this._hideTimer = 0;
    }
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
    if (this._autoHide) {
      this._clearHideTimer();
      this._container.removeEventListener("pointerenter", this._onPointerEnter);
      this._container.removeEventListener("pointerleave", this._onPointerLeave);
    }
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
      const parent = this._wrap.parentElement;
      parent?.insertBefore(this._target, this._wrap);
      this._wrap.remove();
    }
  }
}
