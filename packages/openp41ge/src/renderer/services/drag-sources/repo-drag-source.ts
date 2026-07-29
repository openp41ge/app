/**
 * RepoDragSource — provides ghost visuals for dragging a repository from the explorer.
 *
 * Creates a ghost element shaped like a repo folder with the repo name.
 */

import type { IDragSource, DragSourceData, DragResult } from "../../interfaces/drag-handler";

export class RepoDragSource implements IDragSource {
  readonly type = "repo";

  private _repoName: string;
  private _ghost: HTMLElement | null = null;

  constructor(repoName: string) {
    this._repoName = repoName;
  }

  createGhost(): HTMLElement {
    const ghost = document.createElement("div");
    ghost.className = [
      "openp41ge-drag-ghost",
      "fixed", "pointer-events-none", "z-[99999]", "opacity-85",
      "flex", "items-center", "gap-1.5", "px-2.5", "py-1",
      "bg-[#2a2a2a]", "border", "border-[#555]", "rounded",
      "shadow-[0_4px_12px_rgba(0,0,0,0.3)]",
      "text-13", "text-[#ddd]", "whitespace-nowrap",
    ].join(" ");

    // Repo icon
    const icon = document.createElement("span");
    icon.textContent = "📁";
    icon.className = "text-[14px]";
    ghost.appendChild(icon);

    // Repo name
    const label = document.createElement("span");
    label.textContent = this._repoName;
    ghost.appendChild(label);

    this._ghost = ghost;
    return ghost;
  }

  getDragData(): DragSourceData {
    return { type: "repo", repoName: this._repoName };
  }

  onDragStart(): void {
    // Nothing special needed
  }

  onDragEnd(_result: DragResult): void {
    if (this._ghost && this._ghost.parentNode) {
      this._ghost.parentNode.removeChild(this._ghost);
    }
    this._ghost = null;
  }
}
