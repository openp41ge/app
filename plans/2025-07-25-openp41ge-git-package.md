2025-07-25

# Plan: Extract shared git operations into `openp41ge-git` package

## Goal

Create a new `openp41ge-git` library package that wraps all git-related IPC calls
(`workspaceController.*`) behind a clean service-layer API, and update the two
consumers — `openp41ge-worktree-tree` (explorer) and `openp41ge-project-picker`
(project switcher) — to use it. The package is pure service layer with no UI
components; a demo package (`openp41ge-git-demo`) provides interactive testing.

## Rationale

Cloning logic and worktree management are currently duplicated across two components:

- `openp41ge-worktree-tree.ts` — `_startClone()`, `_confirmAddRepo()`, worktree
  lifecycle (add, delete, checkout, pull), workspace management
- `openp41ge-project-picker.ts` — `_confirmAddRepo()` with clone + progress

Both call `window.openp41ge.workspaceController.*` directly with the same patterns.
A shared package eliminates duplication, provides a single place for URL validation,
progress tracking, error handling, and makes future git operations (e.g., fetch,
diff, status) consistently available.

## Approach

### Package: `openp41ge-git`

A library (no UI components, no Lit dependency) with:

```
packages/openp41ge-git/
├── src/
│   ├── index.ts              # Public API — re-exports
│   ├── git-service.ts        # GitService class — all git operations
│   ├── git-adapter.ts        # GitAdapter interface
│   ├── ipc-adapter.ts        # IpcGitAdapter — production, delegates to workspaceController
│   ├── test-adapter.ts       # TestGitAdapter — in-memory, no I/O
│   ├── clone-session.ts      # CloneSession — progress, abort, promise wrapper
│   └── types.ts              # Shared types (CloneResult, CloneProgress, WorktreeInfo, etc.)
├── test/
│   └── git-service.test.ts   # 19 unit tests with in-memory model
├── package.json
├── project.json
├── tsconfig.json
├── vite.config.ts
└── vitest.unit.config.ts
```

**GitService class:**

```typescript
class GitService {
  clone(url: string): CloneSession;
  listRepos(): Promise<RepoInfo[]>;
  getRepo(name: string): Promise<RepoInfo | null>;
  removeRepo(repoName: string): Promise<void>;
  listWorktrees(repoName: string): Promise<WorktreeInfo[]>;
  checkoutWorktree(repoName: string, branch: string): Promise<WorktreeInfo>;
  addWorktree(repoName: string, branch: string): Promise<WorktreeInfo>;
  deleteWorktree(repoName: string, branch: string): Promise<void>;
  listBranches(repoName: string): Promise<string[]>;
  getDefaultBranch(repoName: string): Promise<string | null>;
  pullBranch(repoName: string, branch: string): Promise<void>;
  fetch(repoName: string): Promise<void>;
  deleteLocalBranch(repoName: string, branchName: string, force?: boolean): Promise<void>;
  getCommitLog(repoName: string, branch: string, options?): Promise<CommitEntry[]>;
  getBranches(repoName: string): Promise<BranchEntry[]>;
  getDiffStat(repoName: string, commitHash?: string): Promise<DiffStatEntry[]>;
  getUntrackedFiles(repoName: string): Promise<string[]>;
  worksetAddRepo(name: string, url: string, worktrees?: string[]): Promise<boolean>;
  worksetRemoveRepo(name: string): Promise<boolean>;
  worksetHasRepo(name: string): Promise<boolean>;
  worksetAddWorktreeToRepo(repoName: string, branch: string): Promise<boolean>;
  worksetGetRepoRefs(): Promise<string>;
  onWorksetRepoRefsChanged(callback: () => void): () => void;
}
```

**CloneSession:**

```typescript
class CloneSession {
  readonly promise: Promise<CloneResult>;
  onProgress(fn: (progress: CloneProgress) => void): () => void;
  destroy(): void;
}
```

### Package: `openp41ge-git-demo`

A demo app (Vite dev server) that exercises all git operations interactively:

- Clone a repo with progress display
- List repos with remove button
- List/add/delete worktrees
- Add branches, show default branch
- Pull/fetch buttons
- Shows loading, error, and empty states
- Pre-seeded with demo data

### Changes to consumers

**openp41ge-worktree-tree.ts:**
- Import `GitService` from `openp41ge-git`
- Replace all `window.openp41ge.workspaceController.*` calls with `gitService.*`
- Remove inline clone/progress logic in favor of `CloneSession`

**openp41ge-project-picker.ts:**
- Import `GitService` from `openp41ge-git`
- Replace `workspaceController.clone()` call with `gitService.clone()`
- Remove URL validation (delegate to `GitService`)

### Solver model (testability)

To keep the package testable without IPC, use the project's model-based DI pattern:

```typescript
// src/git-service.ts
export class GitService {
  constructor(
    private _adapter: GitAdapter
  ) {}
}
```

Where `GitAdapter` is an interface with two implementations:

| Implementation   | File               | Behaviour                    |
| ---------------- | ------------------ | ---------------------------- |
| `IpcGitAdapter`  | `src/ipc-adapter.ts` | Delegates to `window.openp41ge.workspaceController.*` |
| `TestGitAdapter` | `src/test-adapter.ts` | Pure in-memory, no I/O     |

This follows the same pattern as `RepoService` / `TestRepoService` in the main app.

## Files Changed

### New files
- `packages/openp41ge-git/package.json`
- `packages/openp41ge-git/project.json`
- `packages/openp41ge-git/tsconfig.json`
- `packages/openp41ge-git/vite.config.ts`
- `packages/openp41ge-git/vitest.unit.config.ts`
- `packages/openp41ge-git/src/index.ts`
- `packages/openp41ge-git/src/types.ts`
- `packages/openp41ge-git/src/git-service.ts`
- `packages/openp41ge-git/src/git-adapter.ts`
- `packages/openp41ge-git/src/ipc-adapter.ts`
- `packages/openp41ge-git/src/test-adapter.ts`
- `packages/openp41ge-git/src/clone-session.ts`
- `packages/openp41ge-git/test/git-service.test.ts`
- `packages/openp41ge-git-demo/package.json`
- `packages/openp41ge-git-demo/project.json`
- `packages/openp41ge-git-demo/index.html`
- `packages/openp41ge-git-demo/vite.config.ts`
- `packages/openp41ge-git-demo/src/index.ts`

### Modified files
- `packages/openp41ge/src/renderer/components/openp41ge-project-picker.ts` — Use `GitService`
- `packages/openp41ge/vite.config.ts` — Source alias for openp41ge-git
- `packages/openp41ge/package.json` — Added workspace dependency

### Still to update
- `packages/openp41ge/src/renderer/components/openp41ge-worktree-tree.ts` — Use `GitService`

### No changes to
- IPC handlers (electron/) — the `workspaceController.*` API stays as-is
- Preload bridge (electron/preload.cjs) — no changes needed
- `global.d.ts` — no changes needed
- Layout data model — no changes

## Testing Strategy

### Unit tests (Vitest)
19 tests covering clone validation, progress, destroy, repos CRUD, worktree lifecycle,
and branch listing — all using `TestGitAdapter` (in-memory, no I/O).

### Demo as manual test
The demo app (`openp41ge-git-demo`) serves as an interactive manual test harness.

## UX Considerations

This is a service-layer extraction — no user-facing UX changes. The consuming
components (`worktree-tree`, `project-picker`) keep their existing UI patterns
(spinners, progress bars, confirm/cancel). The plan is strictly about where the
logic lives.

## Completion Criteria

- [x] `openp41ge-git` package builds, typechecks, and passes unit tests (19 tests)
- [x] `openp41ge-git-demo` builds and runs, exercising all operations
- [x] `openp41ge-project-picker` uses `GitService` via DI
- [ ] `openp41ge-worktree-tree` uses `GitService` via DI, all existing tests pass
- [x] `nx build` succeeds across the monorepo (git package + demo)
- [x] `nx test` (all vitest) passes (582 tests)
