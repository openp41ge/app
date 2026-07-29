---
name: test-openp41ge-tabs-demo
description: Skill for interactively testing the `packages/openp41ge-tabs` demo in the browser. Use this whenever you need to verify drag-and-drop behaviour, ghost overlay sizing, or cross-grid tab operations.
---

# Test Openp41ge Tabs Demo

Skill for interactively testing the `packages/openp41ge-tabs` demo in the browser. Use this whenever you need to verify drag-and-drop behaviour, ghost overlay sizing, or cross-grid tab operations.

## Prerequisites

- `pnpm install` from the project root succeeds
- No build step needed — Vite serves TypeScript source directly

## Starting the Demo

```bash
cd packages/openp41ge-tabs
pnpm dev:demo
# → opens http://localhost:7291/demo/index.html (Vite default port)
```

Uses Vite dev server with `--config vite.demo.config.ts` to serve the demo HTML entry point from the package root, with HMR and live reload. TypeScript is compiled on the fly by Vite's esbuild integration.

## Page Structure (`demo/index.html`)

| Section                 | What to test                                                                                     |
| ----------------------- | ------------------------------------------------------------------------------------------------ |
| **Editor Grid** (top)   | Multi-column editor with 2 initial columns. Drag tabs to edges to split further.                 |
| **Side Grids** (middle) | Terminal/Problems panel (side-a) and Git Log panel (side-b). Drag between editor and side grids. |
| **Event Log** (bottom)  | All drag-drop events displayed as JSON with timestamps. Has a Reset button.                      |

## What to Test

### 1. Tab Rendering & Basic UI

- [ ] Demo page loads without console errors
- [ ] All `<tab-grid>` elements render with correct column count
- [ ] Tab buttons visible with correct titles and close buttons
- [ ] "+" button visible in each tab bar
- [ ] Event log shows init messages

### 2. Tab Click Interaction

- [ ] Click a tab → becomes active (bottom border highlight)
- [ ] Click close (×) on a tab → tab is removed
- [ ] Click "+" → new tab is added
- [ ] Events `grid-activate` and `grid-remove` logged

### 3. Same-Grid Drag & Drop

**Tab Bar Reorder**

- [ ] Mousedown on tab, drag horizontally within same tab bar
- [ ] Ghost overlay follows cursor
- [ ] Blue drop indicator appears between tabs
- [ ] Mouseup → tab reorders, `tab-bar-reorder` event logged

**Grid Split (boundary drop)**

- [ ] Drag a tab to the right edge of a single-column grid (~last 15%)
- [ ] Ghost overlay shows split preview (column splits in half)
- [ ] Mouseup → grid splits, tab moves to new column
- [ ] `grid-split` event logged with `splitCol`, `splitLeft`

**Grid Cell Drop**

- [ ] Drag a tab to center of another column
- [ ] Ghost overlay highlights target column
- [ ] Mouseup → tab moves, `grid-move` event logged

### 4. Cross-Grid Drag & Drop

**Tab-Bar Drop (Cell Add)**

- [ ] Drag a tab from editor's tab bar to a side grid's tab bar
- [ ] Blue drop indicator appears in target tab bar
- [ ] `tab-bar-move-cell` event with correct `sourceWinId`/`targetWinId`

**Boundary Split (from another grid)**

- [ ] Drag a tab from one grid to the right edge of another grid
- [ ] Ghost split preview appears on target grid
- [ ] New column appears on the TARGET grid, not the source
- [ ] `grid-split` logged with `winId` = target, `sourceWinId` = source

**Cell Drop (cross-grid)**

- [ ] Drag a tab to center of another grid's existing cell
- [ ] Tab appears in target grid, removed from source

### 5. Ghost Overlay Sizing

- [ ] During drag, `openp41ge-ghost-overlay` must be sized to parent `<tab-grid>`, not viewport
- [ ] Verify `getBoundingClientRect()` matches the `<tab-grid>` element

### 6. Visual Feedback

- [ ] Tab button opacity changes to 0.4 during drag
- [ ] Cursor changes to `grabbing` during drag
- [ ] Ghost has blue outline highlight and semi-transparent background
- [ ] Blue drop indicator correctly positioned in tab bars

## Running Tests

```bash
cd packages/openp41ge-tabs
pnpm test
```

Starts the Vite dev server automatically (via Playwright `webServer` config on port 8002), runs all 16 tests in headless Chromium, and tears down the server on completion.

### Watching Tests

```bash
# UI mode (visual step-through)
npx playwright test --config test/e2e/playwright.config.mjs --ui

# Single test
npx playwright test --config test/e2e/playwright.config.mjs -g "drag reorders tabs"

# Run with browser visible (headed)
npx playwright test --config test/e2e/playwright.config.mjs --headed
```

### Test Suites

| Suite                 | File                           | What It Tests                                                                                                            |
| --------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| **Demo — Grid**       | `demo-grid.spec.mjs`           | Tab rendering, click, close, add, drag reorder, grid split, ghost sizing (10 tests)                                      |
| **Demo — Cross-Grid** | `cross-grid.spec.mjs`          | Tab bar move, boundary split, cell drop across grids (3 tests)                                                           |
| **TabBarDropTarget**  | `tab-bar-drop-target.spec.mjs` | Programmatic drop target: hover/leave indicator, reorder event, move-cell, same-index no-op, non-tab rejection (6 tests) |

No build step is needed before running tests — Vite transpiles TypeScript from source on the fly.

## Debugging with Chrome DevTools

```javascript
// Check grid state
document.querySelectorAll("tab-grid").forEach((g) => {
  console.log(g.id || g.winId, { cols: g.cols, placements: g.placements });
});

// Check ghost overlay bounds
const ghost = document.querySelector(".openp41ge-ghost-overlay");
if (ghost) {
  const gr = ghost.getBoundingClientRect();
  const pr = ghost.parentElement.getBoundingClientRect();
  console.log(
    "Ghost in parent bounds:",
    gr.x >= pr.x && gr.right <= pr.right && gr.y >= pr.y && gr.bottom <= pr.bottom,
  );
}

// Simulate a drag-drop
async function simulateDrag(fromBtn, toX, toY) {
  const r = fromBtn.getBoundingClientRect();
  const sx = r.left + r.width / 2,
    sy = r.top + r.height / 2;
  fromBtn.dispatchEvent(
    new MouseEvent("mousedown", { bubbles: true, clientX: sx, clientY: sy, button: 0 }),
  );
  await new Promise((r) => setTimeout(r, 20));
  for (let i = 1; i <= 8; i++) {
    document.dispatchEvent(
      new MouseEvent("mousemove", {
        bubbles: true,
        clientX: sx + ((toX - sx) * i) / 8,
        clientY: sy + ((toY - sy) * i) / 8,
        button: 0,
      }),
    );
    await new Promise((r) => setTimeout(r, 10));
  }
  document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, clientX: toX, clientY: toY }));
}

// Check that source imports resolve correctly (Vite proxy)
fetch("/src/index.ts").then((r) => console.log("Source accessible:", r.status));
```

## Known Sensitivities

- **elementFromPoint**: Target resolver uses `document.elementFromPoint()`. Drop point must be within the visible viewport.
- **Threshold**: Drag must move >4px from mousedown before ghost appears.
- **Boundary threshold**: `INSERT_BOUNDARY_THRESHOLD = 0.15` (15% of column width from each edge).
- **Vite dev server**: The demo imports directly from `../src/` — Vite transpiles TypeScript on the fly. No `pnpm build` step is needed before `pnpm dev:demo` or `pnpm test`.
- **SlowMo in E2E tests**: The Playwright tests use `slowMo: 100` for reliable drag simulation. Adjust if tests become flaky on faster CI machines.
- **Dynamic imports in evaluate**: The `TabBarDropTarget` tests use `page.evaluate(async () => { const { TestTabBar } = await import("../../test/fixtures/test-tab-bar.ts"); ... })` to load test fixtures from source. This works because Vite intercepts the module request and transpiles TypeScript. The import path is relative to the page URL (which is the Vite root).
- **No `@web/test-runner` or `chai`**: All browser tests now run directly via Playwright. The old `@web/test-runner` + `@web/test-runner-playwright` + `chai` dependencies have been removed.
