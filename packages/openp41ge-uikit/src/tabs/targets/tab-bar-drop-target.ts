/**
 * TabBarDropTarget — handles drops on a cell's tab bar for reordering.
 *
 * Fires CustomEvents on `this.element` for drop operations.
 * The host application (openp41ge) listens for these events and routes
 * them to IPC / workspace operations.
 *
 * Events (bubbling):
 *   tab-bar-reorder    — { winId, col, fromIndex, toIndex }
 *   tab-bar-move-cell  — { sourceWinId, tabId, targetWinId, targetCol, dropIndex }
 */

import type { IDragSource, IDropTarget, DragResult, TargetFeedback } from "../interfaces";
import { getDropIndexInBar } from "../boundary";

/**
 * Event types dispatched by TabBarDropTarget.
 */
export const TAB_BAR_EVENTS = {
  REORDER: "tab-bar-reorder",
  MOVE_CELL: "tab-bar-move-cell",
} as const;

export class TabBarDropTarget implements IDropTarget {
  readonly type = "tab-bar";
  readonly element: HTMLElement;

  readonly winId: string;
  private _col: number;
  private _indicatorEl: HTMLElement | null = null;

  constructor(barEl: HTMLElement, winId: string, col: number) {
    this.element = barEl;
    this.winId = winId;
    this._col = col;
  }

  onHover(_source: IDragSource, clientX: number, _clientY: number): TargetFeedback | null {
    const dropIndex = getDropIndexInBar(this.element, clientX);
    this._showIndicator(dropIndex);
    return { indicatorKey: `tab-bar-${this.winId}-${this._col}` };
  }

  async onDrop(source: IDragSource, clientX: number, _clientY: number): Promise<DragResult> {
    this._hideIndicator();

    const data = source.getDragData();
    if (data.type !== "tab") {
      return { success: false, reason: "only tabs can be dropped on tab bars" };
    }

    const dropIndex = getDropIndexInBar(this.element, clientX);
    const tabButtons = this.element.querySelectorAll<HTMLElement>(
      "openp41ge-tab-button, .tab-btn, [data-tab-id]",
    );
    const fromIndex = Array.from(tabButtons).findIndex(
      (btn) => btn.getAttribute("data-tab-id") === data.tabId,
    );

    if (fromIndex >= 0) {
      // Same cell — reorder within
      if (dropIndex !== fromIndex && dropIndex !== fromIndex + 1) {
        const adjustedDrop = dropIndex > fromIndex ? dropIndex - 1 : dropIndex;
        this._fire(TAB_BAR_EVENTS.REORDER, {
          winId: this.winId,
          col: this._col,
          fromIndex,
          toIndex: adjustedDrop,
        });
      }
      return { success: true };
    }

    // Cross-cell move
    this._fire(TAB_BAR_EVENTS.MOVE_CELL, {
      sourceWinId: data.winId,
      tabId: data.tabId,
      targetWinId: this.winId,
      targetCol: this._col,
      dropIndex,
    });
    return { success: true };
  }

  onLeave(): void {
    this._hideIndicator();
  }

  private _fire(type: string, detail: Record<string, unknown>): void {
    this.element.dispatchEvent(new CustomEvent(type, { bubbles: true, detail }));
  }

  private _showIndicator(dropIndex: number): void {
    if (!this._indicatorEl) {
      this._indicatorEl = document.createElement("div");
      this._indicatorEl.className = "tab-drop-indicator";
      this._indicatorEl.style.cssText =
        "position:absolute;top:4px;bottom:4px;width:2px;background:rgb(74,158,255);display:none;pointer-events:none;z-index:10;";
      this.element.appendChild(this._indicatorEl);
    }

    const children = Array.from(this.element.children).filter(
      (c): c is HTMLElement => c instanceof HTMLElement && c !== this._indicatorEl,
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

  private _hideIndicator(): void {
    if (this._indicatorEl) {
      this._indicatorEl.style.display = "none";
    }
  }
}
