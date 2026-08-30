2026-08-31

# Commit-file diff: full file open with inline additions/deletions

## Goal

Replace the cropped hunk-only diff with the ENTIRE file at the commit rendered
in the read-only `<file-editor>` diff mode, with additions/deletions injected at
their positions (VS Code inline-diff style). Nothing is cropped.

## Changes

- openp41ge-git: `buildInlineDiffDocument(fileContent, hunks)` — replaces
  `hunksToDiffDocument`. Merges the post-commit file content with the hunks:
  unchanged lines appear verbatim (new-file gutter numbers), removed (red) and
  added (green) lines inject in place, `@@` rows are muted dividers.
- Service/IPC: new `getCommitFileContent(repo, hash, path)` (git show
  `<hash>:<path>`) + `workspace:getCommitFileContent` wire + global.d.ts.
- Pane: fetches content + hunks, builds the inline doc, `editor.setDiffDocument`;
  null content → "No textual content" fallback; doc cached for re-mount.
- Tests: builder (gap/tail/new-file/empty), pane dual-fetch full-file rows,
  service real-git content test.

## Completion (live-verified)

- [x] Full file renders: 1513 rows incl. line 1356 file tail (was 413 cropped).
- [x] 74 added / 134 removed injected, read-only, 0 captured errors.
- [x] Suites green: openp41ge 1070, git 45; typecheck/lint/build clean.
