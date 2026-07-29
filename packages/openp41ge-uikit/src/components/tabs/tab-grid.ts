/**
 * <tab-grid> — renders a grid of columns, each containing <tab-bar> and
 * <tab-content>. Handles boundary detection, ghost overlays, drop handling,
 * and pin state management.
 */

import { LitElement, html } from "lit";
import { property } from "lit/decorators.js";
import { GridDropTarget } from "../../tabs/targets/grid-drop-target";
import { GhostManager, type GhostPreview } from "../../tabs/ghost-manager";
import { computeDropTarget } from "../../tabs/boundary";
import type { IDragSource, TargetFeedback, GhostFactory } from "../../tabs/interfaces";
import type { TabBar } from "./tab-bar";
import type { TabContent } from "./tab-content";
import "./tab-bar";
import "./tab-content";

export interface GridState {
  winId: string;
  cols: number;
  placements: Array<{
    position: { row: number; col: number };
    tabIds: string[];
  }>;
  tabData: Record<string, { title: string; content: string; pinned?: boolean }>;
  activeTabIds: Record<string, string>;
}

export class TabGrid extends LitElement {
  @property({ type: String }) winId: string = "";
  @property({ type: Number }) cols: number = 1;
  @property({ type: Array }) placements: Array<{
    position: { row: number; col: number };
    tabIds: string[];
  }> = [];
  @property({ type: Object }) tabData: Record<
    string,
    { title: string; content: string; pinned?: boolean }
  > = {};
  @property({ type: Object }) activeTabIds: Record<string, string> = {};
  @property({ type: Function }) ghostFactory: GhostFactory | undefined = undefined;

  set gridState(state: GridState | null) {
    if (!state) return;
    this.winId = state.winId;
    this.cols = state.cols;
    this.placements = state.placements;
    this.tabData = state.tabData;
    this.activeTabIds = state.activeTabIds;
  }
  get gridState(): GridState | null {
    return {
      winId: this.winId,
      cols: this.cols,
      placements: this.placements,
      tabData: this.tabData,
      activeTabIds: this.activeTabIds,
    };
  }

  // Double-click detection for pinning unpinned tabs
  // Activation is immediate; the timer only tracks whether to pin on a second click.
  private _focusedCol: number = 0;
  private _pendingDblClickTabId: string = "";
  private _pendingDblClickTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly _DOUBLE_CLICK_DELAY = 300;

  private _dropTarget: GridDropTarget | null = null;
  private _ghostManager = new GhostManager();
  private _boundOnClick: ((e: MouseEvent) => void) | null = null;
  private _boundOnDragOver: ((e: DragEvent) => void) | null = null;
  private _boundOnDragLeave: ((e: DragEvent) => void) | null = null;
  private _boundOnDrop: ((e: DragEvent) => void) | null = null;
  private _boundOnGridSplit: ((e: Event) => void) | null = null;
  private _boundOnGridMove: ((e: Event) => void) | null = null;
  private _boundOnTabBarMoveCell: ((e: Event) => void) | null = null;
  private _boundOnTabBarReorder: ((e: Event) => void) | null = null;
  private _boundOnGridPin: ((e: Event) => void) | null = null;

  get dropTarget(): GridDropTarget | null {
    return this._dropTarget;
  }

  getBarForCol(col: number): TabBar | null {
    return this.renderRoot?.querySelector(`tab-bar[col="${col}"]`) as TabBar | null;
  }

  getContentForCol(col: number): TabContent | null {
    return this.renderRoot?.querySelector(`tab-content[col="${col}"]`) as TabContent | null;
  }

  mountController(tabId: string, element: HTMLElement): boolean {
    for (const p of this.placements) {
      if (p.tabIds.includes(tabId)) {
        const content = this.getContentForCol(p.position.col);
        if (content) return content.mountController(tabId, element);
        break;
      }
    }
    return false;
  }

  unmountController(tabId: string, element: HTMLElement): boolean {
    for (const p of this.placements) {
      if (p.tabIds.includes(tabId)) {
        const content = this.getContentForCol(p.position.col);
        if (content) return content.unmountController(tabId, element);
        break;
      }
    }
    return false;
  }

  getControllerContainer(tabId: string): HTMLElement | null {
    for (const p of this.placements) {
      if (p.tabIds.includes(tabId)) {
        const content = this.getContentForCol(p.position.col);
        if (content) return content.getControllerContainer(tabId);
        break;
      }
    }
    return null;
  }

  createRenderRoot() {
    return this;
  }

  firstUpdated() {
    this._setupDropTarget();
  }

  updated(changedProperties: Map<string, unknown>) {
    if (
      changedProperties.has("winId") ||
      changedProperties.has("cols") ||
      changedProperties.has("placements")
    ) {
      this._setupDropTarget();
    }
  }

  // The (this as X) casts are duck-type properties consumed by
  // the host application (openp41ge) via querySelector + Openp41geGridElement cast.
  private _setupDropTarget() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (this as any).pageData = {
      id: "tab-grid-" + this.winId,
      grid: {
        cols: this.cols,
        placements: this.placements.length > 0 ? this.placements : this._generatePlacements(),
      },
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (this as any).winId = this.winId;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (this as any)._lastActiveCellCol = 0;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (this as any)._getNextTabForCell = (col: number, tabId: string) => {
      const placement = this.placements[col];
      if (!placement) return undefined;
      const idx = placement.tabIds.indexOf(tabId);
      return placement.tabIds[idx + 1] || placement.tabIds[idx - 1];
    };

    this._dropTarget = new GridDropTarget(this, this.winId, null);
  }

  private _generatePlacements(): Array<{
    position: { row: number; col: number };
    tabIds: string[];
  }> {
    const result: Array<{
      position: { row: number; col: number };
      tabIds: string[];
    }> = [];
    for (let i = 0; i < this.cols; i++) {
      const existing = this.placements.find((p) => p.position.col === i);
      if (existing) {
        result.push(existing);
      } else {
        result.push({ position: { row: 0, col: i }, tabIds: [] });
      }
    }
    return result;
  }

  // ── Pin state management ─────────────────────────────────────────────

  private _setPinned(tabId: string, pinned: boolean): void {
    const current = this.tabData[tabId];
    if (current && (current.pinned ?? true) === pinned) return;
    if (current) {
      this.tabData = {
        ...this.tabData,
        [tabId]: { ...current, pinned },
      };
    }
  }

  // ── Tab click handler ────────────────────────────────────────────────

  private _handleTabClick(tabBtn: HTMLElement): void {
    const tabId = tabBtn.getAttribute("data-tab-id") || "";
    const tabBarEl = tabBtn.closest?.("tab-bar");
    if (!tabBarEl) return;

    const tabBarElement = tabBarEl as HTMLElement & { winId?: string; col?: number };
    const tabWinId = tabBarElement.winId || "";
    const tabCol = tabBarElement.col ?? 0;

    const tabData = this.tabData[tabId];
    const isUnpinned = tabData && (tabData.pinned ?? true) === false;

    if (isUnpinned) {
      // Second click on the same unpinned tab within the delay → pin it
      if (tabId === this._pendingDblClickTabId && this._pendingDblClickTimer) {
        clearTimeout(this._pendingDblClickTimer);
        this._pendingDblClickTimer = null;
        this._pendingDblClickTabId = "";
        this._setPinned(tabId, true);
        this.dispatchEvent(
          new CustomEvent("grid-pin", {
            bubbles: true,
            detail: { winId: tabWinId, tabId, pinned: true },
          }),
        );
        return;
      }

      // Clear any pending timer for a different tab
      if (this._pendingDblClickTimer) {
        clearTimeout(this._pendingDblClickTimer);
        this._pendingDblClickTimer = null;
      }

      // Start a timer; if no second click arrives, it silently expires
      this._pendingDblClickTabId = tabId;
      this._pendingDblClickTimer = setTimeout(() => {
        this._pendingDblClickTimer = null;
        this._pendingDblClickTabId = "";
      }, this._DOUBLE_CLICK_DELAY);
    }

    // Activate immediately (no delay)
    this.dispatchEvent(
      new CustomEvent("grid-activate", {
        bubbles: true,
        detail: { winId: tabWinId, tabId, col: tabCol },
      }),
    );

    // Focus this column
    this._focusedCol = tabCol;
    this.requestUpdate();

    // Scroll to the tab
    const bar = this.getBarForCol(tabCol);
    bar?.scrollToTab(tabId);
  }

  // ── Ghost overlay management ──────────────────────────────────────────

  showGhostOverlay(preview: GhostPreview) {
    this._ghostManager.showGhost(this, preview);
  }

  hideGhostOverlay() {
    this._ghostManager.hideGhost(this);
  }

  computeDropFeedback(
    clientX: number,
    clientY: number,
    dragSource: IDragSource,
  ): TargetFeedback | null {
    if (!this._dropTarget) return null;
    return this._dropTarget.onHover(dragSource, clientX, clientY);
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────

  connectedCallback() {
    super.connectedCallback();
    this.style.position = "relative";
    this._setupListeners();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._teardownListeners();
  }

  private _setupListeners(): void {
    // ── Tab click: activate ─────────────────────────────────
    this._boundOnClick = (e: MouseEvent) => {
      // Only match actual tab buttons (role="tab"), not content panes with data-tab-id
      const tabBtn = (e.target as HTMLElement).closest?.("[role='tab'][data-tab-id]");
      if (tabBtn && tabBtn instanceof HTMLElement) {
        if ((e.target as HTMLElement).closest?.(".tab-close")) return;
        this._handleTabClick(tabBtn);
        return;
      }

      // Click in content area — track column focus
      const cell = (e.target as HTMLElement).closest?.(".grid-cell");
      if (cell) {
        const col = parseInt(cell.getAttribute("data-cell-col") || "", 10);
        if (!isNaN(col)) {
          this._focusedCol = col;
          this.requestUpdate();
          this.dispatchEvent(
            new CustomEvent("grid-focus-col", {
              bubbles: true,
              detail: { winId: this.winId, col },
            }),
          );
        }
      }
    };
    this.addEventListener("click", this._boundOnClick);

    // ── Auto-pin on drag events ─────────────────────────────
    this._boundOnGridSplit = (e: Event) => {
      const { tabId, winId } = (e as CustomEvent).detail || {};
      if (tabId) {
        this._setPinned(tabId, true);
        this.dispatchEvent(
          new CustomEvent("grid-pin", {
            bubbles: true,
            detail: { winId, tabId, pinned: true },
          }),
        );
      }
    };
    this.addEventListener("grid-split", this._boundOnGridSplit);

    this._boundOnGridMove = (e: Event) => {
      const { tabId, sourceWinId } = (e as CustomEvent).detail || {};
      if (tabId) {
        this._setPinned(tabId, true);
        this.dispatchEvent(
          new CustomEvent("grid-pin", {
            bubbles: true,
            detail: { winId: sourceWinId, tabId, pinned: true },
          }),
        );
      }
    };
    this.addEventListener("grid-move", this._boundOnGridMove);

    this._boundOnTabBarMoveCell = (e: Event) => {
      const { tabId, targetWinId } = (e as CustomEvent).detail || {};
      if (tabId) {
        this._setPinned(tabId, true);
        this.dispatchEvent(
          new CustomEvent("grid-pin", {
            bubbles: true,
            detail: { winId: targetWinId, tabId, pinned: true },
          }),
        );
      }
    };
    this.addEventListener("tab-bar-move-cell", this._boundOnTabBarMoveCell);

    this._boundOnTabBarReorder = (e: Event) => {
      const { tabId, winId } = (e as CustomEvent).detail || {};
      if (tabId) {
        this._setPinned(tabId, true);
        this.dispatchEvent(
          new CustomEvent("grid-pin", {
            bubbles: true,
            detail: { winId, tabId, pinned: true },
          }),
        );
      }
    };
    this.addEventListener("tab-bar-reorder", this._boundOnTabBarReorder);

    // ── Handle grid-pin from external systems ───────────────
    this._boundOnGridPin = (e: Event) => {
      const { tabId, pinned } = (e as CustomEvent).detail || {};
      if (tabId !== undefined) {
        this._setPinned(tabId, pinned ?? true);
      }
    };
    this.addEventListener("grid-pin", this._boundOnGridPin);

    // ── Native file / repo drop support ──────────────────────
    this._boundOnDragOver = (e: DragEvent) => {
      if (!e.dataTransfer) return;
      const types = e.dataTransfer.types ?? [];
      if (
        types.includes("Files") ||
        types.includes("text/uri-list") ||
        types.includes("text/plain") ||
        types.includes("application/x-openp41ge-repo")
      ) {
        e.preventDefault();
        // Repo drags use effectAllowed="move" (set in repo-tree-item dragstart),
        // so set dropEffect="move" to match. File/URL/text drops use "copy".
        e.dataTransfer.dropEffect = types.includes("application/x-openp41ge-repo")
          ? "move"
          : "copy";
        this._showFileDropGhost(e);
      }
    };
    this.addEventListener("dragover", this._boundOnDragOver);

    this._boundOnDragLeave = (e: DragEvent) => {
      if (!(e.relatedTarget instanceof HTMLElement) || !this.contains(e.relatedTarget)) {
        this._ghostManager.hideGhost(this);
      }
    };
    this.addEventListener("dragleave", this._boundOnDragLeave);

    this._boundOnDrop = (e: DragEvent) => {
      this._ghostManager.hideGhost(this);
      if (!e.dataTransfer) return;

      // ── Repo drop ────────────────────────────────────────────
      const repoName = e.dataTransfer.getData("application/x-openp41ge-repo");
      if (repoName) {
        e.preventDefault();
        e.stopPropagation();

        const rect = this.getBoundingClientRect();
        const relX = e.clientX - rect.left;
        const pos = computeDropTarget(this, relX, rect.width, this.cols);

        if (pos.isBoundary) {
          const splitCol =
            pos.boundaryIndex === 0
              ? 0
              : pos.boundaryIndex >= this.cols
                ? this.cols - 1
                : pos.col;
          const splitLeft =
            pos.boundaryIndex === 0
              ? true
              : pos.boundaryIndex >= this.cols
                ? false
                : pos.col >= pos.boundaryIndex;
          this.dispatchEvent(
            new CustomEvent("grid-open-tab", {
              bubbles: true,
              detail: {
                winId: this.winId,
                tabType: "git-repository",
                tabConfig: { repoName },
                targetCol: splitCol,
                isBoundary: true,
                splitCol,
                splitLeft,
                pinned: true,
              },
            }),
          );
        } else {
          this.dispatchEvent(
            new CustomEvent("grid-open-tab", {
              bubbles: true,
              detail: {
                winId: this.winId,
                tabType: "git-repository",
                tabConfig: { repoName },
                targetCol: pos.col,
                pinned: true,
              },
            }),
          );
        }
        return;
      }

      // ── File drop ────────────────────────────────────────────
      const filePaths: string[] = [];
      if (e.dataTransfer.files?.length) {
        for (const file of Array.from(e.dataTransfer.files)) {
          filePaths.push(file.name);
        }
      }
      const textData = e.dataTransfer.getData("text/plain");
      if (textData && filePaths.length === 0) {
        filePaths.push(textData);
      }

      if (filePaths.length > 0) {
        e.preventDefault();
        e.stopPropagation();

        const rect = this.getBoundingClientRect();
        const relX = e.clientX - rect.left;
        const pos = computeDropTarget(this, relX, rect.width, this.cols);

        for (const filePath of filePaths) {
          if (pos.isBoundary) {
            const splitCol =
              pos.boundaryIndex === 0
                ? 0
                : pos.boundaryIndex >= this.cols
                  ? this.cols - 1
                  : pos.col;
            const splitLeft =
              pos.boundaryIndex === 0
                ? true
                : pos.boundaryIndex >= this.cols
                  ? false
                  : pos.col >= pos.boundaryIndex;
            this.dispatchEvent(
              new CustomEvent("grid-open-tab", {
                bubbles: true,
                detail: {
                  winId: this.winId,
                  tabType: "file-viewer",
                  tabConfig: { filePath },
                  targetCol: splitCol,
                  isBoundary: true,
                  splitCol,
                  splitLeft,
                  pinned: true,
                },
              }),
            );
          } else {
            this.dispatchEvent(
              new CustomEvent("grid-open-tab", {
                bubbles: true,
                detail: {
                  winId: this.winId,
                  tabType: "file-viewer",
                  tabConfig: { filePath },
                  targetCol: pos.col,
                  pinned: true,
                },
              }),
            );
          }
        }
      }
    };
    this.addEventListener("drop", this._boundOnDrop);
  }

  private _showFileDropGhost(e: DragEvent): void {
    const rect = this.getBoundingClientRect();
    const relX = e.clientX - rect.left;
    const pos = computeDropTarget(this, relX, rect.width, this.cols);

    if (pos.isBoundary) {
      const splitCol =
        pos.boundaryIndex === 0 ? 0 : pos.boundaryIndex >= this.cols ? this.cols - 1 : pos.col;
      const splitLeft =
        pos.boundaryIndex === 0
          ? true
          : pos.boundaryIndex >= this.cols
            ? false
            : pos.col >= pos.boundaryIndex;
      this._ghostManager.showGhost(this, {
        cols: this.cols,
        activeCol: pos.col,
        boundaryIndex: pos.boundaryIndex,
        splitCol,
        splitLeft,
        isFileDrop: true,
      });
    } else {
      this._ghostManager.showGhost(this, {
        cols: this.cols,
        activeCol: pos.col,
        isFileDrop: true,
      });
    }
  }

  private _teardownListeners(): void {
    if (this._boundOnClick) {
      this.removeEventListener("click", this._boundOnClick);
      this._boundOnClick = null;
    }
    if (this._pendingDblClickTimer) {
      clearTimeout(this._pendingDblClickTimer);
      this._pendingDblClickTimer = null;
      this._pendingDblClickTabId = "";
    }
    if (this._boundOnGridSplit) {
      this.removeEventListener("grid-split", this._boundOnGridSplit);
      this._boundOnGridSplit = null;
    }
    if (this._boundOnGridMove) {
      this.removeEventListener("grid-move", this._boundOnGridMove);
      this._boundOnGridMove = null;
    }
    if (this._boundOnTabBarMoveCell) {
      this.removeEventListener("tab-bar-move-cell", this._boundOnTabBarMoveCell);
      this._boundOnTabBarMoveCell = null;
    }
    if (this._boundOnTabBarReorder) {
      this.removeEventListener("tab-bar-reorder", this._boundOnTabBarReorder);
      this._boundOnTabBarReorder = null;
    }
    if (this._boundOnGridPin) {
      this.removeEventListener("grid-pin", this._boundOnGridPin);
      this._boundOnGridPin = null;
    }
    if (this._boundOnDragOver) {
      this.removeEventListener("dragover", this._boundOnDragOver);
      this._boundOnDragOver = null;
    }
    if (this._boundOnDragLeave) {
      this.removeEventListener("dragleave", this._boundOnDragLeave);
      this._boundOnDragLeave = null;
    }
    if (this._boundOnDrop) {
      this.removeEventListener("drop", this._boundOnDrop);
      this._boundOnDrop = null;
    }
  }

  render() {
    const gridStyle =
      "display:flex;flex-direction:row;height:100%;background:#1e1e1e;overflow-x:auto;overflow-y:hidden;";

    return html`
      <div class="grid-container" style=${gridStyle}>
        ${Array.from({ length: this.cols }, (_, i) => this._renderColumn(i))}
      </div>
    `;
  }

  private _renderColumn(colIndex: number) {
    const colStyle = `display:flex;flex-direction:column;flex:1;min-width:200px;border-right:${colIndex < this.cols - 1 ? "1px solid #333" : "none"};overflow:hidden;`;
    const placement = this.placements.find((p) => p.position.col === colIndex);
    const tabIds = placement ? placement.tabIds : [];
    const activeTabId = this.activeTabIds[String(colIndex)] || tabIds[0] || "";

    return html`
      <div class="grid-cell" data-cell-col=${colIndex} style=${colStyle}>
        <tab-bar
          .tabIds=${tabIds}
          .tabs=${this.tabData}
          .activeTabId=${activeTabId}
          .winId=${this.winId}
          .col=${colIndex}
          .focused=${colIndex === this._focusedCol}
        ></tab-bar>
        <tab-content
          .tabIds=${tabIds}
          .activeTabId=${activeTabId}
          .tabs=${this.tabData}
          col=${colIndex}
          style="flex:1;display:flex;flex-direction:column;overflow:hidden;"
        ></tab-content>
      </div>
    `;
  }
}

customElements.define("tab-grid", TabGrid);
