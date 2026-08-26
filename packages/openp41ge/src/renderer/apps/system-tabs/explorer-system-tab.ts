/**
 * ExplorerSystemTabController — system tab controller for the Explorer panel.
 *
 * Wraps ExplorerSidebarView as a SystemTabController. Mounts the file tree
 * in the sidebar content area.
 */

import type { SystemTabController } from "../../controllers/types";

export class ExplorerSystemTabController implements SystemTabController {
  readonly tabId: string;
  readonly appType = "explorer";
  private _viewElement: HTMLElement | null = null;

  constructor(tabId: string) {
    this.tabId = tabId;
  }

  async mount(container: HTMLElement): Promise<void> {
    // Create the worktree tree element
    const el = document.createElement("openp41ge-worktree-tree");
    container.appendChild(el);
    this._viewElement = el;

    // Wait for Lit to finish its first render cycle
    await (el as HTMLElement & { updateComplete?: Promise<void> }).updateComplete;

    // Ensure the element fills the sidebar — flex:1 fills a flex parent,
    // height:100% fills .sidebar-content (which has a definite flex-computed
    // height), matching the Git tab's sizing.
    el.style.cssText =
      "flex:1 1 0%;min-height:0;display:flex;flex-direction:column;width:100%;height:100%;";
  }

  unmount(): void {
    if (this._viewElement && this._viewElement.parentNode) {
      this._viewElement.remove();
      this._viewElement = null;
    }
  }
}
