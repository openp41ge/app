2026-07-29

# Workspaces: full overlay (two‑pane) replacing the inline modal

## Goal

Replace the current inline workspaces surfaces — the title‑bar dropdown and the
centered service modal — with a single **full overlay** that covers only the tab +
sidebar area (between the window title bar and the bottom bar). The overlay has its
own top bar (search, “New workspace”, close) and a two‑pane layout: a **left menu**
listing workspaces and a **right pane** showing the detail/create form. Clicking a
left item selects it and populates the right pane — no slide‑in views.

## Rationale

The current UX is two disconnected shapes: a small dropdown from the title‑bar
pill (workspace‑search) and a centered modal from the File menu. Both render the
same `WorkspaceManagerModal`, which picks between a list view and a detail view via
slide transitions. The user wants one consistent, full‑canvas surface: the pill
becomes a plain button (workspace name, no search affordance), and the workspaces
surface is a two‑pane overlay triggered from it (and from the File menu).

## Approach

### 1. New overlay host (`<openp41ge-workspaces-overlay>`)

- Mounted INSIDE `<openp41ge-windowview>`’s `.openp41ge-main-area` (the region that
  already holds the sidebars + grid) as an absolutely‑positioned child
  (`position:absolute; inset:0; z-index:...`). This guarantees it covers exactly
  the tabs + sidebar space and never the window title bar or the bottom bar.
- Owns a `WorkspacesOverlayService`-style open/close (mirrors `serviceModalService`):
  `open()/close()/isOpen/subscribe`. Dismiss on Escape and on backdrop click.
- Renders the existing `WorkspaceManagerModal` controller via `controller.render()`
  (same pattern the service modal uses today).

### 2. Rework `WorkspaceManagerModal` render into the two‑pane overlay

- **Overlay top bar** (inside the overlay, below the window title bar): search input
  (filters the left list), a “+ New workspace” button, and a close (✕). Action
  buttons that lived in the old bottom bars move here (create/save/delete are shown
  contextually inside the panes; the top bar keeps the global search + new + close).
- **Left pane**: the workspace list (current `_filteredWorkspaces`), always visible,
  live‑filtered by the search box, with the selected workspace highlighted. Clicking
  an item selects it → right pane shows its detail.
- **Right pane**: detail form when a workspace is selected; create form when
  “New workspace” is pressed; empty state otherwise. Selecting a left item updates
  the right pane in place (no slide transition).
- Remove the `.wm-view.list/.detail` slide classes and the `_view = "list"|"detail"`
  switching; replace with a persistent split + selected/creating state. Keep all
  existing behaviour (activate, create, delete, save, verify/sync, reorder, repo
  add/remove, worktree add/remove) unchanged.

### 3. Title‑bar pill becomes a plain button (`<openp41ge-workspace-search>` rewrite)

- Remove the magnifier (search) icon, the embedded search input, the dropdown, and
  the manager instance from the pill. Remove `_showSearch` usage for it.
- Keep a button that shows the current workspace name as text (still subscribes to
  `workspace-file-changed`). Click → `workspacesOverlayService.open()`.
- The search capability moves into the overlay’s top bar (always shown there).

### 4. Remove the workspaces path from the service modal

- `register-ipc-listeners.step.ts`: `onNewWorkspace` → open the overlay with the
  create form active; `onOpenWorkspace` → run the existing open‑dialog flow then
  open the overlay. No more `serviceModalService.openModal("workspace-manager")`.
- `openp41ge-service-modal` remains for **Settings** only. The `workspace-manager`
  app‑type registration can stay (harmless) or be removed; overlay instantiates the
  controller directly.

## Files Changed

- `packages/openp41ge/src/renderer/components/openp41ge-workspaces-overlay.ts` (new)
  — overlay chrome: absolute cover of the main area, top bar chrome if desired, open/
  close service wiring, mounts the manager controller.
- `packages/openp41ge/src/renderer/components/openp41ge-windowview.ts` — mount
  `<openp41ge-workspaces-overlay>` inside `.openp41ge-main-area`.
- `packages/openp41ge/src/renderer/apps/system-tabs/workspace-manager-system-tab.ts`
  — two‑pane + top‑bar render rework; remove slide views; search + new ws in top bar;
  selection drives the right pane.
- `packages/openp41ge/src/renderer/components/openp41ge-workspace-search.ts`
  — rewrite pill to a plain workspace‑name button that opens the overlay.
- `packages/openp41ge/src/renderer/components/openp41ge-titlebar.ts` — adjust pill
  markup/comment (no dropdown anchor needed).
- `packages/openp41ge/src/renderer/bootstrap/steps/register-ipc-listeners.step.ts`
  — route File → overlay, drop service‑modal for workspaces.

## Testing Strategy

- Typecheck (platform package) + `nx run openp41ge:test`; existing suite has no
  workspace‑manager tests, so no test edits expected (verify with a grep).
- Manual/DevTools (dev app): pill shows name only and opens overlay on click; overlay
  covers tabs+sidebars but not title/bottom bars; search filters left list live;
  clicking a left item fills the right pane without motion; New/Create/Save/Delete/
  Activate all work from the new layout; Escape/backdrop close; File→New opens overlay
  with create form; Settings modal still works.

## UX Considerations

- Overlay top bar replaces the old bottom bars (search, New, close top; contextual
  save/delete inside the panes) per user request.
- No slide animations; selection is a left↔right activation.
- Escape/backdrop dismiss (consistent with the previous modal). Focus starts in the
  overlay search input on open (consistent with previous dropdown auto-focus).
- Reuse existing CSS variables and the current card/field styles for visual
  consistency.

## Open Questions

- Placement of detail actions (Save/Delete): I plan to keep them in the right pane
  (per-workspace), with search + New + close in the top bar. Confirm if Delete/Save
  should instead live in the top bar.

## Completion Criteria

- [x] Overlay opens from the title-bar workspace pill (button, name only) and covers only the tab/sidebar area.
- [x] File → New/Open Workspace open the same overlay (no workspaces service modal).
- [x] Two panes: left list + right detail/create; click left → right updates, no slide.
- [x] Overlay top bar has search + New workspace + close.
- [x] All existing workspace actions still work and type check.

## Verified (2026-07-29, dev app via Chrome DevTools)

- Pill shows only the workspace name (no search icon), click toggles the overlay.
- Overlay rect = exact main area (y 35→836; titlebar/bottom bar not covered).
- Two-pane layout: left 260px list (cards with selected highlight), right detail/create/empty.
- Top bar: bordered search (live-filters left list), “New workspace”, ✕.
- Create flow (type name → Create workspace → appears in list), Delete flow (confirm modal → removed) both verified end-to-end (throwaway ws cleaned up).
- Escape / ✕ / pill all close; pill reopens in list mode; Search filters.
- `serviceModalService.openModal("settings")` untouched (Settings still via Cmd+, IPC).
- Typecheck 35 pre-existing errors (unchanged, none in edited files); ESLint clean; `nx run openp41ge:test` pass; `nx run openp41ge:build` pass; knip adds no new issues. (`format:check` pre-existing failures at HEAD — not made worse.)
