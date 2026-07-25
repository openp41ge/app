# Openp41ge — Agent Guide

## Overview

Openp41ge is a desktop pane manager (Electron) that organises running processes, file editors, terminals, and other tools into a column-based grid layout with tabs, drag-and-drop, and multi-window support.

The project is an **Nx + pnpm monorepo** at `/Users/rk/Repository/openp41ge/master/`. All packages live under `packages/`. There are **17 packages** total: 8 library packages, 8 demo packages, and 1 Electron app.

## Project Structure

```
openp41ge/
├── packages/
│   ├── openp41ge/                          # Electron desktop app — the platform
│   ├── openp41ge-file-editor/              # File editor web component (<file-editor>)
│   ├── openp41ge-file-editor-demo/         # Demo app for the file editor
│   ├── openp41ge-git-repository/           # Git repository browser
│   ├── openp41ge-git-repository-demo/      # Demo app for the git browser
│   ├── openp41ge-terminal/                 # Terminal emulator (xterm.js + child process)
│   ├── openp41ge-terminal-demo/            # Demo app for the terminal
│   ├── openp41ge-agent-chat/               # AI chat panel
│   ├── openp41ge-agent-chat-demo/          # Demo app for the chat panel
│   ├── openp41ge-logger/                   # Logging utility
│   ├── openp41ge-logger-demo/              # Demo app for the logger
│   ├── openp41ge-syntax-highlighting/      # Syntax highlighting engine
│   ├── openp41ge-syntax-highlighting-demo/ # Demo app for syntax highlighting
│   ├── openp41ge-themes/                   # Theme system
│   ├── openp41ge-themes-demo/              # Demo app for themes
│   ├── openp41ge-tabs/                     # Tab/drag-and-drop components
│   └── openp41ge-tabs-demo/                # Demo app for tabs
├── project.json                        # Root Nx project with workspace-level targets
├── nx.json                             # Nx configuration (cache, target defaults)
├── plans/                              # Active plans — write, update, delete on completion
├── pnpm-workspace.yaml
└── package.json
```

## Nx Commands (replaces pnpm scripts)

All operations use **Nx** directly — there are no `package.json` scripts.

| Command        | What it does                                        |
| -------------- | --------------------------------------------------- |
| `nx build`     | Build all 17 packages (libs → demos → Electron app) |
| `nx dev`       | Start Electron app in dev mode (vite + Electron)    |
| `nx test`      | Run all vitest unit tests                           |
| `nx e2e`       | Run Playwright e2e tests                            |
| `nx typecheck` | TypeScript type-checking across all packages        |
| `nx lint`      | ESLint across all packages                          |
| `nx knip`      | Dead code detection                                 |
| `nx quality`   | typecheck + lint + knip                             |
| `nx format`    | Prettier format                                     |
| `nx clean`     | Remove all `dist/` directories                      |

**Per-package commands:**

```bash
nx run openp41ge:dev              # Dev mode (vite + Electron)
nx run openp41ge-file-editor-demo:dev   # Demo dev server for file editor
nx run openp41ge:build:electron         # Build just the Electron main process
```

## Plans Directory

The `plans/` directory at the project root is used to write and track progress on all feature or bug-fix plans.

- When starting a significant piece of work, write a plan in `plans/`.
- Keep the plan updated as work progresses.
- When the work is complete, delete the plan file.
- Plans should be concise markdown files that define the goal, approach, and completion criteria.
- **Every plan file must start with a date** in `YYYY-MM-DD` format on the first line, so the agent chat system can chronologically order plans when reconstructing project history.

## Skill Usage

The project defines skills in `.pi/skills/` that provide authoritative workflows for common tasks. **Always check available skills before starting a task.**

- If a skill description matches the current task, use `read` to load its `SKILL.md` and follow the instructions.
- Skills are authoritative for their domain — prefer them over general reasoning.
- The current skills are:
  - **plan** — Always use before starting a feature, refactor, or bug fix.
  - **commit** — Always use to commit work.
  - **quality** — Always run before submitting work.
  - **debug** — Debug issues in the running app.

## SOLID Principles

All code follows SOLID principles with class-based architecture:

- **Single Responsibility**: Each class has one reason to change. If adding a second responsibility, extract into its own class.
- **Open/Closed**: Open for extension, closed for modification. Use inheritance, composition, or strategy patterns.
- **Liskov Substitution**: Subtypes must be substitutable for their base types. Return `null` for expected absences, not `throw`.
- **Interface Segregation**: Keep interfaces focused and small. No class should depend on methods it doesn't use.
- **Dependency Inversion**: Depend on abstractions (interfaces), not concretions. Inject dependencies through constructors.

### Model-Based Dependency Injection

External dependencies (filesystem, git, OS dialogs) are wrapped in **model interfaces** with two implementations:

| Implementation      | File location                             | Behaviour                      |
| ------------------- | ----------------------------------------- | ------------------------------ |
| Production (`Ipc*`) | `packages/openp41ge/src/renderer/models/` | Delegates to IPC / real system |
| Test (`Test*`)      | `packages/openp41ge/src/renderer/models/` | Pure in-memory, no I/O         |

Components expose the service as a public property (e.g., `_repoService`) so tests can inject test models before exercising component behaviour. Existing models: `RepoService`, `RepositoryModel`, `WorktreeModel`, `FileEntryModel`.

## Code Quality

### Before Submitting

1. **Run quality checks** — `nx quality` (typecheck + lint + dead code)
2. **Run all tests** — `nx test` (vitest) and `nx e2e` (Playwright)
3. **Build** — `nx build` must succeed
4. Use the **quality** skill to run all tooling.
5. Use the **commit** skill to review and commit changes with structured git notes.

### When Debugging

Use the **debug** skill and the `chrome_devtools_*` tools to inspect the running Electron renderer. Before reading source code or forming hypotheses, check the live DOM and console — it's the fastest path to narrowing down a problem.

## Package Architecture

### Platform Package (`packages/openp41ge/`)

The Electron desktop app. Owns the layout data model (`src/layout/`), renderer Web Components (`src/renderer/components/`), controller system (`src/renderer/controllers/`), Electron main process (`electron/`), and IPC handlers (`electron/ipc-handlers/`).

Other packages (`openp41ge-file-editor`, `openp41ge-terminal`, `openp41ge-git-repository`, `openp41ge-agent-chat`) communicate with the platform exclusively through:

1. **DOM CustomEvents** — dispatched on the element or `document`, bubbles up.
2. **IPC** through the Electron preload bridge (`window.openp41ge.*`).
3. **Workspace state** — single source of truth. Other packages never mutate state directly; they dispatch commands through `window.openp41ge.workspace.dispatch()`.
4. **PaneController interface** — each app type implements mount/unmount/snapshot/restore and is registered in `app-registry.ts`.

Other packages are imported as npm dependencies and bundled at build time with Vite. **They never import from `packages/openp41ge/` directly.**

### Key Files in `packages/openp41ge/`

| File                                               | Purpose                                                          |
| -------------------------------------------------- | ---------------------------------------------------------------- |
| `src/layout/types.ts`                              | All type definitions (Workspace, Window, Grid, Tab, Pane)        |
| `src/layout/operations.ts`                         | Pure tree operations (30+ functions)                             |
| `src/layout/compute-layout.ts`                     | Layout computation + ghost preview generation                    |
| `src/renderer/components/openp41ge-grid.ts`        | Main grid component with drag state, ghost overlay, DnD handlers |
| `src/renderer/components/openp41ge-pane.ts`        | Individual pane component                                        |
| `src/renderer/components/openp41ge-cell-tabbar.ts` | Tab bar with drop detection, reordering, hover-to-switch         |
| `src/renderer/drag-overlay.ts`                     | Cross-window drag bridge using Electron IPC                      |
| `src/renderer/apps/app-registry.ts`                | App type registration (type ID → controller factory)             |
| `src/renderer/controllers/types.ts`                | TabController interface and AppTypeRegistration                  |
| `src/renderer/app.ts`                              | Entry point, service wiring, bootstrap pipeline                  |
| `src/renderer/global.d.ts`                         | `window.openp41ge.*` type declarations                           |
| `electron/preload.cjs`                             | contextBridge exposing `window.openp41ge.*` to renderer          |
| `electron/ipc-handlers/*.ts`                       | IPC handler registrations (one per domain)                       |
| `electron/openp41ge-application.ts`                | Main process — wires services, creates windows                   |
| `src/styles/themes.css`                            | Dark and light theme CSS custom properties                       |

### Layout Data Model

```
Workspace
 └── Window
      ├── id: string
      ├── bounds, monitor, grid
      └── Grid
                ├── rows: number (always 1 — column-based)
                ├── cols: number
                └── placements: [{ tabIds, position: { row, col } }]
```

- **Single-row grid**: Column-based layout (`rows = 1`). No nested containers.
- **Pure functions**: All tree operations are immutable — `(tree, args) => newTree` in `src/layout/operations.ts`.
- **Centralized state**: Workspace state is the single source of truth, dispatched via IPC.

### App Type Registration

Each pane type registers via `registerAppType(registration)` in `src/renderer/apps/app-registry.ts`. The registration includes a `createController(tabId)` factory. When a tab is created, the grid looks up the registration and creates the appropriate controller. Fallback: `PlaceholderController`.

### Drag & Drop System

Three drop scenarios in `openp41ge-grid.ts`:

1. **Same-tab**: `movePaneInGrid` — swaps/moves within existing grid. No `resizeGrid`.
2. **Cross-tab (same window)**: `resizeGrid(cols+1)` + `movePaneToTab` — adds column, places pane.
3. **Cross-window**: Same as cross-tab but across windows.

Column boundary insert threshold: `INSERT_BOUNDARY_THRESHOLD = 0.15` (15% of column width). Drag state is module-level (survives DOM re-creation on tab switch).

### Key Design Decisions

- **Vanilla Web Components** — no React/JSX. Other packages use Lit for convenience.
- **Module-level drag state** — survives grid DOM destruction/re-creation on tab switch.
- **Cleanup ordering** — Always snapshot drag-intent flags into local variables BEFORE `clearDragState()`.
- **Empty grid handling** — Tab with no panes: don't add `+1` column, fill column 0.
- **No `resizeGrid` for same-tab** — moving within same tab just rearranges, no column count change.

## Build System (Nx)

The monorepo uses **Nx v23** as its build orchestrator. Key files:

| File                      | Purpose                                              |
| ------------------------- | ---------------------------------------------------- |
| `nx.json`                 | Target defaults, caching configuration               |
| `project.json` (root)     | Workspace-level targets (build, test, quality, etc.) |
| `packages/*/project.json` | Per-package targets                                  |

**Caching**: Nx caches all build outputs. Subsequent runs are near-instant. To force a fresh build: `nx build --skip-nx-cache`

**Progressive builds**: When a library changes, only downstream packages that depend on it are rebuilt — thanks to `dependentTasksOutputFiles` in `nx.json`.

**Dev mode source aliases**: The main app's `vite.config.ts` contains source aliases for all library packages. This means `nx dev` serves directly from library source — no rebuild needed when changing library code.

### Available Nx Executors

| Executor                    | Used for                                                        |
| --------------------------- | --------------------------------------------------------------- |
| `@nx/vite:build`            | Building packages that use Vite                                 |
| `@nx/vite:dev-server`       | Dev servers for demos and main app                              |
| `@nx/vitest:test`           | Unit tests (vitest)                                             |
| `@nx/playwright:playwright` | E2E tests (Playwright)                                          |
| `nx:run-commands`           | Composite commands (build + tsc decl, orchestrators like `dev`) |

## Testing

### Test Structure

```
test/
├── unit/                # Pure unit tests — single class/module in isolation
├── integration/         # Cross-system tests — boundaries between components
├── e2e/                 # End-to-end browser tests (Playwright)
└── contract/            # Consumer-driven contract tests (Pact)
```

### Running Tests

```bash
nx test                  # All vitest unit tests
nx e2e                   # All Playwright e2e tests
nx run openp41ge:test    # Tests for a specific package
nx run openp41ge:test -- --skip-nx-cache  # Force re-run (no cache)
```

### Test-First Approach

Tests are written **first**, before implementation code:

**For new behaviours**: Write the test first (unit, integration, or contract), implement the feature, verify it passes.

**For bug fixes**: Write a regression test that reproduces the bug, confirm it fails, invert the expectation to expect the correct behaviour, fix the bug, keep the test as a permanent regression guard.

### When to Use Each Test Level

| Behaviour                                                             | Test level  |
| --------------------------------------------------------------------- | ----------- |
| Layout operations, tab lifecycle, drag calculations, command dispatch | Integration |
| IPC method shapes, PaneController interface, event contracts          | Contract    |
| Pure parsing/formatting, data model invariants                        | Unit        |

## Package-Level Agent Guides

Individual packages may contain a `docs/AGENT-GUIDE.md` file with implementation-specific documentation for AI agents. **Always check for `docs/AGENT-GUIDE.md` in any package you are working with** before reading source code or making changes. These guides contain authoritative information about component APIs, data models, event contracts, and integration patterns specific to that package.
