# Openp41ge — Build Plan

## What Openp41ge Is

**Openp41ge is two things:**

1. **A desktop pane manager** (Electron) — a window manager where you organise running processes (panes) via tabs, splits, grids, overlays, and multi-window drag-and-drop.

2. **A CLI tool** (standalone Bun executable, also bundled with the desktop app) — a terminal-based companion that can be used anywhere, even on a server.

The pane system is the core of the desktop app. App types (terminal, file explorer, table, notes, video player) are built as separate packages that the desktop imports and bundles.

---

## Project Structure

```
openp41ge/
├── packages/
│   ├── openp41ge/            # Electron desktop app — pane system lives here
│   │   ├── src/
│   │   │   ├── layout/   # Pane layout data model, layout engine, DnD
│   │   │   ├── panes/    # Pane registry, lifecycle, process management
│   │   │   ├── renderer/ # React UI: tabs, splits, overlays, windows
│   │   │   └── main.ts   # Electron main process
│   │   └── package.json
│   │
│   ├── openp41ge-app-terminal/  # Terminal emulator app type (xterm.js + shell)
│   ├── openp41ge-app-explorer/  # File explorer app type
│   ├── openp41ge-app-table/     # Dynamic interactive table app type (Notion-like)
│   ├── openp41ge-app-notes/     # Markdown notes app type
│   ├── openp41ge-app-video/     # Video streaming app type (YouTube, etc.)
│   │
│   ├── openp41ge-cli/        # Standalone CLI tool (Bun executable)
│   │   ├── src/
│   │   │   ├── commands/ # term, ai, run, workspace, help
│   │   │   └── index.ts
│   │   └── build.ts      # Bun build script → single binary
│   │
│   └── openp41ge-shared/     # Shared types, config schema, utilities
│       └── src/
│           ├── types.ts
│           ├── config.ts # Config loader, schema
│           └── ai/       # LLM client, tool definitions
│
├── openp41ge.config.ts       # Project-level config (AI models, tools, workflows)
├── package.json          # Monorepo root (pnpm workspaces)
└── README.md
```

---

## Phase 0 — Pane Layout Data Model (Desktop only)

The layout system is the foundation of the desktop app. It lives entirely in `packages/desktop/src/layout/`.

### 0.1 Layout Tree

```
Workspace
 ├── Window (OS-level window, monitor 1)
 │    ├── tabBar: [Grid1, Grid2, Grid3]
 │    ├── activeTab: Grid2
 │    ├── grids:
 │    │    ├── Grid1 (3×3)
 │    │    │    ├── Pane (terminal)
 │    │    │    ├── Pane (file-explorer)
 │    │    │    └── Pane (notes)
 │    │    ├── Grid2 (2×2)
 │    │    │    ├── Pane (table)
 │    │    │    └── Pane (video PiP)
 │    │    └── Grid3 (1×2)
 │    │         ├── Pane (terminal)
 │    │         └── Pane (terminal)
 │    └── overlays: []
 │         └── Pane (always-on-top)
 └── Window (OS-level window, monitor 2)
      ├── tabBar: [GridA]
      ├── activeTab: GridA
      └── grids:
           └── GridA (1×1)
                └── Pane
```

### 0.2 Node Types

| Type        | Children                                                          | Description                                                                                                                                                    |
| ----------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Workspace` | `Window[]`                                                        | The root. Owns all windows.                                                                                                                                    |
| `Window`    | `{ tabBar: Tab[], grids: Map<TabId, Grid>, overlays: Overlay[] }` | An OS-level window. Has a tab bar across the top. Each tab selects a different Grid workspace with its own set of panes. Overlays float above the active grid. |
| `Grid`      | `Pane[][]` (rows × cols)                                          | Arranges panes in a regular grid of cells. Cells can be resized (drag row/column dividers). Cells can be merged (a pane spanning multiple cells).              |
| `Overlay`   | `Pane`                                                            | Renders a pane floating above the window. Configurable position, size, opacity, z-order. Not tied to any specific tab — persists across tab switches.          |
| `Pane`      | 0 (leaf)                                                          | A leaf node. Contains a running process and an app type renderer.                                                                                              |

Key simplification: **no Split, no TabGroup**. Grid is the only container. The tab bar lives at the Window level, switching between entirely different Grid configurations. A 1×2 grid replaces a horizontal split. A 2×1 grid replaces a vertical split. A 2×2 grid is a proper grid. You don't nest containers — you just switch tabs to get a different layout.

### 0.3 Tree Operations (Pure Functions)

```ts
type LayoutTree = Workspace | Window | Grid | Overlay | Pane;

// Tab management
function createTab(tree: Workspace, windowId: string, name: string, grid: Grid): Workspace;
function removeTab(tree: Workspace, windowId: string, tabId: string): Workspace;
function switchTab(tree: Workspace, windowId: string, tabId: string): Workspace;
function reorderTabs(tree: Workspace, windowId: string, fromIdx: number, toIdx: number): Workspace;

// Pane management within a grid
function addPaneToGrid(
  tree: Workspace,
  windowId: string,
  tabId: string,
  pane: Pane,
  row: number,
  col: number,
): Workspace;
function removePaneFromGrid(
  tree: Workspace,
  windowId: string,
  tabId: string,
  paneId: string,
): Workspace;
function movePaneInGrid(
  tree: Workspace,
  windowId: string,
  tabId: string,
  paneId: string,
  newRow: number,
  newCol: number,
): Workspace;
function movePaneToTab(
  tree: Workspace,
  windowId: string,
  paneId: string,
  targetTabId: string,
  row: number,
  col: number,
): Workspace;
function movePaneToWindow(
  tree: Workspace,
  paneId: string,
  targetWindowId: string,
  tabId: string,
  row: number,
  col: number,
): Workspace;

// Grid sizing
function resizeGrid(
  tree: Workspace,
  windowId: string,
  tabId: string,
  rows: number,
  cols: number,
): Workspace;
function resizeCell(
  tree: Workspace,
  windowId: string,
  tabId: string,
  row: number,
  col: number,
  widthRatio: number,
  heightRatio: number,
): Workspace;
function mergeCells(
  tree: Workspace,
  windowId: string,
  tabId: string,
  fromRow: number,
  fromCol: number,
  toRow: number,
  toCol: number,
): Workspace;

// Overlay management
function createOverlay(tree: Workspace, windowId: string, pane: Pane, opts: OverlayOpts): Workspace;
function removeOverlay(tree: Workspace, windowId: string, paneId: string): Workspace;
function moveOverlay(
  tree: Workspace,
  windowId: string,
  paneId: string,
  position: { x: number; y: number },
): Workspace;

// Window management
function createWindow(tree: Workspace, bounds?: Bounds): Workspace;
function closeWindow(tree: Workspace, windowId: string): Workspace;
function moveWindow(tree: Workspace, windowId: string, bounds: Bounds, monitor?: number): Workspace;
function detachPaneToWindow(
  tree: Workspace,
  windowId: string,
  paneId: string,
  bounds?: Bounds,
): Workspace;

// Serialization
function serialize(tree: Workspace): JSON;
function deserialize(json: JSON): Workspace;
```

### 0.4 Pane States (Derived from position in tree)

A pane's visual/behavioural state is determined entirely by where it sits in the tree:

- **In a Grid cell** — occupies a cell in a regular grid. Visible when its tab is active.
- **In a merged cell** — spans multiple grid cells. Still a single pane.
- **As an Overlay** — floating over the window, persists across tab switches.
- **In its own Window** — detached, OS-level window with its own tabs and grids.
- **Maximized** — fills the window (temporary state, can restore).

### Deliverable for Phase 0

Typed schema (Zod) in `packages/desktop/src/layout/types.ts`. Pure tree operations. JSON serialization/deserialization. Unit tested.

---

## Phase 1 — Layout Computation Engine

Take the layout tree + window viewport bounds → produce absolute pixel rects for every pane.

### 1.1 `computeLayout(window, viewportBounds) → Map<paneId, Rect>`

For the active tab in the window:

- **Grid**: divide window bounds into rows/cols based on grid dimensions and stored ratios. Each cell's rect goes to its pane.
- **Overlays**: computed on top of the grid. Each overlay gets a rect based on its configured position/size within the window.
- **Pane** (in a cell): leaf — return the cell's allocated rect.
- **Pane** (as overlay): leaf — return the overlay's configured rect.

### 1.2 Resize Dividers

Grid row and column dividers are stored as ratios (0..1 per boundary). Dragging a divider updates the ratio. Minimum pane size enforced as a constraint. Row/column dividers can be dragged to resize the adjacent cells.

### 1.3 Test Renderer

A simple HTML canvas or div-based renderer that draws coloured rectangles where panes would be. No real content. Used to verify layout calculations visually.

### Deliverable for Phase 1

`computeLayout()` function. Visible in Electron with placeholder coloured panes that resize when dividers are dragged.

---

## Phase 2 — Interactive Drag & Drop

### 2.1 Drag Sources

**Two distinct drag types:** dragging a **tab** vs dragging a **pane**.

#### Tab Drag

A tab represents an entire grid workspace (all its panes).

| Source     | What happens                                                                                                      |
| ---------- | ----------------------------------------------------------------------------------------------------------------- |
| Window tab | Drag the tab (with its entire grid and all panes) to reorder, move to another window, or detach to its own window |

#### Pane Drag

A pane is a single leaf node inside a grid cell.

| Source                   | What happens                                                                               |
| ------------------------ | ------------------------------------------------------------------------------------------ |
| Pane body (in grid cell) | Drag to another grid cell, another tab, another window, a new grid space, or as an overlay |
| Pane body (as overlay)   | Reposition the overlay, or drag it into a grid cell to dock back into a grid               |
| Grid row/column divider  | Resize adjacent cells                                                                      |
| Overlay pane title bar   | Reposition the overlay                                                                     |

### 2.2 Drop Targets

#### Tab Drop Rules

| Drop on                           | Result                                                                                  |
| --------------------------------- | --------------------------------------------------------------------------------------- |
| Window tab bar (same window)      | Reorder tabs by dropping between existing tabs                                          |
| Window tab bar (different window) | Move the entire tab+grid to the target window's tab bar                                 |
| Desktop / outside                 | **Detach**: create new OS window with this tab's grid                                   |
| _Another tab_                     | **Not allowed** — a tab cannot be dropped into another tab. Tabs are peers, not nested. |

#### Pane Drop Rules

| Drop on                        | Result                                                                                    |
| ------------------------------ | ----------------------------------------------------------------------------------------- |
| Grid cell (same tab)           | Place pane in that cell. If cell is occupied, swap or shift existing pane.                |
| Grid cell (different tab)      | Move pane to that grid. The target tab becomes active so you can see it.                  |
| Window tab bar                 | **Create new tab**: add a new tab to this window with a 1×1 grid containing the pane.     |
| Empty space in window          | **New grid space**: expand the active grid to fit the pane, or create a new tab with it.  |
| An existing overlay            | **Dock into overlay**: replace the overlay's pane with this one, or add as another layer. |
| Another OS window (grid zone)  | Move pane to that window's active tab grid cell.                                          |
| Another OS window (empty zone) | Add to that window's tab bar as a new tab (1×1 grid) or place into its active grid.       |
| Desktop / outside              | **New window**: create new OS window with a tab containing a 1×1 grid with this pane.     |

### 2.3 Drop Preview

While dragging, the system shows a visual preview of the resulting layout before the user drops.

### 2.4 Undo

Every layout mutation is recorded. `Cmd+Z` undoes the last action.

### Deliverable for Phase 2

Full single-window drag-and-drop: drag panes between grid cells (same tab), between tabs (different grids), resize grid rows/columns, create/manage overlays. Multi-window drag comes in Phase 3.

---

## Phase 3 — Multi-Window & Multi-Monitor

### 3.1 Detach to New Window

- Drag a pane (or an entire tab's grid) out of the window → spawn new Electron `BrowserWindow`
- New window gets its own tab bar with a single tab containing the dragged pane in a 1×1 grid
- The Workspace now has two Window roots, each with its own tab bar and grids

### 3.2 Merge Windows

- Drag a pane from one window into a grid cell of another window → pane moves to that window's active tab grid
- Drag a whole window tab into another window → the tab (with its grid and all panes) is added to the target window's tab bar
- Empty source window (no tabs left) auto-closes

### 3.3 Window Properties

- Bounds, monitor assignment stored in the layout tree
- Window state: normal, minimised, maximised, fullscreen

### 3.4 Multi-Monitor

- Windows remember their monitor
- Drag between monitors works
- Workspace snapshot captures all windows across all monitors

### Deliverable for Phase 3

Multiple Electron windows sharing a single layout tree. Full cross-window drag-and-drop.

---

## Phase 4 — Overlays & Picture-in-Picture

### 4.1 Overlay Properties

- Position: `top-left | top-right | bottom-left | bottom-right | center | custom(x, y)`
- Size: absolute `(w, h)` or relative `(% of window)`
- Opacity: 0..1
- Persists across tab switches (an overlay stays visible regardless of which grid tab is active)
- Z-order management when multiple overlays overlap
- Always-on-top toggle (within window or system-wide)

### 4.2 Creating Overlays

- Context menu on a pane → "Pin as overlay"
- Modifier key + drag from grid cell → drop as overlay instead of moving within grid
- Programmatic (e.g., video pane auto-creates PiP)

### 4.3 Overlay Interactions

- Drag overlay's title bar to reposition
- Drag overlay edge to resize
- Double-click overlay header → dock back into a grid cell
- Overlay can be collapsed to a small icon / expanded

### Deliverable for Phase 4

Floating PiP panes that stay on top. Repositionable, resizable, collapsible, dockable.

---

## Phase 5 — App Types (Built as Separate Packages)

Each app type is its own npm package in the monorepo. The desktop app imports them at build time and registers them in the pane registry.

### 5.1 App Type Interface

```ts
interface AppType {
  id: string; // e.g. "terminal", "explorer"
  name: string; // Display name
  icon?: string; // Icon path or component
  defaultConfig?: Record<string, any>;
  createProcess(config: AppConfig): ChildProcess | null; // optional process
  renderer: React.ComponentType<PaneProps>; // React component
}
```

The desktop app's pane registry maps `appType` strings to these packages:

```ts
registerAppType(terminalApp);
registerAppType(explorerApp);
registerAppType(tableApp);
registerAppType(notesApp);
registerAppType(videoApp);
```

### 5.2 Terminal (`packages/app-terminal`)

- Embed **xterm.js** in the pane
- Spawn a shell (bash/zsh) as child process
- Pipe stdin/stdout/stderr
- Title = cwd / shell prompt
- Copy/paste, search, configurable theme

### 5.3 File Explorer (`packages/app-explorer`)

- Tree view of the file system (sidebar-style or full pane)
- File preview: click a file → open it in a new pane or show inline
- Directory navigation with breadcrumbs
- Drag files from explorer into other panes (e.g., drop into terminal → inserts path)
- File operations: create, rename, delete, copy, paste

### 5.4 Dynamic Interactive Table (`packages/app-table`)

- Notion-database-style table
- Columns with types (text, number, date, select, status, checkbox, URL)
- Inline editing (click a cell → edit)
- Sort, filter, group by column
- Drag to reorder rows and columns
- Linked records (a cell can reference rows in another table)
- Markdown support in text cells
- Local storage / file-based persistence (JSON or SQLite)

### 5.5 Markdown Notes (`packages/app-notes`)

- Markdown editor + preview (split view or toggle)
- File tree for notes (linked to a notes directory)
- Wiki-style links `[[note-name]]` between notes
- Tags, search
- Auto-save
- Embeds: images, code blocks, LaTeX

### 5.6 Video Streaming (`packages/app-video`)

- YouTube and other platform support (via yt-dlp or similar)
- Search/browse within the pane
- Playback controls (play, pause, seek, speed)
- Picture-in-Picture button → spawns an Overlay pane
- Playlist support
- Download option (via yt-dlp)

### Deliverable for Phase 5

All five app type packages built and importable by the desktop app. Each can be instantiated as a pane.

---

## Phase 6 — CLI (Standalone Bun Executable)

### 6.1 CLI Structure

```
openp41ge                  → launch desktop app
openp41ge term             → interactive terminal (TUI mode, no desktop)
openp41ge ai               → AI chat in terminal (stdin/stdout)
openp41ge run <workflow>   → execute a workflow from config, output result
openp41ge workspace        → workspace management (list, open, save)
openp41ge config           → validate / edit config
openp41ge plugin           → install/list/remove plugins
openp41ge help             → help text
```

### 6.2 Build with Bun

- The CLI is built with `bun build --compile` → single binary executable
- It's also bundled with the desktop app (for `openp41ge term` within a terminal pane)
- Shared logic (config loading, AI client, tool execution) lives in `packages/shared/`

### 6.3 `openp41ge term` — Terminal in Any Terminal

- Uses xterm.js in a headless/browserless context? Or native TTY?
- For standalone mode, use Node/Bun's built-in TTY I/O with a simple readline loop
- For the desktop terminal pane, use xterm.js with the same backend

### 6.4 `openp41ge ai` — AI Chat in TUI

- Full TUI conversation loop using a library like Textual, Ink, or simple readline
- Supports the same config as the desktop app
- Multi-turn conversation, streaming responses
- Pipeable: `openp41ge ai "explain this code" | pbcopy`

### 6.5 `openp41ge run` — Headless Workflow Execution

- Loads config, executes workflow steps
- Loop: prompt → LLM → parse tool call → execute → feed back
- Tools include shell commands and intrinsic operations
- Output to stdout or file

### Deliverable for Phase 6

A standalone `openp41ge` binary (Bun-compiled) that can be used anywhere. The same binary also handles desktop app launching.

---

## Phase 7 — Polish & Ecosystem

- Session persistence (save/restore layout)
- Theming (dark/light, custom CSS)
- Keybindings (configurable)
- Plugin system for third-party app types
- Performance (lazy loading, process limits)
- Testing and documentation

---

## Milestones

| #   | Milestone             | Deliverables                                                                                            |
| --- | --------------------- | ------------------------------------------------------------------------------------------------------- |
| M1  | **Layout data model** | Types, Zod schemas, pure tree operations, serialization (Phase 0)                                       |
| M2  | **Layout engine**     | `computeLayout()`, resize handles, test renderer with coloured boxes (Phase 1)                          |
| M3  | **Interactive DnD**   | Single-window drag & drop — grid cells, tabs between grids, resize dividers, overlay creation (Phase 2) |
| M4  | **Multi-window**      | Detach/attach windows, drag between windows, multi-monitor (Phase 3)                                    |
| M5  | **Overlays & PiP**    | Floating panes, reposition, resize, opacity, dock/undock (Phase 4)                                      |
| M6  | **App types**         | Terminal, file explorer, table, notes, video player (Phase 5)                                           |
| M7  | **CLI**               | Standalone Bun binary, `openp41ge term`, `openp41ge ai`, `openp41ge run` (Phase 6)                      |
| M8  | **Polish**            | Persistence, themes, keybindings, plugins, docs (Phase 7)                                               |

---

## Design Principles

1. **Layout tree is the single source of truth** — all state is in the tree. The UI is a pure render of it.
2. **Tree operations are pure functions** — `(tree, action) => newTree`. Undo is free.
3. **Pane is opaque to the layout system** — the layout only cares about rects. Content is a plugin concern.
4. **App types are separate packages** — independently developed, imported and bundled by the desktop app.
5. **CLI is standalone** — a Bun-compiled binary that shares config and AI logic with the desktop app.
