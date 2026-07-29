/**
 * ViewLines — manages the DOM for visible lines in the editor viewport.
 *
 * Responsibilities:
 * 1. Create/destroy ViewLine instances as the user scrolls
 * 2. Position lines absolutely (top: Npx)
 * 3. Set content and tokens on visible lines
 * 4. Maintain the sliding window of rendered lines via RenderedLinesCollection
 * 5. Create a content wrapper div inside the viewport that holds all lines
 */

import { RenderedLinesCollection } from "./view-layer";
import { ViewLine } from "../rendering/view-line";
import type { IToken } from "../tokenization/line-tokens";
import { createFastDomNode, FastDomNode } from "./fast-dom-node";
import { computeWrapSegments } from "./word-wrap-helper";
import { TokenSegmentAdjuster } from "./token-segment-adjuster";
import type { ITokenSegmentAdjuster } from "./token-segment-adjuster";
import { ViewportWrapColumnCalculator } from "./wrap-column-calculator";
import type { IWrapColumnCalculator } from "./wrap-column-calculator";

/**
 * Provider for line content and tokens, used by ViewLines when rendering.
 */
export interface ILineContentProvider {
  getLineContent(lineNumber: number): string;
  getLineTokens(lineNumber: number): IToken[] | null;
  tabSize: number;
}

/**
 * Events emitted by ViewLines.
 */
export interface IViewLinesEvent {
  readonly type: "lines-changed" | "lines-inserted" | "lines-deleted";
  readonly startLineNumber: number;
  readonly endLineNumber: number;
}

/**
 * Configuration for ViewLines.
 */
export interface ViewLinesConfig {
  /** Height of each line in pixels. */
  lineHeight: number;
  /** Tab size (spaces per tab). */
  tabSize: number;
}

/**
 * ViewLines — manages the set of visible line DOM nodes.
 */
export class ViewLines {
  private _viewportEl: FastDomNode;
  private _linesWrapper: FastDomNode;
  private _collection: RenderedLinesCollection<ViewLine>;
  private _config: ViewLinesConfig;
  private _lineContentCache: Map<number, string> = new Map();
  private _lineTokenCache: Map<number, IToken[] | null> = new Map();
  private _totalLineCount: number = 0;
  private _wordWrapEnabled: boolean = false;
  private _wrapColumn: number = 80;
  private _scrollTop: number = 0;
  private _viewportHeight: number = 0;
  private _visibleStartLine: number = 0;
  private _visibleEndLine: number = 0;
  private _disposed: boolean = false;
  private _segmentAdjuster: ITokenSegmentAdjuster;
  private _wrapCalculator: IWrapColumnCalculator;

  /**
   * Callback for rendering a line's content with its tokens.
   * Called when a line enters the viewport and needs its content set.
   */
  onLineRender: ((lineNumber: number, viewLine: ViewLine) => void) | null = null;

  /**
   * Content provider for fetching line content and tokens (used for word wrap).
   */
  lineContentProvider: ILineContentProvider | null = null;

  /**
   * Callback for when a line exits the viewport (for cleanup).
   */
  onLineDispose: ((lineNumber: number, viewLine: ViewLine) => void) | null = null;

  /**
   * Callback for when the visible range changes due to scrolling.
   * The selection renderer needs this to re-render highlights for the
   * new visible range when the user scrolls after a cross-range selection.
   */
  onVisibleRangeChanged: ((startLine: number, endLine: number) => void) | null = null;

  constructor(
    viewportEl: HTMLElement,
    config: ViewLinesConfig,
    segmentAdjuster?: ITokenSegmentAdjuster,
    wrapCalculator?: IWrapColumnCalculator,
  ) {
    this._viewportEl = new FastDomNode(viewportEl);
    this._viewportEl.setPosition("relative");
    this._viewportEl.setClassName("fe-viewport");

    // Create an inner wrapper that holds the absolutely-positioned lines.
    // Width defaults to 100% of viewport (shrink-wraps to content otherwise).
    this._linesWrapper = createFastDomNode();
    this._linesWrapper.setPosition("relative");
    this._linesWrapper.setClassName("view-lines");
    this._viewportEl.appendChild(this._linesWrapper);

    this._config = config;
    this._collection = new RenderedLinesCollection<ViewLine>();
    this._viewportHeight = viewportEl.clientHeight;
    this._segmentAdjuster = segmentAdjuster ?? new TokenSegmentAdjuster();
    this._wrapCalculator = wrapCalculator ?? new ViewportWrapColumnCalculator();
  }

  /**
   * Enable or disable word wrap.
   */
  setWordWrap(enabled: boolean, wrapColumn?: number): void {
    this._wordWrapEnabled = enabled;
    if (wrapColumn !== undefined) this._wrapColumn = wrapColumn;
    this._updateScrollHeight();
  }

  /**
   * Get the total number of visible view lines (accounting for word wrap).
   */
  /** Compute the effective wrap column from the viewport width. */
  private _computeWrapColumn(): number {
    const charWidth = this._measureCharWidth();
    const viewportWidth = this._viewportEl.element.clientWidth;
    return this._wrapCalculator.compute(viewportWidth, 0, 16, charWidth || 8);
  }

  getViewLineCount(): number {
    if (!this._wordWrapEnabled) return this._totalLineCount;
    const provider = this.lineContentProvider;
    if (!provider) return this._totalLineCount;
    let count = 0;
    const wrapCol = this._wrapColumn > 0 ? this._wrapColumn : this._computeWrapColumn();
    for (let line = 1; line <= this._totalLineCount; line++) {
      const content = provider.getLineContent(line);
      count += computeWrapSegments(content, wrapCol).length;
    }
    return count;
  }

  /**
   * Compute the view line number for a model line and its wrapped segment.
   * Returns the starting view line number (1-based) for the given model line.
   */
  getViewLineStart(modelLine: number): number {
    if (!this._wordWrapEnabled) return modelLine;
    const provider = this.lineContentProvider;
    if (!provider) return modelLine;
    const wrapCol = this._wrapColumn > 0 ? this._wrapColumn : this._computeWrapColumn();
    let acc = 1;
    for (let i = 1; i < modelLine; i++) {
      acc += computeWrapSegments(provider.getLineContent(i), wrapCol).length;
    }
    return acc;
  }

  /**
   * Set the total number of lines in the document.
   */
  setTotalLineCount(count: number): void {
    this._totalLineCount = count;
    // Update the scroll height of the content wrapper
    this._updateScrollHeight();
  }

  /**
   * Get the total line count.
   */
  get totalLineCount(): number {
    return this._totalLineCount;
  }

  /**
   * Get the configuration.
   */
  get config(): ViewLinesConfig {
    return this._config;
  }

  /**
   * The viewport DOM element.
   */
  get viewportEl(): FastDomNode {
    return this._viewportEl;
  }

  /**
   * The lines wrapper DOM element.
   */
  get linesWrapper(): FastDomNode {
    return this._linesWrapper;
  }

  /**
   * Get a rendered ViewLine by line number.
   */
  getViewLine(lineNumber: number): ViewLine | undefined {
    return this._collection.getLine(lineNumber);
  }

  /**
   * Get all currently rendered ViewLines.
   */
  getRenderedLines(): ViewLine[] {
    return this._collection.getLines();
  }

  /**
   * Get the first visible line number.
   */
  get startLineNumber(): number {
    return this._collection.startLineNumber;
  }

  /**
   * Get the last visible line number.
   */
  get endLineNumber(): number {
    return this._collection.endLineNumber;
  }

  /**
   * Update the viewport height (on resize).
   */
  setViewportHeight(height: number): void {
    this._viewportHeight = height;
  }

  /**
   * Handle a scroll event — update the visible line range.
   *
   * @param scrollTop - The new scroll top position.
   * @param viewportHeight - The viewport height in pixels.
   */
  onScroll(scrollTop: number, viewportHeight?: number): void {
    if (this._wordWrapEnabled) return; // All lines are rendered statically

    if (viewportHeight !== undefined) {
      this._viewportHeight = viewportHeight;
    }

    this._scrollTop = scrollTop;

    const lineHeight = this._config.lineHeight;
    if (lineHeight <= 0) return;

    // Compute which lines should be visible
    // Add some over-rendering (1 line above, 2 lines below) for smooth scrolling
    const overRenderAbove = 1;
    const overRenderBelow = 2;

    const newStartLine = Math.max(1, Math.floor(scrollTop / lineHeight) - overRenderAbove + 1);
    const newEndLine = Math.min(
      this._totalLineCount,
      Math.ceil((scrollTop + this._viewportHeight) / lineHeight) + overRenderBelow,
    );

    if (newStartLine === this._visibleStartLine && newEndLine === this._visibleEndLine) {
      return; // No change
    }

    this._visibleStartLine = newStartLine;
    this._visibleEndLine = newEndLine;

    // For now, a simple approach: replace all lines when the visible range changes
    // TODO: Incremental update (add/remove lines at edges)
    this._rebuildLines(newStartLine, newEndLine);

    // Notify listener that the visible range changed
    this.onVisibleRangeChanged?.(newStartLine, newEndLine);
  }

  /**
   * Set the content for a specific line.
   */
  setLineContent(lineNumber: number, content: string, tokens: IToken[] | null): void {
    this._lineContentCache.set(lineNumber, content);
    this._lineTokenCache.set(lineNumber, tokens);

    const line = this._collection.getLine(lineNumber);
    if (line) {
      line.setContent(content, tokens, this._config.tabSize);
    }
  }

  /**
   * Invalidate a line — forces re-render on next scroll pass.
   */
  invalidateLine(lineNumber: number): void {
    this._lineContentCache.delete(lineNumber);
    this._lineTokenCache.delete(lineNumber);

    const line = this._collection.getLine(lineNumber);
    if (line) {
      // Schedule for re-render
      if (this.onLineRender) {
        this.onLineRender(lineNumber, line);
      }
    }
  }

  /**
   * Invalidate a range of lines.
   */
  invalidateLines(startLine: number, endLine: number): void {
    for (let line = startLine; line <= endLine; line++) {
      this.invalidateLine(line);
    }
  }

  /**
   * Clear all line content caches (e.g., after file reload).
   */
  clearContentCache(): void {
    this._lineContentCache.clear();
    this._lineTokenCache.clear();
  }

  /**
   * Get the cached content for a line.
   */
  getCachedContent(lineNumber: number): string | undefined {
    return this._lineContentCache.get(lineNumber);
  }

  /**
   * Get the cached tokens for a line.
   */
  getCachedTokens(lineNumber: number): IToken[] | null | undefined {
    return this._lineTokenCache.get(lineNumber);
  }

  /**
   * Force-rebuild all visible lines (bypasses the no-change guard in onScroll).
   * Use after the tokenizer is loaded or content changes that require a full re-render.
   */
  refresh(): void {
    if (this._disposed) return;
    this._rebuildLines(this._visibleStartLine, this._visibleEndLine);
  }

  /**
   * Rebuild ALL lines from scratch (used after word wrap toggle).
   */
  rebuildAll(): void {
    if (this._disposed) return;
    if (this._wordWrapEnabled) {
      // When wrapped, render all lines statically (no virtual scrolling)
      const totalView = this.getViewLineCount();
      this._visibleStartLine = 1;
      this._visibleEndLine = Math.min(totalView, 5000); // cap at 5000 for performance
      this._rebuildLines(1, this._visibleEndLine);
    } else {
      this._visibleStartLine = 1;
      this._visibleEndLine = Math.min(100, this._totalLineCount);
      this._rebuildLines(this._visibleStartLine, this._visibleEndLine);
    }
  }

  /**
   * Get the rendered line count.
   */
  get renderedLineCount(): number {
    return this._collection.count;
  }

  /**
   * Update the scroll height to accommodate all lines.
   */
  private _updateScrollHeight(): void {
    const totalLines = this.getViewLineCount();
    const totalHeight = totalLines * this._config.lineHeight;
    this._linesWrapper.setHeight(totalHeight);
    // The wrapper div inside a naturally-scrolling viewport creates the scroll
  }

  /**
   * Rebuild all visible lines.
   */
  private _rebuildLines(startLine: number, endLine: number): void {
    if (this._disposed) return;

    // Dispose old lines
    const oldLines = this._collection.getLines();
    for (const line of oldLines) {
      if (this.onLineDispose) {
        this.onLineDispose(line.lineNumber, line);
      }
      line.dispose();
    }
    this._collection.clear();

    // Create new lines
    const newLines: ViewLine[] = [];
    const lineHeight = this._config.lineHeight;

    if (this._wordWrapEnabled) {
      // Word wrap: render all wrapped segments statically (no virtual scrolling)
      const provider = this.lineContentProvider;
      if (!provider) {
        for (let lineNum = startLine; lineNum <= endLine; lineNum++) {
          const top = (lineNum - startLine) * lineHeight;
          const viewLine = new ViewLine(lineNum, top, lineHeight);
          if (this.onLineRender) this.onLineRender(lineNum, viewLine);
          this._linesWrapper.appendChild(viewLine.domNode);
          newLines.push(viewLine);
        }
      } else {
        const wrapColumn = this._wrapColumn > 0 ? this._wrapColumn : this._computeWrapColumn();

        let viewLineNum = 1;
        // Limit to a reasonable number of view lines to prevent OOM
        const maxViewLines = Math.min(endLine, 5000);
        for (
          let modelLine = 1;
          modelLine <= this._totalLineCount && viewLineNum <= maxViewLines;
          modelLine++
        ) {
          const content = provider.getLineContent(modelLine);
          const segments = computeWrapSegments(content, wrapColumn);
          const tokens = provider.getLineTokens(modelLine);
          for (let s = 0; s < segments.length && viewLineNum <= maxViewLines; s++) {
            const seg = segments[s];
            const top = (viewLineNum - 1) * lineHeight;
            const viewLine = new ViewLine(modelLine, top, lineHeight);
            const adjustedTokens = this._segmentAdjuster.adjust(
              tokens,
              seg.startColumn - 1,
              seg.text.length,
            );
            viewLine.setContent(seg.text, adjustedTokens, provider.tabSize);
            this._linesWrapper.appendChild(viewLine.domNode);
            newLines.push(viewLine);
            viewLineNum++;
          }
        }
      }
    } else {
      for (let lineNum = startLine; lineNum <= endLine; lineNum++) {
        // Position lines at their absolute scroll position within the viewport.
        // (lineNum - 1) * lineHeight = top of the line in the document
        const top = (lineNum - 1) * lineHeight;
        const viewLine = new ViewLine(lineNum, top, lineHeight);

        // Always fire the render callback — it fetches fresh content from the model.
        // Do NOT pre-fill from the lineContentCache: the cache may contain stale
        // entries after line insertions/deletions (shifted line numbers), and the
        // onLineRender callback always overwrites it anyway.
        if (this.onLineRender) {
          this.onLineRender(lineNum, viewLine);
        }

        this._linesWrapper.appendChild(viewLine.domNode);
        newLines.push(viewLine);
      }
    }

    this._collection.replace(startLine, newLines);
  }

  /**
   * Set the total content width from the view model (max line width across ALL
   * lines, not just visible ones). Called on file load and content change.
   *
   * @param pixelWidth - The pixel width of the widest content, including
   *   left offset (8px) and right gap (8px) = maxLineTextWidth + 16.
   */
  setContentWidth(pixelWidth: number): void {
    const viewportEl = this._viewportEl.element;
    const viewportWidth = viewportEl.getBoundingClientRect().width;
    this._linesWrapper.element.style.width = pixelWidth + "px";
    if (!this._wordWrapEnabled) {
      viewportEl.style.overflowX = pixelWidth > viewportWidth ? "auto" : "hidden";
    }
  }

  /**
   * Measure the character width from the viewport font.
   */
  private _measureCharWidth(): number {
    const el = this._viewportEl.element;
    const cs = getComputedStyle(el);
    const fontSize = parseFloat(cs.fontSize) || 14;
    const fontFamily = cs.fontFamily || "monospace";
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return 8;
    ctx.font = fontSize + "px " + fontFamily;
    return ctx.measureText("X").width || 8;
  }

  /**
   * Dispose the ViewLines manager.
   */
  dispose(): void {
    this._disposed = true;
    const lines = this._collection.getLines();
    for (const line of lines) {
      line.dispose();
    }
    this._collection.clear();
    this._linesWrapper.element.remove();
    this._lineContentCache.clear();
    this._lineTokenCache.clear();
  }
}
