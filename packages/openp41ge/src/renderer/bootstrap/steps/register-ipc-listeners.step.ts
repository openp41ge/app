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
import { systemOverlayService } from "../../services/system-overlay-service";
import { toastService } from "../../components/openp41ge-toast";
import { focusRepoInWorkspaces } from "../../apps/system-tabs/workspace-manager-system-tab";

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

    // ── Menu: New Window (placeholder — coming soon) ─────────────────────
    window.openp41ge.onNewWindowPlaceholder(() => {
      toastService.show("New Window is not available yet — use Window → Add Workspace Window.", "info");
    });

    // ── In-window workspace switching is removed from workspace windows ─────
    // Workspace windows are bound to a fixed workspace; the New/Open/Save
    // workspace actions live in the Window Manager instead. In a workspace
    // window, these route to the Window Manager.
    const routeToWindowManager = (): void => {
      window.openp41ge.windowManager.open();
    };

    // ── Menu: New Workspace ─────────────────────────────────────────────
    window.openp41ge.onNewWorkspace(async () => {
      if (context.windowType === "window-manager") {
        systemOverlayService.open("create", "workspaces");
      } else {
        routeToWindowManager();
      }
    });

    // ── Menu: Open Workspace ────────────────────────────────────────────
    window.openp41ge.onOpenWorkspace(() => {
      if (context.windowType !== "window-manager") {
        routeToWindowManager();
        return;
      }
      workspaceFileService.openDialog().then((loaded) => {
        if (loaded) {
          systemOverlayService.open("list", "workspaces");
        }
      });
    });

    // ── Menu: Save Workspace As... ──────────────────────────────────────
    window.openp41ge.onSaveWorkspaceAs(async () => {
      if (context.windowType !== "window-manager") {
        routeToWindowManager();
        return;
      }
      if (workspaceFileService.openData) {
        await workspaceFileService.saveAs();
      }
    });

    // ── Menu: View > Workspaces… (opens the system overlay on Workspaces) ──
    window.openp41ge.onOpenWorkspaces(() => {
      if (context.windowType !== "window-manager") {
        routeToWindowManager();
        return;
      }
      systemOverlayService.open("list", "workspaces");
    });

    // ── Menu: View > Logs… (opens the system overlay on Logs) ─────────
    window.openp41ge.onOpenLogs(() => {
      systemOverlayService.open("list", "logs");
    });

    // ── Explorer worktree warning icon → Workspaces overlay at that repo ──
    // A workspace window has no Workspaces overlay, so this routes to the
    // Window Manager (which owns workspace + repo status). A window-manager
    // window opens the overlay tab directly.
    document.addEventListener("openp41ge:focus-workspace-repo", ((e: Event) => {
      const repoName = (e as CustomEvent<{ repoName?: string }>).detail?.repoName;
      if (!repoName) return;
      if (context.windowType === "window-manager") {
        focusRepoInWorkspaces(repoName);
      } else {
        routeToWindowManager();
      }
    }) as EventListener);

    log.info("IPC listeners registered");
  }
}
