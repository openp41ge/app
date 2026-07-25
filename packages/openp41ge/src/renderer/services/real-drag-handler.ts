/**
 * RealDragHandler — production implementation of IDragHandler.
 *
 * Thin adapter that delegates all operations to the shared DragOrchestrator
 * singleton. Exists for backwards compatibility with existing consumers.
 * New code should import dragOrchestrator directly.
 *
 * Drop target resolution order (first match wins):
 *   1. Openp41ge bar (<openp41ge-topbar>)
 *   2. Tab bar (.cell-tab-bar)
 *   3. Grid (<openp41ge-grid>)
 *
 * If no target is found and the source is a tab, the tab is detached to
 * a new window.
 */

import type {
  IDragHandler,
  IDragSource,
  IDropTarget,
  DragResult,
} from "../interfaces/drag-handler";
import type { ICommandBus } from "../interfaces/command-bus";
import type { IGhostRenderer } from "../interfaces/ghost-renderer";
import type { ICellTargetRenderer } from "../interfaces/cell-target-renderer";
import { dragOrchestrator } from "./drag/orchestrator";

/**
 * RealDragHandler — delegates to DragOrchestrator.
 */
export class RealDragHandler implements IDragHandler {
  get isDragging(): boolean {
    return dragOrchestrator.isDragging;
  }

  init(
    commandBus: ICommandBus,
    _ghostRenderer?: IGhostRenderer,
    _cellTargetRenderer?: ICellTargetRenderer,
  ): void {
    dragOrchestrator.init(commandBus);
  }

  startDrag(source: IDragSource, clientX: number, clientY: number): void {
    dragOrchestrator.startDrag(source, clientX, clientY);
  }

  async simulateDrag(source: IDragSource, target: IDropTarget): Promise<DragResult> {
    return dragOrchestrator.simulateDrag(source, target);
  }

  cancelDrag(): void {
    dragOrchestrator.cancelDrag();
  }
}
