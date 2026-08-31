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

export type InlineDiffRowKind = "context" | "added" | "removed";

/** One decorated buffer row of an inline commit diff. */
export interface InlineDiffRow {
  readonly kind: InlineDiffRowKind;
  /** Old-file line number this row pairs with (null when absent). */
  readonly oldLine: number | null;
  /** New-file line number this row pairs with (null when absent). */
  readonly newLine: number | null;
}

/**
 * The text shown in the line-number gutter for a decorated row.
 *   - context rows: its single (new-file) number,
 *   - changed rows: `old new` pair plus the change sign (`+` added / `−`
 *     removed), dropping the side that has no line (pure add/delete).
 * Shared by the gutter (which renders it) and the width calculation (which
 * sizes the line-number column to fit the widest label).
 */
export function inlineDiffLabel(row: InlineDiffRow): string {
  if (row.kind === "context") {
    return row.newLine != null ? String(row.newLine) : "";
  }
  const sign = row.kind === "added" ? "+" : "−";
  const old = row.oldLine != null ? String(row.oldLine) : "";
  const nw = row.newLine != null ? String(row.newLine) : "";
  const pair = [old, nw].filter(Boolean).join(" ");
  return pair ? `${pair} ${sign}` : sign;
}

export class InlineDiffHighlightsRenderer {
  private _parent: HTMLElement;
  private _els: HTMLElement[] = [];
  private _disposed = false;

  constructor(parentElement: HTMLElement) {
    this._parent = parentElement;
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
    for (let i = start; i <= end; i++) {
      const row = rows?.[i - 1];
      if (!row) continue;
      if (row.kind !== "added" && row.kind !== "removed") continue;

      const el = document.createElement("div");
      el.style.position = "absolute";
      el.style.left = "0";
      el.style.right = "0";
      el.style.top = `${(i - 1) * lineHeight}px`;
      el.style.height = `${lineHeight}px`;
      el.style.zIndex = "1";
      el.style.pointerEvents = "none";
      el.className = row.kind === "added" ? "fe-inline-diff-added" : "fe-inline-diff-removed";
      this._parent.appendChild(el);
      this._els.push(el);
    }
  }

  clear(): void {
    for (const el of this._els) {
      el.remove();
    }
    this._els = [];
  }

  dispose(): void {
    if (this._disposed) return;
    this._disposed = true;
    this.clear();
  }
}
