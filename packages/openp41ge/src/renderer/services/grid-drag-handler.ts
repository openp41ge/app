/**
 * Grid drag handler — pane drag state machine.
 *
 * Thin adapter that delegates all operations to the shared DragOrchestrator
 * singleton. Exists for backwards compatibility. New code should use
 * dragOrchestrator directly.
 */

import { dragOrchestrator } from "./drag/orchestrator";
import type { Openp41geGridElement } from "../interfaces/element-guards";
import { isOpenp41geGrid } from "../interfaces/element-guards";
import { isContextMenuActive } from "./tab-drag-handler";
import { Openp41geTabDragSource } from "./drag-sources/tab-drag-source";
import type { ICommandBus } from "../interfaces/command-bus";
import type { IGhostRenderer } from "../interfaces/ghost-renderer";

/**
 * Reset module-level grid drag state.
 * Now delegates to the orchestrator's cancelDrag.
 */
export function resetGridDragState(): void {
  dragOrchestrator.cancelDrag();
}

/**
 * GridDragHandler — delegates to DragOrchestrator.
 */
export class GridDragHandler {
  /**
   * Backwards-compatible init — no-op; DragOrchestrator handles all
   * drag state and event wiring.
   */
  init(_commandBus: ICommandBus, _ghostRenderer: IGhostRenderer): void {
    // Delegated to DragOrchestrator
  }

  /**
   * Start dragging a pane. Called from <openp41ge-tab-content> mousedown.
   * Delegates to DragOrchestrator.startDrag() with a Openp41geTabDragSource.
   */
  handlePaneMouseDown(
    e: MouseEvent,
    paneId: string,
    gridEl: HTMLElement,
    getTab: (id: string) => { title?: string; appType?: string } | undefined,
    _getTabMap: unknown,
  ): void {
    if (!isOpenp41geGrid(gridEl)) return;
    if (e.button !== 0) return;
    if (isContextMenuActive()) return;

    const gridSelf: Openp41geGridElement = gridEl;
    const pageData = gridSelf.pageData;
    if (!pageData) return;

    const tab = getTab(paneId);
    const label = tab?.title ?? tab?.appType ?? "Pane";

    // Track last active cell
    const currentTarget = e.currentTarget;
    const cell =
      currentTarget instanceof HTMLElement ? currentTarget.closest?.(".openp41ge-grid-cell") : null;
    if (cell) {
      const col = Array.from(gridEl.children).indexOf(cell);
      if (col >= 0) gridSelf._lastActiveCellCol = col;
    }

    const source = new Openp41geTabDragSource(
      e.currentTarget as HTMLElement,
      paneId,
      gridSelf.winId,
      pageData.id,
      label,
    );

    dragOrchestrator.startDrag(source, e.clientX, e.clientY);
  }

  cancelDrag(): void {
    dragOrchestrator.cancelDrag();
  }
}
