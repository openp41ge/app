2026-08-01

# Workspace system redesign: list + detail views, no drafts

## Goal
Replace the draft-based workspace system with a directory-based one where all
workspaces live in `~/.openp41ge/workspaces/`. Any action that needs a
workspace opens a modal to create one (no auto-drafts). The workspaces modal
has two views: a list of all workspaces and an individual detail/settings view
with a slide transition.

## Key changes

### 1. WorkspaceFileService changes
- `createWorkspace(name)` — creates a new `.openp41ge-workspace` file in
  `~/.openp41ge/workspaces/` with a UUID id, the given name, version 1, and
  empty repos. No draft concept.
- `listWorkspaces()` — reads all `.openp41ge-workspace` files from the
  directory, returns their parsed `WorkspaceFileData` sorted by name.
- `activateWorkspace(data)` — sets a parsed workspace data as the active one
  (loads its file path).
- Remove `createDraft()`, `ensureDraftExists()`.
- `openDialog()` / `loadPath()` / `save()` / `saveAs()` / `clear()` remain.

### 2. IPC: new dialog handler
- `dialog:listWorkspaces` — reads `~/.openp41ge/workspaces/*.openp41ge-workspace`,
  parses each, returns array of `WorkspaceFileData`.
- Update preload bridge with `dialog.listWorkspaces()`.

### 3. Workspace manager modal — two-view design
- **List view**: shows all workspaces as cards with name + UUID (short). "New
  Workspace" button at top. Clicking a card slides into detail view.
- **Detail view**: individual workspace settings (name, file path, data dir,
  repos) with a back button. Slide-in transition via CSS transform/opacity.
- **Create workspace** inline form in the modal (name input + confirm/cancel).

### 4. Registry bootstrap
- `register-ipc-listeners.step.ts` — replace `ensureDraftExists()` calls with
  `listWorkspaces()` or `createWorkspace()` as appropriate.
- `init-event-controller.step.ts` — remove auto-draft creation logic.

## Files changed

- `packages/openp41ge/electron/ipc-handlers/dialog-handlers.ts` — add
  `listWorkspaces` IPC handler
- `packages/openp41ge/electron/preload.cjs` — add `dialog.listWorkspaces`
- `packages/openp41ge/src/renderer/global.d.ts` — add type
- `packages/openp41ge/src/renderer/services/workspace-file-service.ts` — add
  `listWorkspaces()`, `createWorkspace(name)`, `activateWorkspace(data)`;
  remove `createDraft()`, `ensureDraftExists()`
- `packages/openp41ge/src/renderer/apps/system-tabs/workspace-manager-system-tab.ts`
  — rewrite with list/detail views and slide transition
- `packages/openp41ge/src/renderer/bootstrap/steps/register-ipc-listeners.step.ts`
  — replace `ensureDraftExists()` with `createWorkspace()`
- `packages/openp41ge/src/renderer/bootstrap/steps/init-event-controller.step.ts`
  — remove auto-draft

## Testing strategy
- Unit test new WorkspaceFileService methods
- Update existing tests that reference `createDraft()` / `ensureDraftExists()`

## Completion criteria
- [ ] `listWorkspaces()` IPC handler works
- [ ] `createWorkspace(name)` creates file at `~/.openp41ge/workspaces/<uuid>.openp41ge-workspace`
- [ ] Workspace modal shows list of all workspaces
- [ ] Clicking a workspace slides to detail view with back button
- [ ] "New Workspace" opens create form
- [ ] No more `ensureDraftExists()` calls
- [ ] Build and tests pass
