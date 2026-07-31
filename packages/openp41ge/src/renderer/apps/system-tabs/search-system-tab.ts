/**
 * SearchSystemTabController — system tab controller for the Search panel.
 *
 * Placeholder implementation. Will be replaced with full-text search UI.
 */

import type { SystemTabController } from "../../controllers/types";

export class SearchSystemTabController implements SystemTabController {
  readonly tabId: string;
  readonly appType = "search";
  private _element: HTMLElement | null = null;

  constructor(tabId: string) {
    this.tabId = tabId;
  }

  mount(container: HTMLElement): void {
    const wrapper = document.createElement("div");
    wrapper.className = "flex flex-col p-4 gap-3";

    const title = document.createElement("h2");
    title.className = "text-sm font-medium";
    title.textContent = "Search";
    wrapper.appendChild(title);

    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = "Search files...";
    input.className =
      "w-full px-3 py-2 text-sm bg-bg-primary border border-divider rounded outline-none focus:border-accent";
    wrapper.appendChild(input);

    const help = document.createElement("p");
    help.className = "text-xs text-muted";
    help.textContent = "Full-text search coming soon. Use Cmd+Shift+F to activate.";
    wrapper.appendChild(help);

    container.appendChild(wrapper);
    this._element = wrapper;
  }

  unmount(): void {
    if (this._element && this._element.parentNode) {
      this._element.remove();
      this._element = null;
    }
  }
}
