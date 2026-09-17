/**
 * Tool-result app type registration.
 *
 * Clicking a tool-call card in an agent chat opens THIS pane (appType
 * "tool-result") in the cell to the right of the chat: a read-only view of the
 * tool's result text. For `read_file` this is the file's content snapshotted
 * when the tool ran; for `search_files` it's the matching-path list.
 */

import type { AppTypeRegistration } from "../../controllers/types";
import { ToolResultController } from "./tool-result-controller";

export const toolResultAppRegistration: AppTypeRegistration = {
  id: "tool-result",
  label: "Tool Result",
  icon: "\u2699",
  description: "Read-only result of an agent tool call",
  createController: (tabId: string) => new ToolResultController(tabId, "tool-result"),
};
