2025-07-29

# Consolidate UI Into openp41ge-uikit + Top-Level Storybook

## Goal

Consolidate all UI web components and visual rendering code into a single `openp41ge-uikit` package (renamed from `openp41ge-components`), merge related pure-data packages (`openp41ge-themes`), and create a top-level `storybook/` directory that replaces all UI-specific demo packages with Storybook stories.

Pure logic code stays in standalone library packages. Functional/integration demos (terminal, agent-chat, git-cli, logger) remain in `demos/` as standalone Vite apps.

## Rationale

- **Single source of truth** for all UI components — one package, one version, one API surface
- **Storybook as the UI catalogue** — interactive documentation replacing scattered standalone demos
- **Separation of concerns** — UI components in uikit, pure logic in library packages, full-app demos in demos/
- **Eliminates duplication** — `openp41ge-file-editor` has its own tokenization and themes that partially duplicate `openp41ge-syntax-highlighting` and `openp41ge-themes`
- **Reduces package count** — 10+ packages consolidated into fewer, cleaner boundaries

## Target Architecture

```
packages/
├── openp41ge/                          # Electron desktop app (unchanged)
├── openp41ge-uikit/                    # ALL UI: components, tabs, file-editor UI,
│                                       # syntax-highlighting, themes, git-repo UI
├── openp41ge-filesystem/               # File system operations (split from file-editor)
├── openp41ge-git/                      # Git logic (git + git-repository models merged)
├── openp41ge-logger/                   # Logging utility
├── openp41ge-terminal/                 # Terminal emulator (xterm.js, stays standalone)
└── openp41ge-agent-chat/               # AI chat panel (stays standalone)

storybook/                              # Single Storybook instance importing from uikit

demos/
├── openp41ge-terminal-demo/            # Terminal functional demo (stays)
├── openp41ge-agent-chat-demo/          # Chat functional demo (stays)
├── openp41ge-git-demo/                 # Git CLI demo (stays)
└── openp41ge-logger-demo/              # Logger demo (stays)
```

### Packages removed (folded into uikit)

| Package | What moves to uikit |
|---------|---------------------|
| `openp41ge-components` | All existing components (icon, repo-row, side-header, worktree-row) — rename to uikit |
| `openp41ge-themes` | All theme definitions (dark-plus, light-plus, types) — merge into uikit |
| `openp41ge-tabs` | All components (tab-grid, tab-bar, tab-content, tab-view) + drag infrastructure (ghost-manager, orchestrator, targets, sources) |
| `openp41ge-syntax-highlighting` | Highlighting engine, tokenization, HTML renderer |
| `openp41ge-git-repository` | Git browser renderer service |

### Packages removed (replaced)

| Package | Replaced by |
|---------|-------------|
| `openp41ge-file-editor-demo` | Storybook stories |
| `openp41ge-tabs-demo` | Storybook stories |
| `openp41ge-themes-demo` | Storybook stories |
| `openp41ge-components-demo` | Storybook stories (already uses Storybook) |
| `openp41ge-syntax-highlighting-demo` | Storybook stories |
| `openp41ge-git-repository-demo` | Storybook stories |

## Phases

### Phase 1 — Rename openp41ge-components → openp41ge-uikit + Merge openp41ge-themes

This is the existing plan in `plans/2025-07-29-rename-components-to-uikit.md`.

1. Rename `packages/openp41ge-components/` → `packages/openp41ge-uikit/`
2. Merge `packages/openp41ge-themes/` into `openp41ge-uikit/theme`
3. Update all workspace references (package.json, vite aliases, imports)
4. Update `products/web/` and `products/electron/` imports to point to new package

### Phase 2 — Merge openp41ge-tabs into uikit

1. Move `packages/openp41ge-tabs/src/` → `packages/openp41ge-uikit/src/tabs/`
2. Re-export all tab components from uikit index
3. Update `openp41ge` Electron app imports to use `openp41ge-uikit` instead of `openp41ge-tabs`
4. Remove `packages/openp41ge-tabs/`

### Phase 3 — Merge openp41ge-syntax-highlighting into uikit

1. Move `packages/openp41ge-syntax-highlighting/src/` → `packages/openp41ge-uikit/src/syntax-highlighting/`
2. Re-export from uikit index
3. Update imports across the workspace
4. Remove `packages/openp41ge-syntax-highlighting/`

### Phase 4 — Merge openp41ge-git-repository into uikit (UI) + openp41ge-git (models)

1. Move UI rendering (`git-browser-renderer.ts`, types) → `packages/openp41ge-uikit/src/git-repository/`
2. Move model classes (`RepositoryModel`, `WorktreeModel`, `FileEntryModel`) → `packages/openp41ge-git/`
3. Update imports
4. Remove `packages/openp41ge-git-repository/`

### Phase 5 — Split openp41ge-file-editor

1. Extract file system interfaces + services → `packages/openp41ge-filesystem/`
2. Move UI (file-editor web component, view layer, rendering, input handling) → `packages/openp41ge-uikit/src/file-editor/`
3. Deduplicate tokenization and themes with existing uikit copies
4. Keep the text model (`model/`) as part of filesystem or standalone — needs design discussion
5. Remove `packages/openp41ge-file-editor/`

### Phase 6 — Create top-level storybook/

1. Create `storybook/` directory with `@storybook/web-components-vite`
2. Configure `stories` glob to pull from `packages/openp41ge-uikit/src/**/*.stories.ts`
3. Port existing stories from `demos/openp41ge-components-demo/stories/` (icon, repo-row, side-header, worktree-row)
4. Write new stories for: tabs (tab-grid, tab-bar), file-editor, syntax-highlighting, themes
5. Add `storybook/` to `pnpm-workspace.yaml` globs
6. Add nx targets for `storybook:dev` and `storybook:build` in root project.json

### Phase 7 — Remove replaced UI demo packages

1. Delete `demos/openp41ge-components-demo/` (stories migrated to storybook/)
2. Delete `demos/openp41ge-tabs-demo/` (stories replace it)
3. Delete `demos/openp41ge-themes-demo/`
4. Delete `demos/openp41ge-syntax-highlighting-demo/`
5. Delete `demos/openp41ge-file-editor-demo/` (functional parts move to storybook)
6. Delete `demos/openp41ge-git-repository-demo/`
7. Update `pnpm-workspace.yaml`, `eslint.config.js`, `knip.json` accordingly

## Testing Strategy

| Phase | What to test | How |
|-------|-------------|-----|
| All | Import paths resolve correctly | `nx build` after each phase |
| All | Components render in Storybook | `storybook dev` + visual inspection |
| Phase 2 | Tab drag-and-drop works | Manual test in Storybook |
| Phase 5 | File editor continues to function | Storybook story + existing test suite |
| Phase 4 | Git models still work | `nx test` for openp41ge-git |
| Final | Full build succeeds | `nx run-many -t build --skip-nx-cache` |

## UX Considerations

- Storybook replaces standalone dev servers for UI components — devs run `nx run openp41ge-uikit:storybook` instead of `nx run some-demo:dev`
- All existing component APIs, events, and styling remain unchanged
- CSS custom properties from themes continue to work identically
- Tab interactions (drag, drop, split, reorder) behave identically — only the demo harness changes

## Open Questions

1. **File editor text model** — should the piece-tree text model live in `openp41ge-filesystem` or stay in uikit alongside the editor UI? It's used exclusively by the editor.
2. **`openp41ge-logger`** — has a `log-viewer.ts` component. Should that move to uikit, or stay since it's a small utility? Currently listed as staying standalone.
3. **Storybook location** — at `storybook/` root level, or as a target on `packages/openp41ge-uikit/` itself (like `nx run openp41ge-uikit:storybook`)? The latter is simpler.

## Completion Criteria

- [ ] Phase 1: components → uikit rename + themes merge complete
- [ ] Phase 2: tabs merged into uikit
- [ ] Phase 3: syntax-highlighting merged into uikit
- [ ] Phase 4: git-repository split (UI→uikit, models→openp41ge-git)
- [ ] Phase 5: file-editor split (filesystem→new lib, UI→uikit)
- [ ] Phase 6: top-level storybook/ running and showing all uikit components
- [ ] Phase 7: replaced UI demo packages removed from demos/
- [ ] `nx build --skip-nx-cache` succeeds across all packages
- [ ] AGENTS.md and docs updated
