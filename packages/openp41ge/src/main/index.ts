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
