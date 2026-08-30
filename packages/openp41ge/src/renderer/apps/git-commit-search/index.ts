/**
 * Git Commit Search app type registration.
 *
 * Dragging a commit-search result row from the Git sidebar onto the grid
 * creates THIS pane (appType "git-commit-search"): a read-only file editor
 * showing the commit's full message.
 */

import type { AppTypeRegistration } from "../../controllers/types";
import { GitCommitSearchController } from "./git-commit-search-controller";

export const gitCommitSearchAppRegistration: AppTypeRegistration = {
  id: "git-commit-search",
  label: "Commit Search",
  icon: "\u26A5",
  description: "Commit message viewer",
  createController: (tabId: string) => new GitCommitSearchController(tabId, "git-commit-search"),
};
