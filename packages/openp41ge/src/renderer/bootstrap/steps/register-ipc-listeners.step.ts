/**
 * Register IPC listeners from the main process.
 *
 * These handle:
 *   - Zoom in/out/reset (triggered by the Electron menu bar)
 *   - Confirm modal (triggered by the main process for quit/close confirmations)
 */

import type { IStartupStep } from "../startup-step";
import type { StartupContext } from "../startup-context";
import { createLogger } from "openp41ge-logger";

const log = createLogger("bootstrap:register-ipc-listeners");

import { showConfirmModal } from "../../components/openp41ge-confirm-modal";
import { wireResetListener } from "../../app";
import { workspaceFileService } from "../../services/workspace-file-service";
import { serviceModalService } from "../../services/service-modal-service";

export class RegisterIpcListenersStep implements IStartupStep {
  readonly name = "register-ipc-listeners";

  async run(context: StartupContext): Promise<void> {
    // If preload bridge is missing, skip IPC listener registration
    if (typeof window.openp41ge === "undefined") {
      log.warn("preload bridge not available, skipping IPC listeners");
      return;
    }

    window.openp41ge.onZoomIn(() => context.zoomService.zoomIn());
    window.openp41ge.onZoomOut(() => context.zoomService.zoomOut());
    window.openp41ge.onZoomReset(() => context.zoomService.zoomReset());

    window.openp41ge.workspace.onConfirm((optionsJson: string) => {
      const options = JSON.parse(optionsJson);
      showConfirmModal({
        message: options.message,
        confirmLabel: options.confirmLabel,
        cancelLabel: options.cancelLabel,
      }).then((confirmed) => {
        window.openp41ge.workspace.confirmResponse(confirmed);
      });
    });

    // Wire the app reset listener so window.openp41ge.workspace.reset() works
    wireResetListener();

    // ── Menu: New Workspace ─────────────────────────────────────────────
    window.openp41ge.onNewWorkspace(async () => {
      serviceModalService.openModal("workspace-manager");
    });

    // ── Menu: Open Workspace ────────────────────────────────────────────
    window.openp41ge.onOpenWorkspace(() => {
      workspaceFileService.openDialog().then((loaded) => {
        if (loaded) {
          serviceModalService.openModal("workspace-manager");
        }
      });
    });

    // ── Menu: Save Workspace As... ──────────────────────────────────────
    window.openp41ge.onSaveWorkspaceAs(async () => {
      if (workspaceFileService.activeData) {
        await workspaceFileService.saveAs();
      }
    });

    log.info("IPC listeners registered");
  }
}
