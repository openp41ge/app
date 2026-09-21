/**
 * <openp41ge-settings-drawer-host> — the "negative drawer" stack.
 *
 * A settings gear in a sidebar opens a drawer that does NOT slide in over the
 * sidebar (the normal way a drawer covers content). Instead it opens from the
 * sidebar's **inner edge** and grows OVER THE GRID — a "negative" drawer.
 *
 * The host mounts once per window, inside the grid area (between the two
 * sidebars), so the drawer never covers the sidebar it belongs to.
 *
 * ONE DRAWER AT A TIME:
 *   - Only one sidebar drawer is open at a time. Opening on a side closes
 *     whichever drawer is currently shown (on the other side), and re-opening
 *     on a side that already has a drawer replaces that side's stack.
 *   - The host still keeps a separate stack per side (so each sidebar remembers
 *     its own width), but at most one is populated at any moment.
 *
 * PER-SIDE WIDTHS:
 *   - Each side tracks its OWN drawer width (`_drawerWidths.left` /
 *     `_drawerWidths.right`). Dragging one side's handle resizes only that
 *     side.
 *   - Every layer on a side still shares that side's width (parent + children
 *     move together).
 *
 * MIN / MAX WIDTH:
 *   - The drawer width is always within `[minWidth (= defaultDrawerWidth),
 *     maxWidth (= maxDrawerWidth, clamped to the grid width)]`.
 *   - Because only one drawer is open at a time there is no opposite drawer to
 *     share the grid with, so the drawer may extend past the grid's midpoint
 *     up to its max width, and no overlap bookkeeping is needed.
 *
 * Stacking (within one side):
 *   - The first drawer (the surface's base view, e.g. the Agents Providers
 *     list) sits flush against the sidebar edge.
 *   - Each sub-drawer opens in the SAME slot (against the sidebar edge) and
 *     PUSHES the lower drawer inward by a single inset (30px) so the parent
 *     stays visible as a "back" affordance behind it — but ONLY when there is
 *     room to slide without the stack running past the grid's midpoint. If the
 *     drawer is too wide (near its max) the parent does not slide and the child
 *     simply covers it.
 *   - Every layer is rendered but every non-top offset is capped at one inset,
 *     so only the CHILD (flush) + PARENT (peek 30px) are visible; deeper layers
 *     stack exactly on top of the parent and are hidden behind it. Clicking a
 *     parent (via its invisible mask) closes the child opened above it.
 *   - Layers are rendered in stable order (base first, sub-drawers appended)
 *     so index-based diffing reuses each drawer element; when a layer's offset
 *     changes the CSS `transition: left/right` animates a parent sliding into
 *     place (or being pushed out) instead of popping.
 *
 * Layers are generic: each carries a `title` and a `render()` function that the
 * host calls to produce its body. This keeps shared, stateful surfaces (like the
 * Agent settings) in control of their own data while the host owns geometry,
 * stacking and slide animation.
 */

import { LitElement, html, nothing, type TemplateResult } from "lit";
import { property, state } from "lit/decorators.js";

export type DrawerSide = "left" | "right";

/** One drawer in the stack (base = the surface's root view). */
export interface SettingsDrawerLayer {
  id: string;
  title: string;
  /** Render this layer's body. Called on every host render. */
  render: () => TemplateResult;
  /** Whether ✕ is shown. Base layers may hide it (the surface decides). */
  closable?: boolean;
  /** Whether this is the root/base layer (cannot be popped by `closeAll`). */
  isBase?: boolean;
  /**
   * Extra CSS injected into the drawer's light-DOM scope to style its body.
   * Needed because sub-layer bodies are rendered by the host (in the host's
   * light DOM), not inside a surface's shadow root, so surface scoped styles
   * would not reach them.
   */
  styles?: string;
}

/** A closing drawer keeps its last offset so it animates out in place. */
interface ClosingLayer {
  layer: SettingsDrawerLayer;
  /** px offset from the anchor edge at close time. */
  offset: number;
}

/**
 * A settings surface that the host mounts as the base layer. The surface is a
 * DOM element (usually a Lit component) that owns its data and pushes/pops
 * sub-layers through the host. `openSurface` sets `host` on the element so the
 * surface can drive the stack.
 */
export interface SettingsDrawerSurface extends HTMLElement {
  readonly title: string;
  /**
   * Stable identifier for the top-level surface (e.g. the appType it was
   * opened for). Lets callers detect that this surface (and only it) is
   * already the open top-level drawer, so pressing its icon again can close
   * it instead of re-opening it.
   */
  appType?: string;
  /**
   * Which side this surface was mounted on. Set by the host on mount so the
   * surface can route its own sub-drawer operations to the correct stack even
   * while a drawer on the opposite side is also open.
   */
  side?: DrawerSide;
  host: Openp41geSettingsDrawerHost | null;
}

/** Per-side state: the mounted surface plus its layer stack. */
interface SideStack {
  surface: SettingsDrawerSurface | null;
  layers: SettingsDrawerLayer[];
  closing: ClosingLayer[];
}

export class Openp41geSettingsDrawerHost extends LitElement {
  protected createRenderRoot(): HTMLElement | DocumentFragment {
    return this;
  }

  /** Which sidebar's edge the stack anchors to (the "active"/last-opened side). */
  @property({ reflect: true })
  side: DrawerSide = "left";

  /** Width every drawer opens to (the "default drawer width"). */
  @property({ type: Number })
  defaultDrawerWidth = 320;

  /**
   * The widest a drawer may be dragged. Because only ONE drawer is open at a
   * time there is no opposite drawer to share the grid with, so the drawer is
   * free to extend past the grid's midpoint — up to this max width.
   */
  @property({ type: Number })
  maxDrawerWidth = 720;

  /** How far (px) a parent drawer slides inward when a child drawer opens. */
  @property({ type: Number })
  stackInset = 30;

  @state()
  private _stacks: Record<DrawerSide, SideStack> = {
    left: { surface: null, layers: [], closing: [] },
    right: { surface: null, layers: [], closing: [] },
  };

  /**
   * Current drawer width PER SIDE. Dragging one side's handle changes only that
   * side's width. Each side's layers (parent + children) share that side's
   * width. Never drops below the default drawer width (the minimum).
   */
  @state()
  private _drawerWidths: Record<DrawerSide, number> = {
    left: this.defaultDrawerWidth,
    right: this.defaultDrawerWidth,
  };

  private _resizing = false;
  private _resizeSide: DrawerSide = "left";
  private _resizeStartX = 0;
  private _resizeStartWidth = 0;

  /** Elastic resistance factor applied when dragging a drawer past its limit. */
  private readonly _RESISTANCE = 0.2;

  /** Side currently being resized — drives the `sdw-resizing` class (keeps the
   * blue indicator lit while dragging, even when the cursor leaves the bar). */
  @state()
  private _resizingSide: DrawerSide | null = null;

  /** Side that just rubber-banded and is now springing back (drives the
   * `sdw-snapback` class so the width transition animates the return). */
  @state()
  private _snapbackSide: DrawerSide | null = null;

  /** The floor for the drawer width (the "default drawer width"). */
  private get _minWidth(): number {
    return this.defaultDrawerWidth;
  }

  /** Exposed min drawer width (used by the sidebar drag to know headroom). */
  get drawerMinWidth(): number {
    return this._minWidth;
  }

  /** True while at least one drawer is open on either side. */
  get isOpen(): boolean {
    return this._isOpen("left") || this._isOpen("right");
  }

  private _isOpen(side: DrawerSide): boolean {
    return this._stacks[side].layers.length > 0;
  }

  /** Whether a drawer is currently open on `side`. */
  isDrawerOpen(side: DrawerSide): boolean {
    return this._isOpen(side);
  }

  /** The current drawer width for `side`. */
  drawerWidthFor(side: DrawerSide): number {
    return Math.max(this._minWidth, this._drawerWidths[side]);
  }

  /**
   * Set the drawer width for `side`, clamped to [min, max]. Used by the sidebar
   * drag to shrink a drawer as the sidebar widens (taking space from it).
   */
  setDrawerWidthFor(side: DrawerSide, value: number): void {
    const gridWidth = this.clientWidth || 0;
    const max = this._sideMaxWidth(side, gridWidth);
    const next = Math.max(this._minWidth, Math.min(max, value));
    // Reassign (not mutate) so Lit reactivity fires — `_drawerWidths` is a
    // single state object holding per-side values.
    this._drawerWidths = { ...this._drawerWidths, [side]: next };
  }

  /**
   * True when the open top-level drawer for `side` (or either side when `side`
   * is omitted) belongs to `appType`. Used for toggle semantics: pressing the
   * same sidebar gear that opened the current drawer should close it, not
   * re-open it.
   */
  isOpenFor(appType: string, side?: DrawerSide): boolean {
    const sides: DrawerSide[] = side ? [side] : ["left", "right"];
    return sides.some(
      (s) => this._isOpen(s) && this._stacks[s].surface?.appType === appType,
    );
  }

  // ── Stack control ──────────────────────────────────────────────────────

  /**
   * Open a surface as the base layer on `side` (defaults to `this.side`).
   *
   * Only ONE sidebar drawer is open at a time. Opening on one side closes
   * whatever is open on the other side; opening on a side that already has a
   * drawer replaces that side's stack (the open-handler implements toggle-close
   * for the same gear).
   */
  openSurface(surface: SettingsDrawerSurface, side?: DrawerSide): void {
    const target = side ?? this.side;
    const other = target === "left" ? "right" : "left";

    // Only one sidebar drawer at a time: opening on one side closes the other.
    if (this._isOpen(other)) {
      this._closeStack(other);
    }

    // Close this side's existing stack before mounting the new surface.
    if (this._isOpen(target)) {
      this._closeStack(target);
    }

    const stack = this._stacks[target];
    stack.surface = surface;
    surface.host = this;
    surface.side = target;
    stack.layers = [
      {
        id: "base",
        title: surface.title,
        isBase: true,
        // The base layer gets a close button too, so every drawer head can be
        // dismissed with ✕. Closing the base closes the whole side's stack.
        closable: true,
        render: () => surface as unknown as TemplateResult,
      },
    ];
    this.side = target;
    this.requestUpdate();
  }

  /** Push a new drawer at the sidebar edge on `side`, pushing lower drawers outward. */
  open(layer: SettingsDrawerLayer, side?: DrawerSide): void {
    const stack = this._stacks[side ?? this.side];
    // If an identical id is already open, just refresh it (open-once).
    if (stack.layers.some((l) => l.id === layer.id)) {
      this.refresh();
      return;
    }
    stack.closing = stack.closing.filter((c) => c.layer.id !== layer.id);
    stack.layers = [...stack.layers, layer];
    this.requestUpdate();
  }

  /** Pop the top drawer (closes it with an exit animation). */
  closeTop(side?: DrawerSide): void {
    const stack = this._stacks[side ?? this.side];
    const top = stack.layers[stack.layers.length - 1];
    if (top) this.close(top.id, side);
  }

  /** Close a drawer by id, on `side`; removes all drawers above it too. */
  close(id: string, side?: DrawerSide): void {
    const stack = this._stacks[side ?? this.side];
    const idx = stack.layers.findIndex((l) => l.id === id);
    if (idx === -1) return;
    // Closing a lower drawer pops everything above it as well.
    const closing = stack.layers.slice(idx);
    const n = stack.layers.length;
    const s = side ?? this.side;
    const width = Math.max(this._minWidth, this._drawerWidths[s]);
    const gridWidth = this.clientWidth || 0;
    stack.layers = stack.layers.slice(0, idx);
    this._finalizeClose(
      s,
      closing.map((l, i) => ({
        layer: l,
        offset: this._layerOffset(s, idx + i, n, width, gridWidth),
      })),
    );
  }

  /** Close every drawer on both sides (including the base surfaces). */
  closeAll(): void {
    this._closeStack("left");
    this._closeStack("right");
  }

  /** Close the entire stack on one side only (toggle-close semantics). */
  closeSide(side: DrawerSide): void {
    this._closeStack(side);
  }

  /** Close any sub-drawers opened above the layer at `index` (keep `index`). */
  closeAbove(side: DrawerSide, index: number): void {
    const stack = this._stacks[side];
    if (index >= stack.layers.length - 1) return;
    const origN = stack.layers.length;
    const closing = stack.layers.slice(index + 1);
    const width = Math.max(this._minWidth, this._drawerWidths[side]);
    const gridWidth = this.clientWidth || 0;
    stack.layers = stack.layers.slice(0, index + 1);
    this._finalizeClose(
      side,
      closing.map((l, k) => ({
        layer: l,
        offset: this._layerOffset(side, index + 1 + k, origN, width, gridWidth),
      })),
    );
  }

  /** Force the host to re-render (call when a surface's data changes). */
  refresh(): void {
    this.requestUpdate();
  }

  private _closeStack(side: DrawerSide): void {
    const stack = this._stacks[side];
    if (stack.layers.length === 0) return;
    const n = stack.layers.length;
    const width = Math.max(this._minWidth, this._drawerWidths[side]);
    const gridWidth = this.clientWidth || 0;
    const closing = stack.layers.map((l, i) => ({
      layer: l,
      offset: this._layerOffset(side, i, n, width, gridWidth),
    }));
    stack.layers = [];
    stack.surface = null;
    this._finalizeClose(side, closing);
  }

  private _finalizeClose(side: DrawerSide, closing: ClosingLayer[]): void {
    if (closing.length === 0) return;
    const stack = this._stacks[side];
    stack.closing = [...stack.closing, ...closing];
    const ids = new Set(closing.map((c) => c.layer.id));
    // `_stacks` is a single reactive object holding nested arrays, so mutating
    // a nested array does NOT trigger Lit reactivity. Pulse requestUpdate so
    // the drawer that just mounted/closed actually re-renders.
    this.requestUpdate();
    window.setTimeout(() => {
      stack.closing = stack.closing.filter((c) => !ids.has(c.layer.id));
      this.requestUpdate();
    }, 220);
  }

  // ── Geometry helpers ───────────────────────────────────────────────────

  /**
   * The visible push-out (px) of the layer at `index` in an `n`-layer stack on
   * `side`, for a drawer of `width` inside a `gridWidth` grid.
   *
   * The deepest (top) layer sits flush at the sidebar edge (offset 0). A parent
   * layer slides outward by up to a single `stackInset` so it can peek out from
   * behind the child — but only as far as there is room to slide before the
   * stack runs past the grid's max width. The offset is CONTINUOUS in `width`
   * (`min(peek, room)`), so as the drawer is dragged toward its max the parent
   * slides out smoothly and proportionally to the remaining room, instead of
   * popping away the instant the width crosses the point where there is no
   * longer room. Deeper layers never gain a second extension; they hide behind
   * the child + parent.
   */
  private _layerOffset(
    side: DrawerSide,
    index: number,
    n: number,
    width: number,
    gridWidth: number,
  ): number {
    if (index === n - 1) return 0;
    const room = Math.max(0, this._sideMaxWidth(side, gridWidth) - width);
    const peek = Math.min(n - 1 - index, 1) * this.stackInset;
    return Math.min(peek, room);
  }

  /**
   * The single max width for an open drawer. Only one drawer is open at a time,
   * so there is no opposite drawer to share the grid with — the drawer is free
   * to extend past the grid's midpoint, up to `maxDrawerWidth`. It is clamped
   * to the grid width so it never overflows the grid area.
   */
  private _sideMaxWidth(side: DrawerSide, gridWidth: number): number {
    return Math.max(
      this._minWidth,
      Math.min(this.maxDrawerWidth, gridWidth),
    );
  }

  // ── Resize handles ──────────────────────────────────────────────────────

  private _onResizeDown = (e: PointerEvent, side: DrawerSide): void => {
    e.preventDefault();
    e.stopPropagation();
    this._resizing = true;
    this._resizeSide = side;
    this._resizingSide = side;
    this._snapbackSide = null;
    this.requestUpdate();
    this._resizeStartX = e.clientX;
    this._resizeStartWidth = this._drawerWidths[side];
    // Track on document (capture) so the drag keeps working if the pointer
    // leaves the handle, and so the next pointerup anywhere ends the drag.
    document.addEventListener("pointermove", this._onResizeMove, true);
    document.addEventListener("pointerup", this._onResizeUp, true);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };

  private _onResizeMove = (e: PointerEvent): void => {
    if (!this._resizing) return;
    const delta = e.clientX - this._resizeStartX;
    const side = this._resizeSide;
    // Dragging toward the grid widens the drawer; dragging back narrows it.
    const proposed =
      side === "right"
        ? this._resizeStartWidth - delta
        : this._resizeStartWidth + delta;
    const gridWidth = this.clientWidth || 0;
    // The drawer must never pass the grid's own edge (it would slide under the
    // opposite sidebar / off the window), so that edge is a HARD clamp with no
    // rubber band. Within the grid, the drawer bends elastically at its designed
    // max (`maxDrawerWidth`) if that is reached before the grid edge; it once
    // again springs back to that settled max on release (`_onResizeUp`).
    const gridMax = gridWidth;
    const bandMax = this._sideMaxWidth(side, gridWidth);
    const min = this._minWidth;
    let width = proposed;
    if (width > gridMax) {
      width = gridMax; // hard clamp at the grid edge (no band)
    } else if (width > bandMax) {
      width = Math.min(gridMax, bandMax + (width - bandMax) * this._RESISTANCE);
    } else if (width < min) {
      width = min - (min - width) * this._RESISTANCE;
    }
    this._drawerWidths = {
      ...this._drawerWidths,
      [side]: width,
    };
  };

  private _onResizeUp = (): void => {
    if (!this._resizing) return;
    this._resizing = false;
    const side = this._resizeSide;
    document.removeEventListener("pointermove", this._onResizeMove, true);
    document.removeEventListener("pointerup", this._onResizeUp, true);
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    // Spring the drawer back into its allowed range if the drag overshot a
    // limit. `_resizingSide` is cleared in the same render so the width
    // transition plays the snap-back instead of popping.
    const gridWidth = this.clientWidth || 0;
    const max = this._sideMaxWidth(side, gridWidth);
    const cur = this._drawerWidths[side];
    const clamped = Math.max(this._minWidth, Math.min(max, cur));
    if (cur !== clamped) {
      this._drawerWidths = { ...this._drawerWidths, [side]: clamped };
      // Apply the snapback class for one frame so the width transition plays the
      // spring return; clear it after the transition finishes.
      this._snapbackSide = side;
      window.setTimeout(() => {
        if (this._snapbackSide === side) { this._snapbackSide = null; this.requestUpdate(); }
      }, 260);
    }
    this._resizingSide = null;
    this.requestUpdate();
  };

  connectedCallback(): void {
    super.connectedCallback();
    // Listen on document so Escape closes the drawer regardless of where focus
    // currently sits (the drawer may not have keyboard focus).
    document.addEventListener("keydown", this._onKeydown);
    // Listen on document (capture) so clicking outside the drawer closes it
    // even if the grid element swallows the click. Uses pointerdown so the
    // drawer dismisses as soon as the user presses outside it, matching the
    // standard click-away behavior for an overlay panel.
    document.addEventListener("pointerdown", this._onDocumentPointerDown, true);
    // Force the drawer widths back inside their allowed range when the window
    // (and thus the grid) is resized, so a drawer can't be left overrunning the
    // halfway point after a shrink.
    window.addEventListener("resize", this._onWindowResize);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    document.removeEventListener("keydown", this._onKeydown);
    document.removeEventListener("pointerdown", this._onDocumentPointerDown, true);
    window.removeEventListener("resize", this._onWindowResize);
  }

  private _onKeydown = (e: KeyboardEvent): void => {
    if (e.key !== "Escape") return;
    if (!this.isOpen) return;
    e.preventDefault();
    this.closeTop();
  };

  /**
   * Click-away: close the open drawer when the user presses on the grid area
   * outside it.
   *
   * The host is a transparent full-grid overlay with `pointer-events: none`, so
   * only the drawers block pointer events. A press on the grid that a drawer
   * does NOT cover lands on the grid itself (a sibling of the host, not a
   * child), so `this.contains(e.target)` is false there. We listen on document
   * and, when the press is inside the host's bounding box (the grid area) but
   * not on a drawer, close the whole stack. Pressing a drawer (this.contains)
   * is left alone, and presses outside the grid (sidebars / titlebar) don't
   * fall inside the grid area so they are ignored too — that way the sidebar
   * settings gear that opened the drawer can still toggle it closed.
   */
  private _onDocumentPointerDown = (e: PointerEvent): void => {
    if (!this.isOpen) return;
    // A press on a drawer (its head, body, resize handle, or parent mask) must
    // not dismiss the panel.
    if (this.contains(e.target as Node)) return;
    const rect = this.getBoundingClientRect();
    const x = e.clientX;
    const y = e.clientY;
    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) return;
    this.closeAll();
  };

  /**
   * Force the open drawer widths back into their allowed range after the window
   * (and thus the grid) is resized. A drawer can be dragged up to the grid's
   * halfway point, so when the grid shrinks a previously-valid width could now
   * overrun the other half (or overlap the opposite drawer). Clamp each open
   * side down to its current max.
   */
  /**
   * Clamp an open side's drawer width back into its allowed range. Used when the
   * grid shrinks so a previously-valid width doesn't overrun the other half (or
   * overlap the opposite drawer).
   */
  private _clampSideWidth(side: DrawerSide, gridWidth: number): void {
    const max = this._sideMaxWidth(side, gridWidth);
    const next = Math.min(
      this._drawerWidths[side],
      Math.max(this._minWidth, max),
    );
    if (next !== this._drawerWidths[side]) {
      // Reassign (not mutate) so Lit reactivity fires.
      this._drawerWidths = { ...this._drawerWidths, [side]: next };
    }
  }

  private _onWindowResize = (): void => {
    const gridWidth = this.clientWidth;
    if (!gridWidth) return;
    // Only one drawer is open at a time; just clamp it back inside its range
    // if the grid shrunk so its width no longer fits within the max.
    for (const side of ["left", "right"] as DrawerSide[]) {
      if (!this.isDrawerOpen(side)) continue;
      this._clampSideWidth(side, gridWidth);
    }
  };

  // ── Rendering ──────────────────────────────────────────────────────────

  render(): TemplateResult {
    return html`
      <style>
        :host {
          position: absolute;
          inset: 0;
          pointer-events: none;
          /* Above the grid's column resize handles (z-index:1000) so a drawer
           * covering them blocks hover/drag instead of letting the handle poke
           * through and be grabbed while a drawer overlays the grid. */
          z-index: 1001;
          font-family: var(--font-ui);
          font-size: 13px;
          color: var(--text-primary, #ccc);
        }
        /* The host uses a light-DOM render root (createRenderRoot returns this),
         * so the :host selector above matches nothing. Re-target the element by
         * tag name so the host actually becomes a positioned box that fills the
         * grid area; otherwise it has zero size (breaking e.g. the resize clamp
         * that needs the host's clientWidth). */
        openp41ge-settings-drawer-host {
          position: absolute;
          inset: 0;
          pointer-events: none;
          z-index: 1001;
          font-family: var(--font-ui);
          font-size: 13px;
          color: var(--text-primary, #ccc);
        }
        /* Each drawer occupies the grid area it covers and blocks pointer
         * events there (pointer-events:auto), so the grid underneath is only
         * inert where a drawer actually overlays it. Areas the drawer does
         * NOT cover stay fully interactive (e.g. hovering/grabbing a column
         * resize handle outside the drawer's span). There is deliberately no
         * full-grid mask: covering the whole grid would block the uncovered
         * drag lines too. */
        .sdw-drawer {
          position: absolute;
          top: 0;
          bottom: 0;
          display: flex;
          flex-direction: column;
          min-width: 0;
          box-sizing: border-box;
          /* Match the sidebar / app surface color so the drawer blends with the
           * sidebar it slides out of (rather than reading as a lighter panel). */
          background: var(--bg-surface, #161616);
          /* Top border lives on .sdw-head so the drawer head aligns flush with
             the tab bar instead of being pushed 1px down by the panel border.
             The border is applied on the INSIDE edge (the edge facing the grid)
             so it doesn't double up against the sidebar; which edge that is
             depends on the anchor side (see [data-side] rules below). */
          pointer-events: auto;
          transition: left 0.2s ease, right 0.2s ease;
        }
        /* While a drawer is being resized we disable the width transition so
         * the drawer tracks the pointer exactly; the sdw-resize indicator
         * also stays lit (see below) even once the cursor leaves the bar. */
        .sdw-drawer.sdw-resizing {
          transition: none;
        }
        /* On release of a rubber-banded drag, this class is applied for one
         * frame so the width transition plays the snap-back (this is scoped
         * here rather than on the base rule so sidebar-driven drawer resizes
         * stay immediate). */
        .sdw-drawer.sdw-snapback {
          transition: left 0.2s ease, right 0.2s ease, width 0.2s ease;
        }
        .sdw-drawer[data-side="right"] {
          /* Anchored to the right sidebar, grows left: inside edge = left. */
          border-left: 1px solid var(--border-divider, #2d2d2d);
          animation: sdw-slide-in-right 0.18s ease;
        }
        .sdw-drawer[data-side="left"] {
          /* Anchored to the left sidebar, grows right: inside edge = right. */
          border-right: 1px solid var(--border-divider, #2d2d2d);
          animation: sdw-slide-in-left 0.18s ease;
        }
        /* Vertical drag handle on the inside edge of every open drawer.
         * 3px hit area centered over the border line, matching the app's
         * sidebar resize notches (3px, rgba(74,158,255,0.7)). It stays
         * invisible; the bar is only revealed on hover so it reads as a grab
         * bar rather than a thick border. */
        .sdw-resize {
          position: absolute;
          top: 0;
          bottom: 0;
          width: 3px;
          cursor: col-resize;
          z-index: 6;
          touch-action: none;
          user-select: none;
          background: transparent;
        }
        .sdw-resize::before {
          content: "";
          position: absolute;
          top: 0;
          bottom: 0;
          left: 0;
          width: 100%;
          background: rgba(74, 158, 255, 0.7);
          opacity: 0;
          transition: opacity 0.12s ease;
        }
        .sdw-resize:hover::before {
          opacity: 1;
        }
        /* Keep the indicator lit for the whole drag, not just while hovering. */
        .sdw-drawer.sdw-resizing .sdw-resize::before,
        .sdw-drawer.sdw-resizing .sdw-resize:hover::before {
          opacity: 1;
        }
        /* Invisible click mask over a parent drawer while a child is open.
         * It makes the parent inert (clicks can't reach its body/controls) and
         * turning it into a "back" affordance: clicking the parent closes the
         * child opened above it. Sits above the drawer's own head/body/resize
         * but below the child drawer (which occupies the same slot and has a
         * higher z-index). */
        .sdw-parent-mask {
          position: absolute;
          inset: 0;
          z-index: 20;
          cursor: pointer;
          background: transparent;
          pointer-events: auto;
        }
        .sdw-drawer.sdw-drawer--closing {
          pointer-events: none;
          z-index: 1000;
        }
        .sdw-drawer.sdw-drawer--closing[data-side="right"] {
          animation: sdw-slide-out-right 0.18s ease forwards;
        }
        .sdw-drawer.sdw-drawer--closing[data-side="left"] {
          animation: sdw-slide-out-left 0.18s ease forwards;
        }
        .sdw-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-shrink: 0;
          cursor: pointer;
          /* Match the tab-bar height (35px incl. its 1px bottom border) so the
             drawer head sits flush with the editor/system tab bars. Only a
             single bottom border (like the tab bar) to avoid a double line. */
          height: 35px;
          box-sizing: border-box;
          /* No right padding: the full-height square close button sits flush at
             the drawer's right edge. Keep the 14px leading padding on the left
             so the title keeps its inset from the inner edge. */
          padding: 0 0 0 14px;
          border-bottom: 1px solid var(--border-divider, #2d2d2d);
        }
        .sdw-title {
          font-size: 11px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          color: var(--text-secondary, #999);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .sdw-close {
          border: none;
          background: transparent;
          color: var(--text-secondary, #999);
          /* Full height of the drawer head and square (width = height), matching
             the shared .p41ge-icon-btn pattern used across bottom bars. */
          height: 100%;
          aspect-ratio: 1 / 1;
          padding: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          border-radius: 0;
          font-size: 14px;
          line-height: 1;
          flex-shrink: 0;
        }
        .sdw-close:hover {
          background: var(--bg-active, #37373d);
          color: var(--text-primary, #ddd);
        }
        .sdw-body {
          flex: 1;
          min-height: 0;
          overflow-y: auto;
          overflow-x: hidden;
        }
        @keyframes sdw-slide-in-right {
          from {
            transform: translateX(24px);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
        @keyframes sdw-slide-in-left {
          from {
            transform: translateX(-24px);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
        @keyframes sdw-slide-out-right {
          from {
            transform: translateX(0);
            opacity: 1;
          }
          to {
            transform: translateX(24px);
            opacity: 0;
          }
        }
        @keyframes sdw-slide-out-left {
          from {
            transform: translateX(0);
            opacity: 1;
          }
          to {
            transform: translateX(-24px);
            opacity: 0;
          }
        }
      </style>

      ${this._renderStack("left")}
      ${this._renderStack("right")}
    `;
  }

  private _renderStack(side: DrawerSide): TemplateResult {
    const stack = this._stacks[side];
    const width = Math.max(this._minWidth, this._drawerWidths[side]);
    const n = stack.layers.length;
    // Render EVERY layer in stable order (base first, then each sub-drawer).
    // `_layerOffset` caps every non-top layer's offset to a single stackInset
    // (30px) when there is room to slide, so deeper layers stack EXACTLY on top
    // of the parent and are hidden behind it (the parent's higher z-index
    // covers them). When there is no room (drawer near its max width) the
    // parent does not slide and the child covers it. This keeps the DOM order
    // stable across open/close — because layers are only ever appended at the
    // end or truncated from the end, index-based diffing reuses the same drawer
    // element when its offset changes. The CSS `transition: left/right` then
    // animates a parent sliding in to replace a closing child (or being pushed
    // out by a new one) instead of popping into place.
    return html`
      ${stack.layers.map((layer, i) => {
        const offset = this._layerOffset(
          side,
          i,
          n,
          width,
          this.clientWidth || 0,
        );
        const pos = side === "left" ? `left:${offset}px` : `right:${offset}px`;
        const resizeSide = side === "left" ? "right:-2px" : "left:-2px";
        const hasChildren = i < n - 1;
        return html`
          <div
            class="sdw-drawer ${side === this._resizingSide ? "sdw-resizing" : ""} ${side === this._snapbackSide ? "sdw-snapback" : ""}"
            data-side="${side}"
            style="${pos}; width:${width}px; z-index:${i + 2}"
          >
            ${layer.styles ? html`<style>${layer.styles}</style>` : nothing}
            ${this._renderHead(layer, side)}
            <div class="sdw-body">${layer.render()}</div>
            <div
              class="sdw-resize"
              style="${resizeSide}"
              title="Drag to resize drawer width"
              @pointerdown=${(e: PointerEvent) => this._onResizeDown(e, side)}
            ></div>
            ${
              hasChildren
                ? html`<div
                    class="sdw-parent-mask"
                    title="Click to go back"
                    @click=${() => this.closeAbove(side, i)}
                  ></div>`
                : nothing
            }
          </div>
        `;
      })}

      ${stack.closing.map((c) => {
        return html`
          <div
            class="sdw-drawer sdw-drawer--closing"
            data-side="${side}"
            style="${side === "left" ? `left:${c.offset}px` : `right:${c.offset}px`}; width:${width}px"
          >
            ${c.layer.styles ? html`<style>${c.layer.styles}</style>` : nothing}
            ${this._renderHead(c.layer, side)}
            <div class="sdw-body">${c.layer.render()}</div>
          </div>
        `;
      })}
    `;
  }

  private _renderHead(layer: SettingsDrawerLayer, side: DrawerSide): TemplateResult {
    return html`
      <div class="sdw-head">
        <span class="sdw-title" title="${layer.title}">${layer.title}</span>
        ${
          layer.closable === false
            ? nothing
            : html`
                <button
                  class="sdw-close"
                  @click=${(e: Event) => {
                    e.stopPropagation();
                    this.close(layer.id, side);
                  }}
                  aria-label="Close"
                  title="Close"
                >
                  ✕
                </button>
              `
        }
      </div>
    `;
  }
}

customElements.define("openp41ge-settings-drawer-host", Openp41geSettingsDrawerHost);

declare global {
  interface HTMLElementTagNameMap {
    "openp41ge-settings-drawer-host": Openp41geSettingsDrawerHost;
  }
}
