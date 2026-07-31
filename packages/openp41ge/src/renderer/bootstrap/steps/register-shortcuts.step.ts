/**
 * Register keyboard shortcuts with the KeyboardManager.
 *
 * All keyboard bindings are registered here. New shortcuts should be added
 * by registering with the keyboardManager, not by adding switch cases.
 */

import type { IStartupStep } from "../startup-step";
import type { StartupContext } from "../startup-context";
import { emitEvent } from "../../app";
import { createLogger } from "openp41ge-logger";

const log = createLogger("bootstrap:register-shortcuts");

import { showCloneDialog } from "../../components/openp41ge-worktree-controller";
import { Openp41geTabsEventHandler } from "../../services/openp41ge-tabs-event-handler";

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
          // Close the tab in the focused cell using the last focused column.
          // This is handled in the renderer (not IPC) so we can use the
          // focus tracking from Openp41geTabsEventHandler.
          const ws = context.workspaceState.getWorkspace();
          if (!ws) return;
          const myWindowId = window.openp41ge?.workspace?.getWindowId?.();
          if (!myWindowId) return;
          const win = ws.windows.find((w) => w.id === myWindowId);
          if (!win) return;

          // Get the last focused column, falling back to the first placement
          const focusedCol = Openp41geTabsEventHandler.getLastFocusedCol(myWindowId);
          const placement = win.grid.placements.find((p) => p.position.col === focusedCol)
            ?? win.grid.placements[0];
          if (!placement || placement.tabIds.length === 0) return;
          const activeTabId = placement.activeTabId ?? placement.tabIds[0];
          if (!activeTabId) return;

          emitEvent("tab-remove-from-cell", { windowId: myWindowId, paneId: activeTabId });
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
          emitEvent("tab-open-system", { windowId: myWindowId, side: "right", appType: "explorer", title: "Explorer" });
        } catch (_err) {
          // ignore
        }
      },
      description: "Open Explorer",
      category: "View",
    });

    // Cmd+Shift+G opens Git in the right sidebar
    km.register({
      modifiers: 12,
      key: "g",
      code: "KeyG",
      handler: () => {
        try {
          const myWindowId = window.openp41ge?.workspace?.getWindowId?.();
          if (!myWindowId) return;
          emitEvent("sidebar-open", { windowId: myWindowId, side: "right", appType: "" });
          emitEvent("tab-open-system", { windowId: myWindowId, side: "right", appType: "git", title: "Git" });
        } catch (_err) {
          // ignore
        }
      },
      description: "Open Git",
      category: "View",
    });

    // Cmd+Shift+F opens Search in the right sidebar
    km.register({
      modifiers: 12,
      key: "f",
      code: "KeyF",
      handler: () => {
        try {
          const myWindowId = window.openp41ge?.workspace?.getWindowId?.();
          if (!myWindowId) return;
          emitEvent("tab-open-system", { windowId: myWindowId, side: "right", appType: "search", title: "Search" });
        } catch (_err) {
          // ignore
        }
      },
      description: "Open Search",
      category: "View",
    });

    // Cmd+Shift+P opens Project Picker in the right sidebar
    km.register({
      modifiers: 12,
      key: "p",
      code: "KeyP",
      handler: () => {
        try {
          const myWindowId = window.openp41ge?.workspace?.getWindowId?.();
          if (!myWindowId) return;
          emitEvent("tab-open-system", { windowId: myWindowId, side: "right", appType: "projects", title: "Projects" });
        } catch (_err) {
          // ignore
        }
      },
      description: "Open Project Picker",
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

    // ── Global keydown listener ─────────────────────────────────────
    document.addEventListener("keydown", (e) => {
      km.handleKeyDown(e);
    });

    log.info("keyboard shortcuts registered");
  }
}
