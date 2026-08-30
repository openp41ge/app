2026-08-30

# Explorer repos become workspace-backed + reuse Workspaces overlay repo status

## Goal

Repos belong to the **workspace**, never to a window-global list. The Explorer's "Add
repository" is just a convenience entry point for the same workspace repo the Workspaces
overlay manages. Remove the legacy per-window `repoRefs` ("global repos") mechanism entirely
and drive the Explorer from the active workspace file. While in here, fix the add-repo input
focus outline and make the worktree warning icon actionable (opens the overlay's existing
repo-status bar).

## Scope (4 UX directives from the user + removal)

1. **Add-repo input: no blue focus outline** — keep the row's focus ring, kill the input's.
2. **Clone ⇒ bare only, zero worktrees** — add-repo clones the bare repo and creates nothing;
   the user adds worktrees as needed. No phantom default-branch row, no auto worktree.
3. **Warning icon clickable** — clicking a worktree/repo warning opens the Workspaces overlay
   at that repo's existing status bar (reuse — no new status UI in the explorer).
4. **Explorer-added repo appears in the Workspaces overlay** — same workspace `repos` list,
   so it's there automatically once #removal lands.
5. **Remove "global repos"** — delete `repoRefs` (per-window window-level list + its API).

## Findings (verified in source)

- Add-repo row `#wt-addrepo-row` + `:focus-within { outline: 2px solid #4a9eff }`; input has
  `outline-none` but the row ring wraps the full-width input → reads as an input ring.
- `clone` is already `git clone --bare`; nothing checks out after. The "main worktree" the user
  saw is **presentation**: `listWorktrees()` returns a row for **every** local branch with
  `exists:false`, and `_syncReposToOpenp41ge` additionally injects repoRef worktree names as
  `exists:false` rows. A fresh bare clone ⇒ exactly one phantom "master" row + warning.
- Explorer data flow today: `_loadRepos()` → `_repoService.listRepos()` (on-disk scan) →
  `_syncReposToOpenp41ge()` reconciles a per-window `repoRefs` list persisted in the layout
  state (`Window.repoRefs`), auto-adds on-disk repos, filters to repoRefs, injects worktree
  names. Explorer already gates on `workspaceFileService.activeFilePath != null`.
- `repoRefs` surface (removal targets):
  - Layout: `layout/types.ts` `RepoRefSchema`+`Window.repoRefs`; `layout/repo-operations.ts`
    (`addRepoRef/removeRepoRef/hasRepoRef/addWorktreeToRepoRef`); serialization; file-operations clone.
  - IPC: `electron/ipc-handlers/repo-ref-handlers.ts` (workset:*) + registration in
    `openp41ge-application.ts`; preload + `global.d.ts` `workset*` decls.
  - Renderer: worktree-tree `_syncReposToOpenp41ge` + `onWorksetRepoRefsChanged` subscription;
    workspace-file-service `materializeActiveRepos` registrations.
  - **Surprise consumer**: `topbar-drop-target.ts` cross-window drag scope-expansion reads
    `destWin.repoRefs` and offers `worksetAddRepo` via `showScopeExpandModal` +
    `scope-expansion-utils.getUncoveredPaths` (`openp41ge-scope-expand-modal`).

## Approach

1. **#1 focus** — CSS in `openp41ge-worktree-tree.ts`:
   `#wt-addrepo-input:focus-visible, #wt-addrepo-input:focus { outline: none; box-shadow: none !important; }`
   (mirror for the confirm span). Row `:focus-within` ring stays.
2. **#2 clone** — add-repo stays bare-only (already true) and appends
   `{ url, worktrees: [] }` to the active workspace's `repos`; nothing materializes until the
   user picks a branch. Worktree rows come from **declared** worktrees only (workspace
   `repos[].worktrees`), not `git branch` enumeration — a fresh clone shows zero rows.
3. **#3 warning click** — `_wtWarn`/`_repoWarn` get a click handler that opens the Workspaces
   overlay (`systemOverlayService.openTab("workspaces")`) scoped to that repo (see #4), where
   the existing `_repoStatusContent`/`_renderWorktreeRow` status bars live.
4. **#4 overlay presence** — single source: active workspace `repos`. Explorer reads it for
   membership/order/existence; explorer add-repo/add-worktree/delete write it +
   `workspaceFileService.save()`. Overlay and Explorer stay live-synced via the existing
   `workspaceFileService.onChange` / overlay reload.
5. **#5 removal** — remove every repoRefs target above. Persisted layout format: stop writing
   `repoRefs`; parse guards ignore a legacy-present field (backward compatible). Explorer is
   driven by `activeData.repos` + on-disk scan (for url/path/exists).

## Files Changed (expected)

- `packages/openp41ge/src/renderer/components/openp41ge-worktree-tree.ts` — input focus CSS;
  workspace-driven repo/worktree loading; add-repo/add-worktree/delete persist to workspace file;
  repo-order from workspace order; remove `_syncReposToOpenp41ge` + repoRefs subscription.
- `packages/openp41ge/src/renderer/components/openp41ge-repo-tree-item.ts` — clickable warning.
- `packages/openp41ge/src/renderer/services/workspace-file-service.ts` — helpers:
  `addRepoToActive(url)`, `setRepoWorktrees(name, branches)` (+ save); drop workset calls in
  `materializeActiveRepos`.
- `packages/openp41ge/src/renderer/apps/system-tabs/workspace-manager-system-tab.ts` — accept a
  repo-focus request (open detail + scroll/highlight repo + show status); **re-materialize**
  action in the repo status bar for missing worktrees.
- `packages/openp41ge/src/layout/types.ts`, `repo-operations.ts` (delete), `operations.ts`,
  `serialization.ts`, `file-operations.ts` — repoRefs removal.
- `packages/openp41ge/electron/ipc-handlers/repo-ref-handlers.ts` (delete),
  `openp41ge-application.ts`, `electron/preload.cjs`, `src/renderer/global.d.ts` — workset:* removal.
- `scope-expansion-utils.ts` + `openp41ge-scope-expand-modal.ts` + topbar-drop-target scope check
  — PENDING decision (Q3).
- Tests (update/delete): layout ops/serialization/file-operations roundtrips, workspace-file-service,
  explirorer system-tab integration, scope-expansion (if removed).

## Testing Strategy

- Unit: new `repos-from-workspace` loader tests (fresh clone → zero worktrees; declared missing
  worktree → warning row); workspace-file-service `addRepoToActive`/`setRepoWorktrees`; warning
  click → overlay-focus dispatch; serialization ignores legacy repoRefs.
- Integration: explorer add-repo appends to active workspace `repos` and appears in overlay;
  overlay edits propagate back to explorer.
- Live (CDP): screenshot add-repo row focus (one ring only); clone → bare, no worktrees, no
  phantom row; warning click → overlay scoped to repo with existing status.

## UX Considerations

- Warning icon: stays visual-only in tooltip, becomes `cursor:pointer` with click → overlay.
- Focus: add-repo input keeps its own caret but no ring; row keeps its ring.
- Overlay: repo-focus opens the detail view of the active workspace (which must contain the
  repo, per #4) and highlights/scrolls to its repo card.
- Re-materialize: shown only when a declared worktree's folder is missing; lives in the overlay
  repo status bar (reuses existing status-row action pattern), not the explorer.

## Open Questions

- **Q1 (order source)** — Explorer row order: use the workspace `repos` array order (single
  source; reorder in overlay reflects in explorer) or keep the existing localStorage
  `applyRepoOrder`/`saveRepoOrder` override? (Recommendation: workspace order, drop localStorage
  reorder as another vestige of the old model.)
- **Q2 (fresh-clone warning)** — With worktree rows derived from declared worktrees, a fresh
  bare clone shows zero rows (good). For a repo whose declared worktree folder is missing, the
  explorer shows that row + warning → click → overlay shows status with a re-materialize action
  (re-run the materialize/checkout). Confirm this is the intended "missing worktree" lifecycle.
- **Q3 (scope expansion)** — Cross-window drag scope-expansion depends on repoRefs. Options:
  (a) remove the scope check + `getUncoveredPaths` + scope-expand modal entirely (cleanest match
  to "remove global repos"); or (b) re-base it on per-window active-workspace repos (needs a new
  main-process IPC to answer "which repos cover path X for window Y" — complex). Recommendation: (a).

## Completion Criteria

- [ ] Add-repo input shows no blue ring on focus (row ring preserved; screenshot-verified).
- [ ] Explorer add-repo clones bare only; zero worktrees/phantom rows until a branch is added.
- [ ] Explorer-added repo appears in the Workspaces overlay (same `repos` list); overlay edits
      reflect back in the explorer.
- [ ] Warning icon click opens the Workspaces overlay at that repo's status bar.
- [ ] Overlay repo status bar has a re-materialize action for missing worktrees.
- [ ] All repoRefs/workset* code removed (layout, IPC, preload, global.d.ts, explorer);
      serialization tolerates legacy files.
- [ ] `nx run-many -t typecheck test`, `nx lint`, `nx format:check` clean; build green.
