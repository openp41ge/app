/**
 * LogsSettingsTabController — grid tab for the Logs panel's settings.
 *
 * Renders <openp41ge-logs-settings>. Owned by the Logs sidebar tab.
 */

import type { TabController } from "../../controllers/types";
import { createSettingsTabShell } from "../../services/settings-panel";
import "../../components/openp41ge-logs-settings";

export class LogsSettingsTabController implements TabController {
  readonly tabId: string;
  readonly appType = "logs-settings";
  private _container: HTMLElement | null = null;

  constructor(tabId: string) {
    this.tabId = tabId;
  }

  mount(container: HTMLElement): void {
    this._container = container;
    const el = document.createElement("openp41ge-logs-settings");
    container.appendChild(createSettingsTabShell("Logs", el));
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
