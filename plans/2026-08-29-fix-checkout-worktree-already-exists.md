2026-08-29

# Fix worktree checkout collision ("branch already exists")

## Goal

Make `NodeGitService.checkoutWorktree` idempotent and collision-tolerant so workspace activation (and concurrent activation from multiple windows) never fails with `fatal: a branch named '<branch>' already exists`.

## Symptom

After activating a workspace, a load of main-process errors:

```
[MAIN PROCESS] Error occurred in handler for 'workspace:checkoutWorktree':
Error: git error: fatal: a branch named 'feat/of-7' already exists
```

Every repo-ref branch errored the same way while the two open windows (`win-…` smoke window + `win-ws1-0`) materialized the same workspace concurrently against the freshly re-rooted repos dir (`~/.openp41ge/repositories`).

## Root cause

`checkoutWorktree` in `packages/openp41ge/src/main/services/node-git-service.ts`:

1. Skips if the worktree dir exists (idempotent in the happy path).
2. Else checks `git rev-parse --verify <branch>`; on failure checks `git ls-remote origin <branch>`; **else runs `git branch <branch>`** (create-from-HEAD path).
3. `git branch <branch>` fails with `fatal: a branch named '<branch>' already exists` whenever the branch already exists but the earlier rev-parse misdetected it (concurrent clone/activation: a second window's `clone()` short-circuits on `fs.existsSync(gitDir)` while the first window is still mid-clone, so refs aren't visible yet → rev-parse fails → `git branch` collides with the branch the other window just created).
4. There is no handling for "branch already exists" or "worktree already checked out" — the collision is rethrown and surfaces as a user-visible error.

Reproduced: `git branch feat/of-7` on an existing branch in the app's bare layout prints exactly `fatal: a branch named 'feat/of-7' already exists`. A second activation pass succeeds because by then the worktree dirs exist (early-return), which is why the errors are transient but noisy.

## Approach

Rewrite `checkoutWorktree` to be robust against the observed collisions:

- **Idempotent**: if the worktree dir already exists → return `{ exists: true }` (unchanged).
- **Create-from-HEAD path**: `git branch <b>` failure with "already exists" is treated as "branch now exists" and falls through to `git worktree add` on the existing branch (never throws for this message).
- **Worktree collision**: `git worktree add` failing with "already used by worktree" / "already checked out" is treated as already-materialized → re-check the dir and return success.
- Any other git failure still propagates.

Scope: `node-git-service.ts` only. The cross-window clone race (`clone()` short-circuit on an in-progress clone dir) is the enabler and is noted rather than redesigned here — the checkout hardening makes the visible symptom impossible.

## Files Changed

- `packages/openp41ge/src/main/services/node-git-service.ts` — robust `checkoutWorktree`
- `packages/openp41ge/test/unit/services/node-git-service.test.ts` — **new** regression tests (real temp git repos)

## Testing Strategy

- Test-first: write `node-git-service.test.ts` (creates a real local source repo, bare-clones it into the app layout via NodeGitService's clone, then exercises checkoutWorktree):
  - idempotent second call (worktree exists) → returns `exists: true`, no throw
  - branch exists as local ref, no worktree → creates worktree (regression: pre-creating the branch like the collision scenario must not throw "already exists")
  - branch exists only on remote → fetch + worktree
  - branch doesn't exist → creates it + worktree
  - repeated calls across scenarios never throw "branch already exists"
- Confirm the collision case fails on current code, then fix, then green.
- `nx run openp41ge:test:unit`, typecheck, lint.
- Runtime: restart main, re-activate workspace → zero checkout errors; close the leftover smoke window.

## Completion Criteria

- [x] `git branch` collision no longer thrown from `checkoutWorktree` (regression test — failed pre-fix with the exact reported message, passes post-fix)
- [x] Worktree materialization idempotent for existing/remote/new branches (6 unit tests, real git)
- [x] `nx run openp41ge:test:unit` — new tests green; the only suite failures are the 2 **pre-existing** `openp41ge-syntax-highlighting/textmate-init` alias-resolution failures (confirmed identical at HEAD with the fix reverted); typecheck + lint green
- [x] Dev-app: re-checkout through the real `workspace:checkoutWorktree` IPC re-materializes a cleanly-removed worktree with no error and is idempotent on repeat; zero captured errors, no overlay

## Notes

- The error surfaced during re-materialization into the newly re-rooted repos dir (project-picker migration) with two windows activating the same workspace concurrently — checkouts raced a clone-in-progress. Root fix here is checkout tolerance; the cross-window `clone()` short-circuit race remains noted as an enabler (not redesigned).
