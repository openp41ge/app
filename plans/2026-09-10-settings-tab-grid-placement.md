2026-09-10

# Settings tab grid placement

## Goal

When the user clicks a sidebar/bottom-bar settings gear (Explorer, Agents,
History, Logs), the settings grid tab should land in a more predictable spot in
the column grid, instead of always going to the last-focused cell.

## Rationale

Today `SettingsOpenHandler` always opens the settings tab in the last-active
cell column (`_getLastActiveCellCol`), regardless of how many tabs/columns are
open. This means clicking a settings gear while working in the right-most column
crams the settings into that same column, and clicking it when there is plenty of
room still reuses the current cell. The requested behaviour makes the placement
depend on the current grid state.

## Approach

Change `SettingsOpenHandler.handleOpenSettings` to resolve the target column via a
new `_resolveTargetCol(windowId)` helper implementing three rules (single-row,
column-based grid — `rows === 1`):

1. **Only 1 tab (occupied column) open in the grid** → open in a **new tab**.
   Return `undefined` so `actionOpenFile` falls through to `addColumnTab`, which
   fills the first empty column or inserts a new column.
2. **There is a next tab** (the next occupied column to the right of the current
   one) → open in that **next tab over** (its column index).
3. **No next tab** (current column is the right-most occupied one) → open in the
   current tab (the current column index).

The "current tab" is the last-focused column
(`Openp41geTabsEventHandler.getLastFocusedCol`), validated against the occupied
columns and falling back to the first occupied column if stale. The open-once
behaviour (activate an existing settings tab for the same appType) is preserved.

Interpretation notes (stated assumption): "tab open in the grid" = occupied grid
column (pane). "next tab over"/"current tab" are column-relative, matching the
single-row, column-based layout.

### Regression found while testing

`actionOpenFile` re-routes `targetCol === undefined` into any existing cell
containing a `file-viewer` tab (so it lands the open in the code editor column).
In the common single-column layout of a file editor + an agent chat, this caused
the settings tab to **stack** into that column instead of opening a fresh grid
tab. Fixed by dispatching `addColumnTab` directly when `_resolveTargetCol` returns
`undefined`, bypassing the file-viewer fallback.

## Files Changed

- `packages/openp41ge/src/renderer/services/settings-open-handler.ts`
  Replace `_getLastActiveCellCol` with `_resolveTargetCol` implementing the three
  placement rules; when it returns `undefined`, dispatch `addColumnTab` directly
  (rather than `actionOpenFile`) so the settings tab always opens a brand-new
  column and is not re-routed into a file-viewer cell.
- `packages/openp41ge/test/integration/settings-open-handler.test.ts`
  Add integration tests covering the three rules plus a regression test for the
  file-viewer single-column case.

## Testing Strategy

Integration tests in `settings-open-handler.test.ts` (wires the real handler +
OperationDispatcher). Verify:
- 1 tab open → settings lands in a different (new) column.
- 1 column holding a file-viewer + chat → settings still lands in a new column.
- 2 tabs, current = left column → settings lands in the right/next column.
- 2 tabs, current = right column → settings lands in the current (right) column.
- Existing tests (pin, separate surfaces, open-once, no appType) still pass.

## UX Considerations

- Open-once semantics preserved: clicking the same gear twice activates the
  existing settings tab instead of duplicating it.
- Settings tabs remain pinned (non-preview), so they stay put in the grid.

## Open Questions

- None for implementation; the only ambiguity (what counts as a "tab") is
  resolved as "occupied column/pane" and recorded above.

## Completion Criteria

- [x] `_resolveTargetCol` implements the three placement rules.
- [x] New integration tests cover all three rules and pass.
- [x] Existing `settings-open-handler` tests still pass.
- [x] `nx run openp41ge:typecheck`, lint, and the openp41ge test suite are green.
