2025-07-20

# Cmd+N: New Tab with Pane Type Picker

## Goal

Change `Cmd+N` from creating a new window to showing a modal that lets the user select which pane type to open in a new tab. The file editor should be the first option.

## Current Behavior

- **`Cmd+N`** → `cmdNewWindow()` → `ipcRenderer.send("openp41ge:new-window")` → creates an entirely new Electron window with a new openp41ge
- **`Cmd+T`** → `cmdNewTab()` → `ipcRenderer.send("openp41ge:new-tab")` → calls `handleNewTab()` which applies `createOpenp41geOp` (creates an empty openp41ge/tab with no panes)
- **`Cmd+P`** → Shows the `<openp41ge-pane-picker>` modal (searchable list of app types + recent files)

`Cmd+T` currently creates an empty tab (no panes inside), which is confusing because the user then has to use `Cmd+P` to add a pane. `Cmd+N` opens a whole new window, which is also not what the user typically wants.

## Desired Behavior

1. **`Cmd+N`**: Opens a modal — a simplified version of the pane picker — showing available pane types
2. User selects a pane type (e.g., "File Editor", "Terminal", "Git Repository", "AI Chat")
3. A new tab is created with a pane of the selected type
4. The file editor appears as the first option (most commonly used)

## Reassigning Shortcuts

| Shortcut      | Current    | New                                     |
| ------------- | ---------- | --------------------------------------- |
| `Cmd+N`       | New Window | New Tab with Pane Picker                |
| `Cmd+T`       | New Tab    | (unassigned or keep as "new empty tab") |
| `Cmd+Shift+N` | (nothing)  | New Window (relocated)                  |

## Implementation

### Part 1: New Tab Pane Picker Component

Create a new lightweight modal `<openp41ge-new-tab-picker>` (or reuse/extend the existing `<openp41ge-pane-picker>`) that:

- Shows a vertical list of pane types (filterable by typing)
- Each item has an icon + label
- File Editor is the first item (pre-selected)
- Arrow keys navigate, Enter selects
- Escape closes without action

**Pane types to show** (all registered app types except `file-viewer` is renamed to "File Editor" with a better label):

| Type ID          | Label          | Icon |
| ---------------- | -------------- | ---- |
| `file-editor`    | File Editor    | 📝   |
| `terminal`       | Terminal       | 💻   |
| `git-repository` | Git Repository | ⎇    |
| `agent-chat`     | AI Chat        | 🤖   |

### Part 2: Wire the Selection

When the user selects a pane type:

1. Call `cmdNewTab()` (sends `openp41ge:new-tab`) to create the new openp41ge/tab
2. Wait for the tab to exist in workspace state
3. Dispatch `actionOpenFile` (for file-editor) or `addColumnTab` (for other app types) to create the pane in the new tab's first cell

### Part 3: Re-register Shortcut

In `packages/openp41ge/src/renderer/app.ts`:

- **`Cmd+N`**: Change handler to show the new tab picker modal (instead of `cmdNewWindow()`)
- **`Cmd+Shift+N`**: Register new shortcut for `cmdNewWindow()` (or use `Cmd+Alt+N`)

### Part 4: Update Preload (if needed)

The preload bridge in `packages/openp41ge/electron/preload.cjs` may need:

- A new `cmdNewTabWithType(typeId)` method that combines tab creation + pane creation into one IPC call
- Or keep the existing two-step approach (cmdNewTab → addColumnTab)

### Part 5: Update IPC Handler (optional)

If going with a combined approach, add a new IPC handler `openp41ge:new-tab-with-type` that:

1. Creates the new openp41ge/tab
2. Immediately adds a pane of the selected type to the first cell
3. Broadcasts the state update

This avoids a race condition where the tab is created but the pane isn't added yet.

## Files to Modify

| File                                                                  | Changes                                                                        |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `packages/openp41ge/src/renderer/app.ts`                              | Change `Cmd+N` handler to show picker modal. Add `Cmd+Shift+N` for new window. |
| `packages/openp41ge/src/renderer/app.ts`                              | Add `showNewTabPicker()` function                                              |
| `packages/openp41ge/src/renderer/components/openp41ge-pane-picker.ts` | Create `openp41ge-new-tab-picker` component (or add mode to existing picker)   |
| `packages/openp41ge/electron/preload.cjs`                             | Optionally add `cmdNewTabWithType(typeId)`                                     |
| `packages/openp41ge/electron/ipc-handlers/window-handlers.ts`         | Optionally add `openp41ge:new-tab-with-type` IPC handler                       |

## New Files

| File                                                                     | Purpose                                              |
| ------------------------------------------------------------------------ | ---------------------------------------------------- |
| `packages/openp41ge/src/renderer/components/openp41ge-new-tab-picker.ts` | Lightweight modal for selecting pane type on new tab |

## Modal Design

```
┌─────────────────────────────────────┐
│ New Tab                             │
│                                     │
│ ┌─────────────────────────────────┐ │
│ │ 📝 File Editor                 │ │ ← pre-selected, first option
│ ├─────────────────────────────────┤ │
│ │ 💻 Terminal                    │ │
│ ├─────────────────────────────────┤ │
│ │ ⎇ Git Repository               │ │
│ ├─────────────────────────────────┤ │
│ │ 🤖 AI Chat                     │ │
│ └─────────────────────────────────┘ │
│                                     │
│ ↑↓ navigate  ⏎ select  ⎋ close     │
└─────────────────────────────────────┘
```

The modal is simpler than the current pane picker — no file search, no side-by-side layout. Just a clean list of pane types. This keeps the UX focused: "what kind of pane do you want in your new tab?"

## Edge Cases

- **No window context**: If no window exists (shouldn't happen), the picker does nothing
- **Cmd+N while picker is open**: Ignore (don't stack modals)
- **Tab already exists from a previous Cmd+T**: Close the empty tab first, then create with the selected pane type
- **User presses Escape**: Closes the picker, no action taken
- **Window loses focus while picker is open**: Picker auto-closes on blur

## Future Considerations

- Add recently opened files to the picker as quick-select options (like the current pane picker does)
- Remember the last selected pane type and pre-select it next time
- Keyboard shortcut to directly open a file editor new tab (e.g., `Cmd+Alt+N` or `Cmd+Shift+N` for file editor specifically)
