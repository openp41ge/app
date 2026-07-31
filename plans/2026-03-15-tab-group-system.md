2026-03-15

# Tab Group System — Conceptual Parent/Child Tab Tracking

## Goal

Replace the ad-hoc `sourceSystemTabId` config field with a proper tab group data structure in the workspace state. Tab groups track conceptual parent/child relationships between tabs (e.g., a Projects system tab is the conceptual parent of a project-detail editor tab). Interactions with any tab in a group keep the whole group "active", preventing the parent from closing on defocus. Closing the parent cascades to all children.

## Rationale

The current approach stores `sourceSystemTabId` in the editor tab's `config` and has two ad-hoc functions (`_hasAssociatedEditorTabs`, `_closeAssociatedEditorTabs`) in `system-tab-operations.ts`. This is fragile, limited to system-tab→editor-tab relationships, and doesn't handle the case where clicking a child tab (editor tab) should keep the parent tab (system tab) alive during defocus.

A proper `TabGroup` in the workspace state makes the relationship first-class, testable, and extensible to any tab-to-tab relationship in the future.

## Approach

### Data Structure

Add `tabGroups` to `Workspace`:

```typescript
// In types.ts

export interface TabGroup {
  id: string;
  parentTabId: string;  // The "owner" tab (system tab)
  childTabIds: string[]; // The "sub" tabs (editor tabs opened from parent)
}

// Add to WorkspaceSchema:
tabGroups: z.record(z.string(), TabGroup).default({})
```

### Operations (in `tab-group-operations.ts` or `system-tab-operations.ts`)

| Operation | Description |
|-----------|-------------|
| `createTabGroup(ws, parentTabId)` | Creates an empty group for a parent tab, returns the group ID |
| `addToTabGroup(ws, groupId, tabId)` | Adds a tab to an existing group |
| `removeFromTabGroup(ws, groupId, tabId)` | Removes a tab from a group |
| `hasOpenTabsInGroup(ws, groupId)` | Returns true if any child tab still exists in `editorTabs` |
| `getTabGroupByTabId(ws, tabId)` | Returns the group a tab belongs to (searching both parent and child IDs) |
| `closeTabGroup(ws, groupId)` | Removes all child tabs from their cells and deletes the group |

### Changes to Existing Code

1. **`system-tab-operations.ts`**
   - Replace `_hasAssociatedEditorTabs` with `hasOpenTabsInGroup` lookup via `getTabGroupByTabId`
   - Replace `_closeAssociatedEditorTabs` with `closeTabGroup`
   - Remove the two private helper functions

2. **`projects-system-tab.ts`**
   - On mount, store the tab group ID on the `<openp41ge-project-list>` element (alongside `systemTabId`)

3. **`openp41ge-project-list.ts`**
   - When dispatching `openTabInCell`, pass `{ tabGroupId }` (the group ID) instead of `sourceSystemTabId`
   - Remove `systemTabId` property, add `tabGroupId` property

4. **`openTabInCell` / tab creation flow**
   - When a tab is created with `tabGroupId` in config, auto-add the new tab ID to the corresponding group via `addToTabGroup`

5. **`sidebar` / focus tracking**
   - No change needed — the `_hasAssociatedEditorTabs` replacement in `openSystemTab` prevents close when children exist in the group
   - The key fix: `openSystemTab` now looks up the group by parent tab ID and checks if any children are still open in `editorTabs`

### How It Fixes the Bug

The user's scenario: clicking the project-detail tab (child) and both tabs close.

The issue was that `_closeAssociatedEditorTabs` only ran from `closeSystemTab`, which was called when the system tab was closed. But clicking the child tab (project-detail) shouldn't close the parent (Projects system tab) at all. The `closeSystemTab` was likely triggered by an interaction we couldn't trace — the tab group system makes the relationship explicit in state so ANY code path that tries to close the parent first checks the group and skips if children exist.

## Files Changed

- `packages/openp41ge/src/layout/types.ts` — Add `TabGroup` interface and schema field
- `packages/openp41ge/src/layout/system-tab-operations.ts` — Replace `_hasAssociatedEditorTabs`/`_closeAssociatedEditorTabs` with `TabGroup`-based operations; add `createTabGroup`, `addToTabGroup`, `closeTabGroup`, `getTabGroupByTabId`
- `packages/openp41ge/src/renderer/apps/system-tabs/projects-system-tab.ts` — Create tab group on mount, pass `tabGroupId` to element
- `packages/openp41ge/src/renderer/components/openp41ge-project-list.ts` — Use `tabGroupId` instead of `sourceSystemTabId`

## Testing Strategy

1. **Unit tests** (in `operations.test.ts`):
   - `createTabGroup` creates a group and returns its ID
   - `addToTabGroup` adds a tab to an existing group
   - `getTabGroupByTabId` finds the group by parent or child tab ID
   - `hasOpenTabsInGroup` returns correct results when children exist / don't exist
   - `closeTabGroup` removes all child tabs and deletes the group
   - `openSystemTab` skips close when the parent tab has children in its group
   - `closeSystemTab` calls `closeTabGroup` on its group

2. **Existing tests**: The 4 pre-existing failures should remain unchanged (no new failures introduced).

## UX Considerations

- **Focus management**: Tab groups are purely conceptual — they don't affect DOM focus or keyboard navigation. They only affect whether an unpinned system tab gets closed on defocus.
- **Visual feedback**: None directly from tab groups. The active tab indicator (blue/grey) is unaffected.
- **Error state**: If a child tab ID in a group doesn't exist in `editorTabs`, `closeTabGroup` skips it gracefully (`removeTabFromCell` returns workspace unchanged for unknown tab).

## Completion Criteria

- [ ] `TabGroup` type and schema added to `types.ts`
- [ ] `createTabGroup`, `addToTabGroup`, `closeTabGroup`, `getTabGroupByTabId` implemented in `system-tab-operations.ts`
- [ ] `openSystemTab` uses `getTabGroupByTabId` + `hasOpenTabsInGroup` instead of `_hasAssociatedEditorTabs`
- [ ] `closeSystemTab` calls `closeTabGroup` instead of `_closeAssociatedEditorTabs`
- [ ] Private helper functions removed
- [ ] Projects system tab creates a tab group on mount
- [ ] Project list passes `tabGroupId` instead of `sourceSystemTabId`
- [ ] Unit tests pass (same 4 pre-existing failures only)
- [ ] TypeScript compiles with no new errors
