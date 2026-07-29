2025-07-29

# Replace Main App Tree with Uikit `<openp41ge-tree>`

## Goal

Replace the internal rendering of `openp41ge-repo-tree-item` with the uikit `<openp41ge-tree>` component. The outer `openp41ge-repo-tree-item` stays as a container — it manages domain state (async file loading, persistence, pull animations) and maps its domain model to `TreeNode[]` for the uikit tree to render.

## Rationale

The uikit `<openp41ge-tree>` now supports all the generic tree features the main app needs (async expansion, context menus, double-click, status indicators, badges, hover actions, persistence hooks). Replacing the bespoke rendering with it means:
- One canonical tree component across the project
- Storybook demos exercise the same code as the production app
- New tree features benefit both demo and prod immediately
- Reduces code duplication (~700 lines in `openp41ge-repo-tree-item`)

## Approach

### What stays in `openp41ge-repo-tree-item`
- Domain state: `_expanded`, `_expandedWorktrees`, `_expandedDirs`, `_pullingBranches`, `_pullCompleted`
- Async loading: `WorktreeFileLoader` integration (`_fileLoader.loadRestoredFiles`, `expandWorktreeFiles`, etc.)
- Persistence: `DirPersistenceService` (`_persistence`)
- Pull animation lifecycle: `startPullAnimation`, `completePullAnimation`
- Add-worktree inline form
- All event dispatch to parent (`repo-toggle-expand`, `worktree-files-toggle`, `file-open`, etc.)

### What uses `<openp41ge-tree>`
- The file/directory tree under each worktree branch — replaced by `<openp41ge-tree>` with `onToggle` for async dir expansion
- The worktree row (branch header) — rendered as a `TreeNode` with `actions`, `badge`, `status`

### What changes

**Mapping domain → TreeNode[]:**

```
Repo header → TreeNode({ variant: "section", actions: [refresh, 3-dot], draggable: true })
  └─ Worktree branch → TreeNode({ actions: [refresh, 3-dot], badge: "(pending)", ... })
       └─ Directory → TreeNode({ actions: [refresh], ... }) with onToggle
            └─ File → TreeNode({ draggable: true, icon resolved via renderIcon, ... })
```

**Key wiring:**
| Domain logic | Uikit tree API |
|---|---|
| Expand/collapse worktree | `onToggle(node)` → calls `_fileLoader.expandWorktreeFiles()` |
| Expand/collapse directory | `onToggle(node)` → calls `_fileLoader.expandDir()` |
| File click | `tree-node-click` → dispatches `openp41ge:open-file` |
| File double-click | `tree-node-dblclick` → dispatches pinned `openp41ge:open-file` |
| Right-click | `tree-node-contextmenu` → dispatches `repo-contextmenu` / `worktree-contextmenu` |
| Hover actions (refresh, 3-dot) | `TreeNode.actions` → `tree-node-action` event |
| Persist expanded state | `onExpandedChange` → `_persistence` save |
| Loading state | `status: "pending"` + spinner via `onToggle` pending |
| Pull animation | Handled externally via CSS class added by `startPullAnimation` |
| File icons | `renderIcon` callback → `<file-extension-svg>` |
| Pending badge | `TreeNode.badge = "(pending)"` |
| Untracked files | `TreeNode.status = "untracked"` |

### File changes

| File | Change |
|---|---|
| `packages/openp41ge/src/renderer/components/openp41ge-repo-tree-item.ts` | Rewrite to use `<openp41ge-tree>` for file/dir/worktree rendering. Keep domain state and async loading logic. Map domain → TreeNode[]. |
| `packages/openp41ge/src/renderer/services/dir-persistence-service.ts` | No change (interface already compatible) |
| `packages/openp41ge/src/renderer/services/worktree-file-loader.ts` | No change (interface already compatible) |
| `packages/openp41ge-uikit/src/components/tree/tree.ts` | Any missing features discovered during migration |
| `packages/openp41ge-uikit/src/components/tree/tree-styles.ts` | Any missing CSS discovered during migration |

### SOLID Review

- **S** — `openp41ge-repo-tree-item` already mixes rendering + domain logic. This change extracts the rendering concern into `<openp41ge-tree>` (which has SR for rendering). The domain logic stays in the container.
- **O** — `<openp41ge-tree>` is closed for modification, open for extension via callbacks (`onToggle`, `onExpandedChange`, `renderIcon`). No changes needed to add domain features.
- **L** — `<openp41ge-tree>`'s events are substitutable — the container handles `tree-node-click` identically to how it handled `file-open` before.
- **I** — `<openp41ge-tree>`'s interface is focused (data in, events out). No split needed.
- **D** — `openp41ge-repo-tree-item` already injects `WorktreeFileLoader` and `DirPersistenceService` via constructor. No change needed.

### UX Considerations

- Visual appearance should be identical — same CSS variables, same row heights, same spacing
- File icons: the `renderIcon` callback must resolve file extensions to `<file-extension-svg>` components
- Pull animation: the animated gradient bar on worktree rows is currently rendered inline in `_renderWorktree()`. With uikit tree, this becomes the `status: "loading"` field or a custom CSS class on the row. The green flash on completion maps to `status: "success"` temporarily.
- Focus management and keyboard nav are handled by uikit tree — should be equivalent

## Testing Strategy

- Existing e2e/playwright tests should continue passing (no visible change)
- Manual testing of: expand worktree, expand directory, open file, context menu, drag repo, pull animation, add worktree form
- Unit tests for any new mapping logic extracted from `openp41ge-repo-tree-item`

## Completion Criteria

- [ ] `openp41ge-repo-tree-item` uses `<openp41ge-tree>` for file/directory/worktree rendering
- [ ] Expand/collapse worktree works with async loading and spinner
- [ ] Expand/collapse directories works with async loading and spinner
- [ ] Single-click opens file preview, double-click opens pinned file
- [ ] Right-click dispatches context menu events
- [ ] Hover actions (refresh, 3-dot) work on worktree rows
- [ ] Pull animation (progress bar + green flash) works
- [ ] "add worktree" inline form works
- [ ] Repo header drag (application/x-openp41ge-repo) works
- [ ] File icons render correctly via `<file-extension-svg>`
- [ ] Untracked file styling works
- [ ] Persistence of expanded state works (across reload)
- [ ] Build passes (`nx build openp41ge`)
- [ ] App loads and renders repo tree without errors
