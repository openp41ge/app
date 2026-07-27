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
│   ├── clone-session.ts      # CloneSession — progress, abort, promise wrapper
│   └── types.ts              # Shared types (CloneResult, CloneProgress, WorktreeInfo, etc.)
├── test/
│   └── git-service.test.ts   # Unit tests with in-memory model
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
  pullBranch(repoName: string, branch: string): Promise<void>;
  onRepoRefsChanged(callback: () => void): () => void;
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
- Pull branch
- Shows loading, error, and empty states

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
    private _adapter: GitAdapter = new IpcGitAdapter()
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
- `packages/openp41ge-git/package.json` — npm package config
- `packages/openp41ge-git/project.json` — Nx targets (build, test, typecheck, clean)
- `packages/openp41ge-git/tsconfig.json` — TypeScript config
- `packages/openp41ge-git/vite.config.ts` — Vite build config (library mode)
- `packages/openp41ge-git/vitest.unit.config.ts` — Vitest config
- `packages/openp41ge-git/src/index.ts` — Public API
- `packages/openp41ge-git/src/types.ts` — Shared types
- `packages/openp41ge-git/src/git-service.ts` — Main service class
- `packages/openp41ge-git/src/ipc-adapter.ts` — Production IPC adapter
- `packages/openp41ge-git/src/test-adapter.ts` — Test in-memory adapter
- `packages/openp41ge-git/src/clone-session.ts` — Clone session wrapper
- `packages/openp41ge-git/test/git-service.test.ts` — Unit tests
- `packages/openp41ge-git-demo/package.json` — Demo app config
- `packages/openp41ge-git-demo/project.json` — Nx targets
- `packages/openp41ge-git-demo/index.html` — Entry HTML
- `packages/openp41ge-git-demo/vite.config.ts` — Vite config
- `packages/openp41ge-git-demo/src/index.ts` — Demo entry

### Modified files
- `packages/openp41ge/src/renderer/components/openp41ge-worktree-tree.ts` — Use `GitService`
- `packages/openp41ge/src/renderer/components/openp41ge-project-picker.ts` — Use `GitService`

### No changes to
- IPC handlers (electron/) — the `workspaceController.*` API stays as-is
- Preload bridge (electron/preload.cjs) — no changes needed
- `global.d.ts` — no changes needed (the types are already defined)
- Layout data model — no changes

## Testing Strategy

### Unit tests (Vitest)
| Test                          | What it covers                                       |
| ----------------------------- | ---------------------------------------------------- |
| `clone()`                     | URL validation, session creation, progress callback, success/error result |
| `listRepos()`                 | Returns repo list, empty list, handles errors        |
| `removeRepo()`                | Removes repo, handles missing repo                   |
| `listWorktrees()`             | Returns worktree list, empty list                    |
| `addWorktree()`               | Adds worktree, handles duplicate branch              |
| `deleteWorktree()`            | Deletes worktree, handles missing worktree           |
| `checkoutWorktree()`          | Checks out worktree, handles invalid branch          |
| `listBranches()`              | Returns branch list, handles missing repo            |
| `pullBranch()`                | Pulls branch, handles errors                         |
| `onRepoRefsChanged()`         | Subscription/unsubscription lifecycle                |

All tests use `TestGitAdapter` (in-memory, no I/O).

### E2E tests
None for the package itself (it's a service layer). The existing Playwright tests
continue to verify the full app.

### Demo as manual test
The demo app (`openp41ge-git-demo`) serves as an interactive manual test harness.

## UX Considerations

This is a service-layer extraction — no user-facing UX changes. The consuming
components (`worktree-tree`, `project-picker`) keep their existing UI patterns
(spinners, progress bars, confirm/cancel). The plan is strictly about where the
logic lives.

## Open Questions

1. Should `GitService` be a singleton or instantiated per-consumer? (Prefer singleton
   to share state like `onRepoRefsChanged` subscriptions.)
2. Should the URL validation live in `GitService.clone()` or stay in the UI layer?
   (Plan proposes moving it to `GitService` for consistency.)

## Completion Criteria

- [ ] `openp41ge-git` package builds, typechecks, and passes unit tests
- [ ] `openp41ge-git-demo` dev server runs and exercises all operations
- [ ] `openp41ge-worktree-tree` uses `GitService` via DI, all existing tests pass
- [ ] `openp41ge-project-picker` uses `GitService` via DI, all existing tests pass
- [ ] `nx build` succeeds across the monorepo
- [ ] `nx test` (all vitest) passes (582+ tests)
