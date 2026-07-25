/**
 * VirtualScroll — DOM-efficient virtual scrolling for streaming output.
 *
 * Renders only the visible lines of an OutputBuffer into the DOM.
 * As the user scrolls, the viewport is re-rendered with only the
 * lines that should be visible — DOM nodes never exceed viewportLines + 2,
 * regardless of buffer.totalLines (which can be 1000+).
 *
 * Lifecycle:
 *   // Create a viewport element and add it to the container
 *   const viewport = document.createElement("div");
 *   viewport.style.cssText = "overflow-y:auto;height:100%;box-sizing:border-box;";
 *   container.appendChild(viewport);
 *
 *   const vs = new VirtualScroll(buffer, viewport, { lineHeight: 20 });
 *   vs.refresh();                 // re-render after buffer write
 *   vs.unmount();                 // clean up (listeners removed)
 *
 * The caller owns the viewport DOM element and is responsible for its
 * lifecycle (e.g. removing it from the DOM during controller unmount).
 *
 * Integration with PaneController:
 *   class MyAppController extends BaseController {
 *     private vs: VirtualScroll;
 *     mount(container) {
 *       const viewport = document.createElement("div");
 *       viewport.style.cssText = "overflow-y:auto;height:100%;box-sizing:border-box;";
 *       container.appendChild(viewport);
 *       this.vs = new VirtualScroll(this.outputBuffer, viewport);
 *     }
 *     unmount() {
 *       this.vs?.unmount();
 *     }
 *   }
 */

import type { OutputBuffer } from "./output-buffer";
import { isHTMLElement } from "../interfaces/element-guards";

/** Options for VirtualScroll construction. */
export interface VirtualScrollOptions {
  /** Height of each line in pixels. Default: 20. */
  lineHeight?: number;
  /** Whether to show line numbers. Default: false. */
  showLineNumbers?: boolean;
  /**
   * Optional per-line formatter.  If provided, called for each line to
   * produce safe innerHTML (e.g. syntax-highlighted spans).  The return
   * value is inserted directly into the DOM without further escaping —
   * the callback is responsible for escaping user content.
   *
   * When omitted, lines are rendered via escapeHtml().
   */
  formatLine?: (line: string) => string;
}

/** HTML-escape a string for safe innerHTML assignment. */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Show a brief toast notification anchored to the given element.
 * Fades in, holds ~1.5s, then fades out and removes itself.
 */
function showToast(anchor: HTMLElement, message: string): void {
  const toast = document.createElement("div");
  toast.textContent = message;
  toast.style.cssText =
    "position:fixed;z-index:9999;bottom:40px;left:50%;transform:translateX(-50%);" +
    "background:#333;color:#ddd;padding:6px 14px;border-radius:4px;" +
    "font-size:12px;font-family:sans-serif;pointer-events:none;" +
    "opacity:0;transition:opacity 0.15s ease;";
  document.body.appendChild(toast);

  // Fade in
  requestAnimationFrame(() => {
    toast.style.opacity = "1";
  });

  // Fade out and remove
  setTimeout(() => {
    toast.style.opacity = "0";
    setTimeout(() => {
      toast.remove();
    }, 200);
  }, 1500);
}

export class VirtualScroll {
  private buffer: OutputBuffer;
  private viewport: HTMLElement;

  /** The scrollable viewport element. */
  get viewportEl(): HTMLElement {
    return this.viewport;
  }
  private lineHeight: number;
  private showLineNumbers: boolean;
  private formatLine: ((line: string) => string) | null;
  private visibleLines: number = 0;
  private _highlightedLine: number | null = null;
  private scrollTop: number = 0;
  private _onScrollBound: () => void;
  private _copyBound: ((e: KeyboardEvent) => void) | null = null;

  // Drag selection state
  private _selectionAnchor: number | null = null;
  private _selectionEnd: number | null = null;
  private _isDragSelecting: boolean = false;
  private _onDragMoveBound: ((e: MouseEvent) => void) | null = null;
  private _onDragEndBound: (() => void) | null = null;

  // Cursor state
  private _cursorLine: number = -1;
  private _cursorCol: number = 0;
  private _charWidth: number = 0;

  /**
   * Override for total line count used in scrollbar sizing.
   * When set, the scrollbar reflects this value instead of buffer.totalLines.
   * Useful for file viewers where only a portion of the file is loaded.
   */
  totalLinesOverride: number = 0;

  /**
   * Callback fired on scroll (synchronous, every scroll event).
   * Use for lazy-loading more data when scrolling approaches the edge.
   */
  onScroll: (() => void) | null = null;

  /**
   * Callback fired when the cursor position changes (click on line).
   * Receives the line (1-indexed) and column (0-indexed).
   */
  onCursorChange: ((line: number, col: number) => void) | null = null;

  /**
   * Current scroll position as a ratio (0..1) of the total content.
   */
  get scrollRatio(): number {
    const maxScroll = this.viewport.scrollHeight - this.viewport.clientHeight;
    if (maxScroll <= 0) return 0;
    return this.viewport.scrollTop / maxScroll;
  }

  /**
   * The currently highlighted line number (1-indexed), or null.
   */
  get highlightedLine(): number | null {
    return this._highlightedLine;
  }
  set highlightedLine(line: number | null) {
    this._highlightedLine = line;
    this.render();
  }

  /**
   * @param buffer  The output buffer to render.
   * @param viewport  The scrollable DOM element (caller owns this element).
   * @param options  Optional config (line height).
   */
  constructor(buffer: OutputBuffer, viewport: HTMLElement, options?: VirtualScrollOptions) {
    this.buffer = buffer;
    this.viewport = viewport;
    this.lineHeight = options?.lineHeight ?? 20;
    this.showLineNumbers = options?.showLineNumbers ?? false;
    this.formatLine = options?.formatLine ?? null;

    // One-time hover effect for line numbers, cursor blink, and selection
    if (!document.getElementById("openp41ge-line-hover-style")) {
      const style = document.createElement("style");
      style.id = "openp41ge-line-hover-style";
      style.textContent = [
        "[data-line]:hover { background: rgba(255,255,255,0.07); }",
        ".cursor-blink { animation: cursorBlink 1s step-end infinite; }",
        "@keyframes cursorBlink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }",
        "::selection { color: inherit; background: rgba(42,111,209,0.4); }",
      ].join("\n");
      document.head.appendChild(style);
    }

    // Compute initial visible lines
    this.visibleLines = Math.ceil(this.viewport.clientHeight / this.lineHeight);
    this._ensureCharWidth();

    this._onScrollBound = () => this._onScroll();
    this.viewport.addEventListener("scroll", this._onScrollBound);

    // Line number click/drag selection
    if (this.showLineNumbers) {
      // Mousedown on a line number starts a drag selection.
      this.viewport.addEventListener("mousedown", (e) => {
        if (!(e.target instanceof HTMLElement)) return;
        const target = e.target;
        const lineNumEl = target.closest("[data-line]");
        if (!(lineNumEl instanceof HTMLElement)) return;

        const line = parseInt(lineNumEl.dataset.line!, 10);
        if (isNaN(line)) return;

        e.preventDefault(); // prevent text selection

        this._selectionAnchor = line;
        this._selectionEnd = line;
        this._isDragSelecting = false;
        this._highlightedLine = line;
        this.render();
      });

      // Document-level mousemove during drag extends the selection.
      this._onDragMoveBound = (e: MouseEvent) => {
        if (this._selectionAnchor === null) return;

        // Find the [data-line] element under the cursor using
        // elementFromPoint (the rendered elements may differ from
        // the mousedown target after re-renders during drag).
        const el = document.elementFromPoint(e.clientX, e.clientY);
        const lineNumEl = el?.closest("[data-line]");
        if (!(lineNumEl instanceof HTMLElement)) return;

        const line = parseInt(lineNumEl.dataset.line!, 10);
        if (isNaN(line) || line === this._selectionEnd) return;

        this._isDragSelecting = true;
        this._selectionEnd = line;
        this.render();
      };
      document.addEventListener("mousemove", this._onDragMoveBound);

      // Document-level mouseup ends the drag.
      this._onDragEndBound = () => {
        if (this._selectionAnchor === null) return;

        if (
          this._isDragSelecting &&
          this._selectionAnchor !== null &&
          this._selectionEnd !== null
        ) {
          const from = Math.min(this._selectionAnchor, this._selectionEnd);
          const to = Math.max(this._selectionAnchor, this._selectionEnd);
          const count = to - from + 1;
          void navigator.clipboard.writeText(this.buffer.read(from - 1, count).join("\n"));
          showToast(this.viewport, "Copied");
          // Clear drag flag — the range highlight persists via
          // the render check (_selectionAnchor !== _selectionEnd).
          this._isDragSelecting = false;
        } else {
          // No drag (mouse hasn't moved) — clean up; the click handler
          // below handles single-line toggle.
          this._selectionAnchor = null;
          this._selectionEnd = null;
          this._isDragSelecting = false;
        }
      };
      document.addEventListener("mouseup", this._onDragEndBound);

      // Click anywhere else in the viewport clears the highlight/selection,
      // except when clicking on a line's content area (handled by cursor
      // placement below).
      this.viewport.addEventListener("click", (e) => {
        if (!(e.target instanceof HTMLElement)) return;
        const target = e.target;
        const lineNumEl = target.closest("[data-line]");
        if (!(lineNumEl instanceof HTMLElement)) {
          // Check if click is on a line container (content area) — don't
          // clear, the cursor handler will handle it.
          if (target.closest("[data-line-container]")) return;
          // Click on non-line-number, non-content area clears everything
          this._selectionAnchor = null;
          this._selectionEnd = null;
          this._isDragSelecting = false;
          this.highlightedLine = null;
        } else {
          // Click on a line number (without drag): toggle single-line
          // Clear any existing drag selection first
          this._selectionAnchor = null;
          this._selectionEnd = null;
          this._isDragSelecting = false;
          const line = parseInt(lineNumEl.dataset.line!, 10);
          this.highlightedLine = this._highlightedLine === line ? null : line;
        }
      });

      // Cursor placement: clicking on content area places the cursor.
      // Does NOT fire when the user has selected text (native selection),
      // because setCursor → render() replaces innerHTML, destroying the
      // selection DOM.
      this.viewport.addEventListener("click", (e) => {
        // If the user selected text (native drag selection), don't place
        // the cursor — that would replace innerHTML and clear the selection.
        const sel = window.getSelection();
        if (sel && sel.toString().length > 0) return;

        if (!(e.target instanceof HTMLElement)) return;
        const target = e.target;
        // Find the line container which has data-line-container attribute
        const lineContainer = target.closest("[data-line-container]");
        if (!(lineContainer instanceof HTMLElement)) return;
        const line = parseInt(lineContainer.dataset.lineContainer!, 10);
        if (isNaN(line)) return;

        // Only place cursor when clicking the content span, not the
        // line number span (which is handled by the toggle handler above).
        const lineNumSpan = lineContainer.children[0];
        if (isHTMLElement(lineNumSpan) && (lineNumSpan === target || lineNumSpan.contains(target)))
          return;

        const contentSpan = lineContainer.children[1];
        if (!isHTMLElement(contentSpan)) return;

        this._ensureCharWidth();
        const rect = contentSpan.getBoundingClientRect();
        const x = e.clientX - rect.left;
        let col = Math.max(0, Math.round(x / this._charWidth));

        // Clamp to line content length — cursor cannot go beyond
        // the last character in the line. Read from DOM textContent
        // to avoid buffer read edge cases.
        const lineLen = (contentSpan.textContent || "").length;
        if (col > lineLen) col = lineLen;

        this.setCursor(line, col);
      });

      // Cmd+C copies all highlighted/selected lines.
      // Only intercept when the event originated inside the viewport, not
      // when the user is typing in an unrelated text input (e.g. the pane
      // rename field, or a URL input in the video controller).
      this._copyBound = (e: KeyboardEvent) => {
        if (!(e.metaKey || e.ctrlKey) || e.key !== "c") return;
        // When the event has a real DOM target (not programmatic dispatch),
        // skip interception if that target is outside our viewport — the
        // user is probably focused on something like the pane rename input.
        if (e.target && !this.viewport.contains(e.target as Node)) return;
        if (this._highlightedLine === null) return;
        const anchor = this._selectionAnchor ?? this._highlightedLine;
        const end = this._selectionEnd ?? this._highlightedLine;
        const from = Math.min(anchor, end);
        const to = Math.max(anchor, end);
        const count = to - from + 1;
        const idx = from - 1;
        if (idx >= 0 && idx < this.buffer.totalLines) {
          e.preventDefault();
          void navigator.clipboard.writeText(this.buffer.read(idx, count).join("\n"));
          showToast(this.viewport, "Copied");
        }
      };
      document.addEventListener("keydown", this._copyBound);
    }

    this.render();
  }

  /**
   * Detach event listeners and cancel pending work.
   *
   * After calling unmount() the instance must not be used again —
   * create a new VirtualScroll if you need to re-render.
   *
   * The caller owns the viewport DOM element and is responsible for
   * removing it from the parent container.
   */
  unmount(): void {
    this.viewport.removeEventListener("scroll", this._onScrollBound);
    if (this._copyBound) {
      document.removeEventListener("keydown", this._copyBound);
      this._copyBound = null;
    }
    if (this._onDragMoveBound) {
      document.removeEventListener("mousemove", this._onDragMoveBound);
      this._onDragMoveBound = null;
    }
    if (this._onDragEndBound) {
      document.removeEventListener("mouseup", this._onDragEndBound);
      this._onDragEndBound = null;
    }
  }

  /**
   * Re-render the visible lines after a buffer write.
   * Also recalculates visibleLines in case the container resized.
   * Call this after each batch of OutputBuffer.write() calls.
   */
  refresh(): void {
    // Recompute visible line count (container may have resized)
    this.visibleLines = Math.ceil(this.viewport.clientHeight / this.lineHeight);
    this.render();
  }

  /**
   * Force scroll to the bottom (latest lines).
   * Useful when auto-scrolling is desired after new output.
   */
  scrollToBottom(): void {
    const totalLines =
      this.totalLinesOverride > 0 ? this.totalLinesOverride : this.buffer.totalLines;
    const maxScrollTop = Math.max(0, totalLines * this.lineHeight - this.viewport.clientHeight);
    this.viewport.scrollTop = maxScrollTop;
    // render() will be called by the scroll event handler
  }

  /**
   * Returns true if the viewport is scrolled to the bottom
   * (within a 5px tolerance).
   */
  get isAtBottom(): boolean {
    const maxScroll = this.viewport.scrollHeight - this.viewport.clientHeight;
    return maxScroll - this.viewport.scrollTop < 5;
  }

  /**
   * Get the current cursor line (1-indexed), or -1 if no cursor.
   */
  get cursorLine(): number {
    return this._cursorLine;
  }

  /**
   * Get the current cursor column (0-indexed).
   */
  get cursorCol(): number {
    return this._cursorCol;
  }

  /**
   * Place the cursor at the given line and column, then re-render.
   * Line is 1-indexed, col is 0-indexed.
   */
  setCursor(line: number, col: number): void {
    this._cursorLine = line;
    this._cursorCol = col;
    // Also update the highlighted line to match cursor position
    this._highlightedLine = line;
    this.render();
    this.onCursorChange?.(line, col);
  }

  /**
   * Clear the cursor.
   */
  clearCursor(): void {
    this._cursorLine = -1;
    this._cursorCol = 0;
    this.render();
    this.onCursorChange?.(-1, 0);
  }

  private _ensureCharWidth(): void {
    if (this._charWidth > 0) return;
    // Measure monospace character width with 100 characters for precision
    const el = document.createElement("span");
    el.style.cssText =
      "font-size:13px;font-family:monospace;visibility:hidden;position:absolute;white-space:pre;";
    el.textContent = "X".repeat(100);
    document.body.appendChild(el);
    this._charWidth = el.offsetWidth / 100;
    document.body.removeChild(el);
  }

  private render(): void {
    // Don't render if the user has an active native text selection —
    // innerHTML replacement would destroy the selection DOM.
    const sel = window.getSelection();
    if (sel && sel.toString().length > 0) return;

    const totalLines =
      this.totalLinesOverride > 0 ? this.totalLinesOverride : this.buffer.totalLines;
    const bufferLines = this.buffer.totalLines;

    // When the user has scrolled past loaded data, show the last
    // visibleLines from the buffer instead of rendering nothing.
    let startLine = Math.max(0, Math.floor(this.scrollTop / this.lineHeight));
    if (startLine >= bufferLines && bufferLines > 0) {
      startLine = Math.max(0, bufferLines - this.visibleLines);
    }

    // Read a few extra lines for smooth scrolling beyond viewport
    const extraLines = 2;
    const lines =
      startLine < bufferLines ? this.buffer.read(startLine, this.visibleLines + extraLines) : [];

    // Build DOM for visible lines only.
    // A top spacer pushes content down to the correct virtual position,
    // so scrolling to scrollTop=N actually shows content at line N.
    // Without it, rendered lines always sit at position 0 — the viewport
    // scrolls them out of view, leaving only bottom padding visible.
    const topSpacer = startLine * this.lineHeight;
    const consumedHeight = totalLines * this.lineHeight;
    const loadedEndLine = Math.min(bufferLines, startLine + lines.length);
    const renderedContentHeight = loadedEndLine * this.lineHeight;

    // Base bottom padding gives the last line breathing room above the
    // viewport edge / pane status bar.
    const BASE_BOTTOM_PAD = 12;
    const bottomPadding = Math.max(
      BASE_BOTTOM_PAD,
      consumedHeight - renderedContentHeight,
      // If the file content is shorter than the viewport, add enough
      // filler so the line-number column border reaches the bottom.
      this.viewport.clientHeight - renderedContentHeight + BASE_BOTTOM_PAD,
    );
    // When the viewport has a horizontal scrollbar (any line exceeds the
    // viewport width), the last few pixels of content are hidden behind
    // the scrollbar.  Add extra padding to push the bottom content line
    // above the scrollbar.  We check the max line width of the *pending*
    // visible content (not the old DOM) so padding is correct on the
    // first render, not lagging by one frame.
    const maxLineLen = lines.length > 0 ? Math.max(...lines.map((l) => l.length)) : 0;
    const maxLineWidth = maxLineLen * this._charWidth;
    // clientWidth is the viewport inner width (minus vertical scrollbar
    // if present).  If the content is wider, a horizontal scrollbar will
    // appear and we need extra bottom padding.
    const needsScrollbarPadding = maxLineWidth > this.viewport.clientWidth;
    const totalBottomPadding = bottomPadding + (needsScrollbarPadding ? 17 : 0);

    const loadingIndicator =
      startLine >= bufferLines && bufferLines > 0 && totalLines > bufferLines
        ? `<div style="height:${this.lineHeight}px;line-height:${this.lineHeight}px;padding:0 8px;font-size:13px;font-family:monospace;color:var(--text-muted);font-style:italic;">Loading more…</div>`
        : "";

    const contentHtml =
      (topSpacer > 0 ? `<div style="height:${topSpacer}px;"></div>` : "") +
      lines
        .map((line, i) => {
          const absLine = startLine + i + 1;
          const isHighlighted =
            this._selectionAnchor !== null &&
            this._selectionEnd !== null &&
            this._selectionAnchor !== this._selectionEnd
              ? absLine >= Math.min(this._selectionAnchor, this._selectionEnd) &&
                absLine <= Math.max(this._selectionAnchor, this._selectionEnd)
              : this._highlightedLine === absLine;
          const bgStyle = isHighlighted ? "background:rgba(42,111,209,0.12);" : "";
          let formatted = this.formatLine ? this.formatLine(line) : escapeHtml(line);
          // Insert cursor indicator if this line has the cursor.
          // Use an absolutely-positioned thin bar so it works regardless of
          // syntax highlighting (formatted HTML with spans).
          const cursorHtml =
            this._cursorLine === absLine
              ? `<span class="cursor-blink" style="position:absolute;left:${this._cursorCol * this._charWidth}px;top:0;width:1px;height:100%;background:#d4d4d4;"></span>`
              : "";
          if (this.showLineNumbers) {
            return `<div data-line-container="${absLine}" style="display:flex;height:${this.lineHeight}px;line-height:${this.lineHeight}px;font-size:13px;font-family:monospace;box-sizing:border-box;${bgStyle}">
  <span data-line="${absLine}" class="ln-cell" style="display:inline-block;line-height:${this.lineHeight}px;">${absLine}</span>
  <span style="flex:1;white-space:pre;margin-left:8px;box-sizing:border-box;position:relative;cursor:text;">${cursorHtml}${formatted}</span>
</div>`;
          }
          return `<div style="height:${this.lineHeight}px;line-height:${this.lineHeight}px;white-space:pre;font-size:13px;font-family:monospace;padding:0 8px;box-sizing:border-box;position:relative;cursor:text;${bgStyle}">${cursorHtml}${formatted}</div>`;
        })
        .join("") +
      loadingIndicator +
      (totalBottomPadding > 0
        ? this.showLineNumbers
          ? `<div style="height:${totalBottomPadding}px;display:flex;align-items:stretch;">
  <div class="ln-filler"></div>
  <span style="flex:1;"></span>
</div>`
          : `<div style="height:${totalBottomPadding}px;"></div>`
        : "");

    this.viewport.innerHTML = contentHtml;

    // innerHTML resets scrollTop to 0.  Restore it, and then sync
    // this.scrollTop to whatever the browser actually accepted (it may
    // clamp if the new content is shorter than the old scrollTop).
    const maxScrollAfter = this.viewport.scrollHeight - this.viewport.clientHeight;
    const restored = Math.min(Math.max(0, this.scrollTop), maxScrollAfter);
    if (restored !== this.viewport.scrollTop) {
      this.viewport.scrollTop = restored;
    }
    this.scrollTop = this.viewport.scrollTop;
  }

  private _onScroll(): void {
    this.scrollTop = this.viewport.scrollTop;
    // Render synchronously on every scroll event so the DOM never lags
    // behind the scroll position.  RAF throttling would show stale
    // content (blank space) when the user scrolls past the rendered
    // lines before the next frame.
    this.render();
    this.onScroll?.();
  }
}
