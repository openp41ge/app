2025-07-20

# Terminal Quality-of-Life Features

## Goal

Add thoughtful quality-of-life features to the terminal beyond the basic shell + exit banner +
theme integration covered in the main integration plan. These are features that make the
terminal pleasant day-to-day without adding bloat.

## Candidate Features

### 1. Search within terminal buffer

- Add `@xterm/addon-search` to `<openp41ge-terminal>`
- Ctrl+F shows a compact search bar at the bottom with an input field
- Find next / previous buttons, highlight matches, match count indicator
- Escape to dismiss the search bar
- On open, auto-populate with the current selection (if any)
- VS Code terminal and iTerm2 both have this — it is the single most-requested
  terminal QOL feature

### 2. Shell title as tab label

- The `onTitleChange` event already fires from xterm.js (escape sequence
  `OSC 0 ; title BEL`)
- When the shell updates its title (e.g., `zsh` shows current directory, `vim` shows
  the file being edited), propagate it as the pane header label
- The `<openp41ge-terminal>` component already dispatches a `terminal-title` CustomEvent
- The `TerminalController` listens for this event and updates the pane header DOM
- Fallback: show "Terminal" if the shell has not set a title

### 3. Right-click paste (macOS) / Middle-click paste

- On macOS: right-click in the terminal area pastes clipboard contents
  (common expectation — iTerm2, Terminal.app all do this)
- Overrides the native context menu for the terminal area only; the context menu
  is still accessible via the pane header or keyboard
- Alternative fallback: right-click shows a minimal "Paste" context menu item
  with a single action
- Only paste when the terminal has focus and is not in alt-buffer mode
  (vim/less — pasting in insert mode is fine but should not paste over
  a full-screen TUI)

### 4. URL detection and click

- xterm.js has a `registerLinkProvider` API — use it
- Detect `https://`, `http://`, `file://` URLs in terminal output
- Ctrl+Click (or Cmd+Click) opens the URL in the default browser via
  `window.openp41ge.workspace.dispatch` or `shell.openExternal` through IPC
- Optionally: detect file paths (`/path/to/file:line:col`) and dispatch an
  `actionOpenFile` command to open them in the file editor

### 5. Configurable font and scrollback via Openp41ge settings

- Add settings to Openp41ge config (`packages/openp41ge/src/main/services/config-service.ts`):
  - `terminal.fontSize` (default: 14)
  - `terminal.fontFamily` (default: `Menlo, Monaco, "Courier New", monospace`)
  - `terminal.scrollback` (default: 5000)
  - `terminal.cursorBlink` (default: true)
  - `terminal.cursorStyle` (default: `"block"`)
- The `<openp41ge-terminal>` component reads these on mount and listens for config changes
- No separate settings UI needed — config is set programmatically or via a future
  settings panel

### 6. Activity indicator on inactive tabs

- When terminal output arrives and the tab is not the active tab in its column,
  show a subtle indicator on the tab (e.g., a small dot or dimmed badge)
- Prevents the user from missing important output (e.g., a build completing,
  a server crashing, a prompt appearing)
- The indicator clears when the tab becomes active
- This is similar to iTerm2's "badge" feature and VS Code's terminal bell

### Not included (explicitly out of scope)

- Split panes within a terminal (tmux territory)
- Shell integration / command markers (VS Code-style `$` prompt detection)
- Image rendering (Kitty protocol) or Sixel graphics
- Serial terminal / SSH connection manager
- Notifications when a long command finishes (complex — requires shell hook injection)
- True colour support (xterm.js handles this already)

## Files Changed

| File                                                                   | Feature                                                                                          |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `packages/openp41ge-terminal/package.json`                             | Add `@xterm/addon-search` dependency                                                             |
| `packages/openp41ge-terminal/src/ui/openp41ge-terminal.ts`             | Search UI + addon, URL link provider, right-click paste handler, read config for font/scrollback |
| `packages/openp41ge/src/renderer/apps/terminal/terminal-controller.ts` | Wire shell title → pane header label, activity indicator on background output                    |
| `packages/openp41ge/src/main/services/config-service.ts`               | Add `terminal.*` config keys                                                                     |
| `packages/openp41ge-terminal/test/unit/openp41ge-terminal.test.ts`     | Tests for search, paste, URL detection                                                           |
| `test/e2e/openp41ge/terminal.e2e.ts`                                   | E2E tests for QOL features (search, title, paste)                                                |

## Testing Strategy

### Unit tests (Vitest)

- **Search**: open search bar (Ctrl+F), type query, verify matches highlighted in xterm.js,
  dismiss with Escape, verify search bar is hidden
- **URL detection**: write a URL to the terminal buffer, verify `registerLinkProvider`
  was called with the correct URL pattern
- **Right-click paste**: simulate `contextmenu` event on the terminal area, verify
  clipboard contents are written to the shell connector (or paste menu item is dispatched)
- **Font config**: set `terminal.fontSize` via the config service stub, verify xterm.js
  `options.fontSize` updates accordingly

### E2E tests (Playwright)

- **Search**: open terminal, type several lines of distinct output, open search via Ctrl+F,
  type a query, verify the search bar is visible and matches are navigable
- **Shell title**: open a terminal, run `echo -ne "\033]0;hello-world\007"` (OSC 0 escape),
  verify the pane header label updates to "hello-world"
- **Config change**: set `terminal.fontSize` to 20 via config, verify the terminal font
  size changes (via `page.evaluate` on xterm.js options)

## UX Considerations

- **Search bar**: Appears at the bottom of the terminal, not at the top — less visually
  intrusive, closer to where the user's eyes are
- **Title update**: Shell title changes are gradual (not animated). The pane header shows
  the most recently set title. If the shell never sets a title, it shows "Terminal"
- **Right-click paste**: Does not prevent the user from selecting text. Selection is
  preserved; right-click pastes _over_ the selection (standard terminal behaviour)
- **URL click**: Ctrl+Click / Cmd+Click to avoid accidental opens while typing.
  The link is underlined on hover to indicate it is clickable
- **Activity indicator**: Minimal — a small dot in the tab corner. No sound, no flash.
  Clears immediately when the tab receives focus

## Completion Criteria

- [ ] Search: Ctrl+F opens search bar, find next/previous works, Escape dismisses
- [ ] Title: shell OSC 0 title updates the pane header label
- [ ] Paste: right-click in terminal pastes clipboard contents
- [ ] URLs: Ctrl+Click on URL opens in default browser
- [ ] Config: `terminal.fontSize`, `terminal.fontFamily`, `terminal.scrollback`,
      `terminal.cursorBlink`, `terminal.cursorStyle` are read from config and applied
- [ ] Activity indicator: output on inactive tab shows a dot badge, clears on focus
- [ ] All unit tests pass in both `packages/openp41ge-terminal/` and `packages/openp41ge/`
- [ ] E2E tests cover search, title, and config change
- [ ] This plan file is deleted
