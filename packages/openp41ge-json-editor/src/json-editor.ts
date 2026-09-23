/**
 * <json-editor> — a smart JSON code editor, styled like the file editor.
 *
 * The whole file is a plain text editor: the raw JSON content lives in an
 * editable <textarea> whose text is rendered underneath by a "content view" —
 * a syntax-highlighted, line-numbered view that the textarea is overlaid on, so
 * only the caret and the highlighted text are visible.
 *
 * Structure-aware helpers layered on top of the text editor:
 *  - Code folding: objects / arrays can be collapsed into a single line that
 *    shows metadata about the subtree. Folding works by hiding the folded lines
 *    from the visible buffer (the textarea keeps the source of truth in
 *    `_text`); edits are reconciled back through a visible↔full offset map.
 *  - Delete buttons: every row has one; on an opening-brace row it deletes the
 *    entire subtree, and hovering highlights every affected row red.
 *  - Click-to-select: clicking a key or string value selects the whole token so
 *    typing immediately replaces it.
 *  - Syntax errors: the offending line number is flagged red.
 *  - Caret clamping: the caret can never sit in leading indentation — clicking
 *    or arrowing into indentation jumps to the first typable character.
 *  - Auto-closing pairs, auto-indent, auto-format (unchanged).
 *
 * The public API is unchanged: `value`, `editedValue`, `rowHeight`, `readonly`
 * and the `json-editor-change` / `json-editor-open` events.
 *
 * Emits:
 *  - `json-editor-change` `{ value }` when the text parses to a new value.
 */

import { LitElement, html, css, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { live } from "lit/directives/live.js";
import { parseJson, type JsonNode, type JsonError } from "./json-parse";
import { computeFoldRanges, findEntryAtLine, type FoldRange } from "./json-analyze";
import {
  tokenizeJsonFull,
  selectableRanges,
  type JsonToken,
  type SelectableRange,
} from "./json-tokenize";
import { cloneDeep, summarize } from "./json-tree";
import {
  Gutter,
  lineNumberColumn,
  foldColumn,
  type GutterRow,
} from "openp41ge-editor-gutter";
import { CursorController } from "openp41ge-editor-engine/cursor/cursor-controller";
import { PieceTreeTextContentModel } from "openp41ge-editor-engine/model/piece-tree-text-content-model";
import type { TextPosition } from "openp41ge-editor-engine/model";

export const JSON_EDITOR_CHANGE = "json-editor-change";
export const JSON_EDITOR_OPEN = "json-editor-open";

export const GUTTER_PAD_PX = 8;
export const DEFAULT_DIGIT_PX = 6.6;
/** Width of the dedicated fold-chevron gutter (a second column next to the line numbers). */
export const GUTTER_FOLD_PX = 24;

export function gutterWidthFor(rowCount: number, digitPx: number): number {
  const digits = String(Math.max(1, rowCount)).length;
  return digits * digitPx + GUTTER_PAD_PX * 2;
}

interface VisibleLine {
  /** Full-text line index (0-based). */
  line: number;
  text: string;
  /** Offset of this line's start within `_visibleText`. */
  start: number;
}

@customElement("json-editor")
export class JsonEditorElement extends LitElement {
  @property({ attribute: false }) value: unknown = undefined;
  @property({ type: Boolean, attribute: "readonly" }) readonly = false;
  @property({ type: Number, attribute: "row-height" }) rowHeight = 20;

  /** Full JSON text — the source of truth that gets persisted. */
  @state() private _text = "";
  /** Last successfully parsed value (carried across transiently-invalid text). */
  private _parsedValue: unknown = undefined;
  private _committedJson = "";
  private _digitPx = 0;

  private _root?: JsonNode;
  private _parseError?: JsonError;

  private _folds: FoldRange[] = [];
  /** Open-line indexes of folds currently collapsed. */
  private _folded = new Set<number>();
  private _hiddenLines = new Set<number>();
  private _visibleLines: VisibleLine[] = [];
  private _visibleText = "";
  private _visToFull: number[] = [];
  private _fullLineStarts: number[] = [];

  private _tokens: JsonToken[] = [];
  private _selectables: SelectableRange[] = [];
  /** Full-text line indexes currently highlighted red (delete hover). */
  private _dangerLines = new Set<number>();
  /** Full-text line index currently hovered (reveals its delete button). */
  @state() private _hoverLine: number | null = null;
  /** Gutter row key (full-text line, 0-based) of the caret's line — kept in
   *  sync with the textarea selection so the line-number cell highlights like
   *  the file editor's active line. */
  private _activeLine: number | null = null;
  /** Absolute (visible-text) offsets of a matched bracket pair, when the
   *  caret sits on a bracket. */
  private _braceMatch: [number, number] | null = null;
  /** The shared gutter host (openp41ge-editor-gutter). */
  private _gutter: Gutter | null = null;
  /** Last row geometry pushed to the gutter, so hover moves don't rebuild. */
  private _gutterVisText = "";
  private _gutterRowH = 0;
  private _gutterW = -1;
  /** Cache for the selection highlight (avoids re-measuring on hover updates). */
  private _lastSelKey: string | null = null;
  private _lastVisText = "";
  /** Cached monospace advance width for the editor font (13px). */
  private _contentCharW = 0;
  /** Extra caret positions (offsets in `_visibleText`) beyond the primary. */
  /** Extra carets, each with its own selection (anchor + active position). */
  private _carets: { anchor: number; position: number }[] = [];
  /** Primary caret's selection state while in multi-caret mode. */
  private _primaryAnchor = 0;
  private _primaryPosition = 0;
  /** Custom caret layer + elements (file-editor style: 2px bar, blink). */
  private _caretEls: HTMLElement[] = [];
  private _caretVisible = true;
  private _caretRaf: number | null = null;
  /** Whether the textarea currently has focus (carets show only then). */
  private _isFocused = false;
  /** Set when an Alt+Click mousedown added a caret, so `_onClick` skips. */
  private _altClicked = false;
  /** Whether the current mouse interaction is a drag (general highlight).
   *  While dragging, click-to-select of strings is disabled. */
  private _dragMoved = false;
  private _dragStartX = 0;
  private _dragStartY = 0;

  static styles = css`
    :host {
      display: block;
      box-sizing: border-box;
      height: 100%;
      overflow: hidden;
      color: var(--text-primary, #d4d4d4);
      font-family: ui-monospace, "Cascadia Code", "Fira Code", Menlo, Consolas, monospace;
      font-size: 13px;
      background: var(--bg-primary, #1e1e1e);
      text-align: left;
    }
    :host ::-webkit-scrollbar {
      width: 8px;
      height: 8px;
    }
    :host ::-webkit-scrollbar-track {
      background: transparent;
    }
    :host ::-webkit-scrollbar-thumb {
      background: rgba(255, 255, 255, 0.16);
      border-radius: 0;
    }
    :host ::-webkit-scrollbar-thumb:hover {
      background: rgba(255, 255, 255, 0.34);
    }

    .je-root {
      display: flex;
      flex-direction: column;
      height: 100%;
      min-height: 0;
    }
    .je-viewport {
      flex: 1 1 auto;
      min-height: 0;
      overflow: auto;
      position: relative;
      background: var(--bg-primary, #1e1e1e);
    }
    .je-inner {
      display: flex;
      align-items: stretch;
      width: 100%;
      min-width: max-content;
      min-height: 100%;
      position: relative;
    }
    /* The gutter is provided by openp41ge-editor-gutter (generic 'eg-*'
       classes); the JSON editor styles it to match the file editor. The
       'eg-gutter' host is sticky-left and shrink-wraps its columns. */
    .je-gutter-mount {
      display: contents;
    }
    .eg-gutter {
      position: sticky;
      left: 0;
      z-index: 2;
      display: flex;
      align-items: stretch;
      flex: 0 0 auto;
      background: var(--bg-primary, #1e1e1e);
      user-select: none;
      /* Line-number text — match the file editor (its numbers inherit
         text-primary), not the dimmer text-secondary. */
      color: var(--text-primary, #d4d4d4);
      font-size: 11px;
    }
    .eg-col {
      position: relative;
      box-sizing: border-box;
      flex: 0 0 auto;
    }
    .eg-cell {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      padding: 0 8px;
      box-sizing: border-box;
      white-space: nowrap;
      overflow: hidden;
      cursor: pointer;
      transition: background-color 120ms ease;
    }
    /* Error line numbers keep their red tint; the unified hover box merely
       sits over them (below). */
    .eg-cell--err {
      background: rgba(244, 135, 113, 0.28);
      color: #f48771;
    }
    /* The caret's line-number cell (active gutter row) — matches the file
       editor's active-line highlight. Painted by the gutter host when the
       caret moves; kept subtle so error/fold cells still read clearly. */
    .eg-cell.eg-cell--active {
      background: var(--je-active-line-bg, rgba(255, 255, 255, 0.12));
    }
    /* Fold-header rows: the chevron button fills the cell and owns its hover. */
    .eg-cell--fold {
      justify-content: center;
      padding: 0;
      cursor: default;
    }
    .eg-fold-chevron {
      border: none;
      background: transparent;
      color: var(--je-fold-color, #79c0ff);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 100%;
      height: 100%;
      flex: 1 1 auto;
      padding: 0;
      box-sizing: border-box;
    }
    .eg-chevron {
      display: block;
    }
    .eg-fold-chevron:hover {
      background: rgba(121, 192, 255, 0.18);
      color: #a5d6ff;
    }
    /* Unified hover box: spans BOTH gutter columns on non-foldable rows, but
       stays on the line-number cell only when the row has a chevron (the
       chevron button owns its own hover). Painted by the gutter host; lets
       pointer events pass through. Colors match the file editor's line-number
       hover: same neutral fill + inner ring. */
    .eg-hoverbox {
      position: absolute;
      left: 0;
      top: 0;
      z-index: 3;
      background: rgba(255, 255, 255, 0.09);
      box-sizing: border-box;
      box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.16);
      pointer-events: none;
    }

    .je-content {
      position: relative;
      flex: 1 1 auto;
      min-width: max-content;
    }
    .je-lines {
      position: relative;
      white-space: normal;
    }
    /* Rounded selection highlight layer (Monaco-style). It sits behind the
       line text: outer corners get border-radius, inner (wrap) corners get
       small background-colored notches. */
    .je-selection {
      position: absolute;
      inset: 0;
      z-index: 0;
      pointer-events: none;
    }
    .je-segment {
      position: absolute;
      background: var(--je-selection-bg, rgba(38, 79, 120, 0.75));
      pointer-events: none;
      z-index: 1;
    }
    .je-segment.top-left-radius {
      border-top-left-radius: 3px;
    }
    .je-segment.top-right-radius {
      border-top-right-radius: 3px;
    }
    .je-segment.bottom-left-radius {
      border-bottom-left-radius: 3px;
    }
    .je-segment.bottom-right-radius {
      border-bottom-right-radius: 3px;
    }
    .je-corner-piece {
      position: absolute;
      background: var(--je-selection-bg, rgba(38, 79, 120, 0.85));
      pointer-events: none;
      z-index: 2;
    }
    .je-notch {
      position: absolute;
      background: var(--je-bg, var(--bg-primary, #1e1e1e));
      pointer-events: none;
      z-index: 3;
    }
    .je-notch.top-right-radius {
      border-top-right-radius: 3px;
    }
    .je-notch.bottom-right-radius {
      border-bottom-right-radius: 3px;
    }
    .je-notch.top-left-radius {
      border-top-left-radius: 3px;
    }
    .je-notch.bottom-left-radius {
      border-bottom-left-radius: 3px;
    }
    .je-row {
      position: relative;
      display: flex;
      align-items: stretch;
      height: var(--je-row-height, 20px);
    }
    .je-row--danger {
      background: rgba(244, 135, 113, 0.22);
    }
    .je-line {
      flex: 1 1 auto;
      min-width: 0;
      height: var(--je-row-height, 20px);
      line-height: var(--je-row-height, 20px);
      padding: 0 10px;
      box-sizing: border-box;
      white-space: pre;
      overflow: hidden;
    }
    .je-fold-meta {
      color: var(--text-secondary, #6e7681);
    }
    .je-brace--match {
      background: rgba(121, 192, 255, 0.22);
      color: #a5d6ff;
      border-radius: 2px;
    }
    .je-actions {
      z-index: 3;
      flex: 0 0 26px;
      width: 26px;
      display: flex;
      align-items: center;
      justify-content: flex-end;
      padding-right: 4px;
      box-sizing: border-box;
      pointer-events: none;
    }
    .je-del {
      pointer-events: auto;
      border: none;
      background: transparent;
      color: var(--text-secondary, #6e7681);
      font: inherit;
      font-size: 14px;
      line-height: 1;
      cursor: pointer;
      padding: 2px;
      opacity: 0;
      transition: opacity 0.12s ease;
    }
    .je-del--show {
      opacity: 1;
    }
    .je-del:hover {
      opacity: 1;
      color: #f48771;
    }

    textarea.je-input {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      box-sizing: border-box;
      margin: 0;
      padding: 0 10px;
      border: none;
      outline: none;
      resize: none;
      background: transparent;
      color: transparent;
      caret-color: transparent;
      font: inherit;
      line-height: var(--je-row-height, 20px);
      white-space: pre;
      overflow: hidden;
      word-break: keep-all;
      overscroll-behavior: contain;
      z-index: 1;
    }
    textarea.je-input::selection {
      background: transparent;
      color: transparent;
      -webkit-text-fill-color: transparent;
    }
    /* Custom caret layer — the native textarea caret is hidden and carets
       are rendered here as 2px blinking bars, matching the file editor. */
    .je-caret-layer {
      position: absolute;
      inset: 0;
      z-index: 2;
      pointer-events: none;
    }
    .je-caret {
      position: absolute;
      left: 0;
      top: 0;
      width: 2px;
      background: var(--fe-cursor-color, #d4d4d4);
      pointer-events: none;
    }

    .s-str {
      color: #ce9178;
    }
    .s-var {
      color: #9cdcfe;
    }
    .s-num {
      color: #b5cea8;
    }
    .s-kw {
      color: #569cd6;
    }
    .s-pun {
      color: #d4d4d4;
    }
    .je-key,
    .je-value {
      border-radius: 2px;
    }
  `;

  connectedCallback(): void {
    super.connectedCallback();
    this._digitPx = this._effectiveDigitPx();
    if (this._text === "" && this.value !== undefined) {
      this._applyValue();
    } else {
      this._rebuild(false);
      this._applyRowHeight();
    }
    document.addEventListener("selectionchange", this._onSelectionChange);
    this._startCaretBlink();
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    document.removeEventListener("selectionchange", this._onSelectionChange);
    this._stopCaretBlink();
    this._caretEls = [];
  }

  /** Track the caret line so the line-number cell lights up as it moves. */
  private _onSelectionChange = (): void => {
    this._syncActiveLine();
    this._renderCarets();
  };

  private _onFocus = (): void => {
    this._isFocused = true;
    this._renderCarets();
  };

  /** Recompute and apply the active gutter row from the textarea caret. */
  private _syncActiveLine(): void {
    const ta = this.renderRoot.querySelector(".je-input") as HTMLTextAreaElement | null;
    if (!ta) return;
    const key = this._activeLineFor(ta);
    if (key !== this._activeLine) {
      this._activeLine = key;
      this._gutter?.setActiveRow(key);
    }
  }

  /** The gutter key of the visible line containing the caret. */
  private _activeLineFor(ta: HTMLTextAreaElement): number | null {
    const pos = ta.selectionStart ?? 0;
    const lineIdx = ta.value.slice(0, pos).split("\n").length - 1;
    const v = this._visibleLines[lineIdx];
    return v ? v.line : null;
  }

  willUpdate(changed: Map<string, unknown>): void {
    if (changed.has("value") && this._formatValue(this.value) !== this._text) {
      this._applyValue();
    }
    if (changed.has("rowHeight")) {
      this._applyRowHeight();
    }
  }

  /** The parsed value of the current text (last valid parse while transiently
   * invalid). This is what the host should save. */
  get editedValue(): unknown {
    return this._parsedValue;
  }

  // ── State / structure ────────────────────────────────────────────────────

  private _applyValue(): void {
    const text = this._formatValue(this.value);
    this._text = text;
    this._folded.clear();
    const res = parseJson(text);
    if (res.ok) {
      this._parsedValue = res.value;
      this._committedJson = JSON.stringify(res.value);
    } else {
      this._parsedValue = this.value;
      this._committedJson = JSON.stringify(this._parsedValue);
    }
    this._rebuild(false);
  }

  private _applyRowHeight(): void {
    const lh = Math.max(1, Number(this.rowHeight) || 20);
    this.style.setProperty("--je-row-height", lh + "px");
    this.style.setProperty("--je-gutter-w", gutterWidthFor(this._lineCount(), this._digitPx) + "px");
    this.style.setProperty("--je-fold-w", GUTTER_FOLD_PX + "px");
  }

  private _formatValue(v: unknown): string {
    if (v === undefined) return "";
    if (v === null) return "null";
    return JSON.stringify(v, null, 2) ?? String(v);
  }

  private _formatText(text: string): string | null {
    try {
      const parsed = JSON.parse(text);
      return JSON.stringify(parsed, null, 2) ?? String(parsed);
    } catch {
      return null;
    }
  }

  private _lineCount(): number {
    return this._text.split("\n").length;
  }

  private _effectiveDigitPx(): number {
    if (this._digitPx > 0) return this._digitPx;
    if (typeof document === "undefined") return DEFAULT_DIGIT_PX;
    const s = document.createElement("span");
    s.style.cssText =
      "position:absolute;visibility:hidden;white-space:pre;font-family:ui-monospace,'Cascadia Code','Fira Code',Menlo,Consolas,monospace;font-size:11px;";
    s.textContent = "0";
    document.body.appendChild(s);
    const w = s.getBoundingClientRect().width;
    s.remove();
    this._digitPx = w > 0 ? w : DEFAULT_DIGIT_PX;
    return this._digitPx;
  }

  /** Recompute structure (parse → AST / error), fold ranges, and the visible
   * (folded) buffer. Optionally emits `json-editor-change` when a new valid
   * value forms. */
  private _rebuild(emitChange: boolean): void {
    const res = parseJson(this._text);
    let json: string | undefined;
    if (res.ok) {
      this._root = res.root;
      this._parsedValue = res.value;
      this._parseError = undefined;
      json = JSON.stringify(res.value);
    } else {
      this._root = undefined;
      this._parseError = res.error;
    }

    this._folds = computeFoldRanges(this._text);
    const valid = new Set(this._folds.map((f) => f.openLine));
    for (const o of [...this._folded]) if (!valid.has(o)) this._folded.delete(o);

    this._computeVisible();
    this._tokens = tokenizeJsonFull(this._visibleText);
    this._selectables = selectableRanges(this._tokens);

    if (emitChange && json !== undefined && json !== this._committedJson) {
      this._committedJson = json;
      this.dispatchEvent(
        new CustomEvent(JSON_EDITOR_CHANGE, {
          detail: { value: this._parsedValue },
          bubbles: true,
          composed: true,
        }),
      );
    }

    this._applyRowHeight();
    this.requestUpdate();
  }

  private _computeVisible(): void {
    const lines = this._text.split("\n");
    const hidden = new Set<number>();
    for (const f of this._folds) {
      if (!this._folded.has(f.openLine)) continue;
      for (let i = f.openLine + 1; i <= f.closeLine; i++) hidden.add(i);
    }
    this._hiddenLines = hidden;

    const vis: VisibleLine[] = [];
    let visOff = 0;
    for (let i = 0; i < lines.length; i++) {
      if (hidden.has(i)) continue;
      vis.push({ line: i, text: lines[i], start: visOff });
      visOff += lines[i].length + 1;
    }
    this._visibleLines = vis;
    this._visibleText = vis.map((v) => v.text).join("\n");

    // Full-text offset of the start of each line, plus a visible→full offset map.
    const starts: number[] = [];
    let off = 0;
    for (let i = 0; i < lines.length; i++) {
      starts.push(off);
      off += lines[i].length + (i < lines.length - 1 ? 1 : 0);
    }
    this._fullLineStarts = starts;

    const visToFull: number[] = new Array(this._visibleText.length + 1);
    let vo = 0;
    for (const v of vis) {
      const fl = starts[v.line];
      for (let k = 0; k < v.text.length; k++) {
        visToFull[vo] = fl + k;
        vo++;
      }
      visToFull[vo] = fl + v.text.length;
      vo++;
    }
    this._visToFull = visToFull;
  }

  private _fullLineOf(offset: number): number {
    let lo = 0;
    let hi = this._fullLineStarts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this._fullLineStarts[mid] <= offset) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  }

  private _foldForLine(line: number): FoldRange | undefined {
    return this._folds.find((f) => f.openLine === line);
  }

  // ── Rendering ────────────────────────────────────────────────────────────

  render() {
    return html`
      <div class="je-root">
        <div class="je-viewport">
          <div class="je-inner">
            <div class="je-gutter-mount"></div>
            <div class="je-content">
              <div class="je-selection"></div>
              <div class="je-lines">
                ${this._visibleLines.map((v) => this._renderRow(v))}
              </div>
              <textarea
                class="je-input"
                .value=${live(this._visibleText)}
                ?readonly=${this.readonly}
                spellcheck="false"
                autocomplete="off"
                autocapitalize="off"
                @input=${this._onInput}
                @beforeinput=${this._onBeforeInput}
                @keydown=${this._onKeydown}
                @keyup=${this._onKeyup}
                @select=${() => {
                  this._ensureCaretVisible();
                  this._updateSelectionHighlight();
                  this._syncActiveLine();
                  this._renderCarets();
                }}
                @mousedown=${(e: MouseEvent) => this._onMousedown(e)}
                @mousemove=${this._onMouseMove}
                @mouseleave=${this._onMouseLeave}
                @blur=${this._onBlur}
                @focus=${this._onFocus}
                @click=${this._onClick}
              ></textarea>
              <div class="je-caret-layer"></div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  /** Re-render the rounded selection highlight after the DOM settles. */
  updated(changed: Map<string, unknown>) {
    super.updated(changed);
    this._syncGutter();
    this._syncActiveLine();
    this._updateSelectionHighlight();
    this._renderCarets();
  }

  // ── Gutter (openp41ge-editor-gutter) ─────────────────────────────────────

  firstUpdated(): void {
    const mount = this.renderRoot.querySelector(".je-gutter-mount");
    if (!mount) return;
    this._gutter = new Gutter({
      events: {
        onRowClick: (row) => this._selectLine(row.key),
        onRowSelectRange: (a, b) => this._selectRange(a.key, b.key),
        onHoverChange: (key) => {
          if (this._hoverLine !== key) this._hoverLine = key;
        },
      },
    });
    this._gutter.setColumns([
      lineNumberColumn({
        width: () => gutterWidthFor(this._lineCount(), this._digitPx),
      }),
      foldColumn({
        width: GUTTER_FOLD_PX,
        onToggle: (line) => this._toggleFold(line),
      }),
    ]);
    mount.appendChild(this._gutter.root);
    this._syncGutter();
  }

  /** Push the visible rows + hover into the shared gutter host. Rebuilds the
   *  row set only when content/row-height changes (hover moves just repaint
   *  the hovered row). */
  private _syncGutter(): void {
    if (!this._gutter) return;
    const rowH = Math.max(1, Number(this.rowHeight) || 20);
    const gutterW = gutterWidthFor(this._lineCount(), this._digitPx);
    if (gutterW !== this._gutterW) {
      this._gutterW = gutterW;
      this._gutter.reflow();
    }
    if (
      this._gutterVisText !== this._visibleText ||
      this._gutterRowH !== rowH
    ) {
      this._gutterVisText = this._visibleText;
      this._gutterRowH = rowH;
      this._gutter.setRows(
        this._visibleLines.map(
          (v, i): GutterRow => ({ key: v.line, top: i * rowH, height: rowH }),
        ),
        (key) => this._gutterData(key),
      );
      // Rebuilt rows: repaint every cell so the active/hover classes land on
      // the right cells (setRows only styles cells it (re)creates).
      this._gutter.refresh();
    }
  }

  /** Per-row gutter data shared by the built-in columns. */
  private _gutterData(key: number) {
    return {
      error: !!this._parseError && this._parseError.line === key,
      hasChevron: this._foldForLine(key) !== undefined,
      folded: this._folded.has(key),
    };
  }

  /** Select the whole visible line in the editor (click on a line number). */
  private _selectLine(fullLine: number): void {
    const ta = this.renderRoot.querySelector(".je-input") as HTMLTextAreaElement | null;
    const v = this._visibleLines.find((x) => x.line === fullLine);
    if (!ta || !v) return;
    ta.focus();
    this._collapseMulti();
    ta.setSelectionRange(v.start, v.start + v.text.length);
    this._updateBraceMatch(ta);
    this._updateSelectionHighlight();
    this._syncActiveLine();
  }

  /** Select the range of visible lines [a, b] (drag across line numbers). */
  private _selectRange(aLine: number, bLine: number): void {
    const ta = this.renderRoot.querySelector(".je-input") as HTMLTextAreaElement | null;
    const a = this._visibleLines.find((x) => x.line === aLine);
    const b = this._visibleLines.find((x) => x.line === bLine);
    if (!ta || !a || !b) return;
    ta.focus();
    const start = Math.min(a.start, b.start);
    const end = Math.max(a.start + a.text.length, b.start + b.text.length);
    this._collapseMulti();
    ta.setSelectionRange(start, end);
    this._updateBraceMatch(ta);
    this._updateSelectionHighlight();
    this._syncActiveLine();
  }

  /** Build the Monaco-style rounded selection highlight overlay.
   *  Renders EVERY caret's range (primary + extras) as its own rounded set. */
  private _updateSelectionHighlight(): void {
    const ta = this._inputEl();
    const overlay = this.renderRoot.querySelector(".je-selection") as HTMLElement | null;
    if (!ta || !overlay) return;
    const ranges = this._allCarets().map((c) => [c.s, c.e] as [number, number]);
    // Merge overlapping/adjacent ranges so overlapping carets don't double-
    // paint the highlight (one contiguous highlight per overlapped span).
    const merged: [number, number][] = [];
    for (const r of ranges.sort((a, b) => a[0] - b[0])) {
      const last = merged[merged.length - 1];
      if (last && r[0] <= last[1]) {
        last[1] = Math.max(last[1], r[1]);
      } else {
        merged.push([r[0], r[1]]);
      }
    }
    const key = merged.map((r) => `${r[0]}:${r[1]}`).join("|");
    if (this._lastSelKey === key && this._lastVisText === this._visibleText) return;
    this._lastSelKey = key;
    this._lastVisText = this._visibleText;
    while (overlay.firstChild) overlay.removeChild(overlay.firstChild);

    const rows = this.renderRoot.querySelectorAll(".je-lines .je-row");
    const rowH = Math.max(1, Number(this.rowHeight) || 20);
    for (const [s, e] of merged) {
      if (s === e) continue;
      const segs: { rowIndex: number; left: number; right: number }[] = [];
      this._visibleLines.forEach((v, i) => {
        const rowEl = rows[i] as HTMLElement | undefined;
        if (!rowEl) return;
        const lineStart = v.start;
        const lineEnd = v.start + v.text.length;
        const localStart = Math.max(s, lineStart) - lineStart;
        const localEnd = Math.min(e, lineEnd) - lineStart;
        if (localEnd <= localStart || localStart >= v.text.length) return;
        const lineEl = rowEl.querySelector(".je-line");
        if (!lineEl) return;
        const nodes = this._lineTextNodes(lineEl);
        const left = this._boundaryX(lineEl, nodes, Math.max(0, localStart));
        const right = this._boundaryX(lineEl, nodes, Math.min(v.text.length, localEnd));
        segs.push({ rowIndex: i, left, right });
      });
      this._renderSegs(overlay, segs, rowH);
    }
  }

  /** Render one selection's line segments as rounded, intern-joined pieces. */
  private _renderSegs(
    overlay: HTMLElement,
    segs: { rowIndex: number; left: number; right: number }[],
    rowH: number,
  ): void {
    if (segs.length === 0) return;
    const W = 3; // corner piece size
    for (let i = 0; i < segs.length; i++) {
      const seg = segs[i];
      const prev = i > 0 ? segs[i - 1] : null;
      const next = i + 1 < segs.length ? segs[i + 1] : null;
      const lineNum = this._visibleLines[seg.rowIndex].line;
      const prevAdj = prev && this._visibleLines[prev.rowIndex].line === lineNum - 1;
      const nextAdj = next && this._visibleLines[next.rowIndex].line === lineNum + 1;

      const tl = prevAdj ? this._cornerLeft(seg.left, prev!.left, prev!.right) : "ex";
      const bl = nextAdj ? this._cornerLeft(seg.left, next!.left, next!.right) : "ex";
      const tr = prevAdj ? this._cornerRight(seg.right, prev!.right) : "ex";
      const br = nextAdj ? this._cornerRight(seg.right, next!.right) : "ex";

      const top = seg.rowIndex * rowH;
      const segEl = document.createElement("div");
      let cls = "je-segment";
      if (tl === "ex") cls += " top-left-radius";
      if (tr === "ex") cls += " top-right-radius";
      if (bl === "ex") cls += " bottom-left-radius";
      if (br === "ex") cls += " bottom-right-radius";
      segEl.className = cls;
      segEl.style.left = `${seg.left}px`;
      segEl.style.top = `${top}px`;
      segEl.style.width = `${Math.max(0, seg.right - seg.left)}px`;
      segEl.style.height = `${rowH}px`;
      overlay.appendChild(segEl);

      if (tl === "in") this._renderIntern(overlay, seg.left, top, "left", "top", rowH, W);
      if (bl === "in") this._renderIntern(overlay, seg.left, top, "left", "bottom", rowH, W);
      if (tr === "in") this._renderIntern(overlay, seg.right, top, "right", "top", rowH, W);
      if (br === "in") this._renderIntern(overlay, seg.right, top, "right", "bottom", rowH, W);
    }
  }

  /** FLAT / INTERN / EXTERN for a left corner, vs the adjacent line. */
  private _cornerLeft(x: number, adjLeft: number, adjRight: number): "flat" | "in" | "ex" {
    if (Math.abs(x - adjLeft) < 1) return "flat";
    if (adjLeft < x && x < adjRight) return "in";
    return "ex";
  }

  /** FLAT / INTERN / EXTERN for a right corner, vs the adjacent line. */
  private _cornerRight(x: number, adjRight: number): "flat" | "in" | "ex" {
    if (Math.abs(x - adjRight) < 1) return "flat";
    if (x < adjRight) return "in";
    return "ex";
  }

  /** Render an INTERN corner: a highlight square with a bg-colored notch. */
  private _renderIntern(
    overlay: HTMLElement,
    edgeX: number,
    top: number,
    side: "left" | "right",
    edge: "top" | "bottom",
    rowH: number,
    w: number,
  ): void {
    const x = side === "left" ? edgeX - w : edgeX;
    const y = edge === "top" ? top : top + rowH - w;

    const piece = document.createElement("div");
    piece.className = "je-corner-piece";
    piece.style.left = `${x}px`;
    piece.style.top = `${y}px`;
    piece.style.width = `${w}px`;
    piece.style.height = `${w}px`;
    overlay.appendChild(piece);

    const notch = document.createElement("div");
    const cornerClass =
      side === "left"
        ? edge === "top"
          ? "top-right-radius"
          : "bottom-right-radius"
        : edge === "top"
          ? "top-left-radius"
          : "bottom-left-radius";
    notch.className = `je-notch ${cornerClass}`;
    notch.style.left = `${x}px`;
    notch.style.top = `${y}px`;
    notch.style.width = `${w}px`;
    notch.style.height = `${w}px`;
    overlay.appendChild(notch);
  }

  private _lineTextNodes(lineEl: Element): Text[] {
    const walker = document.createTreeWalker(lineEl, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => {
        const p = n.parentElement;
        if (p && p.closest(".je-fold-meta")) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    const nodes: Text[] = [];
    let n: Node | null;
    while ((n = walker.nextNode())) nodes.push(n as Text);
    return nodes;
  }

  private _rangePosAt(nodes: Text[], offset: number): { node: Text; off: number } | null {
    for (const n of nodes) {
      if (offset <= n.data.length) return { node: n, off: offset };
      offset -= n.data.length;
    }
    return null;
  }

  /** X of the char boundary at `charIdx`, relative to the line's left edge.
   *  Uses exact glyph measurement (Range rects) when available; falls back
   *  to a constant monospace advance width where DOM layout is unavailable
   *  (e.g. jsdom, headless). */
  private _boundaryX(lineEl: Element, nodes: Text[], charIdx: number): number {
    const lineRect = lineEl.getBoundingClientRect();
    const pos = this._rangePosAt(nodes, charIdx);
    if (!pos) return 10 + charIdx * this._measureCharW();
    try {
      const range = document.createRange();
      range.setStart(pos.node, pos.off);
      range.setEnd(pos.node, pos.off);
      const r = range.getBoundingClientRect();
      if (r && typeof r.left === "number" && Number.isFinite(r.left)) {
        return r.left - lineRect.left;
      }
    } catch {
      /* fall through to monospace fallback */
    }
    return 10 + charIdx * this._measureCharW();
  }

  /** Advance width of a single monospace character, measured lazily. */
  private _measureCharW(): number {
    if (this._contentCharW > 0) return this._contentCharW;
    if (typeof document === "undefined" || typeof document.createElement !== "function") {
      this._contentCharW = 7;
      return this._contentCharW;
    }
    const s = document.createElement("span");
    s.style.cssText =
      "position:absolute;visibility:hidden;white-space:pre;font-family:ui-monospace,'Cascadia Code','Fira Code',Menlo,Consolas,monospace;font-size:13px;";
    s.textContent = "0".repeat(100);
    document.body.appendChild(s);
    const w = s.getBoundingClientRect().width / 100;
    s.remove();
    this._contentCharW = w > 0 ? w : 7;
    return this._contentCharW;
  }


  private _renderRow(v: VisibleLine) {
    const fold = this._foldForLine(v.line);
    const isFolded = this._folded.has(v.line);
    const danger = this._dangerLines.has(v.line);
    const closeRow = /^\s*[}\]]\s*,?\s*$/.test(v.text);
    const showDel = !closeRow && this._hoverLine === v.line;
    const tokens = tokenizeJsonFull(v.text);
    const { keyStarts, valueStarts } = this._classifyTokens(tokens);
    const meta = isFolded
      ? html`<span class="je-fold-meta">${this._foldMeta(fold)}</span>`
      : "";
    // When folded, the open line's own opening brace would sit next to the
    // meta's `{ … }`/`[ … ]` label (a doubled brace). Replace the line's
    // content with just the key prefix (everything before the opening brace)
    // so the fold meta is the only opening-brace replacement visible.
    const openIdx = isFolded
      ? tokens.findIndex(
          (t) => t.kind === "punct" && (t.value === "{" || t.value === "["),
        )
      : -1;
    const content = tokens.map((t, i) => {
      if (isFolded && openIdx >= 0 && i >= openIdx) return "";
      const abs = v.start + t.start;
      const brace =
        !isFolded &&
        this._braceMatch !== null &&
        (this._braceMatch[0] === abs || this._braceMatch[1] === abs);
      return this._renderToken(t, keyStarts, valueStarts, brace);
    });
    const del = closeRow
      ? ""
      : html`<button class="je-del ${showDel ? "je-del--show" : ""}" title="Delete" @click=${() => this._deleteAtLine(v.line)} @mouseenter=${() => { this._hoverLine = v.line; this._setDanger(v.line); }} @mouseleave=${() => this._clearDanger()}>\u00d7</button>`;
    return html`<div class="je-row ${danger ? "je-row--danger" : ""}" data-line="${v.line}"><div class="je-line">${content}${meta}</div><div class="je-actions">${del}</div></div>`;
  }

  /** Per-line token classification: which tokens are object keys / scalar
   * values (for click-to-select and affordance classes). */
  private _classifyTokens(tokens: JsonToken[]): {
    keyStarts: Set<number>;
    valueStarts: Set<number>;
  } {
    const keyStarts = new Set<number>();
    const valueStarts = new Set<number>();
    const nonWs = tokens.filter((t) => t.kind !== "ws");
    for (let i = 0; i < nonWs.length; i++) {
      const t = nonWs[i];
      if (t.kind === "string") {
        const nxt = nonWs[i + 1];
        (nxt && nxt.kind === "punct" && nxt.value === ":" ? keyStarts : valueStarts).add(t.start);
      } else if (t.kind === "number" || t.kind === "keyword") {
        valueStarts.add(t.start);
      }
    }
    return { keyStarts, valueStarts };
  }

  private _renderToken(
    t: JsonToken,
    keyStarts: Set<number>,
    valueStarts: Set<number>,
    braceMatch = false,
  ) {
    if (t.kind === "ws") return t.value;
    let cls = "s-pun";
    if (keyStarts.has(t.start)) cls = "s-var";
    else if (t.kind === "string") cls = "s-str";
    else if (t.kind === "number") cls = "s-num";
    else if (t.kind === "keyword") cls = "s-kw";
    if (braceMatch) cls += " je-brace--match";
    return html`<span class="${cls}">${t.value}</span>`;
  }

  private _foldMeta(fold: FoldRange | undefined): string {
    if (!fold || !this._root) return "";
    const m = findEntryAtLine(this._root, fold.openLine);
    const node = m?.node;
    if (!node || (node.type !== "object" && node.type !== "array")) return "";
    const summary = summarize(node.value as Record<string, unknown> | unknown[]);
    // Render the summary INSIDE the braces — the row is the property key plus
    // this replacement, so the meta's braces are the only ones shown.
    return node.type === "object" ? `{ ${summary} }` : `[ ${summary} ]`;
  }

  // ── Editing ──────────────────────────────────────────────────────────────

  private _onInput(e: Event): void {
    this._afterEdit(e.target as HTMLTextAreaElement);
  }

  /** With multiple carets the native textarea edit is replaced by a manual
   *  edit applied at every caret (see `_multiInsert`/`_multiBackspace`). */
  private _onBeforeInput = (e: InputEvent): void => {
    if (this.readonly || this._carets.length === 0) return;
    const type = e.inputType;
    if (type === "insertText") {
      e.preventDefault();
      this._multiInsert(e.data ?? "");
    } else if (type === "insertLineBreak" || type === "insertParagraph") {
      e.preventDefault();
      this._multiNewline();
    } else if (type === "deleteContentBackward" || type === "deleteWordBackward") {
      e.preventDefault();
      this._multiBackspace();
    } else if (type === "deleteContentForward" || type === "deleteWordForward") {
      e.preventDefault();
      this._multiDelete();
    } else if (type === "insertFromPaste" || type === "insertFromDrop") {
      e.preventDefault();
      this._multiInsert(e.data ?? "");
    }
  };

  private _onBlur = (): void => {
    this._isFocused = false;
    this._renderCarets();
    const formatted = this._formatText(this._text);
    if (formatted !== null && formatted !== this._text) {
      this._folded.clear();
      this._text = formatted;
      this._rebuild(true);
    }
  };

  /** Reconcile a visible-text edit back into the full text, then rebuild. */
  private _afterEdit(ta: HTMLTextAreaElement): void {
    if (this.readonly) return;
    const newVis = ta.value;
    if (newVis !== this._visibleText) this._applyVisible(newVis);
    this._ensureCaretVisible();
    this._updateBraceMatch(ta);
    this._syncActiveLine();
    this._renderCarets();
  }

  private _applyVisible(newVis: string): void {
    const oldVis = this._visibleText;
    // Find the edited region via common prefix/suffix.
    const p = this._commonPrefix(oldVis, newVis);
    const maxS = Math.min(oldVis.length, newVis.length) - p;
    let s = 0;
    while (s < maxS && oldVis[oldVis.length - 1 - s] === newVis[newVis.length - 1 - s]) s++;
    const vStart = p;
    const vEnd = oldVis.length - s;
    const inserted = newVis.slice(p, newVis.length - s);

    const fullStart = this._visToFull[Math.min(vStart, oldVis.length)];
    const fullEnd = this._visToFull[Math.min(vEnd, oldVis.length)];

    // Guard against edits that would swallow folded (hidden) content — expand
    // those folds and leave the text unchanged rather than lose data.
    if (this._editCrossesFolds(fullStart, fullEnd)) {
      this._folded.clear();
      this._computeVisible();
      this._tokens = tokenizeJsonFull(this._visibleText);
      this._selectables = selectableRanges(this._tokens);
      this._applyRowHeight();
      this.requestUpdate();
      return;
    }

    this._text =
      this._text.slice(0, fullStart) + inserted + this._text.slice(fullEnd);
    this._rebuild(true);
  }

  private _commonPrefix(a: string, b: string): number {
    const n = Math.min(a.length, b.length);
    let i = 0;
    while (i < n && a[i] === b[i]) i++;
    return i;
  }

  /** True when the full-text region being edited spans any hidden (folded)
   *  line — an edit the user can only have made by crossing a fold. */
  private _editCrossesFolds(fullStart: number, fullEnd: number): boolean {
    if (this._hiddenLines.size === 0) return false;
    const sLine = this._fullLineOf(fullStart);
    const eLine = this._fullLineOf(fullEnd);
    for (const l of this._hiddenLines) {
      // Hidden lines strictly between the edit boundaries (the boundary lines
      // themselves are visible so they're not part of a fold's hidden span).
      if (l > sLine && l < eLine) return true;
    }
    return false;
  }

  /** Pretty-print/rebuild the parsed value as 2-space text. */
  private _toggleFold(openLine: number): void {
    if (this._folded.has(openLine)) this._folded.delete(openLine);
    else this._folded.add(openLine);
    this._computeVisible();
    this._tokens = tokenizeJsonFull(this._visibleText);
    this._selectables = selectableRanges(this._tokens);
    this._applyRowHeight();
    this.requestUpdate();
  }

  private _deleteAtLine(fullLine: number): void {
    if (this.readonly || !this._root || this._parsedValue === undefined) return;
    const m = findEntryAtLine(this._root, fullLine);
    if (!m) return;
    const next = cloneDeep(this._parsedValue) as Record<string, unknown> | unknown[];
    if (m.member && typeof m.member.key === "string" && typeof next === "object" && next !== null && !Array.isArray(next)) {
      delete next[m.member.key];
    } else if (m.index !== undefined && Array.isArray(next)) {
      next.splice(m.index, 1);
    }
    const text = JSON.stringify(next, null, 2) ?? String(next);
    this._folded.clear();
    this._text = text;
    this._rebuild(true);
  }

  private _setDanger(fullLine: number): void {
    if (!this._root) return;
    const m = findEntryAtLine(this._root, fullLine);
    if (!m) return;
    const set = new Set<number>();
    for (let l = m.line; l <= m.node.endLine; l++) set.add(l);
    this._dangerLines = set;
    this.requestUpdate();
  }

  private _clearDanger(): void {
    if (this._dangerLines.size === 0) return;
    this._dangerLines = new Set();
    this.requestUpdate();
  }

  /** Track which row the pointer is over so its delete button is revealed. */
  private _onMouseMove = (e: MouseEvent): void => {
    // Detect a drag (general highlight): mouse held and moved beyond a small
    // threshold. A drag disables the click-to-select-of-strings behavior.
    if (e.buttons > 0 && !this._dragMoved) {
      const dx = e.clientX - this._dragStartX;
      const dy = e.clientY - this._dragStartY;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) this._dragMoved = true;
    }
    // While dragging, keep the selection highlight in sync with the cursor.
    // (The native textarea selection is hidden, and the `select` event only
    // fires on release, so the overlay must be repainted as the drag moves.)
    if (this._dragMoved && e.buttons > 0) {
      const ta = this._inputEl();
      if (ta && this._carets.length > 0) {
        // In multi mode the primary selection is driven by the model
        // (anchor/position), so mirror the drag's native selection into it.
        this._primaryAnchor = ta.selectionStart;
        this._primaryPosition = ta.selectionEnd;
      }
      this._updateSelectionHighlight();
    }
    const rowH = Math.max(1, Number(this.rowHeight) || 20);
    const idx = Math.floor(e.offsetY / rowH);
    const line =
      idx >= 0 && idx < this._visibleLines.length ? this._visibleLines[idx].line : null;
    if (line !== this._hoverLine) {
      this._hoverLine = line;
      this.requestUpdate();
    }
  };

  private _onMousedown = (e: MouseEvent): void => {
    this._dragMoved = false;
    this._dragStartX = e.clientX;
    this._dragStartY = e.clientY;
    // Alt+Click adds/toggles a caret WITHOUT moving the primary caret — stop
    // the textarea from collapsing its selection, then place the new caret.
    if (e.altKey && !this.readonly && e.button === 0) {
      e.preventDefault();
      this._altClicked = true;
      const pos = this._clickedPos(e);
      this._toggleCaret(pos);
    }
  };

  /** Map a mousedown on the textarea to an offset in `_visibleText`. */
  private _clickedPos(e: MouseEvent): number {
    const rowH = Math.max(1, Number(this.rowHeight) || 20);
    const idx = Math.floor(e.offsetY / rowH);
    const v = this._visibleLines[Math.max(0, idx)];
    if (!v) return 0;
    const lineStart = v.start;
    const lineLen = v.text.length;
    const cw = this._measureCharW() > 0 ? this._measureCharW() : 8;
    const col = Math.max(0, Math.floor((e.offsetX - 10) / cw));
    return lineStart + Math.min(col, lineLen);
  }

  private _onMouseLeave = (): void => {
    if (this._hoverLine !== null || this._dangerLines.size > 0) {
      this._hoverLine = null;
      this._dangerLines = new Set();
      this.requestUpdate();
    }
  };

  // ── Bracket matching (caret on a bracket highlights its pair) ────────────
  private _updateBraceMatch(ta: HTMLTextAreaElement): void {
    const text = this._visibleText;
    const pos = ta.selectionStart;
    const isBr = (c: string) => c === "{" || c === "}" || c === "[" || c === "]";
    let idx = -1;
    if (isBr(text[pos])) idx = pos;
    else if (pos > 0 && isBr(text[pos - 1])) idx = pos - 1;
    const match = idx >= 0 ? this._bracketPair(text, idx) : -1;
    const next: [number, number] | null =
      match >= 0 ? [Math.min(idx, match), Math.max(idx, match)] : null;
    const same =
      (next === null && this._braceMatch === null) ||
      (next !== null &&
        this._braceMatch !== null &&
        next[0] === this._braceMatch[0] &&
        next[1] === this._braceMatch[1]);
    if (same) return;
    this._braceMatch = next;
    this.requestUpdate();
  }

  /** Find the index matching an opening/closing bracket (string-aware). */
  private _bracketPair(text: string, idx: number): number {
    const stack: number[] = [];
    const map = new Map<number, number>();
    let inStr = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inStr) {
        if (c === "\\") i++;
        else if (c === '"') inStr = false;
        continue;
      }
      if (c === '"') inStr = true;
      else if (c === "{" || c === "[") stack.push(i);
      else if (c === "}" || c === "]") {
        const o = stack.pop();
        if (o !== undefined) {
          map.set(o, i);
          map.set(i, o);
        }
      }
    }
    return map.get(idx) ?? -1;
  }

  // ── Key handling ─────────────────────────────────────────────────────────

  private _onKeydown(e: KeyboardEvent): void {
    if (this.readonly) return;
    const ta = e.target as HTMLTextAreaElement;
    const key = e.key;

    // Add a caret above/below the primary — works even from a single caret.
    if ((e.ctrlKey || e.metaKey) && e.altKey && (key === "ArrowUp" || key === "ArrowDown")) {
      e.preventDefault();
      this._addCaretAboveBelow(key === "ArrowUp" ? -1 : 1);
      return;
    }

    // With multiple carets, Enter/Tab/Escape are handled here; plain chars &
    // backspace/delete flow through `@beforeinput` so the edit is applied at
    // EVERY caret. Arrow keys move ALL carets; Shift extends each selection.
    if (this._carets.length > 0) {
      if (/^Arrow/.test(key)) {
        e.preventDefault();
        this._moveAllCarets(key, e.shiftKey, e.metaKey || e.ctrlKey);
        return;
      }
      if (key === "Enter") {
        e.preventDefault();
        this._multiNewline();
        return;
      }
      if (key === "Tab") {
        e.preventDefault();
        this._multiInsert("  ");
        return;
      }
      if (key === "Escape") {
        e.preventDefault();
        this._carets = [];
        this._renderCarets();
        return;
      }
      return;
    }

    // Single caret: Cmd/Ctrl+Arrow is unreliable in the native textarea (and
    // the caret bar wouldn't track the active end), so drive line/document
    // boundary moves through the shared engine too. Plain arrows & Shift stay
    // native.
    if ((e.metaKey || e.ctrlKey) && /^Arrow/.test(key)) {
      e.preventDefault();
      this._singleCmdArrow(ta, key, e.shiftKey);
      return;
    }

    if (key === "Enter") {
      e.preventDefault();
      if (this._enterEmptyPair(ta)) {
        this._afterEdit(ta);
        return;
      }
      this._replaceRange(ta, ta.selectionStart, ta.selectionEnd, "\n" + this._indentAfter(ta));
      this._afterEdit(ta);
      return;
    }
    if (key === "Tab") {
      e.preventDefault();
      this._replaceRange(ta, ta.selectionStart, ta.selectionEnd, "  ");
      this._afterEdit(ta);
      return;
    }
    if (key === "Backspace") {
      if (this._pairBackspace(ta)) {
        e.preventDefault();
        this._afterEdit(ta);
      }
      return;
    }
    if (key === "{") {
      if (this._autoPair(ta, "{", "}")) {
        e.preventDefault();
        this._afterEdit(ta);
      }
      return;
    }
    if (key === "[") {
      if (this._autoPair(ta, "[", "]")) {
        e.preventDefault();
        this._afterEdit(ta);
      }
      return;
    }
    if (key === '"') {
      if (this._autoPairQuote(ta)) {
        e.preventDefault();
        this._afterEdit(ta);
      }
      return;
    }
    if (key === "}" || key === "]") {
      if (this._skipOver(ta, key)) {
        e.preventDefault();
        this._afterEdit(ta);
      }
    }
  }

  private _onKeyup = (e: KeyboardEvent): void => {
    const k = e.key;
    const ta = e.target as HTMLTextAreaElement;
    this._updateBraceMatch(ta);
    this._syncActiveLine();
    this._renderCarets();
  };

  private _onClick = (e: Event): void => {
    if (this.readonly) return;
    const ta = e.target as HTMLTextAreaElement;
    // An Alt+Click already added a caret in mousedown — swallow the click.
    if (this._altClicked) {
      this._altClicked = false;
      return;
    }
    // A plain click collapses to the single primary caret.
    if (this._carets.length > 0) this._collapseMulti();
    // A drag (general highlight) disables the click-to-select of strings.
    if (this._dragMoved) {
      this._dragMoved = false;
      this._updateBraceMatch(ta);
      this._syncActiveLine();
      return;
    }
    if (ta.selectionStart !== ta.selectionEnd) {
      this._updateBraceMatch(ta);
      this._syncActiveLine();
      return;
    }
    const pos = ta.selectionStart;
    const r = this._selectableAt(pos);
    if (r) {
      ta.setSelectionRange(r.start, r.end);
    }
    this._updateBraceMatch(ta);
    this._syncActiveLine();
  };

  private _selectableAt(pos: number): SelectableRange | null {
    for (const r of this._selectables) {
      if (pos >= r.start - 1 && pos <= r.end + 1) return r;
    }
    return null;
  }

  // ── JSON editing helpers ─────────────────────────────────────────────────

  private _autoPair(ta: HTMLTextAreaElement, open: string, close: string): boolean {
    if (ta.selectionStart !== ta.selectionEnd) return false;
    const pos = ta.selectionStart;
    this._replaceRange(ta, pos, pos, open + close);
    ta.setSelectionRange(pos + 1, pos + 1);
    return true;
  }

  private _autoPairQuote(ta: HTMLTextAreaElement): boolean {
    if (ta.selectionStart !== ta.selectionEnd) return false;
    const text = ta.value;
    const pos = ta.selectionStart;
    if (this._insideString(text, pos)) {
      if (text[pos] === '"') {
        ta.setSelectionRange(pos + 1, pos + 1);
        return true;
      }
      return false;
    }
    this._replaceRange(ta, pos, pos, '""');
    ta.setSelectionRange(pos + 1, pos + 1);
    return true;
  }

  private _skipOver(ta: HTMLTextAreaElement, ch: string): boolean {
    if (ta.value[ta.selectionStart] !== ch) return false;
    ta.setSelectionRange(ta.selectionStart + 1, ta.selectionStart + 1);
    return true;
  }

  private _pairBackspace(ta: HTMLTextAreaElement): boolean {
    const { selectionStart: s, selectionEnd: e, value } = ta;
    if (s !== e || s <= 0) return false;
    const open = value[s - 1];
    const close = value[s];
    if (
      (open === "{" && close === "}") ||
      (open === "[" && close === "]") ||
      (open === '"' && close === '"')
    ) {
      this._replaceRange(ta, s - 1, s + 1, "");
      ta.setSelectionRange(s - 1, s - 1);
      return true;
    }
    return false;
  }

  private _indentAfter(ta: HTMLTextAreaElement): string {
    return this._indentAt(ta.value, ta.selectionStart);
  }

  /** Enter inside an empty `[]`/`{}` pair expands it into a three-line block:
   *  the closing bracket moves onto its own line aligned with the opening
   *  line's indent, and the caret lands on a freshly-indented middle line
   *  ready for the first value. Returns true when handled. */
  private _enterEmptyPair(ta: HTMLTextAreaElement): boolean {
    const { selectionStart: s, selectionEnd: e, value } = ta;
    if (s !== e || s <= 0 || s >= value.length) return false;
    const open = value[s - 1];
    const close = value[s];
    if (!((open === "[" && close === "]") || (open === "{" && close === "}"))) {
      return false;
    }
    const contentIndent = this._indentAt(value, s);
    const closeIndent = this._indentAt(value, s - 1);
    const ins = `\n${contentIndent}\n${closeIndent}`;
    this._replaceRange(ta, s, s, ins);
    ta.setSelectionRange(s + 1 + contentIndent.length, s + 1 + contentIndent.length);
    return true;
  }

  private _indentAt(text: string, pos: number): string {
    const before = text.slice(0, pos);
    let depth = 0;
    let inStr = false;
    let escaped = false;
    for (let i = 0; i < before.length; i++) {
      const c = before[i];
      if (inStr) {
        if (escaped) escaped = false;
        else if (c === "\\") escaped = true;
        else if (c === '"') inStr = false;
        continue;
      }
      if (c === '"') inStr = true;
      else if (c === "{" || c === "[") depth++;
      else if (c === "}" || c === "]") depth = Math.max(0, depth - 1);
    }
    return "  ".repeat(depth);
  }

  // ── Custom caret rendering (file-editor style: 2px bar, blink) ───────────

  private _inputEl(): HTMLTextAreaElement | null {
    return this.renderRoot.querySelector(".je-input") as HTMLTextAreaElement | null;
  }

  private _defaultCharW(): number {
    return this._measureCharW() > 0 ? this._measureCharW() : 7;
  }

  /** Exit multi-caret mode (collapse to the single primary hover). */
  private _collapseMulti(): void {
    if (this._carets.length > 0) {
      this._carets = [];
      this._renderCarets();
    }
  }

  /** All caret ranges (primary + extras). Neither deduplicates carets that
   *  share a position nor sorts — callers render/merge every caret, and the
   *  edit helpers dedup identical ranges themselves while keeping the 1:1
   *  caret-to-result mapping. Callers that need an ordering sort locally. */
  private _allCarets(): { s: number; e: number; pos: number }[] {
    const ta = this._inputEl();
    let anchor: number;
    let pos: number;
    if (this._carets.length > 0) {
      anchor = this._primaryAnchor;
      pos = this._primaryPosition;
    } else {
      const s = ta?.selectionStart ?? 0;
      const e = ta?.selectionEnd ?? 0;
      // The caret must sit at the ACTIVE end the user is moving. For a
      // backward selection (Shift+ArrowLeft/Shift+ArrowUp) the active end is
      // selectionStart; using selectionEnd would pin the caret to the anchor.
      if (ta?.selectionDirection === "backward") {
        anchor = e;
        pos = s;
      } else {
        anchor = s;
        pos = e;
      }
    }
    const out: { s: number; e: number; pos: number }[] = [
      { s: Math.min(anchor, pos), e: Math.max(anchor, pos), pos },
    ];
    for (const c of this._carets) {
      const cs = Math.min(c.anchor, c.position);
      out.push({ s: cs, e: Math.max(c.anchor, c.position), pos: c.position });
    }
    return out;
  }

  /** Render one `.je-caret` (2px bar) per caret, positioned over the text. */
  private _renderCarets(): void {
    const layer = this.renderRoot.querySelector(".je-caret-layer") as HTMLElement | null;
    const ta = this._inputEl();
    if (!layer || !ta) return;
    layer.style.display = this._isFocused && !this.readonly ? "" : "none";
    if (layer.style.display === "none") return;

    const all = this._allCarets();
    while (this._caretEls.length < all.length) {
      const el = document.createElement("div");
      el.className = "je-caret";
      layer.appendChild(el);
      this._caretEls.push(el);
    }
    while (this._caretEls.length > all.length) {
      const el = this._caretEls.pop()!;
      el.remove();
    }
    const lh = Math.max(1, Number(this.rowHeight) || 20);
    const cw = this._defaultCharW();
    const vis = this._visibleText;
    for (let i = 0; i < all.length; i++) {
      const el = this._caretEls[i];
      const pos = all[i].pos;
      const lineIdx = vis.slice(0, pos).split("\n").length - 1;
      const lineStart = lineIdx > 0 ? vis.lastIndexOf("\n", pos - 1) + 1 : 0;
      const col = pos - lineStart;
      el.style.left = 10 + col * cw + "px";
      el.style.top = lineIdx * lh + "px";
      el.style.height = lh + "px";
      el.style.opacity = this._caretVisible ? "1" : "0";
    }
  }

  private _startCaretBlink(): void {
    if (this._caretRaf !== null || typeof requestAnimationFrame !== "function") return;
    const loop = () => {
      if (!this.isConnected) return;
      const phase = performance.now() % 1000;
      const visible = phase < 500;
      if (visible !== this._caretVisible) {
        this._caretVisible = visible;
        for (const el of this._caretEls) el.style.opacity = visible ? "1" : "0";
      }
      this._caretRaf = requestAnimationFrame(loop);
    };
    this._caretRaf = requestAnimationFrame(loop);
  }

  private _stopCaretBlink(): void {
    if (this._caretRaf !== null) cancelAnimationFrame(this._caretRaf);
    this._caretRaf = null;
    this._caretVisible = true;
    for (const el of this._caretEls) el.style.opacity = "1";
  }

  // ── Multi-caret editing ─────────────────────────────────────────────────

  private _toggleCaret(pos: number): void {
    const ta = this._inputEl();
    const i = this._carets.findIndex((c) => c.anchor === pos && c.position === pos);
    if (i >= 0) {
      this._carets.splice(i, 1);
    } else {
      if (this._carets.length === 0 && ta) {
        // Entering multi mode: capture the primary caret's selection state.
        this._primaryAnchor = ta.selectionStart;
        this._primaryPosition = ta.selectionEnd;
      }
      this._carets.push({ anchor: pos, position: pos });
    }
    this._carets.sort((a, b) => a.position - b.position);
    this._renderCarets();
  }

  /** Ctrl+Alt+Up/Down — add a caret on the line above/below the primary. */
  private _addCaretAboveBelow(dir: -1 | 1): void {
    const ta = this._inputEl();
    const primary = ta?.selectionStart ?? 0;
    const vis = this._visibleText;
    const lineIdx = vis.slice(0, primary).split("\n").length - 1;
    const lineStart = lineIdx > 0 ? vis.lastIndexOf("\n", primary - 1) + 1 : 0;
    const col = primary - lineStart;
    const target = lineIdx + dir;
    const lines = vis.split("\n");
    if (target < 0 || target >= lines.length) return;
    const targetLine = lines[target];
    const targetStart = lines.slice(0, target).reduce((a, l) => a + l.length + 1, 0);
    const pos = targetStart + Math.min(col, targetLine.length);
    if (this._carets.length === 0) {
      this._primaryAnchor = primary;
      this._primaryPosition = ta?.selectionEnd ?? primary;
    }
    if (!this._carets.some((c) => c.position === pos)) {
      this._carets.push({ anchor: pos, position: pos });
      this._carets.sort((a, b) => a.position - b.position);
      this._renderCarets();
    }
  }

  /** Arrow keys in multi mode: delegate the movement/selection command to the
   *  shared CursorController, which applies it to EVERY caret (Shift extends
   *  each selection, Cmd jumps to line/document boundaries). The controller is
   *  seeded from the editor's folding-aware offset caret state and read back
   *  afterwards so the editor keeps ownership of its visible-buffer model. */
  private _moveAllCarets(key: string, extend: boolean, cmd = false): void {
    this._applyArrowCommand(
      [
        { anchor: this._primaryAnchor, position: this._primaryPosition },
        ...this._carets.map((c) => ({ anchor: c.anchor, position: c.position })),
      ],
      key,
      extend,
      cmd,
    );
  }

  /** Single-caret Cmd/Ctrl+Arrow: drive the line/document-boundary move through
   *  the engine too, so the custom caret + selection track the active end
   *  (native textarea Cmd+arrow is unreliable across platforms). */
  private _singleCmdArrow(ta: HTMLTextAreaElement, key: string, extend: boolean): void {
    const backward = ta.selectionDirection === "backward";
    const s = ta.selectionStart;
    const e = ta.selectionEnd;
    const anchor = backward ? e : s;
    const position = backward ? s : e;
    this._applyArrowCommand([{ anchor, position }], key, extend, true);
  }

  /** Seed a fresh CursorController from offset caret states, dispatch one arrow
   *  command, then write the results back to the primary + extras and refresh
   *  the selection/caret layers. */
  private _applyArrowCommand(
    seed: { anchor: number; position: number }[],
    key: string,
    extend: boolean,
    cmd: boolean,
  ): void {
    const ta = this._inputEl();
    if (!ta) return;
    const controller = new CursorController(
      new PieceTreeTextContentModel("json-editor", this._visibleText),
    );
    controller.setCursorStates(
      seed.map((c) => ({
        position: this._posAt(c.position),
        selectionAnchor: this._posAt(c.anchor),
      })),
    );
    this._applyCursorOp(controller, key, extend, cmd);
    const all = controller.getAllCursors();
    this._primaryAnchor = this._offsetAt(all[0].selectionAnchor);
    this._primaryPosition = this._offsetAt(all[0].position);
    this._carets = all.slice(1).map((c) => ({
      anchor: this._offsetAt(c.selectionAnchor),
      position: this._offsetAt(c.position),
    }));
    ta.setSelectionRange(
      Math.min(this._primaryAnchor, this._primaryPosition),
      Math.max(this._primaryAnchor, this._primaryPosition),
      this._primaryPosition < this._primaryAnchor ? "backward" : "forward",
    );
    this._updateBraceMatch(ta);
    this._updateSelectionHighlight();
    this._syncActiveLine();
    this._renderCarets();
  }

  /** Dispatch an arrow command onto the shared cursor controller. Cmd+arrow
   *  jumps to line/document boundaries; plain arrows step; Shift extends. */
  private _applyCursorOp(
    controller: CursorController,
    key: string,
    extend: boolean,
    cmd: boolean,
  ): void {
    if (cmd) {
      switch (key) {
        case "ArrowLeft":
          extend ? controller.selectToLineStart() : controller.moveToLineStart();
          break;
        case "ArrowRight":
          extend ? controller.selectToLineEnd() : controller.moveToLineEnd();
          break;
        case "ArrowUp":
          extend ? controller.selectToFileStart() : controller.moveToFileStart();
          break;
        case "ArrowDown":
          extend ? controller.selectToFileEnd() : controller.moveToFileEnd();
          break;
      }
    } else {
      switch (key) {
        case "ArrowLeft":
          extend ? controller.selectLeft() : controller.moveLeft();
          break;
        case "ArrowRight":
          extend ? controller.selectRight() : controller.moveRight();
          break;
        case "ArrowUp":
          extend ? controller.selectUp() : controller.moveUp();
          break;
        case "ArrowDown":
          extend ? controller.selectDown() : controller.moveDown();
          break;
      }
    }
  }

  /** Offset → 1-based line/column position within the visible buffer. */
  private _posAt(offset: number): TextPosition {
    const text = this._visibleText;
    const clamped = Math.max(0, Math.min(offset, text.length));
    const lineIdx = text.slice(0, clamped).split("\n").length - 1;
    const lineStart = lineIdx > 0 ? text.lastIndexOf("\n", clamped - 1) + 1 : 0;
    return { lineNumber: lineIdx + 1, column: clamped - lineStart + 1 };
  }

  /** 1-based line/column position → offset within the visible buffer. */
  private _offsetAt(position: TextPosition): number {
    const lines = this._visibleText.split("\n");
    let off = 0;
    const last = Math.max(0, position.lineNumber - 1);
    for (let i = 0; i < last && i < lines.length; i++) off += lines[i].length + 1;
    return off + Math.max(0, position.column - 1);
  }

  /** Apply a (visible-text) edit result across every caret, then rebuild. */
  private _applyMultiResult(out: string, newPos: number[]): void {
    this._applyVisible(out);
    const primary = newPos[0] ?? 0;
    this._carets = newPos.slice(1).map((p) => ({ anchor: p, position: p }));
    this._primaryAnchor = primary;
    this._primaryPosition = primary;
    const ta = this._inputEl();
    if (ta) {
      ta.value = this._visibleText;
      ta.setSelectionRange(primary, primary);
    }
    this._ensureCaretVisible();
    if (ta) this._updateBraceMatch(ta);
    this._syncActiveLine();
    this._updateSelectionHighlight();
    this._renderCarets();
  }

  /** Apply an edit at every caret via a per-caret mutator. Carets that share
   *  the same span (e.g. after Cmd+ArrowUp converged them to one position)
   *  are edited ONCE, but every caret still maps to its own result position
   *  so the caret count and both carets' presence persist. */
  private _multiEdit(
    mutate: (s: number, e: number, vis: string) => {
      ins: string;
      delStart: number;
      delEnd: number;
      result: number;
    },
  ): void {
    const carets = this._allCarets();
    const vis = this._visibleText;
    const seen = new Set<string>();
    const edits: { delStart: number; delEnd: number; ins: string; s: number }[] = [];
    const resultByKey = new Map<string, number>();
    for (const c of carets) {
      const key = `${c.s}:${c.e}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const r = mutate(c.s, c.e, vis);
      edits.push({ delStart: r.delStart, delEnd: r.delEnd, ins: r.ins, s: c.s });
      resultByKey.set(key, r.result);
    }
    edits.sort((a, b) => b.s - a.s);
    let out = vis;
    for (const ed of edits) {
      out = out.slice(0, ed.delStart) + ed.ins + out.slice(ed.delEnd);
    }
    const newPos = carets.map((c) => resultByKey.get(`${c.s}:${c.e}`)!);
    this._applyMultiResult(out, newPos);
  }

  /** Insert `data` at every caret (with JSON auto-pair for braces/quotes). */
  private _multiInsert(data: string): void {
    this._multiEdit((s, e, vis) => {
      let ins = data;
      let off = data.length;
      if (data === "{" || data === "[") {
        ins = data + (data === "{" ? "}" : "]");
        off = 1;
      } else if (data === '"') {
        if (this._insideString(vis, e)) ins = '"';
        else ins = '""';
        off = 1;
      } else if (data === "}" || data === "]") {
        if (e === s && vis[e] === data) {
          ins = "";
          off = 1;
        } else {
          ins = data;
          off = 1;
        }
      }
      return { ins, delStart: s, delEnd: e, result: s + off };
    });
  }

  /** Backspace at every caret (deleting a selection, or an adjacent pair). */
  private _multiBackspace(): void {
    this._multiEdit((s, e, vis) => {
      if (e > s) return { ins: "", delStart: s, delEnd: e, result: s };
      if (s <= 0) return { ins: "", delStart: s, delEnd: s, result: 0 };
      const open = vis[s - 1];
      const close = vis[s];
      const pair =
        (open === "{" && close === "}") ||
        (open === "[" && close === "]") ||
        (open === '"' && close === '"');
      if (pair) return { ins: "", delStart: s - 1, delEnd: s + 1, result: s - 1 };
      return { ins: "", delStart: s - 1, delEnd: s, result: s - 1 };
    });
  }

  /** Delete-forward at every caret. */
  private _multiDelete(): void {
    this._multiEdit((s, e, vis) => {
      if (e > s) return { ins: "", delStart: s, delEnd: e, result: s };
      if (s >= vis.length) return { ins: "", delStart: s, delEnd: s, result: s };
      return { ins: "", delStart: s, delEnd: s + 1, result: s };
    });
  }

  /** Enter at every caret (newline + auto-indent). */
  private _multiNewline(): void {
    this._multiEdit((s, _e, vis) => {
      // Expand empty `[]`/`{}` pairs just like the single-caret Enter: the
      // closing bracket moves to its own aligned line, caret to the new
      // indented middle line.
      if (s > 0 && s < vis.length) {
        const open = vis[s - 1];
        const close = vis[s];
        if ((open === "[" && close === "]") || (open === "{" && close === "}")) {
          const ci = this._indentAt(vis, s);
          const cli = this._indentAt(vis, s - 1);
          const ins = `\n${ci}\n${cli}`;
          return { ins, delStart: s, delEnd: s, result: s + 1 + ci.length };
        }
      }
      const ins = "\n" + this._indentAt(vis, s);
      return { ins, delStart: s, delEnd: s, result: s + ins.length };
    });
  }

  private _insideString(text: string, pos: number): boolean {
    let inStr = false;
    let escaped = false;
    for (let i = 0; i < pos; i++) {
      const c = text[i];
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === '"') inStr = !inStr;
    }
    return inStr;
  }

  private _replaceRange(
    ta: HTMLTextAreaElement,
    start: number,
    end: number,
    text: string,
  ): void {
    ta.setRangeText(text, start, end, "end");
  }

  /** Keep the caret line in view within the scroll container. */
  private _ensureCaretVisible = (): void => {
    const ta = this.renderRoot.querySelector("textarea.je-input") as
      | HTMLTextAreaElement
      | undefined;
    const vp = this.renderRoot.querySelector(".je-viewport") as HTMLElement | undefined;
    if (!ta || !vp) return;
    const lh = Math.max(1, Number(this.rowHeight) || 20);
    const line = ta.value.slice(0, ta.selectionStart).split("\n").length - 1;
    const top = line * lh;
    if (top < vp.scrollTop) vp.scrollTop = top;
    else if (top + lh > vp.scrollTop + vp.clientHeight) vp.scrollTop = top + lh - vp.clientHeight;
  };
}

declare global {
  interface HTMLElementTagNameMap {
    "json-editor": JsonEditorElement;
  }
}
