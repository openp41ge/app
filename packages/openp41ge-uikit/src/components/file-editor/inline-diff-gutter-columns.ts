/**
 * InlineDiffGutterColumns — the two extra gutter columns of the inline
 * commit-diff view, flanking the normal line-number column:
 *
 *   ┌─────────────┬───────────┬──────────────────────────┐
 *   │ OLD numbers │ NEW nums  │ code                     │
 *   │ (editor bg) │ (gutter)  │       ...                │
 *   └─────────────┬───────────┬──────────┬───────────────┘
 *                 │   + / −   │          │
 *                 │ (glyph 2) │          │
 *                 └───────────┴──────────┘
 *
 * Left column — inserted to the LEFT of the normal gutter, sharing the EDITOR
 * background (--fe-bg) so it reads as a separate group from the gutter column.
 * It shows, in parallel, the OLD line number of each changed row (deleted rows
 * their old number, added rows the old line they replaced).
 *
 * Sign column — inserted between the gutter and the text, fully transparent
 * (invisible except its glyphs): a green `+` on added rows, a red `−` on
 * deleted rows.
 *
 * Both scroll with the editor (CSS transform synced to the gutter's own).
 */

export interface InlineDiffGutterRowInfo {
  /** Left-column label — the old line number, or "" for context rows. */
  readonly leftLabel: string;
  /** Sign-column glyph — "+" | "−" | "" (context rows are empty). */
  readonly sign: string;
}

/** Per-buffer-line provider of the two columns' content. */
export interface InlineDiffGutterRows {
  infoFor(lineNumber: number): InlineDiffGutterRowInfo;
}

export class InlineDiffGutterColumns {
  private _leftOuter: HTMLElement;
  private _leftInner: HTMLElement;
  private _signOuter: HTMLElement;
  private _signInner: HTMLElement;
  private _entries = new Map<number, { left: HTMLElement; sign: HTMLElement }>();
  private _lineHeight: number;
  private _rows: InlineDiffGutterRows | null = null;
  private _disposed = false;

  constructor(contentEl: HTMLElement, gutterEl: HTMLElement, lineHeight: number) {
    this._lineHeight = lineHeight;

    // ── Left column: editor background = a separate group from the gutter. ──
    this._leftOuter = document.createElement("div");
    this._leftOuter.className = "fe-inline-left";
    this._leftOuter.style.cssText =
      "flex-shrink:0;position:relative;overflow:hidden;display:none;" +
      "background:var(--fe-bg,#161616);user-select:none;" +
      "font-family:'Cascadia Code','Fira Code','JetBrains Mono','Consolas',monospace;";
    this._leftInner = document.createElement("div");
    this._leftInner.style.cssText = "position:absolute;top:0;left:0;right:0;will-change:transform;";
    this._leftOuter.appendChild(this._leftInner);
    contentEl.insertBefore(this._leftOuter, gutterEl);

    // ── Sign column: transparent — only the glyphs are visible. ──
    this._signOuter = document.createElement("div");
    this._signOuter.className = "fe-inline-sign";
    this._signOuter.style.cssText =
      "flex-shrink:0;position:relative;overflow:hidden;display:none;" +
      "user-select:none;" +
      "font-family:'Cascadia Code','Fira Code','JetBrains Mono','Consolas',monospace;";
    this._signInner = document.createElement("div");
    this._signInner.style.cssText = "position:absolute;top:0;left:0;right:0;will-change:transform;";
    this._signOuter.appendChild(this._signInner);
    gutterEl.insertAdjacentElement("afterend", this._signOuter);
  }

  /** Update row sizes (and blend the columns into the flex row). */
  setSizes(lineHeight: number, leftWidth: number, signWidth: number): void {
    if (this._disposed) return;
    this._lineHeight = lineHeight;
    this._leftOuter.style.width = `${leftWidth}px`;
    this._signOuter.style.width = `${signWidth}px`;
  }

  /**
   * Attach the content provider (rows) and show the columns; null hides them
   * (normal file mode — no extra gutters).
   */
  setRows(rows: InlineDiffGutterRows | null): void {
    if (this._disposed) return;
    this._rows = rows;
    const show = rows !== null;
    this._leftOuter.style.display = show ? "" : "none";
    this._signOuter.style.display = show ? "" : "none";
  }

  /** Rebuild the absolutely-placed labels for the visible band. */
  setVisibleRange(startLine: number, endLine: number): void {
    if (this._disposed) return;
    const start = Math.max(1, startLine);
    const end = Math.max(start, endLine);

    for (const [line, entry] of this._entries) {
      if (line < start || line > end) {
        entry.left.remove();
        entry.sign.remove();
        this._entries.delete(line);
      }
    }

    for (let line = start; line <= end; line++) {
      let entry = this._entries.get(line);
      if (!entry) {
        const left = document.createElement("div");
        left.className = "fe-inline-left-label";
        left.style.cssText =
          `position:absolute;top:0;left:0;right:0;height:${this._lineHeight}px;` +
          "display:flex;align-items:center;justify-content:flex-end;padding-right:8px;overflow:hidden;white-space:nowrap;";
        const sign = document.createElement("div");
        sign.className = "fe-inline-sign-label";
        sign.style.cssText =
          `position:absolute;top:0;left:0;right:0;height:${this._lineHeight}px;` +
          "display:flex;align-items:center;justify-content:center;";
        this._leftInner.appendChild(left);
        this._signInner.appendChild(sign);
        entry = { left, sign };
        this._entries.set(line, entry);
      }
      // Labels sit at ABSOLUTE document positions (line-1)*lineHeight — the
      // same convention as the normal line-number gutter — so the inner
      // container's -/* scroll transform brings the visible band into view.
      // (Positioning relative to the band start would misplace rows when
      // scrolled.)
      entry.left.style.top = `${(line - 1) * this._lineHeight}px`;
      entry.sign.style.top = `${(line - 1) * this._lineHeight}px`;
      entry.left.style.height = `${this._lineHeight}px`;
      entry.sign.style.height = `${this._lineHeight}px`;

      const info = this._rows ? this._rows.infoFor(line) : { leftLabel: "", sign: "" };
      entry.left.textContent = info.leftLabel;
      entry.sign.textContent = info.sign;
      entry.sign.classList.remove("fe-sign-add", "fe-sign-rem", "fe-sign-none");
      entry.sign.classList.add(
        info.sign === "+" ? "fe-sign-add" : info.sign === "−" ? "fe-sign-rem" : "fe-sign-none",
      );
    }
  }

  /** Vertical scroll offset (CSS transform — matches the normal gutter). */
  setScrollOffset(scrollTop: number): void {
    if (this._disposed) return;
    this._leftInner.style.transform = `translate3d(0, ${-scrollTop}px, 0)`;
    this._signInner.style.transform = `translate3d(0, ${-scrollTop}px, 0)`;
  }

  dispose(): void {
    if (this._disposed) return;
    this._disposed = true;
    for (const entry of this._entries.values()) {
      entry.left.remove();
      entry.sign.remove();
    }
    this._entries.clear();
    this._leftOuter.remove();
    this._signOuter.remove();
  }
}
