2025-07-29

# Rename openp41ge-components → openp41ge-uikit and Merge openp41ge-themes

## Goal

Rename the `openp41ge-components` package to `openp41ge-uikit` and merge the `openp41ge-themes` package into it as a sub-module (`openp41ge-uikit/theme`), creating a single UI toolkit package that owns both reusable Lit components AND syntax theme definitions.

## Rationale

- `openp41ge-components` and `openp41ge-themes` are both leaf packages with no circular dependencies — combining them reduces package count and simplifies versioning.
- "uikit" is a clearer name for a reusable UI component library vs "components" which is too generic.
- The theme definitions are small, pure-data modules (no runtime tokenization) that naturally belong alongside the UI toolkit.
- Reduces the total package count in the monorepo by 2 (the packages themselves), plus their demo packages can be consolidated later.

## Approach

### Phase 1 — Rename openp41ge-components → openp41ge-uikit

1. **Rename the directory**: `packages/openp41ge-components/` → `packages/openp41ge-uikit/`
2. **Update `package.json`**: change `"name"` to `"openp41ge-uikit"`
3. **Update `project.json`**: change `"name"` to `"openp41ge-uikit"`, keep all targets
4. **Update `tsconfig.json`**: no change needed (name is not referenced)
5. **Update `vite.config.ts`**: no change needed (name not referenced)
6. **Update `tailwind.config.cjs`**: no change needed (content paths use relative paths)

### Phase 2 — Merge openp41ge-themes into openp41ge-uikit

1. **Copy theme sources**: move all files from `packages/openp41ge-themes/src/` into `packages/openp41ge-uikit/src/theme/`
   - `types.ts` → `src/theme/types.ts`
   - `dark-plus.ts` → `src/theme/dark-plus.ts`
   - `light-plus.ts` → `src/theme/light-plus.ts`
   - `index.ts` → `src/theme/index.ts` (exports: `SyntaxTheme`, `SyntaxScopeColors`, `BUILTIN_THEMES`, `ALL_THEMES`, `getThemeById`, `generateThemeCSS`, `generateGlobalEditorCSS`, `generateBracketPairCSS`, `darkPlusTheme`, `lightPlusTheme`)
2. **Re-export from `openp41ge-uikit/src/index.ts`**: add `export * from "./theme";` so consumers can `import { darkPlusTheme } from "openp41ge-uikit"`
3. **Also export as sub-path**: add `"./theme": "./src/theme/index.ts"` or `"./theme": "./dist/theme/index.js"` in `package.json` `exports` field so consumers can `import { getThemeById } from "openp41ge-uikit/theme"`
4. **Update vite build**: the theme sources should be included in the same bundle entry or built as a separate entry. Since themes are pure JS (no Lit, no Tailwind), they can simply be re-exported from the main entry point. The vite lib build should include them.

   Actually, to avoid consumers pulling in Lit when they only want themes, I should **keep themes as a separate entry point** in the vite build:

   ```ts
   build: {
     lib: {
       entry: {
         index: "src/index.ts",
         theme: "src/theme/index.ts",
       },
       formats: ["es"],
     },
   }
   ```

   This produces `dist/index.js` (components) and `dist/theme.js` (themes). The `package.json` exports become:

   ```json
   {
     ".": { "import": "./dist/index.js" },
     "./theme": { "import": "./dist/theme.js" },
     "./styles.css": "./dist/styles.css"
   }
   ```

5. **Copy tests**: `packages/openp41ge-themes/test/` → `packages/openp41ge-uikit/src/theme/__tests__/`
6. **Update vitest config**: add theme unit tests to uikit (or keep a vitest config that includes the theme tests)

### Phase 3 — Remove standalone openp41ge-themes package

1. **Delete `packages/openp41ge-themes/`** directory
2. **Delete `packages/openp41ge-themes-demo/`** directory (or update it to import from `openp41ge-uikit/theme`)

   Decision: For now, delete the themes-demo (it's a simple Vite demo app that shows theme colors). The theme visualization can be re-added to the uikit-demo Storybook later. The themes-demo is a development tool, not a shipped product.

   Actually, let me keep themes-demo but update its import. This preserves the ability to visually verify theme data during development without needing Storybook.

3. **Update `pnpm-workspace.yaml`**: no change needed (uses `packages/*` glob)

### Phase 4 — Rename demo packages

1. **Rename `packages/openp41ge-components-demo/` → `packages/openp41ge-uikit-demo/`**
2. **Update `package.json`**: change `"name"` to `"openp41ge-uikit-demo"`, update dependency from `"openp41ge-components"` to `"openp41ge-uikit"`
3. **Update `project.json`**: change `"name"` to `"openp41ge-uikit-demo"`
4. **Update story imports**: all story files import `"openp41ge-components"` → `"openp41ge-uikit"`

### Phase 5 — Update all consumer imports

| File | Current import | New import |
|------|---------------|------------|
| `packages/openp41ge/package.json` | `"openp41ge-components": "workspace:*"` | `"openp41ge-uikit": "workspace:*"` |
| `packages/openp41ge/vite.config.ts` | alias `openp41ge-components` → `../openp41ge-components/src` | alias `openp41ge-uikit` → `../openp41ge-uikit/src` |
| `packages/openp41ge/.../git-sidebar-view.ts` | `from "openp41ge-components"` | `from "openp41ge-uikit"` |
| `packages/openp41ge/.../openp41ge-bottom-button.ts` | `from "openp41ge-components"` | `from "openp41ge-uikit"` |
| `packages/openp41ge-syntax-highlighting/package.json` | `"openp41ge-themes": "workspace:*"` | `"openp41ge-uikit": "workspace:*"` |
| `packages/openp41ge-syntax-highlighting/.../textmate-init.ts` | `from "openp41ge-themes"` | `from "openp41ge-uikit/theme"` |
| `packages/openp41ge-syntax-highlighting-demo/.../demo-app.ts` | `from "openp41ge-themes"` | `from "openp41ge-uikit/theme"` |
| `packages/openp41ge-themes-demo/.../demo-app.ts` | `from "openp41ge-themes/index"` | `from "openp41ge-uikit/theme"` |
| `packages/openp41ge-themes-demo/package.json` | `"openp41ge-themes": "workspace:*"` | `"openp41ge-uikit": "workspace:*"` |

### Phase 6 — Update documentation

1. **Update `AGENTS.md`**: change `openp41ge-components` → `openp41ge-uikit`, remove `openp41ge-themes` from package tree, add note that themes live under `openp41ge-uikit/src/theme/`
2. **Delete/archive old plan**: `plans/2025-07-28-openp41ge-components-package.md` — content is now superseded
3. **Update `plans/2025-07-28-repo-drag-to-grid.md`**: if it references `openp41ge-components`, update it

## Files Changed

### Renamed/moved packages
- `packages/openp41ge-components/` → `packages/openp41ge-uikit/` (directory rename)
- `packages/openp41ge-components-demo/` → `packages/openp41ge-uikit-demo/` (directory rename)

### Deleted
- `packages/openp41ge-themes/` (entire directory — merged into uikit)

### New files
- `packages/openp41ge-uikit/src/theme/` (all files from former openp41ge-themes/src/)

### Updated package.json files
- `packages/openp41ge-uikit/package.json` — rename, add theme entry point in exports
- `packages/openp41ge-uikit-demo/package.json` — rename, update dependency
- `packages/openp41ge/package.json` — update dependency name
- `packages/openp41ge-syntax-highlighting/package.json` — replace `openp41ge-themes` dep with `openp41ge-uikit`
- `packages/openp41ge-themes-demo/package.json` — replace `openp41ge-themes` dep with `openp41ge-uikit`

### Updated project.json files
- `packages/openp41ge-uikit/project.json` — rename
- `packages/openp41ge-uikit-demo/project.json` — rename
- `packages/openp41ge-themes-demo/project.json` — update build commands if needed (still a separate package)

### Updated source files
- `packages/openp41ge/src/renderer/components/sidebar-views/git-sidebar-view.ts` — update import
- `packages/openp41ge/src/renderer/components/openp41ge-bottom-button.ts` — update import
- `packages/openp41ge/src/renderer/services/inject-global-tailwind.ts` — update import (if any)
- `packages/openp41ge/vite.config.ts` — update source alias
- `packages/openp41ge-syntax-highlighting/src/tokenization/textmate-init.ts` — update import
- `packages/openp41ge-syntax-highlighting-demo/src/demo-app.ts` — update import
- `packages/openp41ge-themes-demo/src/demo-app.ts` — update import
- `packages/openp41ge-uikit/src/index.ts` — add `export * from "./theme"` re-export
- `packages/openp41ge-uikit-demo/stories/*.stories.ts` — update imports

### Updated documentation
- `AGENTS.md` — update package tree and descriptions
- `plans/2025-07-28-openp41ge-components-package.md` — delete (superseded)

## Testing Strategy

| What | How |
|------|-----|
| Build works for all packages | `nx build --skip-nx-cache` (progressive — uikit, uikit-demo, downstream consumers) |
| Theme exports work | Import `SyntaxTheme`, `BUILTIN_THEMES`, `getThemeById`, `generateThemeCSS` from `openp41ge-uikit/theme` in a test file |
| Component exports work | Import `RepoRow`, `SideHeader`, `iconRegistry`, `tailwindCSS` from `openp41ge-uikit` in a test file |
| Existing theme tests pass | `vitest run` on the copied theme test files |
| Dev mode works | `nx dev` — Vite HMR should pick up the renamed source alias |
| Storybook works | `nx run openp41ge-uikit-demo:storybook` — stories should render components |

## UX Considerations

No UX changes — this is a pure refactor. All component APIs, class names, and visual output remain identical. Theme data types and CSS generation functions remain unchanged.

## SOLID Review

- **S** — `openp41ge-uikit/src/theme/` is a single-responsibility module (theme data + CSS generation). No violations.
- **O** — `BUILTIN_THEMES` registry is open for extension (just add to the object). No violations.
- **L** — All theme functions return data, no side effects. No violations.
- **I** — `SyntaxTheme` and `SyntaxScopeColors` are focused interfaces. No violations.
- **D** — Themes are pure functions/data — no dependencies to invert. No violations.

## Open Questions

1. **themes-demo: keep or delete?** The demo is a standalone Vite app for visually verifying theme colors. After merge, it imports from `openp41ge-uikit/theme`. I recommend keeping it (updated) to preserve visual verification during development.
2. **vite multi-entry vs single entry?** If themes are re-exported from the main entry, consumers who only want themes will pull in Lit as a transitive dependency (even if tree-shaken). A separate `./theme` sub-path export avoids this. Recommended: multi-entry build producing `dist/index.js` and `dist/theme.js`.

## Completion Criteria

- [ ] `packages/openp41ge-uikit/` exists with all components + theme sources
- [ ] `packages/openp41ge-uikit/package.json` has correct name + exports
- [ ] `packages/openp41ge-uikit-demo/` exists with updated imports
- [ ] `packages/openp41ge-themes/` deleted (merged)
- [ ] All consumer imports updated (5 files in 4 packages)
- [ ] All `package.json` dependencies updated
- [ ] Vite config alias updated
- [ ] `nx build` succeeds (with `--skip-nx-cache`)
- [ ] `nx dev` starts and app renders correctly
- [ ] `AGENTS.md` package tree updated
- [ ] Old plan files cleaned up
