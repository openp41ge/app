/**
 * System tab type registrations — one per sidebar panel type.
 */

import type { SystemTabRegistration } from "../../controllers/types";
import { ExplorerSystemTabController } from "./explorer-system-tab";
import { GitSystemTabController } from "./git-system-tab";
import { ProjectsSystemTabController } from "./projects-system-tab";
import { SearchSystemTabController } from "./search-system-tab";

export const explorerSystemTabRegistration: SystemTabRegistration = {
  id: "explorer",
  label: "Explorer",
  icon: "\uD83D\uDCC1",
  description: "Browse project files and folders",
  defaultSide: "right",
  createController: (tabId: string) => new ExplorerSystemTabController(tabId),
};

export const gitSystemTabRegistration: SystemTabRegistration = {
  id: "git",
  label: "Git",
  icon: "\u2387",
  description: "View Git status, branches, and history",
  defaultSide: "right",
  createController: (tabId: string) => new GitSystemTabController(tabId),
};

export const projectsSystemTabRegistration: SystemTabRegistration = {
  id: "projects",
  label: "Projects",
  icon: "\u2302",
  description: "Switch between projects",
  defaultSide: "left",
  createController: (tabId: string) => new ProjectsSystemTabController(tabId),
};

export const searchSystemTabRegistration: SystemTabRegistration = {
  id: "search",
  label: "Search",
  icon: "\uD83D\uDD0D",
  description: "Full-text search across files",
  defaultSide: "left",
  createController: (tabId: string) => new SearchSystemTabController(tabId),
};

/** All system tab registrations for bulk registration. */
export const allSystemTabRegistrations: SystemTabRegistration[] = [
  explorerSystemTabRegistration,
  gitSystemTabRegistration,
  projectsSystemTabRegistration,
  searchSystemTabRegistration,
];
