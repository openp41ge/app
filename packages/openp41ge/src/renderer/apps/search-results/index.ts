/**
 * Search-results app type registration.
 *
 * A `search_files` tool-call card opens THIS pane (appType "search-results")
 * in the cell to the right of the chat: a read-only list of the matching file
 * paths. It is intentionally NOT a `<file-editor>` — search results are a
 * list, not file content. Each row is clickable to open the file in the
 * editor in the cell to the right.
 */

import type { AppTypeRegistration } from "../../controllers/types";
import { SearchResultsController } from "./search-results-controller";

export const searchResultsAppRegistration: AppTypeRegistration = {
  id: "search-results",
  label: "Search Results",
  icon: "\u{1f50d}",
  description: "List of files matching a search_files agent tool call",
  createController: (tabId: string) => new SearchResultsController(tabId, "search-results"),
};
