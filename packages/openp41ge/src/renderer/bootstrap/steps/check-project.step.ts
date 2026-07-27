/**
 * CheckProjectStep — confirms a project is active.
 *
 * The main process auto-creates a draft project on startup (when no
 * --project CLI arg is given), so this step usually resolves immediately.
 * If there's a draft, it auto-opens a project-manager tab for it.
 */

import type { IStartupStep } from "../startup-step";
import type { StartupContext } from "../startup-context";
import { createLogger } from "openp41ge-logger";
import { switchToProject } from "../../services/project-switch-service";
import { dispatch } from "../../app";

const log = createLogger("bootstrap:check-project");

export class CheckProjectStep implements IStartupStep {
  readonly name = "check-project";

  async run(context: StartupContext): Promise<void> {
    try {
      const currentProject = await window.openp41ge.project.current();

      if (currentProject) {
        log.info(`Active project: ${currentProject}`);
        window.__openp41geProjectName = currentProject;

        // Check if it's a draft — if so, auto-open the project-manager tab
        let isDraft = false;
        try {
          isDraft = await window.openp41ge.project.isDraft(currentProject);
        } catch {
          // not a draft
        }
        if (isDraft) {
          // Wait a tick for the workspace state to settle, then open the tab
          setTimeout(() => {
            const winId = window.openp41ge?.workspace?.getWindowId?.();
            if (winId) {
              try {
                dispatch("addColumnTabAt", winId, "project-manager", currentProject, currentProject, 0);
              } catch {
                // Tab may already be open
              }
            }
          }, 100);
        }

        return;
      }

      log.info("No active project — showing projects sidebar");

      // Open the projects sidebar so the user can pick or create a project
      setTimeout(() => {
        document.dispatchEvent(
          new CustomEvent("openp41ge:activity-click", {
            bubbles: true,
            composed: true,
            detail: { viewId: "projects" },
          }),
        );
      }, 300);
    } catch (err) {
      log.error("Error in project check:", err);
    }
  }
}
