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

import { registerAppType } from "../../apps/app-registry";
import { terminalAppRegistration } from "../../apps/terminal/index";
import { videoAppRegistration } from "../../apps/video/index";
import { fileViewerAppRegistration } from "../../apps/file-viewer/index";
import { logViewerAppRegistration } from "../../apps/log-viewer/index";
import { gitRepositoryAppRegistration } from "../../apps/git-repository/index";

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
    log.info("app types registered");
  }
}
