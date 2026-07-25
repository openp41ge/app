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
 *
 * Global styles are injected once into the document head.  Each
 * scrollable container gets the proper `overflow` and `scrollbar-gutter`
 * CSS so scrollbars always occupy layout space and never obscure borders
 * or outlines.
 *
 * Usage – apply to an existing element:
 *   Openp41geScrollbar.apply(el, { axis: "vertical" });
 *
 * Usage – create a new scrollable viewport inside a parent:
 *   const vp = Openp41geScrollbar.createViewport(parent, { axis: "both" });
 *
 * Usage – auto-hide (scrollbar widens on scroll, slims when idle):
 *   const sb = new Openp41geScrollbar(el, { axis: "vertical", autoHide: true });
 *   sb.destroy();
 */

export interface ScrollbarOptions {
  /** Scroll axes.  Default: "vertical". */
  axis?: "vertical" | "horizontal" | "both";
  /** When true, the scrollbar is nearly invisible at rest and widens on
   *  scroll (matching the original ScrollbarActivity behaviour). */
  autoHide?: boolean;
  /** Background color for the auto-hide overlay strip. */
  bgColor?: string;
}

const AUTO_HIDE_IDLE = 600;
const SCROLLBAR_SIZE = 8;

// ── Global style injection ──

let _injected = false;

function injectStyles(): void {
  if (_injected) return;
  _injected = true;

  const id = "openp41ge-scrollbar-style";
  if (document.getElementById(id)) return;

  const s = document.createElement("style");
  s.id = id;
  s.textContent = [
    "::-webkit-scrollbar { width: 8px; height: 8px; }",
    "::-webkit-scrollbar-track { background: transparent; }",
    "::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.12); }",
    "::-webkit-scrollbar-corner { background: transparent; }",
  ].join("\n");
  document.head.appendChild(s);
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
    injectStyles();
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
    injectStyles();
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
