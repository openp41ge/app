/**
 * Openp41geTabsEventHandler — translates openp41ge-tabs CustomEvents into
 * Openp41ge command-bus operations.
 *
 * Listens on `document` for bubbling events from <tab-grid> and <tab-bar>
 * components, then dispatches the corresponding workspace operations
 * (e.g., reorderTabsInCell, moveTabBetweenCells, activateTabInCell).
 */

import type { ICommandBus } from "../interfaces/command-bus";
import type { TabMountManager } from "./tab-mount-manager";
import type { Workspace } from "../../layout/types.js";
import { TabActivationHistory } from "./tab-activation-history";

type CleanupFn = () => void;

export class Openp41geTabsEventHandler {
  /** Per-window last focused column, updated by grid-focus-col events. */
  static lastFocusedCol: Record<string, number> = {};

  /** Get the last focused column for a window, falling back to 0. */
  static getLastFocusedCol(winId: string): number {
    return Openp41geTabsEventHandler.lastFocusedCol[winId] ?? 0;
  }
  private _commandBus: ICommandBus | null = null;
  private _mountManager: TabMountManager | null = null;
  private _workspaceState: {
    getWorkspace: () => Workspace | null;
  } | null = null;
  private _cleanups: CleanupFn[] = [];

  init(
    commandBus: ICommandBus,
    mountManager?: TabMountManager,
    workspaceState?: { getWorkspace: () => Workspace | null },
  ): void {
    this._commandBus = commandBus;
    this._mountManager = mountManager ?? null;
    this._workspaceState = workspaceState ?? null;
    this._registerListeners();
  }

  destroy(): void {
    for (const cleanup of this._cleanups) cleanup();
    this._cleanups = [];
    this._commandBus = null;
  }

  private _registerListeners(): void {
    // ── Tab bar reorder ─────────────────────────────────────────────
    this._on("tab-bar-reorder", (detail) => {
      const { winId, col, fromIndex, toIndex } = detail as {
        winId: string;
        col: number;
        fromIndex: number;
        toIndex: number;
      };
      this._dispatch("reorderTabsInCell", winId, 0, col, fromIndex, toIndex);
    });

    // ── Tab bar cross-cell move ─────────────────────────────────────
    this._on("tab-bar-move-cell", (detail) => {
      const { sourceWinId, tabId, targetWinId, targetCol, dropIndex } = detail as {
        sourceWinId: string;
        tabId: string;
        targetWinId: string;
        targetCol: number;
        dropIndex: number;
      };
      this._dispatch(
        "moveTabBetweenCells",
        sourceWinId,
        tabId,
        targetWinId,
        0,
        targetCol,
        dropIndex,
      );
    });

    // ── Grid split (tab dropped on column boundary) ─────────────────
    this._on("grid-split", (detail) => {
      const { winId, tabId, splitCol, splitLeft } = detail as {
        winId: string;
        tabId: string;
        splitCol: number;
        splitLeft: boolean;
      };
      this._dispatch("splitTabFromCell", winId, tabId, splitCol, splitLeft);
    });

    // ── Grid move (tab dropped into another cell) ───────────────────
    this._on("grid-move", (detail) => {
      const { sourceWinId, tabId, targetWinId, targetCol, insertAt } = detail as {
        sourceWinId: string;
        tabId: string;
        targetWinId: string;
        targetCol: number;
        insertAt?: number;
      };
      this._dispatch(
        "moveTabBetweenCells",
        sourceWinId,
        tabId,
        targetWinId,
        0,
        targetCol,
        insertAt ?? -1,
      );
    });

    // ── Grid activate (tab dropped on itself — same cell) ──────────
    this._on("grid-activate", (detail) => {
      const { winId, tabId, col } = detail as { winId: string; tabId: string; col?: number };
      TabActivationHistory.pushActivation(winId, tabId);
      this._dispatch("activateTabInCell", winId, tabId);
      this._mountManager?.activateTab(tabId);
      if (col !== undefined) {
        Openp41geTabsEventHandler.lastFocusedCol[winId] = col;
      }
    });

    // ── Grid focus col (clicked content area in a cell) ────────────
    this._on("grid-focus-col", (detail) => {
      const { winId, col } = detail as { winId: string; col: number };
      if (winId && col !== undefined) {
        Openp41geTabsEventHandler.lastFocusedCol[winId] = col;
      }
    });

    // ── Grid remove (duplicate file path detected) ──────────────────
    this._on("grid-remove", (detail) => {
      const { winId, tabId } = detail as { winId: string; tabId: string };
      this._dispatch("removeTabFromCell", winId, tabId);
    });

    // ── Grid open tab (file drop on cell center or boundary) ───────
    this._on("grid-open-tab", (detail) => {
      const {
        winId: eventWinId,
        tabType: _tabType,
        tabConfig,
        targetCol,
        isBoundary,
        splitCol,
        splitLeft,
        pinned,
      } = detail as {
        winId?: string;
        tabType: string;
        tabConfig: { filePath: string };
        targetCol: number;
        isBoundary?: boolean;
        splitCol?: number;
        splitLeft?: boolean;
        pinned?: boolean;
      };
      const winId = eventWinId || this._findWinId();
      if (!winId) return;
      const filePath = tabConfig.filePath;
      const fileName = filePath.split("/").pop() || filePath;
      const isPinned = pinned ?? true;

      // Mark the drop target as the last focused column for follow-up opens.
      // For boundary drops, the new column is at splitCol + 1 when splitLeft=false,
      // or at splitCol when splitLeft=true.
      const focusCol = isBoundary
        ? (splitLeft ?? true)
          ? (splitCol ?? targetCol)
          : (splitCol ?? targetCol) + 1
        : targetCol;
      Openp41geTabsEventHandler.lastFocusedCol[winId] = focusCol;

      if (isBoundary) {
        this._dispatch(
          "splitFileOpen",
          winId,
          "file-viewer",
          fileName,
          filePath,
          splitCol ?? targetCol,
          splitLeft ?? true,
        );
      } else {
        this._dispatch(
          "actionOpenFile",
          winId,
          "file-viewer",
          fileName,
          filePath,
          targetCol,
          isPinned,
        );
      }
    });

    // ── Grid pin (tab pinned via double-click) ────────────────────
    this._on("grid-pin", (detail) => {
      const {
        winId,
        tabId,
        pinned: isPinned,
      } = detail as {
        winId: string;
        tabId: string;
        pinned: boolean;
      };
      if (!winId || !tabId) return;

      if (isPinned) {
        // Find the tab's column in the workspace
        const ws = this._workspaceState?.getWorkspace();
        if (!ws) return;
        const win = ws.windows.find((w) => w.id === winId);
        if (!win) return;
        const pl = win.grid.placements.find((p) => (p.tabIds as string[]).includes(tabId));
        if (!pl) return;
        this._dispatch("pinTabInCell", winId, pl.position.col, tabId);
      }
    });

    // ── Tab close button clicks ───────────────────────────────────
    this._onClick(".tab-close", (el) => {
      const tabId = el.getAttribute("data-close-tab-id");
      if (!tabId) return;
      const tabBar = el.closest("tab-bar") as (HTMLElement & { winId?: string }) | null;
      if (!tabBar) return;
      const winId = tabBar.winId;
      if (!winId) return;
      this._dispatch("removeTabFromCell", winId, tabId);
    });
  }

  /**
   * Listen for a CustomEvent on document.
   */
  private _on(eventName: string, handler: (detail: unknown) => void): void {
    const listener = (e: Event) => {
      handler((e as CustomEvent).detail);
    };
    document.addEventListener(eventName, listener);
    this._cleanups.push(() => document.removeEventListener(eventName, listener));
  }

  /**
   * Listen for click events matching a selector.
   */
  private _onClick(selector: string, handler: (el: HTMLElement) => void): void {
    const listener = (e: Event) => {
      const target = (e.target as HTMLElement).closest(selector);
      if (!(target instanceof HTMLElement)) return;
      e.preventDefault();
      e.stopPropagation();
      handler(target);
    };
    document.addEventListener("click", listener);
    this._cleanups.push(() => document.removeEventListener("click", listener));
  }

  private _dispatch(fn: string, ...args: unknown[]): void {
    this._commandBus?.dispatch(fn, ...args);
  }

  private _findWinId(): string {
    const grid = document.querySelector("tab-grid");
    if (grid) return (grid as HTMLElement & { winId?: string }).winId || "";
    return "";
  }
}
