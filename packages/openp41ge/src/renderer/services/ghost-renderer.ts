import type { IGhostRenderer, GhostPreview } from "../interfaces/ghost-renderer";
import { ghostManager } from "./drag/ghost-manager";

/**
 * Read current flex values from the grid cells inside the given container.
 * Returns an array of flex ratios matching the number of columns, or
 * evenly-distributed values if cells can't be read.
 *
 * Delegates to GhostManager's FlexCache for cached reads.
 */
export function readColumnFlex(gridEl: HTMLElement, cols: number): number[] {
  return ghostManager.flexCache.get(gridEl, cols);
}

/**
 * Renders translucent drop preview overlays during drag-and-drop.
 *
 * Thin delegate to the shared GhostManager singleton. This class exists
 * for backwards compatibility with existing code that imports GhostRenderer.
 * New code should use ghostManager directly.
 */
export class GhostRenderer implements IGhostRenderer {
  showGhost(parent: HTMLElement, preview: GhostPreview): HTMLElement {
    ghostManager.showGhost(parent, preview);
    // Return the overlay element for backwards compat (callers may read it)
    const entry = parent.querySelector(".openp41ge-ghost-overlay");
    return (entry as HTMLElement) ?? parent;
  }

  hideGhost(parent: HTMLElement): void {
    ghostManager.hideGhost(parent);
  }

  showCellOverlay(
    parent: HTMLElement,
    cols: number,
    activeCol: number,
    isFileDrop = false,
    columnFlex?: number[],
  ): HTMLElement {
    ghostManager.showCellOverlay(parent, cols, activeCol, isFileDrop, columnFlex);
    const entry = parent.querySelector(".openp41ge-ghost-overlay, .openp41ge-cell-overlay");
    return (entry as HTMLElement) ?? parent;
  }

  hideCellOverlay(parent: HTMLElement): void {
    ghostManager.hideCellOverlay(parent);
  }
}
