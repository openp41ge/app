---
name: test-cross-window-drag
description: >
  Comprehensive manual + DevTools-driven test suite for cross-window
  tab drag-and-drop. Simulates remote drag state, inspects ghost overlay
  rendering, verifies target resolution, and validates workspace dispatch.
  Use this whenever the cross-window ghost overlay or drop behaviour
  needs debugging or regression testing.
---

# Test Cross-Window Tab Drag-and-Drop

## Prerequisites

- App running in dev mode (`nx dev`) with at least two BrowserWindows open
- Chrome DevTools open in the **target window** (the window receiving the drag)
- The `__openp41geTestHooks` object must exist in the console (added by `init-drag-system.ts`)

## Quick Start – Run Full Diagnostic

Paste this in the **target window's** DevTools console while dragging a tab:

```javascript
// Load and run the diagnostic script
fetch("/.pi/skills/test-cross-window-drag/diagnostic.js")
  .then((r) => r.text())
  .then((code) => eval(code))
  .catch(() => {
    // Fallback: paste the file content manually
    console.error("Could not load diagnostic.js — paste its contents directly");
  });
```

Or open `file:///Users/rk/Repository/openp41ge/app/master/.pi/skills/test-cross-window-drag/diagnostic.js` and paste its contents.

## Architecture Overview

Cross-window drag flow (target window perspective):

```
  ① Main process broadcasts "drag-state=true" after threshold met
  ② Target window sets _remoteDragActive = true
  ③ mousemove → _updateCrossWindowGhost(clientX, clientY)
       ↓
      elementFromPoint → closest("tab-grid")
       ↓
      computeDropTarget(gridEl, relX, gridWidth, cols)
       ↓
      _ghostManager.showGhost(gridEl, preview)  ← ghost overlay in DOM
  ④ mouseup → _handleCrossWindowDrop(clientX, clientY, ...)
       ↓
      openp41geTargetResolver(clientX, clientY)
       ↓
      dispatch("moveTabBetweenCells", ...)  or  dispatch("splitTabFromCell", ...)
       ↓
      window.openp41ge.drag.endSession()
```

Two target types:

- **tab-bar**: cursor over a `<tab-bar>` element (inside a `.grid-cell`)
- **grid**: cursor over the grid surface (content area below the tab bar)

## Quick Diagnostic

Paste this into DevTools console on the **target window**:

```javascript
const H = window.__openp41geTestHooks;
console.log("Grid cols:", H.gridEl()?.cols);
console.log("Ghost overlay:", H.getGridGhostOverlay());
H.setRemoteDragActive(true);
console.log("Remote active:", H.isRemoteDragActive());
// Now move mouse over the grid — ghost should appear
// To stop remote drag simulation:
// H.setRemoteDragActive(false);
```

## Test Hooks API

| Hook                           | Signature                           | Description                                                          |
| ------------------------------ | ----------------------------------- | -------------------------------------------------------------------- |
| `setRemoteDragActive`          | `(active: boolean) => void`         | Simulate drag-state broadcast from main process                      |
| `isRemoteDragActive`           | `() => boolean`                     | Check `_remoteDragActive` flag                                       |
| `isLocalDragActive`            | `() => boolean`                     | Check `_localDragActive` flag                                        |
| `getGridGhostOverlay`          | `() => HTMLElement \| null`         | Get the cross-window ghost overlay element in the DOM                |
| `getLocalGhostOverlay`         | `() => HTMLElement \| null`         | Get the same-window ghost overlay element                            |
| `callUpdateCrossWindowGhost`   | `(cx, cy) => void`                  | Directly invoke the ghost computation for given viewport coordinates |
| `callHandleCrossWindowDrop`    | `(cx, cy, sx, sy) => Promise<void>` | Directly invoke the drop handler (needs IPC mock — see below)        |
| `forceCrossWindowGhostCleanup` | `() => void`                        | Force-hide the cross-window ghost overlay                            |
| `gridEl`                       | `() => HTMLElement \| null`         | Get the `<tab-grid>` element                                         |
| `setGridCols`                  | `(gridEl, cols) => void`            | Override the number of columns (for testing multi-column scenarios)  |

## Ghost Overlay DOM Structure

When the ghost is shown, a div with class `openp41ge-ghost-overlay` is appended to `<tab-grid>`:

```
<tab-grid style="position:relative">
  <div class="grid-container">...</div>            ← actual grid
  <div class="openp41ge-ghost-overlay"            ← ghost overlay
       style="position:absolute;inset:0;z-index:25;
              pointer-events:none;display:flex;
              flex-direction:row;overflow:hidden">
    <div style="flex:0.5;background:...">...</div> ← column 0
    <div style="flex:0.5;background:...">...</div> ← column 1
  </div>
</tab-grid>
```

Columns can have these visual states (visible via `background`/`boxShadow` styles):

| State         | Visual                                    |
| ------------- | ----------------------------------------- |
| `active`      | `rgba(74,158,255,0.06)` + 1px blue border |
| `highlighted` | `rgba(74,158,255,0.12)` + 2px blue border |
| `splitPair`   | `rgba(74,158,255,0.06)` (no border)       |
| Default       | `rgba(74,158,255,0.04)` (very subtle)     |

### Classification Logic

`computeDropTarget` determines `isBoundary` vs cell-center:

- **Single column (cols === 1)**: outer 15% on each side → boundary; middle 70% → cell-center
- **Multi-column (cols > 1)**: `getDividerPositions` reads flex values of `.grid-cell` elements, `classifyGridPosition` determines nearest boundary with threshold = `min(0.15, narrower-adjacent-cell-width / 3)`

## Test Scenarios

### Scenario 1: Basic Ghost Visibility (Single Column Grid)

**Objective**: Verify ghost overlay appears and shows correct variation when remote drag is active.

```javascript
(async function () {
  const H = window.__openp41geTestHooks;
  const grid = H.gridEl();
  if (!grid) {
    console.error("No grid found");
    return;
  }
  const rect = grid.getBoundingClientRect();

  // Activate remote drag mode
  H.setRemoteDragActive(true);

  // Test cell-center: middle of the only column
  const midX = rect.left + rect.width / 2;
  const midY = rect.top + rect.height / 2;
  H.callUpdateCrossWindowGhost(midX, midY);
  const overlay = H.getGridGhostOverlay();
  console.log("1a) Ghost overlay exists:", !!overlay);
  if (overlay) {
    // cell-center → 1 column, active style
    console.log("1b) Children count:", overlay.children.length); // should be 1
    const col0 = overlay.children[0];
    console.log("1c) Col 0 flex:", col0.style.flex);
    console.log("1d) Col 0 background:", col0.style.background); // rgba(74,158,255,0.06)
    console.log("1e) Col 0 boxShadow:", col0.style.boxShadow); // inset 0 0 0 1px ...
  }

  // Test boundary (left edge): far left of grid
  const leftX = rect.left + 2;
  H.callUpdateCrossWindowGhost(leftX, midY);
  const overlay2 = H.getGridGhostOverlay();
  console.log("2a) Ghost updated:", overlay2?.children.length); // boundary → 2 columns
  if (overlay2 && overlay2.children.length === 2) {
    // split-left boundary → first child highlighted, second splitPair
    const c0 = overlay2.children[0];
    const c1 = overlay2.children[1];
    console.log("2b) Col 0 background:", c0.style.background); // rgba(74,158,255,0.12)
    console.log("2c) Col 0 boxShadow:", c0.style.boxShadow); // inset 0 0 0 2px ...
    console.log("2d) Col 1 background:", c1.style.background); // rgba(74,158,255,0.06) (splitPair)
  }

  // Test boundary (right edge): far right of grid
  const rightX = rect.right - 2;
  H.callUpdateCrossWindowGhost(rightX, midY);
  const overlay3 = H.getGridGhostOverlay();
  console.log("3a) Right boundary children:", overlay3?.children.length); // boundary → 2 columns
  if (overlay3 && overlay3.children.length === 2) {
    // split-right boundary → first child splitPair, second highlighted
    console.log("3b) Col 0 background:", overlay3.children[0].style.background);
    console.log("3c) Col 1 background:", overlay3.children[1].style.background);
    console.log("3d) Col 1 boxShadow:", overlay3.children[1].style.boxShadow); // 2px border
  }

  // Cleanup
  H.setRemoteDragActive(false);
  console.log("DONE");
})();
```

**Verify**:

- [ ] Ghost exists in DOM when remote drag is active
- [ ] Center of column → 1 child, `active` style (subtle blue border)
- [ ] Near left edge → 2 children, left is `highlighted` (2px blue border)
- [ ] Near right edge → 2 children, right is `highlighted`
- [ ] Ghost disappears when `setRemoteDragActive(false)` (overlay removed from DOM)

### Scenario 2: Multi-Column Grid (2 columns)

**Objective**: Verify ghost classification works correctly in a multi-column grid.

```javascript
(async function () {
  const H = window.__openp41geTestHooks;
  const grid = H.gridEl();
  if (!grid) {
    console.error("No grid found");
    return;
  }

  // Temporarily set grid to 2 columns for testing
  const origCols = grid.cols;
  H.setGridCols(grid, 2);
  // Force re-render of ghost manager by calling with new cols
  // Note: actual grid cells won't change, but computeDropTarget will use cols=2

  const rect = grid.getBoundingClientRect();
  const cellW = rect.width / 2;
  const midY = rect.top + rect.height / 2;

  H.setRemoteDragActive(true);

  // Column 0 center
  const col0MidX = rect.left + cellW / 2;
  H.callUpdateCrossWindowGhost(col0MidX, midY);
  let ov = H.getGridGhostOverlay();
  console.log("Col 0 center — children:", ov?.children.length); // 2
  console.log("Col 0 center — col 0 active?", ov?.children[0]?.style.boxShadow); // inset 0 0 0 1px ...

  // Column 1 center
  const col1MidX = rect.left + cellW + cellW / 2;
  H.callUpdateCrossWindowGhost(col1MidX, midY);
  ov = H.getGridGhostOverlay();
  console.log("Col 1 center — children:", ov?.children.length); // 2
  console.log("Col 1 center — col 1 active?", ov?.children[1]?.style.boxShadow); // inset 0 0 0 1px ...

  // Left edge of grid (boundary index 0)
  H.callUpdateCrossWindowGhost(rect.left + 2, midY);
  ov = H.getGridGhostOverlay();
  console.log("Left edge — children:", ov?.children.length); // 3 (2 → 3 due to split)
  // First child should be highlighted (new column on left)
  if (ov) console.log("Left edge — col 0 highlighted:", ov.children[0]?.style.boxShadow);

  // Right edge of grid (boundary index 2 — past the last column)
  H.callUpdateCrossWindowGhost(rect.right - 2, midY);
  ov = H.getGridGhostOverlay();
  console.log("Right edge — children:", ov?.children.length); // 3 (2 → 3 due to split)
  if (ov) console.log("Right edge — last col highlighted:", ov.children[2]?.style.boxShadow);

  // Interior divider between col 0 and col 1
  const dividerX = rect.left + cellW;
  H.callUpdateCrossWindowGhost(dividerX, midY);
  ov = H.getGridGhostOverlay();
  console.log("Interior divider — children:", ov?.children.length); // 3

  H.setRemoteDragActive(false);
  H.setGridCols(grid, origCols);
  console.log("DONE");
})();
```

**Verify**:

- [ ] Center of column 0 → 2 children, col 0 has `active` style
- [ ] Center of column 1 → 2 children, col 1 has `active` style
- [ ] Left edge → 3 children, first is `highlighted`
- [ ] Right edge → 3 children, last is `highlighted`
- [ ] Interior divider → 3 children

### Scenario 3: Target Resolution

**Objective**: Verify `openp41geTargetResolver` returns the correct target type.

```javascript
(async function () {
  const grid = document.querySelector("tab-grid");
  if (!grid) {
    console.error("No grid found");
    return;
  }
  const rect = grid.getBoundingClientRect();
  const midX = rect.left + rect.width / 2;
  const midY = rect.top + rect.height / 2;
  const topY = rect.top + 10; // tab-bar area
  const contentY = rect.top + 80; // content area (below tab-bar)

  // Get the target resolver function (it's exported)
  // We can test it by elementFromPoint → checking what's returned
  const elAtMid = document.elementFromPoint(midX, contentY);
  const elAtTop = document.elementFromPoint(midX, topY);

  console.log(
    "Element at grid center (content area):",
    elAtMid?.tagName,
    elAtMid?.closest?.("tab-grid") ? "(in grid)" : "(not in grid)",
  );
  console.log(
    "Element at grid top (tab-bar area):",
    elAtTop?.tagName,
    elAtTop?.closest?.("tab-bar") ? "(in tab-bar)" : "",
  );

  // Check if tab-bar has dropTarget
  const tabBar = elAtTop?.closest?.("tab-bar");
  if (tabBar) {
    console.log("TabBar dropTarget:", tabBar.dropTarget?.type);
  }

  // Check grid dropTarget
  console.log("Grid dropTarget:", grid.dropTarget?.type);

  // Simulate cross-window drop dispatch interception
  const originalDispatch = window.openp41ge.workspace.dispatch;
  let lastDispatch = null;
  window.openp41ge.workspace.dispatch = function (...args) {
    lastDispatch = args;
    console.log("INTERCEPTED dispatch:", args);
  };

  // Now call the drop handler with specific coordinates
  const H = window.__openp41geTestHooks;

  // Cell-center drop (middle of column)
  H.setRemoteDragActive(true);
  // We need to mock getActive to return session data
  // This is trickier — we need to intercept the IPC call

  // Restore original dispatch
  window.openp41ge.workspace.dispatch = originalDispatch;
  H.setRemoteDragActive(false);
  console.log("DONE");
})();
```

### Scenario 4: Drop Dispatch Verification (Requires IPC Mock)

**Objective**: Verify the correct workspace operation is dispatched for each drop position.

This test requires mocking `window.openp41ge.drag.getActive()` to return fake session data. Since the real implementation goes through IPC, we need to override it:

```javascript
(async function () {
  const H = window.__openp41geTestHooks;
  const grid = H.gridEl();
  if (!grid) {
    console.error("No grid found");
    return;
  }
  const rect = grid.getBoundingClientRect();

  // Step 1: Intercept dispatch calls
  const dispatched = [];
  const originalDispatch = window.openp41ge.workspace.dispatch;
  window.openp41ge.workspace.dispatch = function (...args) {
    dispatched.push(args);
    console.log("DISPATCH:", ...args);
  };

  // Step 2: Mock getActive to return fake cross-window session data
  const originalGetActive = window.openp41ge.drag.getActive;
  window.openp41ge.drag.getActive = async () => ({
    sourceWinId: "test-source-win",
    label: "Test Tab",
    dragData: {
      tabId: "test-tab-id",
      winId: "test-source-win",
      worksetId: "test-source-win",
      type: "tab",
      title: "Test Tab",
    },
  });

  // Step 3: Mock endSession to avoid IPC errors
  const originalEndSession = window.openp41ge.drag.endSession;
  window.openp41ge.drag.endSession = () => {
    console.log("endSession called");
  };

  // Step 4: Activate remote drag and test drops
  H.setRemoteDragActive(true);

  // Test A: Cell-center drop in column 0
  const midX = rect.left + rect.width / 2;
  const midY = rect.top + rect.height / 2;
  await H.callHandleCrossWindowDrop(midX, midY, 0, 0);
  console.log("Cell-center dispatch:", JSON.stringify(dispatched[0]));
  // Expected: moveTabBetweenCells test-source-win test-tab-id target-win 0 0 -1

  // Test B: Left boundary drop
  dispatched.length = 0;
  const leftX = rect.left + 2;
  await H.callHandleCrossWindowDrop(leftX, midY, 0, 0);
  console.log("Left boundary dispatch:", JSON.stringify(dispatched[0]));
  // Expected: splitTabFromCell target-win test-tab-id 0 true

  // Test C: Right boundary drop
  dispatched.length = 0;
  const rightX = rect.right - 2;
  await H.callHandleCrossWindowDrop(rightX, midY, 0, 0);
  console.log("Right boundary dispatch:", JSON.stringify(dispatched[0]));
  // Expected: splitTabFromCell target-win test-tab-id 0 false

  // Step 5: Cleanup
  H.setRemoteDragActive(false);
  window.openp41ge.workspace.dispatch = originalDispatch;
  window.openp41ge.drag.getActive = originalGetActive;
  window.openp41ge.drag.endSession = originalEndSession;
  console.log("DONE");
})();
```

**Verify**:

- [ ] Cell-center drop → `moveTabBetweenCells` with correct sourceWinId, tabId, targetWinId, row=0, col, dropIndex=-1
- [ ] Left boundary → `splitTabFromCell` with tabId, splitCol=0, splitLeft=true
- [ ] Right boundary → `splitTabFromCell` with tabId, splitCol=0, splitLeft=false

### Scenario 5: Multi-Column to Single-Column (Cross-Grid Variation)

**Objective**: Test the scenario where a grid is modified to have different column counts and verify ghost + drop handle it correctly.

```javascript
(async function () {
  const H = window.__openp41geTestHooks;
  const grid = H.gridEl();
  if (!grid) {
    console.error("No grid found");
    return;
  }

  // Simulate different grid column counts
  const configs = [1, 2, 3];

  for (const cols of configs) {
    H.setGridCols(grid, cols);
    const rect = grid.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;

    console.log(`\n--- ${cols} column(s) ---`);
    H.setRemoteDragActive(true);

    // Left edge
    H.callUpdateCrossWindowGhost(rect.left + 2, midY);
    let ov = H.getGridGhostOverlay();
    const expectedSplitCols = cols + 1;
    console.log(`  Left edge → children: ${ov?.children.length} (expected ${expectedSplitCols})`);
    if (ov && ov.children.length === expectedSplitCols) {
      console.log(`    Col 0 highlighted: ${ov.children[0]?.style.boxShadow?.includes("2px")}`);
    }

    // Right edge
    H.callUpdateCrossWindowGhost(rect.right - 2, midY);
    ov = H.getGridGhostOverlay();
    console.log(`  Right edge → children: ${ov?.children.length} (expected ${expectedSplitCols})`);
    if (ov && ov.children.length === expectedSplitCols) {
      console.log(
        `    Col ${expectedSplitCols - 1} highlighted: ${ov.children[expectedSplitCols - 1]?.style.boxShadow?.includes("2px")}`,
      );
    }

    // Center (cell-center)
    H.callUpdateCrossWindowGhost(rect.left + rect.width / 2, midY);
    ov = H.getGridGhostOverlay();
    console.log(`  Center → children: ${ov?.children.length} (expected ${cols})`);

    H.setRemoteDragActive(false);
  }

  console.log("\nDONE");
})();
```

**Verify**:

- [ ] For cols=1: left-edge → 2 children (split), right-edge → 2 children, center → 1 child
- [ ] For cols=2: left-edge → 3 children, right-edge → 3 children, center → 2 children
- [ ] For cols=3: left-edge → 4 children, right-edge → 4 children, center → 3 children
- [ ] The `highlighted` column is the first child for left-edge, last child for right-edge

### Scenario 6: Tab-Bar Boundary Drop (Critical Fix Verification)

**Objective**: Verify that dropping on the tab-bar area near a grid boundary creates a new cell.

This is the specific scenario that was previously broken — the tab-bar branch in `_handleCrossWindowDrop` always dispatched `moveTabBetweenCells`, never `splitTabFromCell`.

```javascript
(async function () {
  const H = window.__openp41geTestHooks;
  const grid = H.gridEl();
  if (!grid) {
    console.error("No grid found");
    return;
  }
  const rect = grid.getBoundingClientRect();
  const tabBarY = rect.top + 10; // tab-bar area (top of grid)

  // Mock IPC
  const dispatched = [];
  const origD = window.openp41ge.workspace.dispatch;
  window.openp41ge.workspace.dispatch = function (...args) {
    dispatched.push(args);
    console.log("DISPATCH:", ...args);
  };
  const origGA = window.openp41ge.drag.getActive;
  window.openp41ge.drag.getActive = async () => ({
    sourceWinId: "test-source-win",
    label: "Test Tab",
    dragData: {
      tabId: "test-tab-id",
      winId: "test-source-win",
      worksetId: "test-source-win",
      type: "tab",
      title: "Test Tab",
    },
  });
  window.openp41ge.drag.endSession = () => {};

  H.setRemoteDragActive(true);

  // Drop on tab-bar at left edge of grid
  const leftX = rect.left + 2;
  dispatched.length = 0;
  await H.callHandleCrossWindowDrop(leftX, tabBarY, 0, 0);
  console.log("Tab-bar LEFT edge dispatch:", JSON.stringify(dispatched[0]));
  // EXPECTED: splitTabFromCell (NOT moveTabBetweenCells)

  // Drop on tab-bar at right edge of grid
  dispatched.length = 0;
  const rightX = rect.right - 2;
  await H.callHandleCrossWindowDrop(rightX, tabBarY, 0, 0);
  console.log("Tab-bar RIGHT edge dispatch:", JSON.stringify(dispatched[0]));
  // EXPECTED: splitTabFromCell (NOT moveTabBetweenCells)

  // Drop on tab-bar at center of grid (between tab buttons)
  dispatched.length = 0;
  const midX = rect.left + rect.width / 2;
  await H.callHandleCrossWindowDrop(midX, tabBarY, 0, 0);
  console.log("Tab-bar CENTER dispatch:", JSON.stringify(dispatched[0]));
  // EXPECTED: moveTabBetweenCells (insert between tabs)

  // Cleanup
  H.setRemoteDragActive(false);
  window.openp41ge.workspace.dispatch = origD;
  window.openp41ge.drag.getActive = origGA;
  console.log("DONE");
})();
```

**Verify**:

- [ ] Tab-bar left edge → `splitTabFromCell` dispatched (creates new cell)
- [ ] Tab-bar right edge → `splitTabFromCell` dispatched (creates new cell)
- [ ] Tab-bar center → `moveTabBetweenCells` dispatched (inserts into existing cell)

### Scenario 7: Full Live Drag Simulation (Mouse Events)

**Objective**: Trigger an actual drag via synthetic mouse events and verify ghost overlay appears and evolves as the mouse moves.

```javascript
(async function () {
  const H = window.__openp41geTestHooks;

  // Find a tab button to start the drag
  const tabBtn = document.querySelector("[data-tab-id]");
  if (!tabBtn) {
    console.error("No tab button found");
    return;
  }
  const btnRect = tabBtn.getBoundingClientRect();

  // Step 1: Mousedown on the tab (starts same-window drag)
  tabBtn.dispatchEvent(
    new MouseEvent("mousedown", {
      bubbles: true,
      clientX: btnRect.left + 10,
      clientY: btnRect.top + 10,
      screenX: 100,
      screenY: 100,
      buttons: 1,
    }),
  );
  console.log("Local drag active:", H.isLocalDragActive());

  // Step 2: Move mouse — ghost should appear
  document.dispatchEvent(
    new MouseEvent("mousemove", {
      clientX: btnRect.left + 20,
      clientY: btnRect.top + 30,
      buttons: 1,
    }),
  );
  await new Promise((r) => setTimeout(r, 50));
  console.log("Same-window ghost overlay:", !!H.getLocalGhostOverlay());

  // Step 3: Move to grid boundary to test split preview
  const grid = H.gridEl();
  if (grid) {
    const gridRect = grid.getBoundingClientRect();
    const leftEdgeX = gridRect.left + 2;
    document.dispatchEvent(
      new MouseEvent("mousemove", {
        clientX: leftEdgeX,
        clientY: gridRect.top + 50,
        buttons: 1,
      }),
    );
    await new Promise((r) => setTimeout(r, 50));
    const ov = H.getLocalGhostOverlay();
    console.log("Left-edge ghost children:", ov?.children.length);

    const rightEdgeX = gridRect.right - 2;
    document.dispatchEvent(
      new MouseEvent("mousemove", {
        clientX: rightEdgeX,
        clientY: gridRect.top + 50,
        buttons: 1,
      }),
    );
    await new Promise((r) => setTimeout(r, 50));
    const ov2 = H.getLocalGhostOverlay();
    console.log("Right-edge ghost children:", ov2?.children.length);
  }

  // Step 4: Release mouse (ends drag)
  document.dispatchEvent(new MouseEvent("mouseup", { clientX: 0, clientY: 0, buttons: 0 }));
  await new Promise((r) => setTimeout(r, 50));
  console.log("Local drag active after mouseup:", H.isLocalDragActive());
  console.log("Ghost after cleanup:", !!H.getLocalGhostOverlay());

  console.log("DONE");
})();
```

**Verify**:

- [ ] Mousedown starts local drag (`isLocalDragActive()` = true)
- [ ] Mousemove shows same-window ghost overlay
- [ ] Ghost overlay changes children count when moving to boundary
- [ ] Mouseup ends local drag and removes ghost overlay

## Running All Scenarios

Paste this to run all diagnostic checks consecutively:

```javascript
(async function runAll() {
  const results = [];
  const H = window.__openp41geTestHooks;
  if (!H) {
    console.error("Test hooks not available!");
    return;
  }

  // 1. Sanity checks
  results.push({ check: "Hooks exist", pass: !!H });
  results.push({ check: "Grid exists", pass: !!H.gridEl() });
  results.push({ check: "Grid has cols", pass: H.gridEl()?.cols > 0 });

  // 2. Remote drag toggle
  H.setRemoteDragActive(true);
  results.push({
    check: "Remote active after setRemoteDragActive(true)",
    pass: H.isRemoteDragActive(),
  });
  H.setRemoteDragActive(false);
  results.push({
    check: "Remote inactive after setRemoteDragActive(false)",
    pass: !H.isRemoteDragActive(),
  });

  // 3. Ghost overlay rendering (single column, center)
  H.setRemoteDragActive(true);
  const grid = H.gridEl();
  if (grid) {
    const rect = grid.getBoundingClientRect();
    H.callUpdateCrossWindowGhost(rect.left + rect.width / 2, rect.top + rect.height / 2);
    const ov = H.getGridGhostOverlay();
    results.push({ check: "Ghost overlay exists after updateCrossWindowGhost", pass: !!ov });
    if (ov) {
      results.push({ check: "Cell-center shows 1 column", pass: ov.children.length === 1 });
    }
    // Boundary
    H.callUpdateCrossWindowGhost(rect.left + 2, rect.top + rect.height / 2);
    const ov2 = H.getGridGhostOverlay();
    if (ov2) {
      results.push({ check: "Left edge shows 2 columns", pass: ov2.children.length === 2 });
    }
  }
  H.setRemoteDragActive(false);

  console.table(results);
  console.log(`Passed: ${results.filter((r) => r.pass).length}/${results.length}`);
  return results;
})();
```

## Debugging Checklist

If a specific scenario fails, check in order:

1. **Is `_remoteDragActive` actually true?**

   ```javascript
   H.setRemoteDragActive(true);
   H.isRemoteDragActive(); // must be true
   ```

2. **Does `elementFromPoint` return the right element?**

   ```javascript
   document.elementFromPoint(cx, cy)?.closest?.("tab-grid"); // must be the grid
   ```

3. **Is the ghost overlay in the DOM?**

   ```javascript
   document.querySelector(".openp41ge-ghost-overlay"); // must exist
   ```

4. **Are the overlay's children correct?**

   ```javascript
   const ov = document.querySelector(".openp41ge-ghost-overlay");
   Array.from(ov.children).map((c) => ({
     flex: c.style.flex,
     bg: c.style.background,
     shadow: c.style.boxShadow,
   }));
   ```

5. **What does `computeDropTarget` return for this position?**

   ```javascript
   const { computeDropTarget } = await import("../openp41ge-tabs-adapter");
   const grid = document.querySelector("tab-grid");
   const rect = grid.getBoundingClientRect();
   const relX = cx - rect.left;
   computeDropTarget(grid, relX, rect.width, grid.cols);
   ```

6. **Is the `workspace.dispatch` call correct?**
   Set a breakpoint or intercept as shown in Scenario 4.

## When to Use This Skill

- Cross-window ghost overlay doesn't show or shows wrong variation
- Dragging to an existing cell works but creating new columns doesn't
- Same-window drag works but cross-window drag doesn't
- After making changes to `init-drag-system.ts`, `drag-handlers.ts`, `preload.cjs`, `boundary.ts`, or `ghost-manager.ts`
- Before and after refactoring cross-window drag code
