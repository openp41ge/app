/**
 * Tree node data structure for the <openp41ge-tree> component.
 *
 * Pure data — no platform dependencies. The host app maps its domain
 * model to TreeNode[] and handles events.
 */

import type { TemplateResult } from "lit";

export interface TreeNodeAction {
  /** Unique action ID (e.g. "add", "delete", "refresh") */
  id: string;
  /** Icon name or SVG string */
  icon: string;
  /** Tooltip / aria-label */
  label: string;
}

/** Row visual variant */
export type RowVariant = "default" | "section" | "worktree";

export interface TreeNode {
  /** Unique node ID within the tree */
  id: string;
  /** Display label */
  label: string;
  /** Optional icon name (passed to renderIcon callback) */
  icon?: string;
  /** Icon render size in px (default: 14) */
  iconSize?: number;
  /** Child nodes */
  children?: TreeNode[];
  /** Whether the node is currently expanded (default: false) */
  expanded?: boolean;
  /** Whether the node can be dragged (default: false) */
  draggable?: boolean;
  /** Row visual variant */
  variant?: RowVariant;
  /** Action buttons shown on hover */
  actions?: TreeNodeAction[];
  /** Show a chevron toggle before the icon (default: true for nodes with children) */
  showChevron?: boolean;
  /**
   * Mark as expandable even when children[] is empty (for async/lazy loading).
   * When true, clicking the node toggles it and calls onToggle (if set) instead
   * of firing tree-node-click.
   */
  expandable?: boolean;
  /**
   * Row status — adds CSS class `tree-node--status-{status}` so consumers
   * can style via theme variables (e.g. --tree-status-untracked-opacity).
   */
  status?: "untracked" | "pending" | "warning" | "error" | "success";
  /** Optional label rendered after the main label (e.g. "(pending)") */
  badge?: string;
  /** App-specific metadata passed through events */
  meta?: Record<string, unknown>;
}

/** Position of a drop relative to a target node */
export type DropPosition = "before" | "after" | "inside";

export interface TreeDropEventDetail {
  targetNodeId: string;
  position: DropPosition;
  dragData: unknown;
}

export interface TreeNodeClickEventDetail {
  nodeId: string;
  meta?: Record<string, unknown>;
}

export interface TreeNodeToggleEventDetail {
  nodeId: string;
  expanded: boolean;
  meta?: Record<string, unknown>;
}

export interface TreeNodeActionEventDetail {
  nodeId: string;
  actionId: string;
  meta?: Record<string, unknown>;
}

export interface TreeDragStartEventDetail {
  nodeId: string;
  meta?: Record<string, unknown>;
}

export interface TreeContextMenuEventDetail {
  nodeId: string;
  meta?: Record<string, unknown>;
  clientX: number;
  clientY: number;
}

export interface TreeToggleErrorEventDetail {
  nodeId: string;
  meta?: Record<string, unknown>;
  error: unknown;
}

export interface TreeNodeDblClickEventDetail {
  nodeId: string;
  meta?: Record<string, unknown>;
}

/** Callback type for rendering icons — host app provides its own resolver */
export type IconRenderer = (name: string, size: number) => TemplateResult | string;
