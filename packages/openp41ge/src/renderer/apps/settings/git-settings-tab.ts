/**
 * HistorySettingsTabController — grid tab for the History panel's settings.
 *
 * Renders a placeholder settings panel. Owned by the History sidebar tab.
 */

import type { TabController } from "../../controllers/types";
import { createSettingsPanel } from "../../services/settings-panel";

export class HistorySettingsTabController implements TabController {
  readonly tabId: string;
  readonly appType = "git-settings";
  private _container: HTMLElement | null = null;

  constructor(tabId: string) {
    this.tabId = tabId;
  }

  mount(container: HTMLElement): void {
    this._container = container;
    container.appendChild(createSettingsPanel("History", "Configure the History panel."));
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
