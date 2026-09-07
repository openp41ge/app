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

const log = createLogger("openp41ge", "register-ipc-listeners");

import { showConfirmModal } from "../../components/openp41ge-confirm-modal";
import { wireResetListener } from "../../app";
import { highlightChatTab } from "../../services/chat-highlight";

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

    // ── In-window workspace switching is removed from workspace windows ─────
    // Workspace windows are bound to a fixed workspace; workspace actions live
    // in the Window Manager instead. A non-window-manager window routes to it.
    const routeToWindowManager = (): void => {
      window.openp41ge.windowManager.open();
    };

    // ── Menu: View > Logs… (opens the Logs sidebar) ──────────────────
    window.openp41ge.onOpenLogs(() => {
      const winId = window.openp41ge?.workspace?.getWindowId?.();
      if (!winId) return;
      window.openp41ge.workspace.dispatch("openSystemTab", winId, "right", "logs", "Logs");
    });

    // ── Chat highlight (from the Chat sidebar in another window) ───────
    if (window.openp41ge.chat?.onHighlight) {
      window.openp41ge.chat.onHighlight(({ chatId }) => {
        void highlightChatTab(chatId);
      });
    }

    // ── Explorer worktree warning icon → Window Manager at that repo ──
    // The workspaces overlay is gone; every window routes to the Window
    // Manager, which owns workspace + repo status.
    document.addEventListener("openp41ge:focus-workspace-repo", ((e: Event) => {
      const repoName = (e as CustomEvent<{ repoName?: string }>).detail?.repoName;
      if (!repoName) return;
      routeToWindowManager();
    }) as EventListener);

    log.info("IPC listeners registered");
  }
}
