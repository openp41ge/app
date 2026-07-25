/**
 * ExplorerSidebarView — wraps <openp41ge-worktree-tree> as a SidebarView.
 *
 * On mount(), it creates the openp41ge-worktree-tree element (or picks up an
 * existing one) and appends it to the sidebar container. On unmount(), it
 * detaches the element (preserving DOM and module-level state).
 *
 * Architecture (SOLID):
 *   - Single Responsibility: manages the lifecycle of the explorer tree
 *     within the sidebar
 *   - Dependency Inversion: depends on SidebarView interface, not on
 *     the activity bar or sidebar components
 */

import type { SidebarView } from "./sidebar-view";

export class ExplorerSidebarView implements SidebarView {
  readonly id = "explorer";
  readonly label = "Explorer";
  private _element: HTMLElement | null = null;
  private _worksetId: string;

  constructor(worksetId: string) {
    this._worksetId = worksetId;
  }

  setWorksetId(worksetId: string): void {
    this._worksetId = worksetId;
    if (this._element) {
      (this._element as HTMLElement & { worksetId?: string }).worksetId = worksetId;
    }
  }

  async mount(container: HTMLElement): Promise<void> {
    // Pick up any existing tree element (e.g., from a previous unmount)
    // that may still be referenced in module-level state.
    let el = document.querySelector("openp41ge-worktree-tree") as HTMLElement | null;
    if (!el) {
      el = document.createElement("openp41ge-worktree-tree");
    }
    (el as HTMLElement & { worksetId?: string }).worksetId = this._worksetId;

    container.appendChild(el);
    this._element = el;

    // Wait for Lit to finish its first render cycle so that internal
    // DOM refs (_treeEl, _drawerEl, etc.) are available.
    await (el as HTMLElement & { updateComplete?: Promise<void> }).updateComplete;

    // The tree's connectedCallback() sets style.cssText which may include
    // width:0 (when _isOpen is false). Override AFTER full connection + render
    // to ensure the tree fills the sidebar content area correctly.
    el.style.cssText = "flex:1;min-height:0;display:flex;flex-direction:column;width:100%;";

    // Trigger the async data load now that the tree DOM is ready.
    const tree = el as HTMLElement & {
      fileData?: unknown;
      loadChildren?(path: string): Promise<void>;
    };
    if (typeof tree._loadRepos === "function") {
      // Use a microtask delay to let the re-render settle
      await Promise.resolve();
      tree._loadRepos();
    }
  }

  unmount(): void {
    if (this._element && this._element.parentNode) {
      this._element.remove();
      this._element = null;
    }
  }

  /** Toggle visibility edit mode on the underlying tree. */
  toggleEditMode(): void {
    const _element = this._element as (HTMLElement & { toggleEditMode?(): void }) | null;
    if (_element && typeof _element.toggleEditMode === "function") {
      _element.toggleEditMode();
    }
  }

  getTitle(): string {
    return "Explorer";
  }
}
