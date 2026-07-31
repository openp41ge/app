/**
 * Register all app types (terminal, file-viewer, git, video, log-viewer)
 * so the grid can create controllers for new panes.
 *
 * Each app type is a registration record with a factory function that
 * creates TabController instances.
 */

import type { IStartupStep } from "../startup-step";
import type { StartupContext } from "../startup-context";
import { createLogger } from "openp41ge-logger";

const log = createLogger("bootstrap:register-app-types");

import { registerAppType, registerSystemTabType, registerEditorSystemTabType } from "../../apps/app-registry";
import { terminalAppRegistration } from "../../apps/terminal/index";
import { videoAppRegistration } from "../../apps/video/index";
import { fileViewerAppRegistration } from "../../apps/file-viewer/index";
import { logViewerAppRegistration } from "../../apps/log-viewer/index";
import { gitRepositoryAppRegistration } from "../../apps/git-repository/index";
import { allSystemTabRegistrations } from "../../apps/system-tabs/index";
import { WorkspacesSystemTab } from "../../apps/system-tabs/workspace-manager-system-tab";

// ─── Log viewer component (auto-registers <openp41ge-log-viewer>) ──────────
import "openp41ge-logger/viewer";

export class RegisterAppTypesStep implements IStartupStep {
  readonly name = "register-app-types";

  async run(_context: StartupContext): Promise<void> {
    registerAppType(terminalAppRegistration);
    registerAppType(videoAppRegistration);
    registerAppType(fileViewerAppRegistration);
    registerAppType(logViewerAppRegistration);
    registerAppType(gitRepositoryAppRegistration);

    // Register system tab types for sidebars
    for (const reg of allSystemTabRegistrations) {
      registerSystemTabType(reg);
    }

    // Register editor system tab types (override the grid)
    registerEditorSystemTabType({
      appType: "workspace-manager",
      title: "Workspaces",
      createController: (tabId: string) => new WorkspacesSystemTab(tabId),
    });

    log.info("app types and system tab types registered");
  }
}
