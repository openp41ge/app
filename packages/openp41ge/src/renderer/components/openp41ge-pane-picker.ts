/**
 * <openp41ge-pane-picker> — overlay input to pick an app type or file (Lit).
 *
 * Side-by-side layout: apps (left) + files from scoped folders (right).
 * Typing filters apps by name AND searches files.
 * Arrow keys navigate both lists; Enter/click selects.
 */

import { LitElement, html, type TemplateResult } from "lit";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import { state, query } from "lit/decorators.js";
import { APP_TYPES } from "../app-types";
import type { AppTypeInfo } from "../app-types";
import { Openp41geScrollbar } from "./openp41ge-scrollbar";

const ITEM_HEIGHT = 36;
const SEARCH_DEBOUNCE_MS = 150;

const APPS_FOR_PICKER = APP_TYPES.filter((t) => t.id !== "file-viewer");

interface PickerResult {
  type: "app" | "file";
  appTypeId?: string;
  path?: string;
  name?: string;
}

class Openp41gePanePicker extends LitElement {
  protected createRenderRoot(): HTMLElement | DocumentFragment {
    return this;
  }

  @state() private _filteredApps: AppTypeInfo[] = [...APPS_FOR_PICKER];
  @state() private _fileResults: { path: string; name: string; dir: string }[] = [];
  @state() private _items: PickerResult[] = [];
  @state() private _selectedIndex = 0;
  @state() private _isSearching = false;
  @state() private _statusText = `${APPS_FOR_PICKER.length} apps`;

  @query("#openp41ge-picker-input")
  private _inputEl!: HTMLInputElement;
  @query("#openp41ge-picker-apps")
  private _appsListEl!: HTMLElement;
  @query("#openp41ge-picker-files")
  private _filesListEl!: HTMLElement;

  private _onSelect: ((result: PickerResult) => void) | null = null;
  private _onClose: (() => void) | null = null;
  private _searchTimer: ReturnType<typeof setTimeout> | null = null;
  private _cachedFileResults: { path: string; name: string; dir: string }[] | null = null;

  get onSelect(): ((result: PickerResult) => void) | null {
    return this._onSelect;
  }
  set onSelect(fn: ((result: PickerResult) => void) | null) {
    this._onSelect = fn;
  }
  get onClose(): (() => void) | null {
    return this._onClose;
  }
  set onClose(fn: (() => void) | null) {
    this._onClose = fn;
  }

  connectedCallback(): void {
    super.connectedCallback();
    this._rebuildItems();
    this._loadRecentFiles().then(() => {
      this._rebuildItems();
      this._updateStatus();
      this._renderFiles();
    });
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    if (this._searchTimer) clearTimeout(this._searchTimer);
  }

  updated(): void {
    // Setup scrollbar for the list panels
    if (
      this._appsListEl &&
      !(this._appsListEl as HTMLElement & { __scrollbarSetup?: boolean }).__scrollbarSetup
    ) {
      (this._appsListEl as HTMLElement & { __scrollbarSetup?: boolean }).__scrollbarSetup = true;
      new Openp41geScrollbar(this._appsListEl, { axis: "vertical", autoHide: true });
    }
    if (
      this._filesListEl &&
      !(this._filesListEl as HTMLElement & { __scrollbarSetup?: boolean }).__scrollbarSetup
    ) {
      (this._filesListEl as HTMLElement & { __scrollbarSetup?: boolean }).__scrollbarSetup = true;
      new Openp41geScrollbar(this._filesListEl, { axis: "vertical", autoHide: true });
    }
    this._renderApps();
    this._renderFiles();
  }

  render(): TemplateResult {
    return html`
      <div
        id="openp41ge-picker-backdrop"
        style="position:fixed;inset:0;z-index:1000;background:rgba(0,0,0,0.4);display:flex;align-items:flex-start;justify-content:center;padding-top:80px;"
        @mousedown=${(e: MouseEvent) => {
          const target = e.target as HTMLElement;
          if (target.id === "openp41ge-picker-backdrop") this._close();
        }}
      >
        <div
          id="openp41ge-picker-panel"
          style="width:800px;max-height:600px;background:var(--bg-primary);border:1px solid var(--border-color);border-radius:8px;box-shadow:0 8px 32px rgba(0,0,0,0.5);display:flex;flex-direction:column;overflow:hidden;"
        >
          <input
            id="openp41ge-picker-input"
            type="text"
            placeholder="Search apps and files…"
            autofocus
            style="width:100%;padding:12px 16px;background:var(--bg-secondary);border:none;border-bottom:1px solid var(--border-divider);color:#ddd;font-size:14px;outline:none;box-sizing:border-box;"
            @input=${() => this._onInput()}
            @keydown=${(e: KeyboardEvent) => this._keyHandler(e)}
          />
          <div style="flex:1;display:flex;overflow:hidden;min-height:0;">
            <div
              id="openp41ge-picker-apps"
              style="flex:1;overflow-y:overlay;padding:4px 0;border-right:1px solid var(--border-divider);"
            ></div>
            <div id="openp41ge-picker-files" style="flex:1;overflow-y:overlay;padding:4px 0;">
              <div
                style="padding:8px 16px 4px;font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.06em;"
              >
                Files
              </div>
            </div>
          </div>
          <div
            id="openp41ge-picker-footer"
            style="padding:6px 16px;border-top:1px solid var(--border-divider);font-size:11px;color:var(--text-muted);display:flex;justify-content:space-between;"
          >
            <span id="openp41ge-picker-status">${this._statusText}</span>
            <span style="color:#444;">↑↓ navigate ⏎ select ⎋ close</span>
          </div>
        </div>
      </div>
    `;
  }

  // ═══ Keyboard ─────────────────────────────────────────────────────────

  _keyHandler(e: KeyboardEvent): void {
    if (e.key === "Escape") {
      e.preventDefault();
      this._close();
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (this._items.length > 0) this._select(this._selectedIndex);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      this._selectedIndex = Math.min(this._selectedIndex + 1, this._items.length - 1);
      this._highlightItem();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      this._selectedIndex = Math.max(this._selectedIndex - 1, 0);
      this._highlightItem();
    }
  }

  // ═══ Input ────────────────────────────────────────────────────────────

  _onInput(): void {
    const q = (this._inputEl?.value ?? "").toLowerCase().trim();

    if (!q) {
      this._filteredApps = [...APPS_FOR_PICKER];
    } else {
      this._filteredApps = APPS_FOR_PICKER.filter(
        (t) => t.label.toLowerCase().includes(q) || t.id.toLowerCase().includes(q),
      );
    }

    if (this._searchTimer) clearTimeout(this._searchTimer);
    if (q.length >= 1) {
      if (!this._cachedFileResults) this._cachedFileResults = [...this._fileResults];
      this._fileResults = (this._cachedFileResults ?? []).filter(
        (f) => f.name.toLowerCase().includes(q) || f.dir.toLowerCase().includes(q),
      );
      this._isSearching = false;
      this._searchTimer = setTimeout(() => this._searchFiles(q), SEARCH_DEBOUNCE_MS);
    } else {
      this._fileResults = this._cachedFileResults || this._fileResults;
      this._isSearching = false;
    }

    this._selectedIndex = 0;
    this._rebuildItems();
    this._updateStatus();
    this._renderApps();
    this._renderFiles();
  }

  async _loadRecentFiles(): Promise<void> {
    try {
      const scope = await window.openp41ge.file.getScope();
      if (scope.length === 0) {
        this._fileResults = [];
        return;
      }
      const results = await window.openp41ge.file.listRecent(scope);
      this._fileResults = results;
      this._cachedFileResults = [...results];
    } catch {
      this._fileResults = [];
    }
  }

  async _searchFiles(query: string): Promise<void> {
    try {
      const scope = await window.openp41ge.file.getScope();
      if (scope.length === 0) {
        this._fileResults = [];
      } else {
        this._fileResults = await window.openp41ge.file.search(query, scope);
      }
    } catch {
      this._fileResults = [];
    }
    this._isSearching = false;
    this._rebuildItems();
    this._updateStatus();
    this._renderFiles();
    this._highlightItem();
  }

  // ═══ DOM rendering (innerHTML for complex lists) ──────────────────────

  private _rebuildItems(): void {
    this._items = [
      ...this._filteredApps.map((t) => ({ type: "app" as const, appTypeId: t.id, name: t.label })),
      ...this._fileResults.map((f) => ({ type: "file" as const, path: f.path, name: f.name })),
    ];
    if (this._selectedIndex >= this._items.length) {
      this._selectedIndex = Math.max(0, this._items.length - 1);
    }
  }

  private _updateStatus(): void {
    const parts: string[] = [`${this._filteredApps.length} apps`];
    if (this._fileResults.length > 0) parts.push(`${this._fileResults.length} files`);
    this._statusText = parts.join(" \u00B7 ");
  }

  private _renderApps(): void {
    if (!this._appsListEl) return;
    if (this._filteredApps.length === 0) {
      this._appsListEl.innerHTML = `<div style="padding:16px;color:var(--text-muted);text-align:center;font-size:12px;">No matching apps</div>`;
      return;
    }
    const showHeader = this._fileResults.length > 0;
    this._appsListEl.innerHTML =
      (showHeader
        ? `<div style="padding:8px 16px 4px;font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.06em;">Apps</div>`
        : "") +
      this._filteredApps
        .map((t, i) => {
          const sel = i === this._selectedIndex;
          return `<div data-idx="${i}" class="picker-item" style="display:flex;align-items:center;gap:10px;padding:0 16px;height:${ITEM_HEIGHT}px;cursor:pointer;background:${sel ? "#2a2a2a" : "transparent"};color:${sel ? "#fff" : "#bbb"};font-size:13px;">
            <span style="font-size:16px;width:24px;text-align:center;">${unsafeHTML(t.icon)}</span>
            <span>${t.label}</span>
            <span style="margin-left:auto;color:var(--text-muted);font-size:11px;">${t.id}</span>
          </div>`;
        })
        .join("");

    this._appsListEl.querySelectorAll(".picker-item").forEach((item) => {
      const idx = parseInt(item.getAttribute("data-idx") ?? "0", 10);
      item.addEventListener("mouseenter", () => {
        this._selectedIndex = idx;
        this._highlightItem();
      });
      item.addEventListener("click", () => {
        this._select(idx);
      });
    });
  }

  private _renderFiles(): void {
    if (!this._filesListEl) return;

    if (this._isSearching) {
      this._filesListEl.innerHTML = `<div style="padding:8px 16px 4px;font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.06em;">Files</div>
        <div style="padding:16px;color:var(--text-muted);text-align:center;font-size:12px;">Searching\u2026</div>`;
      return;
    }

    const appsCount = this._filteredApps.length;

    if (this._fileResults.length === 0) {
      this._filesListEl.innerHTML = `<div style="padding:8px 16px 4px;font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.06em;">Files</div>
        <div style="padding:16px;color:var(--text-muted);text-align:center;font-size:12px;">No files \u2014 add folders via Cmd+B</div>`;
      return;
    }

    this._filesListEl.innerHTML = `<div style="padding:8px 16px 4px;font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.06em;">Files</div>
      ${this._fileResults
        .map((f, i) => {
          const idx = appsCount + i;
          const sel = idx === this._selectedIndex;
          const dirName = f.dir.split("/").filter(Boolean).pop() || f.dir;
          return `<div data-idx="${idx}" class="picker-item" style="display:flex;align-items:center;gap:6px;padding:0 16px;height:${ITEM_HEIGHT}px;cursor:pointer;background:${sel ? "#2a2a2a" : "transparent"};color:${sel ? "#fff" : "#bbb"};font-size:13px;">
            <span style="font-size:14px;width:20px;text-align:center;flex-shrink:0;">\uD83D\uDCC4</span>
            <div style="flex:1;overflow:hidden;">
              <div style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${f.name}</div>
              <div style="font-size:10px;color:var(--text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${dirName}</div>
            </div>
          </div>`;
        })
        .join("")}`;

    this._filesListEl.querySelectorAll(".picker-item").forEach((item) => {
      const idx = parseInt(item.getAttribute("data-idx") ?? "0", 10);
      item.addEventListener("mouseenter", () => {
        this._selectedIndex = idx;
        this._highlightItem();
      });
      item.addEventListener("click", () => {
        this._select(idx);
      });
    });
  }

  private _highlightItem(): void {
    [this._appsListEl, this._filesListEl].forEach((list) => {
      if (!list) return;
      list.querySelectorAll(".picker-item").forEach((el) => {
        if (!(el instanceof HTMLElement)) return;
        const idx = parseInt(el.getAttribute("data-idx") ?? "-1", 10);
        if (idx === this._selectedIndex) {
          el.style.background = "#2a2a2a";
          el.style.color = "#fff";
          el.scrollIntoView({ block: "nearest" });
        } else {
          el.style.background = "transparent";
          el.style.color = "#bbb";
        }
      });
    });
  }

  private _select(index: number): void {
    const item = this._items[index];
    if (!item) return;
    this._onSelect?.(item);
    this.remove();
  }

  private _close(): void {
    this._onClose?.();
    this.remove();
  }
}

customElements.define("openp41ge-pane-picker", Openp41gePanePicker);

export { Openp41gePanePicker };
export type { PickerResult };
