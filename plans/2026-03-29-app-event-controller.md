2026-03-29

# App Event Controller — Graph-Driven Event System with Plugin Architecture

## Goal

Build a central event routing system for the entire application where:

1. **Event flow is defined in a JSON graph** — nodes are handlers, edges are routes with state predicates
2. **DOM events are intercepted** and routed through the graph — no ad-hoc listeners in components
3. **Handlers are async and terminal** — they update state and stop. No handler emits another event.
4. **UI components read state and render** — no embedded state logic or self-managed focus tracking
5. **Core system** (router, graph, AppState, workspace data, layout, focus) is always present
6. **Plugin modules** (explorer, git repo, file editor, etc.) register handlers + edges + UI through a plugin API
7. **Workspace replaces Projects** — repos, worktrees, and layout data live in a core shared data layer, not in a tab
8. **Everything is logged** — every event dispatch is recorded in a retrievable ring buffer
9. **Agent-editable** — the graph JSON file is the single source of truth for event flow

## System Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                        CORE SYSTEM                                │
│                                                                   │
│  EventRouter + Graph + DOMBridge + AppState + LogBuffer          │
│  WorkspaceData (repos, worktrees, persisted layout)              │
│  Layout management (sidebar widths, tab grid, window bounds)     │
│  Focus/indicator state                                           │
│  Tab lifecycle (open, close, switch)                             │
│  Plugin registry                                                 │
│                                                                   │
│  Always present. No registration needed.                         │
└──────────────────────────────────────────────────────────────────┘
                              │
                              │ routes events
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│                     PLUGIN MODULES                                │
│                                                                   │
│  Register: handler nodes + graph edges + UI component factory     │
│  Read/write: workspace data (repos, worktrees) via events         │
│  Never read another plugin's data directly                        │
│                                                                   │
│  ┌────────────┐  ┌──────────┐  ┌──────────┐  ┌───────────────┐  │
│  │  Explorer  │  │Git Repo │  │ File     │  │  Terminal     │  │
│  │  (file     │  │(branch, │  │ Editor   │  │  (future)     │  │
│  │   tree)    │  │ commit) │  │ (code)   │  │               │  │
│  └────────────┘  └──────────┘  └──────────┘  └───────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

### Plugin Registration API

```typescript
interface PluginRegistration {
  id: string;                           // unique, e.g. "openp41ge-explorer"
  nodes: string[];                      // handler IDs this plugin provides
  edges: {                              // graph edges this plugin needs
    from: string;
    when?: Record<string, any>;
    to: string[];
  }[];
  component: () => HTMLElement;         // factory for the UI
}
```

Plugins register at bootstrap. The core graph is extended with their nodes and edges:

```typescript
// explorer-plugin.ts
core.registerPlugin({
  id: "openp41ge-explorer",
  nodes: ["explorer/open-file", "explorer/refresh"],
  edges: [
    { from: "file-clicked", to: ["explorer/open-file"] },
    { from: "workspace-changed", to: ["explorer/refresh"] },
  ],
  component: () => document.createElement("openp41ge-repo-tree"),
});
```

Built-in plugins (explorer, git repo) ship with the app but register the same way. The plugin API is the same for internal and external plugins.

### Workspace Data (Replaces Projects)

Workspace is a core data layer, NOT a tab. It holds shared data that multiple plugins need:

```typescript
class WorkspaceData {
  repos: RepoInfo[];           // repository list (was in project tab)
  worktrees: WorktreeInfo[];   // worktree list
  activeRepoId: string | null;
  // Layout data is stored alongside workspace data
  layout: {
    sidebarWidths: Record<string, number>;
    tabGrid: TabPlacement[];
  };
}
```

**Why workspace instead of a Projects tab:**
- Explorer and Git repo both need repo/worktree data
- If that data lives in a "Projects" tab, both plugins depend on that tab — violating isolation
- With workspace in the core, plugins read from a shared data layer, not from each other
- The workspace picker/switcher becomes a system-level UI (top-bar or shortcut), not a tab

The workspace is always available regardless of which plugins are active. Plugins read from it and write to it through events (`workspace-changed`, `workspace/repo-opened`, etc.).

### Core vs Plugin Distinction

| Component | Core | Plugin | Notes |
|-----------|------|--------|-------|
| EventRouter | ✓ | | Always present |
| EventGraph | ✓ | | Always present |
| AppState | ✓ | | Focus, layout, window state |
| WorkspaceData | ✓ | | Repos, worktrees, layout |
| DOMBridge | ✓ | | Event interception |
| LogBuffer | ✓ | | Debug logging |
| Layout management | ✓ | | Sidebar widths, grid |
| Focus/indicator | ✓ | | Window focus, sidebar indicator |
| Tab lifecycle | ✓ | | Open, close, switch tabs |
| Plugin registry | ✓ | | Registration API |
| Explorer | | ✓ | File tree + file editor |
| Git Repo | | ✓ | Branch/commit browser |
| File Editor | | ✓ | Code editing |
| Terminal | | ✓ | Future |
| Agent Chat | | ✓ | Future |

## Architecture

```
DOM events (mousedown, focus, blur, keydown)
    │  intercepted by DOMBridge, stopImmediatePropagation()
    ▼
router.emit("sidebar-click-right", { x, y })
    │
    ▼
EventRouter traverses graph (core edges + plugin edges):
    edges where from="sidebar-click-right"
    → evaluates each edge's when predicate against AppState
    → picks first match
    → dispatches to to[] handlers
    │
    ▼
Handlers (async, terminal) update state:
    focus/set-focused        → appState.windowFocused = true
    focus/set-sidebar-right  → appState.focusedSide = "right"
    [handler returns. No more events. No cycles.]
    │
    ▼
Lit re-renders from AppState → blue indicator
```

## Graph Format

The base graph is `data/event-routing-graph.json` (core edges). Plugin edges are added at bootstrap via `registerPlugin()` and merged into the runtime graph.

Base graph (core only):

```json
{
  "version": 1,
  "nodes": [
    { "id": "focus/set-focused" },
    { "id": "focus/set-blurred" },
    { "id": "focus/set-sidebar-right" },
    { "id": "focus/set-sidebar-left" },
    { "id": "focus/clear-sidebar" },
    { "id": "keyboard/suppress" },
    { "id": "keyboard/clear-suppress" },
    { "id": "layout/set-sidebar-width" },
    { "id": "workspace/switch-repo" },
    { "id": "workspace/open-worktree" }
  ],
  "edges": [
    {
      "id": "e001",
      "from": "window-focus",
      "when": { "windowFocused": false },
      "to": ["focus/set-focused"]
    },
    {
      "id": "e002",
      "from": "window-blur",
      "when": { "windowFocused": true },
      "to": ["focus/set-blurred"]
    },
    {
      "id": "e003",
      "from": "sidebar-click-right",
      "when": { "windowFocused": false },
      "to": ["focus/set-focused", "focus/set-sidebar-right"]
    },
    {
      "id": "e004",
      "from": "sidebar-click-right",
      "when": { "windowFocused": true, "focusedSide": "left" },
      "to": ["focus/set-sidebar-right"]
    },
    {
      "id": "e005",
      "from": "grid-click",
      "when": { "focusedSide": "right" },
      "to": ["focus/clear-sidebar"]
    },
    {
      "id": "e006",
      "from": "grid-click",
      "when": { "focusedSide": "left" },
      "to": ["focus/clear-sidebar"]
    }
  ]
}
```

The agent edits this file directly. Plugin edges are added in code during bootstrap.

## AppState

Single reactive state object for the core system:

```typescript
class AppState {
  // Focus
  windowFocused: boolean = false;
  focusedSide: "left" | "right" | null = null;

  // Layout
  sidebarWidths: Record<string, number> = { left: 300, right: 350 };

  // Workspace
  activeRepoId: string | null = null;

  private _observers = new Set<() => void>();
  observe(cb: () => void): () => void;
  notify(): void;
}
```

## Event Log

Ring buffer (500 entries) recording every router dispatch:

```typescript
interface LogEntry {
  eventId: string;
  timestamp: number;
  eventType: string;
  payload: any;
  matchedEdge: { id: string; from: string; when: any; to: string[] };
  handlerResults: { id: string; duration: number; error?: string }[];
  totalDuration: number;
  stateSnapshot: Partial<AppState>;
  sourceFile: string;
}
```

## Debug API

```typescript
window.__openp41ge_debug = {
  state: AppState,
  workspace: WorkspaceData,
  logs: {
    getLogs(opts?: { eventType?, since?, limit? }): LogEntry[];
    clear(): void;
  },
  graph: {
    hash(): string;
    nodes(): GraphNode[];
    edges(): GraphEdge[];
  },
  plugins: PluginRegistration[];  // registered plugins
};
```

## Files

### New Files (Core)

| File | Purpose |
|------|---------|
| `src/renderer/services/event-router.ts` | Router — loads graph, traverses edges, dispatches handlers |
| `src/renderer/services/event-graph.ts` | Graph store — load base JSON, accept plugin extensions, validate |
| `src/renderer/services/app-state.ts` | Reactive AppState with observers |
| `src/renderer/services/workspace-data.ts` | Workspace shared data (repos, worktrees, layout) |
| `src/renderer/services/plugin-registry.ts` | Plugin registration API |
| `src/renderer/services/dom-bridge.ts` | DOM event interception |
| `src/renderer/services/event-log-buffer.ts` | Ring buffer (500 entries) |
| `src/renderer/debug-api.ts` | `window.__openp41ge_debug` wiring |
| `src/renderer/handlers/focus-state.handlers.ts` | Core focus-state handlers |
| `src/renderer/handlers/workspace.handlers.ts` | Workspace event handlers |
| `src/renderer/bootstrap/steps/init-event-controller.step.ts` | Bootstrap step |
| `data/event-routing-graph.json` | Initial core routing graph |

### Modified Files

| File | Change |
|------|--------|
| `src/renderer/app.ts` | Register init-event-controller step |
| `src/renderer/components/openp41ge-sidebar.ts` | Remove ~150 lines focus/DOM logic. Observe AppState. |
| `src/renderer/services/keyboard-manager.ts` | Remove suppressUntil — handled by graph |
| `src/renderer/global.d.ts` | Add debug API types |

## Phase 1

Build core system + migrate sidebar focus. No plugin migration yet.

1. EventGraph — load base JSON, validate, support plugin extension
2. EventRouter — traverse graph, match predicates, dispatch handlers
3. AppState — reactive, observable
4. WorkspaceData — shared data structure (repos, worktrees, layout)
5. PluginRegistry — registration API (used by built-in plugins later)
6. DOMBridge — intercept focus/blur/mousedown
7. Focus-state handlers (6 handlers)
8. EventLogBuffer — ring buffer
9. Debug API — state + workspace + logs + graph query
10. Initial graph JSON — core edges for focus/layout
11. Simplify sidebar — remove static props, DOM listeners, observe AppState
12. KeyboardManager cleanup — remove suppressUntil
13. Remove all debug console.log statements
14. Unit tests

## Phase 2

- Migrate existing explorer/git tabs to use PluginRegistry
- Workspace data integration (repos, worktrees → workspace, not project tab)
- Workspace picker UI (replaces Projects tab)

## Phase 3

- Grid/layout state through graph
- Keyboard shortcuts through graph
- Tab operations through graph

## Testing Strategy

- **Unit**: EventGraph — load JSON, validate, plugin extension
- **Unit**: EventRouter — edge matching, predicate evaluation, handler dispatch
- **Unit**: AppState — observer notification, unsubscribe
- **Unit**: WorkspaceData — CRUD repos/worktrees
- **Unit**: PluginRegistry — register, lookup, validate
- **Unit**: EventLogBuffer — ring buffer wrapping
- **Integration**: DOMBridge + Router + graph + handlers → simulate event → verify state

## Completion Criteria (Phase 1)

- [ ] EventGraph loads base JSON, validates, accepts plugin extensions
- [ ] EventRouter traverses edges, evaluates predicates, dispatches handlers
- [ ] DOMBridge intercepts mousedown/focus/blur and routes correct events
- [ ] Graph routes handle: blur → refocus → click same sidebar → blue indicator
- [ ] PluginRegistry accepts registration with nodes + edges + component factory
- [ ] Sidebar reads from AppState, no static focus properties, no DOM listeners
- [ ] KeyboardManager suppressUntil removed
- [ ] `window.__openp41ge_debug` exposes state, workspace, logs, graph, plugins
- [ ] All debug console.log statements removed
- [ ] `data/event-routing-graph.json` defines initial core routes
- [ ] Unit tests pass
- [ ] `nx quality` passes
