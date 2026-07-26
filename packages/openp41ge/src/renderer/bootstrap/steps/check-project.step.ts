/**
 * CheckProjectStep — confirms a project is active; shows the project picker
 * only as a fallback.
 *
 * The main process now auto-creates a draft project on startup (when no
 * --project CLI arg is given), so this step usually resolves immediately.
 * The project picker is still available for switching projects, but it's
 * triggered by the user via the "Open Project..." command, not on startup.
 *
 * When a project is selected from the picker, it calls project:switch on
 * the main process to load that project's workspace state.
 *
 * The subsequent FetchInitialStateStep picks up the state and renders.
 */

import type { IStartupStep } from "../startup-step";
import type { StartupContext } from "../startup-context";
import { createLogger } from "openp41ge-logger";
import { clearCapturedErrors } from "../../services/error-capture-service";

const log = createLogger("bootstrap:check-project");

export class CheckProjectStep implements IStartupStep {
  readonly name = "check-project";

  async run(context: StartupContext): Promise<void> {
    try {
      const currentProject = await window.openp41ge.project.current();

      if (currentProject) {
        log.info(`Active project: ${currentProject}`);
        window.__openp41geProjectName = currentProject;
        return; // Project already set — proceed normally
      }

      log.info("No active project — showing project picker");

      // Mount the project picker element in the DOM
      const pickerEl = document.createElement("openp41ge-project-picker");
      document.body.appendChild(pickerEl);

      context.modalState.showProjects();
      context.modalState.setFocusTrap(pickerEl);

      // Wait for the user to select a project
      const selected = await new Promise<string>((resolve) => {
        const timeout = setTimeout(() => {
          cleanup();
          resolve("");
        }, 120_000); // 2 minute timeout

        const onSelected = (e: Event) => {
          const detail = (e as CustomEvent).detail;
          if (detail?.name) {
            cleanup();
            clearTimeout(timeout);
            resolve(detail.name);
          }
        };

        const onDismissed = () => {
          cleanup();
          clearTimeout(timeout);
          resolve("");
        };

        const cleanup = () => {
          pickerEl.removeEventListener("project:selected", onSelected as EventListener);
          pickerEl.removeEventListener("project:dismissed", onDismissed as EventListener);
        };

        pickerEl.addEventListener("project:selected", onSelected as EventListener);
        pickerEl.addEventListener("project:dismissed", onDismissed as EventListener);
      });

      // Remove the picker from DOM
      pickerEl.remove();
      context.modalState.dismiss();

      if (selected) {
        log.info(`Project selected: ${selected}`);
        // Tell main process to switch to this project
        const result = await window.openp41ge.project.switchTo(selected);
        if (!result.success) {
          log.error(`Failed to switch to project "${selected}": ${result.error}`);
        } else {
          // Clear any stale errors from a previous page load
          clearCapturedErrors();
          // Store for subsequent bootstrap steps
          window.__openp41geProjectName = selected;

          // The project switch broadcast may have been missed or not yet arrived.
          // Explicitly fetch the updated state from the main process so the
          // renderer renders with the correct workspace (including explorer open).
          try {
            const stateJson = await window.openp41ge.workspace.getState();
            const ws = JSON.parse(stateJson);
            if (ws && ws.windows && ws.windows.length > 0) {
              context.workspaceState.setState(ws);
            }
          } catch (fetchErr) {
            log.error("Failed to fetch workspace state after project switch:", fetchErr);
          }
        }
      } else {
        log.info("Project picker dismissed — continuing with default workspace");
      }
    } catch (err) {
      log.error("Error in project check:", err);
    }
  }
}
