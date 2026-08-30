/**
 * Commit-file diff app type registration.
 *
 * Activating a file result in the Git sidebar commit search opens THIS pane
 * (appType "commit-file-diff"): a read-only view of the file's diff at that
 * commit — `+` additions green, `-` deletions red.
 */

import type { AppTypeRegistration } from "../../controllers/types";
import { CommitFileDiffController } from "./commit-file-diff-controller";

export const commitFileDiffAppRegistration: AppTypeRegistration = {
  id: "commit-file-diff",
  label: "File Diff",
  icon: "\u00B1",
  description: "Read-only file diff at a commit",
  createController: (tabId: string) => new CommitFileDiffController(tabId, "commit-file-diff"),
};
