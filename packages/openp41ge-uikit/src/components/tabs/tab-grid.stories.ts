/**
 * TabGrid stories — demonstrates <tab-grid> with multi-grid drag-and-drop.
 */

import { html, LitElement, type TemplateResult } from "lit";
import { customElement, query } from "lit/decorators.js";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import type { Meta, StoryObj } from "@storybook/web-components";
import "openp41ge-uikit";
import {
  DragOrchestrator,
  TabDragSource,
  GhostManager,
  type IDragSource,
} from "openp41ge-uikit";

// ─── Tab data helpers ─────────────────────────────────────────────────

interface TabData {
  id: string;
  title: string;
  content: string;
  pinned?: boolean;
}

let _tabCounter = 0;
function createTabId(): string {
  return "tab-" + ++_tabCounter;
}

// ─── Grid state — mirrors the original demo logic ────────────────────

class GridState {
  constructor(
    public winId: string,
    public cols = 1,
    public tabs: Record<string, { title: string; content: string; pinned?: boolean }> = {},
    public activeTabIds: Record<string, string> = {},
    public placements: Array<{ position: { row: number; col: number }; tabIds: string[] }> = [],
  ) {}

  static from(winId: string, initialTabs: TabData[]): GridState {
    const s = new GridState(winId);
    const tabIds: string[] = [];
    for (const tab of initialTabs) {
      s.tabs[tab.id] = { title: tab.title, content: tab.content, pinned: tab.pinned ?? true };
      tabIds.push(tab.id);
    }
    s.placements.push({ position: { row: 0, col: 0 }, tabIds });
    if (tabIds.length > 0) s.activeTabIds["0"] = tabIds[0];
    return s;
  }

  setActive(col: number, tabId: string): void {
    this.activeTabIds[String(col)] = tabId;
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
    const tab: TabData = { id: createTabId(), title, content, pinned: false };
    this.insertTab(tab, col, -1);
    return tab;
  }

  /** Remove a tab by id. Returns the removed record, or null. */
  removeTab(tabId: string): { title: string; content: string; pinned?: boolean } | null {
    for (let ci = 0; ci < this.placements.length; ci++) {
      const p = this.placements[ci];
      const idx = p.tabIds.indexOf(tabId);
      if (idx >= 0) {
        const tab = this.tabs[tabId];
        p.tabIds.splice(idx, 1);
        if (this.activeTabIds[String(ci)] === tabId) {
          const next = p.tabIds[Math.min(idx, p.tabIds.length - 1)] || null;
          if (next) this.activeTabIds[String(ci)] = next;
          else delete this.activeTabIds[String(ci)];
        }
        if (p.tabIds.length === 0 && this.placements.length > 1) {
          this.placements.splice(ci, 1);
          this.cols = this.placements.length;
          this.placements.forEach((pp, i) => { pp.position.col = i; });
          const newActive: Record<string, string> = {};
          for (const [k, v] of Object.entries(this.activeTabIds)) {
            const ki = parseInt(k, 10);
            if (ki < ci) newActive[k] = v;
            else if (ki > ci) newActive[String(ki - 1)] = v;
          }
          this.activeTabIds = newActive;
        }
        return tab || null;
      }
    }
    return null;
  }

  /** Insert a tab into an existing column. */
  insertTab(tab: TabData, col: number, index: number): void {
    this.tabs[tab.id] = { title: tab.title, content: tab.content, pinned: tab.pinned ?? true };
    let p = this.placements.find((p) => p.position.col === col);
    if (!p) {
      p = { position: { row: 0, col }, tabIds: [] };
      this.placements.push(p);
      this.placements.sort((a, b) => a.position.col - b.position.col);
      this.cols = this.placements.length;
    }
    const insertAt = index >= 0 ? Math.min(index, p.tabIds.length) : p.tabIds.length;
    p.tabIds.splice(insertAt, 0, tab.id);
    this.activeTabIds[String(col)] = tab.id;
  }

  /** Insert a tab, splitting the column to create a new one. */
  insertTabInSplit(tab: TabData, splitCol: number, splitLeft: boolean): void {
    this.tabs[tab.id] = { title: tab.title, content: tab.content, pinned: tab.pinned ?? true };
    const splitIdx = this.placements.findIndex((p) => p.position.col === splitCol);
    if (splitIdx < 0) return;
    const newCol = splitLeft ? splitCol : splitCol + 1;
    const newPlacement = { position: { row: 0, col: newCol }, tabIds: [tab.id] };
    if (splitLeft) {
      this.placements.splice(splitIdx, 0, newPlacement);
    } else {
      this.placements.splice(splitIdx + 1, 0, newPlacement);
    }
    this.placements.forEach((p, i) => { p.position.col = i; });
    this.cols = this.placements.length;
    this.activeTabIds = {};
    this.placements.forEach((p, i) => {
      if (p.tabIds.length > 0) this.activeTabIds[String(i)] = p.tabIds[0];
    });
  }


}

// ─── Icons ────────────────────────────────────────────────────────────

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

// ─── Demo app ─────────────────────────────────────────────────────────

@customElement("tabs-demo-app")
class TabsDemoApp extends LitElement {
  override createRenderRoot(): HTMLElement | ShadowRoot {
    return this;
  }

  private _editorState = GridState.from("editor", [
    { id: createTabId(), title: "README.md", content: '<div class="content-placeholder"><h3>README.md</h3><p>Welcome! Drag tabs to edges to create new columns.</p></div>' },
    { id: createTabId(), title: "index.js", content: '<div class="content-placeholder"><h3>index.js</h3><pre style="background:#252526;padding:12px;border-radius:4px;color:#7ecb8e;">const grid = document.querySelector("tab-grid");</pre></div>' },
  ]);

  private _sideState = GridState.from("side-a", [
    { id: createTabId(), title: "Terminal", content: '<div class="content-placeholder"><h3>Terminal</h3><p>$ git status</p></div>' },
  ]);

  private _outputState = GridState.from("side-b", [
    { id: createTabId(), title: "Output", content: '<div class="content-placeholder"><h3>Output</h3><p style="color:#888;">Build output appears here.</p></div>' },
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

  @query("#editor-grid")
  private _editorGrid!: any;

  @query("#side-grid-a")
  private _sideGrid!: any;

  @query("#side-grid-b")
  private _outputGrid!: any;

  // ── Lifecycle ────────────────────────────────────────────────────

  override firstUpdated(): void {
    this._orchestrator = new DragOrchestrator(this._targetResolver);
    this._renderAll();

    // ── File explorer drag ────────────────────────────────────────
    this.querySelectorAll(".file-card").forEach((card) => {
      card.addEventListener("dragstart", (e: Event) => {
        const de = e as DragEvent;
        de.dataTransfer?.setData("text/plain", (card as HTMLElement).dataset.filepath || "");
      });
    });

    // ── Tab drag start (mousedown on [role='tab']) ────────────────
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

    // ── Ghost overlay during drag ─────────────────────────────────
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

    // ── Clear ghost on mouseup ────────────────────────────────────
    document.addEventListener("mouseup", () => {
      if (this._ghostShownGrid) {
        this._ghostManager.hideGhost(this._ghostShownGrid);
        this._ghostShownGrid = null;
      }
    });

    // ── GRID EVENTS — handle actual drops ─────────────────────────
    document.addEventListener("grid-split", (e: any) => {
      const { sourceWinId, winId, tabId, splitCol, splitLeft } = e.detail;
      const source = this._state(sourceWinId);
      const target = this._state(winId);
      if (!source || !target) return;
      const removed = source.removeTab(tabId);
      if (!removed) return;
      target.insertTabInSplit({ id: tabId, title: removed.title, content: removed.content }, splitCol, splitLeft);
      this._renderAll();
    });

    document.addEventListener("grid-move", (e: any) => {
      const { sourceWinId, tabId, targetWinId, targetCol } = e.detail;
      const source = this._state(sourceWinId);
      const target = this._state(targetWinId);
      if (!source || !target) return;
      const removed = source.removeTab(tabId);
      if (!removed) return;
      target.insertTab({ id: tabId, title: removed.title, content: removed.content }, targetCol, -1);
      this._renderAll();
    });

    document.addEventListener("grid-activate", (e: any) => {
      const { winId, col, tabId } = e.detail;
      const state = this._state(winId);
      if (!state) return;
      state.setActive(col, tabId);
      this._renderAll();
    });

    document.addEventListener("grid-open-tab", (e: any) => {
      const { winId, tabConfig, targetCol, isBoundary, splitCol, splitLeft, insertAt } = e.detail;
      const filePath = tabConfig.filePath || tabConfig.repoName || "untitled";
      const state = this._state(winId);
      if (!state) return;
      if (isBoundary) {
        const tab = { id: createTabId(), title: filePath, content: `<div class="content-placeholder"><h3>${filePath}</h3><p>Opened file.</p></div>`, pinned: true };
        state.insertTabInSplit(tab, splitCol, splitLeft);
      } else {
        const tab = { id: createTabId(), title: filePath, content: `<div class="content-placeholder"><h3>${filePath}</h3><p>Opened file.</p></div>`, pinned: true };
        const idx = insertAt != null && insertAt >= 0 ? insertAt : -1;
        state.insertTab(tab, targetCol, idx);
      }
      this._renderAll();
    });

    // ── TAB-BAR EVENTS — handle drops on tab bars ─────────────
    document.addEventListener("tab-bar-move-cell", (e: any) => {
      const { sourceWinId, tabId, targetWinId, targetCol, dropIndex } = e.detail;
      const source = this._state(sourceWinId);
      const target = this._state(targetWinId);
      if (!source || !target) return;
      const removed = source.removeTab(tabId);
      if (!removed) return;
      target.insertTab({ id: tabId, title: removed.title, content: removed.content }, targetCol, dropIndex);
      this._renderAll();
    });

    document.addEventListener("tab-bar-reorder", (e: any) => {
      const { winId, col, fromIndex, toIndex } = e.detail;
      const state = this._state(winId);
      if (!state) return;
      const placement = state.placements.find((p) => p.position.col === col);
      if (!placement) return;
      const [moved] = placement.tabIds.splice(fromIndex, 1);
      placement.tabIds.splice(toIndex, 0, moved);
      this._renderAll();
    });

    // ── Add tab buttons ──────────────────────────────────────────
    this.querySelectorAll(".demo-add-tab-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const winId = (btn as HTMLElement).dataset.winId || "editor";
        const col = parseInt((btn as HTMLElement).dataset.col || "0", 10);
        const state = this._state(winId);
        if (!state) return;
        state.addTab(col, "New Tab", '<div class="content-placeholder"><h3>New Tab</h3><p>Added from + button.</p></div>');
        this._renderAll();
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
      const state = this._state(tabBar.winId);
      if (!state) return;
      state.removeTab(tabId);
      this._renderAll();
    });

    // ── Reset ────────────────────────────────────────────────────
    this.querySelector("#btn-reset")?.addEventListener("click", () => {
      _tabCounter = 0;
      this._editorState = GridState.from("editor", [
        { id: createTabId(), title: "README.md", content: '<div class="content-placeholder"><h3>README.md</h3><p>Welcome! Drag tabs to edges to create new columns.</p></div>' },
        { id: createTabId(), title: "index.js", content: '<div class="content-placeholder"><h3>index.js</h3><pre style="background:#252526;padding:12px;border-radius:4px;color:#7ecb8e;">const grid = document.querySelector("tab-grid");</pre></div>' },
      ]);
      this._sideState = GridState.from("side-a", [
        { id: createTabId(), title: "Terminal", content: '<div class="content-placeholder"><h3>Terminal</h3><p>$ git status</p></div>' },
      ]);
      this._outputState = GridState.from("side-b", [
        { id: createTabId(), title: "Output", content: '<div class="content-placeholder"><h3>Output</h3><p style="color:#888;">Build output appears here.</p></div>' },
      ]);
      this._renderAll();
    });
  }

  private _state(winId: string): GridState | null {
    if (winId === "editor") return this._editorState;
    if (winId === "side-a") return this._sideState;
    if (winId === "side-b") return this._outputState;
    return null;
  }

  private _renderAll(): void {
    this._editorState.applyTo(this._editorGrid);
    this._sideState.applyTo(this._sideGrid);
    this._outputState.applyTo(this._outputGrid);
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
        .bottom-grids { display: flex; gap: 12px; }
        .bottom-grid { flex: 1; min-height: 150px; display: flex; flex-direction: column; }
        .demo-section { margin-bottom: 16px; }
        .demo-section h2 { font-size: 13px; margin: 0 0 8px; color: #aaa; }
        h2 small { font-weight: normal; font-size: 11px; color: #666; margin-left: 8px; }
        .file-explorer { display: flex; gap: 8px; flex-wrap: wrap; }
        .file-card { display: flex; align-items: center; gap: 6px; padding: 6px 10px; background: #2a2a2a; border: 1px solid #3a3a3a; border-radius: 4px; cursor: grab; font-size: 12px; color: #ccc; user-select: none; }
        .file-card:hover { border-color: #4a9eff; }
        .demo-add-tab-btn { background: rgba(74, 158, 255, 0.15); color: rgb(74, 158, 255); border: 1px solid rgba(74, 158, 255, 0.3); border-radius: 4px; width: 24px; height: 24px; font-size: 14px; cursor: pointer; display: flex; align-items: center; justify-content: center; flex-shrink: 0; margin: 4px; }
        .demo-add-tab-btn:hover { background: rgba(74, 158, 255, 0.3); }
        tab-grid { flex: 1; }
      </style>

      <div class="tabs-demo">
        <h1>Openp41ge <span>Tabs</span></h1>
        <p>VS Code-style editor groups. Drag tabs to column edges to split, across columns to rearrange, or between grids to move between groups.</p>

        <div class="grid-row">
          <div class="editor-wrapper">
            <tab-grid id="editor-grid"></tab-grid>
            <button class="demo-add-tab-btn" data-win-id="editor" data-col="0">+</button>
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

        <div class="bottom-grids">
          <div class="bottom-grid">
            <tab-grid id="side-grid-a"></tab-grid>
            <button class="demo-add-tab-btn" data-win-id="side-a" data-col="0">+</button>
          </div>
          <div class="bottom-grid">
            <tab-grid id="side-grid-b"></tab-grid>
            <button class="demo-add-tab-btn" data-win-id="side-b" data-col="0">+</button>
          </div>
        </div>

        <div style="margin-top:8px;">
          <button id="btn-reset" style="padding:4px 12px;background:#2a2a2a;border:1px solid #3a3a3a;border-radius:4px;color:#ccc;cursor:pointer;font-size:11px;">Reset Demo</button>
        </div>
      </div>
    `;
  }
}

// ─── Single grid demo ──────────────────────────────────────────────────

@customElement("single-grid-demo")
class SingleGridApp extends LitElement {
  override createRenderRoot(): HTMLElement | ShadowRoot {
    return this;
  }

  private _state = GridState.from("editor", [
    { id: createTabId(), title: "README.md", content: '<div class="content-placeholder"><h3>README.md</h3><p>A single grid. Drag tabs to column edges to split.</p></div>' },
    { id: createTabId(), title: "index.js", content: '<div class="content-placeholder"><h3>index.js</h3><pre style="background:#252526;padding:12px;border-radius:4px;color:#7ecb8e;">const x = 1;</pre></div>' },
    { id: createTabId(), title: "style.css", content: '<div class="content-placeholder"><h3>style.css</h3><pre style="background:#252526;padding:12px;border-radius:4px;color:#7ecb8e;">body { background: #1e1e1e; }</pre></div>' },
  ]);

  // ── Drag state ─────────────────────────────────────────────────

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

  @query("#single-grid")
  private _gridEl!: any;

  override firstUpdated(): void {
    this._orchestrator = new DragOrchestrator(this._targetResolver);
    this._state.applyTo(this._gridEl);

    // ── Tab drag start ───────────────────────────────────────────
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

    // ── Ghost overlay ────────────────────────────────────────────
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

    // ── Clear ghost ──────────────────────────────────────────────
    document.addEventListener("mouseup", () => {
      if (this._ghostShownGrid) {
        this._ghostManager.hideGhost(this._ghostShownGrid);
        this._ghostShownGrid = null;
      }
    });

    // ── Grid events ────────────────────────────────────────────
    document.addEventListener("grid-split", (e: any) => {
      const { sourceWinId, winId, tabId, splitCol, splitLeft } = e.detail;
      if (sourceWinId !== "editor") return;
      const removed = this._state.removeTab(tabId);
      if (!removed) return;
      this._state.insertTabInSplit({ id: tabId, title: removed.title, content: removed.content }, splitCol, splitLeft);
      this._render();
    });

    document.addEventListener("grid-move", (e: any) => {
      const { sourceWinId, tabId, targetCol } = e.detail;
      if (sourceWinId !== "editor") return;
      const removed = this._state.removeTab(tabId);
      if (!removed) return;
      this._state.insertTab({ id: tabId, title: removed.title, content: removed.content }, targetCol, -1);
      this._render();
    });

    document.addEventListener("grid-activate", (e: any) => {
      const { winId, col, tabId } = e.detail;
      if (winId !== "editor") return;
      this._state.setActive(col, tabId);
      this._render();
    });

    document.addEventListener("tab-bar-move-cell", (e: any) => {
      const { sourceWinId, tabId, targetCol, dropIndex } = e.detail;
      if (sourceWinId !== "editor" && targetCol === undefined) return;
      const removed = this._state.removeTab(tabId);
      if (!removed) return;
      this._state.insertTab({ id: tabId, title: removed.title, content: removed.content }, targetCol, dropIndex);
      this._render();
    });

    document.addEventListener("tab-bar-reorder", (e: any) => {
      const { winId, col, fromIndex, toIndex } = e.detail;
      if (winId !== "editor") return;
      const placement = this._state.placements.find((p) => p.position.col === col);
      if (!placement) return;
      const [moved] = placement.tabIds.splice(fromIndex, 1);
      placement.tabIds.splice(toIndex, 0, moved);
      this._render();
    });

    // ── Add tab ──────────────────────────────────────────────────
    this.querySelector("#single-add-tab")?.addEventListener("click", () => {
      let col = 0;
      const lastIdx = this._state.placements.length - 1;
      if (lastIdx >= 0) col = this._state.placements[lastIdx].position.col;
      this._state.addTab(col, "New Tab", '<div class="content-placeholder"><h3>New Tab</h3></div>');
      this._render();
    });

    // ── Tab close ────────────────────────────────────────────────
    document.addEventListener("click", (e: Event) => {
      const closeBtn = (e.target as HTMLElement).closest(".tab-close");
      if (!closeBtn) return;
      const tabBar = closeBtn.closest("tab-bar") as any;
      if (!tabBar) return;
      const tabId = closeBtn.getAttribute("data-close-tab-id");
      if (!tabId || tabBar.winId !== "editor") return;
      this._state.removeTab(tabId);
      this._render();
    });

    // ── Reset ────────────────────────────────────────────────────
    this.querySelector("#single-reset")?.addEventListener("click", () => {
      _tabCounter = 0;
      this._state = GridState.from("editor", [
        { id: createTabId(), title: "README.md", content: '<div class="content-placeholder"><h3>README.md</h3><p>A single grid. Drag tabs to column edges to split.</p></div>' },
        { id: createTabId(), title: "index.js", content: '<div class="content-placeholder"><h3>index.js</h3><pre style="background:#252526;padding:12px;border-radius:4px;color:#7ecb8e;">const x = 1;</pre></div>' },
        { id: createTabId(), title: "style.css", content: '<div class="content-placeholder"><h3>style.css</h3><pre style="background:#252526;padding:12px;border-radius:4px;color:#7ecb8e;">body { background: #1e1e1e; }</pre></div>' },
      ]);
      this._render();
    });
  }

  private _render(): void {
    this._state.applyTo(this._gridEl);
  }

  override render(): TemplateResult {
    return html`
      <style>
        .single-demo {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          background: #1e1e1e;
          color: #ccc;
          padding: 16px;
          height: 100vh;
          box-sizing: border-box;
          display: flex;
          flex-direction: column;
        }
        .single-demo h2 {
          font-size: 14px;
          margin: 0 0 8px;
          color: #aaa;
        }
        .single-demo tab-grid {
          flex: 1;
          min-height: 200px;
        }
        .single-toolbar {
          display: flex;
          gap: 8px;
          margin-bottom: 8px;
        }
        .single-toolbar button {
          padding: 4px 12px;
          background: #2a2a2a;
          border: 1px solid #3a3a3a;
          border-radius: 4px;
          color: #ccc;
          cursor: pointer;
          font-size: 11px;
        }
        .single-toolbar button:hover {
          border-color: #4a9eff;
        }
      </style>

      <div class="single-demo">
        <div class="single-toolbar">
          <button id="single-add-tab">+ Add Tab</button>
          <button id="single-reset">Reset</button>
        </div>
        <tab-grid id="single-grid"></tab-grid>
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

export const SingleGridDemo: Story = {
  render: () => html`<single-grid-app></single-grid-app>`,
};
