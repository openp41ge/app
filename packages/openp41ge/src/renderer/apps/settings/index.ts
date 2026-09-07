/**
 * Settings surfaces for the built-in sidebar tabs.
 *
 * Every sidebar tab owns exactly one settings grid tab. Each entry below is the
 * settings surface for a single tab: it carries a unique `openEvent` (emitted by
 * that tab's settings button) and its own grid app type / controller. This is a
 * generic mechanism so extension-provided sidebar tabs can supply their own
 * settings as part of their extension.
 */

import { FileEditorSettingsTabController } from "./file-editor-settings-tab";
import { AgentSettingsTabController } from "./agent-settings-tab";
import { HistorySettingsTabController } from "./git-settings-tab";
import { SearchSettingsTabController } from "./search-settings-tab";
import { LogsSettingsTabController } from "./logs-settings-tab";
import type { SystemTabSettings } from "../../controllers/types";

/** Explorer tab's settings → the built-in file editor settings. */
export const explorerSettings: SystemTabSettings = {
  appType: "file-editor-settings",
  label: "Editor",
  icon: "⚙",
  description: "Configure the built-in file editor",
  openEvent: "openp41ge:open-explorer-settings",
  createController: (tabId) => new FileEditorSettingsTabController(tabId),
};

/** Agents tab's settings → the AI agent provider settings. */
export const agentsSettings: SystemTabSettings = {
  appType: "agent",
  label: "Agents",
  icon: "\uD83E\uDD16",
  description: "Configure the AI agent provider",
  openEvent: "openp41ge:open-agents-settings",
  createController: (tabId) => new AgentSettingsTabController(tabId),
};

/** History tab's settings. */
export const gitSettings: SystemTabSettings = {
  appType: "git-settings",
  label: "History",
  icon: "⚙",
  description: "Configure the History panel",
  openEvent: "openp41ge:open-git-settings",
  createController: (tabId) => new HistorySettingsTabController(tabId),
};

/** Search tab's settings. */
export const searchSettings: SystemTabSettings = {
  appType: "search-settings",
  label: "Search",
  icon: "⚙",
  description: "Configure the Search panel",
  openEvent: "openp41ge:open-search-settings",
  createController: (tabId) => new SearchSettingsTabController(tabId),
};

/** Logs tab's settings. */
export const logsSettings: SystemTabSettings = {
  appType: "logs-settings",
  label: "Logs",
  icon: "⚙",
  description: "Configure the Logs panel",
  openEvent: "openp41ge:open-logs-settings",
  createController: (tabId) => new LogsSettingsTabController(tabId),
};
