/**
 * CheckProjectStep — confirms a project/workspace is active.
 *
 * The main process auto-creates a draft project on startup, so this step
 * usually resolves immediately. No UI is shown — project management is
 * done through the Workspace Manager system tab.
 */

import type { IStartupStep } from "../startup-step";
import type { StartupContext } from "../startup-context";
import { createLogger } from "openp41ge-logger";

const log = createLogger("bootstrap:check-project");

export class CheckProjectStep implements IStartupStep {
  readonly name = "check-project";

  async run(_context: StartupContext): Promise<void> {
    try {
      const currentProject = await window.openp41ge.project.current();
      if (currentProject) {
        log.info(`Active project: ${currentProject}`);
        window.__openp41geProjectName = currentProject;
      } else {
        log.info("No active project — continuing with default");
      }
    } catch (err) {
      log.error("Error in project check:", err);
    }
  }
}
