/**
 * ProjectSwitchService — handles project switching in the renderer.
 *
 * When the user selects a project from the sidebar (activity bar icon,
 * titlebar click, or File > Open Project), this service:
 *   1. Calls project:switchTo on the main process
 *   2. The main process broadcasts the updated workspace state
 *   3. Dispatches a DOM event so the titlebar and other components refresh
 *
 * The old modal project picker is replaced by the Projects sidebar view.
 */

import { createLogger } from "openp41ge-logger";
import { clearCapturedErrors } from "./error-capture-service";

const log = createLogger("project-switch-service");

/**
 * Switch the current project to the given name.
 * Relies on the main process broadcasting the updated workspace state
 * via the existing openp41ge:state-update IPC channel.
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
 * Show the project picker and wire up selection/dismissal handlers.
 * Handles the full lifecycle: mount, wait for selection, switch, cleanup.
 */
export function showProjectPicker(): void {
  if (document.querySelector("openp41ge-project-picker")) return;

  const picker = document.createElement("openp41ge-project-picker");
  document.body.appendChild(picker);

  const onSelected = async (e: Event) => {
    const detail = (e as CustomEvent).detail;
    if (detail?.name) {
      picker.remove();
      await switchToProject(detail.name);
    }
  };

  const onDismissed = () => {
    picker.remove();
  };

  picker.addEventListener("project:selected", onSelected as EventListener);
  picker.addEventListener("project:dismissed", onDismissed as EventListener);
}
