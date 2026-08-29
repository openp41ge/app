/**
 * System tab type registrations — one per sidebar panel type.
 */

import type { SystemTabRegistration } from "../../controllers/types";
import { ExplorerSystemTabController } from "./explorer-system-tab";
import { CommitSearchSystemTabController } from "./commit-search-system-tab";
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
  description: "Search commits across repositories",
  defaultSide: "right",
  createController: (tabId: string) => new CommitSearchSystemTabController(tabId),
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
  searchSystemTabRegistration,
];
