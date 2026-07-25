/**
 * DragOrchestrator — unified drag-and-drop coordinator.
 *
 * Consolidates the functionality of GridDragHandler, TabDragHandler,
 * RealDragHandler, and TestDragHandler into a single class.
 *
 * Responsibilities:
 *   - Owns drag session state (source, ghost, target, threshold)
 *   - Listens to document mousemove/mouseup
 *   - Resolves drop targets under cursor (tab-bar → grid → openp41ge-bar)
 *   - Manages ghost overlay via GhostManager
 *   - Handles cursor style injection via CursorManager
 *   - Provides simulateDrag() for programmatic (test) use
 *
 * Usage:
 *   Components call orchestrator.startDrag(source, clientX, clientY) on mousedown.
 *   The orchestrator handles the rest.
 */

import type {
  IDragHandler,
  IDragSource,
  IDropTarget,
  DragResult,
} from "../../interfaces/drag-handler";
import type { TargetFeedback } from "../../interfaces/drag-handler";
import { isOpenp41geGrid } from "../../interfaces/element-guards";
import { GridDropTarget } from "../drop-targets/grid-drop-target";
import { TopBarDropTarget } from "../drop-targets/topbar-drop-target";
import { TabBarDropTarget } from "../drop-targets/tab-bar-drop-target";
import type { ICommandBus } from "../../interfaces/command-bus";
import { ghostManager } from "./ghost-manager";
import { CursorManager } from "./cursor-manager";
import { createLogger } from "openp41ge-logger";

const log = createLogger("drag-orchestrator");

// ─── Drag session state ──────────────────────────────────────────────────

interface DragSession {
  source: IDragSource;
  ghost: HTMLElement | null;
  startX: number;
  startY: number;
  thresholdMet: boolean;
  currentTarget: IDropTarget | null;
  initiated: boolean;
}

/**
 * DragOrchestrator — singleton orchestrator for all drag-and-drop in the app.
 */
export class DragOrchestrator implements IDragHandler {
  private _session: DragSession | null = null;
  private _commandBus: ICommandBus | null = null;
  private _lastCrossCheck = 0;
  private _currentFeedback: TargetFeedback | null = null;
  private _targetCache = new Map<HTMLElement, IDropTarget>();
  private _cursorManager = new CursorManager();

  get isDragging(): boolean {
    return this._session !== null;
  }

  init(commandBus: ICommandBus): void {
    this._commandBus = commandBus;
  }

  // ── Public API ──────────────────────────────────────────────────────────

  /**
   * Start a drag from a source. Called by components on mousedown.
   * Visual changes (ghost, cursor) are deferred until the 4px threshold.
   */
  startDrag(source: IDragSource, clientX: number, clientY: number): void {
    if (this._session) {
      log.warn("drag already in progress, cancelling previous");
      this._cancel();
    }

    this._session = {
      source,
      ghost: null,
      startX: clientX,
      startY: clientY,
      thresholdMet: false,
      currentTarget: null,
      initiated: false,
    };

    document.addEventListener("mousemove", this._onMouseMove);
    document.addEventListener("mouseup", this._onMouseUp);
    log.info("drag start registered", source.type);
  }

  /**
   * Programmatic drag for tests. Skips the mouse-event layer entirely.
   */
  async simulateDrag(source: IDragSource, target: IDropTarget): Promise<DragResult> {
    source.onDragStart();
    this._cursorManager.enable();
    try {
      const result = await target.onDrop(source, 0, 0);
      source.onDragEnd(result);
      this._cursorManager.disable();
      return result;
    } catch (err) {
      const result: DragResult = { success: false, reason: String(err) };
      source.onDragEnd(result);
      this._cursorManager.disable();
      return result;
    }
  }

  /**
   * Cancel the current drag (escape key, context menu, app reset).
   */
  cancelDrag(): void {
    if (this._session) {
      if (this._session.initiated) {
        this._session.source.onDragEnd({ success: false, reason: "cancelled" });
      }
      this._cancel();
      log.info("drag cancelled");
    }
  }

  /**
   * Clean up all cached targets and overlays (call on app teardown).
   */
  dispose(): void {
    this.cancelDrag();
    this._targetCache.clear();
    ghostManager.dispose();
  }

  // ── Mouse handlers ──────────────────────────────────────────────────────

  private _onMouseMove = (ev: MouseEvent): void => {
    const s = this._session;
    if (!s) return;

    const dx = ev.clientX - s.startX;
    const dy = ev.clientY - s.startY;

    // 4px threshold
    if (!s.thresholdMet && Math.abs(dx) + Math.abs(dy) > 4) {
      s.thresholdMet = true;
    }

    // Initiate visual changes on first threshold crossing
    if (s.thresholdMet && !s.initiated) {
      this._initiateDrag(s, ev);
    }

    // Position ghost at cursor
    if (s.thresholdMet && s.ghost) {
      const gw = parseInt(s.ghost.dataset.dragGhostWidth || "160", 10);
      const gh = parseInt(s.ghost.dataset.dragGhostHeight || "32", 10);
      s.ghost.style.left = `${ev.clientX - gw / 2}px`;
      s.ghost.style.top = `${ev.clientY - gh / 2}px`;
      window.openp41ge?.drag?.move(ev.screenX, ev.screenY);
    }

    // Resolve drop target
    const newTarget = s.thresholdMet ? this._resolveTarget(ev.clientX, ev.clientY) : null;

    if (newTarget !== s.currentTarget) {
      if (s.currentTarget) {
        s.currentTarget.onLeave();
      }
      this._clearOverlays();
      this._currentFeedback = null;
      s.currentTarget = newTarget;
    }

    // Hover feedback
    let feedback: TargetFeedback | null = null;
    if (s.currentTarget) {
      feedback = s.currentTarget.onHover(s.source, ev.clientX, ev.clientY);
    }
    this._applyFeedback(feedback);

    // Cross-window check (throttled to 100ms)
    const now = Date.now();
    if (now - this._lastCrossCheck > 100) {
      this._lastCrossCheck = now;
      window.openp41ge?.drag
        ?.check(ev.screenX, ev.screenY)
        .then((crossResult: { target: unknown; windowId: string } | null) => {
          if (crossResult?.target && s.ghost) {
            const currentWinId = window.openp41ge?.workspace?.getWindowId();
            if (crossResult.windowId === currentWinId) return;
            s.ghost.style.display = "none";
            const data = s.source.getDragData();
            window.openp41ge?.drag?.ghostShow(
              crossResult.windowId,
              JSON.stringify(data),
              ev.screenX,
              ev.screenY,
              "",
            );
          } else if (s.ghost) {
            s.ghost.style.display = "block";
          }
        });
    }
  };

  private _onMouseUp = (ev: MouseEvent): void => {
    document.removeEventListener("mousemove", this._onMouseMove);
    document.removeEventListener("mouseup", this._onMouseUp);

    const s = this._session;
    if (!s) return;

    if (!s.thresholdMet) {
      document.body.style.overflow = "";
      this._cancel();
      return;
    }

    this._cursorManager.disable();
    document.body.style.overflow = "";
    window.openp41ge?.drag?.end();

    const target = this._resolveTarget(ev.clientX, ev.clientY);
    if (target) {
      target
        .onDrop(s.source, ev.clientX, ev.clientY)
        .then((result) => {
          s.source.onDragEnd(result);
          this._cancel();
        })
        .catch((err) => {
          s.source.onDragEnd({ success: false, reason: String(err) });
          this._cancel();
          log.error("drop failed", err);
        });
    } else {
      // No target — detach tab to new window
      const data = s.source.getDragData();
      if (data.type === "tab" || data.type === "openp41ge-tab") {
        window.openp41ge?.workspace?.detachTab(data.winId, data.tabId, {
          x: ev.screenX - 50,
          y: ev.screenY - 50,
          width: 800,
          height: 600,
        });
      }
      s.source.onDragEnd({ success: false, reason: "no target" });
      this._cancel();
    }
  };

  // ── Target resolution ───────────────────────────────────────────────────

  /**
   * Resolve the drop target under the cursor.
   * Order: openp41ge-bar > tab-bar > grid
   * Uses cached IDropTarget instances per element.
   */
  private _resolveTarget(clientX: number, clientY: number): IDropTarget | null {
    const el = document.elementFromPoint(clientX, clientY);
    if (!el || !(el instanceof HTMLElement)) return null;

    // 1. Openp41ge bar
    const openp41geBarEl = el.closest?.("openp41ge-topbar");
    if (openp41geBarEl instanceof HTMLElement) {
      return this._getOrCreateTarget(
        openp41geBarEl,
        () => new TopBarDropTarget(openp41geBarEl, this._commandBus!),
      );
    }

    // 2. Tab bar
    const tabBarEl = el.closest?.(".cell-tab-bar");
    if (tabBarEl instanceof HTMLElement) {
      const cellEl = tabBarEl.closest?.(".openp41ge-grid-cell");
      const gridEl = cellEl?.closest?.("openp41ge-grid");
      if (cellEl && gridEl && gridEl instanceof HTMLElement && isOpenp41geGrid(gridEl)) {
        const cells = Array.from(gridEl.children).filter(
          (c) => c instanceof HTMLElement && c.classList.contains("openp41ge-grid-cell"),
        );
        const col = cells.indexOf(cellEl);
        return this._getOrCreateTarget(
          tabBarEl,
          () =>
            new TabBarDropTarget(
              tabBarEl,
              gridEl.winId,
              gridEl.pageData?.id ?? "",
              col,
              this._commandBus!,
            ),
        );
      }
    }

    // 3. Grid
    const gridEl = el.closest?.("openp41ge-grid");
    if (gridEl instanceof HTMLElement && isOpenp41geGrid(gridEl)) {
      return this._getOrCreateTarget(gridEl, () => new GridDropTarget(gridEl, this._commandBus!));
    }

    return null;
  }

  private _getOrCreateTarget(el: HTMLElement, factory: () => IDropTarget): IDropTarget {
    let target = this._targetCache.get(el);
    if (!target) {
      target = factory();
      this._targetCache.set(el, target);
    }
    return target;
  }

  // ── Visual feedback ─────────────────────────────────────────────────────

  private _applyFeedback(feedback: TargetFeedback | null): void {
    this._clearOverlays();
    if (!feedback) {
      this._currentFeedback = null;
      return;
    }
    this._currentFeedback = feedback;

    if (!feedback.showGhost || !feedback.ghostConfig) return;

    const cfg = feedback.ghostConfig as Record<string, unknown>;
    const type = cfg.type as string | undefined;

    const gridEl =
      this._session?.ghost?.closest?.("openp41ge-grid") || document.querySelector("openp41ge-grid");
    if (!gridEl || !(gridEl instanceof HTMLElement)) return;

    if (type === "split") {
      const mouseCol = cfg.mouseCol as number;
      const splitLeft = Boolean(cfg.splitLeft);
      const splitCol = cfg.splitCol !== undefined ? (cfg.splitCol as number) : mouseCol;
      ghostManager.showGhost(gridEl, {
        cols: cfg.cols as number,
        boundaryIndex: cfg.boundaryIndex as number,
        splitCol,
        splitLeft,
        splitHighlightCol: splitLeft ? splitCol : undefined,
        columnFlex: ghostManager.flexCache.get(gridEl, cfg.cols as number),
      });
    } else if (type === "cell-highlight") {
      ghostManager.showGhost(gridEl, {
        cols: cfg.cols as number,
        activeCol: cfg.col as number,
      });
    }
  }

  /** Clear overlays and cell target highlights from DOM. */
  private _clearOverlays(): void {
    // GhostManager's overlays are cleaned up by hideGhost;
    // but we also need to remove any orphaned DOM artifacts.
    document
      .querySelectorAll(
        ".openp41ge-ghost-overlay, .openp41ge-split-overlay, .openp41ge-cell-target-highlight",
      )
      .forEach((el) => el.remove());
  }

  // ── Initiation & Cleanup ────────────────────────────────────────────────

  private _initiateDrag(s: DragSession, ev: MouseEvent): void {
    const ghost = s.source.createGhost();
    document.body.appendChild(ghost);

    // Prevent scrolling during drag by disabling overflow on body
    document.body.style.overflow = "hidden";

    // Read actual ghost dimensions after appending (offsetWidth is 0
    // before the element is in the DOM). Cache in dataset for subsequent
    // mousemove positioning.
    const gw = ghost.offsetWidth || 160;
    const gh = ghost.offsetHeight || 32;
    ghost.dataset.dragGhostWidth = String(gw);
    ghost.dataset.dragGhostHeight = String(gh);
    ghost.style.left = `${ev.clientX - gw / 2}px`;
    ghost.style.top = `${ev.clientY - gh / 2}px`;
    s.ghost = ghost;

    s.source.onDragStart();
    this._cursorManager.enable();
    s.initiated = true;
    log.info("drag visuals initiated");
  }

  private _cancel(): void {
    if (!this._session) return;

    document.removeEventListener("mousemove", this._onMouseMove);
    document.removeEventListener("mouseup", this._onMouseUp);
    this._cursorManager.disable();
    document.body.style.overflow = "";

    if (this._session.ghost && this._session.ghost.parentNode) {
      this._session.ghost.parentNode.removeChild(this._session.ghost);
    }

    if (this._session.currentTarget) {
      this._session.currentTarget.onLeave();
    }
    this._clearOverlays();
    this._currentFeedback = null;
    this._session = null;
  }
}

/** Singleton instance shared across the app. */
export const dragOrchestrator = new DragOrchestrator();
