/**
 * TabBarDropTarget — handles drops on a cell's tab bar for reordering.
 *
 * Visual feedback:
 *   - Shows a vertical tab-insert indicator between tab buttons
 *   - Manages the indicator element on the tab bar DOM
 */

import type {
  IDragSource,
  IDropTarget,
  DragResult,
  TargetFeedback,
} from "../../interfaces/drag-handler";

export class TabBarDropTarget implements IDropTarget {
  readonly type = "tab-bar";

  readonly element: HTMLElement;
  private _commandBus: { dispatch: (fn: string, ...args: unknown[]) => void };
  private _winId: string;
  /** @deprecated Use _winId + _col for routing; worksetId is not an operation argument. */
  private _worksetId: string;
  private _col: number;
  private _indicatorEl: HTMLElement | null = null;

  constructor(
    barEl: HTMLElement,
    winId: string,
    worksetId: string,
    col: number,
    commandBus: { dispatch: (fn: string, ...args: unknown[]) => void },
  ) {
    this.element = barEl;
    this._winId = winId;
    this._worksetId = worksetId;
    this._col = col;
    this._commandBus = commandBus;
  }

  onHover(_source: IDragSource, clientX: number, _clientY: number): TargetFeedback | null {
    const dropIndex = this._getDropIndex(clientX);
    this._showIndicator(dropIndex);
    return {
      indicatorKey: `tab-bar-${this._winId}-${this._worksetId}-${this._col}`,
    };
  }

  async onDrop(source: IDragSource, clientX: number, _clientY: number): Promise<DragResult> {
    this._hideIndicator();

    const data = source.getDragData();
    if (data.type !== "tab") {
      return { success: false, reason: "only tabs can be dropped on tab bars" };
    }

    const dropIndex = this._getDropIndex(clientX);
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
        // NOTE: reorderTabsInCell signature is (winId, row, col, fromIdx, toIdx).
        // The row param is the placement row (always 0 for single-row grids).
        // WorksetId/openp41ge-id is NOT an operation argument — it is implicit in
        // the command bus / IPC routing.
        this._commandBus.dispatch(
          "reorderTabsInCell",
          this._winId,
          0,
          this._col,
          fromIndex,
          adjustedDrop,
        );
      }
      return { success: true };
    }

    // Cross-cell move: tab is from a different cell's tab bar
    // Source info comes from the drag data payload
    // NOTE: moveTabBetweenCells signature:
    //   (sourceWindowId, tabId, targetWindowId, targetRow, targetCol, insertAt?, focusTabId?)
    this._commandBus.dispatch(
      "moveTabBetweenCells",
      data.winId,
      data.tabId,
      this._winId,
      0,
      this._col,
      dropIndex,
    );
    return { success: true };
  }

  onLeave(): void {
    this._hideIndicator();
  }

  // ── Private helpers ──────────────────────────────────────────────────

  private _getDropIndex(clientX: number): number {
    const barRect = this.element.getBoundingClientRect();
    const relX = clientX - barRect.left;
    const children = Array.from(this.element.children).filter(
      (c) => c instanceof HTMLElement,
    ) as HTMLElement[];

    let accumulated = 0;
    for (let i = 0; i < children.length; i++) {
      const w = children[i].getBoundingClientRect().width;
      if (relX < accumulated + w / 2) return i;
      accumulated += w;
    }
    return children.length;
  }

  private _showIndicator(dropIndex: number): void {
    if (!this._indicatorEl) {
      this._indicatorEl = document.createElement("div");
      this._indicatorEl.className = "tab-drop-indicator";
      this._indicatorEl.style.cssText =
        "position:absolute;top:4px;bottom:4px;width:2px;background:var(--accent-hover);display:none;pointer-events:none;z-index:10;";
      this.element.appendChild(this._indicatorEl);
    }

    const children = Array.from(this.element.children).filter(
      (c) => c instanceof HTMLElement && c !== this._indicatorEl,
    ) as HTMLElement[];

    let pos: number;
    if (children.length === 0 || dropIndex <= 0) {
      pos = 0;
    } else if (dropIndex >= children.length) {
      const last = children[children.length - 1];
      pos = last.offsetLeft + last.offsetWidth;
    } else {
      const child = children[dropIndex];
      pos = child.offsetLeft;
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
