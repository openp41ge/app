/**
 * <openp41ge-tree> — Generic tree web component.
 *
 * Renders a hierarchical TreeNode[] structure with expand/collapse,
 * icons, hover action buttons, and drag-and-drop support.
 *
 * Usage:
 *   <openp41ge-tree .nodes=${treeNodes}></openp41ge-tree>
 *
 * Events:
 *   tree-node-click   — { nodeId, meta }
 *   tree-node-toggle  — { nodeId, expanded, meta }
 *   tree-node-action  — { nodeId, actionId, meta }
 *   tree-drag-start   — { nodeId, meta }
 *   tree-drop         — { targetNodeId, position, dragData }
 */

import { LitElement, html, nothing, type TemplateResult } from "lit";
import { property, state } from "lit/decorators.js";
import { classMap } from "lit/directives/class-map.js";
import { styleMap } from "lit/directives/style-map.js";
import type {
  TreeNode,
  TreeNodeAction,
  DropPosition,
} from "./types";
import { treeStyles } from "./tree-styles";

export {
  type TreeNode,
  type TreeNodeAction,
  type DropPosition,
  type TreeNodeClickEventDetail,
  type TreeNodeToggleEventDetail,
  type TreeNodeActionEventDetail,
  type TreeDragStartEventDetail,
  type TreeDropEventDetail,
} from "./types";

const INDENT = 18; // pixels per depth level

export class Openp41geTree extends LitElement {
  static styles = treeStyles;

  @property({ type: Array })
  nodes: TreeNode[] = [];

  @property({ attribute: false })
  selectedId: string | null = null;

  @property({ type: Number })
  depth = 0;

  @state()
  private _hoveredNodeId: string | null = null;

  // ─── Helpers ───────────────────────────────────────────────────

  private _isExpanded(node: TreeNode): boolean {
    // Use Node.expanded if set, otherwise check children
    if (node.expanded !== undefined) return node.expanded;
    if (node.children && node.children.length > 0) return false;
    return false;
  }

  private _hasChildren(node: TreeNode): boolean {
    return !!(node.children && node.children.length > 0);
  }

  // ─── Event Handlers ────────────────────────────────────────────

  private _onChevronClick(e: Event, node: TreeNode): void {
    e.stopPropagation();
    const expanded = !this._isExpanded(node);
    this._updateExpanded(node.id, expanded);
    this.dispatchEvent(
      new CustomEvent("tree-node-toggle", {
        bubbles: true,
        composed: true,
        detail: { nodeId: node.id, expanded, meta: node.meta },
      }),
    );
  }

  private _onNodeClick(e: Event, node: TreeNode): void {
    e.stopPropagation();
    this.selectedId = node.id;
    this.dispatchEvent(
      new CustomEvent("tree-node-click", {
        bubbles: true,
        composed: true,
        detail: { nodeId: node.id, meta: node.meta },
      }),
    );
  }

  private _onActionClick(e: Event, node: TreeNode, action: TreeNodeAction): void {
    e.stopPropagation();
    this.dispatchEvent(
      new CustomEvent("tree-node-action", {
        bubbles: true,
        composed: true,
        detail: { nodeId: node.id, actionId: action.id, meta: node.meta },
      }),
    );
  }

  private _onDragStart(e: DragEvent, node: TreeNode): void {
    if (!node.draggable) return;
    e.dataTransfer?.setData("text/plain", node.id);
    e.dataTransfer!.effectAllowed = "move";
    this.dispatchEvent(
      new CustomEvent("tree-drag-start", {
        bubbles: true,
        composed: true,
        detail: { nodeId: node.id, meta: node.meta },
      }),
    );
  }

  private _onDragOver(e: DragEvent): void {
    e.preventDefault();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = "move";
    }
  }

  private _onDrop(e: DragEvent, targetNode: TreeNode): void {
    e.preventDefault();
    e.stopPropagation();
    const dragData = e.dataTransfer?.getData("text/plain");
    const position = this._computeDropPosition(e, targetNode);
    this.dispatchEvent(
      new CustomEvent("tree-drop", {
        bubbles: true,
        composed: true,
        detail: {
          targetNodeId: targetNode.id,
          position,
          dragData,
        },
      }),
    );
  }

  /** Compute whether the drop is before, after, or inside the target node. */
  private _computeDropPosition(e: DragEvent, _targetNode: TreeNode): DropPosition {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const relY = (e.clientY - rect.top) / rect.height;
    if (relY < 0.25) return "before";
    if (relY > 0.75) return "after";
    return "inside";
  }

  // ─── State Management ──────────────────────────────────────────

  private _updateExpanded(nodeId: string, expanded: boolean): void {
    this.nodes = this._setExpanded(this.nodes, nodeId, expanded);
    this.requestUpdate();
  }

  private _setExpanded(nodes: TreeNode[], nodeId: string, expanded: boolean): TreeNode[] {
    return nodes.map((n) => {
      if (n.id === nodeId) {
        return { ...n, expanded };
      }
      if (n.children) {
        return { ...n, children: this._setExpanded(n.children, nodeId, expanded) };
      }
      return n;
    });
  }

  // ─── Render ────────────────────────────────────────────────────

  render(): TemplateResult {
    if (!this.nodes || this.nodes.length === 0) {
      return html`<div class="tree-empty">No items</div>`;
    }
    return html`<div class="tree-root" role="tree">${this._renderNodes(this.nodes)}</div>`;
  }

  private _renderNodes(nodes: TreeNode[]): TemplateResult[] {
    return nodes.map((node) => this._renderNode(node));
  }

  private _renderNode(node: TreeNode): TemplateResult {
    const expanded = this._isExpanded(node);
    const hasChildren = this._hasChildren(node);
    const selected = this.selectedId === node.id;
    const hovered = this._hoveredNodeId === node.id;
    const indent = this.depth * INDENT;

    return html`
      <div
        class="tree-node ${classMap({
          selected,
          hovered,
          draggable: !!node.draggable,
        })}"
        style=${styleMap({ paddingLeft: `${indent + 8}px` })}
        role="treeitem"
        aria-expanded=${hasChildren ? (expanded ? "true" : "false") : undefined}
        draggable=${node.draggable ? "true" : "false"}
        @click=${(e: Event) => this._onNodeClick(e, node)}
        @mouseenter=${() => (this._hoveredNodeId = node.id)}
        @mouseleave=${() => (this._hoveredNodeId === node.id ? (this._hoveredNodeId = null) : null)}
        @dragstart=${(e: DragEvent) => this._onDragStart(e, node)}
        @dragover=${this._onDragOver}
        @drop=${(e: DragEvent) => this._onDrop(e, node)}
      >
        <!-- Chevron -->
        <span
          class="tree-chevron ${classMap({ expanded, invisible: !hasChildren })}"
          @click=${(e: Event) => this._onChevronClick(e, node)}
        >
          ▶
        </span>

        <!-- Icon -->
        ${node.icon
          ? html`<span class="tree-icon"><openp41ge-icon name=${node.icon} size="16"></openp41ge-icon></span>`
          : html`<span class="tree-icon tree-icon-placeholder"></span>`}

        <!-- Label -->
        <span class="tree-label">${node.label}</span>

        <!-- Actions (show on hover) -->
        ${hovered && node.actions && node.actions.length > 0
          ? html`<span class="tree-actions">
              ${node.actions.map(
                (action) => html`
                  <span
                    class="tree-action-btn"
                    title=${action.label}
                    aria-label=${action.label}
                    @click=${(e: Event) => this._onActionClick(e, node, action)}
                  >
                    <openp41ge-icon name=${action.icon} size="14"></openp41ge-icon>
                  </span>
                `,
              )}
            </span>`
          : nothing}
      </div>

      <!-- Children -->
      ${hasChildren && expanded
        ? html`<openp41ge-tree
            .nodes=${node.children!}
            .selectedId=${this.selectedId}
            depth=${this.depth + 1}
            @tree-node-click=${(e: Event) => this._forwardEvent(e, "tree-node-click")}
            @tree-node-toggle=${(e: Event) => this._forwardEvent(e, "tree-node-toggle")}
            @tree-node-action=${(e: Event) => this._forwardEvent(e, "tree-node-action")}
            @tree-drag-start=${(e: Event) => this._forwardEvent(e, "tree-drag-start")}
            @tree-drop=${(e: Event) => this._forwardEvent(e, "tree-drop")}
          ></openp41ge-tree>`
        : nothing}
    `;
  }

  /** Forward nested tree events up through the parent component. */
  private _forwardEvent(e: Event, eventName: string): void {
    e.stopPropagation();
    this.dispatchEvent(
      new CustomEvent(eventName, {
        bubbles: true,
        composed: true,
        detail: (e as CustomEvent).detail,
      }),
    );
  }
}

customElements.define("openp41ge-tree", Openp41geTree);

declare global {
  interface HTMLElementTagNameMap {
    "openp41ge-tree": Openp41geTree;
  }
}
