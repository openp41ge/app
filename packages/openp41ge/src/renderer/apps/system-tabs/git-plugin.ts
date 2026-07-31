/**
 * Git plugin — repository browser.
 *
 * Registers through the PluginRegistry to add graph nodes and handlers
 * for git operations.
 */

import type { PluginRegistration } from "../../services/plugin-registry";

export const gitPlugin: PluginRegistration = {
  id: "openp41ge-git",
  nodes: ["git/refresh"],
  edges: [
    { from: "workspace-changed", when: null, to: ["git/refresh"] },
    { from: "repo-switched", when: null, to: ["git/refresh"] },
  ],
  handlers: {
    "git/refresh": async () => {
      document.dispatchEvent(
        new CustomEvent("git:refresh", { bubbles: true }),
      );
    },
  },
};
