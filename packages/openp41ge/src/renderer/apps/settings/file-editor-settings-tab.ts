/**
 * FileEditorSettingsTabController — grid tab hosting the file-editor settings.
 *
 * Renders <openp41ge-file-editor-settings> as a pane. Settings persist in the
 * config service, so the tab carries no per-tab snapshot state.
 */

import type { TabController } from "../../controllers/types";
import "../../components/openp41ge-file-editor-settings";

export class FileEditorSettingsTabController implements TabController {
  readonly tabId: string;
  readonly appType = "file-editor-settings";
  private _container: HTMLElement | null = null;

  constructor(tabId: string) {
    this.tabId = tabId;
  }

  mount(container: HTMLElement): void {
    this._container = container;
    const el = document.createElement("openp41ge-file-editor-settings");
    container.appendChild(el);
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
