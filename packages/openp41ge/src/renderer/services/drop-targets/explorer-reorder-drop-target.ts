/**
 * ExplorerReorderDropTarget — drop target for reordering repo rows inside the
 * explorer (openp41ge-worktree-tree).
 *
 * Replaces the legacy native HTML5 dragenter/dragover/drop reorder block. The
 * source row drags via the unified bitmap pipeline (GitEntryDragSource) and
 * resolves to this target when the cursor is over the explorer list
 * (`[data-explorer-drop-zone]`). The ACTION is decided by drop location:
 * here a repo-row drop reorders; a worktree-row drop cancels (worktrees are
 * not reorderable today).
 *
 * onHover draws the same thin-focus insertion line the native block used
 * (a 2px accent bar between repo rows). On drop it fires
 * `explorer-reorder-repos` { repoName, fromIndex, dropIndex }, which the
 * host routes to reorder the active workspace's `repos` array.
 */

import type {
  IDragSource,
  IDropTarget,
  DragResult,
  TargetFeedback,
} from "../../openp41ge-tabs-adapter";

/** Bubbling event fired on the drop zone element when a repo row is dropped. */
export const EXPLORER_REORDER_EVENT = "explorer-reorder-repos";

/** Repo-item selector inside the explorer drop zone. */
export const REPO_ITEM_SELECTOR = "openp41ge-repo-tree-item";

function repoItems(zone: HTMLElement): HTMLElement[] {
  return Array.from(zone.querySelectorAll<HTMLElement>(REPO_ITEM_SELECTOR));
}

/** Index of the repo item under `clientY` (first row whose midpoint is below the cursor). */
function dropIndexForY(zone: HTMLElement, clientY: number): number {
  const items = repoItems(zone);
  for (let i = 0; i < items.length; i++) {
    const rect = items[i].getBoundingClientRect();
    if (clientY < rect.top + rect.height / 2) {
      return i;
    }
  }
  return items.length;
}

function repoIndexByName(zone: HTMLElement, repoName: string): number {
  const items = repoItems(zone);
  return items.findIndex((el) => el.getAttribute("data-repo") === repoName);
}

export class ExplorerReorderDropTarget implements IDropTarget {
  readonly type = "explorer-reorder";
  readonly element: HTMLElement;

  /** The insertion line drawn while hovering (removed on leave/drop). */
  private _line: HTMLElement | null = null;

  constructor(element: HTMLElement) {
    this.element = element;
  }

  /** Repo rows reorder; worktree rows (branch present) never do. */
  private _isReorderable(source: IDragSource): boolean {
    const data = source.getDragData() as {
      type?: string;
      tabConfig?: { branch?: string };
    };
    return data.type === "open-tab" && !data.tabConfig?.branch;
  }

  onHover(source: IDragSource, _clientX: number, clientY: number): TargetFeedback | null {
    if (!this._isReorderable(source)) return null;
    this._placeLine(dropIndexForY(this.element, clientY));
    return { cssClass: "explorer-reorder" };
  }

  async onDrop(source: IDragSource, _clientX: number, clientY: number): Promise<DragResult> {
    this._clearLine();

    if (!this._isReorderable(source)) {
      return { success: false, reason: "worktree rows cannot be reordered" };
    }

    const repoName = (
      (source.getDragData() as { tabConfig?: { repoName?: string } }).tabConfig as {
        repoName?: string;
      }
    )?.repoName;
    if (!repoName) return { success: false, reason: "missing repo name" };

    const dropIndex = dropIndexForY(this.element, clientY);
    const fromIndex = repoIndexByName(this.element, repoName);

    // No-op reorders: dropping before itself or right after itself (mirrors
    // the removed native handler) is skipped in the host — still resolve as
    // success so the gesture ends cleanly.
    if (fromIndex !== -1) {
      this.element.dispatchEvent(
        new CustomEvent(EXPLORER_REORDER_EVENT, {
          bubbles: true,
          detail: { repoName, fromIndex, dropIndex },
        }),
      );
    }
    return { success: true };
  }

  onLeave(): void {
    this._clearLine();
  }

  /** Insert the 2px accent insertion line at the given repo index. */
  private _placeLine(index: number): void {
    this._clearLine();
    const items = repoItems(this.element);
    const line = document.createElement("div");
    line.className = "h-0.5 bg-focus shrink-0 m-0 explorer-reorder-line";

    if (index >= items.length || items.length === 0) {
      this.element.appendChild(line);
    } else {
      const wrapper = items[index].parentElement;
      this.element.insertBefore(line, wrapper ?? items[index]);
    }
    this._line = line;
  }

  private _clearLine(): void {
    if (this._line && this._line.parentNode) {
      this._line.parentNode.removeChild(this._line);
    }
    this._line = null;
  }
}
