# Openp41ge — Agent Guide

## Overview

Openp41ge is a desktop pane manager (Electron) that organises running processes, file editors, terminals, and other tools into a column-based grid layout with tabs, drag-and-drop, and multi-window support.

The project is an **Nx + pnpm monorepo** at `/Users/rk/Repository/openp41ge/app/master/`. Library packages live under `packages/` and demo apps live under `demos/`. There are **20 Nx projects** total: 11 library packages, 1 Electron app, and 8 demo apps.

## Ask, Don't Assume

When something is genuinely ambiguous, **ask the user before writing code**. A short question costs seconds; a wrong assumption costs a rewrite, a bad commit, and lost trust. This guide, the skills, and the codebase are the sources of truth — your recollection of them is not.

### Always ask when

- **The requirement is ambiguous.** Two reasonable readings of the request would produce materially different code, UI, or data shapes.
- **The scope is unclear.** It is not obvious whether a change applies to one package, one component, or the whole monorepo.
- **A design decision is implied but unstated.** New event names, IPC channel names, config keys, persisted state shapes, or public exports are contracts — confirm them rather than inventing them.
- **The change is destructive or hard to reverse.** Deleting files, dropping persisted workspace state, rewriting git history, changing a migration, or removing a public API.
- **Two existing patterns conflict.** The codebase does the same thing two ways and there is no comment or guide saying which is current.
- **The user's request contradicts this guide or a skill.** Point out the conflict and ask which wins — do not silently pick one.

### Never assume — verify instead

Some things look like judgement calls but are actually checkable. Check them, don't guess:

| Instead of assuming…                | Verify with…                                                                  |
| ----------------------------------- | ----------------------------------------------------------------------------- |
| A file, symbol, or component exists | `grep` / `find` — this guide can drift from the code                          |
| A package name or path              | `ls packages/`, `ls demos/`, the package's `project.json`                     |
| An API's signature or return type   | Read the source or the `.d.ts`, not memory                                    |
| A command exists                    | `nx show project <name>` or the relevant `project.json` targets               |
| A behaviour is broken               | Reproduce it in the running app (see **Debugging**) before diagnosing         |
| A test covers something             | Run the test and read it                                                      |
| A change works                      | `nx run-many -t typecheck test` — a clean typecheck is not proof of behaviour |

**Rule of thumb:** if you can answer the question with a tool call in under a minute, use the tool. If you cannot answer it with any tool call, ask the user.

### How to ask well

- Ask **early**, before building on the assumption — not after writing 200 lines that depend on it.
- Ask **specifically**, and offer the options you see: _"Should closing the last tab in a window close the window, or leave an empty grid? The current code does X, but the request implies Y."_
- Ask **once, in batch**. Gather every open question and put them in one message rather than blocking repeatedly.
- If a question is genuinely low-stakes and blocking would waste the user's time, pick the **most conservative** option, do the work, and **state the assumption explicitly** in your reply and in the plan file. Never let an assumption go unrecorded.
- When the user has already answered a question or reaffirmed a request, treat it as settled and proceed — do not re-litigate it.

## Project Structure

```
openp41ge/
├── packages/
│   ├── openp41ge/                        # Electron desktop app — the platform
│   ├── openp41ge-editor-engine/          # File editor engine (buffer, cursors, rendering)
│   ├── openp41ge-piece-tree/             # Piece-tree text buffer backing the editor
│   ├── openp41ge-filesystem/             # Filesystem abstraction / models
│   ├── openp41ge-terminal/               # Terminal emulator (xterm.js + child process)
│   ├── openp41ge-agent-chat/             # AI chat panel
│   ├── openp41ge-logger/                 # Logging utility
│   ├── openp41ge-syntax-highlighting/    # Syntax highlighting engine
│   ├── openp41ge-uikit/                  # Shared UI toolkit (Lit components, themes)
│   ├── openp41ge-tabs/                   # Tab + drag-and-drop engine (orchestrator,
│   │                                     #   ghost overlay, drag sources/drop targets)
│   ├── openp41ge-git/                    # Git integration utilities
│   └── openp41ge-constants/              # Shared constants
├── demos/
│   ├── openp41ge-agent-chat-demo/        # Demo app for the chat panel
│   ├── openp41ge-file-editor-demo/       # Demo app for the file editor
│   ├── openp41ge-git-demo/               # Demo app for git utilities
│   ├── openp41ge-git-repository-demo/    # Demo app for the git browser
│   ├── openp41ge-logger-demo/            # Demo app for the logger
│   ├── openp41ge-syntax-highlighting-demo/ # Demo app for syntax highlighting
│   ├── openp41ge-terminal-demo/          # Demo app for the terminal
│   └── openp41ge-themes-demo/            # Demo app for themes
├── project.json                        # Root Nx project with workspace-level targets
├── nx.json                             # Nx configuration (cache, target defaults)
├── plans/                              # Active plans — write, update, delete on completion
├── pnpm-workspace.yaml
└── package.json
```

## Nx Commands (replaces pnpm scripts)

All operations use **Nx** directly — there are no `package.json` scripts.

Most targets are **per-project**, so they need `run-many`. Only `lint`, `knip`, and `format*` are root-project (`openp41ge-monorepo`) targets that can be run bare.

| Command                      | What it does                                        |
| ---------------------------- | --------------------------------------------------- |
| `nx run-many -t build`       | Build all projects (libs → demos → Electron app)    |
| `nx run openp41ge:dev`       | Start Electron app in dev mode (vite + Electron)    |
| `nx run-many -t test`        | Run vitest tests across all projects that have them |
| `nx run-many -t typecheck`   | TypeScript type-checking across all packages        |
| `nx lint`                    | ESLint across `packages/` and `demos/`              |
| `nx knip`                    | Dead code detection                                 |
| `nx format` / `format:check` | Prettier write / check                              |
| `nx run-many -t clean`       | Remove all `dist/` directories                      |

**There is no `quality` or `e2e` target, and no Playwright in the repo.** Use the **quality** skill, which runs the tools above in sequence. Before quoting a command from this table, confirm it still exists — `nx show projects --with-target <target>` returns `[]` if it does not.

**Per-package commands:**

```bash
nx run openp41ge:dev                    # Dev mode (vite + Electron)
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

  | Skill                        | When to use                                                   |
  | ---------------------------- | ------------------------------------------------------------- |
  | **plan**                     | Always, before starting a feature, refactor, or bug fix.      |
  | **commit**                   | Always, to commit work.                                       |
  | **quality**                  | Always, before submitting work.                               |
  | **debug**                    | Any bug, crash, or visual issue in the running desktop app.   |
  | **test-cross-window-drag**   | Cross-window ghost overlay / drop behaviour.                  |
  | **test-file-editor-demo**    | Editor rendering, highlighting, input, undo/redo, themes.     |
  | **test-git-repository-demo** | Git panel accordion, branch/commit/file interactions, states. |
  | **test-openp41ge-tabs-demo** | Drag-and-drop, ghost sizing, cross-grid tab operations.       |

- If no skill matches, say so and proceed with general reasoning — do not stretch an unrelated skill to fit.

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

1. Use the **quality** skill — it is the authoritative sequence.
2. **Type check + lint + dead code** — `nx run-many -t typecheck`, `nx lint`, `nx knip`
3. **Run all tests** — `nx run-many -t test`
4. **Build** — `nx run-many -t build` must succeed
5. Use the **commit** skill to review and commit changes with structured git notes.

A clean typecheck is not evidence that behaviour is correct. If you changed runtime behaviour, verify it in the running app or in a test — and if you could not verify something, say so explicitly rather than reporting it as done.

## Debugging

The **debug** skill is authoritative for the mechanics — how to start dev mode, open DevTools, navigate views, and read the error overlay. **Load it first.** This section covers the _strategy_: how to think about a bug, and which technique to reach for.

### Debugging Strategy

Work the loop in order. Each step is cheap and narrows the search space for the next one. Skipping ahead to "read the source and guess" is the single most common way to waste an hour.

1. **Reproduce it.** Get the bug happening in front of you, deterministically, before forming any hypothesis. Write down the exact steps. If you cannot reproduce it, that _is_ the finding — ask the user for their exact steps, OS, project, and window state rather than guessing.
2. **Observe before theorising.** Check the live DOM, the console, the error overlay, and `window.__openp41ge_debug` **before** opening source files. The running app tells you what actually happened; the source only tells you what was intended.
3. **Locate the layer.** Openp41ge has clear seams — use them to bisect:

   | Symptom                                   | Suspect layer first                                        |
   | ----------------------------------------- | ---------------------------------------------------------- |
   | Wrong data on screen, correct interaction | State (`app-state.ts`, `workspace-data.ts`)                |
   | Interaction does nothing                  | Event routing (`event-router.ts`, `event-graph.ts`)        |
   | Data correct in state, wrong pixels       | Component render / CSS                                     |
   | Works in demo app, broken in Electron app | Platform integration (IPC, preload, `app-registry.ts`)     |
   | Broken only after a drag                  | `openp41ge-tabs` orchestrator + module-level drag state    |
   | Broken only after a tab switch or reload  | Mount/unmount, snapshot/restore, persisted state           |
   | Broken only in a built app, fine in dev   | Build config — Vite aliases, externals, `.d.ts` generation |

4. **Narrow to a single change.** Binary-search the problem space: disable half the panes, revert half the diff (`git stash`), test one package's demo in isolation. Prefer the smallest reproduction you can get — a demo app beats the full Electron app, and a unit test beats a demo app.
5. **Form one falsifiable hypothesis.** State it as "if X is the cause, then Y must be true." Then go check Y. A hypothesis you cannot disprove is not a hypothesis.
6. **Prove it with a failing test.** Per the test-first approach, write a regression test that reproduces the bug and **confirm it fails for the right reason** before fixing anything. A test that passes before your fix was never testing the bug.
7. **Fix the cause, not the symptom.** If the fix is a null guard, a `setTimeout`, or a re-render nudge, you have probably found a symptom. Ask why the value was null or why the order was wrong.
8. **Verify and clean up.** Run the **quality** skill and `nx run-many -t test`, remove every temporary log and debug hook, and keep the regression test permanently.

### Debugging Techniques

**The renderer debug API** — `window.__openp41ge_debug` (`src/renderer/debug-api.ts`) is the primary agent-facing inspection surface. Wired at bootstrap, it exposes:

```js
const d = window.__openp41ge_debug;

d.state; // AppState — live application state
d.workspace; // WorkspaceData — windows, tabs, grids, placements
d.plugins; // registered plugins
d.workspaceFile; // WorkspaceFileService

d.logs.getLogs({ eventType, since, limit }); // ring buffer, last 500 events
d.logs.getEvent(eventId); // one event in full
d.logs.clear();

d.graph.nodes(); // event graph nodes
d.graph.edges(); // edges: { id, from, when, to }
d.graph.hash(); // graph identity — changed unexpectedly? the graph was rebuilt
```

**Event-log-driven debugging** — this is the highest-leverage technique for "the click does nothing" bugs. Every routed event is recorded with its `matchedEdge`, `handlerResults` (including per-handler `duration` and `error`), `totalDuration`, `stateSnapshot`, and `sourceFile`:

```js
// 1. Clear, 2. perform the broken interaction, 3. read what actually happened.
window.__openp41ge_debug.logs.clear();
// ...click the thing...
window.__openp41ge_debug.logs.getLogs({ limit: 20 });
```

Read the result in this order — each answers a different question:

| Look at                  | Tells you                                                                                                   |
| ------------------------ | ----------------------------------------------------------------------------------------------------------- |
| Entry missing            | The event never fired — the problem is in the DOM/listener, not the logic                                   |
| `matchedEdge: null`      | The event fired but no graph edge matched — check the edge's `when` state predicate against `stateSnapshot` |
| `handlerResults[].error` | The handler ran and threw — you have your stack                                                             |
| `stateSnapshot`          | The state the handler actually saw, not the state you assumed                                               |
| `sourceFile`             | Where to go read                                                                                            |

**Structured logging** — use `createLogger("namespace")` from `openp41ge-logger` rather than bare `console.log`. Output is captured by the log buffer and viewable in `<openp41ge-log-viewer>`, and namespaced logs are filterable. Remove temporary loggers before committing.

**The error overlay** — a full-screen blocking overlay captures `window.onerror`, unhandled rejections, **every `console.error`**, and errors forwarded from the main process. Note the consequence: any `console.error` you add will halt the UI. Recent errors survive reload in `sessionStorage` under `openp41ge:captured-errors`.

**Start with DevTools already open** — `nx run openp41ge:dev:tools` (or `OPENP41GE_DEVTOOLS=1`) launches dev mode with DevTools attached, so you catch errors that happen during bootstrap rather than after it.

**Chrome DevTools tools** — with the app in dev mode, use `chrome_devtools_list_pages` → `chrome_devtools_select_page` → `chrome_devtools_evaluate` to run the snippets above without touching the GUI, and `chrome_devtools_screenshot` for visual bugs. For any layout, spacing, or theme issue, take a screenshot — do not reason about pixels from source.

**Isolate in a demo** — several packages have a demo app under `demos/`, and three have a matching `test-*` skill (file editor, git repository, tabs). Reproducing there removes Electron, IPC, and the platform from the picture in one step. If it reproduces in the demo, the bug is in the library; if not, it is in the integration.

**Main-process bugs** — the main process does **not** hot-reload. After changing `electron/*.ts` you must restart dev mode, or you will be debugging stale code. Main-process errors reach the renderer over the `openp41ge:error` IPC channel.

**Bisect with git** — if it worked before, find where it stopped: `git log --oneline`, then `git stash` your changes and check out earlier commits, or use `git bisect` with a scripted check. Cheaper than reading a large diff.

**Test models** — inject the `Test*` model implementations (see **Model-Based Dependency Injection**) to reproduce a bug deterministically with no filesystem, git, or OS involvement.

### Debugging Anti-Patterns

- **Guessing from source without reproducing.** The fastest-looking path is usually the slowest.
- **Changing several things at once.** You will not know which one worked, and one of the others may have introduced a new bug.
- **"Fixing" by adding a `setTimeout` or a null check.** That hides a race or an ordering bug that will resurface.
- **Fixing before the failing test exists.** You lose the proof that you fixed the reported bug.
- **Leaving debug scaffolding behind.** Stray `console.error` calls will trigger the blocking error overlay for the user.
- **Reporting "should be fixed."** Either you reproduced it, fixed it, and re-verified — or say plainly what you could not verify.
- **Silently working around a bug you don't understand.** Say what you don't understand and ask.

## Package Architecture

### Platform Package (`packages/openp41ge/`)

The Electron desktop app. Owns the layout data model (`src/layout/`), renderer Web Components (`src/renderer/components/`), controller system (`src/renderer/controllers/`), Electron main process (`electron/`), and IPC handlers (`electron/ipc-handlers/`).

Other packages (`openp41ge-editor-engine`, `openp41ge-terminal`, `openp41ge-agent-chat`, `openp41ge-tabs`, `openp41ge-uikit`) communicate with the platform exclusively through:

1. **DOM CustomEvents** — dispatched on the element or `document`, bubbles up.
2. **IPC** through the Electron preload bridge (`window.openp41ge.*`).
3. **Workspace state** — single source of truth. Other packages never mutate state directly; they dispatch commands through `window.openp41ge.workspace.dispatch()`.
4. **PaneController interface** — each app type implements mount/unmount/snapshot/restore and is registered in `app-registry.ts`.

Other packages are imported as npm dependencies and bundled at build time with Vite. **They never import from `packages/openp41ge/` directly.**

### Key Files in `packages/openp41ge/`

| File                                              | Purpose                                                      |
| ------------------------------------------------- | ------------------------------------------------------------ |
| `src/layout/types.ts`                             | All type definitions (Workspace, Window, Grid, Tab, Pane)    |
| `src/layout/operations.ts`                        | Pure tree operations, re-exported from `src/layout/index.ts` |
| `src/layout/grid-operations.ts`                   | Grid/column operations (resize, move, place)                 |
| `src/layout/tab-operations.ts`                    | Tab lifecycle operations                                     |
| `src/layout/window-operations.ts`                 | Window operations                                            |
| `src/layout/compute-layout.ts`                    | Layout computation + ghost preview generation                |
| `src/layout/serialization.ts`                     | Workspace (de)serialisation                                  |
| `src/renderer/app.ts`                             | Entry point, service wiring, bootstrap pipeline              |
| `src/renderer/bootstrap/steps/*.ts`               | One file per bootstrap step (see **Bootstrap Pipeline**)     |
| `src/renderer/debug-api.ts`                       | `window.__openp41ge_debug` — agent-facing inspection API     |
| `src/renderer/services/app-state.ts`              | Live application state                                       |
| `src/renderer/services/workspace-data.ts`         | Windows, tabs, grids, placements                             |
| `src/renderer/services/event-graph.ts`            | Event graph — nodes, edges, `when` state predicates          |
| `src/renderer/services/event-router.ts`           | Routes events → matching edge → terminal handlers            |
| `src/renderer/services/event-log-buffer.ts`       | Ring buffer of routed events (last 500)                      |
| `src/renderer/services/error-capture-service.ts`  | Global blocking error overlay                                |
| `src/renderer/services/dom-bridge.ts`             | DOM events → event router                                    |
| `src/renderer/handlers/*.ts`                      | Terminal event handlers (layout, tabs, focus state)          |
| `src/renderer/components/openp41ge-windowview.ts` | Top-level window view, renders the grid area                 |
| `src/renderer/apps/app-registry.ts`               | App type registration (type ID → controller factory)         |
| `src/renderer/controllers/types.ts`               | TabController interface and AppTypeRegistration              |
| `src/renderer/models/`                            | `Ipc*` / `Test*` model implementations                       |
| `src/renderer/global.d.ts`                        | `window.openp41ge.*` type declarations                       |
| `electron/preload.cjs`                            | contextBridge exposing `window.openp41ge.*` to renderer      |
| `electron/ipc-handlers/*.ts`                      | IPC handler registrations (one per domain)                   |
| `electron/openp41ge-application.ts`               | Main process — wires services, creates windows               |
| `src/styles/themes.css`                           | Dark and light theme CSS custom properties                   |

> This table drifts as the code moves. Treat it as a starting point, not as truth — confirm with `ls`/`grep` before relying on a path (see **Ask, Don't Assume**).

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

Drag and drop lives in the **`openp41ge-tabs`** package, not in the platform. It fires CustomEvents and has no Electron/IPC dependency; the platform wires it up via `src/renderer/openp41ge-tabs-adapter.ts` and `src/renderer/services/init-drag-system.ts`.

| Concern                     | File in `packages/openp41ge-tabs/src/`                          |
| --------------------------- | --------------------------------------------------------------- |
| Drag lifecycle coordination | `orchestrator.ts` (`DragOrchestrator`)                          |
| Drag source                 | `sources/tab-drag-source.ts`                                    |
| Drop targets                | `targets/tab-bar-drop-target.ts`, `targets/grid-drop-target.ts` |
| Ghost overlay               | `ghost-manager.ts`, `ghost-layout.ts`                           |
| Hit-testing / thresholds    | `boundary.ts`                                                   |
| Cursor feedback             | `cursor-manager.ts`                                             |

Three drop scenarios:

1. **Same-tab**: `movePaneInGrid` — swaps/moves within existing grid. No `resizeGrid`.
2. **Cross-tab (same window)**: `resizeGrid(cols+1)` + `movePaneToTab` — adds column, places pane.
3. **Cross-window**: Same as cross-tab but across windows.

Column boundary insert threshold: `INSERT_BOUNDARY_THRESHOLD = 0.15` (15% of column width, clamped to a third of the narrower adjacent cell) in `boundary.ts`. Drag state is module-level, so it survives DOM re-creation on tab switch — which also means **stale drag state is a real bug class**; check it first when something breaks only after a drag.

Use the **test-openp41ge-tabs-demo** skill for in-package drag testing and **test-cross-window-drag** for the cross-window ghost overlay.

### Event System

Interactions are routed, not hard-wired. `dom-bridge.ts` turns DOM events into router events; `EventRouter` traverses the **event graph** to find an edge matching the event type _and_ the edge's `when` state predicate, then calls the terminal handlers in `src/renderer/handlers/`. **Handlers are terminal — they never emit events, so there are no cycles.** Every routed event is recorded in the event log buffer with its matched edge, handler results, timings, and a state snapshot.

This is why event-log inspection is the fastest way to debug an unresponsive interaction — see **Debugging**.

### Bootstrap Pipeline

The renderer starts as an ordered list of single-responsibility steps in `src/renderer/app.ts` (implementations in `src/renderer/bootstrap/steps/`):

```
 1. ExposeTestModelsStep       — expose test models for test injection
 2. InitEventControllerStep    — initialise event graph + router
 3. RegisterAppTypesStep       — register app type controller factories
 4. InitServicesStep           — wire cross-service dependencies
 5. SubscribeStateUpdatesStep  — register render subscriber BEFORE any async step
 6. CheckProjectStep           — check for active project; show picker if needed
 7. RegisterEventListenersStep — document-level event listeners
 8. FetchInitialStateStep      — *** async: fetch + set state → UI RENDERS ***
 9. LoadConfigStep             — async: load config (cosmetic, after UI is visible)
10. RegisterShortcutsStep      — keyboard shortcuts
11. RegisterIpcListenersStep   — zoom + confirm IPC listeners
12. StartQuoteControllerStep   — quote rotation
13. SignalReadyStep            — signal readiness to main process
```

**Order matters.** The render subscriber must be registered before any async step, or the first state set will not paint. If the app fails before step 8 nothing renders — but the error overlay still appears, because `installErrorCapture()` runs before the pipeline starts. A blank window with _no_ overlay therefore points at the bootstrap itself.

### Key Design Decisions

- **Vanilla Web Components** — no React/JSX. Other packages use Lit for convenience.
- **Module-level drag state** — survives grid DOM destruction/re-creation on tab switch.
- **Cleanup ordering** — Always snapshot drag-intent flags into local variables BEFORE `clearDragState()`.
- **Empty grid handling** — Tab with no panes: don't add `+1` column, fill column 0.
- **No `resizeGrid` for same-tab** — moving within same tab just rearranges, no column count change.

## Build System (Nx)

The monorepo uses **Nx v23** as its build orchestrator. Key files:

| File                                              | Purpose                                              |
| ------------------------------------------------- | ---------------------------------------------------- |
| `nx.json`                                         | Target defaults, caching configuration               |
| `project.json` (root)                             | Workspace-level targets (build, test, quality, etc.) |
| `packages/*/project.json`, `demos/*/project.json` | Per-package targets                                  |

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

Tests live in a `test/` directory per package, split by level:

```
packages/<pkg>/test/
├── unit/                # Pure unit tests — single class/module in isolation
└── integration/         # Cross-system tests — boundaries between components
```

Currently only `packages/openp41ge/` has both levels; the other tested packages have `unit/` only. Not every package has tests — check before assuming coverage exists.

### Running Tests

```bash
nx run-many -t test                       # All vitest tests
nx run openp41ge:test                     # Tests for a specific package
nx run openp41ge:test:unit                # Just that package's unit tests
nx run openp41ge:test:integration         # Just its integration tests
nx run openp41ge:test --skip-nx-cache     # Force re-run (no cache)
```

`test` targets are inferred by the Nx Vite plugin from each package's vitest config, so they can exist without appearing in `project.json`. Use `nx show project <name>` to see a project's real target list.

### Test-First Approach

Tests are written **first**, before implementation code:

**For new behaviours**: Write the test first (unit, integration, or contract), implement the feature, verify it passes.

**For bug fixes**: Write a regression test that reproduces the bug, confirm it fails, invert the expectation to expect the correct behaviour, fix the bug, keep the test as a permanent regression guard.

### When to Use Each Test Level

| Behaviour                                                              | Test level  |
| ---------------------------------------------------------------------- | ----------- |
| Layout operations, tab lifecycle, drag calculations, event routing     | Integration |
| IPC method shapes, TabController interface, event contracts            | Integration |
| Pure parsing/formatting, data model invariants, layout tree operations | Unit        |

## Package-Level Agent Guides

Individual packages may contain a `docs/AGENT-GUIDE.md` file with implementation-specific documentation for AI agents — component APIs, data models, event contracts, and integration patterns for that package. **Check for one in any package you are working with** before reading source code or making changes. At the time of writing no package has one, so expect to fall back to the package's `README.md`, its demo app, and its tests.

## Keeping This Guide Honest

This file is a map, not the territory. Paths, counts, and commands drift as the code moves.

- If you find something here that contradicts the code, **the code wins** — fix this file in the same change, and tell the user what was stale.
- Do not delete guidance you merely failed to verify. Correct what you have checked; flag what you have not.
- When you add a new package, target, skill, or architectural seam, update the relevant section here.
