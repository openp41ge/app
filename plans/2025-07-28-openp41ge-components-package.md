2025-07-28

# openp41ge-components — Shared Component Library with Storybook

## Goal

Create a new `openp41ge-components` library package providing reusable UI components (icon system, row components, layout primitives) styled with **Tailwind CSS** via a shared design token preset, with Storybook for visual development. The main Electron app's Tailwind pipeline scans all UI packages so styles are available everywhere without duplication.

## Rationale

The git sidebar should match the explorer sidebar's visual style. Rather than duplicating inline styles across each sidebar view and having dozens of icon-export functions, extract shared primitives into a component library with:
- A single `<openp41ge-icon>` component driven by a `name` prop
- Tailwind utility classes for consistent styling from a shared token set
- A shared `tailwind.preset.js` so every package's standalone build (Storybook, demo) uses the same design tokens

## Approach

### Tailwind Architecture

**Single build in the main app, standalone builds in each UI package.**

```
tailwind.preset.js              (monorepo root — shared design tokens)
       │
       ├── packages/openp41ge/tailwind.config.js
       │     └── presets: [require("../../tailwind.preset.js")]
       │     └── content: [
       │           "./src/**/*.{ts,html}",
       │           "../openp41ge-components/src/**/*.{ts,html}",
       │           "../openp41ge-git-repository/src/**/*.{ts,html}",
       │           "../openp41ge-terminal/src/**/*.{ts,html}",
       │           ... (all UI packages with source aliases)
       │         ]
       │     └── postcss.config.js → processes src/styles/main.css
       │
       └── packages/openp41ge-components/tailwind.config.js
             └── presets: [require("../../tailwind.preset.js")]
             └── content: ["./src/**/*.{ts,html}", "./stories/**/*.{ts,html}"]
             └── Storybook picks up PostCSS from postcss.config.js
```

**Rules:**
- The main app's `tailwind.config.js` `content` array includes **every package that uses Tailwind** via source alias paths. Vite's PostCSS pipeline generates ONE CSS file with all utility classes used across all packages. No duplication.
- Each library package's **standalone** build (Storybook, demo dev server) has its own `tailwind.config.js` using the same preset but scanning only its own content. This produces a separate, smaller CSS file for isolated development.
- Library packages **do not ship compiled CSS in `dist/`** — the main app scans their raw source. For packages that need a standalone build, their own Vite/Storybook pipeline runs Tailwind locally.

**(a) Scoping** — Each standalone build only scans its own content paths. The main app scans everything via source aliases.

**(b) Styles in the main app** — The main app's PostCSS pipeline generates ONE stylesheet that includes all utility classes used by every package. No missing styles. No duplication.

### Package Structure

```
packages/openp41ge-components/
├── src/
│   ├── index.ts                     # Public API barrel export
│   ├── components/
│   │   ├── openp41ge-icon.ts        # <openp41ge-icon name="git" size=20>
│   │   ├── side-header.ts           # Section header (title + refresh button)
│   │   ├── repo-row.ts              # Repo header (chevron + label + count)
│   │   └── worktree-row.ts          # Worktree sub-row (indent + label)
│   ├── icons/
│   │   └── registry.ts              # Map<string, SVG string> — all icons
│   └── styles.css                   # @tailwind utilities; + component layer
├── .storybook/
│   ├── main.ts
│   ├── preview.ts
│   └── preview-head.html
├── stories/
│   ├── openp41ge-icon.stories.ts
│   ├── repo-row.stories.ts
│   ├── worktree-row.stories.ts
│   └── side-header.stories.ts
├── tailwind.config.js
├── postcss.config.js
├── vite.config.ts
├── tsconfig.json
├── tsconfig.storybook.json
├── package.json
└── project.json
```

### Design Decisions

| Decision               | Choice                                                                                                                         |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Framework              | Lit elements for interactive components, pure DOM builder functions for simple rows.                                           |
| Styling approach       | **Tailwind CSS** via PostCSS. Utility classes replace inline `style.cssText`. Lit's `adoptedStyleSheets` for scoped styles.   |
| Demo tool              | **Storybook** (`@storybook/web-components-vite` + `@storybook/addon-essentials`).                                              |
| Icon system            | Single `<openp41ge-icon name="..." size={20} />`. Names → SVGs from `icons/registry.ts`. No per-icon functions.                |
| Tree row API           | Lit elements (`<repo-row>`, `<worktree-row>`) using Tailwind classes. Accept callbacks as properties.                          |
| Theming                | **Shared `tailwind.preset.js`** at monorepo root. Tokens map to existing CSS custom properties where possible.                  |
| Dependency direction   | `openp41ge-components` → no dependency on `openp41ge` or `window.openp41ge.*`. Pure UI primitives.                            |
| Source aliases in app  | `openp41ge-components` → `../openp41ge-components/src` (matches existing pattern in `vite.config.ts`).                        |

### Migration Strategy

1. Create `tailwind.preset.js` at monorepo root with shared design tokens.
2. Scaffold `openp41ge-components` (package.json, project.json, tsconfig, vite.config, tailwind.config, postcss.config).
3. Implement icon registry + `<openp41ge-icon>` component with all icons from the platform's `icons/index.ts`.
4. Set up Storybook with stories for the icon component.
5. Build row components (`repo-row`, `worktree-row`, `side-header`) using Tailwind.
6. Configure main app (`openp41ge`) to use Tailwind: add `tailwind.config.js`, `postcss.config.js`, update `content` array to include `openp41ge-components` source.
7. Add a `src/styles/main.css` entry with `@tailwind` directives in the main app.
8. Update `GitSidebarView` to import components from `openp41ge-components`.
9. Register the source alias in the main app's `vite.config.ts`.
10. Add `openp41ge-components` to `pnpm-workspace.yaml`.
11. Do NOT change `explorer-view.ts` or `repo-tree-renderer.ts`.

## Files Changed

### New files

#### Monorepo root
- `tailwind.preset.js` — shared design token preset

#### packages/openp41ge-components/
- `package.json`
- `project.json`
- `tsconfig.json`
- `tsconfig.storybook.json`
- `vite.config.ts`
- `tailwind.config.js` — standalone, extends preset
- `postcss.config.js`
- `src/index.ts`
- `src/types.ts`
- `src/styles.css` — `@tailwind utilities;` + component layer
- `src/components/openp41ge-icon.ts`
- `src/components/side-header.ts`
- `src/components/repo-row.ts`
- `src/components/worktree-row.ts`
- `src/icons/registry.ts` — all icon SVGs
- `.storybook/main.ts`
- `.storybook/preview.ts`
- `.storybook/preview-head.html`
- `stories/openp41ge-icon.stories.ts`
- `stories/repo-row.stories.ts`
- `stories/worktree-row.stories.ts`
- `stories/side-header.stories.ts`

#### packages/openp41ge/ (main app)
- `tailwind.config.js` — extends preset, content scans all UI packages
- `postcss.config.js`
- `src/styles/main.css` — `@tailwind base; @tailwind components; @tailwind utilities;`

### Modified files

- `packages/openp41ge/src/renderer/components/sidebar-views/git-sidebar-view.ts` — use `openp41ge-components`
- `packages/openp41ge/vite.config.ts` — add source alias for `openp41ge-components`
- `packages/openp41ge/src/renderer/app.ts` (or equivalent entry) — import `src/styles/main.css`
- `packages/openp41ge/src/renderer/icons/index.ts` — re-export `openp41ge-icon` for backwards compat, or mark as deprecated
- `pnpm-workspace.yaml` — add `openp41ge-components`
- `nx.json` — storybook target defaults (inputs, outputs, cache)

## Testing Strategy

### Storybook stories (visual regression)
- `openp41ge-icon` — every icon name at multiple sizes, colour override
- `repo-row` — expanded, collapsed, with/without worktree count
- `worktree-row` — single, multiple, empty state
- `side-header` — with and without refresh button

### Unit tests (Vitest in `openp41ge-components`)
- Icon registry returns expected SVG for each name
- `openp41ge-icon` renders correct SVG for given `name` prop
- Row components render states without throwing

### E2E (Playwright via openp41ge)
- Git sidebar renders correctly after migration
- No regressions in explorer sidebar

## UX Considerations

- **Typography**: Monospace family. Header titles: 10px uppercase `#888`. Repo names: 12px `#ccc`. Worktree branches: 11px `#aaa`.
- **Colours**: Mapped to existing CSS custom properties via the Tailwind preset.
- **Indent**: Worktree rows indented to align with the icon column in the explorer (16px from triangle edge).
- **Triangles**: Unicode `▸`/`▾` at `font-size:14px` in a 16px-wide flex container.
- **Interaction**: `hover:bg-white/5` replaces JS `mouseenter`/`mouseleave` handlers. `cursor-pointer` for clickable rows.

## Open Questions

1. **Vite library mode + CSS** — Components need Tailwind CSS available at runtime. Options:
   - **`adoptedStyleSheets`**: inject Tailwind utilities into Lit's shadow DOM via a shared constructable stylesheet
   - **Global CSS in the app**: rely on the main app's global `styles.css` (Tailwind is already there). Library components just reference class names that exist in the global sheet. This is simpler but breaks if a component is used outside the app (e.g., in Storybook — but Storybook has its own Tailwind build)
   
   **Proposed**: Components use `adoptedStyleSheets` referencing their own `styles.css` entry. The main app's global stylesheet also includes the same utilities (deduplication is fine for CSS custom properties).

2. **CSS custom properties vs raw values in the preset** — Some tokens can reference `var(--bg-gutter)` (dynamically themeable), others need concrete values (e.g., `#ccc` for text). Should the preset prefer `var()` references or concrete values?

3. **Which addons for Storybook?** Essentials only, or also `@storybook/addon-a11y` and `@storybook/addon-interactions`?

4. **Icon migration scope** — Move ALL ~25 icons from the platform's `icons/index.ts` now, or just the ones the git sidebar needs and migrate the rest later?

## Completion Criteria

- [ ] `tailwind.preset.js` exists at root with design tokens
- [ ] `openp41ge-components` builds with `nx run openp41ge-components:build`
- [ ] Storybook serves with `nx run openp41ge-components:storybook`
- [ ] `<openp41ge-icon name="git" size={20} />` renders the correct SVG in Storybook and the main app
- [ ] All platform icons moved to `icons/registry.ts` and accessible via `<openp41ge-icon>`
- [ ] Main app (`openp41ge`) has Tailwind configured with `content` scanning `openp41ge-components` source
- [ ] `GitSidebarView` imports row components from `openp41ge-components`, uses Tailwind classes, and looks identical to explorer sidebar
- [ ] `nx build` from root succeeds
- [ ] `nx dev` hot-reloads when changing `openp41ge-components` source
