/**
 * GhostManager — mutation-based ghost overlay manager.
 *
 * Reuses a single overlay element and mutates its children in-place,
 * eliminating DOM churn during drag.
 */

import { computeGhostLayout, type DropZone as GhostDropZone } from "./ghost-layout";

export interface GhostPreview {
  cols: number;
  activeCol?: number;
  boundaryIndex?: number;
  splitCol?: number;
  splitLeft?: boolean;
  splitHighlightCol?: number;
  columnFlex?: number[];
  isFileDrop?: boolean;
}

interface GhostOverlayEntry {
  overlay: HTMLElement;
  childCount: number;
}

export class GhostManager {
  private _overlays = new Map<HTMLElement, GhostOverlayEntry>();

  showGhost(parent: HTMLElement, preview: GhostPreview): void {
    // Ensure parent is a positioning root so inset:0 resolves against it
    const parentPos = getComputedStyle(parent).position;
    if (parentPos === "static" || parentPos === "") {
      parent.style.position = "relative";
    }

    let entry = this._overlays.get(parent);
    if (!entry || !parent.contains(entry.overlay)) {
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
    }

    this._updateColumns(entry, preview);
  }

  hideGhost(parent: HTMLElement): void {
    const entry = this._overlays.get(parent);
    if (entry && parent.contains(entry.overlay)) {
      parent.removeChild(entry.overlay);
    }
    this._overlays.delete(parent);
  }

  showCellOverlay(
    parent: HTMLElement,
    cols: number,
    activeCol: number,
    isFileDrop = false,
    columnFlex?: number[],
  ): void {
    this.showGhost(parent, { cols, activeCol, isFileDrop, columnFlex });
  }

  hideCellOverlay(parent: HTMLElement): void {
    this.hideGhost(parent);
  }

  dispose(): void {
    for (const [parent] of this._overlays) {
      this.hideGhost(parent);
    }
    this._overlays.clear();
  }

  private _updateColumns(entry: GhostOverlayEntry, preview: GhostPreview): void {
    const { overlay } = entry;
    const cols = preview.cols;

    const dropZone = this._previewToDropZone(preview);
    const flexValues =
      preview.columnFlex ?? (cols > 0 ? Array.from({ length: cols }, () => 1 / cols) : [1]);

    const columns = computeGhostLayout(cols, flexValues, dropZone);
    const targetCount = columns.length;

    while (overlay.children.length < targetCount) {
      overlay.appendChild(document.createElement("div"));
    }
    while (overlay.children.length > targetCount) {
      overlay.removeChild(overlay.lastChild!);
    }

    for (let c = 0; c < targetCount; c++) {
      const colDiv = overlay.children[c] as HTMLElement;
      const col = columns[c];
      colDiv.style.flex = String(col.flex);
      colDiv.style.minWidth = "0";
      colDiv.style.height = "100%";
      colDiv.style.position = "relative";
      colDiv.style.borderRight = c < targetCount - 1 ? "1px solid rgba(74,158,255,0.15)" : "";

      // The drop indicator is the shared <drop-box>: a blue-bordered,
      // transparent-backed drop-zone box (the same component the settings
      // drawer uses to mark its edge-snap target). The box fills whatever
      // column the dragged tab will land in — the highlighted half of a split
      // or the active cell-centre target. Columns that are not the landing
      // spot (the subtle split-pair, or plain background columns) keep only a
      // faint wash and no box. A <drop-box-overdraw> sibling paints the box's
      // overdraw accents: it bleeds the border outward past the nearer grid
      // edge (the box fades toward the grid interior, the opposite side). The
      // <drop-box> / <drop-box-overdraw> custom elements are registered by
      // <tab-grid> (the sole GhostManager consumer) via the drop-indicator
      // module.
      const wantsBox = col.highlighted || col.active;
      let box = colDiv.querySelector<HTMLElement>(":scope > drop-box");
      let over = colDiv.querySelector<HTMLElement>(":scope > drop-box-overdraw");
      if (wantsBox) {
        if (!box) {
          box = document.createElement("drop-box");
          box.style.inset = "0";
          colDiv.appendChild(box);
        }
        if (!over) {
          over = document.createElement("drop-box-overdraw");
          colDiv.appendChild(over);
        }
        // The box anchors on the edge nearer the grid's outer edge (its solid
        // side) and fades toward the interior; the overdraw companion reads
        // this `fade` and bleeds the accents outward past that anchored edge.
        box.setAttribute("fade", this._boxFade(overlay, colDiv));
      } else {
        box?.remove();
        over?.remove();
        box = null;
        over = null;
      }
      // The box paints its own border ring + wash; the column div itself must
      // not also paint a ring/wash or they would double up.
      colDiv.style.boxShadow = "";
      colDiv.style.background = wantsBox
        ? "transparent"
        : col.splitPair
          ? "rgba(74,158,255,0.06)"
          : "rgba(74,158,255,0.04)";
    }

    entry.childCount = targetCount;
  }

  /**
   * The drop-box's fade direction, so its overdraw accents bleed outward past
   * the nearer grid edge. A box in the left half of the grid anchors on its
   * left (solid) edge and fades toward the right (interior) — its accents
   * extend leftward, past the grid's left edge; a box in the right half does
   * the mirror. This keeps the overdraws running outward past the grid
   * boundary (into the titlebar / sidebar), the same language as the drawer's
   * edge-snap box.
   */
  private _boxFade(overlay: HTMLElement, colDiv: HTMLElement): "left" | "right" {
    const o = overlay.getBoundingClientRect();
    if (o.width <= 0 || o.height <= 0) return "right";
    const c = colDiv.getBoundingClientRect();
    const boxCenter = c.left + c.width / 2;
    const gridCenter = o.left + o.width / 2;
    return boxCenter < gridCenter ? "right" : "left";
  }

  private _previewToDropZone(preview: GhostPreview): GhostDropZone {
    if (preview.boundaryIndex !== undefined && preview.splitCol !== undefined) {
      const splitCol = preview.splitCol;
      const splitLeft =
        preview.splitLeft !== undefined
          ? preview.splitLeft
          : preview.splitHighlightCol === splitCol;
      return { type: "split", splitCol, splitLeft };
    }
    const col = preview.activeCol ?? 0;
    return { type: "cell-center", col };
  }
}
