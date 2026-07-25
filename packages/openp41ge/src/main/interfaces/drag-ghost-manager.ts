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
   */
  show(label: string, screenX: number, screenY: number, emoji?: string): void;

  /** Move the drag ghost window to a new screen position. */
  move(screenX: number, screenY: number): void;

  /** Hide and destroy the drag ghost window. */
  hide(): void;

  /** Check if a drag ghost is currently active. */
  isActive(): boolean;
}
