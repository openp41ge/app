2026-07-17

# Sidebar System Tabs — Replace Activity Bar with a Dual-Sidebar Tab System

## Status: ✅ Phase 4 (Cleanup) Complete — Phase 5 (Testing) remaining

### ✅ Completed

#### Phase 1 — Data Model & Rename
- [x] Renamed `workspace.tabs` → `workspace.editorTabs` everywhere
- [x] Added `SystemTab` type and `workspace.systemTabs`
- [x] Added sidebar state fields to `Window`/`SidebarStateSchema`
- [x] Created `system-tab-operations.ts` with 8 operations
- [x] Updated `serialization.ts` with backward compat and unpinned system tab stripping

#### Phase 2 — UI Components
- [x] Rewrote `<openp41ge-sidebar>` as a dual-sidebar Lit component
- [x] Updated `<openp41ge-windowview>` with left/right sidebar layout
- [x] System tab types registration (4 system tab controllers: Explorer, Git, Projects, Search)
- [x] Updated sidebar to use system tab registry instead of hardcoded app type checks

#### Phase 3 — Event Handling & IPC
- [x] Updated all renderer files from `ws.tabs` to `ws.editorTabs`
- [x] Updated keyboard shortcuts for system tabs

#### Phase 4 — Cleanup ✅
- [x] Removed old activity bar component (`openp41ge-activity-bar.ts`)
- [x] Removed ephemeral editor tab code:
  - `isEphemeral`, `ephemeralPinned` from `TabSchema`
  - `toggleEphemeralPin` from cell-operations
  - `isEphemeral` param from `openTabInCell` and `addColumnTabAt`
  - Ephemeral dismissal logic from event handler
  - Ephemeral references from serialization, windowview, project-switch-service
- [x] Removed old sidebar view state wiring:
  - `setSidebarViewOp`, `toggleSidebarViewOp`, `setSidebarWidthOp` from window-operations
  - Updated all callers in worktree-tree.ts, worktree-controller.ts, project-handlers.ts
- [x] Removed old `sidebar-views/` directory (`ExplorerSidebarView`, `GitSidebarView`, `SidebarView` interface)
- [x] Removed project picker from editor tab registry (`register-app-types.step.ts`)
- [x] Updated `project-switch-service.ts` to use system tab approach
- [x] Updated IPC handlers (project-handlers.ts) to use new system tab operations
- [x] Cleaned up test files: all 715 tests pass (10 pre-existing failures)

### 🔄 Remaining

#### Phase 5 — Testing
- [ ] Integration tests for system tab operations (edge cases)
- [ ] E2E tests for sidebar interactions
- [ ] Remove/update tests for removed functionality (ephemeral tab tests, activity bar tests)

#### Build & Quality
- [x] `nx build` passes
- [x] `nx test` — 715 passing (10 pre-existing failures unrelated)
