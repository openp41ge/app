/* eslint-disable @typescript-eslint/no-unused-vars, @typescript-eslint/no-explicit-any, no-console */
/**
 * FileEditorElement — the <file-editor> web component.
 *
 * LitElement facade with custom rendering pipeline.
 * See AGENTS.md for architecture details.
 */

import { LitElement, html, type PropertyValues } from "lit";
import { customElement, property, state } from "lit/decorators.js";

import {
  EVENT_TITLE_CHANGED,
  EVENT_DIRTY_CHANGED,
  EVENT_FILE_SAVED,
  EVENT_REQUEST_CLOSE,
} from "./events";
import type {
  TitleChangedDetail,
  DirtyChangedDetail,
  FileSavedDetail,
  RequestCloseDetail,
} from "./events";

import type { PieceTreeTextContentModel } from "./model/piece-tree-text-content-model";
import type { TextContentChangeEvent, TextPosition, TextSelection } from "./model";
import { ViewModel } from "./model/view-model";
import type { ViewModelEvent } from "./model/view-model";
import { ViewLines } from "./view/view-lines";
import { computeWrapSegments } from "./view/word-wrap-helper";
import { ViewportWrapColumnCalculator } from "./view/wrap-column-calculator";
import type { IWrapColumnCalculator } from "./view/wrap-column-calculator";
import { ScrollManager } from "./view/scroll-manager";
import { CursorController } from "./cursor/cursor-controller";
import { TextAreaInput } from "./input/text-area-input";
import { KeyboardHandler } from "./input/keyboard-handler";
import { CursorRenderer } from "./rendering/cursor-renderer";
import { SelectionRenderer } from "./rendering/selection-renderer";
import { LineNumbersOverlay } from "./rendering/line-numbers-overlay";
import { CurrentLineHighlight } from "./rendering/current-line-highlight";
import { IndentationGuides } from "./rendering/indentation-guides";
import { findMatchingBracket } from "./rendering/bracket-matching";
import { BracketPairService } from "./rendering/bracket-pair-service";
import type { BracketLineInput } from "./rendering/bracket-pair-service";
import { initTextMate } from "./tokenization/textmate-init";
import { TokenRegistry } from "./tokenization/token-registry";

// ── Global TokenRegistry singleton ──
// Declared at module top level to avoid temporal dead zone (TDZ) issues
// when the class references it during connectedCallback / firstUpdated.
let _tokenRegistryInstance: TokenRegistry | null = null;
import { getThemeById, generateThemeCSS, generateGlobalEditorCSS } from "./themes";
import type { SyntaxTheme } from "./themes";
import type { IToken } from "./tokenization/line-tokens";
import { ClipboardHandler } from "./input/clipboard-handler";
import { CompositionHandler } from "./input/composition-handler";
import { MouseHandler } from "./input/mouse-handler";
import { checkAutoClose, shouldSkipClose } from "./input/auto-closing-pairs";
import "./ui/openp41ge-bottom-bar";
import type { FeStatusBar } from "./ui/openp41ge-bottom-bar";
import type { IFormatterRegistry } from "./interfaces/formatter-registry";

export type FileEditorState = "loading" | "ready" | "error" | "empty";

@customElement("file-editor")
export class FileEditorElement extends LitElement {
  // ── Lit-reactive properties ──

  @property({ type: String, attribute: "data-file-path" })
  filePath: string = "";

  @property({ type: String, attribute: "data-file-name" })
  fileName: string = "";

  @state()
  private _isDirty: boolean = false;

  @state()
  private _state: FileEditorState = "empty";

  /** Content at last save or load — used to detect undo-to-clean. */
  private _savedContent: string = "";
  private _statusBar: FeStatusBar | null = null;
  private _viewportResizeObserver: ResizeObserver | null = null;

  // ── Injected dependencies ──

  textContentModel: PieceTreeTextContentModel | null = null;
  tokenRegistry: TokenRegistry | null = null;

  /** Formatter registry for format-on-demand. */
  formatterRegistry: IFormatterRegistry | null = null;

  /** Bracket pair colorization service — injectable for testing. */
  _bracketPairService: BracketPairService = new BracketPairService();

  /** Cached bracket depth map for the current visible range. */
  private _bracketDepths: Map<string, number> | null = null;
  private _bracketRangeStart: number = 0;
  private _bracketRangeEnd: number = 0;

  /**
   * Exposed for tests to query cursor position and selection state.
   */
  get cursorController(): CursorController | null {
    return this._cursorController;
  }

  // ── Custom pipeline (not managed by Lit) ──

  private _viewModel: ViewModel | null = null;
  private _viewLines: ViewLines | null = null;
  private _scrollManager: ScrollManager | null = null;
  private _cursorController: CursorController | null = null;
  private _textAreaInput: TextAreaInput | null = null;
  private _keyboardHandler: KeyboardHandler | null = null;
  private _cursorRenderer: CursorRenderer | null = null;
  private _selectionRenderer: SelectionRenderer | null = null;
  private _lineNumbersOverlay: LineNumbersOverlay | null = null;
  private _currentLineHighlight: CurrentLineHighlight | null = null;
  private _indentationGuides: IndentationGuides | null = null;
  private _clipboardHandler: ClipboardHandler | null = null;
  private _compositionHandler: CompositionHandler | null = null;
  private _mouseHandler: MouseHandler | null = null;

  /**
   * When true, _scrollToRevealCursor is a no-op.
   * Set before Cmd+A to prevent viewport from scrolling to the last line
   * during select-all. Cleared after each scroll check.
   */
  private _suppressScroll: boolean = false;

  private _viewportEl!: HTMLElement;
  private _gutterEl!: HTMLElement;

  private _textMateInitPromise: Promise<void> | null = null;
  private _initDone: boolean = false;
  private _charWidth: number = 0;
  private _lineHeight: number = 20;
  private _fontSize: number = 14;
  private _wordWrapEnabled: boolean = false;
  private _wrapCalculator: IWrapColumnCalculator = new ViewportWrapColumnCalculator();
  private _mouseDownLine: number = 0;
  private _mouseDownCol: number = 0;
  private _isMouseDown: boolean = false;
  private _onDocumentMouseMove: ((e: MouseEvent) => void) | null = null;
  private _onDocumentMouseUp: (() => void) | null = null;

  /** Current syntax theme ID. */
  @property({ type: String, attribute: "data-theme-id" })
  themeId: string = "openp41ge-dark";

  /** Current syntax theme object. */
  private _theme: SyntaxTheme = getThemeById("openp41ge-dark");

  /** Style element for theme CSS. */
  private _themeStyleEl: HTMLStyleElement | null = null;

  /** Set the theme and re-apply styles. */
  setTheme(themeId: string): void {
    this.themeId = themeId;
    this._theme = getThemeById(themeId);
    this._applyThemeStyles();
  }

  /** Update line height and rebuild the rendering pipeline. */
  setEditorLineHeight(lineHeight: number): void {
    if (lineHeight === this._lineHeight) return;
    this._lineHeight = Math.max(14, Math.min(40, lineHeight));
    // Rebuild pipeline if model is already loaded
    if (this.textContentModel) {
      this._teardownPipeline();
      this._initWithModel(this.textContentModel);
    }
  }

  /** Update font size and rebuild the rendering pipeline. */
  setEditorFontSize(fontSize: number): void {
    if (fontSize === this._fontSize) return;
    this._fontSize = Math.max(10, Math.min(30, fontSize));
    if (this._viewportEl) {
      this._viewportEl.style.fontSize = this._fontSize + "px";
    }
    const charWidth = this._measureCharWidth();
    if (charWidth > 0) this._charWidth = charWidth;
    // Rebuild pipeline if model is already loaded
    if (this.textContentModel) {
      this._teardownPipeline();
      this._initWithModel(this.textContentModel);
    }
  }

  // ── Lit template (shell only — no viewport) ──

  render() {
    return html`
      <div
        class="fe-root"
        style="display:flex;flex-direction:column;width:100%;height:100%;background:var(--fe-bg, #161616);overflow:hidden;"
      >
        <div
          class="fe-content"
          style="flex:1;min-height:0;display:flex;flex-direction:row;overflow:hidden;"
        >
          <div
            class="fe-gutter"
            style="flex-shrink:0;width:48px;user-select:none;background:var(--fe-gutter-bg, #1a1a1a);overflow:hidden;font-family:'Cascadia Code','Fira Code','JetBrains Mono','Consolas',monospace;"
          ></div>
          <div
            class="fe-viewport-container"
            style="flex:1;display:flex;flex-direction:column;min-width:0;"
          ></div>
        </div>
        <fe-status-bar></fe-status-bar>
      </div>
    `;
  }

  createRenderRoot(): HTMLElement | DocumentFragment {
    return this; // Light DOM
  }

  /** Inject theme-dependent styles. */
  private _applyThemeStyles(): void {
    // Remove old theme style element
    if (this._themeStyleEl && this._themeStyleEl.parentNode) {
      this._themeStyleEl.parentNode.removeChild(this._themeStyleEl);
    }

    const style = document.createElement("style");
    style.setAttribute("data-fe-theme", this.themeId);
    const scopeCSS = generateThemeCSS(this._theme);
    const globalCSS = generateGlobalEditorCSS();
    const c = this._theme.colors;
    const isLight = this._theme.type === "light";
    style.textContent = `
      :root {
        --fe-cursor-color: ${c.cursor};
        --fe-selection-bg: ${c.selectionBg};
        --fe-current-line: ${c.currentLine};
        --fe-bg: ${c.editorBg};
        --fe-gutter-bg: ${c.gutterBg};
        --fe-border-color: ${isLight ? "#d4d4d4" : "#2a2a2a"};
        --fe-secondary-color: ${isLight ? "#666" : "#888"};
      }
      /* Standard token types */
      .view-line .token-other { color: ${c.default}; }
      .view-line .token-comment { color: ${c.cmt}; }
      .view-line .token-string { color: ${c.str}; }
      .view-line .token-regex { color: ${c.rgx}; }
      .view-line .token-number { color: ${c.num}; }
      .view-line .token-keyword { color: ${c.kw}; }
      .view-line .token-type { color: ${c.type}; }
      /* Editor background applied to root and gutter via --fe-bg / --fe-gutter-bg */
      .fe-root { background: var(--fe-bg) !important; }
      .fe-gutter { background: var(--fe-gutter-bg) !important; }
      /* Scrollbar styling — match the editor background */
      .fe-viewport::-webkit-scrollbar-track {
        background: var(--fe-bg);
      }
      .fe-viewport::-webkit-scrollbar-corner {
        background: var(--fe-bg);
      }
      .fe-viewport::-webkit-scrollbar-thumb {
        background: ${isLight ? "#c1c1c1" : "#424242"};
      }
      .fe-viewport::-webkit-scrollbar-thumb:hover {
        background: ${isLight ? "#a8a8a8" : "#555"};
      }
      .fe-viewport::-webkit-scrollbar {
        width: 10px;
        height: 10px;
      }
      /* Status bar theme support */
      fe-status-bar {
        --sbb-bg: var(--fe-gutter-bg);
        --sbb-color: ${c.default};
      }
      ${scopeCSS}
      ${globalCSS}
    `;
    document.head.appendChild(style);
    this._themeStyleEl = style;
  }

  firstUpdated(): void {
    if (this._initDone) return;
    this._applyThemeStyles();
    this._initDone = true;

    const content = this.renderRoot.querySelector(".fe-content") as HTMLElement;
    if (!content) return;

    const viewportContainer = content.querySelector(".fe-viewport-container") as HTMLElement;
    if (!viewportContainer) return;

    // Find and store the status bar reference
    this._statusBar = this.renderRoot.querySelector("fe-status-bar") as FeStatusBar | null;

    // Create viewport programmatically (not in Lit's template)
    this._viewportEl = document.createElement("div");
    this._viewportEl.className = "fe-viewport";
    this._viewportEl.style.cssText =
      "flex:1;overflow-y:auto;overflow-x:hidden;position:relative;outline:none;cursor:text;";
    this._viewportEl.style.fontFamily =
      "'Cascadia Code', 'Fira Code', 'JetBrains Mono', 'Consolas', monospace";
    this._viewportEl.style.fontSize = this._fontSize + "px";
    this._viewportEl.style.lineHeight = this._lineHeight + "px";
    // Insert viewport into the viewport-container
    viewportContainer.appendChild(this._viewportEl);

    this._gutterEl = content.querySelector(".fe-gutter") as HTMLElement;

    // Prevent mousedown from bubbling to grid drag handler
    const root = this.renderRoot.querySelector(".fe-root") as HTMLElement;
    root.addEventListener("mousedown", (e: MouseEvent) => e.stopPropagation());

    // Handle viewport click to position cursor and focus textarea
    this._viewportEl.addEventListener("mousedown", this._onViewportMouseDown);

    // Gutter line number offset — CSS transform syncs line numbers with viewport scroll.
    // Uses GPU-accelerated CSS transform instead of scrollTop to avoid scroll-boundary
    // clamping issues that cause a 1-line misalignment at the bottom of the file.
    this._viewportEl.addEventListener("scroll", () => {
      this._lineNumbersOverlay?.setScrollOffset(this._viewportEl.scrollTop);
    });

    // Load file if path is already set (TextMate init started in connectedCallback)
    if (this.filePath && this.textContentModel) {
      this._initWithModel(this.textContentModel);
    }
  }

  connectedCallback(): void {
    super.connectedCallback();
    // Start TextMate init as early as possible so language detection
    // is ready when loadFile() is called from the controller.
    if (!this._textMateInitPromise) {
      this._textMateInitPromise = this._initTextMateOnce();
    }
    // On reconnect (pane move), re-init viewport if needed
    if (this._initDone && (!this._viewportEl || !this._viewportEl.isConnected)) {
      this._initDone = false;
      this.firstUpdated();
    }
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this._teardownPipeline();
  }

  // ── Public API ──

  async loadFile(path: string, fileName?: string): Promise<void> {
    this.filePath = path;
    if (fileName !== undefined) this.fileName = fileName;

    this._state = "loading";

    await this._textMateInitPromise;

    // Model must be set externally by the platform via textContentModel.
    // The platform's ModelRegistry creates and shares models across tabs.
    if (!this.textContentModel) {
      throw new Error(
        "FileEditorElement.loadFile() requires textContentModel to be set. " +
          "The platform should set textContentModel before calling loadFile().",
      );
    }

    // If the path changed, the caller should have set a new textContentModel.
    if (this.textContentModel.uri !== path) {
      throw new Error(
        "FileEditorElement.loadFile(): textContentModel.uri does not match path. " +
          `Expected "${path}", got "${this.textContentModel.uri}".`,
      );
    }

    this._initWithModel(this.textContentModel);
    this._state = "ready";

    this._dispatchTitleChanged();
  }

  async save(): Promise<boolean> {
    if (!this.textContentModel || !this.filePath) return false;

    const content = this.textContentModel.getValue();

    // Persist to disk via IPC if available
    if (window.openp41ge?.file?.writeFile) {
      try {
        await window.openp41ge.file.writeFile(this.filePath, content);
      } catch (err) {
        console.error("[file-editor] Failed to save file:", err);
        return false;
      }
    }

    this._isDirty = false;
    this.textContentModel.markClean();
    // Record the current content so undo-to-clean is correctly detected
    this._savedContent = content;
    this._dispatchDirtyChanged(false);
    this._dispatchFileSaved();
    if (this._statusBar) {
      this._statusBar.setDirty(false);
    }
    return true;
  }

  formatDocument(): void {
    if (!this.formatterRegistry || !this.textContentModel) return;
    const ext = this.filePath.split(".").pop()?.toLowerCase() || "";
    const formatter = this.formatterRegistry.get(ext);
    if (!formatter) return;
    const content = this.textContentModel.getValue();
    const formatted = formatter.format(content);
    if (formatted === content) return;
    this.textContentModel.pushEditOperations([
      {
        range: {
          startLineNumber: 1,
          startColumn: 1,
          endLineNumber: this.textContentModel.lineCount,
          endColumn:
            this.textContentModel.getLineContent(this.textContentModel.lineCount).length + 1,
        },
        text: formatted,
      },
    ]);
  }

  getState(): { state: FileEditorState; isDirty: boolean } {
    return {
      state: this._state,
      isDirty: this._isDirty,
    };
  }

  // ── Private ──

  private async _initTextMateOnce(): Promise<void> {
    if (_tokenRegistryInstance) return;
    try {
      const { registry } = await initTextMate(this._theme.rawTheme);
      _tokenRegistryInstance = new TokenRegistry(registry);
    } catch (err) {
      console.warn("[file-editor] TextMate init failed, tokenization disabled:", err);
      // Don't set a broken TokenRegistry — _initWithModel checks for null
      _tokenRegistryInstance = null as any;
    }
  }

  private _initWithModel(model: PieceTreeTextContentModel): void {
    // Guard against double init
    if (this._viewModel && this._viewModel.model === model) return;
    this._teardownPipeline();

    // Create ViewModel
    this._viewModel = new ViewModel(model, {
      lineHeight: this._lineHeight,
      tabSize: 4,
    });

    // Detect language from file extension.
    // Strategy:
    //   1. For files with a visible extension ("file.ts"): use the extension ("ts").
    //   2. For extensionless files ("Dockerfile"): use the full lowercase basename.
    //   3. For hidden files (".eslintrc.json"): skip leading dot, use extension.
    //   4. For compound names ("Dockerfile.prod"): try extension first, then prefix.
    const tokenRegistry = this.tokenRegistry ?? _tokenRegistryInstance;
    const fileName = this.filePath.split("/").filter(Boolean).pop() || "";
    const parts = fileName.split(".");
    // Normal case: "file.ts" → parts = ["file", "ts"], last part is "ts"
    // Hidden file: ".eslintrc.json" → parts = ["", "eslintrc", "json"], last part is "json"
    const hasExt = parts.length > 1;
    const rawExt = hasExt ? parts[parts.length - 1].toLowerCase() : fileName.toLowerCase();
    if (tokenRegistry) {
      const tryExt = (ext: string) => tokenRegistry.getLanguageId(ext);
      const langId =
        tryExt(rawExt) ||
        // For compound names like "Dockerfile.prod", try the prefix
        (hasExt ? tryExt(parts.slice(0, -1).join(".").toLowerCase()) : undefined) ||
        // Fallback: full basename (for "Dockerfile" with no extension)
        tryExt(fileName.toLowerCase());
      if (langId) {
        tokenRegistry.getTokenizer(langId).then((tokenizer) => {
          this._viewModel?.setTokenizer(tokenizer);
          // Re-tokenize and force-rebuild lines now that the grammar is loaded.
          // Use refresh() instead of _renderVisibleLines() to bypass the
          // no-change guard in onScroll — the visible range is unchanged but
          // lines need new DOM with token spans.
          if (this._viewModel && this._viewLines) {
            const count = this._viewModel.lineCount;
            this._viewModel.tokenizeVisibleRange(1, Math.min(100, count));
            this._viewLines.clearContentCache();
            // Recompute bracket depths with fresh tokens before re-rendering
            this._bracketDepths = null;
            this._bracketRangeStart = 0;
            this._bracketRangeEnd = 0;
            this._computeBracketDepths(
              this._viewLines.startLineNumber || 1,
              this._viewLines.endLineNumber || Math.min(50, count),
            );
            this._viewLines.refresh();
          }
        });
      }
    }

    // Create ViewLines (rendering layer)
    this._viewLines = new ViewLines(this._viewportEl, {
      lineHeight: this._lineHeight,
      tabSize: 4,
    });
    this._viewLines.setTotalLineCount(model.lineCount);
    this._viewLines.lineContentProvider = {
      getLineContent: (ln) => this._viewModel?.getLineContent(ln) ?? "",
      getLineTokens: (ln) => this._viewModel?.getLineTokens(ln) ?? null,
      tabSize: 4,
    };

    // Create CursorController
    this._cursorController = new CursorController(model);
    this._cursorController.setCoordinatesConverter(this._viewModel.coordinatesConverter);

    // Create KeyboardHandler
    this._keyboardHandler = new KeyboardHandler(this._cursorController);

    // Create ClipboardHandler (uses a dedicated hidden textarea for clipboard)
    const clipboardTextArea = document.createElement("textarea");
    this._clipboardHandler = new ClipboardHandler({
      model,
      cursorController: this._cursorController,
      textArea: clipboardTextArea,
    });

    // Create CompositionHandler
    this._compositionHandler = new CompositionHandler(this._cursorController);

    // Create TextAreaInput
    this._textAreaInput = new TextAreaInput({
      parentElement: this._viewportEl,
      cursorController: this._cursorController,
      onType: (char) => {
        const pos = this._cursorController!.position;

        // Auto-closing pairs: skip matching closer
        if (char.length === 1 && shouldSkipClose(char, model, pos)) {
          this._cursorController!.moveRight();
          return;
        }

        // Auto-closing pairs: auto-insert closer
        if (char.length === 1) {
          const autoClose = checkAutoClose(char, model, pos);
          if (autoClose) {
            this._cursorController!.insertChar(autoClose.text);
            for (let i = 0; i < autoClose.text.length - autoClose.cursorOffset; i++) {
              this._cursorController!.moveLeft();
            }
            return;
          }
        }

        this._cursorController!.insertChar(char);
      },
      onNewLine: () => {
        this._cursorController!.insertNewLine();
      },
      onDeleteLeft: () => {
        this._cursorController!.deleteLeft();
      },
      onDeleteRight: () => {
        this._cursorController!.deleteRight();
      },
      onComposition: (text) => {
        this._compositionHandler?.onCompositionUpdate(text);
      },
      onCopy: () => {
        return this._clipboardHandler?.onCopy() || "";
      },
      onFocus: () => {
        this._cursorRenderer?.show();
      },
      onBlur: () => {
        this._cursorRenderer?.hide();
      },
      onPaste: (text) => {
        this._clipboardHandler?.onPaste(text);
      },
      onCut: () => {
        return this._clipboardHandler?.onCut() || "";
      },
      onKey: (e) => {
        // Suppress scroll-to-reveal for Cmd+A (select all)
        if ((e.metaKey || e.ctrlKey) && (e.key === "a" || e.key === "A")) {
          this._suppressScroll = true;
        }
        return this._keyboardHandler!.handleKeyDown(e);
      },
    });

    // Measure char width once before creating the MouseHandler
    this._measureCharWidth();

    // Create MouseHandler (double-click word selection)
    this._mouseHandler = new MouseHandler({
      viewportEl: this._viewportEl,
      cursorController: this._cursorController,
      lineHeight: this._lineHeight,
      charWidth: this._charWidth || 8,
      wordWrapEnabled: this._wordWrapEnabled,
      getCharacterMapping: (viewLineNumber: number) => {
        return this._viewLines?.getViewLine(viewLineNumber)?.characterMapping ?? null;
      },
      convertViewToModelPosition:
        this._viewModel?.coordinatesConverter && this._wordWrapEnabled
          ? (vl: number, vc: number) =>
              this._viewModel!.coordinatesConverter!.convertViewToModelPosition(vl, vc)
          : null,
    });

    // Create CursorRenderer
    this._cursorRenderer = new CursorRenderer(this._viewportEl, this._cursorController);

    // Create SelectionRenderer
    this._selectionRenderer = new SelectionRenderer(this._viewportEl, this._cursorController);

    // Create CurrentLineHighlight
    this._currentLineHighlight = new CurrentLineHighlight(this._viewportEl);

    // Create IndentationGuides
    this._indentationGuides = new IndentationGuides({
      tabSize: 4,
      charWidth: this._charWidth || 8,
      enabled: true,
    });

    // Create LineNumbersOverlay
    this._lineNumbersOverlay = new LineNumbersOverlay(this._gutterEl, {
      gutterWidth: 48,
      lineHeight: this._lineHeight,
      onLineClick: (lineNumber: number) => {
        this._cursorController?.selectLine(lineNumber);
      },
      wordWrapEnabled: this._wordWrapEnabled,
      getViewLineStart: (modelLine: number) =>
        this._viewLines?.getViewLineStart(modelLine) ?? modelLine,
      getViewLineCount: (modelLine: number) => {
        if (!this._viewModel) return 1;
        const content = this._viewModel.getLineContent(modelLine);
        const cw = this._charWidth > 0 ? this._charWidth : 8;
        const vw = this._viewportEl?.clientWidth ?? 600;
        const wrapCol = Math.max(10, Math.floor((vw - 16) / (cw || 8)));
        return computeWrapSegments(content, wrapCol).length;
      },
    });

    // Create ScrollManager
    this._scrollManager = new ScrollManager(this._viewportEl, this._viewLines);

    // Observe viewport resize (including from CSS zoom on parent) so the
    // visible line range recalculates when the viewport shrinks or grows.
    // Guard: ResizeObserver may not exist in test environments (jsdom).
    if (typeof ResizeObserver !== "undefined") {
      this._viewportResizeObserver = new ResizeObserver(() => {
        this._scrollManager?.updateDimensions();
        if (this._wordWrapEnabled && this._viewportEl) {
          const newWrapCol = this._computeWrapColumn();
          // Detect wrap column change: store last used column on this._viewLines
          // which tracks _wrapColumn. If different, re-wrap.
          const currentViewWrap = this._viewLines ? (this._viewLines as any)._wrapColumn : -1;
          if (currentViewWrap >= 0 && newWrapCol !== currentViewWrap) {
            this._applyWordWrap();
          }
        }
        this._renderVisibleLines();
      });
      this._viewportResizeObserver.observe(this._viewportEl);
    }

    // When the visible range changes (scroll, cursor jump), re-render selection
    // highlights for the new visible lines. This ensures that cross-range selection
    // (e.g., Cmd+Shift+Down from line 5 to line 500) updates highlights correctly
    // when the user scrolls to view different parts of the selection.
    // Sync line number positions with viewport scroll via CSS transform.
    this._viewportEl.addEventListener("scroll", () => {
      this._lineNumbersOverlay?.setScrollOffset(this._viewportEl.scrollTop);
    });

    this._viewLines.onVisibleRangeChanged = (startLine: number, endLine: number) => {
      // Sync line numbers with viewport scroll position
      this._lineNumbersOverlay?.setScrollOffset(this._viewportEl.scrollTop);
      // Create/reposition line number elements for the new visible range
      this._lineNumbersOverlay?.setVisibleRange(startLine, endLine);
      // Re-render selection highlights for the new visible lines (all cursors)
      this._renderSelectionHighlights(
        this._cursorController?.getAllCursors().map((c) => ({
          selectionStartLineNumber: c.selectionAnchor.lineNumber,
          selectionStartColumn: c.selectionAnchor.column,
          positionLineNumber: c.position.lineNumber,
          positionColumn: c.position.column,
        })),
      );
    };

    // Wire up formatter to status bar
    this._wireFormatter();

    // Wire up ViewModel events → ViewLines
    this._viewModel.onDidChange.event((event: ViewModelEvent) => {
      this._onViewModelChange(event);
    });

    // Wire up cursor events → view updates
    this._cursorController.onDidChange = (event) => {
      this._onCursorChange(event);
    };

    // Wire up ViewLines render callback
    this._viewLines.onLineRender = (lineNumber, viewLine) => {
      this._renderLineContent(lineNumber, viewLine);
    };

    // Initial render: tokenize and render visible range
    this._viewModel.tokenizeVisibleRange(1, Math.min(100, model.lineCount));

    // Record the saved content for undo-to-clean detection
    this._savedContent = model.getValue();

    // Set initial status bar state
    this._updateStatusBarSize();
    if (this._statusBar) {
      this._statusBar.setDirty(false);
      const lang = this.filePath.split(".").pop() || "";
      const ext = lang;
      const stored = localStorage.getItem("openp41ge:wordWrap:" + ext);
      const wordWrapOn = stored === "true";
      this._wordWrapEnabled = wordWrapOn;
      this._statusBar.setWordWrap(wordWrapOn, (on: boolean) => this._toggleWordWrap(on));
      this._applyWordWrap();
    }

    // Render initial visible lines
    this._renderVisibleLines();
    const initialLineCount = Math.min(model.lineCount, 100);
    this._lineNumbersOverlay.setVisibleRange(1, initialLineCount);

    // Listen for model content changes (edits, undo, redo)
    model.onDidChangeContent((event: TextContentChangeEvent) => {
      if (event.versionId > 0) {
        this._onModelContentChange(event);
      }
    });

    // Listen for external dirty state changes (e.g., save in another tab).
    // The model fires isDirty=true when an edit makes it dirty, and
    // isDirty=false when markClean() is called from any tab.
    // When the model is marked clean remotely, all tabs viewing this model
    // must update their local dirty state and saved content baseline so the
    // confirmation modal doesn't appear when closing the tab.
    model.onDidChangeDirty((isDirty: boolean) => {
      if (isDirty) {
        // Model became dirty — handled by _onModelContentChange above
        return;
      }
      // Model was marked clean by a save in this or another tab.
      // Update saved content to the current value so future edits correctly
      // detect clean state against the persisted baseline.
      this._isDirty = false;
      this._savedContent = model.getValue();
      this._dispatchDirtyChanged(false);
      if (this._statusBar) {
        this._statusBar.setDirty(false);
      }
    });

    // Compute content width from ALL lines and set it once
    this._updateContentWidth();

    // Focus the textarea for editing
    this._textAreaInput.focus();
  }

  private _computeBracketDepths(startLine: number, endLine: number): void {
    if (!this._viewModel) {
      this._bracketDepths = null;
      return;
    }

    // Avoid recomputing if the range hasn't changed
    if (
      this._bracketDepths !== null &&
      this._bracketRangeStart === startLine &&
      this._bracketRangeEnd === endLine
    ) {
      return;
    }

    // Build input lines for the bracket pair service
    const lines: BracketLineInput[] = [];
    for (let ln = startLine; ln <= endLine; ln++) {
      lines.push({
        lineNumber: ln,
        text: this._viewModel.getLineContent(ln),
        tokens: this._viewModel.getLineTokens(ln),
      });
    }

    this._bracketDepths = this._bracketPairService.compute(lines);
    this._bracketRangeStart = startLine;
    this._bracketRangeEnd = endLine;
  }

  private _renderLineContent(lineNumber: number, viewLine: any): void {
    if (!this._viewModel) return;

    const content = this._viewModel.getLineContent(lineNumber);
    const tokens = this._viewModel.getLineTokens(lineNumber);
    viewLine.setContent(content, tokens, this._viewModel.tabSize, this._bracketDepths);
  }

  private _renderVisibleLines(): void {
    if (!this._viewLines || !this._viewModel) return;

    const viewportEl = this._viewportEl;
    const scrollTop = viewportEl.scrollTop;
    const viewportHeight = viewportEl.clientHeight;

    // Compute bracket depths BEFORE rendering lines so the depth map
    // is available when _renderLineContent is called for each line.
    // Use the same range formula as ViewLines.onScroll() so all lines
    // that will be rendered are covered by the depth map.
    const lineHeight = this._lineHeight;
    const overRenderAbove = 1;
    const overRenderBelow = 2;
    const estimatedStart = Math.max(1, Math.floor(scrollTop / lineHeight) - overRenderAbove + 1);
    const estimatedEnd = Math.min(
      this._viewModel.lineCount,
      Math.ceil((scrollTop + viewportHeight) / lineHeight) + overRenderBelow,
    );
    this._computeBracketDepths(estimatedStart, estimatedEnd);

    this._viewLines.onScroll(scrollTop, viewportHeight);
  }

  /**
   * Compute the visible-column count for a line (tab-expanded).
   */
  private _computeVisibleColumns(lineContent: string, tabSize: number): number {
    let cols = 0;
    for (let i = 0; i < lineContent.length; i++) {
      if (lineContent.charCodeAt(i) === 9 /* Tab */) {
        cols += tabSize - (cols % tabSize);
      } else {
        cols++;
      }
    }
    return cols;
  }

  /**
   * Measure the actual pixel width of one monospace character from the DOM.
   * Creates a temporary test span, measures it, and removes it.
   */
  private _measureCharWidth(): number {
    const testEl = document.createElement("span");
    testEl.style.cssText =
      "position:absolute;visibility:hidden;white-space:pre;font-size:inherit;font-family:inherit;";
    testEl.textContent = "x".repeat(100);
    this._viewportEl.appendChild(testEl);
    const w = testEl.scrollWidth / 100;
    this._viewportEl.removeChild(testEl);
    return w;
  }

  /**
   * Compute the maximum content width across ALL lines and update the viewport.
   * This ensures the horizontal scrollbar correctly reflects the entire file
   * content, not just the currently visible lines.
   */
  private _updateContentWidth(): void {
    if (!this._viewModel || !this._viewLines) return;

    const tabSize = this._viewModel.tabSize;
    const lineCount = this._viewModel.lineCount;
    const charWidth = this._measureCharWidth();

    if (lineCount === 0) {
      this._viewLines.setContentWidth(this._viewportEl.getBoundingClientRect().width);
      return;
    }

    // Scan all lines to find the max visible column count
    let maxCols = 0;
    for (let i = 1; i <= lineCount; i++) {
      const content = this._viewModel.getLineContent(i);
      const cols = this._computeVisibleColumns(content, tabSize);
      if (cols > maxCols) maxCols = cols;
    }

    // Convert to pixel width: cols * charWidth + left offset (8px) + right gap (8px)
    // Cache for cursor positioning
    this._charWidth = charWidth;
    const pixelWidth = Math.ceil(maxCols * charWidth + 16);
    this._viewLines.setContentWidth(pixelWidth);
  }

  /** Toggle word wrap on/off and persist preference. */
  private _toggleWordWrap(enabled: boolean): void {
    this._wordWrapEnabled = enabled;
    const ext = this.filePath.split(".").pop() || "";
    try {
      localStorage.setItem("openp41ge:wordWrap:" + ext, enabled ? "true" : "false");
    } catch {
      // localStorage may be unavailable in some contexts
    }
    this._applyWordWrap();
  }

  /** Compute the wrap column from the viewport width and character width. */
  private _computeWrapColumn(): number {
    const cw = this._charWidth > 0 ? this._charWidth : 8;
    const vw = this._viewportEl?.clientWidth ?? 600;
    return this._wrapCalculator.compute(vw, 0, 16, cw);
  }

  /** Apply word wrap state to the viewport. */
  private _applyWordWrap(): void {
    if (!this._viewportEl) return;
    if (this._wordWrapEnabled) {
      this._viewportEl.style.overflowX = "hidden";
    } else {
      this._viewportEl.style.overflowX = "auto";
    }
    const wrapColumn = this._computeWrapColumn();
    if (this._viewModel) {
      this._viewModel.setWordWrap(this._wordWrapEnabled, wrapColumn);
    }
    if (this._viewLines) {
      this._viewLines.setWordWrap(this._wordWrapEnabled, wrapColumn);
      this._viewLines.rebuildAll();
      // Re-render with fresh content from the view model
      this._updateContentWidth();
      this._syncCursorView();
    }
    // Update line numbers for word wrap positioning
    if (this._lineNumbersOverlay) {
      const overrides = {
        wordWrapEnabled: this._wordWrapEnabled,
        getViewLineStart: (modelLine: number) =>
          this._viewLines?.getViewLineStart(modelLine) ?? modelLine,
        getViewLineCount: (modelLine: number) => {
          if (!this._viewModel) return 1;
          const content = this._viewModel.getLineContent(modelLine);
          const wc = this._computeWrapColumn();
          return computeWrapSegments(content, wc).length;
        },
      };
      this._lineNumbersOverlay.setConfig(overrides);
      // Expand line number range to cover all model lines when wrapped
      if (this._wordWrapEnabled && this._viewModel) {
        this._lineNumbersOverlay.setVisibleRange(1, Math.min(this._viewModel.lineCount, 500));
      }
    }
  }

  /** Wire up formatter registry to the status bar format button. */
  private _wireFormatter(): void {
    if (!this._statusBar) return;
    const ext = this.filePath.split(".").pop()?.toLowerCase() || "";
    const formatter = this.formatterRegistry?.get(ext) ?? null;
    if (formatter) {
      this._statusBar.setFormatter(() => this.formatDocument());
    } else {
      this._statusBar.clearFormatter();
    }
  }

  private _onViewModelChange(event: ViewModelEvent): void {
    if (!this._viewLines || !this._viewModel) return;

    // Update line count (this also updates scroll height)
    this._viewLines.setTotalLineCount(this._viewModel.lineCount);

    // Clear content caches — after any model change, bracket depth map
    // is stale because content has changed. Recompute before re-rendering.
    this._viewLines.clearContentCache();
    this._bracketDepths = null;
    this._bracketRangeStart = 0;
    this._bracketRangeEnd = 0;

    // Recalculate the visible range based on the new total line count.
    // When lines are deleted, the previous visible end may extend beyond the
    // new line count (e.g., end=5 on a 5-line file that now has 4 lines).
    // onScroll() recomputes the range using the updated _totalLineCount, then
    // builds lines and fires onVisibleRangeChanged (which updates line numbers
    // and selection highlights). If the range hasn't changed numerically (e.g.,
    // content was modified without adding/removing lines), the guard in
    // onScroll() fires and skips the rebuild — refresh() handles that case.
    // Pre-compute bracket depths BEFORE rendering so they're available
    // when onLineRender fires during onScroll/refresh.
    this._computeBracketDepths(
      this._viewLines.startLineNumber || 1,
      this._viewLines.endLineNumber || Math.min(50, this._viewModel.lineCount),
    );
    this._viewLines.onScroll(this._viewportEl.scrollTop, this._viewportEl.clientHeight);

    // Force-rebuild visible lines regardless of whether onScroll() was
    // skipped by the guard. This ensures content is re-rendered even when
    // the visible range hasn't changed numerically but the content has.
    // We use refresh() instead of _renderVisibleLines() because the latter
    // also goes through onScroll() and would hit the same guard.
    this._viewLines.refresh();

    // Ensure line numbers reflect the new line count and visible range.
    // If onScroll() fired onVisibleRangeChanged, this is redundant but harmless.
    // If onScroll() was skipped by the guard, this ensures the overlay is
    // still in sync (e.g., line count changed but visible range didn't).
    // We do NOT call _syncCursorView() here because cursor position changes
    // are already handled by _onCursorChange for local edits. Calling it here
    // would place an unwanted cursor in inactive tabs sharing this model.
    if (this._viewLines.startLineNumber && this._viewLines.endLineNumber) {
      this._lineNumbersOverlay?.setVisibleRange(
        this._viewLines.startLineNumber,
        this._viewLines.endLineNumber,
      );
    }
  }

  private _onCursorChange(event: any): void {
    if (!this._viewModel || !this._viewLines) return;

    if (event.type === "edit" || event.type === "undo" || event.type === "redo") {
      // After edit, content changed — recompute bracket depths and
      // force-rebuild visible lines.
      // Must use refresh(), not _renderVisibleLines(): the latter calls
      // _viewLines.onScroll() which skips if visible range hasn't changed.
      this._bracketDepths = null;
      this._bracketRangeStart = 0;
      this._bracketRangeEnd = 0;
      this._computeBracketDepths(
        this._viewLines.startLineNumber || 1,
        this._viewLines.endLineNumber || Math.min(50, this._viewModel.lineCount),
      );
      this._viewLines.refresh();
    }

    this._syncCursorView();
    this._scrollToRevealCursor();
  }

  private _onModelContentChange(event: TextContentChangeEvent): void {
    // Track dirty state by comparing current content against last saved content.
    // This handles edits, undo, and redo — any operation that restores the
    // document to the saved state is correctly detected as clean.
    const model = this.textContentModel;
    if (model) {
      const isClean = model.getValue() === this._savedContent;
      const wasDirty = this._isDirty;
      this._isDirty = !isClean;
      if (wasDirty !== this._isDirty) {
        this._dispatchDirtyChanged(this._isDirty);
        if (this._statusBar) {
          this._statusBar.setDirty(this._isDirty);
        }
      }
    }

    // Update file size display
    this._updateStatusBarSize();

    // Recompute content width — scanning all lines on every change
    // is fine for typical file sizes; can be optimized later if needed
    this._updateContentWidth();
  }

  /**
   * Sync the cursor and selection visuals with the model state.
   *
   * @param shouldScroll - When true (default), scroll the viewport if the
   *   cursor is outside the visible range. Pass false for mouse clicks,
   *   where the user clicked on a position that is already visible.
   */
  private _syncCursorView(): void {
    if (!this._cursorController || !this._cursorRenderer || !this._viewModel) return;

    const allCursors = this._cursorController.getAllCursors();
    const cw = this._charWidth > 0 ? this._charWidth : 8;
    const leftOffset = 8;

    // Sync cursor renderer element count with cursor count
    this._cursorRenderer.syncCursorCount(allCursors.length);

    // Position each cursor caret (accounting for word wrap)
    const converter = this._wordWrapEnabled ? this._viewModel.coordinatesConverter : null;
    for (let i = 0; i < allCursors.length; i++) {
      const c = allCursors[i];
      let viewLine = c.position.lineNumber;
      let viewCol = c.position.column;
      if (converter) {
        const vp = converter.convertModelToViewPosition(c.position.lineNumber, c.position.column);
        viewLine = vp.lineNumber;
        viewCol = vp.column;
      }
      const x = leftOffset + (viewCol - 1) * cw;
      const y = (viewLine - 1) * this._lineHeight;
      this._cursorRenderer.positionAt(x, y, this._lineHeight, i);
    }
    this._cursorRenderer.show();

    // Dispatch cursor position for the app bottom bar (primary cursor)
    const pos = this._cursorController.position;
    this.dispatchEvent(
      new CustomEvent("fe:cursor-changed", {
        bubbles: true,
        composed: true,
        detail: { lineNumber: pos.lineNumber, column: pos.column },
      }),
    );

    // Render selection highlights for ALL cursor selections
    const allSelections = allCursors.map((c) => ({
      selectionStartLineNumber: c.selectionAnchor.lineNumber,
      selectionStartColumn: c.selectionAnchor.column,
      positionLineNumber: c.position.lineNumber,
      positionColumn: c.position.column,
    }));
    this._renderSelectionHighlights(allSelections);

    // Update line numbers (for relative mode) — based on primary cursor
    this._lineNumbersOverlay?.setActiveLine(pos.lineNumber);

    // Current line highlight — based on primary cursor
    this._currentLineHighlight?.setLine(pos.lineNumber);

    // Bracket matching — based on primary cursor
    const bracketMatch = findMatchingBracket(this._viewModel.model, pos);
    // In a full implementation, bracketMatch highlights are added as decorations
    // For now, this just computes the match for future rendering

    // Indentation guides — based on primary cursor
    if (this._indentationGuides && this._viewLines) {
      const startLine = this._viewLines.startLineNumber || 1;
      const endLine = this._viewLines.endLineNumber || Math.min(50, this._viewModel.lineCount);
      this._indentationGuides.renderGuides(
        startLine,
        endLine,
        (line) => {
          const content = this._viewModel!.getLineContent(line);
          let indent = 0;
          for (let i = 0; i < content.length; i++) {
            if (content.charCodeAt(i) === 32) indent++;
            else if (content.charCodeAt(i) === 9) indent += 4;
            else break;
          }
          return indent;
        },
        20,
        this._viewportEl,
      );
    }
  }

  /**
   * Scroll the viewport to reveal the cursor line, centering it roughly
   * in the middle of the viewport. Called ONLY from keyboard-triggered
   * cursor moves (arrows, Cmd+Up/Down, Home/End, PageUp/PageDown).
   * Mouse clicks never trigger this — they land on an already-visible line.
   */
  private _scrollToRevealCursor(): void {
    // Suppress scroll for events like Cmd+A (select all)
    if (this._suppressScroll) {
      this._suppressScroll = false;
      return;
    }

    if (!this._cursorController || !this._viewLines) return;

    const pos = this._cursorController.position;
    const viewportEl = this._viewportEl;
    const lineHeight = this._lineHeight;
    const viewportHeight = viewportEl.clientHeight;
    // Use view line number for pixel calculation (accounts for word wrap)
    let viewLine = pos.lineNumber;
    if (this._wordWrapEnabled && this._viewModel?.coordinatesConverter) {
      const vp = this._viewModel.coordinatesConverter.convertModelToViewPosition(
        pos.lineNumber,
        pos.column,
      );
      viewLine = vp.lineNumber;
    }
    const cursorTop = (viewLine - 1) * lineHeight;
    const currentScrollTop = viewportEl.scrollTop;
    let scrolled = false;

    if (cursorTop < currentScrollTop) {
      // Cursor is above the visible area — scroll up to reveal
      viewportEl.scrollTop = cursorTop;
      scrolled = true;
    } else if (cursorTop + lineHeight > currentScrollTop + viewportHeight) {
      // Cursor is below the visible area — scroll down to reveal
      // Show the cursor line in the middle-ish of the viewport for context
      const targetScroll = cursorTop + lineHeight - Math.floor(viewportHeight / 2);
      viewportEl.scrollTop = Math.max(0, targetScroll);
      scrolled = true;
    }

    // When we scrolled, the ViewLines' visible range still reflects the old
    // position because ScrollManager defers via requestAnimationFrame.
    // Rebuild synchronously so selection/line-number rendering is correct.
    if (scrolled && this._viewLines) {
      this._viewLines.onScroll(viewportEl.scrollTop, viewportHeight);
    }
  }

  /**
   * Render selection highlights for the currently visible lines.
   * Called from _syncCursorView (on cursor/selection changes) and from
   * onVisibleRangeChanged (on scroll).
   */
  private _renderSelectionHighlights(selections?: TextSelection[]): void {
    if (!this._selectionRenderer || !this._viewLines || !this._viewModel) return;

    const startLine = this._viewLines.startLineNumber || 1;
    const endLine = this._viewLines.endLineNumber || Math.min(50, this._viewModel.lineCount);
    const cw = this._charWidth > 0 ? this._charWidth : 8;
    const leftOffset = 8;

    // If selections not provided, compute from primary cursor
    if (!selections) {
      const sel = this._cursorController?.selection;
      if (sel) {
        selections = [sel];
      }
    }

    // Convert selections from model space to view space when word wrap is on
    const converter = this._wordWrapEnabled ? this._viewModel.coordinatesConverter : null;
    let viewSelections: TextSelection[] | undefined;
    let viewStartLine = startLine;
    let viewEndLine = endLine;

    if (converter && selections) {
      viewSelections = selections.map((s) => {
        const sv = converter.convertModelToViewPosition(
          s.selectionStartLineNumber,
          s.selectionStartColumn,
        );
        const ev = converter.convertModelToViewPosition(s.positionLineNumber, s.positionColumn);
        return {
          selectionStartLineNumber: sv.lineNumber,
          selectionStartColumn: sv.column,
          positionLineNumber: ev.lineNumber,
          positionColumn: ev.column,
        };
      });
      // Use the converter's total view line count to ensure the visible
      // range covers the full selection when word wrap is enabled.
      viewStartLine = 1;
      viewEndLine = converter.getTotalViewLineCount();
    } else {
      viewSelections = selections;
    }

    this._selectionRenderer.renderSelection(
      viewStartLine,
      viewEndLine,
      this._lineHeight,
      (line, column) => {
        const lx = leftOffset + (column - 1) * cw;
        return { x: lx, width: cw };
      },
      (line) => {
        if (converter) {
          // In view space, get the visible segment length for this view line
          const modelLine = converter.getModelLineFromViewLine(line);
          const segments = converter.getWrapSegments(modelLine);
          if (segments && segments.length > 1) {
            const viewLineBase = converter.getViewLineFromModelLine(modelLine);
            const segIdx = line - viewLineBase;
            if (segIdx >= 0 && segIdx < segments.length) {
              return segments[segIdx].endColumn - segments[segIdx].startColumn;
            }
          }
          // Non-wrapped model line: use the resolved model line number
          return this._viewModel!.getLineContent(modelLine).length;
        }
        return this._viewModel!.getLineContent(line).length;
      },
      "#161616",
      viewSelections,
    );
  }

  /**
   * Compute the zoom factor from the viewport element.
   * getBoundingClientRect() returns visual (scaled) pixels while clientWidth
   * returns logical (pre-zoom) pixels. The ratio gives us the zoom factor.
   */
  private _getZoomFactor(): number {
    const w = this._viewportEl.clientWidth;
    if (w === 0) return 1;
    const rect = this._viewportEl.getBoundingClientRect();
    return rect.width / w;
  }

  private _onViewportMouseDown = (e: MouseEvent): void => {
    if (!this._viewModel || !this._cursorController || !this._textAreaInput) return;

    // Get click position relative to viewport
    const rect = this._viewportEl.getBoundingClientRect();
    const zoom = this._getZoomFactor();
    const clickX = (e.clientX - rect.left) / zoom;
    const clickY = (e.clientY - rect.top) / zoom;

    const pos = this._viewportPosToLineCol(clickX, clickY);
    if (!pos) return;

    if (e.altKey) {
      // Alt+Click: add a cursor at this position without moving primary
      this._cursorController.addCursorAt(pos.line, pos.col);
      this._syncCursorView();
      requestAnimationFrame(() => {
        this._textAreaInput?.focus();
      });
      return;
    }

    // Normal click: clear any secondary cursors and place primary cursor
    this._cursorController.removeSecondaryCursors();

    // Record anchor for potential drag selection
    this._mouseDownLine = pos.line;
    this._mouseDownCol = pos.col;
    this._isMouseDown = true;

    // Position cursor (collapsed selection initially).
    // Save and restore scrollTop so _syncCursorView's _scrollToRevealCursor
    // doesn't yank the viewport away from where the user is looking. Their
    // click is on a visible line — they should not be scrolled.
    const savedScrollTop = this._viewportEl.scrollTop;
    this._cursorController.moveTo(pos.line, pos.col);
    this._syncCursorView();
    this._viewportEl.scrollTop = savedScrollTop;

    // Focus the textarea for typing in the next frame
    requestAnimationFrame(() => {
      this._textAreaInput?.focus();
    });

    // Remove any previous mouse tracking listeners
    this._detachMouseSelectionListeners();

    // Track mouse drag for selection
    this._onDocumentMouseMove = (moveEvent: MouseEvent) => {
      if (!this._isMouseDown || !this._viewModel || !this._cursorController) return;

      const moveRect = this._viewportEl.getBoundingClientRect();
      const zoom = this._getZoomFactor();
      const moveX = (moveEvent.clientX - moveRect.left) / zoom;
      const moveY = (moveEvent.clientY - moveRect.top) / zoom;

      const currentPos = this._viewportPosToLineCol(moveX, moveY);
      if (!currentPos) return;

      // Extend selection from the anchor (mousedown position) to current position.
      this._cursorController.selectTo(currentPos.line, currentPos.col);
      this._syncCursorView();
    };

    this._onDocumentMouseUp = () => {
      this._isMouseDown = false;
      this._detachMouseSelectionListeners();
    };

    document.addEventListener("mousemove", this._onDocumentMouseMove);
    document.addEventListener("mouseup", this._onDocumentMouseUp);
  };

  private _detachMouseSelectionListeners(): void {
    if (this._onDocumentMouseMove) {
      document.removeEventListener("mousemove", this._onDocumentMouseMove);
      this._onDocumentMouseMove = null;
    }
    if (this._onDocumentMouseUp) {
      document.removeEventListener("mouseup", this._onDocumentMouseUp);
      this._onDocumentMouseUp = null;
    }
  }

  private _viewportPosToLineCol(
    clickX: number,
    clickY: number,
  ): { line: number; col: number } | null {
    if (!this._viewModel) return null;

    const scrollTop = this._viewportEl.scrollTop;
    const viewLine = Math.floor((clickY + scrollTop) / this._lineHeight) + 1;

    const leftOffset = 8;
    const cw = this._charWidth > 0 ? this._charWidth : 8;
    const relativeX = clickX - leftOffset + this._viewportEl.scrollLeft;
    const viewCol = Math.max(0, Math.round(relativeX / cw)) + 1;

    if (this._wordWrapEnabled && this._viewModel.coordinatesConverter) {
      // Convert view coordinates to model coordinates
      const modelPos = this._viewModel.coordinatesConverter.convertViewToModelPosition(
        viewLine,
        viewCol,
      );
      return { line: modelPos.lineNumber, col: modelPos.column };
    }

    // Without word wrap: 1:1 mapping
    const lineCount = this._viewModel.lineCount;
    const clampedLine = Math.max(1, Math.min(viewLine, lineCount));
    const lineContent = this._viewModel.getLineContent(clampedLine);
    const maxCol = lineContent.length + 1;
    const clampedCol = Math.min(viewCol, maxCol);

    return { line: clampedLine, col: clampedCol };
  }

  private _teardownPipeline(): void {
    this._cursorRenderer?.dispose();
    this._cursorRenderer = null;
    this._selectionRenderer?.dispose();
    this._selectionRenderer = null;
    this._currentLineHighlight?.dispose();
    this._currentLineHighlight = null;
    this._indentationGuides?.dispose();
    this._indentationGuides = null;
    this._lineNumbersOverlay?.dispose();
    this._lineNumbersOverlay = null;
    this._textAreaInput?.dispose();
    this._textAreaInput = null;
    this._scrollManager?.dispose();
    this._scrollManager = null;
    this._viewportResizeObserver?.disconnect();
    this._viewportResizeObserver = null;
    this._clipboardHandler?.dispose();
    this._clipboardHandler = null;
    this._compositionHandler?.dispose();
    this._compositionHandler = null;
    this._mouseHandler?.dispose();
    this._mouseHandler = null;
    this._viewLines?.dispose();
    this._viewLines = null;
    this._viewModel?.dispose();
    this._viewModel = null;
    this._cursorController?.dispose();
    this._cursorController = null;
    this._keyboardHandler = null;
  }

  private _updateStatusBarSize(): void {
    if (!this._statusBar) return;
    const model = this.textContentModel;
    if (!model) {
      this._statusBar.setSize("");
      return;
    }
    const bytes = model.length;
    this._statusBar.setSize(this._formatFileSize(bytes));
  }

  /** Format a byte count as a human-readable string (e.g. "1.2 KB"). */
  private _formatFileSize(bytes: number): string {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + " MB";
    return (bytes / (1024 * 1024 * 1024)).toFixed(1) + " GB";
  }

  private _dispatchTitleChanged(): void {
    this.dispatchEvent(
      new CustomEvent<TitleChangedDetail>(EVENT_TITLE_CHANGED, {
        bubbles: true,
        composed: true,
        detail: {
          title: this.fileName || this.filePath.split("/").pop() || "untitled",
          filePath: this.filePath,
        },
      }),
    );
  }

  private _dispatchDirtyChanged(isDirty: boolean): void {
    this.dispatchEvent(
      new CustomEvent<DirtyChangedDetail>(EVENT_DIRTY_CHANGED, {
        bubbles: true,
        composed: true,
        detail: { isDirty },
      }),
    );
  }

  private _dispatchFileSaved(): void {
    this.dispatchEvent(
      new CustomEvent<FileSavedDetail>(EVENT_FILE_SAVED, {
        bubbles: true,
        composed: true,
        detail: { filePath: this.filePath },
      }),
    );
  }
}
