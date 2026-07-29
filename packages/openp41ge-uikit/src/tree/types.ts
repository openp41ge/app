/**
 * Tree node data structure for the <openp41ge-tree> component.
 *
 * Pure data — no platform dependencies. The host app maps its domain
 * model to TreeNode[] and handles events.
 */

export interface TreeNodeAction {
  /** Unique action ID (e.g. "add", "delete", "refresh") */
  id: string;
  /** Icon name from openp41ge-uikit iconRegistry */
  icon: string;
  /** Tooltip / aria-label */
  label: string;
}

export interface TreeNode {
  /** Unique node ID within the tree */
  id: string;
  /** Display label */
  label: string;
  /** Optional icon name from openp41ge-uikit iconRegistry */
  icon?: string;
  /** Child nodes */
  children?: TreeNode[];
  /** Whether the node is currently expanded (default: false) */
  expanded?: boolean;
  /** Whether the node can be dragged (default: false) */
  draggable?: boolean;
  /** Action buttons shown on hover */
  actions?: TreeNodeAction[];
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
