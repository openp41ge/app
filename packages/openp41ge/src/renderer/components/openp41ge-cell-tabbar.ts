/**
 * <openp41ge-cell-tabbar> — per-grid-cell tab strip (Lit).
 *
 * Renders tab buttons with labels and close buttons for a single grid cell.
 * Dispatches CustomEvents on activation and close so parent elements can
 * delegate to the command bus without coupling this component to it.
 *
 * Events (bubbling):
 *   cell-tab:activate  — { winId, pageId, tabId }
 *   cell-tab:close     — { winId, pageId, tabId }
 */

import { LitElement, html, nothing, type TemplateResult } from "lit";
import { property } from "lit/decorators.js";
import type { Tab } from "../../layout/types";
import type { IDragHandler } from "../interfaces/drag-handler";
import { TabDragSource } from "../services/drag-sources/tab-drag-source";
import { isOpenp41geGrid } from "../interfaces/element-guards";
import { appServices } from "../app";

// ─── Public data contract ────────────────────────────────────────────────

export interface CellTabBarData {
  tabIds: string[];
  activeTabId?: string;
  getTab: (tabId: string) => Tab | undefined;
  winId: string;
  worksetId: string;
  col: number;
}

/** Scroll speed for overflowing tab text (pixels per second). */
const TAB_TEXT_SCROLL_SPEED = 100;

/** Pause duration at each end of the scroll animation (seconds). */
const TAB_TEXT_SCROLL_PAUSE = 2;

// ─── Global stylesheet for tab text scroll animation ─────────────────────

export function resetTabBarGlobalState(): void {
  _styleSheetInjected = false;
}

let _styleSheetInjected = false;

function ensureScrollStyles(): void {
  if (_styleSheetInjected) return;
  _styleSheetInjected = true;
  const style = document.createElement("style");
  style.textContent = `
    .tab-text-scroll {
      display: inline-block;
      white-space: nowrap;
      animation: tab-text-slide var(--scroll-dur, 6s) linear infinite;
    }
    @keyframes tab-text-slide {
      0%   { transform: translateX(0); }
      15%  { transform: translateX(0); }
      50%  { transform: translateX(var(--scroll-dist, -50px)); }
      65%  { transform: translateX(var(--scroll-dist, -50px)); }
      100% { transform: translateX(0); }
    }
  `;
  document.head.appendChild(style);
}

// ─── Pure drag-start helpers (testable without DOM/timers) ────────────────

/**
 * Result of evaluating a deferred drag-start on a tab button.
 */
export interface DragStartDecision {
  /** Whether the drag should proceed. */
  shouldStart: boolean;
  /** Reason the drag was suppressed (for diagnostics). */
  suppressedBy?: "context-menu-dismiss" | "context-menu-active" | "drag-pending-cancelled";
}

/**
 * Pure function that decides whether a deferred drag-start should proceed.
 *
 * This encapsulates the cancellation logic that was previously inline in
 * the setTimeout callback.  By extracting it, we can unit-test both the
 * "go" and "no-go" paths without relying on real or fake timers.
 *
 * @param dataset - The tab button's dataset (typically `btn.dataset`)
 * @param isContextMenuActive - Whether a context menu is currently showing
 * @returns A DragStartDecision indicating whether the drag should start
 */
export function evaluateDragStart(
  dataset: DOMStringMap,
  isContextMenuActive: boolean,
): DragStartDecision {
  // If a context menu was recently triggered, the subsequent mousedown
  // is just the menu dismissal — suppress the drag.
  if (dataset._ctxDismiss !== undefined) {
    return { shouldStart: false, suppressedBy: "context-menu-dismiss" };
  }

  // If a global context menu is showing, suppress to prevent accidental drags
  if (isContextMenuActive) {
    return { shouldStart: false, suppressedBy: "context-menu-active" };
  }

  // Check if the drag-pending flag was cleared (by contextmenu handler)
  if (dataset._dragPending === undefined || dataset._dragPending === "0") {
    return { shouldStart: false, suppressedBy: "drag-pending-cancelled" };
  }

  // All checks passed — clear the flag and proceed
  delete dataset._dragPending;
  return { shouldStart: true };
}

/**
 * Interface for the drag handler so we can inject mocks in tests.
 */
export interface IDragStarter {
  startDrag(
    source: { type: string; tid: string; winId: string; worksetId: string; label: string },
    clientX: number,
    clientY: number,
  ): void;
}

/**
 * Pure function that determines which drag handler to use and starts the drag.
 *
 * Extracted so tests can verify the handler-selection logic without
 * depending on DOM traversal or the full drag orchestrator.
 */
export function startTabDrag(
  _btn: HTMLElement,
  tid: string,
  winId: string,
  worksetId: string,
  label: string,
  clientX: number,
  clientY: number,
  gridEl: HTMLElement | null,
  unifiedHandler: IDragStarter | null,
  fallbackHandler: ((e: MouseEvent) => void) | null,
): void {
  if (unifiedHandler) {
    const source = { type: "tab", tid, winId, worksetId, label };
    unifiedHandler.startDrag(source, clientX, clientY);
  } else if (fallbackHandler) {
    // Create a synthetic MouseEvent for the deprecated fallback
    const syntheticEvent = new MouseEvent("mousedown", { clientX, clientY, button: 0 });
    fallbackHandler(syntheticEvent);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Openp41geCellTabbar component
// ═══════════════════════════════════════════════════════════════════════════

export class Openp41geCellTabbar extends LitElement {
  /** Render in light DOM so test selectors and parent CSS work. */
  protected createRenderRoot(): HTMLElement | DocumentFragment {
    return this;
  }

  @property({ attribute: false })
  data: CellTabBarData | null = null;

  connectedCallback(): void {
    super.connectedCallback();
    ensureScrollStyles();
  }

  render(): TemplateResult {
    const d = this.data;
    if (!d) return html``;

    const { tabIds, activeTabId, getTab, winId, worksetId, col } = d;

    return html`
      <div
        class="cell-tab-bar"
        style="display:flex;align-items:center;height:32px;background:var(--bg-gutter);flex-shrink:0;overflow-x:auto;overflow-y:hidden;scrollbar-width:none;position:relative;"
      >
        ${tabIds.map((tabId) => {
          const tab = getTab(tabId);
          if (!tab) return nothing;
          const isActive = tabId === (activeTabId ?? tabIds[0]);
          return this._renderTabButton(tab, isActive, winId, worksetId, col);
        })}
      </div>
    `;
  }

  private _renderTabButton(
    tab: Tab,
    isActive: boolean,
    winId: string,
    worksetId: string,
    col: number,
  ): TemplateResult {
    const tid = tab.id;
    const label = tab.title || tab.appType;

    return html`
      <div
        style="display:flex;align-items:stretch;height:32px;cursor:grab;font-size:12px;color:${isActive ? "#e0e0e0" : "#999"};flex-shrink:0;width:160px;border-right:1px solid #222;background:${isActive ? "#2a2a2a" : "transparent"};-webkit-app-region:no-drag;user-select:none;transition:background 0.1s;"
        @mouseenter=${(e: MouseEvent) => {
          const el = e.currentTarget as HTMLElement;
          if (!isActive) el.style.background = "#252525";
          this._startTextScroll(el);
        }}
        @mouseleave=${(e: MouseEvent) => {
          const el = e.currentTarget as HTMLElement;
          if (!isActive) el.style.background = "transparent";
          this._stopTextScroll(el);
        }}
        @contextmenu=${(e: MouseEvent) => {
          const btn = e.currentTarget as HTMLElement;
          // Cancel any pending drag from the initial mousedown (macOS two-finger tap)
          delete btn.dataset._dragPending;
          btn.dataset._ctxDismiss = "1";
        }}
        @mousedown=${(e: MouseEvent) => {
          const btn = e.currentTarget as HTMLElement;
          // If a context menu was recently triggered on this tab, suppress
          // the next mousedown — it's the dismissal click.
          if (btn.dataset._ctxDismiss) {
            delete btn.dataset._ctxDismiss;
            return;
          }
          // Cancel any pending deferred drag
          delete btn.dataset._dragPending;
          // On macOS two-finger tap (right-click), mousedown(button=0) fires
          // before contextmenu. Defer via setTimeout(0) so @contextmenu can
          // cancel by deleting _dragPending.
          btn.dataset._dragPending = "1";
          const clientX = e.clientX;
          const clientY = e.clientY;
          setTimeout(() => {
            const decision = evaluateDragStart(btn.dataset, /* isContextMenuActive= */ false);
            if (!decision.shouldStart) return;

            // Check for unified drag handler on parent grid
            const gridEl = this.closest?.("openp41ge-grid");
            const dh: IDragHandler | null =
              gridEl && isOpenp41geGrid(gridEl)
                ? (gridEl.dragHandler as IDragHandler | null)
                : null;

            if (dh) {
              // Use unified system
              const source = new TabDragSource(btn, tid, winId, worksetId, label);
              dh.startDrag(source, clientX, clientY);
            } else {
              // Fallback: old TabDragHandler
              appServices.tabDragHandler.createDragStarter(
                btn,
                this,
                col,
                isActive,
                worksetId,
                tid,
                winId,
              )(e);
            }
          }, 0);
        }}
        @click=${(e: MouseEvent) => {
          if ((e.target as HTMLElement).closest("[data-close-btn]")) return;
          this._emit("cell-tab:activate", { winId, worksetId, tabId: tid, col });
        }}
        @dblclick=${(e: MouseEvent) => {
          if ((e.target as HTMLElement).closest("[data-close-btn]")) return;
          if (tab.isPreview) {
            this._emit("cell-tab:pin", { winId, worksetId, tabId: tid, col });
          }
        }}
      >
        <div
          class="tab-text-container"
          style="flex:1;overflow:hidden;min-width:0;padding:0 0 0 14px;display:flex;align-items:center;"
        >
          <span
            class="tab-text-inner"
            data-tab-id=${tid}
            style="white-space:nowrap;display:inline-block;overflow:hidden;text-overflow:ellipsis;${tab.isPreview ? "font-style:italic;" : ""}"
            >${label}</span
          >
        </div>
        ${tab.config?.isDirty ? html`<span style="color:#e2b714;font-size:10px;display:flex;align-items:center;flex-shrink:0;" data-dirty-indicator>●</span>` : nothing}
        <span
          data-close-btn=""
          style="width:22px;height:22px;border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:14px;color:var(--text-secondary);cursor:pointer;flex-shrink:0;margin:auto 6px auto 0;-webkit-app-region:no-drag;user-select:none;"
          @mouseenter=${(e: MouseEvent) => {
            const el = e.currentTarget as HTMLElement;
            el.style.background = "rgba(255,255,255,0.12)";
            el.style.color = "#e0e0e0";
          }}
          @mouseleave=${(e: MouseEvent) => {
            const el = e.currentTarget as HTMLElement;
            el.style.background = "transparent";
            el.style.color = "#999";
          }}
          @click=${(e: MouseEvent) => {
            e.stopPropagation();
            this._emit("cell-tab:close", { winId, worksetId, tabId: tid });
          }}
          ><span style="margin-top:-2px;">×</span></span
        >
      </div>
    `;
  }

  /**
   * Start the back-and-forth scroll animation for overflowing tab text.
   */
  private _startTextScroll(tabEl: HTMLElement): void {
    const container = tabEl.querySelector(".tab-text-container") as HTMLElement | null;
    const inner = tabEl.querySelector(".tab-text-inner") as HTMLElement | null;
    if (!container || !inner) return;

    // Read sizes synchronously — layout is already committed by the time
    // the event handler runs, so scrollWidth / clientWidth are correct.
    const textWidth = inner.scrollWidth;
    const containerWidth = container.clientWidth;
    if (textWidth <= containerWidth || textWidth === 0) return;

    // Account for left padding so the text end is fully visible.
    const paddingLeft = parseFloat(getComputedStyle(container).paddingLeft) || 0;
    const scrollDist = textWidth - (containerWidth - paddingLeft);
    const duration = scrollDist / TAB_TEXT_SCROLL_SPEED + TAB_TEXT_SCROLL_PAUSE * 2;

    // Remove text-overflow so the full text is visible during scroll
    inner.style.textOverflow = "clip";
    inner.style.overflow = "visible";

    // Use CSS custom properties for scroll distance and duration
    inner.style.setProperty("--scroll-dist", `-${scrollDist}px`);
    inner.style.setProperty("--scroll-dur", `${duration}s`);
    inner.classList.add("tab-text-scroll");
  }

  /** Stop the scroll animation for a tab. */
  private _stopTextScroll(tabEl: HTMLElement): void {
    const inner = tabEl.querySelector(".tab-text-inner") as HTMLElement | null;
    if (!inner) return;
    inner.classList.remove("tab-text-scroll");
    // Restore text-overflow ellipsis
    inner.style.textOverflow = "ellipsis";
    inner.style.overflow = "hidden";
    inner.style.removeProperty("--scroll-dist");
    inner.style.removeProperty("--scroll-dur");
    // Reset translation
    inner.style.transform = "";
  }

  // ── Event dispatch ─────────────────────────────────────────────────────

  private _emit(type: string, detail: Record<string, unknown>): void {
    this.dispatchEvent(new CustomEvent(type, { bubbles: true, detail }));
  }
}

customElements.define("openp41ge-cell-tabbar", Openp41geCellTabbar);
