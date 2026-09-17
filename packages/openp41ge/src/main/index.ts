export type * from "./interfaces/index.js";
export { NodeGitService } from "./services/node-git-service.js";
export { NodeGitCommitService } from "./services/node-git-commit-service.js";
export type {
  IGitCommitService,
  CommitEntry,
  BranchEntry,
  DiffStatEntry,
} from "./interfaces/git-commit-service.js";
export { ElectronFileSystem } from "./services/electron-file-system.js";
export { TerminalManager } from "./services/terminal-manager.js";
export { DragGhostManager } from "./services/drag-ghost-manager.js";
export { OperationDispatcher } from "./services/operation-dispatcher.js";
export { TabNameGenerator } from "./services/tab-name-generator.js";
export { ConfigService } from "./services/config-service.js";
export type { UserConfig } from "./services/config-service.js";
export { WorkspaceStateStore } from "./services/workspace-state-store.js";
export {
  FileWorkspaceSessionStore,
  type WorkspaceSessionStore,
} from "./services/workspace-session-store.js";
export { LogFileStore } from "./services/log-file-store.js";
export type { LogFileInfo, PersistedLogEntry } from "./services/log-file-store.js";

export { ChatStoreService, searchChats, toSummary } from "./services/chat-store-service.js";
export { ChatProviderRegistry } from "./services/chat-provider-registry.js";
export { VllmChatProvider } from "./services/vllm-chat-provider.js";
export { ToolRegistry } from "./services/tool-registry.js";
export { registerBuiltinTools } from "./services/node-tool-executor.js";
export { AgentRuntime } from "./services/agent-runtime.js";
export type { AgentRuntimeConfig, ConnectedWorktree } from "./services/agent-runtime.js";
export type { AgentRuntimeHooks } from "./services/agent-runtime-hooks.js";
export type {
  ChatProvider,
  ChatProviderConfig,
  ChatProviderFactory,
  ProviderDelta,
  ChatStreamRequest,
} from "./interfaces/chat-provider.js";
export type {
  AgentTool,
  ToolDefinition,
  ToolParameters,
  ToolExecutionContext,
  ToolExecutionResult,
} from "./interfaces/tool.js";
