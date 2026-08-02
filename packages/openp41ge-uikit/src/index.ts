export { Openp41geIcon } from "./components/openp41ge-icon";
export type { IconName } from "./components/openp41ge-icon";
export { Openp41geInlineIcon } from "./components/openp41ge-inline-icon";
export { FileExtensionSvg } from "./components/file-extension-svg";
export { iconRegistry } from "./icons";

// Re-export the inline tailwind CSS for component static styles
export { tailwindCSS } from "./generated/tailwind";

// Re-export theme definitions from the merged openp41ge-themes package
export * from "./theme";

// ─── Tabs (from openp41ge-tabs) ────────────────────────────────────────────
export type {
  IDragSource,
  IDropTarget,
  IDragHandler,
  DragSourceData,
  DragResult,
  TargetFeedback,
  GhostFactory,
} from "openp41ge-tabs/interfaces";
export { TabDragSource } from "openp41ge-tabs/sources/tab-drag-source";
export { TabBarDropTarget, TAB_BAR_EVENTS } from "openp41ge-tabs/targets/tab-bar-drop-target";
export { GridDropTarget, GRID_EVENTS } from "openp41ge-tabs/targets/grid-drop-target";
export type { WorkspaceLike, GridElementLike } from "openp41ge-tabs/targets/grid-drop-target";
export { DragOrchestrator, DRAG_EVENTS, defaultTargetResolver } from "openp41ge-tabs/orchestrator";
export type { TargetResolver } from "openp41ge-tabs/orchestrator";
export { GhostManager } from "openp41ge-tabs/ghost-manager";
export type { GhostPreview } from "openp41ge-tabs/ghost-manager";
export { computeGhostLayout } from "openp41ge-tabs/ghost-layout";
export type { GhostColumn } from "openp41ge-tabs/ghost-layout";
export { CursorManager } from "openp41ge-tabs/cursor-manager";
export { TabGrid, TabBar, TabView, TabContent } from "./components/tabs/index";
export {
  INSERT_BOUNDARY_THRESHOLD,
  classifyGridPosition,
  getDividerPositions,
  computeDropTarget,
  getDropIndexInBar,
  splitCellForBoundary,
  isSameFilePathInCell,
} from "openp41ge-tabs/boundary";
export type { GridPosition } from "openp41ge-tabs/boundary";

// ─── File Editor Component ────────────────────────────────────────────────
export { FileEditorElement } from "./components/file-editor/file-editor";
export type { FileEditorState } from "./components/file-editor/file-editor";

// Full file-editor API available at "openp41ge-uikit/file-editor"

// ─── Git Repository (renderer from openp41ge-git) ─────────────────────────
export { gitBrowserRenderer } from "openp41ge-git";

// ─── Git Repository Panel ────────────────────────────────────────────────
export { GitRepositoryPanel } from "./components/git-repository-panel";
export type {
  GitSelectBranchDetail,
  GitSelectCommitDetail,
  GitCheckoutWorktreeDetail,
  GitBranchContextMenuDetail,
  GitFileRowClickDetail,
} from "./components/git-repository-panel";
export {
  GIT_SELECT_BRANCH,
  GIT_SELECT_COMMIT,
  GIT_REFRESH_BRANCHES,
  GIT_REFRESH_COMMITS,
  GIT_REFRESH_FILES,
  GIT_LOAD_MORE_COMMITS,
  GIT_CLOSE,
  GIT_CHECKOUT_WORKTREE,
  GIT_BRANCH_CONTEXT_MENU,
  GIT_FILE_ROW_CLICK,
} from "./components/git-repository-panel";

// ─── Empty State ────────────────────────────────────────────────────────
export { Openp41geEmptyState } from "./components/tabs/openp41ge-empty-state";
export type { RecentProject } from "./components/tabs/openp41ge-empty-state";

// ─── Demo Grid Carousel ─────────────────────────────────────────────────
export { DemoOpenp41ge } from "./components/demo/demo-openp41ge";
export type { TabDef, ColumnPlacement } from "./components/demo/demo-openp41ge";

// ─── Tree Component ──────────────────────────────────────────────────────
export { Openp41geTree } from "./components/tree";
export type {
  TreeNode,
  TreeNodeAction,
  TreeNodeDblClickEventDetail,
  TreeContextMenuEventDetail,
  TreeToggleErrorEventDetail,
  DropPosition,
  IconRenderer,
  TreeNodeClickEventDetail,
  TreeNodeToggleEventDetail,
  TreeNodeActionEventDetail,
  TreeDragStartEventDetail,
  TreeDropEventDetail,
} from "./components/tree";
export type {
  GitBrowserData,
  GitBrowserCallbacks,
  BranchEntry,
  CommitEntry,
  DiffStatEntry,
} from "openp41ge-git";

