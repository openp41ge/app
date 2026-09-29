/**
 * System tab type registrations — one per sidebar panel type.
 */

import type { SystemTabRegistration } from "../../controllers/types";
import { ExplorerSystemTabController } from "./explorer-system-tab";
import { CommitSearchSystemTabController } from "./commit-search-system-tab";
import { AgentsSystemTabController } from "./agents-system-tab";
import { explorerSettings, agentsSettings, gitSettings } from "../settings/index";

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
  // Not production-ready yet: the History panel is only available in dev
  // builds until it is stabilised.
  devOnly: true,
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

/** All system tab registrations for bulk registration. */
export const allSystemTabRegistrations: SystemTabRegistration[] = [
  explorerSystemTabRegistration,
  gitSystemTabRegistration,
  agentsSystemTabRegistration,
];

/**
 * System tab registrations available in the current runtime, with `devOnly`
 * tabs dropped from packaged (production) builds. Evaluated lazily at call
 * time so the dev decision is made when the list is actually consumed.
 *
 * When `isDev` is unavailable (e.g. tests / ambiguous environments) the tab is
 * kept, so gating only hides a `devOnly` tab on a definitively packaged build.
 */
export function availableSystemTabRegistrations(): SystemTabRegistration[] {
  let dev = true;
  try {
    if (typeof window !== "undefined" && typeof window.openp41ge?.isDev === "function") {
      dev = !!window.openp41ge.isDev();
    }
  } catch {
    dev = true;
  }
  return allSystemTabRegistrations.filter((reg) => !reg.devOnly || dev);
}
