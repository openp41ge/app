2025-07-29

# Move All Demo Packages to a Top-Level demos/ Directory

## Goal

Move all 10 demo packages from `packages/*-demo/` into a top-level `demos/` directory, reducing clutter in `packages/` and clearly separating library code from demo applications.

## Rationale

- `packages/` currently has 17 entries — 7 library packages, 10 demo apps. Demos are development/visualisation tools, not published libraries. Grouping them in `demos/` makes the monorepo structure more intuitive.
- Cleaner navigation: `packages/` becomes library-only; `demos/` is for everything demo-related.
- Follows a common monorepo convention (e.g., Nx's own examples use `apps/`, `libs/`, `tools/`).

## Demos to Move

| Current path | Destination |
|---|---|
| `packages/openp41ge-agent-chat-demo/` | `demos/openp41ge-agent-chat-demo/` |
| `packages/openp41ge-components-demo/` | `demos/openp41ge-components-demo/` |
| `packages/openp41ge-file-editor-demo/` | `demos/openp41ge-file-editor-demo/` |
| `packages/openp41ge-git-demo/` | `demos/openp41ge-git-demo/` |
| `packages/openp41ge-git-repository-demo/` | `demos/openp41ge-git-repository-demo/` |
| `packages/openp41ge-logger-demo/` | `demos/openp41ge-logger-demo/` |
| `packages/openp41ge-syntax-highlighting-demo/` | `demos/openp41ge-syntax-highlighting-demo/` |
| `packages/openp41ge-tabs-demo/` | `demos/openp41ge-tabs-demo/` |
| `packages/openp41ge-terminal-demo/` | `demos/openp41ge-terminal-demo/` |
| `packages/openp41ge-themes-demo/` | `demos/openp41ge-themes-demo/` |

## What Changes Per Demo Package

Each demo package has the same set of relative-path references that need updating:

### 1. `project.json` — `$schema` path

```
- "$schema": "../../node_modules/nx/schemas/project-schema.json"
+ "$schema": "../node_modules/nx/schemas/project-schema.json"
```

### 2. `vite.config.ts` — source alias paths

All 10 demos have vite configs with `path.resolve(__dirname, "../some-package/src")`. After moving to `demos/`, the sibling package is now up one level and into `packages/`:

```
- path.resolve(__dirname, "../some-package/src")
+ path.resolve(__dirname, "../packages/some-package/src")
```

Affected files:
- `demos/openp41ge-agent-chat-demo/vite.config.ts`
- `demos/openp41ge-file-editor-demo/vite.config.ts`
- `demos/openp41ge-git-demo/vite.config.ts`
- `demos/openp41ge-git-repository-demo/vite.config.ts`
- `demos/openp41ge-logger-demo/vite.config.ts`
- `demos/openp41ge-syntax-highlighting-demo/vite.config.ts`
- `demos/openp41ge-tabs-demo/vite.config.ts`
- `demos/openp41ge-terminal-demo/vite.config.ts`
- `demos/openp41ge-themes-demo/vite.config.ts`

(`openp41ge-components-demo` uses `"openp41ge-components"` package-name import via pnpm, not a source alias, so it doesn't need this change.)

### 3. `demos/openp41ge-components-demo/.storybook/main.ts` — stories glob

```
- stories: ["../stories/**/*.stories.ts", "../stories/**/*.mdx"],
+ stories: ["./stories/**/*.stories.ts", "./stories/**/*.mdx"],
```

(since stories are bundled inside the demo package itself, the relative path changes from `../stories/` to `./stories/`)

Actually wait — the stories are inside the demo package directory, so `../stories/` points to `packages/openp41ge-components-demo/stories/`. After moving to `demos/openp41ge-components-demo/stories/`, the relative path from `.storybook/` to `stories/` remains the same (`../stories/`) because they're both inside the same package directory. **No change needed.**

### 4. Configuration files (pnpm-workspace.yaml)

```yaml
packages:
  - "packages/*"
+ - "demos/*"
```

Nx auto-discovers projects by scanning for `project.json` files in all directories matched by `pnpm-workspace.yaml`, so no Nx config change is needed.

## Files With No Changes Needed

- `nx.json` — uses `{projectRoot}` placeholders, auto-adjusts
- `tailwind.preset.js` — no demo references
- `tsconfig.base.json` — no demo references
- Library packages (`openp41ge`, `openp41ge-file-editor`, etc.) — unaffected

## Order of Operations

1. Update `pnpm-workspace.yaml` to add `"demos/*"` glob (pnpm and Nx both discover from this)
2. Move each demo directory from `packages/*-demo/` to `demos/*-demo/` using `git mv`
3. Update `project.json` `$schema` path in each moved demo (`../../` → `../`)
4. Update `vite.config.ts` source alias paths in each moved demo (`../pkg` → `../packages/pkg`)
5. Verify: `pnpm install` (re-link workspace deps), `nx build`, `nx run some-demo:dev`

## Automation

Since the 10 demos follow identical patterns, use a script to avoid manual errors:

```bash
# Move directories
for d in packages/*-demo/; do
  name=$(basename "$d")
  mkdir -p "demos"
  git mv "$d" "demos/$name"
done

# Fix project.json $schema
for f in demos/*-demo/project.json; do
  sed -i '' 's|"../../node_modules/nx/schemas/project-schema.json"|"../node_modules/nx/schemas/project-schema.json"|g' "$f"
done
```

## Testing Strategy

| What | How |
|------|-----|
| pnpm workspace resolution | `pnpm install — it should link all demos correctly from new location |
| Nx project discovery | `nx show projects` — should list all 17+ projects including demos |
| Build | `nx build --skip-nx-cache` — progressive build across all packages and demos |
| Dev mode | `nx dev` — app starts and renders correctly |
| Individual demo dev | `nx run openp41ge-tabs-demo:dev` — demo dev server starts |

## UX Considerations

No UX changes — this is a pure filesystem restructuring. All build outputs, dev servers, and runtime behaviour remain identical.

## Completion Criteria

- [x] All 10 demo directories moved to `demos/`
- [x] `pnpm-workspace.yaml` updated with `"demos/*"`
- [x] All `project.json` `$schema` paths updated
- [x] All `vite.config.ts` source alias paths updated
- [x] `.gitignore` entries in moved demos (if any) still work
- [x] `pnpm install` succeeds
- [x] `nx show projects` lists all demos at new paths
- [x] `nx build --skip-nx-cache` succeeds (20 projects, root monorepo excluded)
- [x] `AGENTS.md` updated to reflect new `demos/` directory
- [x] `eslint.config.js` demo glob updated
- [x] `knip.json` demo workspace path updated
- [x] `nx.json` lint cache input includes `demos/**/*`
- [x] Root `project.json` lint command includes `demos/`
