/**
 * FileDragSource — provides ghost visuals for dragging a file from the explorer.
 *
 * Creates a ghost element shaped like a file with the file name.
 */

import type { IDragSource, DragSourceData, DragResult } from "../../interfaces/drag-handler";

export class FileDragSource implements IDragSource {
  readonly type = "file";

  private _filePath: string;
  private _fileName: string;
  /** Offset from cursor to element top-left, set via setOffset(). */
  private _offsetX = 0;
  private _offsetY = 0;
  private _ghost: HTMLElement | null = null;

  constructor(filePath: string, fileName?: string) {
    this._filePath = filePath;
    this._fileName = fileName || filePath.split("/").pop() || "file";
  }

  /** Set the cursor offset for the main-process ghost positioning. */
  setOffset(offsetX: number, offsetY: number): void {
    this._offsetX = offsetX;
    this._offsetY = offsetY;
  }

  get offsetX(): number {
    return this._offsetX;
  }

  get offsetY(): number {
    return this._offsetY;
  }

  /**
   * Create an invisible ghost — the visual ghost is rendered by the
   * main-process DragGhostManager (BrowserWindow overlay), not by
   * an in-DOM element. This prevents double-ghost rendering.
   */
  createGhost(): HTMLElement {
    const ghost = document.createElement("div");
    ghost.style.cssText =
      "position:fixed;pointer-events:none;opacity:0;width:1px;height:1px;z-index:-1;";
    this._ghost = ghost;
    return ghost;
  }

  getDragData(): DragSourceData {
    return { type: "file", filePath: this._filePath, fileName: this._fileName };
  }

  onDragStart(): void {
    // Nothing special needed for file start
  }

  onDragEnd(_result: DragResult): void {
    if (this._ghost && this._ghost.parentNode) {
      this._ghost.parentNode.removeChild(this._ghost);
    }
    this._ghost = null;
  }
}
