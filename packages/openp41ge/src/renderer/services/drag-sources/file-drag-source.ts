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
  private _ghost: HTMLElement | null = null;

  constructor(filePath: string, fileName?: string) {
    this._filePath = filePath;
    this._fileName = fileName || filePath.split("/").pop() || "file";
  }

  createGhost(): HTMLElement {
    const ghost = document.createElement("div");
    ghost.classList.add("openp41ge-drag-ghost");
    ghost.style.position = "fixed";
    ghost.style.pointerEvents = "none";
    ghost.style.zIndex = "99999";
    ghost.style.opacity = "0.85";
    ghost.style.display = "flex";
    ghost.style.alignItems = "center";
    ghost.style.gap = "6px";
    ghost.style.padding = "4px 10px";
    ghost.style.background = "#2a2a2a";
    ghost.style.border = "1px solid #555";
    ghost.style.borderRadius = "4px";
    ghost.style.boxShadow = "0 4px 12px rgba(0,0,0,0.3)";
    ghost.style.fontSize = "13px";
    ghost.style.color = "#ddd";
    ghost.style.whiteSpace = "nowrap";

    // File icon
    const icon = document.createElement("span");
    icon.textContent = "📄";
    icon.style.fontSize = "14px";
    ghost.appendChild(icon);

    // File name
    const label = document.createElement("span");
    label.textContent = this._fileName;
    ghost.appendChild(label);

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
