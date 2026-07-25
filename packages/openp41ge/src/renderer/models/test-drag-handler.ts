/**
 * TestDragHandler — thin adapter for tests
 *
 * Delegates simulateDrag() to DragOrchestrator so all drag resolution
 * logic is shared with production. Keeps a history for test assertions.
 */

import type {
  IDragHandler,
  IDragSource,
  IDropTarget,
  DragResult,
} from "../interfaces/drag-handler";
import { dragOrchestrator } from "../services/drag/orchestrator";

export class TestDragHandler implements IDragHandler {
  /** Records every simulateDrag call for test verification */
  history: Array<{ source: IDragSource; target: IDropTarget }> = [];
  _isDragging = false;

  get isDragging(): boolean {
    return this._isDragging;
  }

  async simulateDrag(source: IDragSource, target: IDropTarget): Promise<DragResult> {
    this.history.push({ source, target });
    this._isDragging = true;
    try {
      const result = await dragOrchestrator.simulateDrag(source, target);
      this._isDragging = false;
      return result;
    } catch (err) {
      const result: DragResult = { success: false, reason: String(err) };
      this._isDragging = false;
      return result;
    }
  }

  startDrag(_source: IDragSource, _clientX: number, _clientY: number): void {
    dragOrchestrator.startDrag(_source, _clientX, _clientY);
  }

  cancelDrag(): void {
    dragOrchestrator.cancelDrag();
  }

  clearHistory(): void {
    this.history = [];
  }
}
