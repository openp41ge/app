2026-08-01

# Plan: Bottom Pane for System Tabs

## Goal

Replace the current editor-area system tabs (which override the grid when open) with a draggable bottom pane that overlays the full viewport width. The bottom bar merges into the pane's tab bar, and the pane can be expanded from collapsed (tab bar only) to full height (just below titlebar).

## Rationale

Current system tabs hide the grid when opened — disruptive to the user's workflow. A bottom pane is a well-known paradigm (VS Code, DevTools) where auxiliary tools live persistently without hiding the user's work. Merging the bottom bar's workspace indicator into the pane's tab bar eliminates redundant UI.

## Approach

### Layout structure

```
┌──────────────────────────────────────────┐
│  Titlebar                                 │
├──────┬───────────────────────┬────────────┤
│ side │      grid             │  side      │
│ bar  │    (underneath)       │  bar       │
│      │                       │            │
│      │                       │            │
├═══════════════════════════════════════════┤  ← drag handle (top of pane)
│  ┌────────── tab bar ──────────────────┐ │
│  │  sys-git │ workspace-manager │ ...  │ │  ← tabs + workspace indicator
│  ├──────────────────────────────────────┤ │
│  │  content area                        │ │
│  │  (position: absolute, overlays       │ │
│  │   everything below titlebar when     │ │
│  │   expanded; hidden when collapsed)   │ │
│  └──────────────────────────────────────┘ │
└──────────────────────────────────────────┘
```

The bottom pane is `position: fixed` at the bottom of the viewport, spanning full width, with `z-index` above the sidebars/grid. The grid continues rendering underneath — no visibility toggling.

### States

| State | Height | Shows |
|---|---|---|
| **Collapsed** | Tab bar only (~30px) | Tab bar with system tabs + workspace indicator |
| **Expanded** | User-set (drag handle) | Tab bar + content area overlaying grid/sidebars |
| **Maximized** | Just below titlebar bottom edge | Tab bar + full-height content area |

### Tab bar contents (always visible)

- System tab buttons (workspace manager, settings, git, explorer, etc.)
- A small collapse/expand icon
- The workspace indicator (folder icon + truncated UUID) as a non-tab element on the right side

### Content area (visible when expanded)

- Renders the active system tab's content
- If no system tabs are open, the pane can only be collapsed (content area hidden)
- Each system tab controller renders into this area

### Drag/resize behaviour

- Drag handle is the top edge of the entire pane (including the tab bar)
- Mousedown on the tab bar (outside tab buttons) starts drag
- Mousemove resizes the pane height
- Mouseup snaps to current height
- Minimum height: just the tab bar (collapsed)
- Maximum height: bottom of titlebar minus 1px
- Height persists per session (in memory, not localStorage)

## Files Changed

### New files
- `packages/openp41ge/src/renderer/components/openp41ge-bottom-pane.ts` — Bottom pane Lit component with:
  - `position: fixed` bottom overlay
  - Drag handle/resize logic
  - Tab bar with system tab buttons
  - Content slot/area for active tab
  - Collapse/expand toggle
  - Workspace indicator in tab bar

### Modified files
- `packages/openp41ge/src/renderer/components/openp41ge-windowview.ts` — Remove:
  - Current `<openp41ge-system-tab-bar>` and system tab content rendering above grid
  - Grid visibility logic based on `editorSystemTabIds`
  - Old bottom bar with workspace indicator
  - Add `<openp41ge-bottom-pane>` as a sibling in the DOM tree
- `packages/openp41ge/src/layout/editor-system-tab-operations.ts` — Simplify or remove (system tabs now live in bottom pane, not grid area)
- `packages/openp41ge/src/layout/types.ts` — Remove `editorSystemTabIds`, `editorSystemActiveTabId` from `Window` type (if no longer needed); keep system tab types for bottom pane usage
- `packages/openp41ge/src/renderer/apps/system-tabs/` — System tab controllers remain, but render into bottom pane content area instead of grid
- `packages/openp41ge/src/renderer/handlers/tabs.handlers.ts` — Update system tab handlers to target bottom pane instead of grid area
- `packages/openp41ge/data/event-routing-graph.json` — Update system tab event routing (remove grid-specific edges, add bottom-pane-specific edges if needed)

### Removed files (if refactoring completely)
- `packages/openp41ge/src/renderer/components/openp41ge-system-tab-bar.ts` — Replaced by tab bar inside bottom pane
- `packages/openp41ge/src/renderer/apps/app-registry.ts` — Editor system tab registry entries may change

## Testing Strategy

- **Manual verification**: collapse/expand/resize pane, verify grid underneath renders correctly, verify system tabs switch, verify workspace indicator appears in tab bar
- **Resize edge cases**: drag to maximum (just below titlebar), drag to minimum (tab bar only), drag mid-way, release at various heights
- **CPU impact**: verify idle CPU stays at 0-2% with pane collapsed and expanded
- **No regression**: opening a system tab should not hide the grid

## UX Considerations

- **Drag handle**: The entire top edge of the tab bar is draggable. Tab buttons themselves are click targets (not drag) — standard behaviour.
- **Collapse/expand**: Clicking the active system tab (when expanded) collapses the pane. Clicking a different system tab when collapsed expands it.
- **Content scrolling**: System tab content scrolls independently within the pane's content area (overflow-y: auto).
- **Workspace indicator**: Sits on the right side of the tab bar. Clicking it opens workspace manager tab (same as current behaviour).
- **Persistence**: Pane height resets to collapsed on app restart (simpler than persisting state).
- **Grid underneath**: The grid keeps rendering — when the pane is collapsed, zero grid content is hidden.

## Open Questions

1. Should the pane slide up with an animation or snap instantly? (Instant is simpler for initial implementation.)
2. Should the pane have its own z-index or use the existing overlay system?
3. Should we keep `editorSystemTabIds` in the workspace state or move it to the pane's local state?
4. What happens when the user drags a file/terminal from the grid into the bottom pane? (Out of scope for now.)
5. Should the pane be per-window or global? (Per-window, same as current grid.)

## Completion Criteria

- [ ] `<openp41ge-bottom-pane>` component renders `position: fixed` at bottom of viewport
- [ ] Tab bar shows system tab buttons + workspace indicator on the right
- [ ] Drag handle on tab bar top edge resizes pane up/down
- [ ] Content area appears when pane is expanded, shows active system tab
- [ ] Old system-tab-replaces-grid logic removed from windowview
- [ ] Old bottom bar removed from windowview
- [ ] Workspace indicator in tab bar opens workspace manager system tab
- [ ] Grid continues rendering underneath pane at all times
- [ ] Collapsed state shows only tab bar (~30px)
- [ ] Maximized state reaches just below titlebar
- [ ] Idle CPU at 0-2% in both collapsed and expanded states
- [ ] System tab switching works within the pane
