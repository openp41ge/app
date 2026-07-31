2026-07-14

# Move DevTools and Reload Buttons from Bottom Bar to Menu Bar

## Goal

Remove the "Toggle DevTools" and "Reset app state" (reload) buttons from the bottom bar and add them as a "Dev" submenu in the native macOS menu bar, scoped to dev mode only.

## Rationale

The bottom bar area is intended for per-pane utility info (position, mode, size, formatter). Dev-mode-only controls (reload, devtools) clutter this space. The native menu bar is the idiomatic macOS location for these tools, matching conventions in VS Code, Chrome DevTools, and other Electron apps.

## Approach

### 1. Remove dev buttons from bottom bar (`openp41ge-windowview.ts`)

Delete the entire `window.openp41ge.isDev()` conditional block in the bottom bar template that renders the DevTools wrench button and the Reset refresh button. The bottom bar's flex spacer remains; the `openp41ge-bottom-button` imports are still needed by other potential consumers.

### 2. Add "Dev" menu to the native application menu (`openp41ge-application.ts`)

In `_setupMenu()`, add a "Dev" submenu item to the template array when not in production (`!app.isPackaged`), containing:

- **Reload** — sends the existing `workspace:reset` IPC message to the focused window, triggering the same behaviour as the old bottom-bar button
- **Devtools** — calls `BrowserWindow.getFocusedWindow()?.webContents.openDevTools({ mode: "detach" })`, opening DevTools for the focused window (as requested)

Both menu items use `click` handlers that target the focused window, matching the existing pattern used by "New Window", "Open Project...", "Zoom In", etc.

## Files Changed

- `packages/openp41ge/src/renderer/components/openp41ge-windowview.ts` — Remove the dev-only buttons section from the bottom bar template
- `packages/openp41ge/electron/openp41ge-application.ts` — Add `Dev` submenu with `Reload` and `Devtools` items, gated on `!app.isPackaged`

## Testing Strategy

- Manual: Launch in dev mode (`nx dev`), verify Dev menu appears with "Reload" and "Devtools" items
- Manual: Click "Devtools" — DevTools should open for the focused window
- Manual: Click "Reload" — workspace state should reset (same as old button)
- Manual: Launch in production mode (build + run), verify Dev menu is absent

## UX Considerations

- Menu items use existing IPC patterns — no new IPC channels needed
- Dev menu is hidden entirely in production builds (consistent with `window.openp41ge.isDev()` gating)
- "Reload" uses the existing `workspace:reset` flow which was designed for fast test reset but works as a general "reset app state" command
- "Devtools" uses the existing `window:open-dev-tools` IPC handler which already targets the focused window

## Completion Criteria

- [x] Bottom bar no longer shows DevTools or Reset buttons
- [x] Dev menu appears in macOS menu bar when app is in dev mode
- [x] "Devtools" menu item opens DevTools for the focused window
- [x] "Reload" menu item reloads the focused window's web contents
- [x] Dev menu is absent in production builds (`app.isPackaged`)
