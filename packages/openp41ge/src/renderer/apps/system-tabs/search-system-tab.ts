/**
 * SearchSystemTabController — system tab controller for the Search panel.
 *
 * Placeholder implementation. Will be replaced with full-text search UI.
 */

import type { SystemTabController } from "../../controllers/types";
import { createSettingsButton } from "../../services/settings-button";

export class SearchSystemTabController implements SystemTabController {
  readonly tabId: string;
  readonly appType = "search";
  private _element: HTMLElement | null = null;

  constructor(tabId: string) {
    this.tabId = tabId;
  }

  mount(container: HTMLElement): void {
    const wrapper = document.createElement("div");
    Object.assign(wrapper.style, {
      display: "flex",
      flexDirection: "column",
      height: "100%",
      boxSizing: "border-box",
    });

    const body = document.createElement("div");
    Object.assign(body.style, {
      flex: "1 1 auto",
      overflowY: "auto",
      padding: "16px",
      display: "flex",
      flexDirection: "column",
      gap: "12px",
    });

    const title = document.createElement("h2");
    title.className = "text-sm font-medium";
    title.textContent = "Search";
    body.appendChild(title);

    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = "Search files...";
    input.className =
      "w-full px-3 py-2 text-sm bg-bg-primary border border-divider rounded outline-none focus:border-accent";
    body.appendChild(input);

    const help = document.createElement("p");
    help.className = "text-xs text-muted";
    help.textContent = "Full-text search coming soon. Use Cmd+Shift+F to activate.";
    body.appendChild(help);

    // Pinned footer with this tab's own settings button (unique open event).
    const footer = document.createElement("div");
    Object.assign(footer.style, {
      flexShrink: "0",
      height: "24px",
      display: "flex",
      alignItems: "center",
      padding: "0 8px",
      borderTop: "1px solid var(--divider,#333)",
      background: "var(--bg-secondary,#252526)",
    });
    const spacer = document.createElement("div");
    Object.assign(spacer.style, { flex: "1 1 auto" });
    footer.appendChild(spacer);
    footer.appendChild(
      createSettingsButton(
        "openp41ge:open-search-settings",
        "search-settings",
        "Search",
        "Search settings",
      ),
    );

    wrapper.append(body, footer);
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
