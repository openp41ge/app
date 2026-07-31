2026-03-29

# System Tabs — Editor-Area Tabs That Override the Grid

## Goal

Introduce a new tab type — **system tabs** — that appear in the editor area and override the grid. These are for built-in main-app features (workspace manager, settings, etc.) that don't use the plugin system.

## Renaming

| Old Name | New Name | Location | Registration |
|----------|----------|----------|-------------|
| System tabs | **Sidebar tabs** | Left/right sidebar panels | Plugin registration |
| Editor tabs | **Editor tabs** | Grid in central area | Plugin registration |
| *(new)* | **System tabs** | Central area, overrides grid | Built into main app |

## Layout

```
┌──────────────────────────────────────────────────────┐
│                    Top Bar                            │
├────────┬───────────────────────────────────┬──────────┤
│ Left   │  [Sys Tab Bar] ← reorderable      │ Right    │
│ Sidebar│  ┌─────────────────────────────┐  │ Sidebar  │
│ (side- │  │                             │  │ (side-   │
│  bar   │  │  System Tab Content         │  │  bar     │
│  tabs) │  │  (fills central area)       │  │  tabs)   │
│        │  │                             │  │          │
│        │  └─────────────────────────────┘  │          │
│        │  [Editor Grid — hidden while      │          │
│        │   system tabs are open]           │          │
├────────┴───────────────────────────────────┴──────────┤
│                    Bottom Bar                          │
└──────────────────────────────────────────────────────┘
```

## Behaviour

- System tab bar renders at the top of the central area, ABOVE the editor grid
- When any system tab is open, the editor grid is hidden
- Closing all system tabs restores the editor grid (state preserved)
- Multiple system tabs can be open; only one visible at a time (click to switch)
- System tabs are reorderable via drag on the tab bar
- System tabs open by shortcut or menu click — NOT by drag
- System tabs have a close button (X) on the tab handle

## State

New state fields (window-level):

```typescript
interface WindowState {
  systemTabIds: TabId[];       // open system tabs, in order
  systemActiveTabId: TabId | null;
  // sidebar tabs and editor tabs unchanged
}
```

System tab state is independent from sidebar/editor tab state. Opening/closing system tabs does not affect the grid or sidebar.

## System Tab Registration

Built into the main app (no plugin registry needed):

```typescript
interface SystemTabRegistration {
  id: string;                    // e.g. "workspace-manager"
  title: string;
  icon?: string;
  createController(tabId: string): SystemTabController;
}
```

Registered in `app-registry.ts` alongside sidebar tab types, but with a separate registry. System tabs don't use the PluginRegistry.

## First System Tab: Workspace Manager

Replaces the old "Projects" modal and sidebar tab. Opens as a system tab in the editor area:

- Shortcut: Meta+Shift+P (same as before)
- Shows workspace list (repos, worktrees)
- Create/open/delete/rename workspaces
- No longer a modal overlay — it's a system tab

## Files Changed

### New Files

| File | Purpose |
|------|---------|
| `src/layout/types.ts` | Add `systemTabIds`, `systemActiveTabId` to Window type |
| `src/layout/operations.ts` | Add `openSystemTab`, `closeSystemTab`, `activateSystemTab`, `reorderSystemTabs` operations |
| `src/renderer/components/openp41ge-system-tab-bar.ts` | System tab bar component (separate from grid/sidebar tab bars) |
| `src/renderer/components/openp41ge-system-tab-content.ts` | Content area for active system tab |
| `src/renderer/apps/system-tabs/workspace-manager-system-tab.ts` | Workspace manager as a system tab controller |

### Modified Files

| File | Change |
|------|--------|
| `src/renderer/components/openp41ge-windowview.ts` | Render system tab bar + content ABOVE the grid; hide grid when system tabs open |
| `src/renderer/apps/app-registry.ts` | Add `registerSystemTabType()` and `getSystemTabRegistration()` |
| `data/event-routing-graph.json` | Add system tab event edges (tab-open-system-tab, tab-close-system-tab, etc.) |
| `src/renderer/handlers/tabs.handlers.ts` | Add system tab IPC handlers |
| `src/renderer/bootstrap/steps/register-shortcuts.step.ts` | Update Meta+Shift+P to open workspace manager as system tab |

## Naming Migration

Sidebar tabs in the codebase need renaming:
- `systemTabs` property → `sidebarTabs` 
- `activeTabId` (on sidebar) → stays the same (sidebar-local)
- File `openp41ge-system-tab-bar.ts` refers to the NEW system tabs (editor area)

## Event Graph Edges

```json
{ "id": "e030", "from": "system-tab-open", "to": ["system-tabs/open-tab"] },
{ "id": "e031", "from": "system-tab-close", "to": ["system-tabs/close-tab"] },
{ "id": "e032", "from": "system-tab-activate", "to": ["system-tabs/activate-tab"] },
{ "id": "e033", "from": "system-tab-reorder", "to": ["system-tabs/reorder-tabs"] }
```

## Edge Cases

- Opening a system tab when one is already open: just switch to the new one
- Closing the last system tab: hide system tab bar, show grid
- Grid state: fully preserved while system tabs are open
- Keyboard shortcuts still work while system tabs are open
- Sidebar still accessible while system tabs are open

## Completion Criteria

- [x] System tab bar renders above the grid in the central area
- [x] Grid is hidden when system tabs are open, restored when all close
- [x] Multiple system tabs can be open, reorderable, only one visible
- [x] Workspace manager system tab opens via Meta+Shift+P
- [ ] Sidebar tabs renamed everywhere (codebase consistency) — backward-compat aliases added, full rename deferred
- [x] System tab state is independent of sidebar/editor state
- [x] Event graph routes system tab operations (4 new edges e022-e025)
- [x] System tab controllers use EditorSystemTabRegistration registry (built-in, no plugin)
- [ ] Unit tests pass — pre-existing failures (14 tests)
