2025-07-20

# Goal

Refactor the openp41ge platform's terminal support to use the `<openp41ge-terminal>` web component from
`packages/openp41ge-terminal/`, switch the main process shell to node-pty for proper PTY semantics,
and wire up terminal colors through the global Openp41ge theme system (CSS custom properties) instead
of built-in per-terminal themes.

# Rationale

The platform currently has two disconnected terminal implementations:

1. **`packages/openp41ge-terminal/`** — A well-tested Lit web component with xterm.js, ShellConnector
   abstraction (IpcShellConnector, NodePtyConnector), exit banner, restart button, and themes.
2. **`packages/openp41ge/src/renderer/apps/terminal/terminal-controller.ts`** — Directly creates xterm.js
   instances, managing all DOM and IPC wiring inline. Does not use the web component.

This duplication means the web component's features (exit banner, restart, shell title tracking)
are unavailable in the platform. At the same time, the main process uses `child_process.spawn()`
which lacks proper PTY semantics (broken resize, no interactive program support).

Furthermore, terminal colors are hardcoded (dark theme only) rather than being driven by the
global Openp41ge theme system. Built-in theme switching on the terminal itself is unnecessary — the
terminal should inherit its colors from whichever Openp41ge theme is active (dark, light, or custom).

# Approach

## 1. TerminalController → Thin Wrapper Around `<openp41ge-terminal>`

The platform's `TerminalController` (`packages/openp41ge/src/renderer/apps/terminal/terminal-controller.ts`)
will be refactored to:

- Create a `<openp41ge-terminal>` element on `mount()`
- Set `pane-id` attribute to the tabId (for IPC routing)
- Set `showHeader` to `false` (the platform's pane-header system provides the tab title bar)
- Set `autoRestart` to `false` (user manually clicks restart via exit banner)
- Append the element to the mount container
- On `unmount()`, remove the element (component handles xterm destruction via disconnectedCallback)
- On `setVisible(true)`, call `element.fit()` and flush any buffered output
- On `setVisible(false)`, the component buffers output internally
- `snapshot()`/`restore()` save/restore the paneId and any terminal options

No more direct xterm.js instantiation, no direct `window.openp41ge.terminal` wiring — the web component
handles all of that via its internal `IpcShellConnector`.

## 2. Main Process: `child_process.spawn()` → `node-pty`

**`packages/openp41ge/src/main/services/terminal-manager.ts`** will be updated to use node-pty
instead of `child_process.spawn()`. The `ITerminalManager` interface gains a `restart(paneId)` method.

node-pty provides:

- Proper PTY allocation (supports interactive programs: vim, htop, less)
- Correct resize via `pty.resize(cols, rows)` instead of `SIGWINCH`
- Proper TERM handling (xterm-256color)
- Better environment passthrough

**New dependency**: `node-pty` added to `packages/openp41ge/package.json`.

**Build integration**: A `postinstall` script in the root `package.json` will run
`npx @electron/rebuild -o node-pty` so the native module is compiled against Electron's
Node.js version after every `pnpm install`.

Add `node-pty` types (shipped with the npm package) — no separate `@types/node-pty` needed.

**TerminalManager changes**:

- Replace `child_process.spawn()` with `nodePty.spawn()` in `spawn()`
- Replace `proc.stdout.on('data', ...)` with `pty.onData()`
- Replace `proc.on('exit', ...)` with `pty.onExit()`
- Replace `proc.kill('SIGWINCH')` in `resize()` with `pty.resize(cols, rows)`
- Add `restart(paneId)` — calls `kill()` then `spawn()` atomically
- Keep all existing listener fan-out patterns unchanged

## 3. IPC: Add `terminal:restart` Channel

A dedicated restart IPC avoids race conditions between the renderer calling `kill()` then `spawn()`.

**`electron/preload.cjs`** — expose `window.openp41ge.terminal.restart(paneId)`:

```js
restart: (paneId) => {
  ipcRenderer.send("terminal:restart", paneId);
},
```

**`electron/ipc-handlers/terminal-handlers.ts`** — handle `terminal:restart`:

```ts
ipcMain.on("terminal:restart", (_event, paneId: string) => {
  terminalManager.restart(paneId);
});
```

**`src/renderer/global.d.ts`** — add `restart` to `WindowOpenp41geTerminal` type.

The `<openp41ge-terminal>` component's `_restartShell()` method (in `packages/openp41ge-terminal/src/ui/openp41ge-terminal.ts`)
already calls `this._connector?.spawn()`. For the `IpcShellConnector`, `spawn()` sends
`terminal:spawn` IPC, which the main process ignores if a process already exists for that paneId.

**Fix**: Update the `IpcShellConnector` to expose a `restart()` method that calls the new
`window.openp41ge.terminal.restart()` IPC. The `_restartShell()` in the component calls
`this._connector.restart()` if available, falling back to `kill()` + `spawn()`.

## 4. Theme: Extend Openp41ge Themes with Terminal ANSI Colors

The Openp41ge theme system (`packages/openp41ge/src/styles/themes.css`) will be extended with
terminal-specific CSS custom properties for the full 16-color ANSI palette.

**Variables to add to dark theme** (`[data-app-theme="dark"], :root`):

```css
/* ── Terminal ANSI colors ── */
--term-bg: #1e1e1e;
--term-fg: #d4d4d4;
--term-cursor: #d4d4d4;
--term-selection: #264f78;

--term-black: #1e1e1e;
--term-red: #f44747;
--term-green: #4ec9b0;
--term-yellow: #dcdcaa;
--term-blue: #569cd6;
--term-magenta: #c586c0;
--term-cyan: #9cdcfe;
--term-white: #d4d4d4;

--term-bright-black: #808080;
--term-bright-red: #f44747;
--term-bright-green: #4ec9b0;
--term-bright-yellow: #dcdcaa;
--term-bright-blue: #569cd6;
--term-bright-magenta: #c586c0;
--term-bright-cyan: #9cdcfe;
--term-bright-white: #ffffff;
```

**Light theme** (`[data-app-theme="light"]`):

```css
--term-bg: #ffffff;
--term-fg: #333333;
--term-cursor: #333333;
--term-selection: #add6ff;

--term-black: #000000;
--term-red: #cd3131;
--term-green: #00bc00;
--term-yellow: #949800;
--term-blue: #0451a5;
--term-magenta: #bc05bc;
--term-cyan: #0598bc;
--term-white: #555555;

--term-bright-black: #666666;
--term-bright-red: #cd3131;
--term-bright-green: #14ce14;
--term-bright-yellow: #b5ba00;
--term-bright-blue: #0451a5;
--term-bright-magenta: #bc05bc;
--term-bright-cyan: #0598bc;
--term-bright-white: #a5a5a5;
```

**`<openp41ge-terminal>` web component** will read these CSS custom properties on mount
and whenever `data-app-theme` changes (via MutationObserver on `document.documentElement`),
mapping them into xterm.js `ITheme`:

```ts
private _applyThemeFromCSS(): void {
  const style = getComputedStyle(document.documentElement);
  this._terminal?.setOption('theme', {
    background: style.getPropertyValue('--term-bg').trim() || '#1e1e1e',
    foreground: style.getPropertyValue('--term-fg').trim() || '#d4d4d4',
    cursor: style.getPropertyValue('--term-cursor').trim() || '#d4d4d4',
    selectionBackground: style.getPropertyValue('--term-selection').trim() || '#264f78',
    black: style.getPropertyValue('--term-black').trim() || '#1e1e1e',
    red: style.getPropertyValue('--term-red').trim() || '#f44747',
    green: style.getPropertyValue('--term-green').trim() || '#4ec9b0',
    yellow: style.getPropertyValue('--term-yellow').trim() || '#dcdcaa',
    blue: style.getPropertyValue('--term-blue').trim() || '#569cd6',
    magenta: style.getPropertyValue('--term-magenta').trim() || '#c586c0',
    cyan: style.getPropertyValue('--term-cyan').trim() || '#9cdcfe',
    white: style.getPropertyValue('--term-white').trim() || '#d4d4d4',
    brightBlack: style.getPropertyValue('--term-bright-black').trim() || '#808080',
    brightRed: style.getPropertyValue('--term-bright-red').trim() || '#f44747',
    brightGreen: style.getPropertyValue('--term-bright-green').trim() || '#4ec9b0',
    brightYellow: style.getPropertyValue('--term-bright-yellow').trim() || '#dcdcaa',
    brightBlue: style.getPropertyValue('--term-bright-blue').trim() || '#569cd6',
    brightMagenta: style.getPropertyValue('--term-bright-magenta').trim() || '#c586c0',
    brightCyan: style.getPropertyValue('--term-bright-cyan').trim() || '#9cdcfe',
    brightWhite: style.getPropertyValue('--term-bright-white').trim() || '#ffffff',
  });
}
```

The `setTheme()` method on the component will be repurposed: if passed a string it's ignored
(no built-in theme switching), if passed a partial `ITheme` it merges as before (for programmatic
override). The CSS-variable-based theme is applied automatically on mount and on theme change.

`packages/openp41ge-terminal/src/themes.ts` is kept as-is for standalone use of the component
outside the openp41ge platform — not used by the platform itself.

## 5. Fix Exit Banner Visibility in `<openp41ge-terminal>`

The current exit banner uses `display: ${this._showExitBanner ? "flex" : "none"}` inline.
This makes it impossible for tests (or the component's own render) to check visibility via
class selectors. Change to use a CSS class:

```ts
return html`<div class="st-exit-banner ${this._showExitBanner ? "visible" : "hidden"}">...</div>`;
```

With styles:

```css
.st-exit-banner.hidden {
  display: none;
}
.st-exit-banner.visible {
  display: flex;
}
```

This also fixes the skipped tests (`it.skip("shows exit banner when shell exits")`, etc.).

# Files Changed

## `packages/openp41ge/`

| File                                                | Change                                                                     |
| --------------------------------------------------- | -------------------------------------------------------------------------- |
| `package.json`                                      | Add `node-pty` dependency                                                  |
| `electron/main.ts`                                  | Import node-pty for rebuild verification, pass to TerminalManager          |
| `electron/preload.cjs`                              | Add `window.openp41ge.terminal.restart(paneId)`                            |
| `electron/ipc-handlers/terminal-handlers.ts`        | Add `terminal:restart` handler calling `terminalManager.restart()`         |
| `src/main/interfaces/terminal-manager.ts`           | Add `restart(paneId: string): void` to `ITerminalManager`                  |
| `src/main/services/terminal-manager.ts`             | Replace `child_process.spawn` with `node-pty`, implement `restart()`       |
| `src/renderer/global.d.ts`                          | Add `restart(paneId: string): void` to `WindowOpenp41geTerminal` interface |
| `src/renderer/apps/terminal/terminal-controller.ts` | Refactor to create `<openp41ge-terminal>` element, delegate lifecycle      |
| `src/styles/themes.css`                             | Add `--term-*` CSS custom properties for both dark and light themes        |

## `packages/openp41ge-terminal/`

| File                                          | Change                                                                                                                                                      |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/ui/openp41ge-terminal.ts`                | Add `_applyThemeFromCSS()`, MutationObserver for theme changes; fix exit banner CSS classes; update restart flow to call `connector.restart()` if available |
| `src/shell/ipc-shell-connector.ts`            | Add `restart()` method calling `window.openp41ge.terminal.restart()`                                                                                        |
| `src/shell/shell-connector.ts`                | Add optional `restart?(): void` to `ShellConnector` interface                                                                                               |
| `test/unit/openp41ge-terminal.test.ts`        | Update theme tests for CSS-variable approach; re-enable skipped exit banner and restart tests                                                               |
| `test/unit/shell/ipc-shell-connector.test.ts` | Add tests for `restart()` method                                                                                                                            |

## Root

| File           | Change                                                        |
| -------------- | ------------------------------------------------------------- |
| `package.json` | Add `postinstall` script: `npx @electron/rebuild -o node-pty` |

# Testing Strategy

## Unit Tests (Vitest) — `packages/openp41ge-terminal/`

- **CSS-variable theme**: Mock `getComputedStyle` on `document.documentElement` to return
  specific `--term-*` values, verify xterm.js `options.theme` is set correctly.
- **Theme change observation**: Mock `MutationObserver`, toggle `data-app-theme`, verify
  theme updates on the terminal.
- **Exit banner CSS classes**: Verify `.visible` / `.hidden` classes are toggled correctly
  on shell exit and restart.
- **Restart flow**: Verify `IpcShellConnector.restart()` calls `window.openp41ge.terminal.restart()`.
  Verify component's `_restartShell()` calls `connector.restart()` when available.

## Unit Tests (Vitest) — `packages/openp41ge/`

- **TerminalManager with node-pty**: Mock node-pty, verify `spawn()`, `resize()`, `kill()`,
  `restart()` call the correct node-pty methods and fire expected events.
- **Thin TerminalController**: Verify it creates a `<openp41ge-terminal>` element, sets attributes,
  and delegates mount/unmount/setVisible.

## E2E Tests (Playwright) — `test/e2e/openp41ge/`

New file: `test/e2e/openp41ge/terminal.e2e.ts`

- **Create terminal tab**: Open pane picker, select Terminal, verify `<openp41ge-terminal>` element
  exists in the DOM.
- **Shell runs**: Type `echo hello` via xterm.js `write()` helper, verify output appears.
  (For E2E, use an injected test shell or verify the process is spawned via IPC.)
- **Tab switch survival**: Open a terminal, switch to another tab, switch back — shell still
  responds to input.
- **Exit and restart**: Kill the shell process via IPC, verify exit banner appears, click
  Restart, verify shell re-spawns.
- **Theme integration**: Switch Openp41ge theme to light, verify terminal colors update
  (check computed style on xterm elements or verify `options.theme` via evaluate).

# UX Considerations

- **No built-in theme switching**: Terminal always uses global Openp41ge theme. The `setTheme()`
  public API is still available for programmatic overrides but not exposed in the UI.
- **Exit banner**: Shows exit code; "Restart" button re-spawns the shell. Matches VS Code
  terminal behaviour.
- **Tab switch**: Shell continues running while tab is hidden. Output is buffered and flushed
  when tab becomes visible again. No flicker or state loss.
- **Close button**: Provided by the platform's pane-header system (the `<openp41ge-terminal>`
  component's header is hidden via `showHeader: false`).
- **Focus**: xterm.js auto-focuses on mount. Clicking the terminal area focuses it.
- **Scrollback**: 5000 lines (default, configurable via `Openp41geTerminalOptions`).

# Completion Criteria

- [ ] `TerminalController` creates a `<openp41ge-terminal>` element and delegates lifecycle
- [ ] `TerminalManager` uses node-pty, all existing tests pass
- [ ] `terminal:restart` IPC channel works end-to-end (preload → handler → restart method)
- [ ] Exit banner appears on shell exit, restart button re-spawns the shell
- [ ] Terminal colors are driven by `--term-*` CSS custom properties
- [ ] Theme changes (dark ↔ light) update terminal colors automatically
- [ ] All existing Vitest tests pass in both `packages/openp41ge/` and `packages/openp41ge-terminal/`
- [ ] E2E tests for terminal cover: creation, shell I/O, tab switch survival, exit/restart, theme
- [ ] Root `postinstall` script rebuilds node-pty for Electron
- [ ] `pnpm build` succeeds in both packages
- [ ] This plan file is deleted

# Open Questions (Resolved)

- **Q1 (node-pty rebuild)**: Handled via `postinstall` script in root `package.json`.
- **Q2 (restart IPC)**: Dedicated `terminal:restart` IPC channel — cleaner, no race conditions.
- **Q3 (ANSI color mapping)**: New `--term-*` CSS custom properties added to both dark and light
  themes, no mapping from existing variables.

# Separate Plan: Quality-of-Life Features

The following features are explicitly **out of scope** for this plan and will be addressed in a
separate plan:

- Search within terminal buffer
- Tab title from shell process title (already partially wired via `onTitleChange`)
- Font size / font family configuration
- Copy-on-select or right-click paste
- Multi-shell session management
- Terminal profile presets
- Shell integration (VS Code-style link detection, command navigation)
- Any other QOL feature suggested by reviewing terminal implementations (iTerm2, Kitty,
  Windows Terminal, VS Code terminal, tmux)

See the separate plan for these.
