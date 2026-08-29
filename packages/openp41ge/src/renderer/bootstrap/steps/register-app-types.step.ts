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

import {
  registerAppType,
  registerSystemTabType,
  registerEditorSystemTabType,
} from "../../apps/app-registry";
import { terminalAppRegistration } from "../../apps/terminal/index";
import { videoAppRegistration } from "../../apps/video/index";
import { fileViewerAppRegistration } from "../../apps/file-viewer/index";
import { logViewerAppRegistration } from "../../apps/log-viewer/index";
import { gitRepositoryAppRegistration } from "../../apps/git-repository/index";
import { allSystemTabRegistrations } from "../../apps/system-tabs/index";
import { WorkspaceManagerModal } from "../../apps/system-tabs/workspace-manager-system-tab";
import { LogsSystemTab } from "../../apps/system-tabs/logs-overlay-tab";
import { FileEditorSettingsSystemTab } from "../../apps/system-tabs/file-editor-settings-system-tab";
import { explorerPlugin } from "../../apps/system-tabs/explorer-plugin";
import { gitPlugin } from "../../apps/system-tabs/git-plugin";
import { workspaceData } from "../../services/workspace-data";
import { systemOverlayService } from "../../services/system-overlay-service";

// ─── Log viewer component (auto-registers <openp41ge-log-viewer>) ──────────
import "openp41ge-logger/viewer";

export class RegisterAppTypesStep implements IStartupStep {
  readonly name = "register-app-types";

  async run(context: StartupContext): Promise<void> {
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
      createController: (tabId: string) => new WorkspaceManagerModal(tabId),
    });

    // ── System overlay tabs ──────────────────────────────────────────
    // The system overlay is the settings/config surface: every system that
    // wants configuration or internal data registers a top-bar tab here (and
    // other packages can too, e.g. from their own startup step).
    systemOverlayService.registerTab({
      id: "workspaces",
      label: "Workspaces",
      createController: (tabId: string) => {
        const c = new WorkspaceManagerModal(tabId);
        if (systemOverlayService.mode === "create") c.startCreate();
        else c.startList();
        return c;
      },
    });
    systemOverlayService.registerTab({
      id: "logs",
      label: "Logs",
      createController: (tabId: string) => new LogsSystemTab(tabId),
    });
    systemOverlayService.registerTab({
      id: "file-editor-settings",
      label: "Editor",
      createController: (tabId: string) => new FileEditorSettingsSystemTab(tabId),
    });

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
