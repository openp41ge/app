2025-07-29

# Extract Engine Logic from openp41ge-uikit into Separate Packages

## Goal

Remove all non-UI engine logic from `openp41ge-uikit`, leaving only pure UI components, icons, and theme definitions. The engine modules become standalone packages that uikit (and other consumers) import as dependencies.

## Rationale

The uikit was intended as a reusable component library, but it accumulated large engine modules:

| Module    | Lines | Nature                              |
| --------- | ----- | ----------------------------------- |
| file-editor | ~80 files | Text editor engine (cursor, input, rendering, tokenization, formatters) |
| tabs      | ~15 files | Drag-and-drop orchestrator, ghost system, hit-testing |
| syntax-highlighting | ~20 files | TextMate tokenization with oniguruma WASM |
| git-repository | 2 files | Pure DOM renderer (no web component) |

None of these are "UI kit" — they're domain engines that happen to be consumed by web components. Keeping them in uikit:
- Bloats the uikit bundle for consumers that only want buttons/panels
- Blurs the package boundary
- Makes the uikit `vite.config.ts` complex (multi-entry build)

## Approach

### 1. Extract syntax-highlighting back to its own package

The `openp41ge-syntax-highlighting` package already existed before consolidation. Re-create it from the uikit's `src/syntax-highlighting/` directory.

**Files to move:** `src/syntax-highlighting/` → `packages/openp41ge-syntax-highlighting/src/`

**Update imports:**
- `openp41ge-uikit/src/components/file-editor/` imports from `../../syntax-highlighting/` → `from "openp41ge-syntax-highlighting"`
- `openp41ge-uikit/src/index.ts` re-exports → drop these exports

### 2. Extract tabs engine back to its own package

The original `openp41ge-tabs` package was merged into uikit. Re-extract the non-component logic.

**Components stay in uikit:** `src/components/tabs/` (TabGrid, TabBar, TabView, TabContent)

**Engine goes to new package:** `src/tabs/` except the components sub-directory → `packages/openp41ge-tabs/`
- orchestrator.ts, ghost-manager.ts, ghost-layout.ts, cursor-manager.ts
- targets/, sources/, interfaces/
- boundary.ts, index.ts

**Update imports:**
- `components/tabs/*.ts` imports from `../../tabs/` → `from "openp41ge-tabs"`
- uikit `index.ts` re-exports → drop engine exports, keep component exports

### 3. Extract file-editor engine to its own package

This is the largest extraction (~80 files). The engine logic lives in `src/file-editor/` (excluding the web components in `src/components/file-editor/`).

**Components stay in uikit:** `src/components/file-editor/` (file-editor.ts, bottom-bar, confirm-modal)

**Engine goes to new package:** `packages/openp41ge-file-editor/` or `packages/openp41ge-editor-engine/`
- model/, cursor/, input/, rendering/, view/
- tokenization/, themes/, interfaces/
- controllers/, services/
- events.ts, index.ts

**Update imports:**
- `components/file-editor/file-editor.ts` → `from "openp41ge-editor-engine"`
- uikit `index.ts` → drop file-editor engine exports

### 4. Extract git-repository renderer

A small one. The git-browser-renderer is a pure DOM utility, not a web component.

**Move:** `src/git-repository/` → `packages/openp41ge-git-repository/`

**Update imports in uikit index.ts**

### 5. Clean up uikit

After all extractions:

```
openp41ge-uikit/src/
  components/        ← ALL web components (stay)
  icons/             ← icon registry + material SVGs (stay)
  theme/             ← syntax theme definitions (stay)
  generated/         ← tailwind CSS (stay)
  index.ts           ← only exports UI components
  styles.css         ← tailwind input (stay)
```

## Dependencies

```
openp41ge-uikit
  ├── openp41ge-piece-tree
  ├── openp41ge-syntax-highlighting
  ├── openp41ge-tabs
  ├── openp41ge-editor-engine
  └── openp41ge-git-repository

openp41ge (app)
  ├── openp41ge-uikit
  ├── openp41ge-piece-tree
  ├── openp41ge-syntax-highlighting
  ├── openp41ge-tabs
  ├── openp41ge-editor-engine
  └── openp41ge-git-repository
```

## Files Changed

Each extraction follows the same pattern:
1. Create new package in `packages/openp41ge-{name}/` with `package.json`, `project.json`, `tsconfig.json`, `vite.config.ts`
2. Copy/move source files
3. Update relative imports to package-name imports
4. Add dependency in `openp41ge-uikit/package.json`
5. Add dependency in `openp41ge/package.json`
6. Register in `pnpm-workspace.yaml`
7. Update uikit `index.ts` → drop re-exports of extracted modules
8. Add alias in uikit `vite.config.ts` and storybook `vite.config.ts`

## Testing Strategy

- `nx build` must pass after each extraction (incremental verification)
- `nx test` on affected packages
- Storybook stories must still render (uikit components + demos)
- The app must build and launch (`nx dev`)

## Completion Criteria

- [ ] syntax-highlighting extracted, builds, app imports from new package
- [ ] tabs engine extracted, builds, components import from new package
- [ ] file-editor engine extracted, builds, components import from new package  
- [ ] git-repository extracted, builds
- [ ] uikit `index.ts` exports only UI components/icons/theme
- [ ] Full `nx build` passes
- [ ] `nx dev` launches without errors

## Resolved

1. **Name**: `openp41ge-editor-engine`
2. **Single syntax highlighting**: Only one implementation survives — the file-editor's tokenization (`src/file-editor/tokenization/`). It becomes the new `openp41ge-syntax-highlighting` package, replacing the current uikit `src/syntax-highlighting/` which is deleted. The editor engine imports syntax highlighting as a dependency. This tokenization will also be used by other components (e.g., diff view, search results).
3. **Demos**: Existing demo packages will have their imports updated.

## Updated Extraction Order

1. **syntax-highlighting** — Extract `file-editor/tokenization/` as new `openp41ge-syntax-highlighting`. Delete old `src/syntax-highlighting/`. Update imports in file-editor components.
2. **tabs engine** — Extract `src/tabs/` (except components) as `openp41ge-tabs`.
3. **editor-engine** — Extract `src/file-editor/` (except components, except tokenization which is now in syntax-highlighting) as `openp41ge-editor-engine`.
4. **git-repository** — Extract `src/git-repository/` as `openp41ge-git-repository`.
5. **uikit cleanup** — Remove empty directories, update index.ts exports.
