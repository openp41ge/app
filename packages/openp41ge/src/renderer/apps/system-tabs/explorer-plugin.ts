/**
 * Explorer plugin — file tree browsing.
 *
 * Registers through the PluginRegistry to add graph nodes and handlers
 * for file-tree operations.
 */

import type { PluginRegistration } from "../../services/plugin-registry";

export const explorerPlugin: PluginRegistration = {
  id: "openp41ge-explorer",
  nodes: ["explorer/refresh"],
  edges: [
    { from: "workspace-changed", when: null, to: ["explorer/refresh"] },
    { from: "file-tree-refresh", when: null, to: ["explorer/refresh"] },
  ],
  handlers: {
    "explorer/refresh": async () => {
      // Refreshes the file tree — the sidebar component re-renders
      // when it detects workspace data changes.
      document.dispatchEvent(
        new CustomEvent("explorer:refresh", { bubbles: true }),
      );
    },
  },
};
