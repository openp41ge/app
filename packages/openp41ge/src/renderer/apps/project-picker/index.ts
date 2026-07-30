/**
 * Project picker app type registration.
 *
 * Registers the project picker as an app type so it can be opened
 * as an ephemeral tab in the grid instead of a full-screen modal.
 */

import type { AppTypeRegistration } from "../../controllers/types";
import { ProjectPickerController } from "./project-picker-controller";

export const projectPickerAppRegistration: AppTypeRegistration = {
  id: "project-picker",
  label: "Project Switcher",
  icon: "\u2302",
  description: "Search and switch between projects",
  createController: (tabId: string) => new ProjectPickerController(tabId, "project-picker"),
};
