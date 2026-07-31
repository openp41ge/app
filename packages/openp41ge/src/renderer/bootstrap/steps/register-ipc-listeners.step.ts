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
import { emitEvent } from "../../app";

export class RegisterIpcListenersStep implements IStartupStep {
  readonly name = "register-ipc-listeners";

  async run(context: StartupContext): Promise<void> {
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

    // ── Menu: Open Workspace ────────────────────────────────────────────
    window.openp41ge.onOpenWorkspace(() => {
      workspaceFileService.openDialog().then((loaded) => {
        if (loaded) {
          const winId = window.openp41ge?.workspace?.getWindowId?.();
          if (winId) {
            emitEvent("system-tab-open", { windowId: winId, appType: "workspace-manager" });
          }
        }
      });
    });

    // ── Menu: Save Workspace As... ──────────────────────────────────────
    window.openp41ge.onSaveWorkspaceAs(async () => {
      // Ensure a draft exists before showing Save As dialog
      if (!workspaceFileService.activeData) {
        await workspaceFileService.ensureDraftExists();
      }
      await workspaceFileService.saveAs();
    });

    log.info("IPC listeners registered");
  }
}
