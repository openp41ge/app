2025-07-25

# Plan: Move project switching to activity bar + sidebar + tab

## Goal

Replace the full-size modal project picker with a sidebar view (activity bar icon → project list) and a project management tab in the grid. The modal's functionality — switching projects, viewing repo/worktree trees, adding repos/worktrees, renaming, deleting — moves into these two surfaces. No duplicate UI for something that fits into the existing tab system.

## Rationale

The project picker modal is an overlay that blocks interaction with the rest of the app. The same functionality (project list, repo tree, inline add-repo with clone, rename, delete) can exist as a sidebar view + tab, matching the pattern already used by the explorer and git panel. This is more native, persistent, and discoverable.

## Approach

### Overview

```
Activity Bar                Sidebar                     Grid
┌──────────┐               ┌──────────────┐            ┌──────────────────┐
│ Explorer │               │ 🔍 Search    │            │  ┌──────────────┐│
│ Search   │  ──click──►   │ ───────────  │  ──click──► │  │ Project:     ││
│ Git      │               │ Project A ← │  opens tab  │  │ My Project   ││
│ Projects │               │ Project B   │            │  │              ││
│          │               │ Project C   │            │  │ Repos...     ││
└──────────┘               │ [+ New]     │            │  │ Worktrees... ││
                           └──────────────┘            │  │              ││
                                                        │  ┌──────────────┘│
                                                        └──────────────────┘
```

### 1. New sidebar view: `openp41ge-projects-view`

A new sidebar view (registered alongside explorer, search, git) that shows:
- **Search bar** at top — filter project list
- **Project list** — clickable items, shows active indicator, right-click context menu (rename, delete)
- **"New project"** button at bottom
- Inline rename on double-click (matching existing patterns)
- Draft badge for current draft

The component follows the existing sidebar view pattern (like `openp41ge-worktree-tree` for explorer, or the git panel).

### 2. New app type: `project-manager`

A new pane type registered in `app-registry.ts` as `"project-manager"`:
- Shows project details (name, created/modified dates, draft badge)
- Shows repo tree with worktrees (reuses `<openp41ge-repo-tree-item>`)
- Inline add-repo with clone progress and URL input
- Add worktree inline
- Delete project button
- Save Draft / Save As for draft projects

This is essentially the **right panel** of the current picker, rendered in a tab instead of a modal.

### 3. Remove `openp41ge-project-picker`

Delete the modal component entirely. Its functionality is split:
- Left panel → `openp41ge-projects-view` sidebar
- Right panel → `project-manager` tab
- Top bar (search, close) → sidebar header

### 4. Activity bar icon

Add a new activity bar button for the projects view. The existing activity bar is rendered in `openp41ge-windowview.ts`. A new icon + click handler opens the projects sidebar.

### 5. Titlebar changes

The titlebar already shows the active project name. When clicked, instead of opening the modal, it:
- Opens the projects sidebar view (toggle)
- Or switches to an already-open project-manager tab

### 6. Switching flow

- Click project in sidebar → dispatches `addColumnTabAt` for `"project-manager"` + switches active project context
- If already open, activates the existing tab (like `_activateExistingGitTabInCell`)
- Close project-manager tab → doesn't affect active project (just closes the management UI)

### 7. Draft handling

- On startup with draft, auto-open the draft as a project-manager tab
- Save Draft As... stays in the file menu, saves and renames the project
- GC on startup continues unchanged

## Files Changed

### New files
- `src/renderer/components/sidebar-views/projects-view.ts` — Sidebar view component
- `src/renderer/apps/project-manager/project-manager-controller.ts` — Pane controller
- `src/renderer/apps/project-manager/index.ts` — Registration entry

### Modified files
- `src/renderer/apps/app-registry.ts` — Register `"project-manager"` type
- `src/renderer/components/openp41ge-windowview.ts` — Add activity bar icon
- `src/renderer/components/openp41ge-titlebar.ts` — Click opens sidebar instead of modal
- `src/renderer/components/openp41ge-project-picker.ts` — Delete (remove the file)
- `src/renderer/components/openp41ge-save-draft-dialog.ts` — Update to work without picker
- `src/renderer/services/project-switch-service.ts` — Update `showProjectPicker()` → sidebar toggle
- `src/renderer/bootstrap/steps/check-project.step.ts` — May need updating

### No changes to
- IPC handlers / preload / `global.d.ts`
- `openp41ge-git` package
- Layout data model
- Project store / draft logic

## Testing Strategy

### Unit tests
- New: `project-manager-controller.test.ts` — mount, render, state transitions
- Updated: `project-switch-service.test.ts` — sidebar toggle vs modal show

### Integration tests
- Sidebar view renders project list, responds to search filter
- Clicking a project in sidebar opens a tab
- Inline add-repo with clone progress renders in tab
- Activate/switch project context works from sidebar
- Draft auto-opens as tab on startup

### E2E tests
- Full flow: startup → draft shown as tab → save as → rename → add repo → switch projects

## UX Considerations

- **No more modal** — the project list is always one click away in the activity bar
- **Tab-native** — project management reuses existing pane patterns (mount/unmount, snapshot/restore, drag to split)
- **Consistent with explorer** — repo tree rendering is identical between explorer and project-manager tab
- **Focus retention** — switching projects doesn't close the user's file tabs; the project-manager tab is separate
- **Keyboard navigation** — Tab through sidebar items, Enter opens/activates, roving tabindex

## Completion Criteria

- [x] Projects sidebar view shows project list with search, active indicator, context menu
- [x] Clicking a project opens a project-manager tab with repo/worktree management
- [x] `openp41ge-project-picker` removed
- [x] Activity bar has Projects icon
- [x] Titlebar click opens sidebar instead of modal
- [x] Draft auto-opens as tab on startup
- [x] All existing unit tests pass (582+)
- [x] `nx build` succeeds
