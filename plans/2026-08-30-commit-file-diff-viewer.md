2026-08-30

# Commit-file diff viewer (read-only, inline green/red)

## Goal

Change the Git-sidebar commit search so that activating a FILE result no longer
shows its content (hunk sub-rows) *below it in the sidebar*. Instead, it opens a
**read-only file view in the editor grid** showing that file's additions and
deletions inline — added lines green, deleted lines red.

Rationale: nothing can be changed in a commit, so the viewer is read-only. The
sidebar stays a pure search surface; the diff detail lives in the editor area.

## Design

- **Sidebar**: remove the per-file hunk expansion entirely (chevron,
  `_expandedFileHunks`/`_hunkCache`, `.commit-hunk-block`, arrow-key toggles).
  A file row now dispatches a new `openp41ge:open-commit-file` event
  (single-click = unpinned preview; double-click / Enter = pinned) carrying
  `{ repoName, hash, path, name, pinned }`. The Content toggle stays — it still
  drives the `-G` content search dimension; it just no longer expands hunks in
  the sidebar.
- **New app type `commit-file-diff`** (`apps/commit-file-diff/`): a read-only
  pane mirroring `git-commit-search` — header (repo · path · short hash) plus a
  monospace diff body from `getCommitFileHunks(repo, hash, path, "", {})`:
  `@@` headers muted, `+` lines green `#3fb950`, `-` lines red `#f85149`,
  context lines grey. Config rides the tab's JSON `filePath` slot
  `{repoName, hash, path}` (restore-before-mount, like git-commit-search);
  fetched hunks are cached in `snapshot()` for instant re-mount.
- **Handler**: extend `CommitOpenHandler` with `handleOpenCommitFile` →
  `actionOpenFile(winId, "commit-file-diff", title, JSONconfig, col, pinned)`,
  with in-cell dedupe by `repo:hash:path`. Listener registered in
  `register-event-listeners.step.ts`.
- **Service**: relax `getCommitFileHunks` so an empty/whitespace query returns
  ALL hunks (not `[]`) — the viewer wants the full diff. Non-empty queries keep
  filtering (still used by nothing in the UI, but harmless & tested).
- **Model**: drop `CommitSearchModel.fileHunks` + `hunkCalls` (the pane calls
  `workspaceController.getCommitFileHunks` directly, like git-commit-search).

## SOLID

- SRP: sidebar = search; new pane = diff renderer; handler owns open semantics.
- OCP: new app type via `registerAppType` + `actionOpenFile`; no branching on
  appType inside existing controllers.
- DIP: pane talks to `workspaceController` interface (preload), not IPC.
- ISP: `CommitSearchModel` shrinks back to `search` only.

## UX

- Sidebar file rows keep name + green/red +/- counts; click opens the diff in
  the grid, never content in the sidebar.
- Viewer is monospace, read-only, scrollable; empty/textless diffs show an
  inline muted message; errors show an inline fallback.

## Testing

- service: empty query → all hunks; filter tests unchanged.
- `commit-open-handler` unit: open-commit-file dispatch (config JSON, preview vs
  pinned, dedupe).
- `commit-file-diff` controller integration: renders hunks from a stubbed
  `getCommitFileHunks`; error fallback; snapshot/restore cache.
- sidebar integration: file row emits open-commit-file; no `.commit-hunk-block`
  anywhere; content toggle still sends `content:true`.
- model unit: remove fileHunks coverage.
- `nx run-many -t test`, typecheck, lint, build; live-verify (main restart) in
  the running dev app.

## Completion

- [x] Sidebar has no hunk content below file rows; file activation opens grid pane.
- [x] `commit-file-diff` pane renders additions green / deletions red, read-only.
- [x] Service/IPC/model/registration/handler/wiring green; suites + build clean (openp41ge 1068/1068).
- [x] Live-verified in dev app (main restart + CDP): file row opens `app.js — 43985c3` grid
      tab titled, 208 colored diff lines (74 green `+` / 134 red `-` matching the row's
      +74/−134 stats), no textarea (read-only), sidebar 0 hunk blocks, 0 captured errors.
