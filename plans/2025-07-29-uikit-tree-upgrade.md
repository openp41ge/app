2025-07-29

# Uikit Tree Component — Feature Upgrade

## Goal

Upgrade the `<openp41ge-tree>` generic tree component in `packages/openp41ge-uikit` so it supports all the rendering and interaction features needed to replace the main app's `openp41ge-repo-tree-item`. The component stays generic (no domain knowledge of repos/worktrees) but gains the rendering hooks and state machinery necessary for the main app to build its domain layer on top.

## Rationale

The current uikit tree is a solid generic tree but lacks:
- Async expansion with loading spinner
- Right-click / context menu events
- Row-level status indicators (badges, animations)
- Expanded-state persistence hook

These gaps mean the main app can't migrate from its bespoke `openp41ge-repo-tree-item`. Closing them makes the uikit tree the canonical tree component across the entire project.

## Approach

Add the following features to the existing `tree.ts` and `types.ts`. No new files. No domain-specific logic.

### 1. Async Expansion Protocol

**Current behaviour**: Tree toggles expanded state synchronously via `_toggleNode()` → `_updateExpanded()`.

**New behaviour**: Add an optional `onToggle?: (node: TreeNode) => Promise<void>` callback property. When set:
- Tree immediately marks the node as expanded (so the chevron flips and children slot appears)
- Tree calls `onToggle(node)` and awaits the returned promise
- While the promise is pending, the node shows a loading spinner in place of its chevron/icon
- If `onToggle` resolves without populating `node.children`, the tree collapses the node back
- If `onToggle` rejects, collapse the node and dispatch `tree-node-toggle-error`

**State additions**: A `_loadingNodeIds: Set<string>` tracked per instance.

### 2. Loading Spinner on Expanding Nodes

When a node is in `_loadingNodeIds`, replace its chevron with a CSS-animated spinner (simple border-spin like `wt-spinner` in the main app). The spinner sits in the chevron cell.

Add a CSS custom property `--tree-spinner-color` (default `#4a9eff`) so consumers can theme it.

### 3. Right-Click / Context Menu Events

Add a `@contextmenu` handler on each tree node row that dispatches:

```ts
new CustomEvent("tree-node-contextmenu", {
  bubbles: true,
  composed: true,
  detail: { nodeId: string, meta?: Record<string, unknown>, clientX: number, clientY: number },
});
```

The consumer attaches a `contextmenu` event on the tree (or document) and shows its own context menu UI — the tree does not render any menu.

### 4. Row Metadata / Status Indicators

Extend `TreeNode` with an optional `status?: 'loading' | 'pending' | 'warning' | 'error' | 'success'` field. When set, the row gets:
- A CSS class `tree-node--status-${status}`
- Consumers can style via `--tree-status-loading-opacity`, `--tree-status-pending-opacity`, etc.

Also add an optional `badge?: string` field — when set, renders a small label after the row label:

```html
<span class="tree-badge"></span>
```

Styled with `--tree-badge-fg`, `--tree-badge-bg` (defaults: muted text, transparent).

### 5. Expanded State Persistence Hook

Add an optional `onExpandedChange?: (nodeId: string, expanded: boolean) => void` callback. Called whenever a node's expanded state changes (via click, chevron click, or keyboard). The consumer persists the state externally.

The tree does NOT persist anything itself — it only notifies.

### 6. DOM Event Cleanup

Ensure all added event listeners in `connectedCallback` have corresponding removals in `disconnectedCallback`.

## Files Changed

| File                                                        | Change                                            |
| ----------------------------------------------------------- | ------------------------------------------------- |
| `packages/openp41ge-uikit/src/components/tree/types.ts`     | Add `status`, `badge` to `TreeNode`               |
| `packages/openp41ge-uikit/src/components/tree/tree.ts`      | All implementation changes                        |
| `packages/openp41ge-uikit/src/components/tree/tree-styles.ts` | Add spinner, badge, status, context-menu styles   |
| `packages/openp41ge-uikit/src/components/tabs/tab-grid.stories.ts` | Update demos to use new features (optional) |
| `packages/openp41ge-uikit/src/index.ts`                     | Re-export any new types if needed                 |

## Testing Strategy

- Unit tests (Vitest) for each new feature:
  - `onToggle` called on expand, loading spinner shown while pending, collapse on reject
  - `tree-node-contextmenu` dispatched with correct detail
  - `status` CSS class applied, `badge` rendered
  - `onExpandedChange` called on toggle
- Integration test in storybook: demo with async expansion (simulated delay)
- E2E test: context menu on tree node, verify event payload

## UX Considerations

- **Loading spinner**: 10px border-spin, same CSS animation as `wt-spinner` in main app: `@keyframes wt-spin { to { transform: rotate(360deg); } }`
- **Context menu**: The tree only dispatches the event — no menu rendering. Consumers handle their own context menu UI. This keeps the tree generic.
- **Badge**: Small text after label, styled to match the label's font size but lighter color. Consumers set the text (e.g. "(pending)").
- **Status**: Only adds CSS class — consumers style via theme variables. No built-in color mapping.
- **Keyboard**: Right-click is a pointer event only — no keyboard equivalent needed (OS provides Shift+F10 / context menu key on the element, but tree nodes are not natively focusable for context menu — keeping it pointer-only for now).

## Open Questions

1. Should `onToggle` receive the entire `TreeNode` or just the `nodeId`? TreeNode is more flexible (consumer can read any metadata).
2. Should the spinner replace the chevron or appear alongside it? Chevrons expand/collapse — replacing it makes it clear the node is loading, not expandable.
3. Should `badge` be styled as an inline text or a pill/chip? Inline text matches the main app's "(pending)" style.

## Completion Criteria

- [x] `onToggle` callback works: loading spinner, async children, collapse on failure
- [x] `tree-node-contextmenu` event dispatched on right-click with correct detail
- [x] `tree-node-dblclick` event dispatched on double-click
- [x] `status` field applies CSS class to row
- [x] `badge` field renders text after label
- [x] `onExpandedChange` callback fires on toggle
- [x] All event listeners properly cleaned up in `disconnectedCallback`
- [x] Unit tests pass (26 tests)
- [x] Build passes (`nx build openp41ge`)
