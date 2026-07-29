/**
 * <openp41ge-tree> — Generic tree web component.
 *
 * Renders a hierarchical TreeNode[] structure with expand/collapse,
 * keyboard navigation, configurable icon rendering, row variant
 * support (section headers, worktree rows, standard rows), hover
 * action buttons, and drag-and-drop.
 *
 * Keyboard navigation:
 *   ArrowUp/Down  — move selection
 *   ArrowRight    — expand node
 *   ArrowLeft     — collapse node
 *   Enter/Space   — toggle expand/collapse
 *   Home/End      — first/last visible node
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
  IconRenderer,
} from "./types";
import { treeStyles } from "./tree-styles";

export {
  type TreeNode,
  type TreeNodeAction,
  type DropPosition,
  type IconRenderer,
  type TreeNodeClickEventDetail,
  type TreeNodeToggleEventDetail,
  type TreeNodeActionEventDetail,
  type TreeDragStartEventDetail,
  type TreeDropEventDetail,
  type TreeContextMenuEventDetail,
  type TreeToggleErrorEventDetail,
} from "./types";

const INDENT = 16; // pixels per depth level
const CHEVRON_WIDTH = 16; // chevron column width
const ICON_WIDTH = 16; // icon column width
const SECTION_EXTRA = 8; // extra indent for section headers

export class Openp41geTree extends LitElement {
  static styles = treeStyles;

  /** Tree data — flat or nested TreeNode[] */
  @property({ type: Array })
  nodes: TreeNode[] = [];

  /** Currently selected node ID */
  @property({ attribute: false })
  selectedId: string | null = null;

  /** Callback for rendering icons. Defaults to a simple inline SVG fallback. */
  @property({ attribute: false })
  renderIcon: IconRenderer | null = null;

  /** Current depth level (auto-managed for nested trees) */
  @property({ type: Number })
  depth = 0;

  /**
   * Optional async callback invoked when a collapsible node is expanded.
   * While the returned promise is pending, a loading spinner replaces the
   * chevron. If the promise resolves, the tree stays expanded (the consumer
   * is expected to have populated `node.children`). If it rejects, the node
   * collapses back.
   */
  @property({ attribute: false })
  onToggle: ((node: TreeNode) => Promise<void>) | null = null;

  /**
   * Optional callback fired whenever a node's expanded state changes.
   * The consumer can persist the state externally.
   */
  @property({ attribute: false })
  onExpandedChange: ((nodeId: string, expanded: boolean) => void) | null = null;

  @state()
  private _hoveredNodeId: string | null = null;

  @state()
  private _focusableNodeId: string | null = null;

  /** Node IDs currently being asynchronously loaded */
  @state()
  private _loadingNodeIds: Set<string> = new Set();

  private _rootEl: HTMLElement | null = null;

  private _isInternalUpdate = false;

  // ─── Lifecycle ───────────────────────────────────────────────────

  connectedCallback(): void {
    super.connectedCallback();
    this.addEventListener("keydown", this._onKeyDown);
    this.addEventListener("focus", this._onFocus);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this.removeEventListener("keydown", this._onKeyDown);
    this.removeEventListener("focus", this._onFocus);
  }

  firstUpdated(): void {
    this._rootEl = this.renderRoot?.querySelector(".tree-root") as HTMLElement | null;
    this._ensureFocusableNode();
  }

  // ─── Helpers ───────────────────────────────────────────────────

  private _hasChildren(node: TreeNode): boolean {
    return !!(node.children && node.children.length > 0);
  }

  private _showChevron(node: TreeNode): boolean {
    if (node.showChevron !== undefined) return node.showChevron;
    return this._hasChildren(node);
  }

  private _isSection(node: TreeNode): boolean {
    return node.variant === "section";
  }

  // ─── Flatten visible nodes for keyboard nav ──────────────────────

  /** Get all currently visible nodes in order (flat list). */
  private _getVisibleNodes(): TreeNode[] {
    const result: TreeNode[] = [];
    this._collectVisible(this.nodes, result);
    return result;
  }

  private _collectVisible(nodes: TreeNode[], out: TreeNode[]): void {
    for (const node of nodes) {
      out.push(node);
      if (this._hasChildren(node) && this._isExpandedLocal(node)) {
        this._collectVisible(node.children!, out);
      }
    }
  }

  /** Resolve expanded from node.expanded or our local override. */
  private _isExpandedLocal(node: TreeNode): boolean {
    if (node.expanded !== undefined) return node.expanded;
    if (this._hasChildren(node)) return false;
    return false;
  }

  private _getExpandedNodes(): Set<string> {
    const set = new Set<string>();
    this._collectExpanded(this.nodes, set);
    return set;
  }

  private _collectExpanded(nodes: TreeNode[], out: Set<string>): void {
    for (const node of nodes) {
      if (this._isExpandedLocal(node)) {
        out.add(node.id);
        if (node.children) this._collectExpanded(node.children, out);
      }
    }
  }

  // ─── Keyboard Navigation ────────────────────────────────────────

  private _onFocus(): void {
    if (!this._focusableNodeId && this.nodes.length > 0) {
      this._focusableNodeId = this.nodes[0].id;
    }
  }

  private _onKeyDown(e: KeyboardEvent): void {
    const visible = this._getVisibleNodes();
    if (visible.length === 0) return;

    let idx = this.selectedId
      ? visible.findIndex((n) => n.id === this.selectedId)
      : -1;

    switch (e.key) {
      case "ArrowDown": {
        e.preventDefault();
        idx = Math.min(idx + 1, visible.length - 1);
        this._selectAndFocus(visible[idx].id);
        break;
      }
      case "ArrowUp": {
        e.preventDefault();
        idx = Math.max(idx - 1, 0);
        this._selectAndFocus(visible[idx].id);
        break;
      }
      case "ArrowRight": {
        e.preventDefault();
        const node = visible[idx];
        if (node && this._hasChildren(node) && !this._isExpandedLocal(node)) {
          this._toggleNode(node);
        }
        break;
      }
      case "ArrowLeft": {
        e.preventDefault();
        const node = visible[idx];
        if (node && this._hasChildren(node) && this._isExpandedLocal(node)) {
          this._toggleNode(node);
        }
        break;
      }
      case "Enter":
      case " ": {
        e.preventDefault();
        const node = visible[idx];
        if (node && this._hasChildren(node)) {
          this._toggleNode(node);
        } else if (node) {
          // Activate leaf node (click)
          this._emitClick(node);
        }
        break;
      }
      case "Home": {
        e.preventDefault();
        if (visible.length > 0) {
          this._selectAndFocus(visible[0].id);
        }
        break;
      }
      case "End": {
        e.preventDefault();
        if (visible.length > 0) {
          this._selectAndFocus(visible[visible.length - 1].id);
        }
        break;
      }
    }
  }

  private _selectAndFocus(nodeId: string): void {
    this.selectedId = nodeId;
    this._focusableNodeId = nodeId;
    this._ensureFocusableNode();
    // Scroll into view
    const el = this.renderRoot?.querySelector(`[data-node-id="${CSS.escape(nodeId)}"]`) as HTMLElement | null;
    el?.scrollIntoView({ block: "nearest" });
    this.requestUpdate();
  }

  private _ensureFocusableNode(): void {
    if (!this._focusableNodeId || !this.nodes.find((n) => this._findNode(n, this._focusableNodeId!))) {
      this._focusableNodeId = this.nodes.length > 0 ? this._getVisibleNodes()[0]?.id ?? null : null;
    }
  }

  private _findNode(root: TreeNode, id: string): TreeNode | undefined {
    if (root.id === id) return root;
    if (root.children) {
      for (const child of root.children) {
        const found = this._findNode(child, id);
        if (found) return found;
      }
    }
    return undefined;
  }

  // ─── Toggle / Select ────────────────────────────────────────────

  private _toggleNode(node: TreeNode): void {
    const expanded = !this._isExpandedLocal(node);

    if (expanded && this.onToggle && this._hasChildren(node)) {
      // Async expansion: mark loading, flip expanded, do async, then resolve
      this._loadingNodeIds = new Set(this._loadingNodeIds).add(node.id);
      this._updateExpanded(node.id, true);
      this.onToggle(node)
        .then(() => {
          // Consumer populated children — keep expanded
          const next = new Set(this._loadingNodeIds);
          next.delete(node.id);
          this._loadingNodeIds = next;
          this.requestUpdate();
        })
        .catch((err) => {
          // Async failure — collapse back
          const next = new Set(this._loadingNodeIds);
          next.delete(node.id);
          this._loadingNodeIds = next;
          this._updateExpanded(node.id, false);
          this.dispatchEvent(
            new CustomEvent("tree-node-toggle-error", {
              bubbles: true,
              composed: true,
              detail: { nodeId: node.id, meta: node.meta, error: err },
            }),
          );
        });
      // Fire toggle event even while loading
      this._notifyToggle(node, true);
      return;
    }

    if (!expanded && this._loadingNodeIds.has(node.id)) {
      // Collapse a loading node — cancel by removing from loading set
      const next = new Set(this._loadingNodeIds);
      next.delete(node.id);
      this._loadingNodeIds = next;
      // Don't attempt to collapse children that never loaded
    }

    this._updateExpanded(node.id, expanded);
    this._notifyToggle(node, expanded);
  }

  private _notifyToggle(node: TreeNode, expanded: boolean): void {
    this.dispatchEvent(
      new CustomEvent("tree-node-toggle", {
        bubbles: true,
        composed: true,
        detail: { nodeId: node.id, expanded, meta: node.meta },
      }),
    );
    if (this.onExpandedChange) {
      this.onExpandedChange(node.id, expanded);
    }
  }

  private _emitClick(node: TreeNode): void {
    this.selectedId = node.id;
    this.dispatchEvent(
      new CustomEvent("tree-node-click", {
        bubbles: true,
        composed: true,
        detail: { nodeId: node.id, meta: node.meta },
      }),
    );
  }

  // ─── Event Handlers ────────────────────────────────────────────

  private _onChevronClick(e: Event, node: TreeNode): void {
    e.stopPropagation();
    this._toggleNode(node);
  }

  private _onNodeClick(e: Event, node: TreeNode): void {
    e.stopPropagation();
    this._focusableNodeId = node.id;
    // Toggle expand/collapse for nodes with children
    // Activate (click) for leaf nodes
    if (this._hasChildren(node)) {
      this._toggleNode(node);
    } else {
      this._emitClick(node);
    }
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

  private _onContextMenu(e: MouseEvent, node: TreeNode): void {
    e.preventDefault();
    e.stopPropagation();
    this.dispatchEvent(
      new CustomEvent("tree-node-contextmenu", {
        bubbles: true,
        composed: true,
        detail: {
          nodeId: node.id,
          meta: node.meta,
          clientX: e.clientX,
          clientY: e.clientY,
        },
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
        detail: { targetNodeId: targetNode.id, position, dragData },
      }),
    );
  }

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

  // ─── Icon rendering ────────────────────────────────────────────

  private _resolveIcon(name: string | undefined, size: number): TemplateResult | string {
    if (!name) return "";
    if (this.renderIcon) {
      return this.renderIcon(name, size);
    }
    // Default: use openp41ge-icon component
    return html`<openp41ge-icon name=${name} size=${size}></openp41ge-icon>`;
  }

  private _renderChevron(expanded: boolean): TemplateResult {
    return html`
      <span class="tree-chevron">
        <openp41ge-icon name=${expanded ? "chevron-down" : "chevron-right"} size="10"></openp41ge-icon>
      </span>`;
  }

  // ─── Render ────────────────────────────────────────────────────

  render(): TemplateResult {
    if (!this.nodes || this.nodes.length === 0) {
      return html`<div class="tree-empty">No items</div>`;
    }
    return html`
      <div class="tree-root" role="tree">${this._renderNodes(this.nodes)}</div>
    `;
  }

  private _renderNodes(nodes: TreeNode[]): TemplateResult[] {
    return nodes.map((node) => this._renderNode(node));
  }

  private _renderNode(node: TreeNode): TemplateResult {
    const expanded = this._isExpandedLocal(node);
    const hasChildren = this._hasChildren(node);
    const showChevron = this._showChevron(node);
    const selected = this.selectedId === node.id;
    const hovered = this._hoveredNodeId === node.id;
    const isSection = this._isSection(node);
    const isFocusable = this._focusableNodeId === node.id;
    const isLoading = this._loadingNodeIds.has(node.id);

    // Indentation: section headers get extra left padding
    const rowIndent = isSection
      ? this.depth * INDENT + SECTION_EXTRA
      : this.depth * INDENT;
    // Content inside the row is shifted so chevron/icon start at the indent
    const contentPad = isSection ? 8 : 8; // base padding on left

    // Status CSS class
    const statusClass = node.status ? `tree-node--status-${node.status}` : "";

    return html`
      <div
        class="tree-node ${classMap({
          selected,
          hovered,
          "is-section": isSection,
          "has-children": hasChildren,
          "is-loading": isLoading,
          [statusClass]: !!node.status,
        })}"
        style=${styleMap({
          paddingLeft: `${rowIndent + contentPad}px`,
          paddingRight: "8px",
        })}
        role="treeitem"
        tabindex=${isFocusable ? "0" : "-1"}
        data-node-id=${node.id}
        aria-expanded=${hasChildren ? (expanded ? "true" : "false") : undefined}
        aria-selected=${selected ? "true" : "false"}
        draggable=${node.draggable ? "true" : "false"}
        @click=${(e: Event) => this._onNodeClick(e, node)}
        @contextmenu=${(e: MouseEvent) => this._onContextMenu(e, node)}
        @mouseenter=${() => (this._hoveredNodeId = node.id)}
        @mouseleave=${() =>
          this._hoveredNodeId === node.id ? (this._hoveredNodeId = null) : null}
        @dragstart=${(e: DragEvent) => this._onDragStart(e, node)}
        @dragover=${this._onDragOver}
        @drop=${(e: DragEvent) => this._onDrop(e, node)}
      >
        <!-- Chevron (▶/▼) / Loading spinner -->
        <span
          class="tree-chevron-cell"
          @click=${(e: Event) => this._onChevronClick(e, node)}
        >
          ${isLoading
            ? this._renderSpinner()
            : showChevron
              ? this._renderChevron(expanded)
              : nothing}
        </span>

        <!-- Icon column (may be empty for section headers) -->
        ${node.icon
          ? html`
              <span class="tree-icon-cell">
                ${this._resolveIcon(node.icon, node.iconSize ?? 14)}
              </span>
            `
          : html`<span class="tree-icon-spacer"></span>`}

        <!-- Label -->
        <span class="tree-label">${node.label}</span>

        <!-- Badge -->
        ${node.badge
          ? html`<span class="tree-badge">${node.badge}</span>`
          : nothing}

        <!-- Actions (show on hover) -->
        ${hovered && node.actions && node.actions.length > 0
          ? html`<span class="tree-actions">
              ${node.actions.map(
                (action) => html`
                  <span
                    class="tree-action-btn"
                    title=${action.label}
                    aria-label=${action.label}
                    role="button"
                    tabindex="-1"
                    @click=${(e: Event) => this._onActionClick(e, node, action)}
                  >
                    ${this._resolveIcon(action.icon, 14)}
                  </span>
                `,
              )}
            </span>`
          : nothing}
      </div>

      <!-- Children (recursive) -->
      ${hasChildren && expanded && !isLoading
        ? html`<openp41ge-tree
            .nodes=${node.children!}
            .selectedId=${this.selectedId}
            .renderIcon=${this.renderIcon}
            .onToggle=${this.onToggle}
            .onExpandedChange=${this.onExpandedChange}
            depth=${this.depth + 1}
            @tree-node-click=${(e: Event) => this._forwardEvent(e, "tree-node-click")}
            @tree-node-toggle=${(e: Event) => this._forwardEvent(e, "tree-node-toggle")}
            @tree-node-toggle-error=${(e: Event) => this._forwardEvent(e, "tree-node-toggle-error")}
            @tree-node-action=${(e: Event) => this._forwardEvent(e, "tree-node-action")}
            @tree-node-contextmenu=${(e: Event) => this._forwardEvent(e, "tree-node-contextmenu")}
            @tree-drag-start=${(e: Event) => this._forwardEvent(e, "tree-drag-start")}
            @tree-drop=${(e: Event) => this._forwardEvent(e, "tree-drop")}
          ></openp41ge-tree>`
        : nothing}
    `;
  }

  private _renderSpinner(): TemplateResult {
    return html`
      <span class="tree-spinner" part="spinner"></span>
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
