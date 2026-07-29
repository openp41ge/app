/**
 * TabGrid stories — demonstrates <tab-grid> with multi-grid drag-and-drop.
 */

import { html, LitElement, type TemplateResult } from "lit";
import { customElement, property, query } from "lit/decorators.js";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import type { Meta, StoryObj } from "@storybook/web-components";
import "openp41ge-uikit";
import {
  DragOrchestrator,
  TabDragSource,
  GhostManager,
  type IDragSource,
} from "openp41ge-uikit";

// ─── Types ────────────────────────────────────────────────────────────

interface TabData {
  id: string;
  title: string;
  content: string;
  pinned?: boolean;
}

class GridState {
  winId: string;
  lastFocusedCol = 0;
  cols = 1;
  tabs: Record<string, { title: string; content: string; pinned?: boolean }> = {};
  activeTabIds: Record<string, string> = {};
  placements: Array<{ position: { row: number; col: number }; tabIds: string[] }> = [];

  constructor(winId: string, initialTabs: TabData[]) {
    this.winId = winId;
    const tabIds: string[] = [];
    for (const tab of initialTabs) {
      this.tabs[tab.id] = { title: tab.title, content: tab.content, pinned: tab.pinned ?? true };
      tabIds.push(tab.id);
    }
    this.placements.push({ position: { row: 0, col: 0 }, tabIds });
    if (tabIds.length > 0) this.activeTabIds["0"] = tabIds[0];
  }

  applyTo(gridEl: any): void {
    gridEl.winId = this.winId;
    gridEl.cols = this.cols;
    gridEl.tabData = { ...this.tabs };
    gridEl.activeTabIds = { ...this.activeTabIds };
    gridEl.placements = this.placements.map((p) => ({
      position: { ...p.position },
      tabIds: [...p.tabIds],
    }));
  }

  addTab(col: number, title: string, content: string): TabData {
    const id = "tab-" + Date.now() + Math.random().toString(36).slice(2, 6);
    const tab: TabData = { id, title, content, pinned: false };
    this.tabs[id] = { title, content, pinned: false };
    const colKey = String(col);
    const placement = this.placements.find((p) => String(p.position.col) === colKey);
    if (placement) {
      placement.tabIds.push(id);
    } else {
      this.placements.push({ position: { row: 0, col }, tabIds: [id] });
      this.cols = Math.max(this.cols, col + 1);
    }
    this.activeTabIds[colKey] = id;
    return tab;
  }

  removeTab(tabId: string): void {
    delete this.tabs[tabId];
    for (const p of this.placements) {
      const idx = p.tabIds.indexOf(tabId);
      if (idx !== -1) p.tabIds.splice(idx, 1);
    }
    this.placements = this.placements.filter((p) => p.tabIds.length > 0);
    for (const col of Object.keys(this.activeTabIds)) {
      if (!this.tabs[this.activeTabIds[col]]) {
        const placement = this.placements.find((p) => String(p.position.col) === col);
        if (placement && placement.tabIds.length > 0) {
          this.activeTabIds[col] = placement.tabIds[0];
        } else {
          delete this.activeTabIds[col];
        }
      }
    }
  }
}

// ─── File icon helpers ────────────────────────────────────────────────

const FILE_ICONS: Record<string, string> = {
  ts: `<svg viewBox="0 0 24 24" fill="#3178c6" width="14" height="14"><rect width="24" height="24" rx="2"/><text x="5" y="17" fill="white" font-size="14" font-weight="bold">TS</text></svg>`,
  tsx: `<svg viewBox="0 0 24 24" fill="#3178c6" width="14" height="14"><rect width="24" height="24" rx="2"/><text x="5" y="17" fill="white" font-size="14" font-weight="bold">TS</text></svg>`,
  css: `<svg viewBox="0 0 24 24" fill="#2965f1" width="14" height="14"><rect width="24" height="24" rx="2"/><text x="4" y="17" fill="white" font-size="12" font-weight="bold">CSS</text></svg>`,
  md: `<svg viewBox="0 0 24 24" fill="#083fa1" width="14" height="14"><rect width="24" height="24" rx="2"/><text x="4" y="17" fill="white" font-size="12" font-weight="bold">MD</text></svg>`,
  default: `<svg viewBox="0 0 24 24" fill="#666" width="14" height="14"><rect width="24" height="24" rx="2"/><text x="6" y="17" fill="white" font-size="12" font-weight="bold">*</text></svg>`,
};

function fileIcon(filename: string): string {
  const ext = filename.split(".").pop() || "";
  return FILE_ICONS[ext] || FILE_ICONS.default;
}

function createTab(title: string, content: string, pinned = true): TabData {
  return { id: "tab-" + Date.now() + Math.random().toString(36).slice(2, 6), title, content, pinned };
}

// ─── Demo app ─────────────────────────────────────────────────────────

@customElement("tabs-demo-app")
class TabsDemoApp extends LitElement {
  override createRenderRoot(): HTMLElement | ShadowRoot {
    return this;
  }

  private _editorState = new GridState("editor", [
    createTab("README.md", '<div class="content-placeholder"><h3>README.md</h3><p>Welcome! Drag tabs to edges to create new columns.</p></div>'),
    createTab("index.js", '<div class="content-placeholder"><h3>index.js</h3><pre style="background:#252526;padding:12px;border-radius:4px;color:#7ecb8e;">const grid = document.querySelector("tab-grid");</pre></div>'),
  ]);

  private _sideState = new GridState("side-a", [
    createTab("Terminal", '<div class="content-placeholder"><h3>Terminal</h3><p>$ git status</p></div>'),
  ]);

  // ── Drag state ───────────────────────────────────────────────────

  private _currentDragSource: IDragSource | null = null;
  private _ghostShownGrid: HTMLElement | null = null;
  private _ghostManager = new GhostManager();
  private _orchestrator!: DragOrchestrator;

  private _targetResolver = (clientX: number, clientY: number) => {
    const el = document.elementFromPoint(clientX, clientY);
    if (!el || !(el instanceof HTMLElement)) return null;
    const tabBar = el.closest("tab-bar") as any;
    if (tabBar && tabBar.dropTarget) return tabBar.dropTarget;
    const grid = el.closest("tab-grid") as any;
    if (grid && grid.dropTarget) return grid.dropTarget;
    return null;
  };

  // ── Refs ─────────────────────────────────────────────────────────

  @query("#editor-grid")
  private _editorGrid!: any;

  @query("#side-grid-a")
  private _sideGrid!: any;

  private _logEl!: HTMLElement;
  private _logCount = 0;

  // ── Lifecycle ────────────────────────────────────────────────────

  override firstUpdated(): void {
    this._logEl = this.querySelector("#log") as HTMLElement;
    this._orchestrator = new DragOrchestrator(this._targetResolver);

    this._renderAll();

    // File explorer drag
    this.querySelectorAll(".file-card").forEach((card) => {
      card.addEventListener("dragstart", (e: Event) => {
        const de = e as DragEvent;
        de.dataTransfer?.setData("text/plain", (card as HTMLElement).dataset.filepath || "");
        this._log("File drag start: " + (card as HTMLElement).dataset.filepath);
      });
    });

    // ── Tab drag: mousedown on [role='tab'] ──────────────────────
    document.addEventListener("mousedown", (e: Event) => {
      const tabBtn = (e.target as HTMLElement).closest("[role='tab']");
      if (!tabBtn) return;
      if ((e.target as HTMLElement).closest(".tab-close")) return;

      const tabBar = tabBtn.closest("tab-bar") as any;
      if (!tabBar) return;
      const tabId = tabBtn.getAttribute("data-tab-id");
      if (!tabId) return;

      e.preventDefault();
      this._currentDragSource = new TabDragSource(tabBtn as HTMLElement, tabId, tabBar.winId, "workset-1");
      this._orchestrator.startDrag(this._currentDragSource, (e as MouseEvent).clientX, (e as MouseEvent).clientY);
    });

    // ── mousemove: update ghost overlay ──────────────────────────
    document.addEventListener("mousemove", (e: Event) => {
      if (!this._orchestrator.isDragging) return;
      const me = e as MouseEvent;
      if (this._ghostShownGrid) {
        this._ghostManager.hideGhost(this._ghostShownGrid);
        this._ghostShownGrid = null;
      }
      const target = this._targetResolver(me.clientX, me.clientY);
      if (!target || target.type !== "grid" || !this._currentDragSource) return;
      const feedback = target.onHover(this._currentDragSource, me.clientX, me.clientY);
      if (!feedback || !feedback.showGhost || !feedback.ghostConfig) return;
      const cfg = feedback.ghostConfig;
      this._ghostManager.showGhost(target.element, {
        cols: cfg.cols,
        boundaryIndex: cfg.boundaryIndex,
        splitCol: cfg.splitCol,
        splitLeft: cfg.splitLeft,
        activeCol: cfg.mouseCol ?? cfg.col,
      });
      this._ghostShownGrid = target.element;
    });

    // ── mouseup: clear ghost ─────────────────────────────────────
    document.addEventListener("mouseup", () => {
      if (this._ghostShownGrid) {
        this._ghostManager.hideGhost(this._ghostShownGrid);
        this._ghostShownGrid = null;
      }
    });

    // ── Add tab buttons ──────────────────────────────────────────
    this.querySelectorAll(".demo-add-tab-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const winId = (btn as HTMLElement).dataset.winId || "editor";
        const col = parseInt((btn as HTMLElement).dataset.col || "0", 10);
        const state = winId === "editor" ? this._editorState : this._sideState;
        const tab = state.addTab(col, "New Tab", '<div class="content-placeholder"><h3>New Tab</h3><p>Added from + button.</p></div>');
        this._renderAll();
        this._log(`Added tab "${tab.id}" to ${winId}`);
      });
    });

    // ── Tab close ────────────────────────────────────────────────
    document.addEventListener("click", (e: Event) => {
      const closeBtn = (e.target as HTMLElement).closest(".tab-close");
      if (!closeBtn) return;
      const tabBar = closeBtn.closest("tab-bar") as any;
      if (!tabBar) return;
      const tabId = closeBtn.getAttribute("data-close-tab-id");
      if (!tabId) return;
      const winId = tabBar.winId;
      const state = winId === "editor" ? this._editorState : this._sideState;
      if (!state) return;
      state.removeTab(tabId);
      this._renderAll();
      this._log(`Closed tab "${tabId}" from ${winId}`);
    });

    // ── Reset ────────────────────────────────────────────────────
    this.querySelector("#btn-reset")?.addEventListener("click", () => {
      this._editorState = new GridState("editor", [
        createTab("README.md", '<div class="content-placeholder"><h3>README.md</h3><p>Welcome! Drag tabs to edges to create new columns.</p></div>'),
        createTab("index.js", '<div class="content-placeholder"><h3>index.js</h3><pre style="background:#252526;padding:12px;border-radius:4px;color:#7ecb8e;">const grid = document.querySelector("tab-grid");</pre></div>'),
      ]);
      this._sideState = new GridState("side-a", [
        createTab("Terminal", '<div class="content-placeholder"><h3>Terminal</h3><p>$ git status</p></div>'),
      ]);
      this._renderAll();
      this._logEl.innerHTML = "";
      this._logCount = 0;
      this._log("Demo reset");
    });

    // ── Clear log ────────────────────────────────────────────────
    this.querySelector("#btn-clear-log")?.addEventListener("click", () => {
      this._logEl.innerHTML = "";
      this._logCount = 0;
    });
  }

  private _renderAll(): void {
    this._editorState.applyTo(this._editorGrid);
    this._sideState.applyTo(this._sideGrid);
  }

  private _log(msg: string): void {
    if (!this._logEl) return;
    this._logCount++;
    const entry = document.createElement("div");
    entry.textContent = `[${this._logCount}] ${msg}`;
    entry.style.cssText = "color: #888; font-size: 11px; padding: 2px 0;";
    this._logEl.appendChild(entry);
    this._logEl.scrollTop = this._logEl.scrollHeight;
  }

  override render(): TemplateResult {
    return html`
      <style>
        .tabs-demo { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #1e1e1e; color: #ccc; padding: 16px; min-height: 100vh; }
        .tabs-demo h1 { font-size: 18px; margin: 0 0 4px; color: #fff; }
        .tabs-demo h1 span { color: rgb(74, 158, 255); }
        .tabs-demo p { margin: 0 0 16px; font-size: 12px; color: #888; }
        .grid-row { display: flex; gap: 12px; margin-bottom: 16px; }
        .editor-wrapper { flex: 1; min-height: 250px; display: flex; flex-direction: column; }
        .side-grid { width: 300px; min-height: 250px; display: flex; flex-direction: column; }
        .demo-section { margin-bottom: 16px; }
        .demo-section h2 { font-size: 13px; margin: 0 0 8px; color: #aaa; }
        h2 small { font-weight: normal; font-size: 11px; color: #666; margin-left: 8px; }
        .file-explorer { display: flex; gap: 8px; flex-wrap: wrap; }
        .file-card { display: flex; align-items: center; gap: 6px; padding: 6px 10px; background: #2a2a2a; border: 1px solid #3a3a3a; border-radius: 4px; cursor: grab; font-size: 12px; color: #ccc; user-select: none; }
        .file-card:hover { border-color: #4a9eff; }
        .event-log { margin-bottom: 16px; }
        .log-controls { display: flex; gap: 8px; margin-bottom: 8px; }
        .log-controls button { padding: 4px 12px; background: #2a2a2a; border: 1px solid #3a3a3a; border-radius: 4px; color: #ccc; cursor: pointer; font-size: 11px; }
        .log-controls button:hover { border-color: #4a9eff; }
        #log { background: #252525; border: 1px solid #333; border-radius: 4px; padding: 8px; max-height: 200px; overflow-y: auto; font-family: monospace; font-size: 11px; }
        .demo-add-tab-btn { background: rgba(74, 158, 255, 0.15); color: rgb(74, 158, 255); border: 1px solid rgba(74, 158, 255, 0.3); border-radius: 4px; width: 24px; height: 24px; font-size: 14px; cursor: pointer; display: flex; align-items: center; justify-content: center; flex-shrink: 0; margin: 4px; }
        .demo-add-tab-btn:hover { background: rgba(74, 158, 255, 0.3); }
        tab-grid { flex: 1; }
      </style>

      <div class="tabs-demo">
        <h1>Openp41ge <span>Tabs</span></h1>
        <p>VS Code-style editor groups using &lt;tab-grid&gt;. Drag tabs to column edges to split, between columns to rearrange, or across grids to move between groups.</p>

        <div class="grid-row">
          <div class="editor-wrapper">
            <tab-grid id="editor-grid"></tab-grid>
            <button class="demo-add-tab-btn" data-win-id="editor" data-col="0">+</button>
          </div>
          <div class="side-grid">
            <tab-grid id="side-grid-a" class="side-grid"></tab-grid>
            <button class="demo-add-tab-btn" data-win-id="side-a" data-col="0">+</button>
          </div>
        </div>

        <div class="demo-section">
          <h2>File Explorer <small>drag files onto the editor grid</small></h2>
          <div class="file-explorer">
            <div class="file-card" draggable="true" data-filepath="src/app.ts"><span class="file-icon">${unsafeHTML(fileIcon("app.ts"))}</span><span class="file-name">app.ts</span></div>
            <div class="file-card" draggable="true" data-filepath="src/utils.ts"><span class="file-icon">${unsafeHTML(fileIcon("utils.ts"))}</span><span class="file-name">utils.ts</span></div>
            <div class="file-card" draggable="true" data-filepath="README.md"><span class="file-icon">${unsafeHTML(fileIcon("README.md"))}</span><span class="file-name">README.md</span></div>
          </div>
        </div>

        <div class="event-log">
          <h2>Event Log</h2>
          <div class="log-controls">
            <button id="btn-clear-log">Clear</button>
            <button id="btn-reset">Reset Demo</button>
          </div>
          <div id="log">Waiting for events…</div>
        </div>
      </div>
    `;
  }
}

// ─── Storybook stories ────────────────────────────────────────────────

const meta: Meta = {
  title: "Components/TabGrid",
  component: "tabs-demo-app",
  parameters: { layout: "fullscreen" },
};

export default meta;
type Story = StoryObj;

export const MultiGridDemo: Story = {
  render: () => html`<tabs-demo-app></tabs-demo-app>`,
};
