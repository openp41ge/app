import type { IStartupStep } from "../startup-step";
import type { StartupContext } from "../startup-context";
import { createLogger } from "openp41ge-logger";
import type { HandlerFn } from "../../services/event-router";
import { EventRouter } from "../../services/event-router";
import { EventGraph, type GraphData } from "../../services/event-graph";
import { EventLogBuffer } from "../../services/event-log-buffer";
import { appState } from "../../services/app-state";
import { workspaceData } from "../../services/workspace-data";
import { DOMBridge } from "../../services/dom-bridge";
import { PluginRegistry } from "../../services/plugin-registry";
import { createFocusHandlers } from "../../handlers/focus-state.handlers";
import { createTabHandlers } from "../../handlers/tabs.handlers";
import { createLayoutHandlers } from "../../handlers/layout.handlers";
import { initDebugAPI } from "../../debug-api";
import { workspaceFileService } from "../../services/workspace-file-service";
import { setEventRouter } from "../../app";

/**
 * Bootstrap step: initialize the event controller system.
 *
 * 1. Load the base graph from the embedded JSON data
 * 2. Create the router with core handlers
 * 3. Start the DOM bridge
 * 4. Wire the debug API
 */
export class InitEventControllerStep implements IStartupStep {
  readonly name = "init-event-controller";
  private readonly _log = createLogger("init-event-controller");

  async run(context: StartupContext): Promise<void> {
    const log = this._log;

    // 1. Load base graph
    const graph = new EventGraph();
    const graphData = await this._loadGraphData();
    const errors = graph.load(graphData);
    if (errors.length > 0) {
      log.warn("Graph validation errors:", errors);
    }

    // 2. Create log buffer
    const logBuffer = new EventLogBuffer(500);

    // 3. Create plugin registry (before router — plugins register handlers)
    const pluginRegistry = new PluginRegistry();

    // 4. Build core handlers
    const handlers: Record<string, HandlerFn> = {
      ...createFocusHandlers(appState),
      ...createTabHandlers(context.commandBus),
      ...createLayoutHandlers(context.commandBus),
    };

    // 5. Create router
    const router = new EventRouter({ graph, state: appState, logBuffer, handlers });

    // 6. Connect plugin registry to graph + router
    pluginRegistry.connect(graph, router);

    // Expose router globally so components can emit events
    setEventRouter(router);

    // 7. Register workspace refresh handler
    router.registerHandler("workspace/refresh-data", async () => {
      // Refresh workspace data when workspace changes (repo opened, etc.)
      try {
        const repos = await window.openp41ge.workspaceController.listRepos();
        workspaceData.repos = [];
        for (const repo of repos) {
          workspaceData.addRepo({
            id: `repo-${repo.name}`,
            path: repo.path,
            name: repo.name,
          });
        }
      } catch {
        // ignore — controller may not be ready
      }
    });

    // 8. Register core keyboard handlers
    router.registerHandler("keyboard/suppress", async () => {
      const t = Date.now() + 500;
      appState.shortcutsSuppressedUntil = t;
      context.keyboardManager.suppressUntil = t;
    });
    router.registerHandler("keyboard/clear-suppress", async () => {
      appState.shortcutsSuppressedUntil = 0;
      context.keyboardManager.suppressUntil = 0;
    });

    // 8. Start DOM bridge
    const domBridge = new DOMBridge(router);
    domBridge.attach();

    // 9. Wire debug API
    initDebugAPI(appState, workspaceData, graph, logBuffer, pluginRegistry, workspaceFileService);

    // Store references on the context for other steps/services to use
    const ctx = context as StartupContext & Record<string, unknown>;
    ctx.__eventController = {
      graph,
      router,
      logBuffer,
      pluginRegistry,
      domBridge,
    };
  }

  private async _loadGraphData(): Promise<GraphData> {
    try {
      const module = await import("../../../../data/event-routing-graph.json");
      return (module.default ?? module) as GraphData;
    } catch (err) {
      this._log.warn("Could not load graph JSON, using empty graph.");
      return { version: 1, nodes: [], edges: [] };
    }
  }
}
