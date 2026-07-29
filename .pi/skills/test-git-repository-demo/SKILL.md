---
name: test-git-repository-demo
description: Skill for interactively testing the `packages/openp41ge-git-repository` demo in the browser. Use this whenever you need to verify the git panel accordion rendering, branch/commit/file interactions, loading/error/empty states, or section collapse/expand behaviour.
---

# Test Git Repository Demo

Skill for interactively testing the `packages/openp41ge-git-repository` demo in the browser. Use this whenever you need to verify the git panel accordion rendering, branch/commit/file interactions, loading/error/empty states, or section collapse/expand behaviour.

## Prerequisites

- `pnpm install` from the project root succeeds

## Starting the Demo

```bash
cd packages/openp41ge-git-repository
pnpm dev:demo
# → opens http://localhost:9034/demo/index.html (Vite default port)
```

Uses Vite dev server with `DEMO=true` to serve the demo HTML entry point, with HMR and live reload.

## Page Structure (`demo/index.html`)

| Section                                   | What to test                                                                                   |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------- |
| **Git panel** (main area, fills viewport) | Three accordion sections — Branches, Commits, Files changed — rendered by `gitBrowserRenderer` |
| **State controls** (sidebar)              | Buttons to toggle loading/error/empty states for each section                                  |
| **Console log** (bottom panel)            | Shows callback events — branch selected, commit selected, file clicked, etc.                   |

## What to Test

### 1. Page Load & Initial State

- [ ] Demo page loads without console errors
- [ ] Git panel is visible with three accordion sections
- [ ] Each section shows content (not loading spinners by default)
- [ ] Console log shows "Demo initialized" or equivalent init message

### 2. Branches Section

- [ ] Multiple branch entries are visible with correct names
- [ ] Current branch (main) has a filled dot (●)
- [ ] Non-current local branches have an empty dot (○)
- [ ] Remote tracking branches show an arrow (↗)
- [ ] Ahead badges (↑N) shown in green for branches ahead of remote
- [ ] Behind badges (↓N) shown in red for branches behind remote
- [ ] Selected branch is highlighted with blue text/background
- [ ] Branch names are truncated with ellipsis when too long
- [ ] Refresh button (↻) is visible in the section header

### 3. Branch Selection

- [ ] Click a non-selected branch — it becomes highlighted
- [ ] Commits section header updates to show the selected branch name
- [ ] Commits section content updates (different commits for the branch)
- [ ] Previously selected branch returns to unselected styling
- [ ] Click the currently selected branch — no change (stays selected)

### 4. Commits Section

- [ ] Commit entries show: short hash, commit message, author name, relative date
- [ ] Commits are ordered most-recent-first
- [ ] Selected commit has a subtle blue highlight background
- [ ] Commit messages are truncated with ellipsis when too long
- [ ] "Show more" button is visible (if more commits exist)
- [ ] Refresh button (↻) is visible in the section header

### 5. Commit Selection

- [ ] Click a commit — it highlights
- [ ] Files changed section header updates to show file count
- [ ] Files changed section content updates with diff entries
- [ ] Click the same commit again — it deselects
- [ ] Click a different commit — previous deselects, new selects

### 6. Files Changed Section

- [ ] File entries show status icon:
  - Green circle with `+` for added files
  - Red circle with `−` for deleted files
  - Blue arrow (↻) for renamed files
  - Amber tilde (~) for modified files
- [ ] File path is displayed next to the icon
- [ ] Added line counts shown in green (+N)
- [ ] Deleted line counts shown in red (−N)
- [ ] Clicking a file row logs its path to the console
- [ ] Refresh button (↻) is visible in the section header

### 7. "Show More" Button

- [ ] Click "Show more" at the bottom of commits section
- [ ] Additional commits are appended to the list
- [ ] Count increments in the section header
- [ ] After all commits are loaded, "Show more" is no longer shown

### 8. Section Collapse / Expand

- [ ] Click a section header — content collapses smoothly
- [ ] Chevron icon rotates (from ▼ to ▶)
- [ ] Click the header again — content expands smoothly
- [ ] Chevron rotates back (from ▶ to ▼)
- [ ] Other sections remain unaffected during collapse/expand

### 9. Refresh Buttons

- [ ] Click refresh on Branches — spinner animates in header, data resets after ~2s
- [ ] Click refresh on Commits — spinner animates in header, data resets after ~2s
- [ ] Click refresh on Files — spinner animates in header, data resets after ~2s
- [ ] Refresh only affects the target section, not others

### 10. Loading States (via side controls)

- [ ] Click "Loading branches" — branches section shows spinner, "Branches (...)" label
- [ ] Click "Loading commits" — commits section shows spinner, "Commits (...)" label
- [ ] Click "Loading files" — files section shows spinner, "Files changed (...)" label
- [ ] Spinner has the correct spinning animation (`.git-section-spinner` class)

### 11. Error State

- [ ] Click "Show error" — error message is displayed in the panel
- [ ] Error message text is visible (red/dark red colour)
- [ ] "Retry" button is shown
- [ ] Click "Retry" — error is cleared, normal state restored

### 12. Empty States

- [ ] Click "Clear branches" — branches section shows "No branches" message
- [ ] Click "Clear commits" — commits section shows "No commits yet" message
- [ ] Click "Clear files" — files section shows "No changed files" message
- [ ] Empty state messages are italic, muted colour (#555)

### 13. Edge Cases

- [ ] Rapidly switch branches — no rendering glitches or duplicate entries
- [ ] Collapse all sections — page layout remains stable
- [ ] Expand all sections — all content is scrollable
- [ ] Resize browser window — panel reflows responsively
- [ ] Right-click a branch — context menu callback fires (logged to console)

## Running E2E Tests

```bash
cd packages/openp41ge-git-repository
pnpm test:e2e
```

Starts the Vite dev server automatically (via Playwright `webServer` config on port 6181), runs all E2E tests in headless Chromium, and tears down the server on completion.

### Watching Tests

```bash
# UI mode (visual step-through)
npx playwright test --config test/e2e/playwright.config.mjs --ui

# Single test
npx playwright test --config test/e2e/playwright.config.mjs -g "branches section renders"

# Run with browser visible (headed)
npx playwright test --config test/e2e/playwright.config.mjs --headed
```

### Test Scenarios

| Test                              | What It Verifies                                              |
| --------------------------------- | ------------------------------------------------------------- |
| Page loads with git panel visible | Git panel element exists with branches/commits/files sections |
| Branches section renders          | Branch entries display with names and ahead/behind badges     |
| Branch selection highlights       | Clicking a branch highlights it and updates commits section   |
| Commits section renders           | Commit entries show hash, message, author, date               |
| Commit selection shows files      | Clicking a commit toggles file list                           |
| Empty state for no branches       | Clearing branches shows "No branches" message                 |
| Loading state shows spinner       | Setting `loadingBranches` shows spinner animation             |
| Error state with retry            | `renderError` shows error message and retry button            |
| "Show more" loads more commits    | Clicking show more appends additional commit rows             |
| Section collapse/expand           | Clicking section header toggles content visibility            |

## Debugging with Chrome DevTools

```javascript
// Check section states
document.querySelectorAll("[data-section]").forEach((s) => {
  console.log(s.dataset.section, {
    flex: s.style.flex,
    bodyVisible: s.querySelector(".git-section-body").style.display !== "none",
  });
});

// Check section headers
document.querySelectorAll(".git-section-header").forEach((h) => {
  console.log(h.textContent.trim());
});

// Check selected branch
const selected = document.querySelector('[style*="background:rgba(74,158,255"]');
console.log("Selected branch:", selected?.textContent?.trim());

// Count visible commit rows
console.log(
  "Commits:",
  document.querySelectorAll("[data-section='commits'] .git-section-body > div > div").length,
);

// Trigger a mock state change (if the demo exposes it)
// Check the demo-app.ts for the exposed state object on window
```

## Known Issues & Sensitivities

- **Section state persistence**: Collapse/expand state is stored in `GitBrowserRenderer._sectionStates` (module-level Map). Switching to a different data set via state controls will create a new section element, but the collapse state is preserved by key.
- **replaceSection behaviour**: `gitBrowserRenderer.replaceSection()` replaces the entire DOM node for a section. If the demo has event listeners on the old section, they must be re-wired on the new element. The demo's `replaceSection` call already does this.
- **Spinner animation**: The CSS `@keyframes wt-spin` must be defined globally. If the demo page doesn't include it, spinners will be static. Add it in `demo-styles.css`:
  ```css
  @keyframes wt-spin {
    to {
      transform: rotate(360deg);
    }
  }
  ```
- **Port conflicts**: If port 6181 is in use, the Playwright `webServer` will fail. Kill existing processes or update the port in both `test/e2e/playwright.config.mjs` and its `baseURL`.
