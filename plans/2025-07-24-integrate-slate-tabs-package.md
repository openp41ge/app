2025-07-24

# Goal

Replace the current openp41ge grid and tab system (`Openp41geGrid`, `Openp41geCellTabbar`, `Openp41geTabContent`, and their supporting drag/drop/ghost infrastructure) with the `openp41ge-tabs` package (`<tab-grid>`, `<tab-bar>`, `<tab-view>`, `DragOrchestrator`, `GhostManager`, boundary functions). Remove all tests whose functionality is covered by the openp41ge-tabs package's own tests, keeping only integration tests in the openp41ge package for where the tabs features interact with openp41ge-specific code (e.g., tab navigation history events, command dispatch wiring, file-open-handler integration).

# Rationale

The `openp41ge-tabs` package provides a self-contained, well-tested drag-and-drop tab system with cleaner separation of concerns. The current openp41ge package has duplicative implementations of grid rendering, tab bar rendering, boundary detection, drag orchestration, ghost overlay management, and cursor management — all of which are now provided by `openp41ge-tabs`. By migrating to `openp41ge-tabs`, we eliminate redundancy, reduce the openp41ge package's maintenance surface, and inherit the openp41ge-tabs test suite.

# Approach

## Phase 1: Wire up openp41ge-tabs dependency

1. Add `openp41ge-tabs` as a dependency of the `openp41ge` package in `packages/openp41ge/package.json`.
2. Import and re-export openp41ge-tabs components (`TabGrid`, `TabBar`, `TabView`) and services (`DragOrchestrator`, `GhostManager`, `TabDragSource`, `TabBarDropTarget`, `GridDropTarget`, boundary functions) from `packages/openp41ge/src/renderer/openp41ge-tabs-adapter.ts` — a single adapter module that the rest of openp41ge imports from.
3. This adapter module becomes the sole bridge between openp41ge and openp41ge-tabs, making future upgrades or replacements easier.

**File:** `packages/openp41ge/src/renderer/openp41ge-tabs-adapter.ts` (new)

```typescript
// Re-exports all openp41ge-tabs APIs used by the openp41ge package
export { TabGrid, TabBar, TabView } from "openp41ge-tabs/dist/components/index.js";
export {
  DragOrchestrator,
  GhostManager,
  CursorManager,
  TabDragSource,
  TabBarDropTarget,
  GridDropTarget,
  computeDropTarget,
  computeGhostLayout,
  getDropIndexInBar,
  splitCellForBoundary,
  classifyGridPosition,
  INSERT_BOUNDARY_THRESHOLD,
} from "openp41ge-tabs/dist/index.js";
export type {
  IDragSource,
  IDropTarget,
  TargetFeedback,
  DragResult,
  GhostPreview,
} from "openp41ge-tabs/dist/index.js";
```

## Phase 2: Replace grid and tab components

### 2a. Replace `<openp41ge-grid>` with `<tab-grid>`

`Openp41geGrid` (Lit) → `<tab-grid>` (Lit from openp41ge-tabs)

The `<tab-grid>` component accepts `winId`, `cols`, `placements`, `tabs` (called `tabData` in code, attribute `tabs`), and `activeTabIds`. The openp41ge platform already owns this state in its workspace data model, so data flow is:

1. Subscribe to workspace state updates (existing `SubscribeStateUpdatesStep`)
2. When state changes, map workspace data → `<tab-grid>` properties and assign them
3. Listen for `<tab-grid>` events (`grid-split`, `grid-move`, `grid-activate`, `grid-remove`) and translate them to openp41ge command-bus operations

**What happens to the old `Openp41geGrid`:**

- Remove `openp41ge-grid.ts` component file
- Remove `column-resize-controller.ts` (built into `<tab-grid>` / openp41ge-tabs)
- Remove its registration from `app.ts`

**What happens to openp41ge-specific render logic:**

- The `<tab-grid>` renders columns via its own template; openp41ge no longer manages cell DOM
- The `<tab-view>` sub-component renders content; openp41ge provides content via `tabs[id].content`
- Pane content rendering (controllers) needs to be slotted or wired through `tabData.content`

### 2b. Replace `<openp41ge-cell-tabbar>` with `<tab-bar>`

`Openp41geCellTabbar` (Lit) → `<tab-bar>` (Lit from openp41ge-tabs)

The `<tab-bar>` renders tab buttons with close buttons, a `+` button, and drop indicators. Properties: `tabIds`, `tabs`, `activeTabId`, `winId`, `col`.

Events to handle:

- `tab-bar-reorder` → `reorderTabsInCell` on command bus
- `tab-bar-move-cell` → `moveTabBetweenCells` on command bus

**What to remove:**

- `openp41ge-cell-tabbar.ts` component file
- Its registration from `app.ts`

### 2c. Replace `<openp41ge-tab-content>` with `<tab-view>`

`Openp41geTabContent` (Lit) → `<tab-view>` (Lit from openp41ge-tabs)

The `<tab-view>` is a passive component — it displays the active tab's content. Content is provided via `tabs[id].content` (HTML strings). The openp41ge platform currently has a complex controller lifecycle (mount/unmount/setVisible) that needs to be adapted.

**Challenge:** The current `<openp41ge-tab-content>` manages the PaneController lifecycle (mount/unmount when tab visibility changes). The `<tab-view>` just sets `innerHTML`. We need to keep the controller lifecycle — likely by rendering a `<slot>` or managing controllers alongside the `<tab-view>`.

**Approach:** Keep the controller lifecycle logic but have it control `<tab-view>` content assignment. When a tab becomes active, mount its controller into a managed container element, then assign that container's HTML (or a reference) as the `<tab-view>`'s tab content. Alternatively, use a wrapper component that renders `<tab-view>` and manages controller lifecycle externally.

### 2d. Replace `openp41ge-windowview` grid rendering

The `<openp41ge-windowview>` currently renders `<openp41ge-grid>` in its template. Replace this with `<tab-grid>`. The template changes from:

```html
<openp41ge-grid .winId="${this.windowData.id}" .pageData="${this.windowData}"></openp41ge-grid>
```

to:

```html
<tab-grid
  .winId=${this.windowData.id}
  .cols=${this.windowData.grid.cols}
  .placements=${this.windowData.grid.placements}
  .tabs=${/* mapped tab data */}
  .activeTabIds=${/* mapped active tab ids */}
></tab-grid>
```

## Phase 3: Replace drag-and-drop infrastructure

The openp41ge package has its own implementation of the entire DnD pipeline:

- `services/boundary/detection.ts` — boundary detection
- `services/drag/orchestrator.ts` — drag orchestration
- `services/drag/ghost-manager.ts` — ghost overlay management
- `services/drag/ghost-layout.ts` — ghost layout computation
- `services/drag/cursor-manager.ts` — cursor management
- `services/drag-sources/tab-drag-source.ts` — tab drag source
- `services/drop-targets/tab-bar-drop-target.ts` — tab bar drop target
- `services/drop-targets/grid-drop-target.ts` — grid drop target
- `services/ghost-preview.ts` — ghost preview computation
- `services/ghost-renderer.ts` — ghost rendering
- `services/tab-drag-handler.ts` — tab drag state machine
- `services/grid-drag-handler.ts` — grid drag handling
- `services/real-drag-handler.ts` — drag handler adapter

All of these are replaced by the corresponding openp41ge-tabs implementations:

- `openp41ge-tabs/TabDragSource`
- `openp41ge-tabs/TabBarDropTarget`
- `openp41ge-tabs/GridDropTarget`
- `openp41ge-tabs/DragOrchestrator`
- `openp41ge-tabs/GhostManager`
- `openp41ge-tabs/computeGhostLayout`
- `openp41ge-tabs/CursorManager`
- `openp41ge-tabs/computeDropTarget`, `getDropIndexInBar`, `splitCellForBoundary`, `classifyGridPosition`

### Wiring the orchestrator

In the current openp41ge system, `dragOrchestrator` is a module-level singleton. With openp41ge-tabs, the `DragOrchestrator` is instantiated per-page/renderer. The event flow is:

```
mousedown on tab-btn
  → TabDragSource created
  → orchestrator.startDrag(source, clientX, clientY)
  → document mousemove listener
  → targetResolver resolves TabBarDropTarget or GridDropTarget
  → onHover → ghost overlay
  → onDrop → CustomEvent dispatched on target element
  → Host application event handler → command bus → workspace state
```

**Key wiring points:**

- Tab drag initiation: listen for `mousedown` on `[role="tab"]` elements (rendered by `<tab-bar>`), create `TabDragSource`, call `orchestrator.startDrag()`
- Target resolver: use the standard pattern from the AGENT-GUIDE (tab-bar first, grid fallback)
- Event handlers: listen for `tab-bar-reorder`, `tab-bar-move-cell`, `grid-split`, `grid-move`, `grid-activate`, `grid-remove` on `document` and dispatch to command bus
- File drops: use `GridDropTarget` with a `FileDragSource` (which openp41ge already has) — the openp41ge-tabs `GridDropTarget` accepts non-tab sources

### What to remove

Delete these source files:

- `packages/openp41ge/src/renderer/services/boundary/` (whole directory)
- `packages/openp41ge/src/renderer/services/drag/` (whole directory)
- `packages/openp41ge/src/renderer/services/drag-sources/tab-drag-source.ts`
- `packages/openp41ge/src/renderer/services/drop-targets/tab-bar-drop-target.ts`
- `packages/openp41ge/src/renderer/services/drop-targets/grid-drop-target.ts`
- `packages/openp41ge/src/renderer/services/ghost-preview.ts`
- `packages/openp41ge/src/renderer/services/ghost-renderer.ts`
- `packages/openp41ge/src/renderer/services/tab-drag-handler.ts`
- `packages/openp41ge/src/renderer/services/grid-drag-handler.ts`
- `packages/openp41ge/src/renderer/services/real-drag-handler.ts`
- `packages/openp41ge/src/renderer/components/openp41ge-grid.ts`
- `packages/openp41ge/src/renderer/components/openp41ge-cell-tabbar.ts`
- `packages/openp41ge/src/renderer/components/openp41ge-tab-content.ts`
- `packages/openp41ge/src/renderer/lit/column-resize-controller.ts`

Remove from app.ts:

- Component side-effect imports for `openp41ge-grid`, `openp41ge-cell-tabbar`, `openp41ge-tab-content`
- Service initialization for TabDragHandler, GridDragHandler, RealDragHandler, GhostRenderer, CellTargetRenderer
- Orchestrator wiring

Remove from startup context:

- Drag handler references

Remove from services/index.ts:

- TabDragHandler, GridDragHandler, RealDragHandler, GhostRenderer, CellTargetRenderer exports

## Phase 4: Remove replaced tests

### Tests removed entirely (functionality covered by openp41ge-tabs tests)

**Unit tests (`test/unit/tabs/`):**

| File                              | Replaced by                                                                   |
| --------------------------------- | ----------------------------------------------------------------------------- |
| `cell-tabbar.test.ts`             | `openp41ge-tabs/test/e2e/tab-bar-drop-target.spec.mjs` + `demo-grid.spec.mjs` |
| `drag-ghost.test.ts`              | `openp41ge-tabs` ghost tests (GhostManager)                                   |
| `drag-pure-functions.test.ts`     | `openp41ge-tabs/src/boundary.ts` tests                                        |
| `ghost-layout.test.ts`            | `openp41ge-tabs` computeGhostLayout tests                                     |
| `ghost-overlay-render.test.ts`    | `openp41ge-tabs` GhostManager.showGhost tests                                 |
| `openp41ge-tab-content.test.ts`   | `<tab-view>` component tests                                                  |
| `tabbar-drag-testability.test.ts` | `openp41ge-tabs` TabBarDropTarget + orchestrator tests                        |

**Integration tests (`test/integration/`):**

| File                           | Replaced by                                                                       |
| ------------------------------ | --------------------------------------------------------------------------------- |
| `tab-bar-drag-reorder.test.ts` | `openp41ge-tabs` TabBarDropTarget tests                                           |
| `drag-drop-zones.test.ts`      | `openp41ge-tabs` GridDropTarget tests                                             |
| `drag-insertion.test.ts`       | `openp41ge-tabs` boundary + ghost tests                                           |
| `drag-full-pipeline.test.ts`   | `openp41ge-tabs` full pipeline tests                                              |
| `drag-file-drop.test.ts`       | `openp41ge-tabs` GridDropTarget tests (file drops work through the same pipeline) |

### Tests retained (openp41ge-specific logic)

| File                                                  | Reason                                                                                                                                                        |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `test/unit/tabs/tab-reorder.test.ts`                  | Tests openp41ge data model operations (`addTabToCell`, `removeTabFromCell`, `reorderTabsInCell`) — these are openp41ge's layout operations, not the component |
| `test/unit/tabs/pin-on-edit.test.ts`                  | Tests openp41ge-specific `FileEditorController` auto-pin behavior                                                                                             |
| `test/integration/compute-layout-integration.test.ts` | Tests openp41ge's layout computation (may still be relevant)                                                                                                  |
| `test/integration/layout-operations.test.ts`          | Tests openp41ge's layout operations                                                                                                                           |
| `test/integration/command-dispatch.test.ts`           | Tests command dispatch which will still exist                                                                                                                 |
| `test/integration/controller-lifecycle.test.ts`       | Tests controller lifecycle which is openp41ge-specific                                                                                                        |
| `test/integration/file-open-flow.test.ts`             | Tests file open flow specific to openp41ge                                                                                                                    |
| `test/integration/file-open-handler-wiring.test.ts`   | Tests file-open-handler integration                                                                                                                           |

## Phase 5: Add new integration tests

New integration tests in the openp41ge package for openp41ge-tabs integration points:

| Test file                                                      | What it covers                                                                                                                                                                             |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `test/integration/tab-navigation-history.test.ts`              | Tab activation events from `<tab-grid>` → `TabActivationHistory` (from the existing plan `2025-07-17-tab-navigation-history.md`)                                                           |
| `test/integration/openp41ge-tabs-command-wiring.test.ts`       | `tab-bar-reorder` → `reorderTabsInCell`, `grid-split` → `resizeGrid` + `movePaneInGrid`, etc. — verifies that CustomEvents from openp41ge-tabs dispatch the correct command-bus operations |
| `test/integration/openp41ge-tabs-controller-lifecycle.test.ts` | When a tab is activated via `<tab-grid>`, the correct `TabController` is mounted/unmounted, and its content renders in the `<tab-view>`                                                    |

### Tab Navigation History Integration

Per the existing plan `2025-07-17-tab-navigation-history.md`, the `TabActivationHistory` service is wired through the `grid-activate` event from `<tab-grid>`:

```typescript
document.addEventListener("grid-activate", (e: CustomEvent) => {
  const { winId, tabId } = e.detail;
  const worksetId = getFocusedWorksetId();
  TabActivationHistory.pushActivation(worksetId, tabId);
  appServices.commandBus.dispatch("activateTabInCell", winId, worksetId, tabId);
});
```

This replaces the old wiring through `slotchange` and `cell-tab:activate` on `<openp41ge-cell-tabbar>`.

## Phase 6: Handle edge cases and migration gotchas

### Tab ID collisions

The openp41ge-tabs package requires globally unique tab IDs across all grids. Openp41ge already uses `TabId` (branded string) which should be unique. Verify this assumption.

### Empty grids

A `<tab-grid>` with `cols=0` or no placements renders nothing. Openp41ge should handle the case where a grid has no tabs gracefully.

### Cross-window drag

The openp41ge-tabs package supports cross-grid drags through the `sourceWinId`/`targetWinId` in event data. Openp41ge's Electron cross-window drag overlay (`drag-overlay.ts`) needs to be adapted to work with openp41ge-tabs events instead of the current module-level drag state.

### Light DOM requirement

Openp41ge-tabs uses Light DOM (`createRenderRoot() { return this; }`). Openp41ge's current components do the same, so no conflict.

### `updateComplete` timing

After setting properties on `<tab-grid>`, openp41ge must `await grid.updateComplete` before `dropTarget` is available.

### File drag source compatibility

Openp41ge has a `FileDragSource` for file drops from the file tree. The openp41ge-tabs `GridDropTarget` accepts any source type, including `type: "file"`. The existing `FileDragSource` needs to implement the openp41ge-tabs `IDragSource` interface (it already has `type`, `createGhost`, `getDragData`, `onDragStart`, `onDragEnd`). This should be straightforward.

# SOLID Review

## S — Single Responsibility

- **S** — `packages/openp41ge/src/renderer/services/tab-drag-handler.ts` currently manages drag state machine, mode switching, ghost rendering, tab-bar interaction, and cross-cell moves. **Mitigated by migration** — openp41ge-tabs splits this into `DragOrchestrator`, `TabBarDropTarget`, `GridDropTarget`, and `GhostManager`, each with a single responsibility.
- **S** — `packages/openp41ge/src/renderer/components/openp41ge-grid.ts` (~540 lines) renders the grid, manages focus history, handles context menus, handles column resize, and manages drag state. **Mitigated by migration** — `<tab-grid>` handles rendering and built-in DnD; openp41ge handles event translation only.

## O — Open/Closed

No violations introduced. The new architecture uses event-driven integration — openp41ge listens for openp41ge-tabs CustomEvents and translates them to command-bus operations. New drag scenarios can be added to openp41ge-tabs without modifying openp41ge.

## L — Liskov Substitution

The openp41ge-tabs `IDragSource` and `IDropTarget` interfaces are clean contracts. Openp41ge's `FileDragSource` needs to implement `IDragSource` correctly (it already does structurally). No violations expected.

## I — Interface Segregation

The openp41ge-tabs interfaces (`IDragSource`, `IDropTarget`, `IDragHandler`) are focused and small (4-5 methods each). Good.

## D — Dependency Inversion

The openp41ge-tabs package has no Electron/IPC dependencies — it fires CustomEvents that the host application handles. This is clean DI: openp41ge depends on the openp41ge-tabs abstraction, not the other way around.

# UX Considerations

- **Tab interaction** remains identical: click to activate, click × to close, click + to add, drag to reorder or move to another cell.
- **Ghost overlay** renders identically — openp41ge-tabs uses the same column-highlight and split-preview visual patterns.
- **No visual regression** expected. The `<tab-bar>` renders tabs with the same structure (label + close button), and the grid renders the same column-based layout.
- **Performance** should be equivalent or better — Lit's batched updates are already used by both packages.
- **Cross-window drag** continues to work through Electron IPC; the overlay bridge needs adaptation but the UX is identical.

# Files Changed

## New files

| File                                                                       | Purpose                                                                       |
| -------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `packages/openp41ge/src/renderer/openp41ge-tabs-adapter.ts`                | Re-exports openp41ge-tabs APIs, single bridge point                           |
| `packages/openp41ge/src/renderer/services/openp41ge-tabs-event-handler.ts` | Listens for openp41ge-tabs CustomEvents and dispatches command-bus operations |
| `test/integration/tab-navigation-history.test.ts`                          | Tab activation events → TabActivationHistory wiring                           |
| `test/integration/openp41ge-tabs-command-wiring.test.ts`                   | CustomEvent → command dispatch integration tests                              |
| `test/integration/openp41ge-tabs-controller-lifecycle.test.ts`             | Controller mount/unmount on tab activation                                    |

## Modified files

| File                                                                               | Change                                                                           |
| ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `packages/openp41ge/package.json`                                                  | Add `openp41ge-tabs` dependency                                                  |
| `packages/openp41ge/src/renderer/app.ts`                                           | Remove old component imports, remove old service init, add openp41ge-tabs wiring |
| `packages/openp41ge/src/renderer/bootstrap/startup-context.ts`                     | Remove drag handler references                                                   |
| `packages/openp41ge/src/renderer/bootstrap/steps/init-services.step.ts`            | Remove old DnD service initialization                                            |
| `packages/openp41ge/src/renderer/bootstrap/steps/register-app-types.step.ts`       | Adapt for new component structure                                                |
| `packages/openp41ge/src/renderer/bootstrap/steps/register-event-listeners.step.ts` | Wire openp41ge-tabs event listeners                                              |
| `packages/openp41ge/src/renderer/components/openp41ge-windowview.ts`               | Replace `<openp41ge-grid>` with `<tab-grid>` in template                         |
| `packages/openp41ge/src/renderer/services/index.ts`                                | Remove old DnD service exports                                                   |
| `packages/openp41ge/src/renderer/services/file-open-handler.ts`                    | Adapt to work with openp41ge-tabs events                                         |
| `packages/openp41ge/src/renderer/services/file-drop-handler.ts`                    | Adapt to work with openp41ge-tabs GridDropTarget                                 |
| `packages/openp41ge/src/renderer/services/context-menu-builder.ts`                 | Update element queries for new component selctors                                |
| `packages/openp41ge/src/renderer/services/quote-controller.ts`                     | Update element queries                                                           |
| `packages/openp41ge/src/renderer/services/cell-target-renderer.ts`                 | Remove (replaced by grid ghost overlay)                                          |
| `packages/openp41ge/src/renderer/services/workspace-state-manager.ts`              | Ensure state shape is compatible with `<tab-grid>` properties                    |
| `packages/openp41ge/src/renderer/controllers/placeholder-controller.ts`            | Adapt for new component structure                                                |
| `packages/openp41ge/src/renderer/interfaces/element-guards.ts`                     | Remove/replace `isOpenp41geGrid` guard                                           |
| `packages/openp41ge/src/renderer/bootstrap/steps/expose-test-models.step.ts`       | Remove old drag handler test models                                              |
| `packages/openp41ge/src/renderer/models/test-drag-handler.ts`                      | Remove (replaced by openp41ge-tabs test infrastructure)                          |
| `packages/openp41ge/src/renderer/interfaces/tab-drag-handler.ts`                   | Remove (replaced by openp41ge-tabs interfaces)                                   |
| `packages/openp41ge/src/renderer/interfaces/grid-drag-handler.ts`                  | Remove (replaced by openp41ge-tabs interfaces)                                   |
| `packages/openp41ge/src/renderer/interfaces/index.ts`                              | Remove old DnD interface exports                                                 |

## Deleted files

All files listed in Phase 3's "What to remove" section plus:

- `packages/openp41ge/src/renderer/services/boundary/` (directory)
- `packages/openp41ge/src/renderer/services/drag/` (directory)
- `packages/openp41ge/src/renderer/services/drag-sources/tab-drag-source.ts`
- `packages/openp41ge/src/renderer/services/drop-targets/` (directory, except maybe `topbar-drop-target.ts`)
- `packages/openp41ge/src/renderer/services/ghost-preview.ts`
- `packages/openp41ge/src/renderer/services/ghost-renderer.ts`
- `packages/openp41ge/src/renderer/services/cell-target-renderer.ts`
- `packages/openp41ge/src/renderer/services/tab-drag-handler.ts`
- `packages/openp41ge/src/renderer/services/grid-drag-handler.ts`
- `packages/openp41ge/src/renderer/services/real-drag-handler.ts`
- `packages/openp41ge/src/renderer/components/openp41ge-grid.ts`
- `packages/openp41ge/src/renderer/components/openp41ge-cell-tabbar.ts`
- `packages/openp41ge/src/renderer/components/openp41ge-tab-content.ts`
- `packages/openp41ge/src/renderer/lit/column-resize-controller.ts`
- `packages/openp41ge/src/renderer/interfaces/tab-drag-handler.ts`
- `packages/openp41ge/src/renderer/interfaces/grid-drag-handler.ts`
- `packages/openp41ge/src/renderer/models/test-drag-handler.ts`
- `test/unit/tabs/cell-tabbar.test.ts`
- `test/unit/tabs/drag-ghost.test.ts`
- `test/unit/tabs/drag-pure-functions.test.ts`
- `test/unit/tabs/ghost-layout.test.ts`
- `test/unit/tabs/ghost-overlay-render.test.ts`
- `test/unit/tabs/openp41ge-tab-content.test.ts`
- `test/unit/tabs/tabbar-drag-testability.test.ts`
- `test/integration/tab-bar-drag-reorder.test.ts`
- `test/integration/drag-drop-zones.test.ts`
- `test/integration/drag-insertion.test.ts`
- `test/integration/drag-full-pipeline.test.ts`
- `test/integration/drag-file-drop.test.ts`

## Kept files (not deleted, not modified much)

- `packages/openp41ge/src/layout/` — all layout operations remain (they're the data model, not the rendering)
- `packages/openp41ge/src/layout/types.ts` — types remain, `<tab-grid>` consumes them as properties
- `packages/openp41ge/src/renderer/services/file-open-handler.ts` — adapted to dispatch through openp41ge-tabs events
- `test/unit/tabs/tab-reorder.test.ts` — tests openp41ge data model operations
- `test/unit/tabs/pin-on-edit.test.ts` — tests openp41ge-specific controller behavior

# Testing Strategy

## Test Removal

Remove 12 test files total: 7 unit tests (`test/unit/tabs/`) and 5 integration tests (`test/integration/`).

| Previously tested by                             | Now tested by                                                                 |
| ------------------------------------------------ | ----------------------------------------------------------------------------- |
| `test/unit/tabs/cell-tabbar.test.ts`             | `openp41ge-tabs/test/e2e/tab-bar-drop-target.spec.mjs` + `demo-grid.spec.mjs` |
| `test/unit/tabs/drag-ghost.test.ts`              | openp41ge-tabs ghost manager E2E tests                                        |
| `test/unit/tabs/drag-pure-functions.test.ts`     | openp41ge-tabs boundary pure function tests                                   |
| `test/unit/tabs/ghost-layout.test.ts`            | openp41ge-tabs computeGhostLayout tests                                       |
| `test/unit/tabs/ghost-overlay-render.test.ts`    | openp41ge-tabs GhostManager tests                                             |
| `test/unit/tabs/openp41ge-tab-content.test.ts`   | openp41ge-tabs TabView component tests                                        |
| `test/unit/tabs/tabbar-drag-testability.test.ts` | openp41ge-tabs orchestrator + TabBarDropTarget tests                          |
| `test/integration/tab-bar-drag-reorder.test.ts`  | openp41ge-tabs TabBarDropTarget E2E tests                                     |
| `test/integration/drag-drop-zones.test.ts`       | openp41ge-tabs GridDropTarget E2E tests                                       |
| `test/integration/drag-insertion.test.ts`        | openp41ge-tabs boundary + ghost pipeline tests                                |
| `test/integration/drag-full-pipeline.test.ts`    | openp41ge-tabs full pipeline tests                                            |
| `test/integration/drag-file-drop.test.ts`        | openp41ge-tabs GridDropTarget file acceptance tests                           |

## New Integration Tests

### `test/integration/tab-navigation-history.test.ts`

Wire a `TabActivationHistory` service, simulate `grid-activate` events (or real mouse clicks on `<tab-bar>`), and verify the history stack is correctly updated:

- Activate tab A → activate tab B → `goBack()` returns tab A
- Activate tab A → activate tab B → `goBack()` → `goForward()` returns tab B
- Activating the same tab twice is a no-op
- Forward stack cleared on new activation after going back
- Per-workset isolation (two worksets have independent stacks)
- Empty stacks return null

### `test/integration/openp41ge-tabs-command-wiring.test.ts`

Simulate openp41ge-tabs CustomEvents on `document` and verify the correct command-bus operations are dispatched:

- `tab-bar-reorder` → `reorderTabsInCell`
- `tab-bar-move-cell` → `moveTabBetweenCells`
- `grid-split` → `resizeGrid` + `movePaneInGrid`
- `grid-move` → `movePaneInGrid`
- `grid-activate` → `activateTabInCell`
- `grid-remove` → `removeTabFromCell`

### `test/integration/openp41ge-tabs-controller-lifecycle.test.ts`

Set up a `<tab-grid>` with controllers registered, activate tabs via events, and verify mount/unmount lifecycle:

- Activating a tab calls its controller's `mount()`
- Switching tabs calls `unmount()` on old and `mount()` on new
- Content is rendered in the `<tab-view>` for the active tab

# Open Questions

1. **Controller mount/unmount integration with `<tab-view>`** — The `<tab-view>` renders content via `innerHTML` from `tabs[id].content`, but controllers mount actual DOM elements. How do we reconcile this? Options:
   - **Option A**: Render a `<slot>` inside `<tab-view>` and have controllers render into a managed container that's slotted. Requires modifying openp41ge-tabs.
   - **Option B**: Don't use `<tab-view>` for controller content — manage controller mounts independently and only use `<tab-view>` for the visibility switching.
   - **Option C**: Have controllers assign their container's `innerHTML` (or a reference element) to the tab content property, leveraging Lit's caching of identical template results.
   - **Preferred**: Option B, as it minimizes changes to openp41ge-tabs. Controllers manage their own container elements, and we use `<tab-view>` only as a visibility switch.

2. **Cross-window drag overlay** — The current system has `drag-overlay.ts` and `drag-ghost-manager.ts` for Electron cross-window drags. The openp41ge-tabs system doesn't know about Electron. How to bridge? The `GhostFactory` parameter on `TabDragSource` allows custom ghost creation (including Electron BrowserWindow-based ghosts). This should be feasible.

3. **File drag source interface alignment** — The existing `FileDragSource` in openp41ge has methods `createGhost`, `getDragData`, `onDragStart`, `onDragEnd` which match openp41ge-tabs `IDragSource`. Verify the exact signatures match.

4. **Tab close button behavior** — The `<tab-bar>` close button fires a `CustomEvent` when clicked. Openp41ge needs to listen for this and dispatch `removeTabFromCell`. Verify the event name.

5. **Empty state rendering** — When a window has no tabs, the current `openp41ge-grid` renders an empty grid area. The `<tab-grid>` with `cols=0` or no placements renders nothing. Need to handle this.

6. **Focus management** — The current system has `_focusHistory` and `_focusedCol` in `Openp41geGrid`. The `<tab-grid>` doesn't have this. Focus restoration logic needs to be handled in openp41ge's event handlers.

7. **Quicksearch / Ctrl+P integration** — The current system dispatches `activateTabInCell` when quicksearch selects a tab. This dispatch path needs to remain compatible.

> **This plan is superseded by the following sub-plans:**
>
> - `plans/2025-07-24-openp41ge-tabs-event-command-wiring.md` — Event translation layer
> - `plans/2025-07-24-tab-navigation-history-update.md` — Tab navigation history with openp41ge-tabs
> - `plans/2025-07-24-openp41ge-tabs-controller-lifecycle.md` — Controller mount/unmount lifecycle
> - `plans/2025-07-24-cross-window-drag-bridge.md` — Cross-window drag support
> - `plans/2025-07-24-file-drag-source-adaptation.md` — File drag source verification
