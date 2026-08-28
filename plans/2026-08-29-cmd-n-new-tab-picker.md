2026-08-29

# Cmd+N: New Tab with Pane-Type Picker

## Goal

Reassign **`Cmd+N`** from "new window" to a lightweight modal that lets the user pick a pane type and create a **new tab containing a pane of that type**. Move "New Window" to **`Cmd+Shift+N`** (currently unbound).

Refreshed for the current (2026-08) architecture — the original 2025-07 plan references the removed project system and the old openp41ge/tab model. Supersedes `plans/2025-07-20-cmd-n-new-tab-picker.md`.

## Rationale / Current State

- **`Cmd+N`** → `cmdNewWindow()` → new Electron window (still bound at `register-shortcuts.step.ts:29`).
- **`Cmd+T`** → unbound; the `openp41ge:new-tab` IPC handler in `window-handlers.ts` is a **no-op** ("will be replaced with something else"). There is no working keyboard path to create a new tab today.
- **`Cmd+Shift+N`** → free (only Meta+Shift+E/G/F/O/+ are bound).
- **`Cmd+P`** pane picker is **orphaned** — `register-shortcuts.step.ts:79` dispatches `openp41ge:show-pane-picker` but no listener exists, and `<openp41ge-pane-picker>` is never instantiated (`isOpenp41gePanePicker` has no consumers). Cmd+P currently does nothing. *(Optional follow-up, see Scope.)*
- Current tab model: `Window` → `grid` → `placements[]` (cells) → each cell holds `tabIds[]`. A tab is `createTab(id, appType, title, config)`; panes are grid app types from `APP_TYPES` (`src/renderer/app-types.ts`): terminal, file-explorer, markdown, table, video (file-viewer excluded).
- Creating a tab with a pane: `addColumnTab(ws, windowId, appType, title)` (new column + tab) or `openTabInCell(ws, windowId, appType, title, …)` (tab in an existing/new cell). Both live in layout ops and are dispatched stringly through `window.openp41ge.workspace.dispatch()`.

## Approach

1. **Shortcut remap** (`src/renderer/bootstrap/steps/register-shortcuts.step.ts`)
   - `Cmd+N` handler → open the new-tab picker overlay (instead of `cmdNewWindow()`).
   - Register `Cmd+Shift+N` (`modifiers: 12`) → `cmdNewWindow()` (New Window relocated).

2. **Picker component** (`src/renderer/components/openp41ge-new-tab-picker.ts`, new; Lit, light DOM like other overlays)
   - Lists grid pane types from `APP_TYPES.filter(t => t.id !== "file-viewer")` — filtered by typing, arrow keys + Enter to select, Escape closes, backdrop click closes, File Explorer listed first (file-pane most common).
   - Exposes `.open()` / dispatches/receives a custom event (following `openp41ge-confirm-modal`/`openp41ge-pane-picker` patterns) so it can be opened programmatically.
   - State lives in a module singleton so the picker survives any HMR/re-mount churn (mirroring `workspacesOverlayService` pattern).

3. **Create the tab** on selection (in the shortcut handler or via the overlay's controller)
   - `winId = window.openp41ge.workspace.getWindowId()`
   - Dispatch the new-tab op: `dispatch("addColumnTab", winId, appType, label)` (creates a new column + tab with one pane of the chosen type). This is the conservative, currently-working equivalent of the old "new openp41ge/tab with a pane".
   - Close the picker.

4. **Files changed**
   - `src/renderer/bootstrap/steps/register-shortcuts.step.ts` — remap Cmd+N, add Cmd+Shift+N.
   - `src/renderer/components/openp41ge-new-tab-picker.ts` — new component (or extend existing pane picker if reuse proves cleaner).
   - `src/renderer/app.ts` — import/register the component.
   - Optionally `src/renderer/components/openp41ge-pane-picker.ts` — only if we fix Cmd+P (see Scope).

## Testing Strategy

- Unit test the picker's selection→dispatch mapping (pure): given a chosen `AppTypeInfo`, the emitted dispatch args are `("addColumnTab", winId, appType, label)`.
- Integration/unit: verify `addColumnTab` produces a window whose newest placement contains a tab of the chosen `appType` (layout op already covered in `tab-operations` tests — assert the mapping, not the op internals).
- Manual (debug skill): Cmd+N opens picker; Escape/backdrop closes with no state change; select Terminal → new column+tab with a terminal pane; Cmd+Shift+N still opens a new window; no console errors (error overlay cleared).

## UX Considerations

- **Focus**: picker input autofocuses on open (matches `openp41ge-pane-picker`); Enter selects, Escape cancels, backdrop click closes. After selection, focus returns to the app (new tab takes focus naturally).
- **Keyboard**: no conflicts — Cmd+N / Cmd+Shift+N currently free or relocatable.
- **Visual**: reuse the pane-picker's backdrop/panel styling + theme CSS vars (`--bg-primary`, `--border-color`, `--accent`, `--text-secondary`), `ITEM_HEIGHT` from `openp41ge-constants`.
- **Empty state**: if no grid pane types are registered, show "No pane types" and never create an empty tab.
- **Error state**: if dispatch fails or window context is missing, close picker silently (no empty tab).

## Open Questions

1. **New-tab semantics** (default in Approach): `addColumnTab` = new column + single tab of the chosen type. Alternative readings: (a) open a new tab in the *focused* cell (replace active tab), (b) restore the old empty-grid Cmd+T. Default (a-new-column) is the closest working equivalent of "new tab with a pane". *Confirm before implementing.*

## Scope

- **In**: Cmd+N → picker → new column+tab with chosen pane; Cmd+Shift+N → new window.
- **Out (pending user call)**: reviving the orphaned `Cmd+P` pane picker — separate bug; flagging because it exists and is dead, but this plan doesn't touch it unless requested.

## Completion Criteria

- [ ] Cmd+N opens the new-tab picker (no new window).
- [ ] Cmd+Shift+N opens a new window.
- [ ] Picker lists grid pane types (File Explorer first), filters, Enter/Escape/backdrop behave, no empty tab on cancel.
- [ ] Selecting a type creates a new column+tab whose tab has that `appType`.
- [ ] `nx run-many -t typecheck`, `nx lint` clean; `nx run openp41ge:test` passes; runtime-verified in dev (debug skill), no console errors.
