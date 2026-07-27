/**
 * Project manager app type registration.
 *
 * Registers the project manager so that project details, repo tree,
 * worktrees, and management actions can be mounted inside a pane tab.
 */

import type { AppTypeRegistration } from "../../controllers/types";
import { ProjectManagerController } from "./project-manager-controller";

export const projectManagerAppRegistration: AppTypeRegistration = {
  id: "project-manager",
  label: "Project",
  icon: "\u2302",
  description: "Project management and repository browser",
  createController: (tabId: string) => new ProjectManagerController(tabId, "project-manager"),
};
