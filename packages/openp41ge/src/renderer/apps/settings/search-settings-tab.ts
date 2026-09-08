/**
 * SearchSettingsTabController — grid tab for the Search panel's settings.
 *
 * Renders a placeholder settings panel. Owned by the Search sidebar tab.
 */

import type { TabController } from "../../controllers/types";
import { createSettingsPanel, createSettingsTabShell } from "../../services/settings-panel";

export class SearchSettingsTabController implements TabController {
  readonly tabId: string;
  readonly appType = "search-settings";
  private _container: HTMLElement | null = null;

  constructor(tabId: string) {
    this.tabId = tabId;
  }

  mount(container: HTMLElement): void {
    this._container = container;
    container.appendChild(
      createSettingsTabShell("Search", createSettingsPanel("Configure the Search panel.")),
    );
  }

  unmount(): void {
    if (this._container) this._container.innerHTML = "";
    this._container = null;
  }

  setVisible(_visible: boolean): void {}

  snapshot(): Record<string, unknown> {
    return {};
  }

  restore(_state: Record<string, unknown>): void {}
}
