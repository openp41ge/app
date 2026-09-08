/**
 * Register keyboard shortcuts with the KeyboardManager.
 *
 * All keyboard bindings are registered here. New shortcuts should be added
 * by registering with the keyboardManager, not by adding switch cases.
 */

import type { IStartupStep } from "../startup-step";
import type { StartupContext } from "../startup-context";
import { emitEvent } from "../../app";
import { resolveCmdWTarget } from "../../services/cmd-w-target";
import { TabActivationHistory } from "../../services/tab-activation-history";
import { createLogger } from "openp41ge-logger";

const log = createLogger("openp41ge", "register-shortcuts");

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
        // Non-workspace windows (e.g. the Window Manager) have no grid to
        // close a tab in — Cmd+W closes the window itself.
        if (context.windowType !== "workspace") {
          window.openp41ge.window.close();
          return;
        }
        try {
          const ws = context.workspaceState.getWorkspace();
          const myWindowId = window.openp41ge?.workspace?.getWindowId?.();
          if (!myWindowId) return;

          // Close the next grid tab in activation-history order (most-recently
          // activated first, ignoring sidebar focus). When no grid tabs remain,
          // close the window. Sidebar (system) tabs are never closed by Cmd+W.
          const target = resolveCmdWTarget(ws, myWindowId);
          if (!target) return;
          if (target.kind === "close-window") {
            window.openp41ge.window.close();
            return;
          }
          emitEvent("tab-remove-from-cell", {
            windowId: myWindowId,
            paneId: target.tabId,
          });
          // Drop the closed tab from the activation history so Back/Forward
          // never navigate to it again.
          TabActivationHistory.remove(myWindowId, target.tabId);
        } catch (err) {
          log.warn("Cmd+W handler error:", err);
        }
      },
      description: "Close Tab",
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

    // ── View: Sidebar toggles ───────────────────────────────────────
    // Cmd+B toggles the primary (right) sidebar
    km.register({
      modifiers: 8,
      key: "b",
      code: "KeyB",
      handler: () => {
        try {
          const myWindowId = window.openp41ge?.workspace?.getWindowId?.();
          if (!myWindowId) return;
          emitEvent("sidebar-toggle", { windowId: myWindowId, side: "right" });
        } catch (_err) {
          // ignore
        }
      },
      description: "Toggle Right Sidebar",
      category: "View",
    });

    // Cmd+Option+B toggles the secondary (left) sidebar
    km.register({
      modifiers: 10,
      key: "b",
      code: "KeyB",
      handler: () => {
        try {
          const myWindowId = window.openp41ge?.workspace?.getWindowId?.();
          if (!myWindowId) return;
          emitEvent("sidebar-toggle", { windowId: myWindowId, side: "left" });
        } catch (_err) {
          // ignore
        }
      },
      description: "Toggle Left Sidebar",
      category: "View",
    });

    // Cmd+Shift+E opens Explorer in the right sidebar
    km.register({
      modifiers: 12,
      key: "e",
      code: "KeyE",
      handler: () => {
        try {
          const myWindowId = window.openp41ge?.workspace?.getWindowId?.();
          if (!myWindowId) return;
          emitEvent("sidebar-open", { windowId: myWindowId, side: "right", appType: "" });
          emitEvent("tab-open-system", {
            windowId: myWindowId,
            side: "right",
            appType: "explorer",
            title: "Explorer",
          });
        } catch (_err) {
          // ignore
        }
      },
      description: "Open Explorer",
      category: "View",
    });

    // Cmd+Shift+H opens History in the right sidebar
    km.register({
      modifiers: 12,
      key: "h",
      code: "KeyH",
      handler: () => {
        try {
          const myWindowId = window.openp41ge?.workspace?.getWindowId?.();
          if (!myWindowId) return;
          emitEvent("sidebar-open", { windowId: myWindowId, side: "right", appType: "" });
          emitEvent("tab-open-system", {
            windowId: myWindowId,
            side: "right",
            appType: "git",
            title: "History",
          });
        } catch (_err) {
          // ignore
        }
      },
      description: "Open History",
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
        emitEvent("file-save-active", {});
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

    // ── App logs (Cmd+Shift+D) ───────────────────────────────────────
    // Opens the Logs sidebar (the overlay's Logs tab was replaced by the
    // sidebar + grid log tabs).
    km.register({
      modifiers: 12, // Meta + Shift
      key: "d",
      code: "KeyD",
      handler: () => {
        const winId = window.openp41ge?.workspace?.getWindowId?.();
        if (!winId) return;
        window.openp41ge.workspace.dispatch("openSystemTab", winId, "right", "logs", "Logs");
      },
      description: "Open Logs sidebar",
      category: "Debug",
    });

    // ── Global keydown listener ─────────────────────────────────────
    document.addEventListener("keydown", (e) => {
      km.handleKeyDown(e);
    });

    log.info("keyboard shortcuts registered");
  }
}
