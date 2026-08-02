2026-08-01

# Bottom pane grid layout for system tabs

## Goal
Replace the single-content-area bottom pane with a column-based grid layout
where system tabs can be arranged across multiple columns (like the main editor
grid). Each column renders its active tab's content side by side.

## Rationale
System tabs (workspace settings, file editor, git log, etc.) currently live in
a single-content-area bottom pane — only one tab's content is visible at a
time. A grid layout with columns lets the user see multiple system tabs
simultaneously, matching the UX of the main editor grid.

## Approach

### Data model
The bottom pane grid reuses the same `Grid` structure from the layout types:
`rows: 1`, `cols: n`, `placements: [{ tabIds, position }]`. The grid state
lives on a new `BottomPaneGrid` field in the `Window` type.

### What changes

1. **`Window` type** (`types.ts`) — add `bottomPaneGrid: Grid` alongside the
   existing `grid` field. Initial state: 1 column, placements empty.

2. **Bottom pane component** (`openp41ge-bottom-pane.ts`) — render the grid
   layout instead of a single content area. Use the existing `grid-cell` /
   `tab-bar` pattern from the main grid for each column. Active tabs from
   different columns show their content in parallel columns.

3. **Tab bar** — each column gets its own tab bar row showing the tabs in that
   column. The global tab bar at the top stays (showing all tabs) but each
   column's content area gets a secondary tab bar.

4. **Drag & drop** — tabs can be dragged between columns (within the bottom
   pane grid) using the same drag source/drop target pattern as the main grid.

5. **Operations** — add `resizeBottomPaneGrid`, `moveTabInBottomPaneGrid`,
   `addColumnToBottomPane`, `removeColumnFromBottomPane` to `operations.ts`.

6. **Editor system tab handlers** — update to dispatch the new operations
   instead of just activating a single tab.

### Out of scope (for now)
- Cross-pane drag (dragging tabs between main grid and bottom pane grid)
- Resize handles between bottom pane columns
- Persisting bottom pane grid state to workspace files

## Files Changed

- `packages/openp41ge/src/layout/types.ts` — add `bottomPaneGrid` to `Window`
- `packages/openp41ge/src/layout/operations.ts` — re-export new grid ops
- `packages/openp41ge/src/layout/bottom-pane-operations.ts` (new) — grid ops
- `packages/openp41ge/src/renderer/components/openp41ge-bottom-pane.ts` —
  rewrite content area to use grid layout with per-column tab bars
- `packages/openp41ge/test/unit/layout/bottom-pane-operations.test.ts` (new)

## Testing Strategy
- Unit tests for bottom pane grid operations (add/remove/reorder columns,
  move tabs between columns)
- Render tests for the bottom pane component with multiple columns

## UX Considerations
- Column tab bars at the top of each column show that column's tabs
- Clicking a tab in a column tab bar activates it for that column
- The global tab bar at the bottom pane top still shows all system tabs
- Empty columns show nothing until a tab is dropped or assigned

## Open Questions
- Should columns auto-create when dragging a tab to the edge (like main grid)?
- Should the number of columns be limited?
- How does the bottom pane drag bar interact with column resize?

## Completion Criteria
- [ ] Bottom pane renders multiple columns when > 1 col
- [ ] Each column shows its active tab's content
- [ ] Tabs can be moved between columns
- [ ] Columns can be added/removed
- [ ] Tests pass
- [ ] Build passes
