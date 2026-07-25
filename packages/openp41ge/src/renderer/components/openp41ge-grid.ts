/**
 * <openp41ge-grid> — single-row column-based pane grid (Lit).
 *
 * Renders cells, handles, tab bars, and tab content using Lit template.
 * Column resize is delegated to ColumnResizeController for local-only
 * flex updates during drag, with a single IPC sync on mouseup.
 *
 * Operates at the window level — no worksets.
 */

import { LitElement, html, nothing, type TemplateResult } from "lit";
import { property } from "lit/decorators.js";
import type { Tab, Window, TabPlacement } from "../../layout/types";
import { getWorkspace, appServices } from "../app";
import { getController, registerController } from "../controllers/registry";
import { PlaceholderController } from "../controllers/placeholder-controller";
import type { TabController } from "../controllers/types";
import { getAppTypeRegistration } from "../apps/app-registry";

import { ColumnResizeController, type ResizeHost } from "../lit/column-resize-controller";
import type { IDragHandler, IDragSource } from "../interfaces/drag-handler";
import { Openp41geTabDragSource } from "../services/drag-sources/tab-drag-source";

// ─── Module-level remote ghost state ────────────────────────────────────

let _remoteGhostActive = false;

// ═══════════════════════════════════════════════════════════════════════════
// Openp41geGrid component
// ═══════════════════════════════════════════════════════════════════════════

class Openp41geGrid extends LitElement implements ResizeHost {
  protected createRenderRoot(): HTMLElement | DocumentFragment {
    return this;
  }

  @property({ attribute: false })
  winId = "";

  @property({ attribute: false })
  pageData: Window | null = null;

  private _ctxMenu: { x: number; y: number; row: number; col: number } | null = null;

  /** @internal used by FileOpenHandler */
  _lastActiveCellCol = 0;
  /** @internal used by FileOpenHandler — NOT overwritten by render */
  _focusedCol = 0;

  /**
   * Drag handler for dependency injection.
   * Default: undefined (existing TabDragHandler/GridDragHandler still used).
   * Tests: set to TestDragHandler via page.evaluate().
   */
  dragHandler: IDragHandler | null = null;
  /** Per-column tab focus history */
  _tabFocusHistory: Map<number, string[]> = new Map();
  /** Stack of recently focused column indices, most recent first (excluding current). Used to restore focus when a cell is closed. */
  _focusHistory: number[] = [];

  // ═══ ColumnResizeController host implementation ═══════════════════════

  /** Implement ResizeHost.gridElement — the grid itself for bounding rect. */
  get gridElement(): HTMLElement {
    return this;
  }

  /** Implement ResizeHost.dispatchCommand — wraps command bus. */
  dispatchCommand(fn: string, ...args: unknown[]): void {
    appServices.commandBus.dispatch(fn, ...args);
  }

  /** Implement ResizeHost.getCells — returns cell elements in the grid. */
  getCells(): HTMLElement[] {
    return Array.from(this.children).filter(
      (el) =>
        el instanceof HTMLDivElement &&
        !el.classList.contains("openp41ge-ghost-overlay") &&
        !el.classList.contains("openp41ge-grid-handle"),
    ) as HTMLElement[];
  }

  /** Implement ResizeHost.columns */
  get columns(): number {
    return this.pageData?.grid.cols ?? 0;
  }

  /** Implement ResizeHost.openp41geId */
  get openp41geId(): string {
    return this.winId ?? "";
  }

  private _resizeController = new ColumnResizeController(this);

  // ═══ Constructor ──────────────────────────────────────────────────────

  constructor() {
    super();
    this._ensureGridStyle();
  }

  private _ensureGridStyle(): void {
    if (document.getElementById("openp41ge-grid-focus-style")) return;
    const style = document.createElement("style");
    style.id = "openp41ge-grid-focus-style";
    style.textContent = `
      openp41ge-grid { display:flex; flex-direction:row; width:100%; height:100%; position:relative; }
      .openp41ge-grid-cell { position:relative; }
      .openp41ge-grid-handle {
        flex:none;width:1px;height:100%;
        cursor:col-resize;position:relative;z-index:10;
        background:#333;background-clip:content-box;
      }
      .openp41ge-grid-handle::after {
        content:'';position:absolute;
        left:-1px;top:0;
        width:3px;height:100%;
        background:transparent;
        transition:background 0.1s;
        pointer-events:none;
      }
      .openp41ge-grid-handle:hover::after,
      .openp41ge-grid-handle.active::after {
        background:rgba(74,158,255,0.35);
      }
    `;
    document.head.appendChild(style);
  }

  // ═══ Lifecycle ─────────────────────────────────────────────────────────

  connectedCallback(): void {
    super.connectedCallback();
    appServices.quoteController.start();

    window.openp41ge.drag.onGhostShow((data) => this._onRemoteGhostShow(data));
    window.openp41ge.drag.onGhostHide(() => this._onRemoteGhostHide());

    this.addEventListener("dragover", this._onFileDragOver);
    this.addEventListener("dragleave", this._onFileDragLeave);
    this.addEventListener("drop", this._onFileDrop);

    this.oncontextmenu = (e) => {
      if (e.target instanceof HTMLElement && e.target.closest("[data-pane-id]")) return;
      // Don't show grid menu when right-clicking on tab bar elements
      if (e.target instanceof HTMLElement && e.target.closest(".cell-tab-bar")) return;
      e.preventDefault();
      e.stopPropagation();
      const rect = this.getBoundingClientRect();
      const columns = this.pageData?.grid.cols ?? 1;
      const colW = columns > 0 ? rect.width / columns : rect.width;
      const col = Math.floor((e.clientX - rect.left) / colW);
      this._ctxMenu = {
        x: e.screenX,
        y: e.screenY,
        row: 0,
        col: Math.max(0, Math.min(col, columns)),
      };
      void this._renderCtxMenu();
    };
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this.removeEventListener("dragover", this._onFileDragOver);
    this.removeEventListener("dragleave", this._onFileDragLeave);
    this.removeEventListener("drop", this._onFileDrop);
  }

  updated(): void {
    // Post-process: italicize tab labels for preview mode
    const cells = this.getCells();
    for (const cell of cells) {
      const tabbar = cell.querySelector("openp41ge-cell-tabbar");
      if (!tabbar) continue;
      const labelEls = tabbar.querySelectorAll("[data-tab-id]");
      for (const label of labelEls) {
        if (!(label instanceof HTMLElement)) continue;
        const tid = label.dataset.tabId;
        const tab = tid ? this.getTab(tid) : undefined;
        label.style.fontStyle = tab && tab.isPreview ? "italic" : "";
      }
    }

    // Track focus history
    const win = this.pageData;
    if (win) {
      const p = win.grid.placements;
      for (let i = p.length - 1; i >= 0; i--) {
        const pl = p[i];
        if (pl.activeTabId) {
          this._trackTabFocus(pl.position.col, pl.activeTabId as string);
          break;
        }
      }
    }
    this._clampFocusedCol();
    this._updateCellFocus(this._focusedCol);
  }

  private _clampFocusedCol(): void {
    const win = this.pageData;
    if (!win) return;
    const maxCol = win.grid.cols - 1;
    if (maxCol < 0) return;
    if (this._focusedCol > maxCol) {
      while (this._focusHistory.length > 0) {
        const prev = this._focusHistory.pop()!;
        if (prev >= 0 && prev <= maxCol) {
          this._focusedCol = prev;
          this._lastActiveCellCol = prev;
          return;
        }
      }
      this._focusedCol = maxCol;
      this._lastActiveCellCol = maxCol;
    }
  }

  _setFocusedCol(col: number): void {
    if (this._focusedCol !== col && this._focusedCol >= 0) {
      this._focusHistory.push(this._focusedCol);
    }
    this._focusedCol = col;
    this._lastActiveCellCol = col;
    this._updateCellFocus(col);
  }

  // ═══ Render ────────────────────────────────────────────────────────────

  render(): TemplateResult | typeof nothing {
    const win = this.pageData;
    if (!win) return nothing;

    const columns = win.grid.cols;
    if (columns === 0) {
      return html`<div
        style="flex:1;display:flex;align-items:center;justify-content:center;color:#444;font-size:13px"
      ></div>`;
    }

    const dividers = win.grid.dividers.columns;
    const columnRatios = this._getColumnRatios(dividers, columns);

    const parts: TemplateResult[] = [];
    for (let col = 0; col < columns; col++) {
      const pl = win.grid.placements.find((p) => p.position.row === 0 && p.position.col === col);
      const activeTabId = pl?.activeTabId ?? pl?.tabIds[0] ?? null;
      const tab = activeTabId ? this.getTab(activeTabId as string) : undefined;

      parts.push(html`
        <div
          class="openp41ge-grid-cell"
          style="flex:${columnRatios[col]};min-width:0;height:100%;display:flex;flex-direction:column;position:relative;"
          @mousedown=${() => this._onCellMouseDown(col)}
          @cell-tab:pin=${(e: CustomEvent) => {
            const { winId, tabId, col } = e.detail;
            appServices.commandBus.dispatch("pinTabInCell", winId, col, tabId);
          }}
        >
          ${tab ? this._renderCellContent(pl!, tab, col, win.id) : this._renderEmptyCell(col)}
        </div>
      `);

      if (col < columns - 1) {
        parts.push(html`
          <div
            class="openp41ge-grid-handle"
            @mousedown=${(e: MouseEvent) => {
              this._resizeController.startResize(e, col, dividers);
            }}
          ></div>
        `);
      }
    }

    return html`${parts}`;
  }

  private _renderCellContent(
    placement: TabPlacement,
    tab: Tab,
    col: number,
    winId: string,
  ): TemplateResult {
    const controller = this._ensureControllerForTab(tab);

    return html`
      <openp41ge-cell-tabbar
        .data=${{
          tabIds: placement.tabIds,
          activeTabId: placement.activeTabId,
          getTab: (id: string) => this.getTab(id),
          winId: this.winId,
          col,
        }}
        @cell-tab:activate=${(e: CustomEvent) => {
          const { winId, tabId, col: eventCol } = e.detail;
          this._trackTabFocus(eventCol ?? this._lastActiveCellCol, tabId);
          appServices.commandBus.dispatch("activateTabInCell", winId, tabId);
        }}
        @cell-tab:close=${(e: CustomEvent) => {
          const { winId, tabId } = e.detail;
          const colIdx = this._lastActiveCellCol;
          const nextTabId = this._getNextTabForCell(colIdx, tabId);
          if (nextTabId) {
            appServices.commandBus.dispatch("removeTabFromCell", winId, tabId, nextTabId);
          } else {
            appServices.commandBus.dispatch("removeTabFromCell", winId, tabId);
          }
        }}
      ></openp41ge-cell-tabbar>
      <openp41ge-tab-content
        .winId=${this.winId}
        .pageId=${winId}
        .controller=${controller}
        .tabData=${tab}
        .onTabMouseDown=${(e: MouseEvent, pid: string) => this.handlePaneMouseDown(e, pid)}
      ></openp41ge-tab-content>
    `;
  }

  private _renderEmptyCell(col: number): TemplateResult {
    const quote = appServices.quoteController.getQuote(col);
    return html`
      <div style="flex:1;display:flex;align-items:center;justify-content:center;padding:0 16px;">
        <span
          class="openp41ge-empty-quote"
          data-col=${col}
          style="color:#444;font-size:13px;font-style:italic;text-align:center;line-height:1.4;transition:opacity 0.35s ease;user-select:none;"
          >“${quote}”</span
        >
      </div>
    `;
  }

  // ═══ Column ratios ─────────────────────────────────────────────────────

  private _getColumnRatios(dividers: number[], columns: number): number[] {
    if (columns <= 1) return [1];
    const ratios: number[] = [];
    for (let i = 0; i < columns; i++) {
      if (i === 0) ratios.push(dividers[0]);
      else if (i === columns - 1) ratios.push(1 - dividers[i - 1]);
      else ratios.push(dividers[i] - dividers[i - 1]);
    }
    return ratios;
  }

  // ═══ Tab / controller helpers ──────────────────────────────────────────

  getTab(tabId: string): Tab | undefined {
    const ws = getWorkspace();
    if (!ws) return undefined;
    const tabs = ws.tabs as unknown as Record<string, Tab | undefined>;
    return tabs[tabId] ?? undefined;
  }

  _ensureControllerForTab(tab: Tab): TabController {
    const existing = getController(tab.id);
    if (existing) return existing;

    const appReg = getAppTypeRegistration(tab.appType);
    if (appReg?.createController) {
      const ctrl = appReg.createController(tab.id);
      registerController(ctrl);

      // Restore persisted state from tab config (e.g., filePath for file-editor)
      // so that mount() can load the correct content.
      if (tab.config && Object.keys(tab.config).length > 0) {
        ctrl.restore({ ...tab.config });
      }

      return ctrl;
    }
    const ctrl = new PlaceholderController(tab.id, tab.appType);
    registerController(ctrl);
    return ctrl;
  }

  handlePaneMouseDown(e: MouseEvent, paneId: string): void {
    if (this.dragHandler) {
      const tab = this.getTab(paneId);
      const label = tab?.title ?? tab?.appType ?? "Pane";
      const source: IDragSource = new Openp41geTabDragSource(
        e.currentTarget as HTMLElement,
        paneId,
        this.winId,
        this.pageData?.id ?? "",
        label,
      );
      this.dragHandler.startDrag(source, e.clientX, e.clientY);
      return;
    }

    appServices.gridDragHandler.handlePaneMouseDown(
      e,
      paneId,
      this,
      (id: string) => this.getTab(id),
      () => {
        const ws = getWorkspace();
        return ws ? (ws.tabs as unknown as Record<string, Tab | undefined>) : {};
      },
    );
  }

  // ═══ Cell focus ────────────────────────────────────────────────────────

  private _onCellMouseDown(col: number): void {
    if (this._focusedCol !== col && this._focusedCol >= 0) {
      this._focusHistory.push(this._focusedCol);
    }
    this._lastActiveCellCol = col;
    this._focusedCol = col;
    this._updateCellFocus(col);
  }

  _updateCellFocus(col: number): void {
    const cells = this.getCells();
    for (let c = 0; c < cells.length; c++) {
      cells[c].classList.toggle("openp41ge-grid-cell-focused", c === col);
    }
  }

  _clearFocus(): void {
    const cells = this.querySelectorAll(".openp41ge-grid-cell-focused");
    for (const cell of cells) {
      cell.classList.remove("openp41ge-grid-cell-focused");
    }
  }

  // ═══ Tab focus history ─────────────────────────────────────────────────

  _trackTabFocus(col: number, tabId: string): void {
    let history = this._tabFocusHistory.get(col);
    if (!history) {
      history = [];
      this._tabFocusHistory.set(col, history);
    }
    const idx = history.indexOf(tabId);
    if (idx !== -1) history.splice(idx, 1);
    history.push(tabId);
    while (history.length > 20) history.shift();
  }

  _getNextTabForCell(col: number, closedTabId: string): string | null {
    const history = this._tabFocusHistory.get(col);
    if (!history || history.length === 0) return null;
    const win = this.pageData;
    if (!win) return null;
    const placement = win.grid.placements.find(
      (p) => p.position.row === 0 && p.position.col === col,
    );
    if (!placement) return null;
    const remainingTabIds: string[] = placement.tabIds.filter((id) => id !== closedTabId);
    if (remainingTabIds.length === 0) return null;
    if (remainingTabIds.length === 1) return remainingTabIds[0];
    for (let i = history.length - 1; i >= 0; i--) {
      const tid = history[i];
      if (tid === closedTabId) continue;
      if ((remainingTabIds as unknown[]).includes(tid)) return tid;
    }
    return remainingTabIds[0];
  }

  // ═══ Remote ghost (cross-window drag) ──────────────────────────────────

  private _onRemoteGhostShow(data: { paneId: string; screenX: number; screenY: number }): void {
    if (data.paneId.startsWith("__openp41ge__")) return;
    const win = this.pageData;
    if (!win) return;
    const g = win.grid;
    if (g.cols === 0) return;

    const clientX = data.screenX - window.screenX;
    const gridRect = this.getBoundingClientRect();
    const localX = clientX - gridRect.left;
    if (localX < 0 || localX > gridRect.width) return;

    const ghostCols = g.placements.length > 0 ? g.cols + 1 : g.cols;
    const colWidth = gridRect.width / ghostCols;
    const colPos = localX / colWidth;
    const targetCol = Math.min(Math.floor(colPos), ghostCols - 1);

    const columnFlex = (() => {
      const cells = this.querySelectorAll(".openp41ge-grid-cell");
      const result: number[] = [];
      for (const cell of cells) {
        const flex = (cell as HTMLElement).style.flex;
        const ratio = flex ? parseFloat(flex) : 1 / g.cols;
        result.push(isNaN(ratio) ? 1 / g.cols : ratio);
      }
      return result;
    })();

    appServices.ghostRenderer.showGhost(this, {
      cols: ghostCols,
      activeCol: targetCol,
      columnFlex,
    });
    _remoteGhostActive = true;
  }

  private _onRemoteGhostHide(): void {
    if (_remoteGhostActive) {
      appServices.ghostRenderer.hideGhost(this);
      _remoteGhostActive = false;
    }
  }

  // ═══ File-tree drag-and-drop ──────────────────────────────────────────

  private _onFileDragOver = (e: DragEvent): void => {
    appServices.fileDropHandler.handleDragOver(e, this);
  };

  private _onFileDragLeave = (e: DragEvent): void => {
    appServices.fileDropHandler.handleDragLeave(e, this);
  };

  private _onFileDrop = (e: DragEvent): void => {
    appServices.fileDropHandler.handleDrop(e, this);
  };

  // ═══ Context menu ─────────────────────────────────────────────────────

  async _renderCtxMenu(): Promise<void> {
    if (!this._ctxMenu || !this.pageData) return;
    await appServices.contextMenuBuilder.showContextMenu(
      this._ctxMenu.x,
      this._ctxMenu.y,
      this._ctxMenu.row,
      this._ctxMenu.col,
      this,
    );
    this._ctxMenu = null;
  }
}

customElements.define("openp41ge-grid", Openp41geGrid);
