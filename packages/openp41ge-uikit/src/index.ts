export { Openp41geIcon } from "./components/openp41ge-icon";
export type { IconName } from "./components/openp41ge-icon";
export { iconRegistry } from "./icons/registry";
export { SideHeader } from "./components/side-header";
export { RepoRow } from "./components/repo-row";
export { WorktreeRow } from "./components/worktree-row";
export type { RepoEntry, WorktreeEntry } from "./types";

// Re-export the inline tailwind CSS for component static styles
export { tailwindCSS } from "./generated/tailwind";

// Re-export theme definitions from the merged openp41ge-themes package
export * from "./theme";

// ─── Tabs (merged from openp41ge-tabs) ────────────────────────────────────
export type {
  IDragSource,
  IDropTarget,
  IDragHandler,
  DragSourceData,
  DragResult,
  TargetFeedback,
  GhostFactory,
} from "./tabs/interfaces";
export { TabDragSource } from "./tabs/sources/tab-drag-source";
export { TabBarDropTarget, TAB_BAR_EVENTS } from "./tabs/targets/tab-bar-drop-target";
export { GridDropTarget, GRID_EVENTS } from "./tabs/targets/grid-drop-target";
export type { WorkspaceLike, GridElementLike } from "./tabs/targets/grid-drop-target";
export { DragOrchestrator, DRAG_EVENTS, defaultTargetResolver } from "./tabs/orchestrator";
export type { TargetResolver } from "./tabs/orchestrator";
export { GhostManager } from "./tabs/ghost-manager";
export type { GhostPreview } from "./tabs/ghost-manager";
export { computeGhostLayout } from "./tabs/ghost-layout";
export type { GhostColumn } from "./tabs/ghost-layout";
export { CursorManager } from "./tabs/cursor-manager";
export { TabGrid, TabBar, TabView, TabContent } from "./tabs/components/index";
export {
  INSERT_BOUNDARY_THRESHOLD,
  classifyGridPosition,
  getDividerPositions,
  computeDropTarget,
  getDropIndexInBar,
  splitCellForBoundary,
  isSameFilePathInCell,
} from "./tabs/boundary";
export type { GridPosition } from "./tabs/boundary";

// ─── Syntax Highlighting (merged from openp41ge-syntax-highlighting) ─────
export {
  LazyTokenizationManager,
  TextMateTokenizer,
  pickBestScope,
  decodeTokens,
  StandardTokenType,
  FontStyle,
  ContiguousTokensStore,
  initTextMate,
  resetTextMateInit,
  EncodedTokenAttributes,
  TokenRegistry,
  BUILTIN_LANGUAGES,
} from "./syntax-highlighting/tokenization";
export type {
  ITokenizer,
  StateStack,
  IToken,
  ITokenizeLineResult,
  TokenizationConfig,
  LanguageDefinition,
} from "./syntax-highlighting/tokenization";
export type { ISyntaxHighlighter, IGrammar, IGrammarRegistry } from "./syntax-highlighting/interfaces";
export { SyntaxHighlighter, highlightCode, escapeHtml } from "./syntax-highlighting/services/syntax-highlighter";
export type { HighlightResult } from "./syntax-highlighting/services/syntax-highlighter";
export { renderTokensToHtml } from "./syntax-highlighting/services/token-html-renderer";

// ─── Git Repository Browser (merged from openp41ge-git-repository) ────────
export { FileEditorElement } from "./file-editor/file-editor";
export type { FileEditorState } from "./file-editor/file-editor";

// Full file-editor API available at "openp41ge-uikit/file-editor"

// ─── Git Repository Browser (merged from openp41ge-git-repository) ────────
export { gitBrowserRenderer } from "./git-repository/git-browser-renderer";

// ─── Tree Component ──────────────────────────────────────────────────────
export { Openp41geTree } from "./tree";
export type {
  TreeNode,
  TreeNodeAction,
  DropPosition,
  TreeNodeClickEventDetail,
  TreeNodeToggleEventDetail,
  TreeNodeActionEventDetail,
  TreeDragStartEventDetail,
  TreeDropEventDetail,
} from "./tree";
export type {
  GitBrowserData,
  GitBrowserCallbacks,
  BranchEntry,
  CommitEntry,
  DiffStatEntry,
} from "./git-repository/types";
