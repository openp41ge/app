/**
 * Agents app type registration.
 *
 * Creates AgentsController panes that render a single chat conversation
 * in the central grid. The chat id is passed via `window.__pendingChatId`
 * (set by the sidebar before dispatching "addColumnTab"), or restored from
 * the tab's persisted state.
 */

import type { AppTypeRegistration } from "../../controllers/types";
import { AgentsController } from "./agents-controller";

export const agentsAppRegistration: AppTypeRegistration = {
  id: "agents",
  label: "Agents",
  icon: "\uD83E\uDD16",
  description: "Chat with an AI coding agent",
  createController: (tabId: string) => new AgentsController(tabId, "agents"),
};
