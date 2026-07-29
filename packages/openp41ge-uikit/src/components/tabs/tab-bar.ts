/**
 * <tab-bar> — renders tab buttons with drag support, close buttons,
 * and drop indicator.
 *
 * Light DOM for compatibility with elementFromPoint in the orchestrator.
 * Manages its own TabBarDropTarget internally.
 */

import { LitElement, html, nothing } from "lit";
import { property } from "lit/decorators.js";
import { TabBarDropTarget } from "openp41ge-tabs/targets/tab-bar-drop-target";
import { getDropIndexInBar } from "openp41ge-tabs/boundary";

/** Scroll speed for overflowing tab text (pixels per second). */
const TAB_TEXT_SCROLL_SPEED = 40;

/** Fixed pause at each end of the slide (seconds). */
const TAB_SCROLL_PAUSE = 0.5;

export class TabBar extends LitElement {
  @property({ type: Array }) tabIds: string[] = [];
  @property({ type: Object }) tabs: Record<string, { title: string; pinned?: boolean }> = {};
  @property({ type: String }) activeTabId: string = "";
  @property({ type: String }) winId: string = "";
  @property({ type: Number }) col: number = 0;
  @property({ type: Boolean }) focused: boolean = false;

  private _dropTarget: TabBarDropTarget | null = null;
  private _indicatorEl: HTMLElement | null = null;
  private _fadeLeftEl: HTMLElement | null = null;
  private _fadeRightEl: HTMLElement | null = null;

  /** Expose the internal drop target for the orchestrator's target resolver. */
  get dropTarget(): TabBarDropTarget | null {
    return this._dropTarget;
  }

  /** The underlying bar container element. */
  get barElement(): HTMLElement | null {
    return (this.renderRoot?.querySelector(".tab-bar-container") as HTMLElement) ?? null;
  }

  private _scrollAnimations = new WeakMap<HTMLElement, Animation>();

  disconnectedCallback(): void {
    super.disconnectedCallback();
    const barEl = this.barElement;
    if (barEl) {
      barEl.removeEventListener("scroll", this);
    }
  }

  createRenderRoot() {
    return this; // Light DOM
  }

  firstUpdated() {
    const barEl = this.barElement;
    if (barEl) {
      this._dropTarget = new TabBarDropTarget(barEl, this.winId, this.col);
      this._setupIndicator(barEl);
    }
    this._fadeLeftEl =
      (this.renderRoot?.querySelector(".tab-bar-fade-left") as HTMLElement) ?? null;
    this._fadeRightEl =
      (this.renderRoot?.querySelector(".tab-bar-fade-right") as HTMLElement) ?? null;
    this._updateFades();
    barEl?.addEventListener("scroll", this);
  }

  updated(changedProperties: Map<string, unknown>) {
    if (changedProperties.has("winId") || changedProperties.has("col")) {
      const barEl = this.barElement;
      if (barEl) {
        this._dropTarget = new TabBarDropTarget(barEl, this.winId, this.col);
      }
    }
    if (changedProperties.has("tabIds")) {
      // Re-evaluate fade visibility after tab list changes
      requestAnimationFrame(() => this._updateFades());
    }
    if (changedProperties.has("activeTabId") && this.activeTabId) {
      requestAnimationFrame(() => this._scrollToTab(this.activeTabId));
    }
  }

  /** @deprecated Use scrollToTab instead. */
  private _scrollToTab(tabId: string): void {
    this.scrollToTab(tabId);
  }

  // ── Scroll fade management ───────────────────────────────────────────-

  /**
   * Event listener interface: called by addEventListener("scroll", this)
   * because TabBar implements EventListener (has handleEvent).
   */
  handleEvent(_e: Event): void {
    this._updateFades();
  }

  private _updateFades(): void {
    const barEl = this.barElement;
    if (!barEl || !this._fadeLeftEl || !this._fadeRightEl) return;

    const canScrollLeft = barEl.scrollLeft > 0;
    const canScrollRight = barEl.scrollLeft < barEl.scrollWidth - barEl.clientWidth - 1;

    this._fadeLeftEl.classList.toggle("tab-bar-fade-visible", canScrollLeft);
    this._fadeRightEl.classList.toggle("tab-bar-fade-visible", canScrollRight);
  }

  // ── Tab text scroll animation ────────────────────────────────────────

  /** Scroll the tab bar so the tab with the given id is visible. */
  scrollToTab(tabId: string): void {
    requestAnimationFrame(() => {
      const barEl = this.barElement;
      if (!barEl) return;
      const tabBtn = barEl.querySelector(`[data-tab-id="${tabId}"]`) as HTMLElement | null;
      if (!tabBtn) return;

      const containerRect = barEl.getBoundingClientRect();
      const tabRect = tabBtn.getBoundingClientRect();

      // Tab is already fully visible
      if (tabRect.left >= containerRect.left && tabRect.right <= containerRect.right) return;

      const scrollOffset = tabRect.left - containerRect.left + barEl.scrollLeft - 8;
      barEl.scrollLeft = scrollOffset;
    });
  }

  private _startTextScroll(tabEl: HTMLElement): void {
    const inner = tabEl.querySelector(".tab-text-inner") as HTMLElement | null;
    if (!inner) return;

    const textWidth = inner.scrollWidth;
    const visibleWidth = inner.clientWidth;
    if (textWidth <= visibleWidth || textWidth === 0) return;

    const scrollDist = textWidth - visibleWidth + 8;

    inner.style.textOverflow = "clip";
    inner.style.overflow = "visible";

    // Cancel any existing animation on this element
    const existing = this._scrollAnimations.get(inner);
    if (existing) {
      existing.cancel();
    }

    const scrollTime = scrollDist / TAB_TEXT_SCROLL_SPEED;
    const pauseTime = TAB_SCROLL_PAUSE;
    const totalDuration = scrollTime * 2 + pauseTime * 2;

    const p1 = pauseTime / totalDuration;
    const p2 = (pauseTime + scrollTime) / totalDuration;
    const p3 = (pauseTime * 2 + scrollTime) / totalDuration;

    const anim = inner.animate(
      [
        { transform: "translateX(0)", offset: 0 },
        { transform: "translateX(0)", offset: p1 },
        { transform: `translateX(-${scrollDist}px)`, offset: p2 },
        { transform: `translateX(-${scrollDist}px)`, offset: p3 },
        { transform: "translateX(0)", offset: 1 },
      ],
      {
        duration: totalDuration * 1000,
        iterations: Infinity,
        easing: "linear",
      },
    );

    this._scrollAnimations.set(inner, anim);
  }

  private _stopTextScroll(tabEl: HTMLElement): void {
    const inner = tabEl.querySelector(".tab-text-inner") as HTMLElement | null;
    if (!inner) return;
    const anim = this._scrollAnimations.get(inner);
    if (anim) {
      anim.cancel();
      this._scrollAnimations.delete(inner);
    }
    inner.style.textOverflow = "ellipsis";
    inner.style.overflow = "hidden";
  }

  // ── Drop indicator management ─────────────────────────────────────────

  private _setupIndicator(barEl: HTMLElement) {
    if (!this._indicatorEl) {
      this._indicatorEl = document.createElement("div");
      this._indicatorEl.className = "tab-drop-indicator";
      this._indicatorEl.style.cssText =
        "position:absolute;top:6px;bottom:6px;width:2px;background:rgb(74,158,255);display:none;pointer-events:none;z-index:10;";
      barEl.style.position = "relative";
      barEl.appendChild(this._indicatorEl);
    }
  }

  /** Show the drop indicator at the position determined by clientX. */
  showDropIndicator(clientX: number) {
    const barEl = this.barElement;
    if (!barEl || !this._indicatorEl) return;

    const dropIndex = getDropIndexInBar(barEl, clientX);
    const children = Array.from(barEl.children).filter(
      (c): c is HTMLElement => c instanceof HTMLElement && c !== this._indicatorEl && true,
    );

    let pos: number;
    if (children.length === 0 || dropIndex <= 0) {
      pos = 0;
    } else if (dropIndex >= children.length) {
      const last = children[children.length - 1];
      pos = last.offsetLeft + last.offsetWidth;
    } else {
      pos = children[dropIndex].offsetLeft;
    }

    this._indicatorEl.style.display = "block";
    this._indicatorEl.style.left = `${pos}px`;
  }

  /** Hide the drop indicator. */
  hideDropIndicator() {
    if (this._indicatorEl) {
      this._indicatorEl.style.display = "none";
    }
  }

  /** Get the insertion index for a given cursor clientX. */
  getInsertionIndex(clientX: number): number {
    const barEl = this.barElement;
    if (!barEl) return 0;
    return getDropIndexInBar(barEl, clientX);
  }

  /** Get a specific tab button element by tab ID. */
  getTabButton(tabId: string): HTMLElement | null {
    return (this.renderRoot?.querySelector(`[data-tab-id="${tabId}"]`) as HTMLElement) ?? null;
  }

  // ── Render ────────────────────────────────────────────────────────────

  render() {
    if (this.tabIds.length === 0) return nothing;
    return html`
      <style>
        .tab-close {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          margin-left: 4px;
          font-size: 12px;
          color: #666;
          cursor: pointer;
          width: 16px;
          height: 16px;
          flex-shrink: 0;
          border-radius: 4px;
          transition:
            background 0.15s,
            color 0.15s;
        }
        .tab-close:hover {
          background: rgba(255, 50, 50, 0.3);
          color: #ff3232;
        }
      </style>
      <div class="tab-bar-wrapper" style="position:relative;flex:1;min-width:0;">
        <div
          class="tab-bar-container"
          style="display:flex;align-items:center;height:36px;background:#181818;overflow-x:auto;overflow-y:hidden;scrollbar-width:none;-ms-overflow-style:none;"
        >
          <style>
            .tab-bar-container::-webkit-scrollbar {
              display: none;
              width: 0;
              height: 0;
            }
            .tab-bar-fade-left,
            .tab-bar-fade-right {
              position: absolute;
              top: 0;
              bottom: 0;
              width: 30px;
              pointer-events: none;
              z-index: 5;
              opacity: 0;
              transition: opacity 0.12s ease;
            }
            .tab-bar-fade-visible {
              opacity: 1;
            }
            .tab-bar-fade-left {
              left: 0;
              background: linear-gradient(to right, var(--tab-bar-bg, #181818), transparent);
            }
            .tab-bar-fade-right {
              right: 0;
              background: linear-gradient(to left, var(--tab-bar-bg, #181818), transparent);
            }
          </style>
          ${this.tabIds.map((id) => {
            const tab = this.tabs[id];
            const isActive = id === this.activeTabId;
            const aBg = this.focused
              ? "background:rgba(74,158,255,0.12);border-bottom:2px solid rgb(74,158,255);color:#eee;"
              : "background:rgba(255,255,255,0.06);color:#ccc;";
            const iBg = "color:#888;";
            return html`
              <div
                role="tab"
                class="tab-btn"
                data-tab-id=${id}
                style=${`display:inline-flex;align-items:center;flex-shrink:0;min-width:var(--tab-min-width,120px);max-width:75%;height:34px;padding:0 8px;border-right:1px solid #333;cursor:pointer;font-size:12px;line-height:34px;user-select:none;white-space:nowrap;font-style:${tab && (tab.pinned ?? true) ? "normal" : "italic"};${isActive ? aBg : iBg}`}
                @mouseenter=${(e: MouseEvent) => this._startTextScroll(e.currentTarget as HTMLElement)}
                @mouseleave=${(e: MouseEvent) => this._stopTextScroll(e.currentTarget as HTMLElement)}
              >
                <div
                  class="tab-text-container"
                  style="flex:1;overflow:hidden;min-width:0;padding:0 0 0 8px;display:flex;align-items:center;"
                >
                  <span
                    class="tab-text-inner"
                    style="white-space:nowrap;display:inline-block;overflow:hidden;text-overflow:ellipsis;"
                    >${tab ? tab.title : id}</span
                  >
                </div>
                <span class="tab-close" data-close-tab-id=${id}>×</span>
              </div>
            `;
          })}
        </div>
        <div class="tab-bar-fade-left"></div>
        <div class="tab-bar-fade-right"></div>
      </div>
    `;
  }
}

customElements.define("tab-bar", TabBar);
