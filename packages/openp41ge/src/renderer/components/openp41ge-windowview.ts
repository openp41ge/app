/**
 * <openp41ge-windowview> — top-level component for a Openp41ge window (Lit).
 *
 * Owns the sidebar resize handles. Bottom area uses a thin (empty) bar
 * reserved for future use. System tabs replaced by a service modal.
 */

import { LitElement, html, nothing, type TemplateResult } from "lit";
import { property, state } from "lit/decorators.js";
import type { Window, Workspace, Rect, SystemTabId } from "../../layout/types";
import { emitEvent } from "../app";

import { settingsIcon } from "../icons";
import { getFileIcon } from "../icons/material-icons";
import { getAllSystemTabRegistrations } from "../apps/app-registry";

import { setContextMenuActive } from "../services/drag-context";
import {
  MIN_SIDEBAR_WIDTH,
  MAX_SIDEBAR_WIDTH,
  NOTCH_WIDTH,
  NOTCH_OVERFLOW,
} from "openp41ge-constants";

import type { Openp41geSettingsDrawerHost } from "./openp41ge-settings-drawer-host";
import type { Openp41geSidebar } from "./openp41ge-sidebar";

import "./openp41ge-sidebar";
// Registers <drag-line>, the shared translucent blue hover affordance used by
// the resize notches (the "you can drag this" sibling of <drop-line>).
import "openp41ge-uikit/drop-indicator";
// Registers <overdraw-line>, the 1px fade-out accent used to continue a
// divider/box border past its end.
import "openp41ge-uikit/overdraw-line";

/** How far (px) a populated sidebar's grid-side divider overdraws up past the
 *  title-bar seam (always shown while the sidebar is open). */
export const SIDEBAR_OVERDRAW_LENGTH = 14;

/** How far (px) a populated sidebar's bottom-bar top border overdraws
 *  horizontally into the grid when the grid has no tabs. */
export const SIDEBAR_FOOTER_OVERDRAW_LENGTH = 18;

/** How far (px) each grid-interior cell divider (the 1px vertical separator
 *  between two columns) overdraws up past the title-bar seam (shown whenever
 *  the grid has 2 or more columns). */
export const CELL_DIVIDER_OVERDRAW_LENGTH = 14;

/** How far (px) each chat-list separator line (the 1px horizontal borders
 *  between the "+ New chat" row and the chat sessions) overdraws horizontally
 *  into the grid from the sidebar's grid-side edge. Always shown while an open
 *  sidebar has marked separator rows ([data-sb-sep]). */
export const SIDEBAR_SEP_OVERDRAW_LENGTH = 10;

/** A separator row's live overdraw accents (one per marked border). */
type SbSepEntry = { side: "left" | "right"; top?: HTMLElement; bottom?: HTMLElement };

class Openp41geWindowView extends LitElement {
  protected createRenderRoot(): HTMLElement | DocumentFragment {
    return this;
  }

  @property({ attribute: false })
  windowData: Window | null = null;

  @property({ attribute: false })
  workspaceData: Workspace | null = null;

  @property({ attribute: false })
  layouts: Map<string, Map<string, Rect>> = new Map();

  // ═══ Resize state (owned by windowview for unified corner handling) ──

  /** Left sidebar width in pixels. */
  @state()
  private _leftWidth = parseInt(localStorage.getItem("openp41ge:sidebar-width-left") ?? "280", 10);

  /** Right sidebar width in pixels. */
  @state()
  private _rightWidth = parseInt(
    localStorage.getItem("openp41ge:sidebar-width-right") ?? "280",
    10,
  );

  /** Which sidebar has a settings drawer currently open (or null). While a
   * drawer is open, the windowview raises that anchor sidebar above the dim
   * mask and disables the OPPOSING sidebar's resize notch, so the drawer's own
   * handle (which may reach the grid edge) stays grabbable instead of the
   * opposing sidebar stealing the drag. */
  @state()
  private _drawerOpenSide: "left" | "right" | null = null;

  /** Portalled <overdraw-line> accents that continue a populated sidebar's
   * grid-side divider up past the title-bar seam when the grid has no tabs
   * (so the sidebar edge stays visible against the empty grid). Keyed by side;
   * created lazily and removed when the condition goes away. */
  private _sbDividerOverdraw = new Map<string, HTMLElement>();
  /** Portalled horizontal <overdraw-line> accents that continue an open
   * sidebar's bottom-bar top border into the empty grid. Keyed by side. */
  private _sbFooterOverdraw = new Map<string, HTMLElement>();
  /** Portalled horizontal <overdraw-line> accents that continue an open
   * sidebar's TAB-BAR bottom border into the empty grid (the tab bar carries
   * a bottom border only while it hosts tabs; when the grid is empty that
   * border would otherwise stop at the sidebar's grid-side edge). Keyed by
   * side. */
  private _sbTabBarOverdraw = new Map<string, HTMLElement>();
  /** Portalled horizontal <overdraw-line> accents that continue the grid's
   * TAB-BAR bottom border into an EMPTY open sidebar (the grid tab bar's
   * bottom border would otherwise stop at the grid area's grid-side edge).
   * Keyed by side. */
  private _sbGridTabBarOverdraw = new Map<string, HTMLElement>();
  /** Cached bottom-bar (footer) element found in each sidebar's active host
   * (or null when the active tab has no bottom bar), so the per-frame tracker
   * only has to read one rect (not re-scan the tree). */
  private _sbFooterEl = new Map<string, HTMLElement | null>();
  /** Portalled vertical <overdraw-line> accents that continue each grid-interior
   * cell divider up past the title-bar seam. Keyed by the left column index
   * (0..cols-2); created lazily, removed when the grid has <2 columns. */
  private _cellOverdraw = new Map<number, HTMLElement>();
  /** Portalled horizontal <overdraw-line> accents that continue each chat-list
   * separator line into the grid. Keyed by the separator element; each entry
   * may hold an accent for the element's top border and/or its bottom border. */
  private _sbSepOverdraw = new Map<Element, SbSepEntry>();
  /** rAF handle for the per-frame divider tracking while any overdraw shows. */
  private _sbOverdrawRaf = 0;

  // ── Drag state ────────────────────────────────────────────────────────

  private _activeHandle: "left" | "right" | null = null;
  private _dragStartX = 0;
  private _dragStartY = 0;
  private _dragStartLeftWidth = 280;
  private _dragStartRightWidth = 280;
  /** Latest applied width during an active drag (written straight to the DOM so
   * the handle tracks the mouse every move, without a full re-render per mousemove). */
  private _dragLeftWidth = 280;
  private _dragRightWidth = 280;

  /** Drawer width on the dragged side at drag start (so widening the sidebar
   * can take that space from the open drawer). */
  private _dragStartDrawerWidth = 0;
  /** True when the drawer on the dragged side was ALREADY at full grid width
   * when the drag began. A full-width drawer tracks the grid as the sidebar
   * moves (staying full), whereas a partial drawer keeps its far edge fixed
   * and only grows back up to its width at drag start. */
  private _dragStartDrawerFull = false;
  /** True while the sidebar rubber-bands past its OWN max width. */
  private _isOverMax = false;
  private _overMaxTarget = 0;
  /** True while the sidebar rubber-bands below its OWN min width. */
  private _isOverMin = false;
  private _overMinTarget = 0;
  /** Resistance factor for the small "give" while over-dragging (0..1). */
  private readonly _RESISTANCE = 0.2;

  // ── Context menu ─────────────────────────────────────────────────────

  private _contextMenu: { x: number; y: number; paneId?: string } | null = null;
  private _skeletonInitialized = false;
  private _resizeRaf = 0;

  /**
   * On every window resize, force a top-level Lit re-render (rAF-throttled).
   * The CSS shell already tracks the viewport, but JS-measured sub-layouts
   * (sidebar heights, editor/tree viewports, bottom pane) capture pixel sizes
   * during render — so they must re-render as the window grows or they go
   * stale until some later event. The macOS native maximize animation is a
   * particular case where this matters.
   */
  private _onWindowResize = (): void => {
    if (this._resizeRaf) return;
    this._resizeRaf = requestAnimationFrame(() => {
      this._resizeRaf = 0;
      this.requestUpdate();
    });
  };

  connectedCallback(): void {
    super.connectedCallback();
    this._ensureSkeleton();
    window.addEventListener("resize", this._onWindowResize);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    window.removeEventListener("resize", this._onWindowResize);
    if (this._resizeRaf) {
      cancelAnimationFrame(this._resizeRaf);
      this._resizeRaf = 0;
    }
    document.removeEventListener("mousemove", this._onResizeMove);
    document.removeEventListener("mouseup", this._onResizeEnd);
    if (this._sbOverdrawRaf) {
      cancelAnimationFrame(this._sbOverdrawRaf);
      this._sbOverdrawRaf = 0;
    }
    for (const line of this._sbDividerOverdraw.values()) line.remove();
    this._sbDividerOverdraw.clear();
    for (const line of this._sbFooterOverdraw.values()) line.remove();
    this._sbFooterOverdraw.clear();
    for (const line of this._sbTabBarOverdraw.values()) line.remove();
    this._sbTabBarOverdraw.clear();
    for (const line of this._sbGridTabBarOverdraw.values()) line.remove();
    this._sbGridTabBarOverdraw.clear();
    this._sbFooterEl.clear();
    for (const line of this._cellOverdraw.values()) line.remove();
    this._cellOverdraw.clear();
    for (const { top, bottom } of this._sbSepOverdraw.values()) {
      if (top) top.remove();
      if (bottom) bottom.remove();
    }
    this._sbSepOverdraw.clear();
  }

  private _onWorkspacesUpdate = (): void => {
    this.requestUpdate();
  };

  private _ensureSkeleton(): void {
    if (this._skeletonInitialized) return;
    this._skeletonInitialized = true;

    this.addEventListener("contextmenu", (e: MouseEvent) => {
      const gridArea = this.querySelector(".openp41ge-grid-area");
      if (!gridArea || !gridArea.contains(e.target as Node)) return;
      e.preventDefault();
      if (!(e.target instanceof HTMLElement)) return;
      const paneEl = e.target.closest("[data-pane-id]");
      if (!(paneEl instanceof HTMLElement)) {
        this._contextMenu = { x: e.clientX, y: e.clientY, paneId: undefined };
      } else {
        const paneId = paneEl.getAttribute("data-pane-id") ?? undefined;
        this._contextMenu = { x: e.clientX, y: e.clientY, paneId };
      }
      this._updateContextMenu();
    });
  }

  // ═══ Resize handlers ──────────────────────────────────────────────────

  private _onResizeStart(e: MouseEvent, handle: "left" | "right"): void {
    // A drawer is open on the opposing side, so its far edge sits right under
    // this notch — ignore the drag so the drawer's own resize handle (which
    // the notch otherwise covers) stays grabbable.
    if (this._notchDisabled(handle)) {
      e.preventDefault();
      return;
    }
    e.preventDefault();
    this._activeHandle = handle;
    this._dragStartX = e.clientX;
    this._dragStartY = e.clientY;
    this._dragStartLeftWidth = this._leftWidth;
    this._dragStartRightWidth = this._rightWidth;
    this._dragLeftWidth = this._leftWidth;
    this._dragRightWidth = this._rightWidth;
    // Snapshot the open drawer width for the dragged side so widening the
    // sidebar can take space from the drawer (and stop at its minimum).
    const host = this._drawerHost();
    this._dragStartDrawerWidth = host ? host.drawerWidthFor(handle) : 0;
    this._dragStartDrawerFull = !!host?.isDrawerFullWidth(handle);
    this._isOverMax = false;
    this._overMaxTarget = 0;
    this._isOverMin = false;
    this._overMinTarget = 0;
    // Keep the notch's blue indicator lit for the whole drag (not just hover).
    this._setDragLine(handle, true);

    document.addEventListener("mousemove", this._onResizeMove);
    document.addEventListener("mouseup", this._onResizeEnd);
  }

  private _onResizeMove = (e: MouseEvent): void => {
    if (!this._activeHandle) return;

    const dx = e.clientX - this._dragStartX;

    document.body.style.cursor = "col-resize";

    switch (this._activeHandle) {
      case "left": {
        const { newWidth, drawerWidth } = this._sidebarMove("left", dx);
        this._dragLeftWidth = newWidth;
        this._applyWidth("left", newWidth);
        if (drawerWidth !== null) {
          this._drawerHost()?.setDrawerWidthFor("left", drawerWidth);
        }
        break;
      }
      case "right": {
        // Right handle: dragging left (dx<0) widens the right sidebar.
        const { newWidth, drawerWidth } = this._sidebarMove("right", dx);
        this._dragRightWidth = newWidth;
        this._applyWidth("right", newWidth);
        if (drawerWidth !== null) {
          this._drawerHost()?.setDrawerWidthFor("right", drawerWidth);
        }
        break;
      }
    }
  };

  /**
   * Compute the sidebar width (and matching drawer width) for a drag move.
   *
   * The sidebar resizes exactly as it would with no drawer open — it is never
   * blocked by a drawer's minimum width. While the drawer has headroom it
   * shrinks to absorb the sidebar's growth (so the drawer's far edge stays put
   * instead of sliding into the grid); once it reaches its minimum it clamps
   * there and simply slides along with the sidebar.
   *
   * Returns `drawerWidth: null` when no drawer is open on that side.
   */
  private _sidebarMove(
    handle: "left" | "right",
    dx: number,
  ): { newWidth: number; drawerWidth: number | null } {
    const host = this._drawerHost();
    const open = !!host?.isDrawerOpen(handle);
    const drawerStart = this._dragStartDrawerWidth;
    const minDrawer = open ? host!.drawerMinWidth : 0;
    const startWidth = handle === "left" ? this._dragStartLeftWidth : this._dragStartRightWidth;
    // Widening the sidebar is +dx for left, -dx for right.
    const desired = handle === "left" ? startWidth + dx : startWidth - dx;
    // The sidebar's effective max is the smaller of MAX_SIDEBAR_WIDTH and the
    // 35% viewport cap (the same constraint the template's `max-width` uses),
    // so the rubber band fires at the width the sidebar actually renders to.
    const maxSidebar = this._sidebarMax();

    let newWidth: number;
    let drawerWidth = drawerStart;
    this._isOverMax = false;
    this._isOverMin = false;
    this._overMaxTarget = 0;
    this._overMinTarget = 0;

    if (desired < MIN_SIDEBAR_WIDTH) {
      // Below its own minimum — rubber band down, spring back on release.
      newWidth = MIN_SIDEBAR_WIDTH - (MIN_SIDEBAR_WIDTH - desired) * this._RESISTANCE;
      this._isOverMin = true;
      this._overMinTarget = MIN_SIDEBAR_WIDTH;
      if (open) {
        drawerWidth = this._drawerWidthForDrag(minDrawer, drawerStart, newWidth, startWidth);
      }
    } else {
      newWidth = Math.min(maxSidebar, desired);
      if (open) {
        drawerWidth = this._drawerWidthForDrag(minDrawer, drawerStart, newWidth, startWidth);
      }
      // Above its own max — rubber band up, spring back on release.
      if (desired > maxSidebar) {
        newWidth = maxSidebar + (desired - maxSidebar) * this._RESISTANCE;
        this._isOverMax = true;
        this._overMaxTarget = maxSidebar;
      }
    }

    return { newWidth, drawerWidth: open ? drawerWidth : null };
  }

  /** Compute the drawer width for a sidebar drag move.
   *
   * While the drawer has headroom it shrinks to absorb the sidebar's growth
   * so its far edge stays put; once it reaches its minimum it clamps there and
   * slides with the sidebar rather than blocking the resize. Narrowing grows
   * it back up to the width at drag start.
   *
   * A drawer that was ALREADY full width when the drag began instead tracks
   * the grid: it stays full as the sidebar narrows (the grid grows) and its
   * far edge follows the grid edge, rather than being held at the drag-start
   * width. `setDrawerWidthFor` clamps the value to the current grid width, so
   * a full-width drawer can never overshoot the grid.
   */
  private _drawerWidthForDrag(
    minDrawer: number,
    drawerStart: number,
    newWidth: number,
    startWidth: number,
  ): number {
    const growth = newWidth - startWidth;
    return this._dragStartDrawerFull
      ? Math.max(minDrawer, drawerStart - growth)
      : Math.max(minDrawer, Math.min(drawerStart, drawerStart - growth));
  }

  /**
   * The effective max width a sidebar can render to: the smaller of
   * `MAX_SIDEBAR_WIDTH` and the 35% viewport cap used by the template.
   */
  private _sidebarMax(): number {
    return Math.min(MAX_SIDEBAR_WIDTH, Math.round(window.innerWidth * 0.35));
  }

  private _drawerHost(): Openp41geSettingsDrawerHost | null {
    return this.querySelector(
      "openp41ge-settings-drawer-host",
    ) as Openp41geSettingsDrawerHost | null;
  }

  /** React to the drawer host broadcasting which side (if any) has a drawer
   * open, so the windowview can raise the anchor sidebar and disable the
   * opposing sidebar's resize notch accordingly. */
  private _onDrawerOpenChanged = (e: Event): void => {
    const side = (e as CustomEvent<{ side: "left" | "right" | null }>).detail?.side ?? null;
    if (side !== this._drawerOpenSide) this._drawerOpenSide = side;
  };

  /** Whether the given sidebar's resize notch should be disabled because a
   * drawer is open on the OPPOSING side (its own drawer edge would sit exactly
   * under that notch, so the notch must not steal the drawer's resize drag). */
  private _notchDisabled(side: "left" | "right"): boolean {
    return this._drawerOpenSide !== null && this._drawerOpenSide !== side;
  }

  /**
   * Write a sidebar width straight to its DOM host element. Bypasses Lit
   * re-rendering so the resize handle tracks the mouse position on every
   * mousemove — even very fast ones — instead of lagging behind.
   */
  private _applyWidth(side: "left" | "right", width: number): void {
    const el = this.querySelector<HTMLElement>(`openp41ge-sidebar[side="${side}"]`);
    if (!el) return;
    el.style.flex = `0 1 ${width}px`;
    // Let the (possibly rubber-banded) width render exactly, so the overshoot is
    // visible during the drag. Committed widths are already capped by
    // `_sidebarMove` at `min(MAX_SIDEBAR_WIDTH, 35vw)`, so this never persists
    // a width beyond the design cap.
    el.style.maxWidth = `${width}px`;
  }

  /**
   * Animate the sidebar spring-back by temporarily enabling a width transition
   * on the element, applying the target width, and clearing it after the
   * transition completes. This makes the rubber-band overshoot ease back to
   * the limit (and the inner content/scrollbars follow the animation) rather
   * than snapping instantly.
   */
  private _springWidth(side: "left" | "right", width: number): void {
    const el = this.querySelector<HTMLElement>(`openp41ge-sidebar[side="${side}"]`);
    if (!el) return;
    el.classList.add("wv-springing");
    this._applyWidth(side, width);
    window.setTimeout(() => {
      el.classList.remove("wv-springing");
    }, 200);
  }

  private _onResizeEnd = (): void => {
    const handle = this._activeHandle;
    this._activeHandle = null;
    document.removeEventListener("mousemove", this._onResizeMove);
    document.removeEventListener("mouseup", this._onResizeEnd);

    // Reset cursor
    document.body.style.cursor = "";

    // If the sidebar rubber-banded past its own max, spring it back to the max.
    if (this._isOverMax && this._overMaxTarget > 0 && handle) {
      this._dragLeftWidth = handle === "left" ? this._overMaxTarget : this._dragLeftWidth;
      this._dragRightWidth = handle === "right" ? this._overMaxTarget : this._dragRightWidth;
      this._springWidth("left", this._dragLeftWidth);
      this._springWidth("right", this._dragRightWidth);
    }
    // If the sidebar rubber-banded below its own min, spring it back to the min.
    if (this._isOverMin && this._overMinTarget > 0 && handle) {
      this._dragLeftWidth = handle === "left" ? this._overMinTarget : this._dragLeftWidth;
      this._dragRightWidth = handle === "right" ? this._overMinTarget : this._dragRightWidth;
      this._springWidth("left", this._dragLeftWidth);
      this._springWidth("right", this._dragRightWidth);
    }

    // Commit the final drag width into reactive state (single render) and persist
    this._leftWidth = this._dragLeftWidth;
    this._rightWidth = this._dragRightWidth;
    localStorage.setItem("openp41ge:sidebar-width-left", String(this._leftWidth));
    localStorage.setItem("openp41ge:sidebar-width-right", String(this._rightWidth));

    // Clear the drag indicator and overrun state.
    if (handle) this._setDragLine(handle, false);
    this._isOverMax = false;
    this._isOverMin = false;
  };

  /** Toggle the shared <drag-line> inside a resize notch (hover / dragging). */
  private _setDragLine(side: "left" | "right", on: boolean): void {
    const line = this.querySelector(`.wv-notch-v.${side}-notch drag-line`);
    if (line) line.toggleAttribute("show", on);
  }

  // ── Sidebar divider overdraws ────────────────────────────────────────

  /**
   * An open sidebar's grid-side 1px divider is the boundary separating it from
   * the grid, and its top sits exactly at the main-area's top edge (the
   * title-bar seam), where it just stops. Continue that divider up past the
   * seam with a short <overdraw-line> fade-out accent so the sidebar edge
   * reads clearly against the grid — whether the grid is empty or hosts tabs.
   *
   * The line is portalled to a fixed viewport layer because the divider's top
   * is at the main-area's top edge: an absolutely positioned line would be
   * clipped by the main area's `overflow: hidden`. It is positioned to run
   * exactly over the divider's x and to fade out upward. Runs on every render
   * (sidebar drags and window resizes re-render here), and is removed when the
   * sidebar is closed or loses its system tabs.
   */
  private _placeSidebarDividerOverdraws(): void {
    for (const side of ["left", "right"] as const) {
      const sb = this.querySelector<Openp41geSidebar>(`openp41ge-sidebar[side="${side}"]`);
      // Continue the sidebar's grid-side divider up past the seam whenever the
      // sidebar is open — whether or not it hosts tabs (an empty sidebar still
      // carries its grid-side border). Not gated on tab count.
      const shouldShow = !!sb?.isOpen;
      const existing = this._sbDividerOverdraw.get(side) ?? null;
      if (!shouldShow) {
        if (existing) {
          existing.remove();
          this._sbDividerOverdraw.delete(side);
        }
        continue;
      }
      if (!sb) continue;
      const line = existing ?? this._createSbDividerOverdraw();
      this._sbDividerOverdraw.set(side, line);
    }
  }

  /** Re-position each shown line over its sidebar's grid-side divider. The
   * positions are read from the sidebar HOST's box (available even before the
   * sidebar's internal gutter has rendered — the windowview's `updated()` runs
   * before a freshly created child sidebar has painted its content) and the
   * line is placed to run exactly over the divider's x, fading out upward. */
  private _positionSbDividerOverdraws(): void {
    for (const side of ["left", "right"] as const) {
      const line = this._sbDividerOverdraw.get(side);
      if (!line) continue;
      const sb = this.querySelector<Openp41geSidebar>(`openp41ge-sidebar[side="${side}"]`);
      if (!sb) continue;
      const rect = sb.getBoundingClientRect();
      // Left sidebar's grid-side divider is its right edge, right's is left.
      const dividerX = side === "left" ? rect.right - 1 : rect.left;
      line.style.left = `${dividerX}px`;
      line.style.top = `${rect.top - SIDEBAR_OVERDRAW_LENGTH}px`;
    }
  }

  /** Run the one-shot placement fallback (jsdom lacks rAF) then, if any
   * sidebar overdraw is shown, track each frame so the lines follow a live
   * sidebar drag / window resize (the windowview re-renders on release, not
   * during the drag, so `updated()` alone would go stale). */
  private _startSbOverdrawLoop(): void {
    if (this._sbOverdrawRaf) return;
    if (typeof requestAnimationFrame !== "function") {
      this._syncOverdraws();
      return;
    }
    const tick = (): void => {
      this._syncOverdraws();
      if (this._sbOverdrawsNeeded()) {
        this._sbOverdrawRaf = requestAnimationFrame(tick);
      } else {
        this._sbOverdrawRaf = 0;
      }
    };
    this._sbOverdrawRaf = requestAnimationFrame(tick);
  }

  private _stopSbOverdrawLoop(): void {
    if (this._sbOverdrawRaf) cancelAnimationFrame(this._sbOverdrawRaf);
    this._sbOverdrawRaf = 0;
  }

  /** Per-frame work while any overdraw is shown: fold in footer + cell-divider
   * lines (a sidebar's bottom bar or the grid's cells may only exist on a
   * later frame than the windowview's own `updated()`, so creation must run
   * here too) and place all lines over their anchors. */
  private _syncOverdraws(): void {
    this._placeSidebarFooterOverdraws();
    this._placeSidebarTabBarOverdraws();
    this._placeGridTabBarOverdraws();
    this._placeCellDividerOverdraws();
    this._syncSidebarSepOverdraws();
    this._positionSidebarOverdraws();
    this._positionCellDividerOverdraws();
  }

  private _positionSidebarOverdraws(): void {
    this._positionSbDividerOverdraws();
    this._positionSidebarFooterOverdraws();
    this._positionSidebarTabBarOverdraws();
    this._positionGridTabBarOverdraws();
  }

  private _syncOverdrawLoop(): void {
    if (this._sbOverdrawsNeeded()) {
      this._startSbOverdrawLoop();
    } else {
      this._stopSbOverdrawLoop();
    }
  }

  /** True while any shown overdraw, or a grid tab-bar overdraw may still need
   * lazy creation (the nested sidebar/tab-bar can render a frame after the
   * windowview's own `updated()`). Keeps the loop alive through that transient
   * so the grid tab-bar continuation into an empty open sidebar appears even
   * when it is the *only* overdraw in play. */
  private _sbOverdrawsNeeded(): boolean {
    return (
      this._sbDividerOverdraw.size > 0 ||
      this._sbFooterOverdraw.size > 0 ||
      this._sbTabBarOverdraw.size > 0 ||
      this._sbGridTabBarOverdraw.size > 0 ||
      this._cellOverdraw.size > 0 ||
      this._sbSepOverdraw.size > 0 ||
      this._gridTabBarOverdrawPotential()
    );
  }

  /** The grid tab-bar's bottom border should overdraw into a sidebar while the
   * grid hosts tabs and that open sidebar hosts no tabs. Read from
   * `workspaceData` (the source of truth) rather than the sidebar element, so it
   * is already correct during the windowview's first `updated()`, before the
   * nested sidebar has processed its own props. */
  private _gridTabBarOverdrawPotential(): boolean {
    const win = this.windowData;
    if (!win?.grid?.placements.some((p) => p.tabIds.length > 0)) return false;
    const sb = this.workspaceData?.sidebar;
    if (!sb) return false;
    const leftWants = sb.leftSidebarOpen && (sb.leftSidebarTabs?.length ?? 0) === 0;
    const rightWants = sb.rightSidebarOpen && (sb.rightSidebarTabs?.length ?? 0) === 0;
    return leftWants || rightWants;
  }

  /** Create a portalled <overdraw-line dir="up"> that fades out going up (the
   * solid end sits on the divider's top). One shared fixed viewport layer; the
   * line only paints where placed. */
  private _createSbDividerOverdraw(): HTMLElement {
    const line = document.createElement("overdraw-line");
    line.setAttribute("dir", "up");
    line.setAttribute("aria-hidden", "true");
    line.style.cssText = [
      "position: fixed",
      "z-index: 999",
      "pointer-events: none",
      "--overdraw-color: var(--border-divider, #2d2d2d)",
      "--overdraw-thickness: 1px",
      `--overdraw-length: ${SIDEBAR_OVERDRAW_LENGTH}px`,
    ].join(";");
    document.body.appendChild(line);
    return line;
  }

  // ── Sidebar bottom-bar overdraws ─────────────────────────────────────

  /**
   * When the grid has no tabs, the open sidebar's bottom bar (footer) top
   * border ends abruptly at the sidebar's grid-side edge, leaving the empty
   * grid with no continuation. Overdraw that top border a short way into the
   * grid with a horizontal fade-out accent so the bottom bar reads as running
   * on, even though the grid is empty.
   *
   * One accent per open sidebar whose bottom bar is present; the accent sits on
   * the footer's top-border y and fades from the sidebar's grid-side edge into
   * the grid (right for the left sidebar, left for the right). It is portalled
   * (fixed) so the sidebar's `overflow: hidden` cannot clip it, and removed
   * when the grid gets a tab (a tab's own bottom bar then provides the line) or
   * the sidebar closes / loses its footer. Hidden — not drawn — while the grid
   * hosts a tab that has a bottom bar.
   */
  private _placeSidebarFooterOverdraws(): void {
    const win = this.windowData;
    const gridEmpty = !win?.grid?.placements.some((p) => p.tabIds.length > 0);
    for (const side of ["left", "right"] as const) {
      const sb = this.querySelector<Openp41geSidebar>(`openp41ge-sidebar[side="${side}"]`);
      const shouldShow = gridEmpty && !!sb?.isOpen;
      const existing = this._sbFooterOverdraw.get(side) ?? null;
      if (!shouldShow) {
        if (existing) {
          existing.remove();
          this._sbFooterOverdraw.delete(side);
        }
        this._sbFooterEl.delete(side);
        continue;
      }
      if (!sb) continue;
      // Only draw when this sidebar's active system tab actually has a bottom
      // bar to continue (e.g. the Agents list footer). Re-find when the active
      // tab host changes (a hidden host's footer stays connected, so the cache
      // would otherwise keep the previous tab's footer forever — the accent
      // must follow whichever tab is currently visible).
      let footer = this._sbFooterEl.get(side) ?? null;
      const activeHost = sb.querySelector<HTMLElement>(".sidebar-tab-host.visible");
      if (!footer || !footer.isConnected || (activeHost && !activeHost.contains(footer))) {
        footer = this._findSidebarFooter(sb);
        this._sbFooterEl.set(side, footer);
      }
      if (!footer) {
        if (existing) {
          existing.remove();
          this._sbFooterOverdraw.delete(side);
        }
        continue;
      }
      const line = existing ?? this._createSbFooterOverdraw(side);
      this._sbFooterOverdraw.set(side, line);
    }
  }

  /** Find the active tab host's bottom bar (the element pinned to the host's
   * bottom that carries a 1px top border). Null when the tab has no bottom bar. */
  private _findSidebarFooter(sb: HTMLElement): HTMLElement | null {
    const host = sb.querySelector<HTMLElement>(".sidebar-tab-host.visible");
    if (!host) return null;
    const hostBottom = host.getBoundingClientRect().bottom;
    let footer: HTMLElement | null = null;
    for (const el of host.querySelectorAll<HTMLElement>("*")) {
      if (getComputedStyle(el).borderTopWidth !== "1px") continue;
      const rect = el.getBoundingClientRect();
      if (Math.abs(rect.bottom - hostBottom) < 1) footer = el;
    }
    return footer;
  }

  /** Position each footer overdraw on its footer's top-border y, fading from
   * the sidebar's grid-side edge into the grid. */
  private _positionSidebarFooterOverdraws(): void {
    for (const side of ["left", "right"] as const) {
      const line = this._sbFooterOverdraw.get(side);
      if (!line) continue;
      const sb = this.querySelector<Openp41geSidebar>(`openp41ge-sidebar[side="${side}"]`);
      let footer = this._sbFooterEl.get(side) ?? null;
      const activeHost = sb?.querySelector<HTMLElement>(".sidebar-tab-host.visible");
      if (sb && (!footer || !footer.isConnected || (activeHost && !activeHost.contains(footer)))) {
        footer = this._findSidebarFooter(sb);
        this._sbFooterEl.set(side, footer);
      }
      if (!sb || !footer) continue;
      const footerTop = footer.getBoundingClientRect().top;
      const sbRect = sb.getBoundingClientRect();
      line.style.top = `${footerTop}px`;
      if (side === "left") {
        line.setAttribute("dir", "right");
        line.style.left = `${sbRect.right}px`;
      } else {
        line.setAttribute("dir", "left");
        line.style.left = `${sbRect.left - SIDEBAR_FOOTER_OVERDRAW_LENGTH}px`;
      }
    }
  }

  /** Create a portalled horizontal <overdraw-line that fades into the grid from
   * the sidebar's grid-side edge (solid end on the footer's top border). */
  private _createSbFooterOverdraw(_side: "left" | "right"): HTMLElement {
    const line = document.createElement("overdraw-line");
    line.setAttribute("aria-hidden", "true");
    line.style.cssText = [
      "position: fixed",
      "z-index: 999",
      "pointer-events: none",
      "--overdraw-color: var(--divider, #333)",
      "--overdraw-thickness: 1px",
      `--overdraw-length: ${SIDEBAR_FOOTER_OVERDRAW_LENGTH}px`,
    ].join(";");
    document.body.appendChild(line);
    return line;
  }

  // ── Sidebar tab-bar overdraws ────────────────────────────────────────

  /**
   * The sidebar's tab bar carries a 1px bottom border only while it hosts at
   * least one tab. When the grid has no tabs, that border would stop at the
   * sidebar's grid-side edge — leaving the empty grid without a continuation
   * (the grid's own tab bar is absent). Overdraw the tab bar's bottom border a
   * short way into the grid so it reads as running on. Shown whenever the grid
   * is empty AND this sidebar is open AND hosts tabs (the border only exists
   * then); removed once the grid gets a tab (whose own bar supplies the line).
   */
  private _placeSidebarTabBarOverdraws(): void {
    const win = this.windowData;
    const gridEmpty = !win?.grid?.placements.some((p) => p.tabIds.length > 0);
    for (const side of ["left", "right"] as const) {
      const sb = this.querySelector<Openp41geSidebar>(`openp41ge-sidebar[side="${side}"]`);
      const shouldShow = gridEmpty && !!sb?.isOpen && (sb?.systemTabs?.length ?? 0) > 0;
      const existing = this._sbTabBarOverdraw.get(side) ?? null;
      if (!shouldShow) {
        if (existing) {
          existing.remove();
          this._sbTabBarOverdraw.delete(side);
        }
        continue;
      }
      if (!sb) continue;
      const bar = sb.querySelector<HTMLElement>(".sidebar-tab-bar");
      if (!bar) {
        if (existing) {
          existing.remove();
          this._sbTabBarOverdraw.delete(side);
        }
        continue;
      }
      const line = existing ?? this._createSbTabBarOverdraw();
      this._sbTabBarOverdraw.set(side, line);
    }
  }

  /** Position each tab-bar overdraw on the tab bar's bottom-border y, fading
   * from the sidebar's grid-side edge into the grid. */
  private _positionSidebarTabBarOverdraws(): void {
    for (const side of ["left", "right"] as const) {
      const line = this._sbTabBarOverdraw.get(side);
      if (!line) continue;
      const sb = this.querySelector<Openp41geSidebar>(`openp41ge-sidebar[side="${side}"]`);
      if (!sb) continue;
      const bar = sb.querySelector<HTMLElement>(".sidebar-tab-bar");
      if (!bar) continue;
      const barBottom = bar.getBoundingClientRect().bottom;
      const sbRect = sb.getBoundingClientRect();
      line.style.top = `${barBottom - 1}px`;
      if (side === "left") {
        line.setAttribute("dir", "right");
        line.style.left = `${sbRect.right}px`;
      } else {
        line.setAttribute("dir", "left");
        line.style.left = `${sbRect.left - SIDEBAR_FOOTER_OVERDRAW_LENGTH}px`;
      }
    }
  }

  /** Create a portalled horizontal <overdraw-line that fades into the grid from
   * the sidebar's grid-side edge (solid end on the tab bar's bottom border). */
  private _createSbTabBarOverdraw(): HTMLElement {
    const line = document.createElement("overdraw-line");
    line.setAttribute("aria-hidden", "true");
    line.style.cssText = [
      "position: fixed",
      "z-index: 999",
      "pointer-events: none",
      "--overdraw-color: var(--divider, #333)",
      "--overdraw-thickness: 1px",
      `--overdraw-length: ${SIDEBAR_FOOTER_OVERDRAW_LENGTH}px`,
    ].join(";");
    document.body.appendChild(line);
    return line;
  }

  // ── Grid tab-bar overdraws (into an empty sidebar) ───────────────────

  /**
   * Mirror of `_placeSidebarTabBarOverdraws`: when the grid hosts at least one
   * tab, the grid's tab bar carries a 1px bottom border. If an open sidebar
   * hosts NO tabs, its own tab bar is visually hidden (only the `+` button row
   * shows, and it has no bottom border), so the grid tab bar's border would
   * stop at the grid area's grid-side edge — leaving the empty sidebar with no
   * continuation. Overdraw the grid tab bar's bottom border a short way into
   * the empty sidebar so it reads as running on. Removed once the sidebar gets
   * its first tab (which supplies its own bar / border) or the grid empties.
   */
  private _placeGridTabBarOverdraws(): void {
    const win = this.windowData;
    const gridHasTabs = !!win?.grid?.placements.some((p) => p.tabIds.length > 0);
    // Read the sidebar open/empty state from workspaceData (the source of
    // truth) so this is already correct during the windowview's first
    // `updated()`, before the nested sidebar has processed its own props.
    const sbSrc = this.workspaceData?.sidebar;
    for (const side of ["left", "right"] as const) {
      const sb = this.querySelector<Openp41geSidebar>(`openp41ge-sidebar[side="${side}"]`);
      const open = side === "left" ? sbSrc?.leftSidebarOpen : sbSrc?.rightSidebarOpen;
      const tabIds = side === "left" ? sbSrc?.leftSidebarTabs : sbSrc?.rightSidebarTabs;
      const shouldShow = gridHasTabs && !!sb && !!open && (tabIds?.length ?? 0) === 0;
      const existing = this._sbGridTabBarOverdraw.get(side) ?? null;
      if (!shouldShow) {
        if (existing) {
          existing.remove();
          this._sbGridTabBarOverdraw.delete(side);
        }
        continue;
      }
      if (!sb) continue;
      const gridArea = this.querySelector<HTMLElement>(".openp41ge-grid-area");
      const tabBar = gridArea?.querySelector<HTMLElement>(".grid-cell tab-bar .tab-bar-container");
      if (!gridArea || !tabBar) {
        if (existing) {
          existing.remove();
          this._sbGridTabBarOverdraw.delete(side);
        }
        continue;
      }
      const line = existing ?? this._createSbGridTabBarOverdraw();
      this._sbGridTabBarOverdraw.set(side, line);
    }
  }

  /** Position each grid tab-bar overdraw on the grid tab bar's bottom-border y,
   * fading from the grid area's grid-side edge into the empty sidebar. */
  private _positionGridTabBarOverdraws(): void {
    for (const side of ["left", "right"] as const) {
      const line = this._sbGridTabBarOverdraw.get(side);
      if (!line) continue;
      const gridArea = this.querySelector<HTMLElement>(".openp41ge-grid-area");
      if (!gridArea) continue;
      const tabBar = gridArea.querySelector<HTMLElement>(".grid-cell tab-bar .tab-bar-container");
      if (!tabBar) continue;
      const gaRect = gridArea.getBoundingClientRect();
      const tbRect = tabBar.getBoundingClientRect();
      line.style.top = `${tbRect.bottom - 1}px`;
      if (side === "left") {
        line.setAttribute("dir", "left");
        line.style.left = `${gaRect.left - SIDEBAR_FOOTER_OVERDRAW_LENGTH}px`;
      } else {
        line.setAttribute("dir", "right");
        line.style.left = `${gaRect.right}px`;
      }
    }
  }

  /** Create a portalled horizontal <overdraw-line that fades from the grid
   * tab-bar border into the empty sidebar (solid end on the grid area's
   * grid-side edge). */
  private _createSbGridTabBarOverdraw(): HTMLElement {
    const line = document.createElement("overdraw-line");
    line.setAttribute("aria-hidden", "true");
    line.style.cssText = [
      "position: fixed",
      "z-index: 999",
      "pointer-events: none",
      "--overdraw-color: var(--divider, #333)",
      "--overdraw-thickness: 1px",
      `--overdraw-length: ${SIDEBAR_FOOTER_OVERDRAW_LENGTH}px`,
    ].join(";");
    document.body.appendChild(line);
    return line;
  }

  // ── Grid cell-divider overdraws ──────────────────────────────────────

  /**
   * When the grid has two or more columns, each pair of adjacent cells is
   * separated by a 1px vertical divider whose top sits exactly at the
   * main-area's top edge (the title-bar seam) where it just stops — the
   * grid-content equivalent of the sidebar divider. Continue each interior
   * divider up past the seam with a short <overdraw-line dir="up"> fade accent
   * so the cell boundary reads clearly against the top bar.
   *
   * Lines are portalled (fixed, z-index 999) so the grid area's
   * `overflow: hidden` cannot clip them, and are keyed by the left column index
   * so they survive re-renders and cell resizes. They exist whenever the grid
   * has 2+ columns (independent of whether cells host tabs).
   */
  private _placeCellDividerOverdraws(): void {
    const cells = this.querySelectorAll<HTMLElement>(".openp41ge-grid-area tab-grid .grid-cell");
    const cols = cells.length;
    const wanted = new Set<number>();
    for (let i = 0; i < cols - 1; i++) wanted.add(i);
    for (const [col, line] of this._cellOverdraw) {
      if (!wanted.has(col)) {
        line.remove();
        this._cellOverdraw.delete(col);
      }
    }
    for (const col of wanted) {
      if (this._cellOverdraw.has(col)) continue;
      this._cellOverdraw.set(col, this._createCellOverdraw());
    }
  }

  /** Position each cell-divider overdraw over its cell's right edge (the 1px
   *  border runs at `right - 1`), fading out upward from the cell's top. */
  private _positionCellDividerOverdraws(): void {
    for (const [col, line] of this._cellOverdraw) {
      const cell = this.querySelector<HTMLElement>(
        `.openp41ge-grid-area tab-grid .grid-cell[data-cell-col="${col}"]`,
      );
      if (!cell) continue;
      const r = cell.getBoundingClientRect();
      line.style.left = `${r.right - 1}px`;
      line.style.top = `${r.top - CELL_DIVIDER_OVERDRAW_LENGTH}px`;
    }
  }

  /** Create a portalled <overdraw-line dir="up"> that fades out going up (the
   * solid end sits on the cell divider's top). */
  private _createCellOverdraw(): HTMLElement {
    const line = document.createElement("overdraw-line");
    line.setAttribute("dir", "up");
    line.setAttribute("aria-hidden", "true");
    line.style.cssText = [
      "position: fixed",
      "z-index: 999",
      "pointer-events: none",
      "--overdraw-color: #333",
      "--overdraw-thickness: 1px",
      `--overdraw-length: ${CELL_DIVIDER_OVERDRAW_LENGTH}px`,
    ].join(";");
    document.body.appendChild(line);
    return line;
  }

  // ── Sidebar chat-list separator overdraws ────────────────────────────

  /**
   * The agents sidebar's chat list is separated by 1px horizontal divider
   * lines (below the "+ New chat" row and between each chat session, plus one
   * under the last session). These lines stop at the sidebar's grid-side edge,
   * so this sync step overdraws each marked separator row a short way into the
   * grid with a horizontal fade-out accent — the list reads as continuing past
   * the sidebar even when it holds many sessions.
   *
   * The list rows self-identify via `data-sb-sep` (space-separated list of the
   * borders that carry a separator: "top" and/or "bottom"). The windowview
   * reads the live computed border width so a suppressed bottom border (e.g.
   * the overflow-suppressed last-row separator) never gets an accent.
   *
   * Accents are portalled (fixed, z-index 999) so the sidebar's overflow
   * clipping cannot hide them, and are keyed by the separator element so a
   * re-rendered list simply reuses the live rows. This runs per frame while the
   * shared rAF loop is active so scroll/resize keep the accents pinned to their
   * separator lines.
   */
  private _syncSidebarSepOverdraws(): void {
    const seen = new Set<Element>();
    for (const side of ["left", "right"] as const) {
      const sb = this.querySelector<Openp41geSidebar>(`openp41ge-sidebar[side="${side}"]`);
      if (!sb?.isOpen) continue;
      const host = sb.querySelector<HTMLElement>(".sidebar-tab-host.visible");
      if (!host) continue;
      const sbRect = sb.getBoundingClientRect();
      for (const el of host.querySelectorAll<HTMLElement>("[data-sb-sep]")) {
        seen.add(el);
        let entry = this._sbSepOverdraw.get(el);
        if (!entry) {
          entry = { side, top: undefined, bottom: undefined };
          this._sbSepOverdraw.set(el, entry);
        }
        const marks = (el.dataset.sbSep ?? "").split(/\s+/).filter(Boolean);
        const cs = getComputedStyle(el);
        const wantTop = marks.includes("top") && cs.borderTopWidth === "1px";
        const wantBottom = marks.includes("bottom") && cs.borderBottomWidth === "1px";
        if (wantTop && !entry.top) entry.top = this._createSepOverdraw();
        if (!wantTop && entry.top) {
          entry.top.remove();
          entry.top = undefined;
        }
        if (wantBottom && !entry.bottom) entry.bottom = this._createSepOverdraw();
        if (!wantBottom && entry.bottom) {
          entry.bottom.remove();
          entry.bottom = undefined;
        }
        const r = el.getBoundingClientRect();
        if (entry.top) {
          entry.top.style.setProperty("--overdraw-color", cs.borderTopColor);
          entry.top.style.top = `${r.top}px`;
          this._placeSepOverdraw(entry.top, side, sbRect);
        }
        if (entry.bottom) {
          entry.bottom.style.setProperty("--overdraw-color", cs.borderBottomColor);
          entry.bottom.style.top = `${r.bottom - 1}px`;
          this._placeSepOverdraw(entry.bottom, side, sbRect);
        }
      }
    }
    // Drop accents for separators that left the DOM or were an unknown sidebar.
    for (const [el, entry] of this._sbSepOverdraw) {
      if (!seen.has(el) || !el.isConnected) {
        if (entry.top) entry.top.remove();
        if (entry.bottom) entry.bottom.remove();
        this._sbSepOverdraw.delete(el);
      }
    }
  }

  /** Place one separator accent at `top` over the separator line's y, fading
   *  from the sidebar's grid-side edge into the grid. */
  private _placeSepOverdraw(
    line: HTMLElement,
    side: "left" | "right",
    sbRect: DOMRect,
  ): void {
    if (side === "left") {
      line.setAttribute("dir", "right");
      line.style.left = `${sbRect.right}px`;
    } else {
      line.setAttribute("dir", "left");
      line.style.left = `${sbRect.left - SIDEBAR_SEP_OVERDRAW_LENGTH}px`;
    }
  }

  /** Create a portalled horizontal <overdraw-line> that fades into the grid
   *  from the sidebar's grid-side edge (solid end on the separator line). */
  private _createSepOverdraw(): HTMLElement {
    const line = document.createElement("overdraw-line");
    line.setAttribute("aria-hidden", "true");
    line.style.cssText = [
      "position: fixed",
      "z-index: 999",
      "pointer-events: none",
      "--overdraw-color: var(--divider, #333)",
      "--overdraw-thickness: 1px",
      `--overdraw-length: ${SIDEBAR_SEP_OVERDRAW_LENGTH}px`,
    ].join(";");
    document.body.appendChild(line);
    return line;
  }

  // ═══ Helpers ─────────────────────────────────────────────────────────

  private _getSystemTabTitle(tabId: string): string {
    const sysTab = this.workspaceData?.systemTabs?.[tabId as SystemTabId];
    if (sysTab?.title) return sysTab.title;
    // Sidebar tabs embed appType in the ID
    const appType = this._getSystemTabAppType(tabId);
    if (appType !== "unknown") {
      const names: Record<string, string> = {
        "workspace-manager": "Workspaces",
        settings: "Settings",
        explorer: "Explorer",
        git: "History",
        search: "Search",
      };
      return names[appType] ?? appType;
    }
    return tabId;
  }

  private _getSystemTabAppType(tabId: string): string {
    const sysTab = this.workspaceData?.systemTabs?.[tabId as SystemTabId];
    if (sysTab?.appType) return sysTab.appType;
    const match = tabId.match(/^editor-sys-([a-z-]+)-\d+$/);
    return match?.[1] ?? "unknown";
  }

  private _getSystemTabPinned(tabId: string): boolean {
    const sysTab = this.workspaceData?.systemTabs?.[tabId as SystemTabId];
    return sysTab?.pinned ?? false;
  }

  // ═══ Grid tab prefix icons ─────────────────────────────────────────────

  /**
   * Compute the prefix icon for a grid tab.
   *
   * Only two tab kinds get icons, per the design decision that grid tabs are
   * otherwise indistinguishable from one another:
   *   - Settings grid tabs (a sidebar tab's own settings surface) use the
   *     settings gear icon from the sidebar's settings buttons.
   *   - File editor tabs use the same file-type icon as the explorer sidebar.
   *
   * All other grid tabs (terminal, git repository, etc.) get no icon.
   */
  private _gridTabIcon(tab: {
    appType: string;
    config?: Record<string, unknown>;
  }): string | undefined {
    // Settings grid tabs: any appType that is a registered sidebar tab's
    // settings surface. Matched against the registry at render time so
    // extension-provided settings tabs are covered too.
    if (this._isSettingsGridAppType(tab.appType)) {
      return settingsIcon(14);
    }

    // File editor tabs: reuse the explorer's file-type icon (by filename).
    if (tab.appType === "file-viewer") {
      const filePath = tab.config?.filePath;
      if (typeof filePath === "string" && filePath) {
        return this._sizeIcon(getFileIcon(this._fileNameFromPath(filePath)), 14);
      }
    }

    return undefined;
  }

  /**
   * Material icon SVGs carry only a viewBox (no intrinsic size), so they
   * otherwise render at the browser's default 300x150. Inject explicit
   * width/height (mirroring <file-extension-svg> in the explorer).
   */
  private _sizeIcon(svg: string, size: number): string {
    return svg.replace("<svg", `<svg width="${size}" height="${size}"`);
  }

  private _isSettingsGridAppType(appType: string): boolean {
    return getAllSystemTabRegistrations().some((reg) => reg.settings?.appType === appType);
  }

  private _fileNameFromPath(filePath: string): string {
    const parts = filePath.split(/[\\/]/).filter(Boolean);
    return parts.length ? parts[parts.length - 1] : filePath;
  }

  // ═══ Render ──────────────────────────────────────────────────────────

  render(): TemplateResult | typeof nothing {
    const win = this.windowData;
    const ws = this.workspaceData;
    if (!win) return nothing;

    // Build tab-data and active-tab-ids for <tab-grid>
    const tabData: Record<
      string,
      { title: string; content: string; pinned: boolean; icon?: string }
    > = {};
    const activeTabIds: Record<string, string> = {};
    for (const p of win.grid.placements) {
      const col = String(p.position.col);
      activeTabIds[col] = p.activeTabId ?? p.tabIds[0] ?? "";
      for (const tabId of p.tabIds) {
        const tidStr = String(tabId);
        const tab = ws?.editorTabs?.[tabId];
        const pinned = tab ? !tab.isPreview : true;
        tabData[tidStr] = {
          title: tab?.title ?? "untitled",
          content: "",
          pinned,
          icon: tab ? this._gridTabIcon(tab) : undefined,
        };
      }
    }

    const effectiveCols = Math.max(1, win.grid.cols);
    const placements =
      win.grid.placements.length > 0
        ? win.grid.placements.map((p) => ({ position: { ...p.position }, tabIds: [...p.tabIds] }))
        : [{ position: { row: 0, col: 0 }, tabIds: [] as string[] }];

    // Resolve system tab data for sidebars (shared across the workspace)
    const leftSysTabs = (ws?.sidebar?.leftSidebarTabs ?? []).map((id) => ({
      id,
      title: this._getSystemTabTitle(id),
      appType: this._getSystemTabAppType(id),
      pinned: this._getSystemTabPinned(id),
    }));
    const rightSysTabs = (ws?.sidebar?.rightSidebarTabs ?? []).map((id) => ({
      id,
      title: this._getSystemTabTitle(id),
      appType: this._getSystemTabAppType(id),
      pinned: this._getSystemTabPinned(id),
    }));

    return html`
      <style>
        .sidebar-element-hidden {
          display: none !important;
        }

        /* ── Resize notches (like sidebar notches but owned by windowview) ── */
        .wv-notch-v {
          width: ${NOTCH_WIDTH}px;
          flex-shrink: 0;
          cursor: col-resize;
          position: relative;
          /* Above the settings drawer host (z-index:1001) AND above the
           * anchor sidebar (openp41ge-sidebar.wv-drawer-anchor, z-index:
           * 1003) — while a drawer is open that anchor sidebar is raised above
           * the drawer's dim mask, and without this it would paint over the
           * notch and cover all but the 3px of the drag-line that sits over
           * the grid, leaving only ~1px visible. Raising the notch above it
           * keeps the whole sidebar drag bar (and its hover highlight) over
           * the anchor sidebar and fully grabbable. */
          z-index: 1004;
          background: transparent;
          /* Asymmetric negative margins cancel the 7px width to a ZERO-width
             flex track (margin-box 7 - 3 - 4 = 0), so the sidebar border sits
             flush against the grid — no hairline gap — while the 7px element
             and its hover highlight bar still overlap the boundary. */
          margin-left: -${NOTCH_OVERFLOW}px;
          margin-right: -${NOTCH_WIDTH - NOTCH_OVERFLOW}px;
        }
        /* Animated spring-back for the sidebar when released after a rubber-band
           overrun. The class is added just before the width change and removed
           once the transition finishes; during the drag itself it is absent so
           the sidebar tracks the pointer without lag. */
        openp41ge-sidebar.wv-springing {
          transition:
            flex-basis 0.18s ease,
            max-width 0.18s ease;
        }
        /* While a settings drawer is open from a sidebar, that anchor sidebar is
         * raised above the drawer host's full-window dim mask (z-index:1001) so
         * it stays bright and interactive instead of being greyed out by it.
         * The other sidebar stays under the mask. */
        openp41ge-sidebar.wv-drawer-anchor {
          position: relative;
          z-index: 1003;
        }
        /* A sidebar's resize notch whose OPPOSING sidebar has an open drawer:
         * the drawer's far edge sits exactly under this notch when it spans the
         * full grid width, so the notch must not intercept the pointer — let
         * the drawer's own resize handle win the drag instead of the opposing
         * sidebar stealing it. */
        .wv-notch-v.wv-notch-disabled {
          cursor: default;
          pointer-events: none;
        }
      </style>
      <div class="flex flex-col w-full h-full bg-surface relative">
        <openp41ge-titlebar
          .windowData=${win}
          .leftSidebarVisible=${ws?.sidebar?.leftSidebarOpen ?? false}
          .rightSidebarVisible=${ws?.sidebar?.rightSidebarOpen ?? false}
        ></openp41ge-titlebar>

        <div class="openp41ge-main-area flex flex-1 overflow-hidden min-h-0 relative">
          <!-- Left sidebar -->
          <openp41ge-sidebar
            side="left"
            .windowId=${win.id}
            .workspaceData=${ws}
            .systemTabs=${leftSysTabs}
            .activeTabId=${win.sidebar?.activeLeftTab ?? null}
            .isOpen=${ws?.sidebar?.leftSidebarOpen ?? false}
            class="sidebar-element ${ws?.sidebar?.leftSidebarOpen ? "" : "sidebar-element-hidden"} ${this._drawerOpenSide === "left" ? "wv-drawer-anchor" : ""}"
            style="flex: 0 1 ${this._leftWidth}px; max-width: min(${this._leftWidth}px, 35vw)"
          ></openp41ge-sidebar>

          <!-- Left resize notch (between left sidebar and grid) -->
          <div
            class="wv-notch-v left-notch ${ws?.sidebar?.leftSidebarOpen ? "" : "sidebar-element-hidden"} ${this._notchDisabled("left") ? "wv-notch-disabled" : ""}"
            @mousedown=${(e: MouseEvent) => this._onResizeStart(e, "left")}
            @mouseenter=${() => this._setDragLine("left", true)}
            @mouseleave=${() => this._setDragLine("left", false)}
          >
            <drag-line orientation="vertical" style="left:1px"></drag-line>
            <drag-line-overdraw></drag-line-overdraw>
          </div>

          <!-- Central area: grid always renders -->
          <div class="flex flex-col flex-1 overflow-hidden" style="min-width:280px">
            <div
              class="wv-code openp41ge-grid-area relative overflow-hidden flex-1"
              style="--wv-code-min:200px"
            >
              <tab-grid
                winId=${win.id}
                .cols=${effectiveCols}
                .placements=${placements}
                .tabData=${tabData}
                .activeTabIds=${activeTabIds}
                .edgeLeft=${!(ws?.sidebar?.leftSidebarOpen ?? false)}
                .edgeRight=${!(ws?.sidebar?.rightSidebarOpen ?? false)}
              ></tab-grid>
              <!-- Experimental "negative drawer" settings host: overlays the
                   grid from the sidebar edge instead of opening a settings tab. -->
              <openp41ge-settings-drawer-host
                @drawer-open-changed=${this._onDrawerOpenChanged}
              ></openp41ge-settings-drawer-host>
            </div>
          </div>

          <!-- Right resize notch (between grid and right sidebar) -->
          <div
            class="wv-notch-v right-notch ${ws?.sidebar?.rightSidebarOpen ? "" : "sidebar-element-hidden"} ${this._notchDisabled("right") ? "wv-notch-disabled" : ""}"
            @mousedown=${(e: MouseEvent) => this._onResizeStart(e, "right")}
            @mouseenter=${() => this._setDragLine("right", true)}
            @mouseleave=${() => this._setDragLine("right", false)}
          >
            <drag-line orientation="vertical" style="right:2px"></drag-line>
            <drag-line-overdraw></drag-line-overdraw>
          </div>

          <!-- Right sidebar -->
          <openp41ge-sidebar
            side="right"
            .windowId=${win.id}
            .workspaceData=${ws}
            .systemTabs=${rightSysTabs}
            .activeTabId=${win.sidebar?.activeRightTab ?? null}
            .isOpen=${ws?.sidebar?.rightSidebarOpen ?? false}
            class="sidebar-element ${ws?.sidebar?.rightSidebarOpen ? "" : "sidebar-element-hidden"} ${this._drawerOpenSide === "right" ? "wv-drawer-anchor" : ""}"
            style="flex: 0 1 ${this._rightWidth}px; max-width: min(${this._rightWidth}px, 35vw)"
          ></openp41ge-sidebar>
        </div>
      </div>
    `;
  }

  updated(): void {
    // Continue populated sidebars' grid-side dividers up past the title-bar
    // seam, continue each open sidebar's bottom-bar top border into the empty
    // grid, and continue each grid-interior cell divider up past the seam.
    // Re-placed on every render so sidebar drags, cell resizes and window
    // resizes keep the lines over their anchors.
    this._placeSidebarDividerOverdraws();
    this._placeSidebarFooterOverdraws();
    this._placeSidebarTabBarOverdraws();
    this._placeGridTabBarOverdraws();
    this._placeCellDividerOverdraws();
    this._syncSidebarSepOverdraws();
    this._syncOverdrawLoop();
    // Context menu is shown synchronously from the event handler
  }

  // ═══ Context menu ─────────────────────────────────────────────────────

  private async _updateContextMenu(_win?: Window): Promise<void> {
    if (!this._contextMenu) return;
    const w = _win ?? this.windowData;
    if (!w) return;

    const items: Array<{ label: string; id: string }> = [];
    if (this._contextMenu?.paneId) {
      items.push({ label: "Move to new window", id: "detach-tab-window" });
      items.push({ label: "Close", id: "close-tab" });
    }

    setContextMenuActive(true);
    const blockNextMousedown = (e: MouseEvent) => {
      e.stopImmediatePropagation();
      e.preventDefault();
      document.removeEventListener("mousedown", blockNextMousedown, true);
    };
    document.addEventListener("mousedown", blockNextMousedown, true);
    const id = await window.openp41ge.showContextMenu(items);
    document.removeEventListener("mousedown", blockNextMousedown, true);
    setTimeout(() => setContextMenuActive(false), 0);
    if (!id) {
      this._contextMenu = null;
      return;
    }

    switch (id) {
      case "detach-tab-window":
        if (this._contextMenu?.paneId) {
          window.openp41ge.workspace.detachTab(w.id, this._contextMenu.paneId, {
            x: 100,
            y: 100,
            width: 800,
            height: 600,
          });
        }
        break;
      case "close-tab":
        if (this._contextMenu?.paneId) {
          emitEvent("tab-remove-from-cell", { windowId: w.id, paneId: this._contextMenu.paneId });
        }
        break;
    }
    this._contextMenu = null;
  }
}

customElements.define("openp41ge-windowview", Openp41geWindowView);
