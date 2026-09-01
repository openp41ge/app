# Plan: Workspace windows + Window Manager window

Date: 2026-09-01

## Progress

- [x] **Phase 1a — v2 data model + session conversion (5acc852)**: `WorkspaceFileData`
      v2 fields, `layout/workspace-file.ts` (migration, `workspaceToFileData` /
      `fileDataToWorkspace`, serialize/deserialize), read/write path migrated,
      `createWorkspace` writes v2. Unit tests green (1090).
- [x] **Phase 2a — window-type + binding plumbing (cd20ed6)**: `Openp41geWindowType`,
      `openp41geWindowMeta` map, `getWindowMeta()`, `createOpenp41geWindow` meta
      param, binding sent in `openp41ge:init`; preload `getWindowType()`/
      `getWorkspacePath()`; typed in `global.d.ts`. No behaviour change yet.
- [x] **Phase 1c — sidebar split (fa1482a)**: shared `Workspace.sidebar`
      (set/side/open) + per-window `sidebar` (activeViewId,width,activeLeft/RightTab).
      All `system-tab-operations` moved to shared sidebar; `stripPreviewTabs` +
      `migrateWorkspace` lift legacy per-window fields; renderer reads shared
      sidebar. Live-verified. Tests 1091.
- [x] **Phase 3a — renderer window-kind awareness (7628186)**: `StartupContext`
      gains `windowType`/`workspacePath`; new `ResolveWindowKindStep` reads
      `getWindowType()`/`getWorkspacePath()` defensively (awaits init) and runs
      before state fetch. Tests 1096.
- [x] **Phase 3b — window-manager window (f4be16d)**: `createWindowManagerWindow`/
      `openWindowManager`/`getOpenWindowSummaries`; window-manager-handlers IPC;
      preload `window.openp41ge.windowManager`; renderer `openp41ge-window-manager`
      panel + boot branch; `closeOrphanedWindows` skips window-manager windows.
      Live-verified.
- [x] **Phase 3b/7 — startup + quit (245813a)**: startup shows Window Manager when
      no `--workspace` arg; `activate` mirrors it; last window close → quit.
      Removes the bootstrap's stray windowview in window-manager windows.
- [x] **Phase 1b — per-workspace save (dcd2193)**: `FileWorkspaceSessionStore`
      (session save/load into the bound `.openp41ge-workspace` file); dispatcher
      save handler writes to the bound file; removed global `workspace.json`.
      Live-verified (file carries version 2 + windows + sharedSidebars). Tests 1100.
- [x] **Phase 6/4 — menus (435e462)**: File→New Window placeholder; Window→Add
      Workspace Window; New/Open/Save Workspaces + View>Workspaces route to the
      Window Manager in a workspace window.
- [x] **Phase 4 — bind open workspace (7bb0aef)**: workspace windows load their
      bound workspace (`loadPath`); title-bar workspace button becomes an inert
      label (no in-window switching). Live-verified (title shows "Two", no pointer).
- [x] **Phase 7 — restore (1f2f80a)**: `_openWorkspaceSession` loads the file's
      session and opens a bound window per restored window. Live-verified.
- [x] **Terminology (Phase 7)**: renamed `activeWorkspace` → `openWorkspace` and
      `WorkspaceFileService.activeFilePath`/`activeData`/`activeWorkspaceName` →
      `openFilePath`/`openData`/`openWorkspaceName`, `activateWorkspace` →
      `openWorkspace`, `appState.activeWorkspaceFilePath` → `openWorkspaceFilePath`.
      Window-manager UI now says "Open" (button/pill), uses an `isOpen` helper and
      `open` card class; comments/wordings use "open workspace". Typecheck + oxlint
      clean, 1100 tests green.
- [x] **Phase 4 refinement — remove in-window Workspaces overlay tab**: a workspace
      window's system overlay top bar no longer lists "Workspaces" (its `workspaces`
      tab + `workspace-manager` editor-system-tab type are no longer registered). The
      Window Manager window uses its own `<openp41ge-window-manager>` component, so it
      needs neither. The Explorer worktree-warning icon (repo status) in a workspace
      window now routes to the Window Manager instead of opening a removed overlay.
      Live-verified: workspace window overlay registers only `[logs, editor]`.
      Typecheck + oxlint clean, 1100 tests green.



## Goal

Replace the single global "workspace" with a model where each window is bound to
a `.openp41ge-workspace` file, and add a second window type — a thin **Window
Manager** — that selects which workspace to open and tracks which workspaces/windows
are open. Workspaces become a hard, persisted prerequisite of a window (not a
reselectable in-memory value), so a workspace feels solid and is not trivially
switched.

## Rationale

Today a `.openp41ge-workspace` file is just a project manifest (repos), while the
running layout (windows/grids/tabs) lives in a single global `workspace.json`
that holds ALL windows regardless of which workspace they belong to. That global
file is conceptually wrong once several workspaces are open across several windows
at once, and the workspace is trivially switchable from the title bar / overlay.
This change makes a workspace self-contained and persistent, moves window &
shared layout into the workspace file, removes in-window workspace switching, and
introduces a dedicated window-manager window for opening/creating workspaces.

## Data model

The `.openp41ge-workspace` file becomes the single source of truth for a workspace
(manifest **and** session). The global `workspace.json` is removed. File `version`
bumps to `2`; v1 files are migrated by reading and adding an empty session.

### `WorkspaceFileData` (v2)

```ts
interface WorkspaceFileData {
  id: string;
  name?: string;
  version: 2;
  createdAt: string;
  dataDir: string;
  repos: Array<{ url: string; worktrees: string[] }>;
  lastActivatedAt?: string;
  // ── NEW: shared, workspace-owned state ──────────────────────────────
  systemTabs: Record<string, SystemTabSchema>;   // which sidebar panels exist (pinned/order)
  scopedFolders: string[];                        // workspace-level
  sharedSidebars: {
    leftSidebarTabs: SystemTabId[];               // which tabs, docked left
    rightSidebarTabs: SystemTabId[];              // which tabs, docked right
    leftSidebarOpen: boolean;
    rightSidebarOpen: boolean;
  };
  // ── NEW: session — one entry per open workspace window ───────────────
  windows: Array<{
    id: string;                                   // window instance id
    bounds: Bounds;
    monitor: number;
    grid: Grid;                                   // central grid (per-window)
    overlays: Overlay[];
    editorSystemTabIds: EditorSystemTabId[];
    editorSystemActiveTabId: string | null;
    bottomPaneGrid: Grid;
    sidebar: {
      activeLeftTab: SystemTabId | null;          // per-window
      activeRightTab: SystemTabId | null;         // per-window
      width: number;                              // per-window drag position
    };
  }>;
}
```

### Shared vs per-window (sidebar semantics)

- **Shared across every window of a workspace:** which sidebar panels exist
  (`systemTabs`), their side assignment (`leftSidebarTabs`/`rightSidebarTabs`),
  and whether each sidebar is open (`leftSidebarOpen`/`rightSidebarOpen`). If the
  Explorer is open on the right in one window, it is open on the right in all.
- **Per-window:** the active sidebar tab (`activeLeftTab`/`activeRightTab`) and the
  sidebar drag `width`.

Restoring a workspace recreates `windows.length` windows, each with its `grid`,
`bounds`, `overlays`, and per-window sidebar active tab + width.

## Approach

### Phase 1 — Persistence & data model
- Extend `WorkspaceFileData` (v2) with `systemTabs`, `scopedFolders`,
  `sharedSidebars`, and `windows[]`. Add a version-migration read in the main
  process (`WorkspaceStateStore` / a new `WorkspaceSessionStore`) that upgrades v1
  (no session) to v2.
- Replace the global `workspace.json` save with a **per-workspace** save: mutate
  → write the affected workspace's `.openp41ge-workspace` file. Remove the
  `workspaceStatePath` global store from `Openp41geApplication`.
- Keep the layout type `Workspace` as the in-memory per-workspace unit (one
  workspace's windows), and split `Window.sidebar` so docking/open state is
  workspace-level and active/width stays on the window.

### Phase 2 — Window types & main process
- Add `windowType: "workspace" | "window-manager"` to window creation and to the
  `openp41ge:init` payload.
- New `openp41geWindows` metadata: `Map<windowId, { windowType, workspacePath? }>`.
- `createWindowManagerWindow()` (thin) and `createWorkspaceWindow(workspacePath, opts)`.
- App startup: if a workspace is provided (CLI arg), restore + open it as workspace
  window(s); otherwise open the **Window Manager** window.
- Track open windows per workspace; when the **last** window closes → `app.quit()`.
- Keep `WorkspaceService` as the repo/clone service (unchanged responsibility), but
  it is invoked with the bound workspace's `dataDir`/repos.

### Phase 3 — Renderer bootstrap
- `openp41ge:init` carries `windowType` + `workspacePath`; `startup-context.ts`
  stores them.
- `window-manager` boot: render the workspace selection/editing UI (reuse the
  existing Workspaces overlay tab) in a thin window. The **Activate / Open**
  button dispatches an IPC to create a **new workspace window** bound to the
  selected workspace (not mutate the current window). A right-hand column lists
  currently-open windows grouped by workspace.
- `workspace` boot: render the normal app but **pinned** to the bound workspace
  (no workspace picker, no in-window workspace switching).

### Phase 4 — Remove workspace systems from the workspace window
Remove from the workspace window:
- The title-bar workspace button (`openp41ge-workspace-search`).
- The in-window Workspaces overlay tab (`workspace-manager` system tab).
- The `File → New/Open/Save Workspace` menu items (moved to the window manager).
- The global "switch workspace → reload repos" path driven by `WorkspaceFileService`
  `activeFilePath`.

Keep every other overlay tab and the SEO/Explorer/Git/Search sidebars.

### Phase 5 — Sidebar shared-state refactor
- Move `leftSidebarTabs`/`rightSidebarTabs`/`leftSidebarOpen`/`rightSidebarOpen` out
  of `Window.sidebar` into the workspace-shared section.
- Keep `activeLeftTab`/`activeRightTab`/`width` on `Window.sidebar`.
- Update `layout/system-tab-operations.ts`, `layout/serialization.ts`,
  `layout/file-operations.ts`, `compute-layout.ts`, and the sidebar components
  (`openp41ge-sidebar.ts`, `openp41ge-windowview.ts`) to read/write the shared
  section and broadcast dock/side changes across the workspace's windows.

### Phase 6 — Menus
- **Window → Add Workspace Window**: open a new window with the **current**
  workspace's binding (fresh central grid).
- **Show Window Manager** under the app menu (`app.name` submenu), plus a
  `Window`-menu entry as a convenience; reopen the window-manager window.
- **File → New Window (Cmd+N)**: becomes a placeholder modal ("not available yet");
  it will later become "new tab + tab picker". It must NOT open a new window.
- Move New/Open/Save Workspace into the Window Manager window.

### Phase 7 — Restore & terminology
- Opening a workspace restores its windows/grids/sidebar positions from the file.
- Rename `activeWorkspace` → `openWorkspace` ("open" = the workspace has ≥1 live
  window). Rename `WorkspaceFileService.activeFilePath`/`activeData` and any
  consumers; update the "active workspace" wording in the window-manager UI.
- New-window triggers from the current workspace:
  - `Window → Add Workspace Window` (this phase).
  - Dragging a workspace file / a worktree file onto the desktop → create a new
    window for that workspace (documented as a follow-up; not in this phase).
- There is **no** way to change an existing window's workspace binding.

## SOLID review (planned)

- **S/O** — `Openp41geApplication` and `window-manager.ts` grow a `windowType`
  branch. Introduce a small **window-factory + registry** (type → create fn) so a
  future window type registers itself rather than being a `switch` in the app:
  `WindowKind { kind, createWindow(binding?) }`.
- **D** — the per-workspace save should be behind an interface (e.g.
  `WorkspaceSessionStore`) so tests inject an in-memory store; the
  `OperationDispatcher` should not hard-wire the file path.
- **I** — split the existing `WorkspaceFileService` (currently a broad "do
  everything" service) so the window-manager uses a read/list/activate surface and
  workspace windows use a read-only bound-surface, rather than one shared mutable
  `activeFilePath`.

## Files changed (indicative)

**Layout/data model**
- `packages/openp41ge/src/layout/types.ts` (WorkspaceFileData v2, sidebar split)
- `packages/openp41ge/src/layout/serialization.ts` (v2 read/write + v1 migration)
- `packages/openp41ge/src/layout/system-tab-operations.ts` (shared sidebar ops)
- `packages/openp41ge/src/layout/file-operations.ts`, `compute-layout.ts`

**Main process**
- `packages/openp41ge/electron/openp41ge-application.ts` (startup, menu, per-workspace save)
- `packages/openp41ge/electron/window-manager.ts` (windowType, factories, metadata)
- `packages/openp41ge/electron/ipc-handlers/window-handlers.ts`,
  `dispatch-handler.ts` (Add Workspace Window, window-manager activate)
- `packages/openp41ge/src/main/services/workspace-session-store.ts` (new)
- `packages/openp41ge/src/main/services/workspace-service.ts` (bound to a file)
- `packages/openp41ge/electron/preload.cjs` + `src/renderer/global.d.ts`

**Renderer**
- `packages/openp41ge/src/renderer/bootstrap/startup-context.ts`,
  `steps/fetch-initial-state.step.ts` (windowType + workspacePath)
- `packages/openp41ge/src/renderer/apps/system-tabs/workspace-manager-system-tab.ts`
  (reuse as window-manager; activate → new window; add open-windows column)
- `packages/openp41ge/src/renderer/services/workspace-file-service.ts` (open-workspace
  model / split surface)
- `packages/openp41ge/src/renderer/components/openp41ge-titlebar.ts` (remove workspace button)
- `packages/openp41ge/src/renderer/components/openp41ge-sidebar.ts`,
  `openp41ge-windowview.ts` (shared sidebar state)

## Testing strategy

- **Unit (layout):** v1→v2 migration (adds empty session), round-trip serialization
  of windows/grids/shared sidebars, shared vs per-window sidebar operations.
- **Integration (main):** `windowType`/binding metadata; startup-with-workspace vs
  startup-without; last-window-closed → quit; window-manager activate creates a
  workspace window; per-workspace save writes the correct file.
- **Integration (renderer):** `window-manager` vs `workspace` boot modes; sidebar
  dock/open state broadcast across windows while active-tab/width stay per-window;
  workspace window is bound to a fixed workspace with no picker.
- **Contract:** renamed `openWorkspace` surface (`activeFilePath` consumers) and the
  new `openp41ge:init` `windowType`/`workspacePath` fields.

## UX considerations

- Window Manager is thin: left = workspace list (existing list/detail/create UI),
  right = "Open windows" column grouped by workspace. Focus goes to the list on open;
  `Enter`/double-click activates.
- Activating a workspace **creates** a workspace window. If the workspace is already
  open, focus the most-recent window instead of duplicating (open question below).
- No in-window workspace switching; the workspace is shown as an immutable label in
  the title bar (not a button).
- Menus: `Window → Add Workspace Window`; `Show Window Manager` in the app menu.
- `File → New Window` shows a "coming soon" modal rather than silently no-op-ing.
- Reuse existing theme CSS variables and the confirm/toast/overlay patterns.

## Open questions

1. **Activating an already-open workspace** — focus its existing windows, or always
   create a new window (per your "activate creates a new window")? Default: focus
   the most-recent window to avoid duplicate windows.
2. **`close workspace` persistence** — when you "close" a workspace from the window
   manager, do we (a) clear its `windows[]` from the file (fresh on next open), or
   (b) keep the session so reopening restores it? Default (b) keep, consistent with
   "restore previous state".
3. **Sidebar `width`** — confirmed per-window, but should the shared `leftSidebarOpen`
   flag also gate a per-window "user hid it in this window" case, or is open strictly
   shared? Default: open state is strictly shared (no per-window override).
4. **Editor-system tabs & overlays** — confirm these restore per-window (they live in
   each window's entry) and are workspace-shared only where noted.

## Completion criteria

- [ ] A workspace is opened as its own `.openp41ge-workspace`-bound window(s); no global
      `workspace.json`.
- [ ] Window Manager window lists workspaces and open windows; Activate opens a
      workspace window; can be reopened via the app menu.
- [ ] The saved workspace file records the manifest + shared sidebars + window
      session; reopening restores window count, grids, bounds, and sidebar widths.
- [ ] Workspace window has no workspace picker / overlay / switch path; other overlay
      tabs still work; sidebars are shared (set/side/open) with per-window active+width.
- [ ] `Window → Add Workspace Window` works; `File → New Window` is a placeholder.
- [ ] Terminology uses "open workspace"; `activeWorkspace` references removed.
- [ ] Exit when the last window closes; startup shows the Window Manager when no
      workspace is passed.
- [ ] typecheck + oxlint + full test suites green (existing suite updated).
