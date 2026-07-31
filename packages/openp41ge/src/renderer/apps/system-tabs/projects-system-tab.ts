/**
 * ProjectsSystemTabController — system tab controller for the Project Picker panel.
 *
 * Mounts an inline <openp41ge-project-list> element in the sidebar content area.
 * Clicking a project in the list opens a detail panel as an editor tab.
 */

import type { SystemTabController } from "../../controllers/types";

export class ProjectsSystemTabController implements SystemTabController {
  readonly tabId: string;
  readonly appType = "projects";
  private _element: HTMLElement | null = null;

  constructor(tabId: string) {
    this.tabId = tabId;
  }

  async mount(container: HTMLElement): Promise<void> {
    await import("../../components/openp41ge-project-list");

    const list = document.createElement("openp41ge-project-list") as HTMLElement;
    (list as any).systemTabId = this.tabId;
    container.appendChild(list);
    this._element = list;
  }

  unmount(): void {
    if (this._element && this._element.parentNode) {
      this._element.remove();
      this._element = null;
    }
  }
}
