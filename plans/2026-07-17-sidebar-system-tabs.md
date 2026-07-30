2026-07-17

# Sidebar System Tabs — Replace Activity Bar with a Dual-Sidebar Tab System

## Goal

Replace the activity bar and ephemeral editor-tab project picker with two independent tab systems:

1. **Editor tabs** (the existing grid — renamed from `tabs` to `editorTabs`)
2. **System tabs** (a new sidebar-based tab system for app panels like Explorer, Git, Search, Project Picker)

The activity bar is removed entirely. Sidebars are horizontal tab bars on the left and right of the window grid. Pinned system tabs are project-wide (visible in all windows); unpinned system tabs are per-window.

## Rationale

- The activity bar is an inflexible icon strip that doesn't scale. Converting its entries to tabs makes them consistent with the rest of the UI (drag, reorder, pin, close).
- The ephemeral-tab-in-the-editor-grid approach for the project picker was a prototype. System tabs in sidebars are a cleaner home for app-level tools.
- Two sidebars (primary/secondary) let users keep context-relevant panels open without cluttering the editor grid.

## Approach

### Data Model Changes

**Rename** `workspace.tabs` → `workspace.editorTabs` everywhere (types, operations, serialization, IPC).

**Add** `workspace.systemTabs: Record<string, SystemTab>`:

```ts
interface SystemTab {
  id: string;
  appType: string;
  title: string;
  pinned: boolean;
}
```

**Add** sidebar state to `Window`:

```ts
interface Window {
  // ... existing fields (id, bounds, grid, etc.)
  leftSidebarOpen: boolean;
  rightSidebarOpen: boolean;
  leftSidebarTabs: string[];   // ordered system tab IDs
  rightSidebarTabs: string[];  // ordered system tab IDs
  activeLeftTab: string | null;
  activeRightTab: string | null;
}
```

**2-phase persistence:**
1. Rename `stripPreviewTabs` to also strip unpinned system tabs
2. Save only pinned tabs (both editor and system)

### Layout

```
┌────────────────────────────────────────────────────────────┐
│ Titlebar                                                      │
├────────────────────────────────────────────────────────────┤
│ [Editor Tab Bar]                                              │
│ [file1.ts] [file2.ts] [file3.ts]                              │
├────────────┬─────────────────────────────────┬───────────────┤
│ Left       │                                  │ Right         │
│ Sidebar    │  Editor Grid Content             │ Sidebar       │
│ ────────   │                                  │ ────────      │
│ [Exp][Git] │                                  │ [Out][Bug]    │
│ [Search]   │                                  │               │
│ ────────   │                                  │ ────────      │
│            │                                  │               │
│ Content of │                                  │ Content of    │
│ active tab │                                  │ active tab    │
│            │                                  │               │
└────────────┴──────────────────────────────────┴───────────────┘
```

- Each sidebar has a **horizontal tab bar** at the top (same visual style as the editor tab bar: scrollable, inner shadows, overflow).
- Content area below for the active system tab.
- Sidebar width: fixed or min-width, like VS Code sidebars.
- Open/closed state is per-window. A closed sidebar is hidden; editor grid expands.

### Tab Lifecycle

**Opening a system tab:**
1. Determine target sidebar: focused sidebar, or primary (default right) if none focused.
2. Check if the `appType` already exists in that sidebar's `leftSidebarTabs` / `rightSidebarTabs`.
3. If yes → activate that tab.
4. If no → create a new `SystemTab`, append its ID to the sidebar's tab list, activate it.

**Pinning a system tab:**
1. Toggle `pinned` on the system tab.
2. When pinned → the tab is automatically added to ALL windows' same-sidebar tab lists (if not already present).
3. When unpinned → if the tab came from `*` propagation, remove it from other windows (keep it only in the originating window).

**Closing a system tab:**
1. Unpinned: remove from this window's sidebar list. Delete from `systemTabs` if no window references it.
2. Pinned: prompt confirmation. Remove from ALL windows' sidebar lists. Set `pinned = false` or delete from `systemTabs`.

**Reordering:** Drag within the sidebar's tab bar reorders the `leftSidebarTabs` / `rightSidebarTabs` array.

### System Tab Types

| AppType ID  | Title             | Icon | Purpose                    |
|-------------|-------------------|------|----------------------------|
| explorer    | Explorer          | 📁   | File tree (from activity bar) |
| git         | Git               | ⎇    | Git status/branches (from activity bar) |
| search      | Search            | 🔍   | Full-text search (from activity bar) |
| projects    | Projects          | ⌂    | Project picker + switcher  |

More types can be added later via the existing `registerAppType` mechanism.

### UI Components

**New: `<openp41ge-sidebar>`** (Lit element)
- Props: `side: "left" | "right"`, `systemTabs`, `tabs`, `open`, `activeTab`
- Renders a horizontal tab bar (`<tab-bar system>` with a `system` mode) + content area for the active tab
- Reuses the existing `<tab-bar>` component with a new `system` attribute that changes behavior:
  - Pin button for pinned/unpinned
  - Close button
  - Drag reorder
  - No split/move to grid
- Slot-based content area: renders the system tab's controller content

**Modified: `<openp41ge-windowview>`**
- Renders left sidebar → editor grid → right sidebar
- Passes per-window sidebar state to each sidebar component
- Listens for sidebar toggle events

**Modified: `<tab-bar>`**
- Add `system` attribute to enable system-tab mode (pin button always shown, no preview concept, different drag behavior)

### Operations (all pure functions in `src/layout/`)

New operations:
- `openSystemTab(ws, winId, side, appType, title)` → returns new workspace with system tab opened
- `closeSystemTab(ws, winId, side, tabId)` → closes system tab, propagates if pinned
- `pinSystemTab(ws, tabId, pinned)` → toggles pinned state, propagates to all windows
- `reorderSystemTab(ws, winId, side, tabId, newIndex)` → reorders sidebar tabs
- `toggleSidebar(ws, winId, side)` → toggles sidebar open/closed
- `activateSystemTab(ws, winId, side, tabId)` → activates a system tab
- `resizeSidebar(ws, winId, side, width)` → changes sidebar width (future)

Modified existing operations:
- Rename `tabs` → `editorTabs` throughout
- `openTabInCell`, `addColumnTabAt`, etc. → use `editorTabs`
- `removeTabFromCell` → only affects editor tabs
- `stripPreviewTabs` → also strips unpinned system tabs

### Rename `tabs` → `editorTabs`

This is the most pervasive change. All files that reference `workspace.tabs` or `ws.tabs` need updating. Approach:

1. Update `types.ts`: rename the field, update interfaces
2. Update all layout operations in `src/layout/`: change parameter names and references
3. Update serialization: `serialize`/`deserialize` handle the renamed field
4. Update renderer components that read `ws.tabs` / `windowview.tabs`
5. Update the preload and IPC types
6. Update test fixtures

To minimize breakage, I'll keep backward compat with old saved state (if `tabs` is present in deserialized JSON, map to `editorTabs`).

### IPC / Preload

- Add a new preload API `window.openp41ge.sidebar.*` for sidebar operations, or extend `window.openp41ge.workspace.dispatch()` with the new operation names.
- Keep using the existing `dispatch` mechanism (stringly-typed operations) for consistency.

### Removing Ephemeral Editor Tab Code

After system tabs are functional:

1. Remove `isEphemeral` and `ephemeralPinned` from `TabSchema`
2. Remove `toggleEphemeralPin` operation
3. Remove ephemeral dismissal logic from `openp41ge-tabs-event-handler.ts`
4. Remove the project picker app type from editor grid registration
5. Remove the project picker inline component (or re-register it as a system tab)
6. Clean up the project-switch-service (no more project picker tab in editor grid)

## Files Changed

### Phase 1 — Data Model & Rename

| File | Change |
|------|--------|
| `packages/openp41ge/src/layout/types.ts` | Rename `tabs` → `editorTabs`; add `SystemTab` type; add sidebar fields to `Window` |
| `packages/openp41ge/src/layout/operations.ts` | Rename `tabs` throughout; add system tab operations |
| `packages/openp41ge/src/layout/tab-operations.ts` | Rename to use `editorTabs` |
| `packages/openp41ge/src/layout/cell-operations.ts` | Rename |
| `packages/openp41ge/src/layout/grid-operations.ts` | Rename |
| `packages/openp41ge/src/layout/serialization.ts` | Rename; strip unpinned system tabs; backward compat |
| `packages/openp41ge/src/layout/window-operations.ts` | Add sidebar toggle operations |
| Other `src/layout/*.ts` files | Rename as needed |

### Phase 2 — UI Components

| File | Change |
|------|--------|
| `packages/openp41ge-uikit/src/components/tabs/tab-bar.ts` | Add `system` attribute mode |
| `packages/openp41ge/src/renderer/components/openp41ge-sidebar.ts` | **New** — sidebar Lit element |
| `packages/openp41ge/src/renderer/components/openp41ge-windowview.ts` | Add sidebar layout + data passing |
| `packages/openp41ge/src/renderer/components/openp41ge-grid.ts` | Grid takes full remaining width |
| `packages/openp41ge/src/renderer/apps/app-registry.ts` | Register system tab types separately from editor tab types |
| `packages/openp41ge/src/renderer/controllers/types.ts` | Add `SystemTabController` interface or extend `TabController` |

### Phase 3 — Event Handling & IPC

| File | Change |
|------|--------|
| `packages/openp41ge/src/renderer/services/openp41ge-tabs-event-handler.ts` | Add sidebar event handling; remove ephemeral dismissal |
| `packages/openp41ge/electron/ipc-handlers/dispatch-handler.ts` | Handle new system tab operations |
| `packages/openp41ge/src/renderer/services/project-switch-service.ts` | Remove old project picker logic |
| `packages/openp41ge/electron/ipc-handlers/project-handlers.ts` | No longer adds picker tab automatically |

### Phase 4 — Cleanup

| File | Change |
|------|--------|
| `packages/openp41ge/src/renderer/apps/project-picker/` | Remove or convert to system tab registration |
| `packages/openp41ge/src/renderer/components/openp41ge-project-picker.ts` | Remove inline mode or keep for system tab |
| Various test files | Update to use `editorTabs`; add system tab tests |

## Testing Strategy

### Unit Tests (Vitest)
- Pure function tests for new operations (`openSystemTab`, `closeSystemTab`, `pinSystemTab`, `toggleSidebar`)
- Serialization tests for `editorTabs` rename and backward compat
- System tab propagation tests (pinned → all windows, unpinned → single window)
- Non-duplicate enforcement tests

### Integration Tests
- Sidebar rendering with mock workspace state
- Tab activation and content switching within a sidebar
- Pin/unpin propagation across multiple windows

### E2E Tests (Playwright)
- Opening a system tab via keyboard shortcut → tab appears in sidebar
- Pinning a system tab → appears in new window's sidebar
- Closing a pinned system tab → removed from all windows
- Dragging to reorder system tabs within a sidebar
- Sidebar open/close toggles
- Activity bar is no longer present

## UX Considerations

- **Keyboard shortcuts**: Cmd+Shift+E (Explorer), Cmd+Shift+G (Git), Cmd+Shift+F (Search), Cmd+Shift+P (Project Picker). Same as VS Code for familiarity.
- **Sidebar toggle**: Cmd+B toggles primary sidebar. Cmd+Shift+B toggles secondary sidebar (following VS Code conventions). This will be configurable later.
- **Tab bar overflow**: Same scrollable behaviour with inner shadows as the current editor tab bar.
- **Primary sidebar default**: Right side (configurable later via a setting).
- **Focus management**: Opening a system tab focuses the tab's content. Tab/Shift+Tab cycles within the sidebar panel. Ctrl+` jumps to editor grid.
- **Empty state**: When a sidebar has no open system tabs, it shows a placeholder message or collapses.
- **Loading state**: System tab content shows a loading spinner while the controller mounts (same as editor tabs today).
- **Error state**: System tab content area shows an error state if the controller fails.

## Open Questions

1. **Keyboard shortcut for "new system tab"** — is there a + button at the end of the system tab bar (like browser tabs), or just shortcuts?
2. **Sidebar width** — fixed pixel width, user-resizable, or dynamic based on content? I'll default to a fixed 300px per sidebar with future resize support.
3. **How do system tabs get their content?** — They use the same `TabController` interface as editor tabs (mount/unmount/setVisible), but should they? Or is a simpler `SystemTabController` needed?
4. **Project picker activation** — When you activate a project from the picker, should it close the picker system tab, or keep it open? (Currently it closes, which might be desirable for a system tab in the sidebar.)

## Completion Criteria

- [ ] Renamed `tabs` → `editorTabs` everywhere, backward compat with old save files
- [ ] `SystemTab` type added, `systemTabs` field in workspace
- [ ] Sidebar state fields added to `Window` type
- [ ] System tab operations implemented (open, close, pin, reorder)
- [ ] Sidebar toggle operation implemented
- [ ] `<openp41ge-sidebar>` component renders with tab bar + content area
- [ ] `<openp41ge-windowview>` renders sidebars around the editor grid
- [ ] `<tab-bar>` supports `system` mode for system tabs
- [ ] Pinned system tabs propagate to all windows
- [ ] Unpinned system tabs are per-window
- [ ] Non-duplicate enforcement: same appType can't appear twice in same sidebar
- [ ] Activity bar removed (no more DOM element)
- [ ] Ephemeral editor tab code removed (`isEphemeral`, `ephemeralPinned`, dismissal logic)
- [ ] Project picker is a system tab (registered in system tab registry, not editor tab registry)
- [ ] Keyboard shortcuts open system tabs (Explorer, Git, Search, Project Picker)
- [ ] Sidebar toggle shortcuts (Cmd+B, Cmd+Shift+B)
- [ ] Serialization: only pinned system tabs are saved
- [ ] All existing editor tab tests pass with `editorTabs` rename
- [ ] `nx quality` passes
- [ ] `nx test` passes
