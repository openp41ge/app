2026-09-06

# Settings → grid tabs (per-feature registry) + sidebar gear + delete the system overlay

## Goal

Move the **Editor** and **Agent** settings out of the system overlay into their own **grid tabs**,
backed by a **per-feature/system settings registry** so each feature/plugin can register its own
settings tab. Make the **gear button** in the new **bottom bar of each sidebar** the **only access
point** to these settings tabs (all settings tabs open in the grid as a tab). Then **delete the
system overlay** (`openp41ge-system-overlay` + `systemOverlayService`) since it no longer has any
content.

## Context / findings from the code

- The overlay is **already effectively dead**: no code calls `systemOverlayService.open()` /
  `.toggle()` (no `.open`/`.toggle` callers, no titlebar button, no shortcut). Only the overlay
  element renders in `openp41ge-windowview.ts:375`, but `isOpen` is always false so it paints nothing.
- It registers only `file-editor-settings` (Editor) and `agent` (Agent). The "workspaces" overlay tab
  was already de-registered.
- `workspace-manager-system-tab.ts` is only reachable through `focusRepoInWorkspaces()` (opens the
  dead "workspaces" overlay tab). `register-ipc-listeners.step.ts:77` calls it when
  `windowType === "window-manager"` for the `openp41ge:focus-workspace-repo` event.
- `EditorSystemTabController` / `EditorSystemTabRegistration` types are consumed by the overlay, the
  dead `openp41ge-bottom-pane.ts` (never rendered/imported), and the empty **editor-system-tab
  registry** in `app-registry.ts` (`registerEditorSystemTabType` has **no call sites**).
- A separate, also-dead **bottom-pane** subsystem exists independently of the overlay:
  `editor-system-tab-operations.ts` + `Window.editorSystemTabIds` / `editorSystemActiveTabId` /
  `bottomPaneGrid` (schema) + `tabs.handlers.ts` `system-tabs/*` handlers. No event-graph edge routes
  to `system-tabs/*`.
- `debug-log-panel.ts` and its test import `systemOverlayService`; deleting the service breaks them.
  `debug-log-panel.ts` also exports `isDebugSeed()` (used by `app.ts:33`) — must be relocated first.

## Approach

### 1. Settings registry — `src/renderer/services/settings-registry.ts` (new)

```ts
export interface SettingsTabRegistration {
  id: string;                         // grid app type id (e.g. "file-editor-settings")
  label: string;                      // gear-menu label + tab title (e.g. "Editor")
  icon?: string;                      // gear glyph (default "⚙")
  description?: string;
  createController: (tabId: string) => TabController;
}
registerSettingsTab(reg)   // also calls registerAppType({ id, label, icon, description, createController })
listSettingsTabs(): SettingsTabRegistration[]
```

- **O (Open/Closed)**: features/plugins add a settings tab via one call; no central switch.
- Settings tabs are **not** added to the static `APP_TYPES` picker (so the gear is the only entry).

### 2. Settings grid controllers — `src/renderer/apps/settings/` (new)

- `file-editor-settings-tab.ts` — `FileEditorSettingsTabController implements TabController`
  (mounts `<openp41ge-file-editor-settings>`; `snapshot()` → `{}`; `restore` no-op).
- `agent-settings-tab.ts` — `AgentSettingsTabController implements TabController`
  (mounts `<openp41ge-agent-settings>`; same lifecycle).
- `index.ts` — exports `fileEditorSettingsTabRegistration` and `agentSettingsTabRegistration`.
- Delete `apps/system-tabs/file-editor-settings-system-tab.ts` and
  `apps/system-tabs/agent-chat-settings-system-tab.ts`.

### 3. Replace overlay registrations — `bootstrap/steps/register-app-types.step.ts`

- Remove both `systemOverlayService.registerTab(...)` calls and the `systemOverlayService` import.
- Add `registerSettingsTab(fileEditorSettingsTabRegistration)` and
  `registerSettingsTab(agentSettingsTabRegistration)`.

### 4. Delete the system overlay

- **Delete** `services/system-overlay-service.ts`, `components/openp41ge-system-overlay.ts`.
- Remove `<openp41ge-system-overlay>` from `openp41ge-windowview.ts` (and the `import "./openp41ge-system-overlay"`).
- **Delete** `EditorSystemTabController` / `EditorSystemTabRegistration` from `controllers/types.ts`.
- **Delete** the editor-system-tab registry in `apps/app-registry.ts`
  (`registerEditorSystemTabType`, `getEditorSystemTabRegistration`,
  `getAllEditorSystemTabRegistrations`, `_editorSystemTabRegistry`).
- **Delete** the dead `components/openp41ge-bottom-pane.ts` (only consumer of the editor-system-tab registry).
- **Delete** `apps/system-tabs/workspace-manager-system-tab.ts` (only live export `focusRepoInWorkspaces`
  opens the dead workspaces overlay tab).

### 5. Fix the IPC listener — `bootstrap/steps/register-ipc-listeners.step.ts`

- Remove the `focusRepoInWorkspaces` import and change the `openp41ge:focus-workspace-repo` handler
  so the `window-manager` case also routes to `windowManager.open()` (same as non-window-manager).
  **Decision 1 — confirmed by user.**

### 6. Sidebar bottom-bar gear (only access point) — `components/openp41ge-sidebar.ts`

- Render a bottom bar after `.sidebar-content` (shrink-0, top border, ~28px) with a **gear** button
  on the right.
- Gear click builds an `openp41ge-contextmenu` from `listSettingsTabs()`; each item dispatches
  `openp41ge:open-settings` with `{ appType: tab.id, title: tab.label }`.
- Both left and right sidebars get the gear (it lives in the shared `openp41ge-sidebar`).

### 7. Open/activate a settings grid tab — `services/settings-open-handler.ts` (new)

- Listen for `openp41ge:open-settings` on `document`; resolve `window.openp41ge.workspace.getWindowId()`.
- Open-once: find an existing grid tab in the window with the same `appType` and `activateTabInCell` it;
  otherwise dispatch `actionOpenFile(winId, appType, title, "", <targetCol>, true, {})`
  (mirrors `LogOpenHandler`). Wire `init(commandBus, workspaceState)` in `StartupContext.wireServices()`
  and register the listener in `bootstrap/steps/register-event-listeners.step.ts`.
  **Decision 3 — confirmed by user: open in the last-active cell** (reuse `LogOpenHandler._getLastActiveCellCol`
  logic).

### 8. Delete `debug-log-panel` (depends on `systemOverlayService`)

- Relocate `isDebugSeed()` to a small utility (e.g. `services/log-debug.ts`), update `app.ts:33`.
- Delete `components/debug-log-panel.ts` and `test/unit/modals/debug-log-panel.test.ts` (this overlaps
  the `2026-09-06-logs-platform-instrumentation-review` plan — the `debug-log-panel` item there is superseded).
  **Decision 4 — confirmed by user.**

### 8b. Delete the dead bottom-pane / editor-system-tab layout subsystem

**Decision 2 — confirmed by user: remove it.**

- Delete `layout/editor-system-tab-operations.ts` and its re-export in `layout/operations.ts`.
- Remove `EditorSystemTabId` brand + `Window.editorSystemTabIds` / `editorSystemActiveTabId` /
  `bottomPaneGrid` from `layout/types.ts`; update `serialization.ts` and any default-window factory.
- Remove the `system-tabs/*` handlers from `renderer/handlers/tabs.handlers.ts`.
- Remove/update any tests referencing the above fields or handlers.

### 9. Log row wrapping fix — `packages/openp41ge-logger/src/openp41ge-log-viewer.ts`

**User-reported bug:** in the grid log tab, each log entry is a flex row (`display: flex`, tags then
`.log-text` with `flex: 1`). When a message wraps, continuation lines align to the **left edge of the
`.log-text` flex item** (indented after the meta tags) instead of the **left edge of the row**.

**Fix (final):** treat each entry as a single flowing text line. `.log-entry` is `display: block`;
the level/time/source segments are `display: inline` with small margins (removed the fixed 44px/70px
columns that created a tabular indent), and the message is `display: inline` + `white-space: pre-wrap`
so it still preserves newlines. Wrapped continuation lines and the `[...]` source segment all start at
the row's left edge — no indentation.

## Files Changed (summary)

**New:** `services/settings-registry.ts`, `apps/settings/file-editor-settings-tab.ts`,
`apps/settings/agent-settings-tab.ts`, `apps/settings/index.ts`, `services/settings-open-handler.ts`,
`services/log-debug.ts` (for `isDebugSeed`).

**Modified (log view):** `openp41ge-logger/src/openp41ge-log-viewer.ts`.

**Modified:** `bootstrap/steps/register-app-types.step.ts`, `bootstrap/steps/register-ipc-listeners.step.ts`,
`bootstrap/steps/register-event-listeners.step.ts`, `bootstrap/startup-context.ts`,
`components/openp41ge-sidebar.ts`, `components/openp41ge-windowview.ts`, `controllers/types.ts`,
`apps/app-registry.ts`, `app.ts` (isDebugSeed import).

**Deleted:** `services/system-overlay-service.ts`, `components/openp41ge-system-overlay.ts`,
`components/openp41ge-bottom-pane.ts`, `components/debug-log-panel.ts` (+ test),
`apps/system-tabs/file-editor-settings-system-tab.ts`, `apps/system-tabs/agent-chat-settings-system-tab.ts`,
`apps/system-tabs/workspace-manager-system-tab.ts`, `layout/editor-system-tab-operations.ts`.

## Testing Strategy

- **Unit**: `settings-registry` (register/list + registers the app type); `FileEditorSettingsTabController`
  and `AgentSettingsTabController` lifecycle (mount renders the settings element, snapshot `{}`).
- **Integration**: `SettingsOpenHandler` — opens via `actionOpenFile`, activates an existing tab (open-once);
  sidebar gear builds the menu from `listSettingsTabs()` and dispatches `openp41ge:open-settings`.
- **Existing**: `file-editor-settings.test.ts` and `app-type-registration.test.ts` remain valid.
  Remove `debug-log-panel.test.ts`.
- **Manual/CDP**: gear in both sidebars opens Editor/Agent as pinned grid tabs; opening twice activates once;
  each settings tab is a separate grid column; overlay no longer renders.

## Decisions (confirmed by user)

1. **Worktree-warning behavior** — window-manager `openp41ge:focus-workspace-repo` routes to
   `windowManager.open()` (same as other windows).
2. **Dead bottom-pane subsystem** — remove `editor-system-tab-operations.ts` + the
   `Window.editorSystemTabIds`/`editorSystemActiveTabId`/`bottomPaneGrid` schema fields +
   `tabs.handlers.ts` `system-tabs/*` handlers (update serialization schema accordingly).
3. **Settings open column** — open in the **last-active cell** (mirrors `LogOpenHandler`).
4. **`debug-log-panel` coupling** — fold its deletion in; relocate `isDebugSeed()`.

## Completion Criteria

- [x] `registerSettingsTab` exists + also registers the grid app type; `listSettingsTabs` returns registrations.
- [x] Sidebar gear (both sides) opens Editor/Agent as pinned grid tabs; gear is the only access point.
- [x] Open-once: re-selecting an already-open settings tab activates it instead of duplicating.
- [x] System overlay (`openp41ge-system-overlay` + `systemOverlayService`), `openp41ge-bottom-pane`,
      workspace-manager system tab, and `debug-log-panel` removed; `isDebugSeed` relocated.
- [x] Log-entry rows wrap with continuation lines starting at the row's left edge (grid log tab).
- [x] `nx run-many -t typecheck`, `nx lint`, `nx run-many -t test`, `nx run openp41ge:build` pass;
      tests added/removed as above. (`nx format:check` flags only pre-existing working-tree
      violations: `pnpm-lock.yaml`, `packages/openp41ge-logger/test/unit/log-streams.test.ts`, and
      the pre-existing deeply-nested template in `openp41ge-sidebar.ts` — all present before this
      change; the committed HEAD version of the sidebar is format-clean.)

## Verification

- **Auto**: `nx run openp41ge:typecheck` ✓, `nx lint` ✓, `nx run openp41ge:test` (1213 tests) ✓,
  `nx run openp41ge-logger:test` (95 tests) ✓, `nx run openp41ge:build` ✓.
- **New tests** (13): `settings-registry`, `settings-tabs` (controllers), `settings-open-handler`,
  and `log-debug` (`isDebugSeed`).
- **Debug toggle re-homed** to the sidebar **Logs panel** (`apps/system-tabs/logs-system-tab.ts`,
  review-plan Option A): a footer "Debug" checkbox calls `setMinLevel(DEBUG)` + `logs.setDebug`,
  so the runtime capture toggle is not lost when `debug-log-panel` is deleted.
- **Sidebar format fix**: extracted the tab `style` ternary into a `tabStyle` const (behavior-preserving)
  so prettier's embedded-HTML formatting stabilizes — the file now passes `format:check`.
- **Log row rendering** reworked per user feedback: fixed-width column slots removed; level/time/source
  now flow inline as styled text, continuation lines start at the left edge (no indent).
- **Log viewer wrap toggle** added to the bottom bar: an icon-only button (the editor-style word-wrap
  icon) sits **right of the level filter**, separated by a vertical `1px` divider (`.sep`). The toggle is
  **off by default**: turning it on adds wrap (`nowrap` class removed → lines reflow inline); turning it
  off re-adds `nowrap` to `.log-list` (horizontal scroll + `white-space: pre`). Tests extended (98 logger
  tests).
- **Not verified visually**: the log-row wrap CSS change, the wrap toggle, and the sidebar gear UI were
  validated via unit/integration tests, not by running the desktop app. A manual/CDP pass is recommended.
