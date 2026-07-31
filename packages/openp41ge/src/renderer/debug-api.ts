import type { EventGraph } from "./services/event-graph";
import type { EventLogBuffer, LogEntry, LogFilter } from "./services/event-log-buffer";
import type { AppState } from "./services/app-state";
import type { WorkspaceData } from "./services/workspace-data";
import type { PluginRegistry, PluginRegistration } from "./services/plugin-registry";
import type { WorkspaceFileService } from "./services/workspace-file-service";

export interface DebugAPI {
  state: AppState;
  workspace: WorkspaceData;
  logs: {
    getLogs(filter?: LogFilter): LogEntry[];
    getEvent(eventId: string): LogEntry | undefined;
    clear(): void;
  };
  graph: {
    hash(): string;
    nodes(): { id: string }[];
    edges(): { id: string; from: string; when: any; to: string[] }[];
  };
  plugins: PluginRegistration[];
  workspaceFile: WorkspaceFileService;
}

/**
 * Wires up window.__openp41ge_debug for agent-side debugging.
 */
export function initDebugAPI(
  appState: AppState,
  workspaceData: WorkspaceData,
  graph: EventGraph,
  logBuffer: EventLogBuffer,
  pluginRegistry: PluginRegistry,
  workspaceFile: WorkspaceFileService,
): void {
  const api: DebugAPI = {
    state: appState,
    workspace: workspaceData,
    logs: {
      getLogs: (filter) => logBuffer.getLogs(filter),
      getEvent: (eventId) => logBuffer.getEvent(eventId),
      clear: () => logBuffer.clear(),
    },
    graph: {
      hash: () => graph.hash(),
      nodes: () => graph.nodes,
      edges: () => graph.edges,
    },
    plugins: pluginRegistry.getAll(),
    workspaceFile,
  };

  (window as any).__openp41ge_debug = api;
}
