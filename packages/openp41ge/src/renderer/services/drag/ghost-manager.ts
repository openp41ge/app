/**
 * GhostManager — mutation-based ghost overlay manager.
 *
 * Unlike the old GhostRenderer which destroyed and re-created the overlay
 * DOM on every mousemove, GhostManager reuses a single overlay element
 * and mutates its child column divs in-place. This eliminates DOM churn
 * and improves drag performance.
 *
 * Also includes a FlexCache that observes grid cell flex attribute changes
 * via MutationObserver, avoiding redundant DOM reads on every drag tick.
 */

import type { GhostPreview } from "../../interfaces/ghost-renderer";
import { computeGhostLayout } from "./ghost-layout";
import type { DropZone } from "./ghost-layout";
import { FlexCache } from "./flex-cache";

// ─── GhostManager ─────────────────────────────────────────────────────────

interface GhostOverlayEntry {
  overlay: HTMLElement;
  childCount: number;
}

export class GhostManager {
  private _overlays = new Map<HTMLElement, GhostOverlayEntry>();
  readonly flexCache = new FlexCache();

  /**
   * Show (or update) a ghost overlay in the given parent element.
   * Reuses the existing overlay if one already exists for this parent.
   */
  showGhost(parent: HTMLElement, preview: GhostPreview): void {
    let entry = this._overlays.get(parent);
    if (!entry || !parent.contains(entry.overlay)) {
      // Create the overlay once
      const overlay = document.createElement("div");
      overlay.className = "openp41ge-ghost-overlay";
      overlay.style.cssText = [
        "position:absolute",
        "inset:0",
        "z-index:25",
        "pointer-events:none",
        "display:flex",
        "flex-direction:row",
        "overflow:hidden",
      ].join(";");
      parent.appendChild(overlay);
      entry = { overlay, childCount: 0 };
      this._overlays.set(parent, entry);

      // Start observing flex changes for caching
      this.flexCache.observe(parent);
    }

    this._updateColumns(entry, preview);
  }

  /**
   * Hide and remove the ghost overlay for the given parent.
   */
  hideGhost(parent: HTMLElement): void {
    const entry = this._overlays.get(parent);
    if (entry && parent.contains(entry.overlay)) {
      parent.removeChild(entry.overlay);
    }
    this._overlays.delete(parent);
  }

  /**
   * Show a cell-highlight overlay (simpler style than the full ghost).
   */
  showCellOverlay(
    parent: HTMLElement,
    cols: number,
    activeCol: number,
    isFileDrop = false,
    columnFlex?: number[],
  ): void {
    const preview: GhostPreview = {
      cols,
      activeCol,
      isFileDrop,
      columnFlex,
    };
    this.showGhost(parent, preview);
  }

  /**
   * Alias for hideGhost — cell overlay uses the same overlay element.
   */
  hideCellOverlay(parent: HTMLElement): void {
    this.hideGhost(parent);
  }

  /**
   * Clean up all overlays and observers (call on app teardown).
   */
  dispose(): void {
    for (const [parent] of this._overlays) {
      this.hideGhost(parent);
      this.flexCache.disconnect(parent);
    }
    this._overlays.clear();
  }

  // ── Private helpers ──────────────────────────────────────────────

  private _updateColumns(entry: GhostOverlayEntry, preview: GhostPreview): void {
    const { overlay } = entry;
    const cols = preview.cols;

    // Build the drop zone config from the preview
    const dropZone = this._previewToDropZone(preview);
    const flexValues =
      preview.columnFlex ?? (cols > 0 ? Array.from({ length: cols }, () => 1 / cols) : [1]);

    const columns = computeGhostLayout(cols, flexValues, dropZone);
    const targetCount = columns.length;

    // Reuse or create child divs to match the target count
    while (overlay.children.length < targetCount) {
      const colDiv = document.createElement("div");
      overlay.appendChild(colDiv);
    }
    while (overlay.children.length > targetCount) {
      overlay.removeChild(overlay.lastChild!);
    }

    // Apply styles from the layout computation
    for (let c = 0; c < targetCount; c++) {
      const colDiv = overlay.children[c] as HTMLElement;
      const col = columns[c];
      colDiv.style.flex = `${col.flex}`;
      colDiv.style.minWidth = "0";
      colDiv.style.height = "100%";
      colDiv.style.position = "relative";
      colDiv.style.borderRight = c < targetCount - 1 ? "1px solid rgba(74,158,255,0.15)" : "";

      if (col.highlighted) {
        colDiv.style.background = "rgba(74,158,255,0.12)";
        colDiv.style.boxShadow = "inset 0 0 0 2px rgba(74,158,255,0.50)";
      } else if (col.splitPair) {
        colDiv.style.background = "rgba(74,158,255,0.06)";
        colDiv.style.boxShadow = "";
      } else if (col.active) {
        const alpha = preview.isFileDrop ? "rgba(74,158,255,0.08)" : "rgba(74,158,255,0.06)";
        colDiv.style.background = alpha;
        colDiv.style.boxShadow = preview.isFileDrop
          ? "inset 0 0 0 2px rgba(74,158,255,0.45)"
          : "inset 0 0 0 1px rgba(74,158,255,0.25)";
      } else {
        colDiv.style.background = "rgba(74,158,255,0.04)";
        colDiv.style.boxShadow = "";
      }
    }

    entry.childCount = targetCount;
  }

  private _previewToDropZone(preview: GhostPreview): DropZone {
    if (preview.boundaryIndex !== undefined && preview.splitCol !== undefined) {
      const splitCol = preview.splitCol;
      // Use splitLeft directly if provided; fall back to deriving from
      // splitHighlightCol (true when highlightCol === splitCol).
      const splitLeft =
        preview.splitLeft !== undefined
          ? preview.splitLeft
          : preview.splitHighlightCol === splitCol;
      return { type: "split", splitCol, splitLeft };
    }
    // Cell-center or default
    const col = preview.activeCol ?? 0;
    return { type: "cell-center", col };
  }
}

/** Singleton instance shared across the app. */
export const ghostManager = new GhostManager();
