# AI Agent Guide — `openp41ge-git-repository`

This document is for AI agents integrating the `openp41ge-git-repository` package into applications. It covers the renderer API, data model, callback contracts, and integration patterns with code examples.

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [Data Model](#data-model)
3. [Renderer API](#renderer-api)
   - [`renderGitPanel`](#rendergitpanel)
   - [`replaceSection`](#replacesection)
   - [`renderBranchRow` / `renderCommitRow` / `renderFileRow`](#renderbranchrow--rendercommitrow--renderfilerow)
   - [`renderLoading` / `renderError`](#renderloading--rendererror)
4. [Callback Contract](#callback-contract)
5. [Integration Patterns](#integration-patterns)
   - [Wiring into a Controller](#1-wiring-into-a-controller)
   - [Handling Branch Selection](#2-handling-branch-selection)
   - [Handling Commit Selection](#3-handling-commit-selection)
   - [Partial Section Updates](#4-partial-section-updates)
   - [Loading and Error States](#5-loading-and-error-states)
6. [DOM Structure](#dom-structure)
7. [Gotchas & Pitfalls](#gotchas--pitfalls)
8. [Demo Development](#demo-development)

---

## Quick Start

```typescript
import { gitBrowserRenderer } from "openp41ge-git-repository";
import type { GitBrowserData, GitBrowserCallbacks } from "openp41ge-git-repository";

// 1. Provide data
const data: GitBrowserData = {/* ... */};

// 2. Provide callbacks
const callbacks: GitBrowserCallbacks = {
  onSelectBranch: (name) => {
    /* switch branch */
  },
  onSelectCommit: (hash) => {
    /* select commit */
  },
  // ... all other callbacks
};

// 3. Render the panel
const panel = gitBrowserRenderer.renderGitPanel(data, callbacks);
container.appendChild(panel);

// 4. Later, update a single section
gitBrowserRenderer.replaceSection(panel, "commits", newData, callbacks);
```

---

## Data Model

The **single source of truth** is the `GitBrowserData` struct that you provide. The renderer never mutates it — it reads and renders.

### `GitBrowserData`

```typescript
interface GitBrowserData {
  repoName: string;
  branches: BranchEntry[];
  selectedBranch: string; // branch.name of the currently selected branch
  commits: CommitEntry[]; // all commits for the selected branch
  filesChanged: DiffStatEntry[]; // files changed in the selected commit
  loadingBranches: boolean;
  loadingCommits: boolean;
  loadingFiles: boolean;
  commitSkipCount: number; // offset for pagination
  hasMoreCommits: boolean; // whether "Show more" should appear
  visibleCommitCount: number; // how many commits to render
  selectedCommit: string | null; // commit.hash of the selected commit, or null
  error?: string; // optional error message
}
```

### `BranchEntry`

```typescript
interface BranchEntry {
  name: string; // e.g. "refs/heads/main"
  shortName: string; // e.g. "main"
  isLocal: boolean;
  isCurrent: boolean; // HEAD is on this branch
  tracking?: string; // remote tracking branch, e.g. "origin/main"
  ahead: number; // commits ahead of remote
  behind: number; // commits behind remote
  lastCommit: CommitEntry | null; // latest commit on this branch
}
```

### `CommitEntry`

```typescript
interface CommitEntry {
  hash: string; // full hash (40 chars)
  shortHash: string; // short hash (7 chars)
  authorName: string;
  authorEmail: string;
  date: string; // ISO 8601
  relativeDate: string; // e.g. "2h ago"
  message: string; // first line
  fullMessage: string; // full commit body
  refs: string[]; // branch/tag refs on this commit
  parents: string[]; // parent hashes
}
```

### `DiffStatEntry`

```typescript
interface DiffStatEntry {
  filePath: string;
  added: number; // lines added
  deleted: number; // lines deleted
  status: "added" | "modified" | "deleted" | "renamed";
}
```

### Data invariants

- `selectedBranch` must match one of the entries in `branches[].name`
- `selectedCommit` (when non-null) must match a `commits[].hash`
- `visibleCommitCount` should be ≤ `commits.length`
- `loading*` flags are read by the renderer to show spinners / placeholder text
- `error` is not rendered by `renderGitPanel` — use `renderError()` separately

---

## Renderer API

### `renderGitPanel`

```typescript
renderGitPanel(data: GitBrowserData, callbacks: GitBrowserCallbacks): HTMLElement
```

Builds the full three-section accordion panel. Call this for the initial render or a full refresh. Returns the panel element (a `<div>` with `data-section` children).

### `replaceSection`

```typescript
replaceSection(
  panel: HTMLElement,      // the panel returned by renderGitPanel
  key: "branches" | "commits" | "files",
  data: GitBrowserData,
  callbacks: GitBrowserCallbacks,
): HTMLElement | null
```

Replaces a single section's DOM node. Preserves collapse/expand state for that section via an internal `Map<SectionKey, boolean>`. Returns the new section element, or `null` if the old section wasn't found.

**Recommended over full re-renders** when only one section changed (e.g., branch click, commit select, load more).

### `renderBranchRow` / `renderCommitRow` / `renderFileRow`

```typescript
renderBranchRow(branch: BranchEntry, isSelected: boolean): HTMLElement
renderCommitRow(commit: CommitEntry, isSelected: boolean): HTMLElement
renderFileRow(file: DiffStatEntry): HTMLElement
```

Individual row renderers. Useful if you want to build a custom panel layout but reuse the row rendering.

- **Branch row**: When `isSelected=true`, renders with a blue highlight background (`rgba(74,158,255,0.08)`) and shows the last commit detail below the branch name. When `isSelected=false`, renders as a single-line row.
- **Commit row**: When `isSelected=true`, adds a subtle blue highlight (`rgba(74,158,255,0.06)`) background.
- **File row**: Shows a status icon (green `+` for added, red `−` for deleted, blue arrow for renamed, amber tilde for modified), filename, and added/deleted line counts in green/red.

### `renderLoading` / `renderError`

```typescript
renderLoading(container: HTMLElement): void
renderError(container: HTMLElement, message: string, onRetry: () => void): void
```

Utility methods. `renderLoading` replaces the container's inner HTML with a centered spinner. `renderError` shows an error message with a "Retry" button that calls `onRetry` on click.

---

## Callback Contract

The `GitBrowserCallbacks` interface defines **all user interaction events**. Your implementation must handle each one:

| Callback                          | Trigger                                     | Expected behaviour                                                                    |
| --------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------- |
| `onSelectBranch(name)`            | Click on a branch row                       | Switch `selectedBranch`, re-fetch commits/files, set `selectedCommit` to first commit |
| `onSelectCommit(hash \| null)`    | Click on a commit row                       | Set `selectedCommit` to the hash (or `null` to deselect), show files for that commit  |
| `onRefreshBranches()`             | Click refresh button in branches header     | Reload branch list, reset to initial state                                            |
| `onRefreshCommits()`              | Click refresh button in commits header      | Reload commit list for the current branch                                             |
| `onRefreshFiles()`                | Click refresh button in files header        | Reload file list for the current commit                                               |
| `onLoadMoreCommits()`             | Click "Show more" button                    | Append more commits, increment `commitSkipCount`, update `visibleCommitCount`         |
| `onClose()`                       | Close button (not yet wired in renderer)    | Dismiss the panel                                                                     |
| `onCheckoutWorktree(name)`        | Checkout action (not yet wired in renderer) | Create a worktree for the branch                                                      |
| `onBranchContextMenu(name, x, y)` | Right-click on a branch row                 | Show a context menu at the cursor position                                            |
| `onFileRowClick(path)`            | Click on a file row                         | Open the file in an editor                                                            |

### Important note about the commit click handler

The renderer's internal click handler passes `null` when clicking the **already-selected** commit:

```typescript
// Inside _renderCommitsContent:
row.addEventListener("click", () => {
  callbacks.onSelectCommit(commit.hash === data.selectedCommit ? null : commit.hash);
});
```

If you want radio-style selection (always one commit selected, never deselect), guard against `null` in your callback:

```typescript
onSelectCommit: (commitHash) => {
  if (!commitHash || commitHash === state.selectedCommit) return;
  state.selectedCommit = commitHash;
  // ... update files section
};
```

---

## Integration Patterns

### 1. Wiring into a Controller

When integrating into an Openp41ge `PaneController`, the typical pattern is:

```typescript
class GitRepositoryController implements TabController {
  private _panelEl: HTMLElement | null = null;
  private _data: GitBrowserData = createInitialData();
  private _container: HTMLElement;

  constructor(container: HTMLElement, tabId: string) {
    this._container = container;
  }

  mount(): void {
    const callbacks = this._createCallbacks();
    this._panelEl = gitBrowserRenderer.renderGitPanel(this._data, callbacks);
    this._container.appendChild(this._panelEl);
  }

  unmount(): void {
    this._panelEl?.remove();
    this._panelEl = null;
  }

  private _createCallbacks(): GitBrowserCallbacks {
    return {
      onSelectBranch: (name) => {
        /* ... */
      },
      onSelectCommit: (hash) => {
        /* ... */
      },
      // ... etc
    };
  }
}
```

### 2. Handling Branch Selection

```typescript
onSelectBranch: (branchName) => {
  // 1. Update state
  state.selectedBranch = branchName;
  state.selectedCommit = null;
  state.loadingCommits = true;

  // 2. Show loading state
  gitBrowserRenderer.replaceSection(panelEl, "commits", state, callbacks);
  gitBrowserRenderer.replaceSection(panelEl, "branches", state, callbacks);

  // 3. Fetch from backend
  fetchCommits(branchName).then(({ commits, files }) => {
    state.commits = commits;
    state.filesChanged = files;
    state.visibleCommitCount = Math.min(10, commits.length);
    state.loadingCommits = false;
    state.selectedCommit = commits[0]?.hash ?? null;

    // 4. Re-render affected sections
    gitBrowserRenderer.replaceSection(panelEl, "commits", state, callbacks);
    gitBrowserRenderer.replaceSection(panelEl, "files", state, callbacks);
  });
};
```

### 3. Handling Commit Selection

```typescript
onSelectCommit: (commitHash) => {
  // Radio-style guard: clicking the same commit is a no-op
  if (!commitHash || commitHash === state.selectedCommit) return;

  // 1. Update selection
  state.selectedCommit = commitHash;
  state.loadingFiles = true;

  // 2. Show loading for files section
  gitBrowserRenderer.replaceSection(panelEl, "commits", state, callbacks);
  gitBrowserRenderer.replaceSection(panelEl, "files", state, callbacks);

  // 3. Fetch files
  fetchFilesForCommit(commitHash).then((files) => {
    state.filesChanged = files;
    state.loadingFiles = false;
    gitBrowserRenderer.replaceSection(panelEl, "files", state, callbacks);
  });
};
```

### 4. Partial Section Updates

Use `replaceSection` instead of re-rendering the full panel:

```typescript
// After "Show more" click:
state.visibleCommitCount = Math.min(state.visibleCommitCount + 10, state.commits.length);
state.hasMoreCommits = state.visibleCommitCount < state.commits.length;
gitBrowserRenderer.replaceSection(panelEl, "commits", state, callbacks);
```

This preserves:

- Collapse/expand state of all sections
- Event listeners on unchanged sections
- Scroll positions in other sections

### 5. Loading and Error States

```typescript
// Show loading
state.loadingBranches = true;
gitBrowserRenderer.replaceSection(panelEl, "branches", state, callbacks);

// Show error (uses renderError which replaces panel contents)
gitBrowserRenderer.renderError(panelEl, "Failed to fetch: timeout", () => {
  // Retry: re-render the full panel
  const freshPanel = gitBrowserRenderer.renderGitPanel(state, callbacks);
  panelEl.innerHTML = "";
  panelEl.appendChild(freshPanel);
});
```

---

## DOM Structure

The panel rendered by `renderGitPanel` has this structure:

```
div (panel root: flex column, height 100%)
  └── div (body: flex column, overflow hidden)
      ├── div [data-section="branches"] (flex column)
      │   ├── div.git-section-header (click to collapse/expand)
      │   │   ├── span (chevron SVG ▼ or ▶)
      │   │   ├── span (label: "Branches (N)")
      │   │   ├── span.git-section-spinner (visible when loading)
      │   │   └── span (refresh button ↻)
      │   └── div.git-section-body (overflow-y: auto)
      │       └── div (wrapper: flex column)
      │           ├── div (branch row: clickable)
      │           │   ├── span (dot: ● current/selected, ○ local, ↗ remote)
      │           │   ├── span (branch short name)
      │           │   └── span (badges: ↑N ↓N)
      │           └── ...
      ├── div [data-section="commits"]
      │   └── ... (similar structure)
      │       └── div (wrapper)
      │           ├── div (commit row: clickable)
      │           │   ├── div (hash)
      │           │   ├── div (message)
      │           │   └── div (author · relative date)
      │           ├── ...
      │           └── div ("Show more" button)
      └── div [data-section="files"]
          └── ... (similar structure)
              └── div (wrapper)
                  ├── div (file row: clickable)
                  │   ├── span (status SVG icon)
                  │   ├── span (file path)
                  │   └── span (+N -N counts)
                  └── ...
```

### Key selectors

| Purpose           | Selector                                                  |
| ----------------- | --------------------------------------------------------- |
| Section container | `[data-section="branches"]`                               |
| Section header    | `.git-section-header`                                     |
| Section body      | `.git-section-body`                                       |
| Loading spinner   | `.git-section-spinner`                                    |
| Branch rows       | `[data-section="branches"] .git-section-body > div > div` |
| Commit rows       | `[data-section="commits"] .git-section-body > div > div`  |
| File rows         | `[data-section="files"] .git-section-body > div > div`    |
| Show more button  | `[data-section="commits"] div:has-text("Show more")`      |

---

## Gotchas & Pitfalls

### 1. Section collapse state is module-level

`_sectionStates` is a `Map<SectionKey, boolean>` stored on the **singleton renderer instance**, not per-panel. If you have multiple panels on the page, collapsing a section in one will affect the initial state of the same section in other panels. Each panel's runtime toggle is independent after render (the click handler toggles the local DOM), but the initial expanded/collapsed state is shared.

**Workaround**: Call `gitBrowserRenderer["_sectionStates"].set(key, true)` before each `renderGitPanel` if you want all sections expanded.

### 2. `renderError` destroys the panel

`renderError()` calls `container.innerHTML = ...`, which destroys the full panel DOM. After calling it, you must do a full re-render to restore the panel. Use `renderError` only for top-level error states (e.g., network failure on initial load). For per-section errors, handle them inside callbacks by setting `data.error` and re-rendering.

### 3. `replaceSection` needs the panel root

Pass the **panel root** (the element returned by `renderGitPanel`) to `replaceSection`, not a container wrapper. It queries `panel.querySelector('[data-section="..."]')` to find the old section.

### 4. Scroll position resets on `renderGitPanel`

Every call to `renderGitPanel` creates an entirely new DOM tree. Scroll positions in section bodies are lost. Use `replaceSection` for targeted updates to preserve scroll.

### 5. Branch rows have two render modes

When a branch is **selected** (`branch.name === data.selectedBranch`), `renderBranchRow` calls `_renderSelectedBranchRow`, which renders a two-line layout (name line + last commit detail). When **unselected**, it renders a single compact line. The dot icon logic:

| Condition           | Icon         | Color            |
| ------------------- | ------------ | ---------------- |
| `isSelected`        | `●` (filled) | `#4a9eff` (blue) |
| `isCurrent` (HEAD)  | `●` (filled) | `#4a9eff` (blue) |
| `!isLocal` (remote) | `↗` (arrow)  | `#555` (gray)    |
| Otherwise           | `○` (empty)  | `#666` (gray)    |

### 6. Commit click passes null for already-selected

The renderer's click handler calls `onSelectCommit(commit.hash === data.selectedCommit ? null : commit.hash)`. If you want radio-style selection, guard against `null` at the start of your callback.

### 7. Loading flags are ORed for commits/files

The commits section shows loading when `data.loadingCommits || data.loadingBranches`. The files section shows loading when `data.loadingFiles || data.loadingBranches`. This means switching branches also triggers loading spinners in commits and files sections — which is the expected UX.

### 8. `visibleCommitCount` vs `commits.length`

The renderer slices `data.commits.slice(0, data.visibleCommitCount)` to determine which commits to show. The "Show more" button appears when `data.commits.length > data.visibleCommitCount || data.hasMoreCommits`. This allows you to set `visibleCommitCount` lower than the full array for paginated loading.

### 9. Inline SVG icons

The file status icons are inline SVGs set via `innerHTML`. If the demo page or consumer stylesheet doesn't define the `wt-spin` keyframe animation, the loading spinner will be static. Ensure this CSS is available:

```css
@keyframes wt-spin {
  to {
    transform: rotate(360deg);
  }
}
```

### 10. Light DOM throughout

All elements use Light DOM (no Shadow DOM). This means your global stylesheets can target classes like `.git-section-header`, `.git-section-body`, and `.git-section-spinner`.

---

## Demo Development

A standalone demo is available at `packages/openp41ge-git-repository/demo/`.

```bash
cd packages/openp41ge-git-repository
pnpm dev:demo   # starts Vite dev server with HMR, opens browser
pnpm test:e2e   # runs 11 Playwright E2E tests in headless Chromium
```

The demo generates mock git data via `demo/mock-data.ts` and manages state in `demo/demo-app.ts`. It exercises all rendering paths: loading, empty, error, and normal states. When adding new features to the renderer, update the demo to cover the new state.
