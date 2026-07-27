/**
 * CheckProjectStep — confirms a project is active.
 *
 * The main process auto-creates a draft project on startup (when no
 * --project CLI arg is given), so this step usually resolves immediately.
 * If there's a draft, it auto-opens a project-manager tab for it.
 */

/**
 * CheckProjectStep — confirms a project is active; shows the project picker
 * only as a fallback.
 *
 * The main process now auto-creates a draft project on startup (when no
 * --project CLI arg is given), so this step usually resolves immediately.
 * The project picker is still available for switching projects, but it's
 * triggered by the user via the titlebar or "Open Project...", not on startup.
 */

import type { IStartupStep } from "../startup-step";
import type { StartupContext } from "../startup-context";
import { createLogger } from "openp41ge-logger";
import { switchToProject } from "../../services/project-switch-service";

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

      // Mount the project picker and await selection
      const pickerEl = document.createElement("openp41ge-project-picker");
      document.body.appendChild(pickerEl);

      context.modalState.showProjects();
      context.modalState.setFocusTrap(pickerEl);

      const selected = await new Promise<string>((resolve) => {
        const timeout = setTimeout(() => {
          cleanup();
          resolve("");
        }, 120_000);

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

      pickerEl.remove();
      context.modalState.dismiss();

      if (selected) {
        await switchToProject(selected);

        // Fetch the updated workspace state explicitly — the broadcast
        // may race with our re-render
        const stateJson = await window.openp41ge.workspace.getState();
        const ws = JSON.parse(stateJson);
        if (ws?.windows?.length > 0) {
          context.workspaceState.setState(ws);
        }
      }
    } catch (err) {
      log.error("Error in project check:", err);
    }
  }
}
