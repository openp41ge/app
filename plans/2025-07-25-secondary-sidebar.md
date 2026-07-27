2025-07-25

# Plan: Secondary sidebar for projects view

## Goal

Add a secondary sidebar on the **left side** of the grid (opposite the primary sidebar on the right) to host the projects view. Both sidebars can be open simultaneously, each shrinking the grid area from their respective side. The projects view moves out of the activity bar / primary sidebar into this secondary sidebar.

## Rationale

The primary sidebar is for workspace tools (explorer, git, search). Projects are a higher-level concept — they control which workspace/context is active. Putting projects in a dedicated secondary sidebar (like VS Code's activity bar on the left) keeps the two concerns separate, while keeping the primary activity bar on the right for file/workspace tools.

## Approach

### 1. Extend layout data model

Add `secondarySidebar` to the `Window` type in `src/layout/types.ts`:

```typescript
// Sidebar state (shared for both primary and secondary)
// Primary sidebar stays on the right (existing `sidebar` field)
// Secondary sidebar is on the left (new `secondarySidebar` field)

export const WindowSchema = z.object({
  // ... existing fields ...
  sidebar: SidebarStateSchema.optional().default({ activeViewId: null, width: 280 }),
  secondarySidebar: SidebarStateSchema.optional().default({ activeViewId: null, width: 280 }),
  // ...
});
```

Update `createWindow()` to include the new field.

### 2. Create `openp41ge-secondary-sidebar` component

A new Lit component `openp41ge-secondary-sidebar.ts` — nearly identical to `openp41ge-sidebar.ts` but:
- Renders on the **left** side of the grid area (before the grid, not after)
- Resizes from the right edge (drag handle on its right side)
- Currently only hosts the projects view
- Same width constraints (200–600px), same view lifecycle

Shared logic can be extracted, but for now a copy is fine given the small surface area.

### 3. Update `openp41ge-windowview` layout

Change the main-area flex layout:

```
[secondary-sidebar] [grid] [primary-sidebar] [activity-bar]
```

Currently it's:
```
[grid] [primary-sidebar] [activity-bar]
```

New layout:
```
[secondary-sidebar] [grid] [primary-sidebar] [activity-bar]
```

The grid's `min-width` stays 200px. The total minimum window width becomes:
`secondary-sidebar min(200px) + grid min(200px) + primary-sidebar min(200px) + activity-bar(48px) + borders`
= ~650px minimum window width.

### 4. Wire sidebar/toggle dispatch operations

Add dispatch operations:
- `"toggleSecondarySidebarViewOp"` — toggles a view in the secondary sidebar (like `"toggleSidebarViewOp"` for the primary)
- `"setSecondarySidebarWidthOp"` — persists the secondary sidebar width

Or extend existing operations to accept a `side` parameter.

### 5. Move projects view to secondary sidebar

- Remove the `"projects"` view from the activity bar and primary sidebar
- The secondary sidebar defaults to showing projects when opened
- `Cmd+P` toggles the secondary sidebar (not the primary sidebar's projects view)
- Titlebar button (re-added) also toggles the secondary sidebar

### 6. Re-add titlebar button

Bring back the clickable project name in the titlebar — it toggles the secondary sidebar:
```
Click → toggleSecondarySidebarViewOp(winId, "projects")
```

### 7. Update dispatch handler

Update `electron/ipc-handlers/dispatch-handler.ts` (or the operation dispatcher) to handle the new secondary sidebar operations.

## Files Changed

### Modified
- `src/layout/types.ts` — Add `secondarySidebar` to Window schema
- `src/renderer/components/openp41ge-windowview.ts` — New flex layout, wire secondary sidebar
- `src/renderer/components/openp41ge-titlebar.ts` — Re-add titlebar button for secondary sidebar
- `src/renderer/app.ts` — Wire new dispatch operations if needed
- `electron/ipc-handlers/dispatch-handler.ts` — May need updates for new operations

### New
- `src/renderer/components/openp41ge-secondary-sidebar.ts` — Secondary sidebar component

### Removed from activity bar
- `src/renderer/components/openp41ge-activity-bar.ts` — Remove projects icon (keep explorer only)

## Open Questions

1. Should `SidebarState` become a shared type with a `side` discriminator, or just duplicate the field on `Window`? (Duplicating is simpler for now.)
2. Should the secondary sidebar support future views beyond projects, or stay single-purpose? (Single-purpose for now, same SidebarView interface for extensibility.)
3. How does the titlebar button interact with `Cmd+P`? (Both toggle the same thing.)

## Completion Criteria

- [ ] Layout model supports secondary sidebar
- [ ] Secondary sidebar renders on the left side, shrinks grid
- [ ] Both sidebars can be open simultaneously
- [ ] Activity bar shows only explorer (projects removed)
- [ ] Titlebar button toggles secondary sidebar
- [ ] Cmd+P toggles secondary sidebar
- [ ] Projects view works in secondary sidebar
- [ ] Minimum window size accounts for both sidebars
- [ ] All existing tests pass
- [ ] `nx build` succeeds
