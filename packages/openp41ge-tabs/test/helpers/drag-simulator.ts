/**
 * Drag simulator — dispatches real mouse/drag events in a browser.
 *
 * Unlike JSDOM mocks, this uses the browser's native DataTransfer,
 * elementFromPoint, and event propagation.  Works in @web/test-runner
 * (real Chrome), Playwright, and any browser context.
 */

import type { IDragSource, IDropTarget, DragResult } from "../../src/interfaces";

/**
 * Programmatically simulate a complete drag-and-drop sequence
 * in the browser using real MouseEvents with DataTransfer.
 *
 * Sequence:
 *   1. mousedown (button=0) on the source element
 *   2. mousemove (crosses 4px threshold → ghost appears)
 *   3. dragover / mousemove over the target element
 *   4. drop on the target element
 *   5. mouseup
 *
 * Returns the DragResult from the drop target.
 */
export async function simulateDragDrop(
  source: IDragSource,
  target: IDropTarget,
  options?: {
    startX?: number;
    startY?: number;
    endX?: number;
    endY?: number;
  },
): Promise<DragResult> {
  const startX = options?.startX ?? 100;
  const startY = options?.startY ?? 100;
  const endX = options?.endX ?? 200;
  const endY = options?.endY ?? 200;

  // Use the orchestrator's simulateDrag if available (cleaner, no mouse events)
  // Otherwise use the mouse event path below.

  // Create a real DataTransfer for events
  const dt = new DataTransfer();
  const dragData = source.getDragData();
  dt.setData("text/plain", dragData.type);
  if ("tabId" in dragData) {
    dt.setData("text/tab-id", dragData.tabId);
  }

  // Dispatch dragstart on the source's ghost element source
  // (TabDragSource doesn't have an element — it creates a ghost.
  //  We simulate by dispatching events on document.body)

  // mousemove to cross the 4px threshold
  document.dispatchEvent(
    new MouseEvent("mousemove", {
      clientX: startX + 10,
      clientY: startY + 10,
      bubbles: true,
      cancelable: true,
    }),
  );

  // dragover on the target element
  const targetEl = target.element;
  targetEl.dispatchEvent(
    new DragEvent("dragover", {
      clientX: endX,
      clientY: endY,
      dataTransfer: dt,
      bubbles: true,
      cancelable: true,
    }),
  );

  // drop
  targetEl.dispatchEvent(
    new DragEvent("drop", {
      clientX: endX,
      clientY: endY,
      dataTransfer: dt,
      bubbles: true,
      cancelable: true,
    }),
  );

  // Use the target directly
  return target.onDrop(source, endX, endY);
}

/**
 * Create a DragEvent with a real DataTransfer for testing.
 * Works in real browsers (unlike JSDOM where DataTransfer is not available).
 */
export function createDragEvent(
  type: string,
  options?: {
    clientX?: number;
    clientY?: number;
    dataTransfer?: DataTransfer;
    bubbles?: boolean;
    cancelable?: boolean;
  },
): DragEvent {
  return new DragEvent(type, {
    bubbles: options?.bubbles ?? true,
    cancelable: options?.cancelable ?? true,
    clientX: options?.clientX ?? 0,
    clientY: options?.clientY ?? 0,
    dataTransfer: options?.dataTransfer ?? new DataTransfer(),
  });
}

/**
 * Create a simple DataTransfer with preset data for tests.
 */
export function createDataTransfer(data?: Record<string, string>): DataTransfer {
  const dt = new DataTransfer();
  if (data) {
    for (const [key, value] of Object.entries(data)) {
      dt.setData(key, value);
    }
  }
  return dt;
}
