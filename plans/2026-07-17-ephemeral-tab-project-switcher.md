2026-07-17

# Ephemeral Tab for Project Switcher — ✅ DONE

## Goal

Replace the full-screen modal project picker (`openp41ge-project-picker`) with an **ephemeral tab** that opens in the current active cell (or creates a new cell if none exist). The tab auto-closes when defocused.

## Changes Made

### 1. ✅ `isEphemeral` Tab Property Added

**File**: `packages/openp41ge/src/layout/types.ts`
- Added `isEphemeral: z.boolean().default(false)` to `TabSchema`
- Added `isEphemeral: boolean = false` parameter to `createTab()`

### 2. ✅ Operations Updated for `isEphemeral`

**File**: `packages/openp41ge/src/layout/tab-operations.ts`
- `addColumnTabAt()` now accepts `isEphemeral: boolean = false` parameter and passes it to `createTab()`

**File**: `packages/openp41ge/src/layout/cell-operations.ts`  
- `openTabInCell()` now accepts `isEphemeral: boolean = false` parameter and passes it to `createTab()`

### 3. ✅ Serialization Strips Ephemeral Tabs

**File**: `packages/openp41ge/src/layout/serialization.ts`
- `stripPreviewTabs()` now also strips ephemeral tabs (`isEphemeral: true`) before serialization

### 4. ✅ Project Picker App Type Created

**Files** (new):
- `packages/openp41ge/src/renderer/apps/project-picker/index.ts` — App type registration (`id: "project-picker"`)
- `packages/openp41ge/src/renderer/apps/project-picker/project-picker-controller.ts` — Controller that renders `<openp41ge-project-picker>` in inline mode inside a tab

**File**: `packages/openp41ge/src/renderer/bootstrap/steps/register-app-types.step.ts`
- Registered the new `projectPickerAppRegistration`

### 5. ✅ Project Picker Component Supports Inline Mode

**File**: `packages/openp41ge/src/renderer/components/openp41ge-project-picker.ts`
- Added `@property({ type: Boolean, reflect: true }) inline: boolean = false`
- CSS: `:host(:not([inline]))` uses `position: fixed; inset: 0; z-index: 10000;` (modal)
- CSS: `:host([inline])` uses `width: 100%; height: 100%; overflow: hidden;` (tab fill)
- Keyboard manager `pushModal()` / `popModal()` skipped when `inline=true`

### 6. ✅ Project Switch Service Opens Ephemeral Tab

**File**: `packages/openp41ge/src/renderer/services/project-switch-service.ts`
- `showProjectPicker()` now dispatches `addColumnTabAt` with `isEphemeral=true` instead of creating a modal
- Prevents duplicate inline pickers (checks DOM for existing `openp41ge-project-picker[inline]`)
- Opens in last focused column (via `Openp41geTabsEventHandler.getLastFocusedCol()`)

### 7. ✅ Ephemeral Tab Dismissal on Defocus

**File**: `packages/openp41ge/src/renderer/services/openp41ge-tabs-event-handler.ts`
- `grid-activate` handler calls `_closeEphemeralTab(winId, tabId)` before activating (closes any ephemeral tab in the window except the one being activated)
- `grid-focus-col` handler calls `_closeEphemeralTab(winId, undefined, col)` (closes ephemeral tab only if it's in a different column)
- `_closeEphemeralTab()` scans workspace tabs for `isEphemeral: true` and dispatches `removeTabFromCell`

### 8. ✅ Visual Distinction for Ephemeral Tabs

**File**: `packages/openp41ge-uikit/src/components/tabs/tab-bar.ts`
- Ephemeral tabs render with:
  - Italic font style
  - Dashed amber (golden) bottom border when active: `border-bottom: 2px dashed rgb(229,192,123)`
  - Amber-tinted active background: `background: rgba(229,192,123, 0.12)`
  - No close button
- Tab data types updated to include `ephemeral?: boolean`

**File**: `packages/openp41ge-uikit/src/components/tabs/tab-grid.ts`
- Tab data interface updated to include `ephemeral?: boolean`

**File**: `packages/openp41ge/src/renderer/components/openp41ge-windowview.ts`
- Passes `isEphemeral` from workspace tab data to `<tab-grid>` via `tabData[].ephemeral`

## Files Changed Summary

| File | Change |
|------|--------|
| `packages/openp41ge/src/layout/types.ts` | Added `isEphemeral` to Tab schema and createTab() |
| `packages/openp41ge/src/layout/tab-operations.ts` | `addColumnTabAt()` accepts `isEphemeral` |
| `packages/openp41ge/src/layout/cell-operations.ts` | `openTabInCell()` accepts `isEphemeral` |
| `packages/openp41ge/src/layout/serialization.ts` | `stripPreviewTabs()` strips ephemeral tabs too |
| `packages/openp41ge/src/renderer/apps/project-picker/index.ts` | **New** — app type registration |
| `packages/openp41ge/src/renderer/apps/project-picker/project-picker-controller.ts` | **New** — tab controller |
| `packages/openp41ge/src/renderer/bootstrap/steps/register-app-types.step.ts` | Register project-picker app type |
| `packages/openp41ge/src/renderer/components/openp41ge-project-picker.ts` | Added inline mode support |
| `packages/openp41ge/src/renderer/services/project-switch-service.ts` | Open ephemeral tab instead of modal |
| `packages/openp41ge/src/renderer/services/openp41ge-tabs-event-handler.ts` | Ephemeral tab dismissal on grid-activate/focus-col |
| `packages/openp41ge/src/renderer/components/openp41ge-windowview.ts` | Pass isEphemeral to tab data |
| `packages/openp41ge-uikit/src/components/tabs/tab-grid.ts` | Handle ephemeral in tab data type |
| `packages/openp41ge-uikit/src/components/tabs/tab-bar.ts` | Ephemeral visual styling |

## Testing Results

- **75 layout operations tests** — all pass
- **All pre-existing test failures** are unrelated (import resolution for `openp41ge-tabs`, `openp41ge-file-editor`)
- **No new test failures** introduced

## Key Decisions

1. **Ephemeral tabs are stripped from persistence** alongside preview tabs in `stripPreviewTabs()` → they never survive app restarts
2. **Inline picker** reuses the same `<openp41ge-project-picker>` component but with `inline=true` to fill the tab container instead of covering the whole window
3. **Startup flow** (`CheckProjectStep`) still uses the modal picker — this only triggers when no project exists at all, which is a blocking state
4. **Event-driven dismissal** handles both `grid-activate` (clicking another tab) and `grid-focus-col` (clicking in another column's content area)
