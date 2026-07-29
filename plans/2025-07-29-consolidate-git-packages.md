2025-07-29

# Consolidate Git Packages — openp41ge-git as the Single Source of Truth

## Goal

Make `openp41ge-git` the **only** git-related package. Move all git UI rendering logic into it (merging `openp41ge-git-repository`). Create a dumb `<git-repository-panel>` Lit web component in uikit that receives data via properties and fires events up. The main `openp41ge` app wires data flow: passes data from `openp41ge-git` → component, listens to events → calls `openp41ge-git` functions → updates data.

## Rationale

- `openp41ge-git` and `openp41ge-git-repository` have **duplicate types** (`BranchEntry`, `CommitEntry`, `DiffStatEntry`) with different shapes — a source of bugs
- The `gitBrowserRenderer` is a DOM renderer utility, not a web component — hard to test, no reactive updates
- Current `GitRepositoryController` mixes data fetching, DOM manipulation, and event handling — violates SRP
- Events-up/data-down makes the UI testable and the data flow explicit

## Approach

### Phase 1: Merge `openp41ge-git-repository` into `openp41ge-git`

- Move `gitBrowserRenderer.ts` (the DOM rendering utility) into `openp41ge-git/src/`
- Move `GitBrowserData`, `GitBrowserCallbacks`, and the enriched UI types into `openp41ge-git/src/types.ts` alongside the existing git service types
- Enrich `openp41ge-git` types to include all UI-friendly fields (`shortHash`, `relativeDate`, `shortName`, `isCurrent`, `isLocal`, `filePath`, `added`, `deleted`, `status`)
- Delete `packages/openp41ge-git-repository/`
- Remove `openp41ge-git-repository` dependency from uikit

### Phase 2: Create `<git-repository-panel>` web component in uikit

A Lit web component at `packages/openp41ge-uikit/src/components/git-repository-panel/` that:

- **Property**: `data: GitBrowserData` — the full data snapshot
- **Events** (bubbling `CustomEvent`s):
  - `git-select-branch` — detail: `{ branchName: string }`
  - `git-select-commit` — detail: `{ commitHash: string | null }`
  - `git-refresh-branches` — no detail
  - `git-refresh-commits` — no detail
  - `git-refresh-files` — no detail
  - `git-load-more-commits` — no detail
  - `git-close` — no detail
  - `git-checkout-worktree` — detail: `{ branchName: string }`
  - `git-branch-context-menu` — detail: `{ branchName: string, x: number, y: number }`
  - `git-file-row-click` — detail: `{ filePath: string }`
- Uses `gitBrowserRenderer` internally (from `openp41ge-git`) to build the DOM structure
- On property change (`data`), calls `gitBrowserRenderer.renderGitPanel()` or `replaceSection()` to update
- Delegates user interactions to event dispatch instead of callback invocation
- Manages the "Loading" state based on `data.loadingBranches/loadingCommits/loadingFiles` flags
- Handles error state from `data.error`

### Phase 3: Refactor `GitRepositoryController`

- Creates `<git-repository-panel>` element on mount
- Sets `data` property with fetched git data
- Listens to component events with `element.addEventListener()`
- In each handler, calls `window.openp41ge.workspaceController.*` to perform the operation
- After the operation completes, fetches updated data and sets it back on the component's `data` property

### Phase 4: Clean up

- Remove `openp41ge-git-repository` from `pnpm-workspace.yaml`, root `project.json`, nx graph
- Remove remaining re-exports from uikit's `index.ts` for `openp41ge-git-repository`
- Update app imports

## SOLID Review

- **S** — `GitRepositoryController` currently does data fetching, DOM rendering, and event handling. After refactor, it only orchestrates data flow (data fetching via workspaceController, passing data to component, handling events). The component handles DOM rendering.
- **D** — The `<git-repository-panel>` component has no knowledge of `window.openp41ge.workspaceController` or IPC — it just receives data and fires events. Clean dependency inversion.

## Files Changed

### New files
- `packages/openp41ge-uikit/src/components/git-repository-panel/git-repository-panel.ts` — Lit web component
- `packages/openp41ge-uikit/src/components/git-repository-panel/index.ts` — re-export

### Modified files
- `packages/openp41ge-git/src/index.ts` — add exports for `gitBrowserRenderer`, new types
- `packages/openp41ge-git/src/types.ts` — enrich with UI types (`GitBrowserData`, `GitBrowserCallbacks`, UI-friendly fields)
- `packages/openp41ge-uikit/src/index.ts` — export `<git-repository-panel>`, remove `openp41ge-git-repository` re-exports
- `packages/openp41ge-uikit/package.json` — add `openp41ge-git` dependency
- `packages/openp41ge/src/renderer/apps/git-repository/git-repository-controller.ts` — use `<git-repository-panel>` component

### Deleted files
- `packages/openp41ge-git-repository/` — entire package (3 files)
- `packages/openp41ge-uikit/src/git-repository/` — entire directory (index.ts barrel)

## UX Considerations

- Follow existing tab pattern: component fills pane container, uses theme CSS variables
- Loading spinners use `data.loadingBranches/loadingCommits/loadingFiles`
- Error state shows retry button (handled via component re-render and event dispatch)
- Component height: 100% of parent container with overflow hidden; internal sections scroll independently (same as current behaviour)

## Testing Strategy

- Unit test `gitBrowserRenderer` (already testable — pure DOM builder)
- Component test: create `<git-repository-panel>`, set `data` property, verify DOM structure
- Controller test: mount controller, verify component is created, dispatch event, verify workspaceController method is called

## Completion Criteria

- [x] `openp41ge-git` exports all types + `gitBrowserRenderer`
- [x] `openp41ge-git-repository` deleted entirely
- [x] `<git-repository-panel>` component created in uikit
- [x] `GitRepositoryController` uses the component w/ events-up/data-down
- [x] `nx build` passes
- [ ] `nx dev` launches git-repository tab without errors
