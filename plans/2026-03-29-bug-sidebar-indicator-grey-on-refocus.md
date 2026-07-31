2026-03-29

# Bug: Sidebar Tab Indicator Stays Grey After Window Refocus

## Symptoms

1. Right sidebar has focus (Explorer tab is blue).
2. User defocuses the window (clicks another app). Tab turns grey.
3. User clicks back on the right sidebar area to refocus. Tab stays grey — does NOT turn blue.
4. Spiralling: Meta+Shift+P keyboard shortcut phantom-fires from stuck modifier keys, opening a Projects tab on the left sidebar and stealing focus.

## Current Behaviour

### Grey indicator on refocus

The root cause is in `openp41ge-sidebar.ts`. When the window refocuses:

1. `_onWindowFocus` sets `_windowFocused = true` directly (no `_notifyAll()` — intentionally skipped to avoid stale focus restoration).
2. User clicks on the right sidebar → `_onDocumentMouseDown` calls `_setFocusedSide(right)`.
3. `_setFocusedSide` checks `if (_focusedSide === side) return;` — `_focusedSide` is STILL `"right"` (never cleared on blur), so it returns early.
4. **No re-render happens.** The Lit template still renders with `_windowFocused=false` (grey) because no update was scheduled.

### Phantom Meta+Shift+P after Alt+Tab/Cmd+Tab refocus

1. User switches windows via Alt+Tab or Cmd+Tab. The modifier key (Meta) remains in "pressed" state in the keyboard event system.
2. Window refocuses → `_onWindowFocus` sets `suppressUntil = Date.now() + 500` on `KeyboardManager`.
3. Phantom keydown events fire for Meta, Shift, p — from the stuck modifier state, NOT from actual key presses.
4. These fire **after** the 500ms suppression window expires (log shows `diff=-314`, i.e., 314ms past expiry).
5. `handleKeyDown` dispatches `openSystemTab("projects")`, opening a Projects tab on left sidebar.
6. Projects tab's `updated()` calls `_setFocusedSide(left)`, stealing focus from the right sidebar.

## Expected Behaviour

1. Clicking on the right sidebar after window refocus should immediately turn the tab indicator blue.
2. No keyboard shortcut should phantom-fire from stuck modifier keys after Alt+Tab/Cmd+Tab.

## Environment

- Electron desktop app (openp41ge)
- macOS (Alt+Tab or Cmd+Tab window switching)
- Dark theme

## Related Files

| File | Relevance |
|------|-----------|
| `packages/openp41ge/src/renderer/components/openp41ge-sidebar.ts` | Focus tracking, `_setFocusedSide`, `_onWindowFocus`, indicator rendering |
| `packages/openp41ge/src/renderer/services/keyboard-manager.ts` | `suppressUntil` guard, `handleKeyDown` |
| `packages/openp41ge/src/renderer/bootstrap/steps/register-shortcuts.step.ts` | Shortcut handler that dispatches `openSystemTab` |
| `packages/openp41ge/src/renderer/services/command-bus.ts` | Dispatch logging |

## Root Cause Summary

Two independent bugs:

1. **`_setFocusedSide` returns early** when `_focusedSide` hasn't changed, skipping the re-render needed to reflect `_windowFocused=true`.
2. **`suppressUntil` expires too fast** — the phantom keyboard events fire 300-1000ms after refocus, well past the 500ms guard window. A longer or dynamic suppression is needed, OR the keyboard manager should clear modifier state on mousedown.

## Attempted Fixes

1. **`suppressUntil` in `KeyboardManager`**: Added `suppressUntil` field and guard in `handleKeyDown`. Set to `Date.now() + 500` on window focus. Does NOT work because phantom events fire after the 500ms window expires.

2. **`_windowJustFocused` guard in sidebar**: Static flag set on window focus, cleared on first mousedown. Skips close-unpinned-tab logic during refocus mousedown. Does NOT address the indicator rendering issue.

3. **Removed `_setWindowFocused(true)` call in `_onWindowFocus`**: To prevent stale focus restoration. This FIXED the stale focus but CREATED the grey-indicator bug.

4. **`_setFocusedSide` always calls `_notifyAll()`**: Removed the early return for side-unchanged case. This is the correct fix for bug #1 but hasn't been tested by the user yet.

## To Reproduce

1. Open the app. Right sidebar shows Explorer tab (blue).
2. Cmd+Tab to another app. Tab turns grey.
3. Cmd+Tab back. Click on the right sidebar content area.
4. Tab stays grey.

## Workaround

None.

## Priority

High — breaks core sidebar UX.
