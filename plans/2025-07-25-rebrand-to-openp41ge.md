2025-07-25

# Rebrand: Rename "slate" to "openp41ge"

## Goal

Replace all references to the name "slate" with "openp41ge" across the entire monorepo — including directory names, npm package names, Nx project names, HTML titles, window titles, IPC channel names, preload bridge object names, CSS custom element names, class names, TypeScript type names, import paths, path aliases, source comments, environment variable names, config file references, and documentation.

## Rationale

The project is being rebranded from "slate" to "openp41ge". All user-facing and developer-facing naming must be updated to reflect the new brand.

## Approach

The rename is broken into **7 logical layers**, each handled independently to minimise risk. Each layer is a separate pass, committed after verification.

### Layer 1 — Directory & File Renames

Rename all `packages/` directories containing "slate" to their "openp41ge" equivalents, plus rename any files whose names contain "slate".

| Current path                               | New path                                       |
| ------------------------------------------ | ---------------------------------------------- |
| `packages/slate/`                          | `packages/openp41ge/`                          |
| `packages/slate-file-editor/`              | `packages/openp41ge-file-editor/`              |
| `packages/slate-file-editor-demo/`         | `packages/openp41ge-file-editor-demo/`         |
| `packages/slate-git-repository/`           | `packages/openp41ge-git-repository/`           |
| `packages/slate-git-repository-demo/`      | `packages/openp41ge-git-repository-demo/`      |
| `packages/slate-terminal/`                 | `packages/openp41ge-terminal/`                 |
| `packages/slate-terminal-demo/`            | `packages/openp41ge-terminal-demo/`            |
| `packages/slate-agent-chat/`               | `packages/openp41ge-agent-chat/`               |
| `packages/slate-agent-chat-demo/`          | `packages/openp41ge-agent-chat-demo/`          |
| `packages/slate-logger/`                   | `packages/openp41ge-logger/`                   |
| `packages/slate-logger-demo/`              | `packages/openp41ge-logger-demo/`              |
| `packages/slate-syntax-highlighting/`      | `packages/openp41ge-syntax-highlighting/`      |
| `packages/slate-syntax-highlighting-demo/` | `packages/openp41ge-syntax-highlighting-demo/` |
| `packages/slate-tabs/`                     | `packages/openp41ge-tabs/`                     |
| `packages/slate-tabs-demo/`                | `packages/openp41ge-tabs-demo/`                |
| `packages/slate-themes/`                   | `packages/openp41ge-themes/`                   |
| `packages/slate-themes-demo/`              | `packages/openp41ge-themes-demo/`              |

Also rename files within packages whose names contain "slate", e.g.:

- `packages/slate/src/renderer/components/slate-*.ts` → `openp41ge-*.ts`
- `packages/slate/src/renderer/slate-tabs-adapter.ts` → `openp41ge-tabs-adapter.ts`
- `packages/slate/src/renderer/services/slate-tabs-event-handler.ts` → `openp41ge-tabs-event-handler.ts`

**Important**: Perform renames with `git mv` so git tracks history. Do NOT use plain `mv`.

### Layer 2 — Package Metadata (package.json files)

Update in every `packages/*/package.json`:

- `name` field (e.g. `"slate"` → `"openp41ge"`, `"slate-file-editor"` → `"openp41ge-file-editor"`)
- `dependencies`/`devDependencies` workspace references to other slate packages (e.g. `"slate-file-editor": "workspace:*"` → `"openp41ge-file-editor": "workspace:*"`)

### Layer 3 — Nx Project Configuration

Update in every `packages/*/project.json`:

- `name` field (e.g. `"slate"` → `"openp41ge"`, `"slate-terminal"` → `"openp41ge-terminal"`)

Update `root project.json`:

- `name` field (e.g. `"slate-monorepo"` → `"openp41ge-monorepo"`)
- Any command references that contain "slate"

Update `nx.json`:

- Any target references containing "slate"

### Layer 4 — Root & Ancillary Config Files

Update `knip.json`:

- All `"packages/slate*"` path references inside `workspaces`
- All `"src/renderer/components/slate-*"` path references
- All `"packages/slate-*/**"` references

Update `vitest.config.ts`:

- All `./packages/slate*` path references
- All `@slate*` alias entries

Update `eslint.config.js`:

- Any file path references containing "slate"

Update `.gitignore`:

- Any path references containing "slate"

Update `package.json`:

- `name` field
- Any scripts referencing "slate"

### Layer 5 — Source Code Changes (Core Platform — `packages/openp41ge/`)

#### 5a. Electron Main Process (`electron/`)

**Files**: `electron/main.ts`, `electron/preload.cjs`, `electron/window-manager.ts`, `electron/lifecycle-manager.ts`, `electron/ipc-handlers/*.ts`, `electron/slate-application.ts`

Changes:

- `contextBridge.exposeInMainWorld("slate", ...)` → `"openp41ge"`
- All IPC channel names: `"slate:init"` → `"openp41ge:init"`, `"slate:get-state"` → `"openp41ge:get-state"`, `"slate:dispatch"` → `"openp41ge:dispatch"`, `"slate:state-update"` → `"openp41ge:state-update"`, `"slate:create-window"` → `"openp41ge:create-window"`, `"slate:new-window"` → `"openp41ge:new-window"`, `"slate:new-tab"` → `"openp41ge:new-tab"`, `"slate:close-tab"` → `"openp41ge:close-tab"`, `"slate:add-column"` → `"openp41ge:add-column"`, `"slate:confirm-remove-tab"` → `"openp41ge:confirm-remove-tab"`, `"slate:show-confirm"` → `"openp41ge:show-confirm"`, `"slate:confirm-response"` → `"openp41ge:confirm-response"`, `"slate:drag-start"` → `"openp41ge:drag-start"`, `"slate:drag-move"` → `"openp41ge:drag-move"`, `"slate:drag-end"` → `"openp41ge:drag-end"`, `"slate:drag-check"` → `"openp41ge:drag-check"`, `"slate:drag-ghost-show"` → `"openp41ge:drag-ghost-show"`, `"slate:drag-ghost-hide"` → `"openp41ge:drag-ghost-hide"`, `"slate:drag-ghost"` → `"openp41ge:drag-ghost"`, `"slate:error"` → `"openp41ge:error"`
- `SLATE_E2E_TEST` → `OPENP41GE_E2E_TEST`
- `SLATE_DEVTOOLS` → `OPENP41GE_DEVTOOLS` (in `package.json` scripts and shell scripts)
- `SlateApplication` class → `Openp41geApplication`
- `createSlateWindow()` → `createOpenp41geWindow()`
- Window title: `"Slate"` → `"Openp41ge"`
- Dialog title/message: `"Quit Slate?"` → `"Quit Openp41ge?"`

#### 5b. Renderer Type Declarations (`src/renderer/global.d.ts`)

- Interface `Window.slate` → `Window.openp41ge`
- `__slateProjectName` → `__openp41geProjectName`
- `__slateReady` → `__openp41geReady`
- Comments mentioning "slate" → "openp41ge"

#### 5c. Renderer Components (`src/renderer/components/`)

- All custom element names: `"slate-*"` → `"openp41ge-*"` (22 elements)
- Class name changes: `SlateContextMenu` → `Openp41geContextMenu`, `SlateCellTabbar` → `Openp41geCellTabbar`, etc.
- File names: `slate-*.ts` → `openp41ge-*.ts`
- CSS class names containing "slate" → "openp41ge"

#### 5d. Renderer Services & Adapters (`src/renderer/services/`, `src/renderer/`)

- `slate-tabs-adapter.ts` → `openp41ge-tabs-adapter.ts`
- `slate-tabs-event-handler.ts` → `openp41ge-tabs-event-handler.ts`
- `SlateTabsEventHandler` class → `Openp41geTabsEventHandler`

#### 5e. Bootstrap Pipeline (`src/renderer/bootstrap/`)

- All `window.slate.*` references → `window.openp41ge.*`
- All comment references

#### 5f. Other Renderer Files

- `src/renderer/drag-overlay.ts`: `window.slate.drag.*` → `window.openp41ge.drag.*`
- `src/renderer/app.ts`: imports of `"slate-*"` → `"openp41ge-*"`, `"slate-logger"` → `"openp41ge-logger"`
- `src/renderer/index.html`: `<title>Slate</title>` → `<title>Openp41ge</title>`

#### 5g. Vite Config

- `packages/openp41ge/vite.config.ts`: All `"slate-*"` source aliases → `"openp41ge-*"`

### Layer 6 — Source Code Changes (Library Packages)

#### 6a. `openp41ge-terminal/` (formerly `slate-terminal/`)

- Internal `@slate-terminal/` import path aliases → `@openp41ge-terminal/`
- The `slate-terminal` custom element registration → `openp41ge-terminal`
- Any class names containing "SlateTerminal" → "Openp41geTerminal"

#### 6b. `openp41ge-file-editor/` (formerly `slate-file-editor/`)

- Internal `@slate-file-editor/` import path aliases → `@openp41ge-file-editor/`

#### 6c. `openp41ge-themes/` (formerly `slate-themes/`)

- Theme IDs: `"slate-dark"` → `"openp41ge-dark"`, `"slate-light"` → `"openp41ge-light"`
- Theme labels: `"Slate Dark"` → `"Openp41ge Dark"`, `"Slate Light"` → `"Openp41ge Light"`
- Source comments

#### 6d. Other Library Packages

- `openp41ge-logger/`: import references to slate in source comments
- `openp41ge-tabs/`: any references to "slate" in source or tests
- `openp41ge-git-repository/`: any references
- `openp41ge-agent-chat/`: any references

#### 6e. Per-package vitest configs

- Update `@slate-*` aliases to `@openp41ge-*`

### Layer 7 — Tests

Update test files to reflect all renamed identifiers:

- `packages/openp41ge/test/`: All `@slate/` → `@openp41ge/` imports, all `window.slate` → `window.openp41ge`, all class name references (`SlateCellTabbar` → `Openp41geCellTabbar`, `SlateTabsEventHandler` → `Openp41geTabsEventHandler`)
- `packages/openp41ge-file-editor/test/`: All `@slate-file-editor/` → `@openp41ge-file-editor/` imports
- `packages/openp41ge-terminal/test/`: All `@slate-terminal/` → `@openp41ge-terminal/` imports
- `packages/openp41ge-themes/test/`: All `@slate-file-editor/` → `@openp41ge-file-editor/` imports
- Contract test pact files referencing "Slate" content
- `packages/slate/test/unit/setup.ts`: any "slate" references

### Layer 8 — Documentation & Misc

- `AGENTS.md`: All "slate" references → "openp41ge"
- `.pi/skills/*/SKILL.md`: All "slate" references → "openp41ge"
- Comments in source files (non-functional changes, can be done opportunistically)
- The `pi.json` file (no direct slate references found, but verify)

## Automated Rename Strategy

Because this is a project-wide rename of ~60+ file system paths, ~17 `package.json` files, ~17 `project.json` files, ~10 config files, and hundreds of source code references, we should use a **systematic script-based approach** for each layer:

1. Use `git mv` for directory and file renames (preserves history)
2. Use `sed` or a Node.js transformation script for bulk in-file replacements where safe
3. Use the `nx` build and test commands to verify correctness after each layer

## Risk Areas

| Risk                                 | Mitigation                                                                                                             |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| Missed IPC channel strings           | Search for all `"slate:` patterns in `electron/` and `preload.cjs` — these are string constants, not catchable by TS   |
| Broken `pnpm-workspace.yaml` glob    | After renaming dirs, ensure `packages: ["packages/*"]` still matches (it will — `*` matches all subdirs)               |
| Broken Nx caching                    | Run `nx reset` after all renames to clear cached artifacts                                                             |
| Broken import resolution             | After vitest config alias updates, run `nx typecheck` to catch unresolved imports                                      |
| Missed `window.slate.*` in renderer  | Search for all `window.slate` patterns — TS won't catch because it's a type assertion on `Window`                      |
| Custom element registration mismatch | Each `customElements.define("slate-*", ...)` must map to updated HTML usage in templates                               |
| Pact test references                 | The contract tests include sample text `"# Slate\n"` — these are test fixture values that may or may not need updating |
| `knip.json` entry/reference paths    | Manually update all package paths and entry patterns                                                                   |
| `pnpm-lock.yaml`                     | Regenerate with `pnpm install` after all package.json changes                                                          |
| Build scripts referencing "slate"    | Check `packages/openp41ge/scripts/*` for any string references                                                         |

## Testing Strategy

1. **After Layers 1-4** (dir renames + config): Run `pnpm install` to regenerate lockfile, then `nx typecheck` to catch import resolution failures
2. **After Layer 5a** (Electron main): The renderer depends on correct preload bridge; focus on getting the `window.openp41ge` shape right
3. **After Layer 5b** (global.d.ts): Update `Window.openp41ge` interface, then `nx typecheck`
4. **After Layer 5c-e** (renderer components + bootstrap): `nx typecheck` will catch most issues
5. **After Layer 6** (library packages): `nx typecheck` across all packages
6. **After Layer 7** (tests): `nx test` to run all vitest unit tests
7. **Layer 8** (docs): Manual review

**Final verification**:

- `nx quality` (typecheck + lint + knip)
- `nx test` (all vitest unit tests)
- `nx build` (all packages build)
- Manual `nx dev` smoke test (Electron app starts and renders)

## Files Changed (Summary)

### Directories (17 renames)

- `packages/slate/` → `packages/openp41ge/`
- `packages/slate-*/` → `packages/openp41ge-*/` (16 more)

### Root Config Files

- `package.json`
- `nx.json`
- `project.json`
- `knip.json`
- `vitest.config.ts`
- `eslint.config.js`
- `.gitignore`

### Package Config Files

- `packages/*/package.json` (17 files)
- `packages/*/project.json` (17 files)
- `packages/*/vite.config.*` (multiple)
- `packages/*/vitest.config.*` (multiple)
- `packages/*/tsconfig*.json` (if any paths reference slate)

### Source Files (hundreds)

- `packages/openp41ge/electron/**/*.{ts,cjs}`
- `packages/openp41ge/src/**/*.ts`
- `packages/openp41ge/src/renderer/index.html`
- `packages/openp41ge-*/src/**/*.ts`
- `packages/openp41ge-*/test/**/*.ts`

### Documentation & Meta

- `AGENTS.md`
- `.pi/skills/*/SKILL.md`
- `plans/*.md` (references to "slate" in existing plans — may leave as-is since they're historical)

## Completion Criteria

- [ ] All 17 package directories renamed with `git mv`
- [ ] All file names containing "slate" renamed
- [ ] All `package.json` name/dependency fields updated
- [ ] All `project.json` name fields updated
- [ ] `knip.json`, `vitest.config.ts`, `eslint.config.js`, `.gitignore`, `package.json`, `nx.json` updated
- [ ] All IPC channel names updated in `electron/` and `preload.cjs`
- [ ] `window.slate.*` → `window.openp41ge.*` in `global.d.ts` and all renderer files
- [ ] All custom element names updated (`slate-*` → `openp41ge-*`)
- [ ] All component class names updated
- [ ] All `@slate-*` / `@slate/*` import aliases updated
- [ ] All test imports updated
- [ ] Theme IDs/labels updated
- [ ] Window title, dialog text updated
- [ ] `pnpm install` succeeds without warnings
- [ ] `nx quality` passes
- [ ] `nx test` passes
- [ ] `nx build` passes
- [ ] `nx dev` smoke test passes (Electron app opens)
