/**
 * Openp41ge renderer — creates the bootstrap pipeline and starts it.
 *
 * This file is intentionally thin. All startup logic is in the bootstrap
 * module (bootstrap/), where each responsibility is its own step class.
 *
 * Design:
 *   - StartupContext holds all injected service instances (DI container)
 *   - Each IStartupStep has one responsibility
 *   - RendererBootstrap runs steps serially, catching errors per step
 *   - The UI renders synchronously on start(), before any async step
 *
 * Legacy exports (getWorkspace, dispatch, appServices) are preserved for
 * backward compatibility while components migrate to DI.
 */

import { createLogger } from "openp41ge-logger";
const log = createLogger("app");

// ─── Component registration (side-effect imports — must be at module level) ──
import "./components/openp41ge-windowview";
import "./components/openp41ge-project-picker";
import "./components/openp41ge-titlebar";
import "./components/openp41ge-topbar";
import "./components/openp41ge-contextmenu";
import "./components/openp41ge-pane-picker";
import "./components/openp41ge-worktree-tree";
import "./components/openp41ge-activity-bar";
import "./components/openp41ge-sidebar";
import "./components/focus-section";

// Import openp41ge-tabs components (registers <tab-grid>, <tab-bar>, <tab-content>)
import "openp41ge-tabs";

// ─── Theme CSS variables (bundled by Vite) ────────────────────────────────
import "../styles/themes.css";

// ─── Bootstrap imports ───────────────────────────────────────────────────
import {
  RendererBootstrap,
  StartupContext,
  ExposeTestModelsStep,
  RegisterAppTypesStep,
  InitServicesStep,
  LoadConfigStep,
  RegisterEventListenersStep,
  FetchInitialStateStep,
  SubscribeStateUpdatesStep,
  RegisterShortcutsStep,
  RegisterIpcListenersStep,
  StartQuoteControllerStep,
  SignalReadyStep,
} from "./bootstrap/index";
import { CheckProjectStep } from "./bootstrap/steps/check-project.step";

import type { Workspace } from "../layout/types";

// ═══════════════════════════════════════════════════════════════════════════
// Bootstrap pipeline
// ═══════════════════════════════════════════════════════════════════════════

const context = new StartupContext();

const steps = [
  new ExposeTestModelsStep(), // 1: Expose test models for test injection
  new RegisterAppTypesStep(), // 2: Register app types
  new InitServicesStep(), // 3: Wire cross-service dependencies
  new SubscribeStateUpdatesStep(), // 4: ** Register render subscriber BEFORE any async **
  new CheckProjectStep(), // 5: Check for active project; show picker if needed
  new RegisterEventListenersStep(), // 6: Document-level event listeners
  new FetchInitialStateStep(), // 7: ** Async: fetch + set state → subscriber fires → UI RENDERS **
  new LoadConfigStep(), // 8: Async: load config (cosmetic, after UI is visible)
  new RegisterShortcutsStep(), // 9: Keyboard shortcuts
  new RegisterIpcListenersStep(), // 10: Zoom + confirm IPC listeners
  new StartQuoteControllerStep(), // 11: Quote rotation
  new SignalReadyStep(), // 12: Signal readiness
];

const bootstrap = new RendererBootstrap(steps, context);

// ═══════════════════════════════════════════════════════════════════════════
// Legacy exports (for backward compat while components migrate to DI)
// ═══════════════════════════════════════════════════════════════════════════

/** @deprecated Use context.workspaceState.getWorkspace() instead. */
export function getWorkspace(): Workspace | null {
  return context.workspaceState.getWorkspace();
}

/** @deprecated Use context.commandBus.dispatch() instead. */
export function dispatch(fn: string, ...args: unknown[]) {
  context.commandBus.dispatch(fn, ...args);
}

/**
 * @deprecated Components should receive services via DI.
 * Legacy access for components that haven't migrated yet.
 */
export const appServices = {
  commandBus: context.commandBus,
  workspaceState: context.workspaceState,
  keyboardManager: context.keyboardManager,
  zoomService: context.zoomService,
  configService: context.configService,
  fileOpenHandler: context.fileOpenHandler,
  contextMenuBuilder: context.contextMenuBuilder,
  quoteController: context.quoteController,
  fileDropHandler: context.fileDropHandler,
  modelRegistry: context.modelRegistry,
};

// ═══════════════════════════════════════════════════════════════════════════
// App reset function (for test fast-reset)
// ═══════════════════════════════════════════════════════════════════════════

import { unmountAllControllers } from "./controllers/registry";
import { resetTabDragState } from "./services/drag-context";

/**
 * Renderer-side teardown for app state reset.
 *
 * The reset happens in two parts across processes:
 *   1. Main process — resets OperationDispatcher state and broadcasts fresh
 *      workspace to all windows (handled by workspace:reset IPC handler).
 *   2. Renderer    — this function: cancel drags, unmount controllers, clear
 *      module-level state, remove DOM overlays.
 *
 * The main process broadcast triggers the existing onStateUpdate subscriber,
 * which calls WorkspaceStateManager.setState() and re-renders the UI.
 *
 * Used by tests to reuse a single Electron instance across scenarios.
 */
export function resetApp(): void {
  // ── Phase A: Teardown ─────────────────────────────────────────────────

  // 1. Clear tab drag state (module-level)
  resetTabDragState();

  // 4. Unmount all pane controllers and clear registry
  unmountAllControllers();

  // 5. Remove any lingering DOM overlays (ghost, indicator, context menu, confirm modal)
  document
    .querySelectorAll(
      ".openp41ge-ghost-overlay, .openp41ge-split-overlay, .openp41ge-cell-target-highlight, " +
        "" +
        ".openp41ge-confirm-modal, .prompt-overlay, .tab-drop-indicator",
    )
    .forEach((el) => el.remove());

  // 6. Clear the #root contents (remove all openp41ge-windowview children)
  const root = document.getElementById("root");
  if (root) {
    root.innerHTML = "";
  }

  // 7. Clear any pending file/state globals
  window.__pendingFilePath = null;
  window.__pendingFileName = undefined;
  window.__pendingGitRepo = null;

  log.info("app reset complete (renderer teardown done; main process broadcast will re-render)");
}

/**
 * Wire the IPC listener so window.openp41ge.workspace.reset() triggers resetApp().
 * Called during the register-ipc-listeners bootstrap step.
 */
export function wireResetListener(): void {
  window.openp41ge.workspace.onReset(() => {
    resetApp();
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Singleton renderer
// ═══════════════════════════════════════════════════════════════════════════

export const renderer = {
  /** Start the renderer bootstrap. Returns immediately — UI renders synchronously. */
  start(): void {
    log.info("starting renderer");

    // Start the bootstrap (returns a promise, but we don't await it)
    // The UI renders synchronously in the first phase of start()
    bootstrap.start().catch((err) => {
      log.error("bootstrap failed:", err);
    });
  },
};
