/**
 * ProjectSwitchService — handles project switching in the renderer.
 *
 * When the user selects a project from the sidebar (system tab click,
 * titlebar click, or File > Open Project), this service:
 *   1. Calls project:switchTo on the main process
 *   2. The main process broadcasts the updated workspace state
 *   3. Dispatches a DOM event so the titlebar and other components refresh
 *
 * The project picker is opened as a system tab in the sidebar instead of
 * an ephemeral tab in the editor grid.
 */

import { createLogger } from "openp41ge-logger";
import { clearCapturedErrors } from "./error-capture-service";
import { emitEvent } from "../app";

const log = createLogger("project-switch-service");

/**
 * Switch the current project to the given name.
 */
export async function switchToProject(name: string): Promise<boolean> {
  log.info(`Switching to project: ${name}`);

  const result = await window.openp41ge.project.switchTo(name);
  if (!result.success) {
    log.error(`Failed to switch to project "${name}": ${result.error}`);
    return false;
  }

  clearCapturedErrors();
  window.__openp41geProjectName = name;

  // Dispatch a custom event so the titlebar and other components can refresh
  document.dispatchEvent(
    new CustomEvent("project:changed", {
      bubbles: true,
      detail: { name },
    }),
  );

  return true;
}

/**
 * Show the project picker as a system tab in the right sidebar.
 * If the project picker system tab is already open, it activates it.
 * Otherwise, creates a new system tab.
 */
export function showProjectPicker(): void {
  const winId = window.openp41ge?.workspace?.getWindowId?.();
  if (!winId) return;

  log.info("Opening project picker as system tab in right sidebar");

  // Open (or activate) the "projects" system tab in the right sidebar
  emitEvent("tab-open-system", { windowId: winId, side: "right", appType: "projects", title: "Projects" });
}
