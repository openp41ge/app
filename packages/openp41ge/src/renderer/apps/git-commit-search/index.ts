/**
 * Git Commit Search app type registration.
 *
 * Placeholder for the commit-search result UI: opening a commit-search result
 * row from the Git sidebar onto the grid creates THIS pane (appType
 * "git-commit-search") rather than the full git-repository browser.
 * The real result UI replaces the stub controller later.
 */

import type { AppTypeRegistration } from "../../controllers/types";
import { GitCommitSearchController } from "./git-commit-search-controller";

export const gitCommitSearchAppRegistration: AppTypeRegistration = {
  id: "git-commit-search",
  label: "Commit Search",
  icon: "\u26A5",
  description: "Commit search result (placeholder)",
  createController: (tabId: string) => new GitCommitSearchController(tabId, "git-commit-search"),
};
