/**
 * FileEditorController — adapter that bridges <file-editor> to Openp41ge's tab system.
 *
 * Implements FileViewerController (a TabController subtype) with file-specific
 * properties like loadFile, filePath, and isDirty.
 *
 * The preview/pinned state is managed by the Openp41ge platform via tab.isPreview
 * in the workspace state. This controller reads it for behavior decisions
 * (e.g., showing pin UI) but never decides WHEN to preview or pin.
 */

import { createLogger } from "openp41ge-logger";
import { BaseController } from "../../controllers/base-controller";
import type { FileViewerController } from "../../controllers/types";

const log = createLogger("FileEditorController");

// Import the file-editor component (side-effect: defines <file-editor>)
import "openp41ge-file-editor";
import type { FileEditorElement } from "openp41ge-file-editor";
import { ExtensionFormatterRegistry, registerBuiltinFormatters } from "openp41ge-file-editor";
import type { IFormatter } from "openp41ge-file-editor";
import { appServices } from "../../app";

/** Get file extension from a path. */
function fileExtension(path: string): string {
  const dot = path.lastIndexOf(".");
  if (dot < 0) return "";
  const slash = path.lastIndexOf("/");
  if (dot < slash) return "";
  return path.slice(dot);
}

/** Built-in JSON formatter (pretty-print). */
const jsonFormatter: IFormatter = {
  name: "JSON Pretty Print",
  format(content: string): string {
    try {
      return JSON.stringify(JSON.parse(content), null, 2) + "\n";
    } catch {
      return content;
    }
  },
};

/** Singleton formatter registry with built-in formatters. */
let _formatterRegistry: ExtensionFormatterRegistry | null = null;
function getFormatterRegistry(): ExtensionFormatterRegistry {
  if (!_formatterRegistry) {
    _formatterRegistry = new ExtensionFormatterRegistry();
    _formatterRegistry.register(["json", "jsonc"], jsonFormatter);
    registerBuiltinFormatters(_formatterRegistry);
  }
  return _formatterRegistry;
}

export class FileEditorController extends BaseController implements FileViewerController {
  /** Full file path on disk. */
  filePath: string = "";

  /** Whether there are unsaved changes. Read by app.ts helper functions. */
  _isDirty: boolean = false;

  /** The <file-editor> element, or null until mount(). */
  private _editor: FileEditorElement | null = null;

  /** Tracks the last dispatched title to deduplicate updateTabTitle calls. */
  private _lastDispatchedTitle: string = "";

  /** Bound event listeners for cleanup. */
  private _boundTitleChanged: ((e: Event) => void) | null = null;
  private _boundDirtyChanged: ((e: Event) => void) | null = null;
  private _boundFileSaved: ((e: Event) => void) | null = null;
  private _boundConfigChanged: ((e: Event) => void) | null = null;

  constructor(tabId: string, appType: string, filePath?: string) {
    super(tabId, appType);
    if (filePath) {
      this.filePath = filePath;
      this.state.filePath = filePath;
    }
  }

  mount(container: HTMLElement): void {
    this.container = container;

    // Use the pending file path if set
    const pendingPath = window.__pendingFilePath;
    if (pendingPath) {
      this.filePath = pendingPath;
      this.state.filePath = pendingPath;
      window.__pendingFilePath = null;
    }

    const fileName = this.filePath.split("/").filter(Boolean).pop() || "Untitled";

    // Layout
    container.style.cssText = [
      "width:100%",
      "height:100%",
      "display:flex",
      "flex-direction:column",
      "background:var(--bg-surface)",
      "overflow:hidden",
      "position:relative",
    ].join(";");

    // Create <file-editor>
    const editor = document.createElement("file-editor") as FileEditorElement;
    editor.style.cssText = "width:100%;height:100%;display:block;";
    editor.formatterRegistry = getFormatterRegistry();
    container.appendChild(editor);
    this._editor = editor;

    // Apply syntax theme and editor settings from config
    this._applySyntaxTheme();
    this._applyEditorSettings();

    // Bridge CustomEvents to Openp41ge
    this._attachEventBridge();

    // Load the file using the shared model from the registry
    // (async — mount returns synchronously; file content loads in background)
    if (this.filePath) {
      this._loadFileAsync(this.filePath, fileName);
    }
  }

  /**
   * Async file loading using the shared model from the registry.
   * Called from mount() to keep the mount() signature synchronous.
   */
  private async _loadFileAsync(path: string, fileName: string): Promise<void> {
    if (!this._editor) return;
    try {
      const model = await appServices.modelRegistry.getOrCreate(path);
      if (!this._editor) return; // Already unmounted
      this._editor.textContentModel = model;

      // Cross-tab sync is automatic: all tabs share the same model instance,
      // so model.onDidChangeContent listeners in each tab fire for all edits.
      // The editor's _initWithModel already subscribes to model content changes.

      await this._editor.loadFile(path, fileName);
    } catch (err) {
      log.error("Failed to mount file:", err);
    }
  }

  unmount(): void {
    this._detachEventBridge();

    // Release the shared model from the registry
    if (this.filePath) {
      appServices.modelRegistry.release(this.filePath);
    }

    this._editor = null;
    this.container = null;
    this._lastDispatchedTitle = "";
  }

  setVisible(_visible: boolean): void {
    // No special visibility handling needed
  }

  snapshot(): Record<string, unknown> {
    return {
      ...this.state,
      filePath: this.filePath,
    };
  }

  restore(state: Record<string, unknown>): void {
    this.state = { ...state };
    if (typeof state.filePath === "string") {
      this.filePath = state.filePath;
    }
  }

  /**
   * Load a new file into this existing tab.
   * Called when a preview tab is replaced with a new file.
   */
  loadFile(path: string, fileName?: string): Promise<void> {
    const prevPath = this.filePath;
    this.filePath = path;
    this.state.filePath = path;

    if (path !== prevPath) {
      // Release the previous model
      if (prevPath) {
        appServices.modelRegistry.release(prevPath);
      }

      queueMicrotask(() => {
        try {
          window.openp41ge.workspace.dispatch("updateTabConfig", this.tabId, "filePath", path);
        } catch {
          // Ignore dispatch errors
        }
      });
    }

    if (this._editor) {
      const name = fileName || path.split("/").filter(Boolean).pop() || "Untitled";
      return this._loadFileAsync(path, name);
    }

    return Promise.resolve();
  }

  /**
   * Save the current content to disk.
   */
  async saveDraft(): Promise<boolean> {
    if (!this._editor) return false;
    return this._editor.save();
  }

  // ── Private helpers ──

  /** Apply the syntax theme to the editor based on file extension. */
  private _applySyntaxTheme(): void {
    if (!this._editor) return;
    const extension = fileExtension(this.filePath);
    const themeId = appServices.configService.getSyntaxTheme(extension);
    this._editor.setTheme(themeId);
  }

  /** Apply editor settings (line height, font size) from config. */
  private _applyEditorSettings(): void {
    if (!this._editor) return;
    const lineHeight = appServices.configService.get("editor.lineHeight") as number | undefined;
    const fontSize = appServices.configService.get("editor.fontSize") as number | undefined;
    if (typeof lineHeight === "number" && lineHeight >= 14 && lineHeight <= 40) {
      this._editor.setEditorLineHeight(lineHeight);
    }
    if (typeof fontSize === "number" && fontSize >= 10 && fontSize <= 30) {
      this._editor.setEditorFontSize(fontSize);
    }
  }

  private _attachEventBridge(): void {
    if (!this._editor) return;

    this._boundTitleChanged = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      const title: string = detail.title ?? "";
      if (title === this._lastDispatchedTitle) return;
      this._lastDispatchedTitle = title;
      try {
        window.openp41ge.workspace.dispatch("updateTabTitle", this.tabId, title);
      } catch {
        // Ignore dispatch errors during teardown
      }
    };

    this._boundDirtyChanged = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      const wasDirty = this._isDirty;
      this._isDirty = !!detail.isDirty;

      // Propagate dirty state to the tab config so the tab handle can show
      // a visual indicator (yellow circle) next to the close button.
      try {
        window.openp41ge.workspace.dispatch(
          "updateTabConfig",
          this.tabId,
          "isDirty",
          this._isDirty,
        );
      } catch {
        // Ignore dispatch errors during teardown
      }

      // Auto-pin the tab when it becomes dirty for the first time.
      // An unpinned (preview) tab becomes pinned once modified, since
      // pinned tabs cannot be unpinned — they can only be closed.
      if (this._isDirty && !wasDirty && this.container) {
        // Auto-pin the tab when it becomes dirty for the first time.
        // An unpinned (preview) tab becomes pinned once modified, since
        // pinned tabs cannot be unpinned — they can only be closed.
        // Dispatch on tabContent which bubbles to .openp41ge-grid-cell where
        // the @cell-tab:pin handler is registered.
        const cell = this.container.closest(".openp41ge-grid-cell");
        if (cell) {
          const col = Array.from(cell.parentElement?.children ?? []).indexOf(cell as HTMLElement);
          const tabContent = this.container.closest("openp41ge-tab-content");
          const winId = (tabContent as HTMLElement & { winId?: string })?.winId ?? "";
          const worksetId = (tabContent as HTMLElement & { pageId?: string })?.pageId ?? "";
          tabContent?.dispatchEvent(
            new CustomEvent("cell-tab:pin", {
              bubbles: true,
              composed: true,
              detail: {
                winId,
                worksetId,
                tabId: this.tabId,
                col: Math.max(0, col),
              },
            }),
          );
        }
      }
    };

    this._boundFileSaved = (_e: Event) => {
      try {
        window.openp41ge.workspace.dispatch(
          "updateTabConfig",
          this.tabId,
          "filePath",
          this.filePath,
        );
      } catch {
        // Ignore dispatch errors during teardown
      }
    };

    this._boundConfigChanged = (e: Event) => {
      const detail = (e as CustomEvent).detail as { key?: string; value?: unknown };
      if (!detail || !detail.key) return;
      // React to syntax theme changes that affect this file's extension
      if (detail.key === "syntaxThemes") {
        this._applySyntaxTheme();
      }
      // React to editor config changes
      if (detail.key === "editor.lineHeight" || detail.key === "editor.fontSize") {
        this._applyEditorSettings();
      }
    };

    // Listen for config changes to update syntax theme
    document.addEventListener("openp41ge:config-changed", this._boundConfigChanged);

    this._editor.addEventListener("fe:title-changed", this._boundTitleChanged);
    this._editor.addEventListener("fe:dirty-changed", this._boundDirtyChanged);
    this._editor.addEventListener("fe:file-saved", this._boundFileSaved);
  }

  private _detachEventBridge(): void {
    if (!this._editor) return;
    if (this._boundTitleChanged)
      this._editor.removeEventListener("fe:title-changed", this._boundTitleChanged);
    if (this._boundDirtyChanged)
      this._editor.removeEventListener("fe:dirty-changed", this._boundDirtyChanged);
    if (this._boundFileSaved)
      this._editor.removeEventListener("fe:file-saved", this._boundFileSaved);
    if (this._boundConfigChanged)
      document.removeEventListener("openp41ge:config-changed", this._boundConfigChanged);
    this._boundTitleChanged = null;
    this._boundDirtyChanged = null;
    this._boundFileSaved = null;
    this._boundConfigChanged = null;
  }
}
