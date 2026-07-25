/**
 * Git Repository app type registration.
 *
 * Creates GitRepositoryController panes that display the accordion-style
 * git browser (branches, commits, files) for a given repository.
 *
 * The repo name is passed via `window.__pendingGitRepo` which is set
 * by the worktree drawer's "Show git info" context menu action before
 * dispatching "addColumnTab".
 */

import type { AppTypeRegistration } from "../../controllers/types";
import { GitRepositoryController } from "./git-repository-controller";

export const gitRepositoryAppRegistration: AppTypeRegistration = {
  id: "git-repository",
  label: "Git Repository",
  icon: "\uD83D\uDCC2",
  description: "Browse branches, commits, and files for a git repository",
  createController: (tabId: string) => new GitRepositoryController(tabId, "git-repository"),
};
