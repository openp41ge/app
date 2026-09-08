/**
 * System tab type registrations — one per sidebar panel type.
 */

import type { SystemTabRegistration } from "../../controllers/types";
import { ExplorerSystemTabController } from "./explorer-system-tab";
import { CommitSearchSystemTabController } from "./commit-search-system-tab";
import { AgentsSystemTabController } from "./agents-system-tab";
import { LogsSystemTabController } from "./logs-system-tab";
import { explorerSettings, agentsSettings, gitSettings, logsSettings } from "../settings/index";

export const explorerSystemTabRegistration: SystemTabRegistration = {
  id: "explorer",
  label: "Explorer",
  icon: "\uD83D\uDCC1",
  description: "Browse project files and folders",
  defaultSide: "right",
  createController: (tabId, config) => new ExplorerSystemTabController(tabId, config),
  settings: explorerSettings,
};

export const gitSystemTabRegistration: SystemTabRegistration = {
  id: "git",
  label: "History",
  icon: "\u2387",
  description: "Browse commit history across repositories",
  defaultSide: "right",
  createController: (tabId, config) => new CommitSearchSystemTabController(tabId, config),
  settings: gitSettings,
};

export const agentsSystemTabRegistration: SystemTabRegistration = {
  id: "agents",
  label: "Agents",
  icon: "\uD83E\uDD16",
  description: "AI agent conversations",
  defaultSide: "right",
  createController: (tabId, config) => new AgentsSystemTabController(tabId, config),
  settings: agentsSettings,
};

export const logsSystemTabRegistration: SystemTabRegistration = {
  id: "logs",
  label: "Logs",
  icon: "\u{1F4CB}",
  description: "Browse registered application log streams",
  defaultSide: "right",
  createController: (tabId, config) => new LogsSystemTabController(tabId, config),
  settings: logsSettings,
};

/** All system tab registrations for bulk registration. */
export const allSystemTabRegistrations: SystemTabRegistration[] = [
  explorerSystemTabRegistration,
  gitSystemTabRegistration,
  agentsSystemTabRegistration,
  logsSystemTabRegistration,
];
