/**
 * Register keyboard shortcuts with the KeyboardManager.
 *
 * All keyboard bindings are registered here. New shortcuts should be added
 * by registering with the keyboardManager, not by adding switch cases.
 *
 * Note: Some shortcut handlers (handleCmdW, handlePinTab, showPanePicker,
 * handleCmdS) are defined as inline fallbacks that log warnings if triggered
 * without proper implementations being registered. These are pre-existing
 * gaps from the legacy code that will be addressed in separate changes.
 */

import type { IStartupStep } from "../startup-step";
import type { StartupContext } from "../startup-context";
import { createLogger } from "openp41ge-logger";

const log = createLogger("bootstrap:register-shortcuts");

import { showCloneDialog } from "../../components/openp41ge-worktree-controller";

export class RegisterShortcutsStep implements IStartupStep {
  readonly name = "register-shortcuts";

  async run(context: StartupContext): Promise<void> {
    const km = context.keyboardManager;

    // ── Window ──────────────────────────────────────────────────────
    km.register({
      modifiers: 8, // Meta
      key: "n",
      code: "KeyN",
      handler: () => window.openp41ge.workspace.cmdNewWindow(),
      description: "New Window",
      category: "Window",
    });

    // ── Tab ─────────────────────────────────────────────────────────
    // Cmd+T for new tab/workset is removed — will be replaced with something else.
    // Keeping the IPC handler for backward compat but the keyboard shortcut is unbound.
    // km.register({ modifiers: 8, key: "t", code: "KeyT", handler: () => window.openp41ge.workspace.cmdNewTab(), description: "New Tab", category: "Tab" });

    km.register({
      modifiers: 8,
      key: "w",
      code: "KeyW",
      handler: () => {
        try {
          // handleCmdW — close tab (delegated to workspace controller)
          window.openp41ge.workspace.cmdCloseTab();
        } catch (err) {
          log.warn("Cmd+W handler error:", err);
        }
      },
      description: "Close Tab",
      category: "Tab",
    });

    km.register({
      modifiers: 12, // Meta + Shift
      key: "p",
      code: "KeyP",
      handler: () => {
        try {
          // handlePinTab — pin/unpin tab
          // This is a placeholder for the pin tab feature
          log.warn("Pin tab shortcut triggered but not yet implemented");
        } catch (err) {
          log.warn("Pin tab handler error:", err);
        }
      },
      description: "Pin / Unpin Tab",
      category: "Tab",
    });

    // ── Pane ────────────────────────────────────────────────────────
    km.register({
      modifiers: 8,
      key: "p",
      code: "KeyP",
      handler: () => {
        try {
          // showPanePicker — opens the pane picker overlay
          // Dispatches the pane-picker event for the grid to handle
          const panePickerEvent = new CustomEvent("openp41ge:show-pane-picker", {
            bubbles: true,
            composed: true,
          });
          document.dispatchEvent(panePickerEvent);
        } catch (err) {
          log.warn("Pane picker handler error:", err);
        }
      },
      description: "Show Pane Picker",
      category: "Pane",
    });

    // ── File ────────────────────────────────────────────────────────
    km.register({
      modifiers: 8,
      key: "b",
      code: "KeyB",
      handler: () => {
        try {
          const ws = context.workspaceState.getWorkspace();
          if (!ws) return;
          const myWindowId = window.openp41ge?.workspace?.getWindowId?.();
          if (!myWindowId) return;
          const win = ws.windows.find((w) => w.id === myWindowId);
          if (!win) return;
          context.commandBus.dispatch("toggleSidebarViewOp", myWindowId, "explorer");
        } catch (_err) {
          // ignore
        }
      },
      description: "Toggle Projects Secondary Sidebar",
      category: "View",
    });

    km.register({
      modifiers: 12, // Meta + Shift
      key: "o",
      code: "KeyO",
      handler: () => {
        try {
          showCloneDialog();
        } catch (err) {
          log.warn("Clone dialog shortcut error:", err);
        }
      },
      description: "Clone Repository",
      category: "File",
    });

    // ── View: Zoom ──────────────────────────────────────────────────
    const zoomIn = () => context.zoomService.zoomIn();

    km.register({
      modifiers: 12, // Meta + Shift
      key: "+",
      code: "Equal",
      handler: zoomIn,
      description: "Zoom In",
      category: "View",
    });
    km.register({
      modifiers: 12,
      key: "=",
      code: "Equal",
      handler: zoomIn,
      description: "Zoom In",
      category: "View",
    });
    km.register({
      modifiers: 8,
      key: "=",
      code: "Equal",
      handler: zoomIn,
      description: "Zoom In",
      category: "View",
    });

    km.register({
      modifiers: 8,
      key: "-",
      code: "Minus",
      handler: () => context.zoomService.zoomOut(),
      description: "Zoom Out",
      category: "View",
    });
    km.register({
      modifiers: 8,
      key: "_",
      code: "Minus",
      handler: () => context.zoomService.zoomOut(),
      description: "Zoom Out",
      category: "View",
    });

    km.register({
      modifiers: 8,
      key: "0",
      code: "Digit0",
      handler: () => context.zoomService.zoomReset(),
      description: "Reset Zoom",
      category: "View",
    });

    // ── File: Save ──────────────────────────────────────────────────
    const handleSave = () => {
      try {
        // handleCmdS — save file (dispatches via command bus)
        context.commandBus.dispatch("saveActiveFile");
      } catch (err) {
        log.warn("Save handler error:", err);
      }
    };

    km.register({
      modifiers: 8,
      key: "s",
      code: "KeyS",
      handler: handleSave,
      description: "Save File",
      category: "File",
    });
    km.register({
      modifiers: 1, // Ctrl
      key: "s",
      code: "KeyS",
      handler: handleSave,
      description: "Save File",
      category: "File",
    });

    // ── Global keydown listener ─────────────────────────────────────
    document.addEventListener("keydown", (e) => {
      km.handleKeyDown(e);
    });

    log.info("keyboard shortcuts registered");
  }
}
