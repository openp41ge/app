/**
 * InlineDiffGutterColumns — the extra BEFORE line-number column inserted to the
 * LEFT of the normal line-number gutter in the inline commit-diff view:
 *
 *   ┌──────────────┬───────────────┬──────────────────┐
 *   │ BEFORE (old) │ AFTER (new)   │ code             │
 *   │  620  (red)  │   (gap)       │  deleted line    │
 *   │  (gap)       │  574  (green) │  added line      │
 *   │  621         │  621          │  unchanged line  │
 *   └──────────────┴───────────────┴──────────────────┘
 *
 * It shares the EDITOR background (--fe-bg) so it reads as a separate group
 * from the normal gutter column. The BEFORE cell of a deleted row is tinted
 * red; the matching AFTER cell (the normal gutter, handled by the editor) is
 * tinted green for added rows — colored cells run all the way across, no +/−
 * symbols. There is no separate sign column anymore.
 *
 * Wheel events over this column are forwarded to the viewport, so hovering the
 * line numbers still scrolls the editor normally.
 */

export interface InlineDiffGutterRowInfo {
  /** Left-column label — its BEFORE (old-file) number, or "" where a gap
   * belongs (added lines have no before number). */
  readonly leftLabel: string;
  /** Decoration class for the left cell ("fe-inline-removed-cell" on deleted
   * rows, otherwise ""). */
  readonly cls: string;
}

/** Last-applied state of one band cell, so repainting an unchanged band (e.g.
 * a plain scroll) writes no DOM. */
interface InlineBandCache {
  top: number;
  height: number;
  text: string | undefined;
  cls: string | undefined;
  active: boolean | undefined;
}

/** Inline-diff LEFT (BEFORE) band element with its last-applied state. */
interface InlineBandEl extends HTMLDivElement {
  __st?: InlineBandCache;
}

/** Per-buffer-line provider of the left column's content. */
export interface InlineDiffGutterRows {
  infoFor(lineNumber: number): InlineDiffGutterRowInfo;
}

export class InlineDiffGutterColumns {
  private _leftOuter: HTMLElement;
  private _leftInner: HTMLElement;
  private _entries = new Map<number, InlineBandEl>();
  private _lineHeight: number;
  private _rows: InlineDiffGutterRows | null = null;
  private _scrollTarget: HTMLElement | null;
  private _onLineClick: ((lineNumber: number) => void) | null = null;
  private _activeLines: ReadonlySet<number> = new Set();
  private _disposed = false;

  constructor(
    contentEl: HTMLElement,
    gutterEl: HTMLElement,
    lineHeight: number,
    scrollTarget: HTMLElement | null = null,
    onLineClick: ((lineNumber: number) => void) | null = null,
  ) {
    this._lineHeight = lineHeight;
    this._scrollTarget = scrollTarget;
    this._onLineClick = onLineClick;

    // ── Left column: editor background = a separate group from the gutter. ──
    this._leftOuter = document.createElement("div");
    this._leftOuter.className = "fe-inline-left";
    this._leftOuter.style.cssText =
      "flex-shrink:0;position:relative;overflow:hidden;display:none;" +
      "background:var(--fe-bg,#161616);user-select:none;" +
      "font-family:'Cascadia Code','Fira Code','JetBrains Mono','Consolas',monospace;";
    this._leftInner = document.createElement("div");
    // Viewport-height, clipped, will-change layer: labels stay document-absolute
    // but only the visible band is painted, so the compositor backing store is
    // bounded AND the transform scrolls in lockstep with the viewport (no
    // main-thread repaint of a document-tall box per frame).
    this._leftInner.style.cssText =
      "position:absolute;top:0;left:0;right:0;height:100%;overflow:hidden;will-change:transform;";
    this._leftOuter.appendChild(this._leftInner);
    contentEl.insertBefore(this._leftOuter, gutterEl);

    // Hovering the BEFORE column should scroll the editor as normal.
    this._bindWheel(this._leftOuter);
  }

  /** Bind a wheel listener that scrolls the editor viewport. */
  private _bindWheel(el: HTMLElement): void {
    el.addEventListener(
      "wheel",
      (e: WheelEvent) => {
        if (!this._scrollTarget) return;
        e.preventDefault();
        this._scrollTarget.scrollTop += e.deltaY;
      },
      { passive: false },
    );
  }

  /** Update row sizes (blend this column into the flex row). */
  setSizes(lineHeight: number, leftWidth: number): void {
    if (this._disposed) return;
    this._lineHeight = lineHeight;
    this._leftOuter.style.width = `${leftWidth}px`;
  }

  /**
   * Attach the content provider (rows) and show the column; null hides it
   * (normal file mode — no extra before-column).
   */
  setRows(rows: InlineDiffGutterRows | null): void {
    if (this._disposed) return;
    this._rows = rows;
    this._leftOuter.style.display = rows !== null ? "" : "none";
  }

  /** Rebuild the absolutely-placed labels for the visible band. When word
   * wrap is active, pass the per-model-line VIEW mapping (first view line +
   * wrapped height) so labels align with the wrapped text and span every
   * segment — exactly like the normal line-number gutter. */
  setVisibleRange(
    startLine: number,
    endLine: number,
    viewLineStart?: (modelLine: number) => number,
    viewLineCount?: (modelLine: number) => number,
  ): void {
    if (this._disposed) return;
    const start = Math.max(1, startLine);
    const end = Math.max(start, endLine);

    for (const [line, el] of this._entries) {
      if (line < start || line > end) {
        el.remove();
        this._entries.delete(line);
      }
    }

    for (let line = start; line <= end; line++) {
      // Word-wrap: anchor at the model line's FIRST view segment and span the
      // full wrapped height; without wrap getters this is just (line-1)*lh.
      const vStart = viewLineStart ? viewLineStart(line) ?? line : line;
      const vCount = viewLineCount ? viewLineCount(line) ?? 1 : 1;
      const top = (vStart - 1) * this._lineHeight;
      const height = vCount * this._lineHeight;

      let el = this._entries.get(line);
      // Cached last-applied state, stored on the element so repainting an
      // UNCHANGED band under fast scrolling writes nothing (geometry here is
      // scroll-invariant; only boundary rows get created/removed).
      let st = el?.__st;

      if (!el) {
        el = document.createElement("div");
        el.className = "fe-inline-left-label";
        // Full-column width + flex-end so the numbers are RIGHT-ALIGNED (place
        // values line up) exactly like the normal gutter's `.line-number`
        // labels. Without left:0/right:0 the absolute box shrink-wraps its
        // content and flex-end has nothing to push against, leaving the
        // numbers left-anchored.
        // flex-start keeps the number on the FIRST wrapped segment (same as
        // the normal gutter); the cell height below spans all segments, so the
        // red/green/active background continues down a wrapped line.
        el.style.cssText =
          "position:absolute;left:0;right:0;box-sizing:border-box;cursor:pointer;" +
          "display:flex;align-items:flex-start;justify-content:flex-end;padding-right:8px;" +
          "overflow:hidden;white-space:nowrap;";
        this._leftInner.appendChild(el);
        this._entries.set(line, el);
        if (this._onLineClick) {
          el.addEventListener("click", (e: MouseEvent) => {
            e.stopPropagation();
            this._onLineClick?.(line);
          });
        }
        st = { top: NaN, height: NaN, text: undefined, cls: undefined, active: undefined };
        el.__st = st;
      }

      if (st!.top !== top) {
        el.style.top = `${top}px`;
        st!.top = top;
      }
      if (st!.height !== height) {
        el.style.height = `${height}px`;
        st!.height = height;
      }

      const info = this._rows ? this._rows.infoFor(line) : { leftLabel: "", cls: "" };
      const text = info.leftLabel;
      if (st!.text !== text) {
        el.textContent = text;
        st!.text = text;
      }
      const cls = info.cls ?? "";
      if (st!.cls !== cls) {
        el.classList.toggle("fe-inline-removed-cell", cls.includes("fe-inline-removed-cell"));
        el.classList.toggle("fe-inline-added-cell", cls.includes("fe-inline-added-cell"));
        st!.cls = cls;
      }
      // Active (selected) rows' cells are highlighted like the AFTER column.
      const active = this._activeLines.has(line);
      if (st!.active !== active) {
        el.classList.toggle("fe-inline-left-active", active);
        st!.active = active;
      }
    }
  }

  /** Vertical scroll offset (CSS transform — matches the normal gutter). */
  setScrollOffset(scrollTop: number): void {
    if (this._disposed) return;
    this._leftInner.style.transform = `translate3d(0, ${-scrollTop}px, 0)`;
  }

  /**
   * Highlight the number cells of the selected rows (cursor line, or every
   * line covered by a multi-row selection). Pass null to clear.
   */
  setActiveLines(lines: Iterable<number> | null): void {
    if (this._disposed) return;
    this._activeLines = lines ? new Set(lines) : new Set();
    for (const [line, el] of this._entries) {
      const active = this._activeLines.has(line);
      // Keep the per-cell cache coherent so the next band repaint under
      // scroll doesn't rewrite a class that already matches.
      if (el.__st && el.__st.active !== active) {
        el.classList.toggle("fe-inline-left-active", active);
        el.__st.active = active;
      }
    }
  }

  dispose(): void {
    if (this._disposed) return;
    this._disposed = true;
    for (const el of this._entries.values()) el.remove();
    this._entries.clear();
    this._leftOuter.remove();
  }
}
