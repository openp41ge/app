/**
 * ProjectSwitchService — handles project switching in the renderer.
 *
 * When the user selects a project from the sidebar (activity bar icon,
 * titlebar click, or File > Open Project), this service:
 *   1. Calls project:switchTo on the main process
 *   2. The main process broadcasts the updated workspace state
 *      (the picker is re-added as an ephemeral tab in the broadcast)
 *   3. Dispatches a DOM event so the titlebar and other components refresh
 *
 * The project picker is opened as an ephemeral tab instead of a modal.
 * After a project switch the main process re-adds the picker tab directly
 * to the workspace state before broadcasting, so there is no timing gap.
 */

import { createLogger } from "openp41ge-logger";
import { clearCapturedErrors } from "./error-capture-service";
import { dispatch } from "../app";
import { Openp41geTabsEventHandler } from "./openp41ge-tabs-event-handler";

const log = createLogger("project-switch-service");

/**
 * Switch the current project to the given name.
 * The main process re-opens the project picker ephemeral tab in the
 * broadcast, so the renderer does not need to re-add it here.
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
 * Show the project picker as an ephemeral tab in the current active cell.
 * If no cells exist, a new cell is created.
 */
export function showProjectPicker(): void {
  // Prevent duplicate ephemeral picker tabs
  if (document.querySelector("openp41ge-project-picker[inline]")) return;

  const winId = window.openp41ge?.workspace?.getWindowId?.();
  if (!winId) return;

  log.info("Opening project picker as ephemeral tab");

  // Open in the last focused column, or column 0 if none
  const targetCol = Openp41geTabsEventHandler.getLastFocusedCol(winId);

  dispatch("addColumnTabAt", winId, "project-picker", "Project Switcher", "", targetCol, true);
}
