# AI Agent Guide — `openp41ge-tabs` Components

This document is for AI agents integrating the `openp41ge-tabs` package into applications. It covers component APIs, the drag-and-drop system, event contracts, and integration patterns with **code examples**.

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [Component Reference](#component-reference)
   - [`<tab-grid>`](#tab-grid)
   - [`<tab-bar>`](#tab-bar)
   - [`<tab-view>`](#tab-view)
3. [Data Model](#data-model)
4. [Drag-and-Drop System](#drag-and-drop-system)
   - [Orchestrator](#orchestrator)
   - [Target Resolver](#target-resolver)
   - [Event Flow](#event-flow)
5. [Integration Patterns](#integration-patterns)
   - [Wiring External State](#1-wiring-external-state)
   - [Handling Events](#2-handling-events)
   - [Cross-Grid Drags](#3-cross-grid-drags)
6. [Ghost Overlay](#ghost-overlay)
7. [Gotchas & Pitfalls](#gotchas--pitfalls)

---

## Quick Start

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Openp41ge Tabs</title>
    <style>
      tab-grid {
        display: block;
        height: 400px;
        border: 1px solid #333;
      }
    </style>
  </head>
  <body>
    <tab-grid id="my-grid"></tab-grid>

    <script type="module">
      import "openp41ge-tabs/dist/components/index.js";
      import { DragOrchestrator, TabDragSource, GhostManager } from "openp41ge-tabs/dist/index.js";

      const grid = document.getElementById("my-grid");

      // Seed initial state
      grid.winId = "editor";
      grid.tabs = {
        "tab-1": { title: "README.md", content: "<p>Hello</p>" },
        "tab-2": { title: "index.js", content: "<p>console.log('hi')</p>" },
      };
      grid.placements = [{ position: { row: 0, col: 0 }, tabIds: ["tab-1", "tab-2"] }];
      grid.activeTabIds = { 0: "tab-1" };
      grid.cols = 1;
      await grid.updateComplete;

      // Wire drag-and-drop
      const orchestrator = new DragOrchestrator(targetResolver);
      let currentDragSource = null;

      document.addEventListener("mousedown", (e) => {
        const tabBtn = e.target.closest("[role='tab']");
        if (!tabBtn || e.target.closest(".tab-close")) return;
        const tabBar = tabBtn.closest("tab-bar");
        if (!tabBar) return;
        const tabId = tabBtn.getAttribute("data-tab-id");
        if (!tabId) return;
        e.preventDefault();
        currentDragSource = new TabDragSource(tabBtn, tabId, tabBar.winId, "default");
        orchestrator.startDrag(currentDragSource, e.clientX, e.clientY);
      });

      function targetResolver(clientX, clientY) {
        const el = document.elementFromPoint(clientX, clientY);
        if (!el || !(el instanceof HTMLElement)) return null;
        const tabBar = el.closest("tab-bar");
        if (tabBar && tabBar.dropTarget) return tabBar.dropTarget;
        const grid = el.closest("tab-grid");
        if (grid && grid.dropTarget) return grid.dropTarget;
        return null;
      }
    </script>
  </body>
</html>
```

---

## Component Reference

### `<tab-grid>`

The grid renders a row of columns. Each column contains a `<tab-bar>` and `<tab-view>`.

**Properties**

| Property                      | Type                               | Default | Description                    |
| ----------------------------- | ---------------------------------- | ------- | ------------------------------ |
| `winId`                       | `string`                           | `""`    | Unique window/grid identifier  |
| `cols`                        | `number`                           | `1`     | Number of columns              |
| `placements`                  | `Placement[]`                      | `[]`    | Column-to-tabId mapping        |
| `tabData` (attribute: `tabs`) | `Record<string, {title, content}>` | `{}`    | All tab data indexed by id     |
| `activeTabIds`                | `Record<string, string>`           | `{}`    | Map of col-index → activeTabId |

**Placement shape**:

```typescript
interface Placement {
  position: { row: number; col: number }; // row is always 0 (single row)
  tabIds: string[]; // ordered tab IDs in this column
}
```

**Methods**

| Method                                          | Returns                  | Description                                        |
| ----------------------------------------------- | ------------------------ | -------------------------------------------------- |
| `getBarForCol(col)`                             | `TabBar \| null`         | Get the tab-bar for a column                       |
| `getViewForCol(col)`                            | `TabView \| null`        | Get the tab-view for a column                      |
| `computeDropFeedback(clientX, clientY, source)` | `TargetFeedback \| null` | Compute ghost overlay state (for custom renderers) |
| `showGhostOverlay(preview)`                     | `void`                   | Show the column-split ghost overlay                |
| `hideGhostOverlay()`                            | `void`                   | Hide the ghost overlay                             |

**Events** (bubbling, on the `<tab-grid>` element)

| Event           | Detail                                                                 | When                               |
| --------------- | ---------------------------------------------------------------------- | ---------------------------------- |
| `grid-split`    | `{ sourceWinId, winId, tabId, splitCol, splitLeft, focusTabId }`       | Tab dropped on column boundary     |
| `grid-move`     | `{ sourceWinId, tabId, targetWinId, targetCol, insertAt, focusTabId }` | Tab dropped into another cell      |
| `grid-activate` | `{ winId, tabId }`                                                     | Tab dropped on itself in same cell |
| `grid-remove`   | `{ winId, tabId, focusTabId }`                                         | Tab dropped on duplicate file path |

**Example: Setting up a grid dynamically**

```js
const grid = document.createElement("tab-grid");
grid.winId = "editor";
grid.cols = 2;
grid.tabs = {
  "file-a": { title: "app.ts", content: "<p>code</p>" },
  "file-b": { title: "styles.css", content: "<p>css</p>" },
  "file-c": { title: "index.html", content: "<p>html</p>" },
};
grid.placements = [
  { position: { row: 0, col: 0 }, tabIds: ["file-a", "file-c"] },
  { position: { row: 0, col: 1 }, tabIds: ["file-b"] },
];
grid.activeTabIds = { 0: "file-a", 1: "file-b" };
document.body.appendChild(grid);
```

---

### `<tab-bar>`

Renders tab buttons in a horizontal bar. Each button has a title, close button (`×`), and the bar has a `+` button.

**Properties**

| Property      | Type                      | Default | Description                           |
| ------------- | ------------------------- | ------- | ------------------------------------- |
| `tabIds`      | `string[]`                | `[]`    | Ordered tab IDs to render             |
| `tabs`        | `Record<string, {title}>` | `{}`    | Tab metadata (title used for display) |
| `activeTabId` | `string`                  | `""`    | Currently active tab in this bar      |
| `winId`       | `string`                  | `""`    | Parent grid's winId                   |
| `col`         | `number`                  | `0`     | Column index this bar belongs to      |

**Methods**

| Method                       | Returns                    | Description                                |
| ---------------------------- | -------------------------- | ------------------------------------------ |
| `dropTarget` (getter)        | `TabBarDropTarget \| null` | The bar's drop target for the orchestrator |
| `barElement` (getter)        | `HTMLElement \| null`      | The underlying `.tab-bar-container`        |
| `getTabButton(tabId)`        | `HTMLElement \| null`      | Get a specific tab button element          |
| `getInsertionIndex(clientX)` | `number`                   | Compute drop insertion index from cursor X |
| `showDropIndicator(clientX)` | `void`                     | Show the blue insertion indicator          |
| `hideDropIndicator()`        | `void`                     | Hide the insertion indicator               |

**DOM structure**:

```
<tab-bar>
  <div class="tab-bar-container">
    <div role="tab" class="tab-btn" data-tab-id="...">
      <span>title</span>
      <span class="tab-close" data-close-tab-id="...">×</span>
    </div>
    ...
    <button class="add-tab-btn">+</button>
  </div>
</tab-bar>
```

**Events** (bubbling, on the `<tab-bar>` element)

| Event               | Detail                                                      | When                                     |
| ------------------- | ----------------------------------------------------------- | ---------------------------------------- |
| `tab-bar-reorder`   | `{ winId, col, fromIndex, toIndex }`                        | Tab reordered within same bar            |
| `tab-bar-move-cell` | `{ sourceWinId, tabId, targetWinId, targetCol, dropIndex }` | Tab moved from one cell to another's bar |

> **Note**: The `<tab-bar>` fires `tab-bar-reorder` only when the tab is moved to a **different index** within the **same bar**. If dragged to a different bar (cross-cell), it fires `tab-bar-move-cell`. If the tab originates from a different grid entirely, it still fires `tab-bar-move-cell`.

---

### `<tab-view>`

Passive component that displays tab content. Only the active tab's content is visible.

**Properties**

| Property      | Type                        | Default | Description                  |
| ------------- | --------------------------- | ------- | ---------------------------- |
| `tabIds`      | `string[]`                  | `[]`    | Ordered tab IDs              |
| `activeTabId` | `string`                    | `""`    | Which tab content is visible |
| `tabs`        | `Record<string, {content}>` | `{}`    | Tab content (HTML strings)   |

The `<tab-view>` renders a hidden `<div>` for each tab. Only the active tab's div is visible. Content is set via `innerHTML` from `tabs[id].content`.

---

## Data Model

The **single source of truth** is the host application's state, not the components. Components are **rendering targets** — you mutate state data structures, then apply them to components.

### State shape

```typescript
interface AppState {
  winId: string;
  cols: number;
  tabs: Record<string, { title: string; content: string }>;
  placements: Array<{
    position: { row: number; col: number };
    tabIds: string[];
  }>;
  activeTabIds: Record<string, string>; // col-index → active tab ID
}
```

### Applying state to a grid

```js
function applyState(grid, state) {
  grid.winId = state.winId;
  grid.cols = state.cols;
  grid.tabs = state.tabs;
  grid.placements = state.placements;
  grid.activeTabIds = state.activeTabIds;
}
```

### Manipulating state (helper examples)

```js
function addTab(state, title, content, col = 0) {
  const id = "tab-" + Date.now();
  state.tabs[id] = { title, content };
  state.placements[col].tabIds.push(id);
  state.activeTabIds[String(col)] = id;
  return id;
}

function removeTab(state, tabId) {
  for (const pl of state.placements) {
    const idx = pl.tabIds.indexOf(tabId);
    if (idx !== -1) {
      pl.tabIds.splice(idx, 1);
      delete state.tabs[tabId];
      const colStr = String(pl.position.col);
      if (state.activeTabIds[colStr] === tabId) {
        state.activeTabIds[colStr] = pl.tabIds[0] || "";
      }
      return true;
    }
  }
  return false;
}

function reorderTab(state, col, fromIndex, toIndex) {
  const pl = state.placements[col];
  if (!pl) return;
  const [moved] = pl.tabIds.splice(fromIndex, 1);
  const adjustedTo = toIndex > fromIndex ? toIndex : toIndex;
  pl.tabIds.splice(toIndex, 0, moved);
}
```

---

## Drag-and-Drop System

### Orchestrator

The `DragOrchestrator` manages the drag session lifecycle. Create one instance per page/renderer.

```js
import { DragOrchestrator } from "openp41ge-tabs/dist/index.js";

const orchestrator = new DragOrchestrator(targetResolver);
```

**API**:

| Method                                | Description                   |
| ------------------------------------- | ----------------------------- |
| `startDrag(source, clientX, clientY)` | Begin a drag session          |
| `cancelDrag()`                        | Cancel the current session    |
| `isDragging` (getter)                 | Whether a drag is active      |
| `simulateDrag(source, target)`        | Programmatic drag (for tests) |

### Target Resolver

The target resolver is a function injected into the orchestrator. It calls `document.elementFromPoint` and returns an `IDropTarget`. This is where you decide **which element** receives drops.

**Default pattern** (tab-bar takes priority over grid):

```js
function targetResolver(clientX, clientY) {
  const el = document.elementFromPoint(clientX, clientY);
  if (!el || !(el instanceof HTMLElement)) return null;

  // Tab-bar first — catches reorders and cell-moves
  const tabBar = el.closest("tab-bar");
  if (tabBar && tabBar.dropTarget) return tabBar.dropTarget;

  // Grid fallback — catches boundary splits and cell drops
  const grid = el.closest("tab-grid");
  if (grid && grid.dropTarget) return grid.dropTarget;

  return null;
}
```

**Why tab-bar first**: When a tab is dropped on a tab bar, we want reorder/move behavior. When dropped on the grid surface (gaps between columns), we want split/move behavior. The tab bar has higher visual priority.

### Drag Source (TabDragSource)

`TabDragSource` wraps a tab button and provides drag data.

```js
const source = new TabDragSource(
  tabBtnElement,           // HTMLElement — the .tab-btn being dragged
  tabId,                   // string — tab identifier
  winId,                   // string — source grid's winId
  worksetId,               // string — group identifier (e.g., "workset-1")
  title?,                  // optional title override
  ghostFactory?,           // optional custom ghost creator
);
```

**Custom ghost factory** for cross-window Electron support:

```js
const source = new TabDragSource(tabBtn, tabId, winId, worksetId, undefined, () => {
  const ghost = document.createElement("div");
  ghost.textContent = "Dragging...";
  ghost.style.cssText = "position:fixed;z-index:99999;pointer-events:none;background:#333;...";
  return ghost;
});
```

### Event Flow

```
mousedown on tab-btn
  → TabDragSource created
  → orchestrator.startDrag(source, clientX, clientY)
  → document mousemove listener

mousemove (threshold >4px)
  → _initiateDrag: ghost created + appended to body
  → targetResolver(clientX, clientY) called
  → IDropTarget.onHover(source, clientX, clientY) on current target
  → Ghost visuals updated

mouseup
  → targetResolver(clientX, clientY) called
  → IDropTarget.onDrop(source, clientX, clientY) called
  → CustomEvent dispatched on the target element (bubbles)
  → Host application handles the event → mutates state → re-renders
```

---

## Integration Patterns

### 1. Wiring External State

The host application owns all state. Components are pure render targets. The pattern:

1. **Maintain state** in your own data structures (class instances, stores, etc.)
2. **Listen for events** dispatched by components during drops
3. **Mutate state** according to the event
4. **Re-apply state** to all components via property assignment

```js
class MyGridState {
  constructor(winId, initialTabs) {
    this.winId = winId;
    this.cols = 1;
    this.tabs = {};
    this.activeTabIds = {};
    this.placements = [];

    initialTabs.forEach((t, i) => {
      this.tabs[t.id] = { title: t.title, content: t.content };
    });
    this.placements.push({
      position: { row: 0, col: 0 },
      tabIds: initialTabs.map((t) => t.id),
    });
    this.activeTabIds = { 0: initialTabs[0]?.id || "" };
  }

  applyTo(grid) {
    grid.winId = this.winId;
    grid.cols = this.cols;
    grid.tabs = this.tabs;
    grid.placements = this.placements;
    grid.activeTabIds = this.activeTabIds;
  }

  insertTab(tab, col, dropIndex) {
    this.tabs[tab.id] = { title: tab.title, content: tab.content };
    const pl = this.placements.find((p) => p.position.col === col);
    if (!pl) {
      this.placements.push({
        position: { row: 0, col },
        tabIds: [tab.id],
      });
    } else if (dropIndex >= 0) {
      pl.tabIds.splice(dropIndex, 0, tab.id);
    } else {
      pl.tabIds.push(tab.id);
    }
    this.activeTabIds[String(col)] = tab.id;
  }

  insertTabInSplit(tab, splitCol, splitLeft) {
    const newCol = splitLeft ? splitCol : splitCol + 1;
    const pl = this.placements.find((p) => p.position.col === splitCol);
    if (pl) {
      // Move all tabs from the right half into the new column
      const splitIndex = Math.ceil(pl.tabIds.length / 2);
      const moved = pl.tabIds.splice(splitIndex);
      // Shift existing placements' col indices
      this.placements.forEach((p) => {
        if (p.position.col >= newCol) p.position.col++;
      });
      this.placements.push({
        position: { row: 0, col: newCol },
        tabIds: [...(splitLeft ? [tab.id] : []), ...moved],
      });
      if (!splitLeft) {
        pl.tabIds.push(tab.id);
      }
    } else {
      this.placements.push({
        position: { row: 0, col: newCol },
        tabIds: [tab.id],
      });
    }
    this.cols++;
    this.activeTabIds[String(newCol)] = tab.id;
  }

  removeTab(tabId) {
    for (const pl of this.placements) {
      const idx = pl.tabIds.indexOf(tabId);
      if (idx !== -1) {
        pl.tabIds.splice(idx, 1);
        const removed = this.tabs[tabId];
        delete this.tabs[tabId];
        const colStr = String(pl.position.col);
        if (this.activeTabIds[colStr] === tabId) {
          this.activeTabIds[colStr] = pl.tabIds[0] || "";
        }
        return removed;
      }
    }
    return null;
  }

  setActive(col, tabId) {
    this.activeTabIds[String(col)] = tabId;
  }

  reorder(col, fromIndex, toIndex) {
    const pl = this.placements.find((p) => p.position.col === col);
    if (!pl) return;
    const [moved] = pl.tabIds.splice(fromIndex, 1);
    pl.tabIds.splice(toIndex, 0, moved);
  }
}
```

### 2. Handling Events

Each drop event carries `sourceWinId` and `targetWinId` (or `winId`). Your handler must:

1. Identify **source** and **target** state instances by `winId`
2. Remove the tab from the **source**
3. Insert the tab into the **target**
4. Re-render all affected grids

```js
// ── Single-grid handlers ──────────────────────────────────────────

document.addEventListener("tab-bar-reorder", (e) => {
  const { winId, col, fromIndex, toIndex } = e.detail;
  const state = allStates[winId];
  if (!state) return;
  state.reorder(col, fromIndex, toIndex);
  state.applyTo(document.getElementById(winId + "-grid"));
});

document.addEventListener("tab-bar-move-cell", (e) => {
  const { sourceWinId, tabId, targetWinId, targetCol, dropIndex } = e.detail;
  const source = allStates[sourceWinId];
  const target = allStates[targetWinId];
  if (!source || !target) return;
  const removed = source.removeTab(tabId);
  if (!removed) return;
  target.insertTab(removed, targetCol, dropIndex);
  renderAll(); // apply all states to all grids
});

document.addEventListener("grid-split", (e) => {
  const { sourceWinId, winId, tabId, splitCol, splitLeft } = e.detail;
  const source = allStates[sourceWinId];
  const target = allStates[winId];
  if (!source || !target) return;
  const removed = source.removeTab(tabId);
  if (!removed) return;
  target.insertTabInSplit(removed, splitCol, splitLeft);
  renderAll();
});

document.addEventListener("grid-move", (e) => {
  const { sourceWinId, tabId, targetWinId, targetCol } = e.detail;
  const source = allStates[sourceWinId];
  const target = allStates[targetWinId];
  if (!source || !target) return;
  const removed = source.removeTab(tabId);
  if (!removed) return;
  target.insertTab(removed, targetCol, -1);
  renderAll();
});
```

### 3. Cross-Grid Drags

Cross-grid operations work because **every event includes both `sourceWinId` and `targetWinId`** (or `winId` for the target). Your state store indexes by `winId`.

```js
const allStates = {
  editor: new MyGridState("editor", editorTabs),
  panelA: new MyGridState("panelA", panelTabs),
  panelB: new MyGridState("panelB", panelBTabs),
};

function renderAll() {
  Object.values(allStates).forEach((s) => {
    const grid = document.getElementById(s.winId + "-grid");
    if (grid) s.applyTo(grid);
  });
}
```

**Cross-grid split creates column on the target grid** — not the source:

```
Before:  source=[editor: 2 cols], target=[panelA: 1 col]
Drag tab from editor to panelA's right edge
Event:   grid-split { sourceWinId: "editor", winId: "panelA", ... }
After:   panelA.cols = 2  (new column on panelA)
         tab removed from editor
```

---

## Ghost Overlay

The ghost overlay is a semi-transparent column visualization that previews where a drop would land. There are two kinds:

### 1. Drag Ghost (cursor follower)

Created by `TabDragSource.createGhost()` and appended to `document.body`. Shows the tab title in a pill-shaped element that follows the cursor. Has `pointer-events: none` so it doesn't interfere with `elementFromPoint`.

### 2. Grid Ghost Overlay (split preview)

Managed by `GhostManager.showGhost(parent, preview)`. Positioned inside the `<tab-grid>` with `position: absolute; inset: 0`. Shows column split lines and cell highlights.

**Ghost preview config**:

```typescript
interface GhostPreview {
  cols: number;
  activeCol?: number;
  boundaryIndex?: number;
  splitCol?: number;
  splitLeft?: boolean;
  columnFlex?: number[];
}
```

**The grid's host element must have `position: relative`** for the overlay to size correctly. The `<tab-grid>` component does this automatically in `connectedCallback()`.

---

## Gotchas & Pitfalls

### 1. `elementFromPoint` and ghost overlays

Both the drag ghost and grid overlay have `pointer-events: none`. This ensures `document.elementFromPoint` passes through them to the actual tab / grid elements underneath. Without this, drops would always land on the overlay.

### 2. Tab-bar first in target resolver

The target resolver **must check tab-bar before grid**. If grid is checked first, every drop on a tab bar would be intercepted by the grid, preventing reorder and cross-cell move events.

```js
// WRONG — grid intercepts tab-bar drops
function resolver(x, y) {
  const el = document.elementFromPoint(x, y);
  const grid = el.closest("tab-grid");
  if (grid?.dropTarget) return grid.dropTarget; // ← catches everything
  const bar = el.closest("tab-bar");
  if (bar?.dropTarget) return bar.dropTarget;
}

// CORRECT — tab-bar checked first
function resolver(x, y) {
  const el = document.elementFromPoint(x, y);
  const bar = el.closest("tab-bar");
  if (bar?.dropTarget) return bar.dropTarget; // ← narrow check first
  const grid = el.closest("tab-grid");
  if (grid?.dropTarget) return grid.dropTarget;
}
```

### 3. `sourceWinId` vs `winId` in event data

Cross-grid splits use TWO identifiers:

| Field                      | Meaning                                        |
| -------------------------- | ---------------------------------------------- |
| `event.detail.winId`       | **Target** grid (where the new column appears) |
| `event.detail.sourceWinId` | **Source** grid (where the tab came from)      |

Always use `winId` to identify **where the event target lives** and `sourceWinId` to identify **where the tab originated**.

### 4. Cannot split last tab from a cell

The `GridDropTarget._handleBoundaryDrop` checks `sourcePlacement.tabIds.length <= 1` and **rejects** the drop if true. This prevents creating empty cells. Always ensure you drag a tab from a column with at least 2 tabs, or handle the rejection gracefully.

### 5. Light DOM, not Shadow DOM

All components use `createRenderRoot() { return this; }` (Light DOM). This is essential because the target resolver uses `elementFromPoint` and `closest()`, which do not naturally pierce Shadow DOM boundaries.

### 6. Initial render with `updateComplete`

After setting properties on a Lit component, await `updateComplete` before interacting:

```js
grid.cols = 2;
grid.placements = [...];
await grid.updateComplete;
// Now dropTarget is initialized, events are wired
```

### 7. Drag threshold

The orchestrator requires >4px of movement (`Math.abs(dx) + Math.abs(dy) > 4`) before initiating a drag. A `mousedown` followed by `<4px` movement and `mouseup` is treated as a click, which must be handled separately (for tab activation).

### 8. Empty grids

A `<tab-grid>` with `cols=0` or no placements renders nothing. Setting `cols=1` with an empty placement is safe. The boundary detection handles 1-column grids correctly (edge splits work).

### 9. Tab ID collision

Tab IDs must be **unique across all grids** because events carry only the tab ID and `winId`. If two grids have a tab with the same ID, remove/move operations may target the wrong tab. Use a global counter or UUIDs.

```js
let nextId = 1;
function createTab(title, content) {
  const id = "tab-" + nextId++;
  return { id, title, content };
}
```
