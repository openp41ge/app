/**
 * Project picker app type registrations.
 *
 * Registers the project picker (full modal) and project detail
 * (inline card) app types so they can be opened as editor tabs.
 */

import type { AppTypeRegistration } from "../../controllers/types";
import { ProjectPickerController } from "./project-picker-controller";
import { ProjectDetailController } from "./project-detail-controller";

export const projectPickerAppRegistration: AppTypeRegistration = {
  id: "project-picker",
  label: "Project Switcher",
  icon: "\u2302",
  description: "Search and switch between projects",
  createController: (tabId: string) => new ProjectPickerController(tabId, "project-picker"),
};

export const projectDetailAppRegistration: AppTypeRegistration = {
  id: "project-detail",
  label: "Project Details",
  icon: "\u2699",
  description: "Project settings and activation",
  createController: (tabId: string) => new ProjectDetailController(tabId, "project-detail"),
};
