/**
 * Drag ghost window management.
 *
 * Manages a transparent, frameless BrowserWindow that follows the cursor
 * during drag-and-drop operations, showing a label for what's being dragged.
 */

export interface IDragGhostManager {
  /**
   * Create and show the drag ghost window at the given screen position.
   * @param emoji Optional emoji character to display as an icon next to the label.
   * @param tabWidth Width of the source tab element (used for ghost window size).
   * @param tabHeight Height of the source tab element (used for ghost window size).
   * @param offsetX Horizontal offset from cursor to ghost window origin (cursor - tabLeft).
   * @param offsetY Vertical offset from cursor to ghost window origin (cursor - tabTop).
   */
  show(
    label: string,
    screenX: number,
    screenY: number,
    emoji?: string,
    tabWidth?: number,
    tabHeight?: number,
    offsetX?: number,
    offsetY?: number,
  ): void;

  /** Move the drag ghost window to a new screen position. */
  move(screenX: number, screenY: number): void;

  /** Hide and destroy the drag ghost window. */
  hide(): void;

  /** Check if a drag ghost is currently active. */
  isActive(): boolean;
}
