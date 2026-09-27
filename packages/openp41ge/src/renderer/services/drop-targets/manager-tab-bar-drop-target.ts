/**
 * ManagerTabBarDropTarget — drop target for the Application Management window's
 * tab bar (`.wm-tabbar`).
 *
 * Only manager-tab drags may land here. A successful drop fires a composed
 * `manager-tab-reorder` CustomEvent on the bar, which the host
 * (<openp41ge-window-manager>) listens for to reorder its `_openTabs` state.
 *
 * While the cursor hovers the bar, a standard blue vertical drop indicator
 * marks the insertion gap — identical to the grid/sidebar tab-bar indicator.
 * The indicator lives in the bar's shadow DOM (the component's own shadow
 * root), so the target holds a direct reference to the bar element and appends
 * the line there; it never relies on document-level querying.
 */

import type {
  IDragSource,
  IDropTarget,
  TargetFeedback,
  DragResult,
} from "../../interfaces/drag-handler";
import { attachDropTipVerticalOverdraws } from "openp41ge-uikit";

/** Event fired on the bar when a manager tab is dropped to reorder it. */
export const MANAGER_TAB_REORDER_EVENT = "manager-tab-reorder";

/** Blue insert line — matches the grid/sidebar tab-bar insert marker. The
 *  look (3px solid blue + glow) is applied directly on the element, and the
 *  class remains only as an identity marker for drag-capture hiding. */
const INDICATOR_CLASS = "wm-tab-drop-indicator";

export function managerTabButtons(bar: HTMLElement): HTMLElement[] {
  return Array.from(bar.querySelectorAll<HTMLElement>(".wm-tab"));
}

/** Compute the insertion index for `clientX` within the bar (0..tabs.length). */
export function managerDropIndex(bar: HTMLElement, clientX: number): number {
  const barRect = bar.getBoundingClientRect();
  const relX = clientX - barRect.left;
  const buttons = managerTabButtons(bar);
  for (let i = 0; i < buttons.length; i++) {
    const r = buttons[i].getBoundingClientRect();
    const mid = r.left - barRect.left + r.width / 2;
    if (relX < mid) return i;
  }
  return buttons.length;
}

export class ManagerTabBarDropTarget implements IDropTarget {
  readonly type = "manager-tab-bar";
  readonly element: HTMLElement;

  private _indicator: HTMLElement | null = null;
  /** The bar is a scroll container in the component's shadow root; give it a
   *  positioning context so the absolutely-positioned indicator can live in
   *  its content coordinate space (and scroll with the tabs). */
  private _positioned = false;

  constructor(barEl: HTMLElement) {
    this.element = barEl;
  }

  onHover(source: IDragSource, clientX: number, _clientY: number): TargetFeedback | null {
    // Only manager tabs can be dropped on a management tab bar.
    if (source.type !== "manager-tab") return null;
    this._showIndicator(clientX);
    return { cssClass: "wm-tabbar--drop-active", overTabBar: true };
  }

  onDrop(source: IDragSource, clientX: number, _clientY: number): Promise<DragResult> {
    if (source.type !== "manager-tab") {
      this.onLeave();
      return Promise.resolve({ success: false, reason: "unsupported source" });
    }
    const data = source.getDragData();
    const tabId = (data as { tabId?: string }).tabId;
    if (!tabId) {
      this.onLeave();
      return Promise.resolve({ success: false, reason: "missing tabId" });
    }

    const fromIndex = managerTabButtons(this.element).findIndex(
      (btn) => btn.getAttribute("data-manager-tab") === tabId,
    );
    const dropIndex = managerDropIndex(this.element, clientX);
    // Removing the tab first shifts a forward insertion down by one.
    const toIndex = fromIndex >= 0 && dropIndex > fromIndex ? dropIndex - 1 : dropIndex;

    this.onLeave();
    this._fire({
      tabId,
      fromIndex,
      toIndex: Math.max(0, toIndex),
    });
    return Promise.resolve({ success: true });
  }

  onLeave(): void {
    this._hideIndicator();
  }

  /** Show the blue insertion line at the gap under `clientX`. Used for the
   *  cross-window ghost preview (no live source exists locally). */
  showIndicator(clientX: number): void {
    this._ensurePositioned();
    const index = managerDropIndex(this.element, clientX);
    const buttons = managerTabButtons(this.element);
    const gapX = index < buttons.length ? buttons[index].offsetLeft : this.element.scrollWidth;
    // Place the line at the gap, accounting for the bar's horizontal scroll.
    const ind = this._getIndicator();
    ind.style.left = `${Math.max(0, gapX - 1)}px`;
    ind.style.display = "block";
  }

  private _ensurePositioned(): void {
    if (!this._positioned) {
      this._positioned = true;
      this.element.style.position = "relative";
      this.element.style.overflowX = "auto";
    }
  }

  private _showIndicator(clientX: number): void {
    this.showIndicator(clientX);
  }

  private _hideIndicator(): void {
    if (this._indicator) {
      this._indicator.style.display = "none";
    }
  }

  private _fire(detail: { tabId: string; fromIndex: number; toIndex: number }): void {
    const event = new CustomEvent(MANAGER_TAB_REORDER_EVENT, {
      bubbles: true,
      composed: true,
      detail,
    });
    this.element.dispatchEvent(event);
  }

  /** Lazily create the indicator element inside the bar (shadow DOM). */
  private _getIndicator(): HTMLElement {
    if (this._indicator) return this._indicator;
    // A plain div (NOT a <drop-line>): the drop-line renders in shadow DOM with
    // no slot, so its appended children (the vertical overdraw strokes) would
    // never paint. A plain div's light-DOM children render — matching the
    // grid/sidebar indicators exactly.
    const el = document.createElement("div");
    el.className = INDICATOR_CLASS;
    el.style.cssText =
      "position:absolute;top:0;bottom:0;width:3px;background:rgb(74,158,255);box-shadow:0 0 10px rgba(74,158,255,0.6);display:none;pointer-events:none;z-index:9;border-radius:0;";
    // Continue the line past the bar's top/bottom edges (vertical overdraw
    // strokes), matching the grid/sidebar tab-bar drop indicators.
    attachDropTipVerticalOverdraws(el);
    this.element.appendChild(el);
    this._indicator = el;
    return el;
  }
}
