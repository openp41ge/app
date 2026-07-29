export { Openp41geIcon } from "./components/openp41ge-icon";
export type { IconName } from "./components/openp41ge-icon";
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

// ─── Git Repository Browser (merged from openp41ge-git-repository) ────────
export { FileEditorElement } from "./components/file-editor/file-editor";
export type { FileEditorState } from "./components/file-editor/file-editor";

// Full file-editor API available at "openp41ge-uikit/file-editor"

// ─── Git Repository Browser (merged from openp41ge-git-repository) ────────
export { gitBrowserRenderer } from "openp41ge-git-repository";

// ─── Tree Component ──────────────────────────────────────────────────────
export { Openp41geTree } from "./components/tree";
export type {
  TreeNode,
  TreeNodeAction,
  DropPosition,
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
} from "openp41ge-git-repository";
