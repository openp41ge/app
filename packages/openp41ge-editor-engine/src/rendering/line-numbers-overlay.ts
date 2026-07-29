/**
 * LineNumbersOverlay — manages line number divs in the editor gutter.
 *
 * Creates and positions line number elements alongside each visible line.
 * Line numbers are absolutely positioned within the gutter and height-synced
 * with the corresponding view line.
 *
 * Structure for each line number:
 *   <div class="line-number-wrapper" style="position:absolute; top:X; height:Y;">   ← spans wrapped height
 *     <div class="line-number" style="height:lineHeight; display:flex; align-items:center; ...">
 *       1
 *     </div>
 *   </div>
 *
 * The inner .line-number element is always exactly lineHeight tall with
 * vertically-centered text. The wrapper spans the full wrapped height so that
 * the line number aligns with the first wrapped segment.
 *
 * Supports two modes:
 *  - Absolute: shows 1, 2, 3, ...
 *  - Relative: shows distance from cursor line (5-, 4-, 3-, 2-, 1-, 0, 1-, ...)
 */

import { createFastDomNode, FastDomNode } from "../view/fast-dom-node";

export type LineNumberMode = "absolute" | "relative";

/**
 * Internal tracked data per model line.
 */
interface LineNumberEntry {
  /** Outer wrapper — spans the full wrapped height. */
  wrapper: FastDomNode;
  /** Inner label — always lineHeight tall, text vertically centered. */
  label: HTMLDivElement;
}

/**
 * Configuration for the line numbers overlay.
 */
export interface LineNumbersOverlayConfig {
  /** Width of the gutter in pixels. */
  gutterWidth: number;
  /** Line height in pixels. */
  lineHeight: number;
  /** The line number display mode. */
  mode?: LineNumberMode;
  /** The cursor line number for relative mode. */
  activeLineNumber?: number;
  /** Callback when a line number is clicked. Receives the 1-based line number. */
  onLineClick?: (lineNumber: number) => void;
  /** When true, line numbers adjust for word wrap. */
  wordWrapEnabled?: boolean;
  /** Returns the view line number (1-based) for a model line (word wrap only). */
  getViewLineStart?: (modelLine: number) => number;
  /** Returns the number of view segments for a model line (word wrap only). */
  getViewLineCount?: (modelLine: number) => number;
}

/**
 * Manages line number DOM elements.
 */
export class LineNumbersOverlay {
  private _gutterEl: FastDomNode;
  private _scrollContainer: FastDomNode;
  private _config: LineNumbersOverlayConfig;
  private _entries: Map<number, LineNumberEntry> = new Map();
  private _disposed: boolean = false;

  constructor(gutterElement: HTMLElement, config: LineNumbersOverlayConfig) {
    this._gutterEl = new FastDomNode(gutterElement);
    this._gutterEl.setPosition("relative");
    this._gutterEl.setClassName("fe-gutter");
    this._gutterEl.setWidth(config.gutterWidth);

    // Inner container that shifts via CSS transform instead of gutter scrollTop.
    // This avoids scroll-boundary mismatches between gutter and viewport.
    this._scrollContainer = createFastDomNode();
    this._scrollContainer.setPosition("absolute");
    this._scrollContainer.setTop(0);
    this._scrollContainer.setLeft(0);
    this._scrollContainer.setWidth(config.gutterWidth);
    this._gutterEl.appendChild(this._scrollContainer);

    this._config = config;
  }

  /**
   * Update the configuration.
   */
  setConfig(config: Partial<LineNumbersOverlayConfig>): void {
    Object.assign(this._config, config);
    this._updateAll();
  }

  /**
   * Set the visible range of lines.
   * Creates/destroys line number elements as needed.
   */
  setVisibleRange(startLine: number, endLine: number, activeLine?: number): void {
    if (this._disposed) return;

    const lineHeight = this._config.lineHeight;
    const mode = this._config.mode ?? "absolute";
    const cursorLine = activeLine ?? this._config.activeLineNumber ?? 0;
    const wrapEnabled = this._config.wordWrapEnabled ?? false;
    const getViewLineStart = this._config.getViewLineStart;
    const getViewLineCount = this._config.getViewLineCount;

    // Pre-compute view positions when word wrap is enabled
    const viewStartMap = new Map<number, number>();
    const viewCountMap = new Map<number, number>();
    if (wrapEnabled && getViewLineStart && getViewLineCount) {
      for (let lineNum = startLine; lineNum <= endLine; lineNum++) {
        const vStart = getViewLineStart(lineNum);
        const vCount = getViewLineCount(lineNum);
        viewStartMap.set(lineNum, vStart);
        viewCountMap.set(lineNum, vCount);
      }
    }

    // Remove elements that are no longer visible
    for (const [lineNum, entry] of this._entries) {
      if (lineNum < startLine || lineNum > endLine) {
        entry.wrapper.element.remove();
        this._entries.delete(lineNum);
      }
    }

    // Create or update elements for visible lines
    for (let lineNum = startLine; lineNum <= endLine; lineNum++) {
      let entry = this._entries.get(lineNum);

      if (!entry) {
        // Outer wrapper — absolutely positioned, spans the visible height
        const wrapper = createFastDomNode();
        wrapper.setPosition("absolute");
        wrapper.setLeft(0);
        wrapper.setWidth(this._config.gutterWidth);

        // Inner label — exactly lineHeight tall, text vertically centered
        const label = document.createElement("div");
        label.className = "line-number";
        label.style.cursor = "pointer";
        label.style.boxSizing = "border-box";
        label.style.width = "100%";
        label.style.display = "flex";
        label.style.alignItems = "center";
        label.style.justifyContent = "flex-end";
        label.style.paddingRight = "8px";
        label.style.overflow = "hidden";
        label.style.textOverflow = "clip";
        label.style.whiteSpace = "nowrap";

        // Click on line number selects the entire line
        label.addEventListener("click", (e) => {
          e.stopPropagation();
          this._config.onLineClick?.(lineNum);
        });

        wrapper.element.appendChild(label);
        this._scrollContainer.appendChild(wrapper);
        entry = { wrapper, label };
        this._entries.set(lineNum, entry);
      }

      // Position the wrapper and set heights
      if (wrapEnabled) {
        const vStart = viewStartMap.get(lineNum) ?? lineNum;
        const vCount = viewCountMap.get(lineNum) ?? 1;
        entry.wrapper.setTop((vStart - 1) * lineHeight);
        entry.wrapper.setHeight(vCount * lineHeight);
        entry.wrapper.element.style.overflow = "hidden";
      } else {
        const top = (lineNum - 1) * lineHeight;
        entry.wrapper.setTop(top);
        entry.wrapper.setHeight(lineHeight);
        entry.wrapper.element.style.overflow = "visible";
      }
      // Inner label is always exactly one lineHeight tall
      entry.label.style.height = lineHeight + "px";
      entry.label.style.lineHeight = lineHeight + "px";

      // Content
      if (mode === "relative" && cursorLine > 0) {
        const distance = Math.abs(lineNum - cursorLine);
        entry.label.textContent = distance === 0 ? "" : String(distance);
        if (distance === 0) {
          entry.label.classList.add("active-line-number");
        } else {
          entry.label.classList.remove("active-line-number");
        }
      } else {
        entry.label.textContent = String(lineNum);
        entry.label.classList.remove("active-line-number");
      }
    }
  }

  /**
   * Update the active line (for relative mode).
   */
  setActiveLine(lineNumber: number, mode?: LineNumberMode): void {
    this._config.activeLineNumber = lineNumber;
    if (mode) {
      this._config.mode = mode;
    }
    this._updateAll();
  }

  /**
   * Set the vertical scroll offset via CSS transform on the inner container.
   * This avoids scroll-boundary issues that occur when syncing gutter scrollTop
   * with the viewport, because absolutely positioned children may not contribute
   * to scrollHeight consistently across browsers.
   */
  setScrollOffset(scrollTop: number): void {
    this._scrollContainer.element.style.transform = `translateY(-${scrollTop}px)`;
  }

  /**
   * Set the line height.
   */
  setLineHeight(height: number): void {
    this._config.lineHeight = height;
    for (const [, entry] of this._entries) {
      entry.label.style.height = height + "px";
      entry.label.style.lineHeight = height + "px";
    }
  }

  /**
   * Clear all line number elements.
   */
  clear(): void {
    for (const [, entry] of this._entries) {
      entry.wrapper.element.remove();
    }
    this._entries.clear();
    // Reset scroll transform
    this._scrollContainer.element.style.transform = "";
  }

  /**
   * Dispose the overlay.
   */
  dispose(): void {
    this._disposed = true;
    this.clear();
  }

  private _updateAll(): void {
    const lines = Array.from(this._entries.keys());
    if (lines.length > 0) {
      this.setVisibleRange(lines[0], lines[lines.length - 1]);
    }
  }
}
