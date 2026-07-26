2025-07-25

# Draft Project Autostart

## Goal

Eliminate the mandatory project picker on startup. Instead, the app opens immediately into a "draft" project — a temporary, auto-generated project that works exactly like a normal project. Drafts that are never saved are garbage-collected after 7 days. The user can later "Save As" to convert a draft into a permanent named project, or use "Open Project" to switch to a saved one.

## Rationale

The current flow forces the user to select or create a project before they can see the app. This adds friction for:
- Quick testing and exploration
- First-run experience (no projects exist yet, so the user sees an empty list)
- Demos where you want to show the app's workspace, not a project picker

By auto-creating a draft, the app feels instant and responsive. The project concept remains but becomes opt-in for organisation rather than a gate.

## Approach

### 1. Draft Project Concept

A draft project is a normal `ProjectStore` project with a special naming convention:

```
draft-<uuid>.draft
```

The `.draft` extension marks it as a draft. Drafts live in the same `~/.openp41ge/` directory tree as normal projects. They have the same structure (config.json, repositories/, workspace-state.json), but `config.json` includes `"draft": true` and a `createdAt` timestamp.

**Garbage collection**: On app startup, the main process scans for projects matching the draft pattern and deletes any where `createdAt` is older than 7 days AND there's no record of it being "saved" (i.e., it's still a draft).

### 2. Changes Overview

**Main process (`electron/` and `src/main/services/`):**

- `ProjectStore` — Add methods:
  - `createDraft(): string` — Creates a draft project, returns its name
  - `isDraft(name: string): boolean` — Checks if a project is a draft
  - `saveDraftAs(draftName: string, newName: string): boolean` — Converts a draft to a permanent project (renames directory, updates config)
  - `gcDrafts(maxAgeMs: number): number` — Garbage-collects old drafts, returns count deleted
- `Openp41geApplication._initPaths()` — After parsing CLI args, if no `--project` is provided, auto-create a draft project and set `this.projectName` to it
- `Openp41geApplication.start()` — Add a GC call in the startup sequence (before services init) to clean old drafts

**Renderer (`src/renderer/`):**

- `CheckProjectStep` — If no `--project` arg was provided, the main process already created a draft. This step still runs but now checks `project:current` which returns the draft name. No picker is shown.
- New IPC hander `project:saveDraftAs(draftName, newName)` — bridges to `ProjectStore.saveDraftAs()`
- New IPC handler `project:gcDrafts` — bridges to `ProjectStore.gcDrafts()`

**Preload / global.d.ts:**

- Add `project.saveDraftAs(draftName: string, newName: string): Promise<boolean>`

**UI (components/):**

- The existing `openp41ge-project-picker` is not removed — it's still accessible via a "Open Project..." command for switching projects.
- Add a "Save Project As..." entry in the File menu (or somewhere discoverable) that triggers a dialog to name the draft.
- The titlebar shows the project name (draft or saved), making it clear you're working in a project.

### 3. Detailed Behaviour

**Startup flow (no `--project` arg):**

1. `Openp41geApplication._initPaths()` — No CLI project → call `this.projectStore.createDraft()` → set `this.projectName` to draft name
2. `Openp41geApplication.start()` — Call `this.projectStore.gcDrafts(7 * 24 * 60 * 60 * 1000)` to clean old drafts
3. `_maybeLoadState()` — Draft project exists, so load its workspace state (fresh empty workspace)
4. Renderer bootstrap runs `CheckProjectStep` — `project:current` returns the draft name, no picker shown
5. App opens directly into the empty workspace

**Draft lifecycle:**

| Action | Behaviour |
|--------|-----------|
| App starts | Draft auto-created if no `--project` |
| User opens files, runs terminals, etc. | All state is persisted to the draft project |
| User selects "Save Project As..." | Draft is renamed to the chosen name (directory rename + config update) |
| User selects "Open Project..." | Project picker shown; switching to a saved project leaves draft untouched |
| App starts 8+ days later | Draft is garbage collected on startup |
| User explicitly "Discard Draft" | Draft deleted immediately |

**Garbage collection logic:**

```
for each project in projectStore.list():
  if project name matches /^draft-.*\.draft$/:
    config = projectStore.readConfig(project)
    if config.draft === true and now - config.createdAt > 7 days:
      projectStore.delete(project)
```

**"Save Project As..." UX:**

- Available from File menu or a button in the titlebar/sidebar
- Opens a simple prompt/modal asking for a project name
- Validates the name is not empty and doesn't conflict with an existing project
- Calls `project.saveDraftAs(currentDraftName, newName)`
- On success, the titlebar updates to show the new name

### 4. SOLID Considerations

- **S** — `ProjectStore` gains two new responsibilities (draft creation, GC). Since these are cohesive with project lifecycle management, they belong here. No extraction needed.
- **O** — `ProjectStore.create()` is unchanged. `createDraft()` is a new method that extends behaviour without modifying `create()`. The draft GC is a new public method. No existing code is modified for extension.
- **D** — No new dependencies. The main process already owns `ProjectStore` and injects it into `registerProjectHandlers`. New IPC handlers follow the same injection pattern.

### 5. UX Considerations

- **Focus management**: No new modals on startup → focus goes to the grid/workspace immediately.
- **Titlebar**: Should display the project name (with a "(draft)" suffix for drafts). Users need to know they're in a temporary project.
- **"Save Project As..." dialog**: Follow the existing dialog/confirm-modal patterns (prominent input, Enter to confirm, Escape to cancel).
- **Keyboard shortcut**: Consider `Cmd+Shift+S` for "Save Project As..." — consistent with convention.
- **Error states**: If draft creation fails (disk full, permissions), fall back to the project picker so the user can still use the app.
- **Empty state**: First launch shows empty workspace. No flashing/loading state — same as current behaviour after project selection.

### 6. Files Changed

| File | Change |
|------|--------|
| `packages/openp41ge/src/main/services/project-store.ts` | Add `createDraft()`, `isDraft()`, `saveDraftAs()`, `gcDrafts()` methods |
| `packages/openp41ge/electron/openp41ge-application.ts` | Call `createDraft()` when no `--project` arg; call `gcDrafts()` in startup |
| `packages/openp41ge/electron/ipc-handlers/project-handlers.ts` | Register IPC handler for `project:saveDraftAs` |
| `packages/openp41ge/electron/preload.cjs` | Add `project.saveDraftAs` to contextBridge |
| `packages/openp41ge/src/renderer/global.d.ts` | Add `project.saveDraftAs()` type declaration |
| `packages/openp41ge/src/renderer/bootstrap/steps/check-project.step.ts` | Skip picker when a draft project is already active |
| `packages/openp41ge/src/renderer/components/openp41ge-titlebar.ts` | Show project name (draft or saved) |
| `packages/openp41ge/src/renderer/components/openp41ge-save-draft-dialog.ts` | **NEW** — "Save Project As..." modal |
| `packages/openp41ge/src/renderer/app.ts` | Register new component import, wire "Save Project As..." command |
| `packages/openp41ge/test/unit/services/project-store.test.ts` | **NEW** — unit tests for draft methods |
| `packages/openp41ge/test/e2e/draft-project.test.ts` | **NEW** — E2E test for draft flow |

### 7. Testing Strategy

**Unit tests (`packages/openp41ge/test/unit/services/project-store.test.ts`)**:

| Test | Description |
|------|-------------|
| `createDraft creates a project with draft config` | Verify name pattern, `draft: true`, `createdAt` set |
| `isDraft returns true for draft projects` | Check by name pattern and config |
| `isDraft returns false for normal projects` | Normal project → false |
| `saveDraftAs renames project dir and updates config` | Draft → permanent: dir renamed, config updated, `draft` removed |
| `saveDraftAs fails if newName already exists` | Conflict → returns false |
| `gcDrafts deletes drafts older than maxAge` | Old draft removed |
| `gcDrafts preserves drafts younger than maxAge` | Recent draft kept |
| `gcDrafts preserves normal projects regardless of age` | Normal project never deleted |
| `gcDrafts returns correct deletion count` | 3 old drafts out of 5 total → returns 3 |

**Integration / E2E tests (`packages/openp41ge/test/e2e/draft-project.test.ts`)**:

- App starts without `--project` → opens directly into a draft (no picker shown)
- Titlebar shows the draft name with "(draft)"
- "Save Project As..." → enters name → converts draft → titlebar updates
- Opening saved project → switches properly
- Closing app, reopening → draft still present (within 7 days)
- Titlebar shows saved project name without "(draft)" suffix

### 8. Open Questions

1. **Should drafts appear in the project picker list?** Current `ProjectStore.list()` filters out dot-prefixed dirs. Drafts won't be dot-prefixed but will have `.draft` suffix. We could exclude them from `list()` or show them with a "(draft)" badge. Proposal: exclude from `list()` — drafts are transparent to the user until they "Save As".
2. **Where should the "Save Project As..." action live?** File menu or a button in the titlebar? Proposal: File menu entry, plus a subtle "(draft)" badge in the titlebar that's clickable to save.
3. **What happens to drafts when the user opens a saved project?** The draft stays on disk (for 7-day GC to clean). The user switched to the saved project — draft is orphaned. This feels right but let's confirm.
4. **Should there be an explicit "Discard Draft" action?** Not necessary for MVP — 7-day GC suffices. Could add later if users request it.

### 9. Completion Criteria

- [ ] `ProjectStore` has `createDraft()`, `isDraft()`, `saveDraftAs()`, `gcDrafts()` methods with tests
- [ ] Main process auto-creates draft on startup when no `--project` is provided
- [ ] Main process garbage-collects old drafts on startup
- [ ] `check-project.step.ts` skips project picker when a draft is active
- [ ] `project:saveDraftAs` IPC handler registered and works
- [ ] Preload exposes `project.saveDraftAs()`
- [ ] TypeScript types updated
- [ ] "Save Project As..." dialog component exists and integrates
- [ ] Titlebar shows project name with "(draft)" suffix for drafts
- [ ] All existing tests pass
- [ ] `nx quality` passes
- [ ] `nx build` succeeds
