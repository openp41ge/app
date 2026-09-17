/**
 * Register all app types (blank, file-viewer, git, video, log-viewer)
 * so the grid can create controllers for new panes.
 *
 * Each app type is a registration record with a factory function that
 * creates TabController instances.
 */

import type { IStartupStep } from "../startup-step";
import type { StartupContext } from "../startup-context";
import { createLogger } from "openp41ge-logger";

const log = createLogger("openp41ge", "register-app-types");

import { registerAppType, registerSystemTabType } from "../../apps/app-registry";
import { blankAppRegistration } from "../../apps/blank/index";
import { videoAppRegistration } from "../../apps/video/index";
import { fileViewerAppRegistration } from "../../apps/file-viewer/index";
import { logViewerAppRegistration } from "../../apps/log-viewer/index";
import { gitRepositoryAppRegistration } from "../../apps/git-repository/index";
import { gitCommitSearchAppRegistration } from "../../apps/git-commit-search/index";
import { commitFileDiffAppRegistration } from "../../apps/commit-file-diff/index";
import { agentsAppRegistration } from "../../apps/agents/index";
import { toolResultAppRegistration } from "../../apps/tool-result/index";
import { searchResultsAppRegistration } from "../../apps/search-results/index";
import { allSystemTabRegistrations } from "../../apps/system-tabs/index";
import { explorerPlugin } from "../../apps/system-tabs/explorer-plugin";
import { gitPlugin } from "../../apps/system-tabs/git-plugin";
import { workspaceData } from "../../services/workspace-data";

// ─── Log viewer component (auto-registers <openp41ge-log-viewer>) ──────────
import "openp41ge-logger/viewer";

export class RegisterAppTypesStep implements IStartupStep {
  readonly name = "register-app-types";

  async run(context: StartupContext): Promise<void> {
    registerAppType(blankAppRegistration);
    registerAppType(videoAppRegistration);
    registerAppType(fileViewerAppRegistration);
    registerAppType(logViewerAppRegistration);
    registerAppType(gitRepositoryAppRegistration);
    registerAppType(gitCommitSearchAppRegistration);
    registerAppType(commitFileDiffAppRegistration);
    registerAppType(agentsAppRegistration);
    registerAppType(toolResultAppRegistration);
    registerAppType(searchResultsAppRegistration);

    // Register system tab types for sidebars
    for (const reg of allSystemTabRegistrations) {
      registerSystemTabType(reg);
    }

    // Register editor system tab types (override the grid)
    // The workspace manager is no longer an in-window surface: a workspace window
    // is bound to a fixed workspace (no in-window switching), and the Window
    // Manager window uses its own <openp41ge-window-manager> component rather than
    // a workspace overlay tab. So no "workspace-manager" editor system tab type
    // nor a "workspaces" system-overlay tab is registered here.

    // ── Per-tab settings are registered with their system tab ─────────
    // Each system tab declares its own settings surface (a grid app type) in
    // its registration's `settings`, and registerSystemTabType() registers that
    // grid app type too. So opening a settings grid tab just works.

    // ── Register built-in plugins through PluginRegistry ──────────────
    const ec = context.__eventController;
    if (ec?.pluginRegistry) {
      const pr = ec.pluginRegistry;

      const explorerResult = pr.register(explorerPlugin);
      if (!explorerResult.success) {
        log.warn("Explorer plugin registration errors:", explorerResult.errors);
      }

      const gitResult = pr.register(gitPlugin);
      if (!gitResult.success) {
        log.warn("Git plugin registration errors:", gitResult.errors);
      }
    }

    // ── Populate workspace data ───────────────────────────────────────
    this._initWorkspaceData();

    log.info("app types and system tab types registered");
  }

  private async _initWorkspaceData(): Promise<void> {
    try {
      const repos = await window.openp41ge.workspaceController.listRepos();
      for (const repo of repos) {
        workspaceData.addRepo({
          id: `repo-${repo.name}`,
          path: repo.path,
          name: repo.name,
        });
      }
      if (repos.length > 0) {
        workspaceData.setActiveRepo(`repo-${repos[0].name}`);
      }
    } catch {
      // workspace controller may not be ready yet
    }
  }
}
