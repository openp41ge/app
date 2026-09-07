/**
 * System tab type registrations — one per sidebar panel type.
 */

import type { SystemTabRegistration } from "../../controllers/types";
import { ExplorerSystemTabController } from "./explorer-system-tab";
import { CommitSearchSystemTabController } from "./commit-search-system-tab";
import { SearchSystemTabController } from "./search-system-tab";
import { AgentsSystemTabController } from "./agents-system-tab";
import { LogsSystemTabController } from "./logs-system-tab";
import {
  explorerSettings,
  agentsSettings,
  gitSettings,
  searchSettings,
  logsSettings,
} from "../settings/index";

export const explorerSystemTabRegistration: SystemTabRegistration = {
  id: "explorer",
  label: "Explorer",
  icon: "\uD83D\uDCC1",
  description: "Browse project files and folders",
  defaultSide: "right",
  createController: (tabId: string) => new ExplorerSystemTabController(tabId),
  settings: explorerSettings,
};

export const gitSystemTabRegistration: SystemTabRegistration = {
  id: "git",
  label: "History",
  icon: "\u2387",
  description: "Browse commit history across repositories",
  defaultSide: "right",
  createController: (tabId: string) => new CommitSearchSystemTabController(tabId),
  settings: gitSettings,
};

export const searchSystemTabRegistration: SystemTabRegistration = {
  id: "search",
  label: "Search",
  icon: "\uD83D\uDD0D",
  description: "Full-text search across files",
  defaultSide: "left",
  createController: (tabId: string) => new SearchSystemTabController(tabId),
  settings: searchSettings,
};

export const agentsSystemTabRegistration: SystemTabRegistration = {
  id: "agents",
  label: "Agents",
  icon: "\uD83E\uDD16",
  description: "AI agent conversations",
  defaultSide: "right",
  createController: (tabId: string) => new AgentsSystemTabController(tabId),
  settings: agentsSettings,
};

export const logsSystemTabRegistration: SystemTabRegistration = {
  id: "logs",
  label: "Logs",
  icon: "\u{1F4CB}",
  description: "Browse registered application log streams",
  defaultSide: "right",
  createController: (tabId: string) => new LogsSystemTabController(tabId),
  settings: logsSettings,
};

/** All system tab registrations for bulk registration. */
export const allSystemTabRegistrations: SystemTabRegistration[] = [
  explorerSystemTabRegistration,
  gitSystemTabRegistration,
  searchSystemTabRegistration,
  agentsSystemTabRegistration,
  logsSystemTabRegistration,
];
