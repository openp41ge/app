/**
 * Log viewer controller — mounts <openp41ge-log-viewer> as a pane.
 */

import { Openp41geLogViewer } from "openp41ge-logger/viewer";
import type { TabController } from "../../controllers/types";

export class LogViewerController implements TabController {
  readonly tabId: string;
  readonly appType = "log-viewer";
  private _container: HTMLElement | null = null;
  private _viewer: Openp41geLogViewer | null = null;

  constructor(tabId: string) {
    this.tabId = tabId;
  }

  mount(container: HTMLElement): void {
    this._container = container;
    const viewer = document.createElement(Openp41geLogViewer.tagName) as Openp41geLogViewer;
    container.appendChild(viewer);
    this._viewer = viewer;
  }

  unmount(): void {
    if (this._viewer && this._container) {
      this._container.removeChild(this._viewer);
    }
    this._viewer = null;
    this._container = null;
  }

  setVisible(_visible: boolean): void {
    // No special visibility handling needed
  }

  snapshot(): Record<string, unknown> {
    return {};
  }

  restore(_state: Record<string, unknown>): void {
    // No state to restore
  }
}
