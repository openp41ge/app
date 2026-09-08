/**
 * StartupContext — shared mutable state and injected services for bootstrap steps.
 *
 * All services are injected via constructor so tests can substitute mocks.
 * Mutable state (initialWorkspace, windowId) is set by steps and read by
 * subsequent steps.
 *
 * Because TypeScript interfaces don't exist for some services (ConfigService,
 * FileOpenHandler, etc.), we use the concrete types. For testing, the test
 * creates its own instances (possibly of test doubles that extend the originals).
 */

import type { ICommandBus } from "../interfaces/command-bus";
import type { IWorkspaceStateManager } from "../interfaces/workspace-state-manager";
import type { IKeyboardManager } from "../interfaces/keyboard-manager";
import type { IZoomService } from "../interfaces/zoom-service";
import type { IQuoteController } from "../interfaces/quote-controller";
import type { IFileOpenHandler } from "../interfaces/file-open-handler";
import type { IFileDropHandler } from "../interfaces/file-drop-handler";
import type { IContextMenuBuilder } from "../interfaces/context-menu-builder";
import type { EventGraph } from "../services/event-graph";
import type { EventRouter } from "../services/event-router";
import type { EventLogBuffer } from "../services/event-log-buffer";
import type { PluginRegistry } from "../services/plugin-registry";
import type { DOMBridge } from "../services/dom-bridge";

import { WorkspaceStateManager } from "../services/workspace-state-manager";
import { CommandBus } from "../services/command-bus";
import { KeyboardManager } from "../services/keyboard-manager";
import { ZoomService } from "../services/zoom-service";
import { ConfigService } from "../services/config-service";
import { FileOpenHandler } from "../services/file-open-handler";
import { CommitOpenHandler } from "../services/commit-open-handler";
import { AgentsOpenHandler } from "../services/agents-open-handler";
import { LogOpenHandler } from "../services/log-open-handler";
import { SettingsOpenHandler } from "../services/settings-open-handler";
import { ContextMenuBuilder } from "../services/context-menu-builder";
import { QuoteController } from "../services/quote-controller";
import { FileDropHandler } from "../services/file-drop-handler";
import { Openp41geTabsEventHandler } from "../services/openp41ge-tabs-event-handler";
import { TabMountManager } from "../services/tab-mount-manager";
import { ModelRegistry } from "../models/model-registry";
import { initDragSystem } from "../services/init-drag-system";
import { initRendererLogTransport } from "../services/renderer-log-transport";

import type { Workspace } from "../../layout/types";

/** Kinds of window the renderer can boot as. Mirrors `Openp41geWindowType`. */
export type RendererWindowType = "workspace" | "window-manager";

export class StartupContext {
  // ── Injected services ──────────────────────────────────────────────
  readonly commandBus: ICommandBus;
  readonly workspaceState: IWorkspaceStateManager;
  readonly keyboardManager: IKeyboardManager;
  readonly zoomService: IZoomService;
  readonly configService: ConfigService;
  readonly fileOpenHandler: IFileOpenHandler;
  readonly commitOpenHandler: CommitOpenHandler;
  readonly agentsOpenHandler: AgentsOpenHandler;
  readonly logOpenHandler: LogOpenHandler;
  readonly settingsOpenHandler: SettingsOpenHandler;
  readonly contextMenuBuilder: IContextMenuBuilder;
  readonly quoteController: IQuoteController;
  readonly fileDropHandler: IFileDropHandler;
  readonly openp41geTabsEventHandler: Openp41geTabsEventHandler;
  readonly tabMountManager: TabMountManager;
  readonly modelRegistry: ModelRegistry;

  // ── Pre-started IPC promises (fired early, awaited later) ───────────
  /**
   * Promise for the initial workspace state, started at bootstrap time
   * so the IPC call is in flight while sync steps execute.
   * Set by RendererBootstrap.start() before any steps run.
   */
  initialStatePromise: Promise<string> | null = null;

  // ── Mutable state set by steps ──────────────────────────────────────
  /** Initial workspace state fetched from main process. */
  initialWorkspace: Workspace | null = null;

  /** This window's ID, resolved during startup. */
  windowId: string | null = null;

  /**
   * The kind of window this renderer is hosting. Workspace windows run the full
   * app; window-manager windows run a thin workspace-picker view. Populated by
   * the `resolve-window-kind` bootstrap step (defaults to "workspace").
   */
  windowType: RendererWindowType = "workspace";

  /**
   * The `.openp41ge-workspace` path this window is bound to, or null when the
   * window has no workspace binding (e.g. a window-manager window).
   */
  workspacePath: string | null = null;

  // ── Ad-hoc references set by steps ───────────────────────────────────
  /**
   * Event-system references (graph, router, log buffer, plugin registry,
   * DOM bridge) populated by the init-event-controller step during bootstrap.
   */
  __eventController?: {
    graph: EventGraph;
    router: EventRouter;
    logBuffer: EventLogBuffer;
    pluginRegistry: PluginRegistry;
    domBridge: DOMBridge;
  };

  constructor() {
    // Instantiate all services (only construction, no init/wiring)
    this.commandBus = new CommandBus();
    this.workspaceState = new WorkspaceStateManager();
    this.keyboardManager = new KeyboardManager();
    this.zoomService = new ZoomService();
    this.configService = new ConfigService();
    this.fileOpenHandler = new FileOpenHandler();
    this.commitOpenHandler = new CommitOpenHandler();
    this.agentsOpenHandler = new AgentsOpenHandler();
    this.logOpenHandler = new LogOpenHandler();
    this.settingsOpenHandler = new SettingsOpenHandler();
    this.contextMenuBuilder = new ContextMenuBuilder();
    this.quoteController = new QuoteController();
    this.fileDropHandler = new FileDropHandler();
    this.openp41geTabsEventHandler = new Openp41geTabsEventHandler();
    this.tabMountManager = new TabMountManager();
    this.modelRegistry = new ModelRegistry();
  }

  /**
   * Wire cross-service dependencies after all services are constructed.
   * Called as part of the init-services step.
   */
  wireServices(): void {
    this.contextMenuBuilder.init(this.commandBus);
    this.fileOpenHandler.init(this.commandBus, this.workspaceState, this.tabMountManager);
    this.commitOpenHandler.init(this.commandBus, this.workspaceState);
    this.agentsOpenHandler.init(this.commandBus, this.workspaceState);
    this.logOpenHandler.init(this.commandBus, this.workspaceState);
    this.settingsOpenHandler.init(this.commandBus, this.workspaceState);
    this.fileDropHandler.init(this.commandBus);

    // Initialize Openp41geTabsEventHandler to handle tab-grid custom events
    this.openp41geTabsEventHandler.init(this.commandBus, this.tabMountManager, {
      getWorkspace: () => this.workspaceState.getWorkspace(),
    });

    // Initialize tab drag-and-drop system
    initDragSystem();

    // Forward renderer log bus to the main process (~/.openp41ge/logs).
    initRendererLogTransport();
  }
}
