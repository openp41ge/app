2025-07-29

# Generic Tree Component for openp41ge-uikit

## Goal

Create a reusable `<openp41ge-tree>` web component in uikit that renders a hierarchical data structure with expand/collapse, icons, action buttons, drag-and-drop, and customizable styling — replacing the platform-specific `openp41ge-repo-tree-item`, `openp41ge-worktree-tree`, and `repo-tree-renderer` currently in the main app.

## Rationale

- The app currently has 3 tightly-coupled tree components (~2800 lines total) duplicated across multiple concerns
- A generic tree in uikit can be used by repo/worktree views, file explorers, git history, and any future hierarchical UI
- Accepts data structures → app maps its domain model to tree nodes (dependency inversion)
- Drag-and-drop is a natural fit for tree nodes (reorder, move across panes)
- Storybook can showcase the tree with mock data — richer demos than the current standalone demos

## Approach

### 1. Define TreeNode data structure (in uikit)

```typescript
interface TreeNode {
  id: string;
  label: string;
  icon?: string;            // icon name from iconRegistry
  children?: TreeNode[];
  expanded?: boolean;
  draggable?: boolean;
  actions?: TreeNodeAction[];
  meta?: Record<string, unknown>;  // app-specific data passed through events
}

interface TreeNodeAction {
  id: string;
  icon: string;
  label: string;
  handler?: string;  // event name to dispatch
}
```

### 2. Create `<openp41ge-tree>` component

Properties:
- `nodes: TreeNode[]` — the tree data
- `depth: number` — indentation level (auto-managed for nesting)
- `selectedId: string | null` — currently selected node

Events:
- `tree-node-click` — `{ nodeId, meta }`
- `tree-node-toggle` — `{ nodeId, expanded, meta }`
- `tree-node-action` — `{ nodeId, actionId, meta }`
- `tree-drag-start` — `{ nodeId, meta }` (native drag)
- `tree-drop` — `{ targetNodeId, position: 'before' | 'after' | 'inside', dragData }`

Styling:
- CSS custom properties for colors, fonts, spacing
- Default dark theme matching the app's existing look
- Expand/collapse chevron, indentation guides

### 3. Add drag-and-drop support

- Each node can be draggable via `draggable` property
- Drag ghost follows the tab-drag pattern (use existing GhostManager?)
- Drop zones between nodes and inside folders
- Events bubble up for the host app to handle

### 4. Storybook stories

- Basic tree with folders and files
- Tree with action buttons (add, delete, refresh)
- Draggable tree nodes
- Deep nesting (5+ levels)
- Empty tree
- Loading/skeleton state

### 5. Migration plan (future)

Once the tree component is stable, migrate:
- `openp41ge-repo-tree-item.ts` → data mapping layer in the app
- `openp41ge-worktree-tree.ts` → simplified tree consumer
- `repo-tree-renderer.ts` → can be removed

## Files Changed

### New files (in uikit)
- `packages/openp41ge-uikit/src/tree/types.ts` — TreeNode interfaces
- `packages/openp41ge-uikit/src/tree/tree.ts` — `<openp41ge-tree>` component
- `packages/openp41ge-uikit/src/tree/index.ts` — barrel export
- `packages/openp41ge-uikit/src/tree/tree.stories.ts` — Storybook stories
- `packages/openp41ge-uikit/src/tree/tree-styles.ts` — CSS

### Updated files
- `packages/openp41ge-uikit/src/index.ts` — add tree re-exports

## Testing Strategy

| What | How |
|------|-----|
| Render basic tree | Storybook story with mock data |
| Expand/collapse | Click chevron → node toggles |
| Actions | Click action button → event dispatched |
| Drag-and-drop | Native drag events fire correctly |
| Deep nesting | Render 10-level tree without layout issues |

## UX Considerations

- Matches VS Code-style tree look (chevrons, indentation, hover highlight)
- Action buttons appear on hover (like the current repo-tree-item)
- Drag visual feedback uses existing GhostManager pattern
- Keyboard navigation (up/down arrows, enter to expand)

## SOLID Review

- **S** — Tree component: renders hierarchy, manages selection, fires events. No data loading.
- **O** — `TreeNode` is an interface; apps extend via `meta`. Open for extension.
- **L** — Events pass `meta` through; subscribers handle their own types safely.
- **I** — `TreeNode` has focused fields (label, icon, children, actions). Not bloated.
- **D** — Tree depends on `TreeNode[]` abstraction, not on any platform service.

## Open Questions

1. **Drag-and-drop depth**: drop between nodes (reorder), into folders (nest), or both? Both.
2. **Virtualization**: for trees with 1000+ nodes, should we add virtual scrolling now or later? Later.
3. **Filtering**: should the tree support a `filter` prop to show/hide nodes? Could add later.

## Completion Criteria

- [x] `<openp41ge-tree>` component renders in Storybook with mock data
- [x] TreeNode data structure defined with types
- [x] Expand/collapse works with chevron toggle
- [x] Action buttons render on hover and fire events
- [x] Drag-and-drop events fire for nodes marked draggable
- [x] Storybook stories demonstrate basic, nested, action, and drag variants
- [x] Build passes (`nx build openp41ge-uikit`)

## Next Steps
1. Wire the tree component into Storybook's icon registry for richer icon display
2. Migrate `openp41ge-worktree-tree.ts` to use `<openp41ge-tree>` internally
3. Create a `tree.styles.ts` CSS file (extracted to keep template clean) — done
