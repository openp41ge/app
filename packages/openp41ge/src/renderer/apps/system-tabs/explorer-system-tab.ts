/**
 * ExplorerSystemTabController — system tab controller for the Explorer panel.
 *
 * Mounts the file tree in the sidebar content area.
 */

import type { SystemTabController } from "../../controllers/types";
import type { Side } from "../../services/settings-button";

export class ExplorerSystemTabController implements SystemTabController {
  readonly tabId: string;
  readonly appType = "explorer";
  private _viewElement: HTMLElement | null = null;
  private _side: Side = "right";

  constructor(tabId: string, config?: Record<string, unknown>) {
    this.tabId = tabId;
    this._side = (config?.side as Side) ?? "right";
  }

  async mount(container: HTMLElement): Promise<void> {
    // Create the worktree tree element
    const el = document.createElement("openp41ge-worktree-tree");
    el.setAttribute("data-side", this._side);
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

  /** Keep-alive hook: forward visibility so the worktree tree suspends its
   * background work (reactive loads / scroll recompute) while hidden. */
  setVisible(visible: boolean): void {
    (this._viewElement as unknown as { setVisible?(v: boolean): void } | null)?.setVisible?.(
      visible,
    );
  }
}
