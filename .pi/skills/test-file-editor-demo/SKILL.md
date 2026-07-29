---
name: test-file-editor-demo
description: Skill for interactively testing the `packages/openp41ge-file-editor` demo in the browser. Use this whenever you need to verify editor rendering, syntax highlighting, input handling, undo/redo, or theme switching.
---

# Test File Editor Demo

Skill for interactively testing the `packages/openp41ge-file-editor` demo in the browser. The demo shows two side-by-side editors that can each load different files, accept keyboard input, and be saved independently.

## Prerequisites

- `pnpm install` from the project root succeeds
- TextMate WASM and grammar files are present in `src/tokenization/grammars/`

## Starting the Demo

```bash
cd packages/openp41ge-file-editor
pnpm dev:demo
# → opens http://localhost:7291/demo/ (Vite dev server)
```

Uses Vite dev server with `vite.demo.config.ts` to serve the demo HTML entry point, with HMR and live reload.

## Page Structure (`demo/index.html`)

| Section                                   | What to test                                                                                    |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------- |
| **Header** (top)                          | Page title, keyboard shortcut hints                                                             |
| **Editors grid** (center, fills viewport) | Two `.editor-panel` panels side by side in a CSS grid                                           |
| **Editor toolbar** (per panel)            | File selector dropdown, dirty indicator (`●`), language badge, theme toggle button, save button |
| **Editor container** (per panel)          | `<file-editor>` element filling the available space                                             |
| **Status bar** (footer)                   | Active editor label, focus debug info                                                           |

## Multi-Editor Architecture

The demo uses `data-panel` (toolbar elements) and `data-editor-id` (file-editor elements) attributes to identify the two editor instances. Each has its own:

- File selector (independent dropdown)
- Dirty indicator (yellow dot)
- Language badge
- Model cache (sessionStorage-backed)

Theme toggling is **global** — clicking either editor's toggle switches the theme for both.

## What to Test

### 1. Page Load & Initial State

- [ ] Demo page loads without console errors
- [ ] Two `<file-editor>` elements are visible
- [ ] Editor 1 shows TypeScript sample with syntax coloring ("Typescript" badge)
- [ ] Editor 2 shows CSS sample with syntax coloring ("CSS" badge)
- [ ] Both dirty indicators show "dirty-hidden" (clean state)
- [ ] Status bar shows "Active: Editor 1"

### 2. File Switching (per editor)

- [ ] File switcher dropdown shows sample files per editor
- [ ] Switching a file loads its content and updates the language badge
- [ ] Syntax highlighting updates to match the new file's language
- [ ] Dirty indicator resets when switching files

### 3. Editing & Keyboard Input

- [ ] Click the hidden textarea area (via `.fe-viewport`) — cursor appears
- [ ] Type characters — text appears at cursor position
- [ ] Press Backspace — deletes character to the left
- [ ] Press Delete — deletes character to the right
- [ ] Arrow keys move cursor within text
- [ ] Paste text — pasted content is inserted

### 4. Dirty State & Save

- [ ] Type in editor — dirty indicator (`●`) turns visible (yellow)
- [ ] Click "Save" button — dirty indicator clears
- [ ] Make an edit — dirty indicator reappears
- [ ] Keyboard shortcut Cmd+S / Ctrl+S — triggers save on active editor

### 5. Independent Editor State

- [ ] Edit in Editor 1 — only Editor 1's dirty indicator shows
- [ ] Edit in Editor 2 — both editors can be dirty simultaneously
- [ ] Save Editor 1 — Editor 1's indicator clears, Editor 2's stays dirty
- [ ] Switch focus between editors — status bar updates the active label

### 6. Syntax Highlighting

- [ ] Keywords are coloured (e.g., `function`, `const`, `class`, `import`)
- [ ] Strings are coloured differently from keywords
- [ ] Comments are coloured differently (italic / gray)
- [ ] Numbers are highlighted
- [ ] Switch to TypeScript — type annotations and interfaces highlighted
- [ ] Switch to JSON — keys and values have distinct colours
- [ ] Switch to Markdown — headings, code blocks, lists are highlighted

### 7. Theme Switching (Global)

- [ ] Click theme toggle on either editor — theme switches (dark ↔ light) for BOTH editors
- [ ] All syntax colours update consistently across both editors
- [ ] Toolbar colours, status bar also update
- [ ] Toggle back — restores original theme for both

### 8. Scroll & Viewport

- [ ] Scroll vertically — lines scroll smoothly
- [ ] Resize browser window — editor viewport reflows to fit
- [ ] Resize below 800px — grid switches to single column (responsive)

## Running E2E Tests

```bash
cd packages/openp41ge-file-editor
pnpm test:e2e
```

Starts the Vite dev server automatically (via Playwright `webServer` config on port 7291), runs all E2E tests in headless Chromium, and tears down the server on completion.

### Test Scenarios

| Test                                         | What It Verifies                                                      |
| -------------------------------------------- | --------------------------------------------------------------------- |
| Page loads with two editors                  | Two `<file-editor>` elements, correct headings, toolbars, badges      |
| File switching changes language badge        | Selecting a different file updates the language badge text            |
| Theme toggle is global                       | Clicking either toggle switches/restores light theme for both editors |
| Typing text makes dirty indicator visible    | Keyboard input triggers dirty state                                   |
| Save clears dirty indicator                  | Clicking save button restores clean state                             |
| Focus switches between two editors           | Typing in one editor then the other dirties both independently        |
| Save on one editor does not affect the other | Saving one editor leaves the other's dirty state intact               |
| Backspace deletes text                       | Pressing Backspace after typing doesn't break the editor              |
| Typing in multiple files across editors      | File switching + keyboard input across both editors works             |

## Debugging with Chrome DevTools

```javascript
// Check editor states
const editors = document.querySelectorAll("file-editor");
editors.forEach((e, i) => {
  console.log(`Editor ${i}:`, {
    filePath: e.filePath,
    fileName: e.fileName,
    state: e._state,
    isDirty: e.isDirty,
  });
});

// Focus the hidden textarea for testing
const textarea = document.querySelector("file-editor .fe-hidden-textarea");
if (textarea) textarea.focus();

// Check TextMate tokenization
const registry = editors[0].tokenRegistry;
console.log("Language:", registry?.languageId);

// Check theme
document.body.classList.contains("light-theme"); // true/false

// Trigger save programmatically
editors[0].save();

// Switch file via dropdown
const select = document.querySelector('[data-panel="0"] .file-select');
select.value = "json";
select.dispatchEvent(new Event("change"));
```

## Known Issues & Sensitivities

- **TextMate init delay**: First load takes 1-2s while WASM and grammars initialise. The editor shows a loading state during this period. E2E tests use a generous `waitForTimeout(5000)`.
- **Hidden textarea**: The textarea `.fe-hidden-textarea` has `opacity:0; z-index:-10`. Playwright tests use `page.evaluate()` to focus it, not `locator.focus()`.
- **`data-panel` vs `data-editor-id`**: Toolbar elements use `data-panel`, the `<file-editor>` uses `data-editor-id`. This avoids selector conflicts in `createEditorState()`.
- **IPC mock**: The demo provides `window.openp41ge.file.readRange()` and `writeFile()` backed by sessionStorage. If a future feature calls an unmocked method, it will throw.
- **Grammar resolution**: Grammar `.tmLanguage.json` files are imported as static assets. If a grammar fails to load, that language will have no highlighting.
- **Port conflicts**: If port 7291 is in use, the Playwright `webServer` will fail. Kill existing processes or update the port.
