/**
 * TabDragSource — provides ghost visuals for dragging a tab button.
 *
 * Creates a ghost element that looks like the tab being dragged,
 * with the tab's label and icon styling.
 */

/* eslint-disable max-classes-per-file */

import type { IDragSource, DragSourceData, DragResult } from "../../interfaces/drag-handler";

export class TabDragSource implements IDragSource {
  readonly type: string = "tab";

  private _tabBtn: HTMLElement;
  private _tabId: string;
  private _winId: string;
  private _worksetId: string;
  private _title: string;
  private _ghost: HTMLElement | null = null;
  /** Pre-read dimensions from the source tab button (always in-DOM) */
  private _ghostH = 0;
  private _ghostW = 0;

  constructor(
    tabBtn: HTMLElement,
    tabId: string,
    winId: string,
    worksetId: string,
    title?: string,
  ) {
    this._tabBtn = tabBtn;
    this._tabId = tabId;
    this._winId = winId;
    this._worksetId = worksetId;
    this._title = title || tabBtn.textContent?.trim() || "Tab";
    // Pre-read dimensions in constructor so they're available even if the
    // source tab is later removed from the DOM before createGhost().
    this._ghostH = this._tabBtn.offsetHeight;
    this._ghostW = this._tabBtn.offsetWidth;
  }

  createGhost(): HTMLElement {
    const ghost = document.createElement("div");
    ghost.classList.add("openp41ge-drag-ghost");
    // Use a child span for the label — direct text nodes can behave
    // unpredictably in various CSS contexts.
    const label = document.createElement("span");
    label.textContent = this._title;
    ghost.appendChild(label);

    // Center text via explicit padding rather than display:flex/align-items.
    // Flex centering gets stripped between paint cycles during drag for
    // reasons that are still unclear. Padding-based centering is immune.
    const fontSize = 12;
    // Approximate line-height for 12px text in a 32px container
    const lineH = Math.round(fontSize * 1.2);
    const padV = Math.max(0, Math.round((this._ghostH - lineH) / 2));

    ghost.style.cssText = [
      "position:fixed",
      `height:${this._ghostH}px`,
      `width:${this._ghostW}px`,
      `padding:${padV}px 14px`,
      "display:block",
      "line-height:14px",
      `font-size:${fontSize}px`,
      "color:#e0e0e0",
      "background:#2a2a2a",
      "border-radius:4px",
      "outline:2px solid rgba(74,158,255,0.60)",
      "outline-offset:2px",
      "box-shadow:0 4px 12px rgba(0,0,0,0.3)",
      "z-index:99999",
      "pointer-events:none",
      "opacity:0.85",
      "overflow:hidden",
      "white-space:nowrap",
      "text-overflow:ellipsis",
      "box-sizing:border-box",
    ].join(";");

    // Expose pre-read dimensions as data attributes so the handler can
    // position the ghost without reading offsetWidth/offsetHeight on the
    // freshly-appended element.
    ghost.dataset.dragGhostWidth = String(this._ghostW);
    ghost.dataset.dragGhostHeight = String(this._ghostH);
    this._ghost = ghost;
    return ghost;
  }

  getDragData(): DragSourceData {
    return {
      type: "tab",
      tabId: this._tabId,
      winId: this._winId,
      worksetId: this._worksetId,
      title: this._title,
    };
  }

  onDragStart(): void {
    // Dim the original tab button
    this._tabBtn.style.opacity = "0.4";
  }

  onDragEnd(_result: DragResult): void {
    // Restore the original tab button
    this._tabBtn.style.opacity = "1";
    if (this._ghost && this._ghost.parentNode) {
      this._ghost.parentNode.removeChild(this._ghost);
    }
    this._ghost = null;
  }
}

/**
 * Openp41geTabDragSource — same as TabDragSource but for tabs.
 */
export class Openp41geTabDragSource extends TabDragSource {
  readonly type = "openp41ge-tab";
  // Inherits all behavior, just different type for dispatch
}
