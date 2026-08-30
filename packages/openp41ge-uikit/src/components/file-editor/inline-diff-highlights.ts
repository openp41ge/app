/**
 * InlineDiffHighlightsRenderer — full-width red/green row backgrounds for the
 * file editor's inline commit-diff view.
 *
 * Painted INSIDE the scrolling viewport (same parent as ViewLines, the cursor
 * and find-match highlights) so the bands scroll with the content. One
 * absolutely-positioned div per added/removed buffer line in the visible range,
 * at top = (lineNumber - 1) * lineHeight — matching how the editor's own line
 * rows are laid out. z-index sits behind the text rows so syntax-highlighted
 * content stays legible above the tint.
 */

import { createFastDomNode, FastDomNode } from "openp41ge-editor-engine/view/fast-dom-node";

export type InlineDiffRowKind = "context" | "added" | "removed";

/** One decorated buffer row of an inline commit diff. */
export interface InlineDiffRow {
  readonly kind: InlineDiffRowKind;
  /** Real new-file line number; null for removed (synthetic) rows. */
  readonly fileLine: number | null;
}

export class InlineDiffHighlightsRenderer {
  private _parent: FastDomNode;
  private _els: FastDomNode[] = [];
  private _disposed = false;

  constructor(parentElement: HTMLElement) {
    this._parent = new FastDomNode(parentElement);
  }

  /**
   * (Re)paint the full-width backgrounds for added/removed rows in the visible
   * window [visibleStartLine, visibleEndLine] (1-based buffer line numbers).
   */
  render(
    rows: readonly InlineDiffRow[] | null,
    visibleStartLine: number,
    visibleEndLine: number,
    lineHeight: number,
  ): void {
    if (this._disposed) return;
    this.clear();

    const start = Math.max(1, visibleStartLine);
    const end = Math.max(start, visibleEndLine);
    const band: Array<{ line: number; kind: "added" | "removed" }> = [];
    for (let i = start; i <= end; i++) {
      const row = rows?.[i - 1];
      if (!row) continue;
      if (row.kind === "added" || row.kind === "removed") {
        band.push({ line: i, kind: row.kind });
      }
    }

    for (const item of band) {
      const el = createFastDomNode();
      el.setPosition("absolute");
      el.setLeft(0);
      el.setTop((item.line - 1) * lineHeight);
      el.setHeight(lineHeight);
      el.setZIndex(1);
      el.setClassName(
        item.kind === "added" ? "fe-inline-diff-added" : "fe-inline-diff-removed",
      );
      el.element.style.right = "0";
      el.element.style.pointerEvents = "none";
      this._parent.appendChild(el.element);
      this._els.push(el);
    }
  }

  clear(): void {
    for (const el of this._els) {
      el.element.remove();
    }
    this._els = [];
  }

  dispose(): void {
    if (this._disposed) return;
    this._disposed = true;
    this.clear();
  }
}
