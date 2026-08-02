2026-08-02

# Worktree Verification

## Goal

Add worktree branch verification to the workspace manager, mirroring the repo verification flow. When a user adds a worktree (branch name), verify that the branch can be safely checked out by checking local/remote existence and divergence state.

## Rationale

Currently worktrees are added without any validation — any string is accepted. This can lead to:
- Creating worktrees for branches that don't exist
- Checking out branches that have diverged local/remote state
- Unclear error messages when git operations fail downstream

## Approach

### Worktree Entry Type

Extend the worktree model to carry verification state, mirroring `CreateRepoEntry`:

```typescript
interface WorktreeEntry {
  name: string;
  status: "unverified" | "validating" | "success" | "failure" | "diverged" | "needs-sync";
  errorMessage?: string;
}
```

The `worktrees: string[]` on `CreateRepoEntry` becomes `worktrees: WorktreeEntry[]`.

### Verification Statuses

| Status        | Meaning                                      | UI                    |
|---------------|----------------------------------------------|-----------------------|
| `unverified`  | Just added, not checked                      | Chevron + name        |
| `validating`  | Running checks                               | Spinner               |
| `success`     | Branch is safe to check out                  | Green checkmark       |
| `failure`     | Branch doesn't exist locally or remotely     | Red X + error message |
| `diverged`    | Local and remote have diverged               | Red X + error message |
| `needs-sync`  | One is ahead/behind the other — sync offered | Sync button           |

### Verification Flow (simulated, matching repo pattern)

When a worktree is added:
1. Set status to `"validating"`, emit update
2. After 1.5s simulated delay, randomly pick:
   - 40% → `"success"`
   - 20% → `"failure"` (no branch exists)
   - 20% → `"diverged"` (local and remote diverged)
   - 20% → `"needs-sync"` (one is ahead/behind)

### Sync Action

When status is `"needs-sync"`, show a sync button (new `sync` icon) next to the worktree name. Clicking sync:
1. Sets status to `"validating"`
2. After 1s, sets to `"success"`

### UI Changes

Each worktree row renders:
```
[corner icon] [worktree name] [status icon or sync button]
```

The status icon follows the same pattern as repo verification:
- Hidden when `unverified`
- Spinner when `validating`
- Checkmark when `success`
- Retry icon when `failure`
- Diverged: failure icon with "Local and remote branches have diverged" message
- Needs-sync: sync icon + "Branch ahead/behind remote. Sync to continue" message

### New Icon: `sync`

Add the sync icon (two arrows forming a circle) to the icon registry, matching the SVG the user provided.

## Files Changed

| File | Change |
|------|--------|
| `packages/openp41ge-uikit/src/icons/registry.ts` | Add `sync` icon |
| `packages/openp41ge-uikit/src/components/openp41ge-inline-icon.stories.ts` | Add `sync` to AllInlineIcons grid |
| `packages/openp41ge/src/renderer/apps/system-tabs/workspace-manager-system-tab.ts` | Worktree verification logic, UI, sync action |
| `plans/2026-08-02-worktree-verification.md` | This plan |

## Testing Strategy

No automated tests (simulated flow). Manual verification:
- Add worktree → verify spinner appears, then checkmark on success
- Add worktree → verify error states render correctly
- Click sync when `needs-sync` → verify sync flow completes

## UX Considerations

- Worktree verification matches the repo verification pattern (1.5s delay, spinner, success/failure)
- Sync button only shows for `needs-sync` status
- Error messages shown below the worktree row (same pattern as repo errors)
- Worktree cannot be deleted while `"validating"` (optional — may be too restrictive)

## Open Questions

- Should we block deleting a worktree while it's validating?
- The sync icon is a Material "sync" icon — should we use the Material-filled style (like other icons) or the stroke-based style?

## Completion Criteria

- [ ] `sync` icon added to registry and storybook
- [ ] Worktree entries carry verification status (not just plain strings)
- [ ] Adding a worktree triggers simulated verification
- [ ] Success/failure/diverged/needs-sync states render correctly
- [ ] Sync button triggers sync flow
- [ ] Error messages display below worktree row
