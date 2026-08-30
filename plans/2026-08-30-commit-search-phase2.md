2026-08-30

# Commit-search Phase 2 — content search (`-G` pickaxe) + hunk sub-rows

## Goal

Extend the Git-sidebar commit search (currently `message` + `files` scopes) with a **Content**
search-into dimension — find commits whose *changed lines* match the query (git `-G` pickaxe,
literal or regex per the existing toggles) — and add **hunk sub-rows** under the file rows of
any search result: the changed hunks that match the query, green `+` / red `−` with context,
lazily fetched only when a file row is expanded.

## Rationale

- v1 searched message (`--grep`) and changed-file paths (JS substring). "Find where `clearRect`
  was changed" isn't answerable by either. Git's pickaxe (`git log -G`) is the native, fast (C
  level) way to match against the *diff contents*, and it produces exactly the commits whose
  content changed w.r.t. a patten.
- Showing the matching hunks under each file closes the loop: the user sees *why* a commit
  matched without opening a diff view. Lazy per-file fetching keeps the (up-to-5000-commit)
  search walk cheap — only expanded files pay for `git show`.
- Consistent with the plan's Phase 2 demo: “content (`-G`/`-S`) search + hunk sub-rows”,
  deferred from the 2026-08-29 migration plan (`Q3` + completion criteria).

## Approach

### A. Types (`openp41ge-git`) — additive, backward compatible

- `CommitSearchOptions`: add `content?: boolean` — "also match commits whose changed lines
  contain the query (`-G`)". Existing `in: "message" | "files" | "all"` stays untouched; content
  is an orthogonal *union* dimension (message ∪ files ∪ content when toggled on).
- New `SearchHunk { header: string; lines: Array<{ type: "+" | "-" | " "; text: string }> }`.
- `SearchResultFile`: add optional `hunks?: SearchHunk[]` (may be absent — populated lazily).

### B. Main process — `IGitCommitService` / `NodeGitCommitService`

- `searchCommits(repoName, options)` — when `options.content` is set, run a **second pass**:
  `git log <pinned newest-N revs> --date-order -G<pat> --format=<sep> --numstat`
  (reuse `pinNewestN` + the same `--numstat` parser, so the depth cap + per-file stats behave
  identically), then **union by hash** with the message/files results (newest first). Literal
  query → regex-escape the input for `-G`; `regex:true` → pass raw. `caseSensitive` → omit `-i`.
  Empty `-G` results are ignored (query already non-empty). Content pass failures (malformed
  regex) must not fail the whole search — wrap, log, and return the other scopes' hits.
- New `getCommitFileHunks(repoName, hash, path, query, options): Promise<SearchHunk[]>`:
  `git show <hash> --format= --unified=3 -- <path>`; parse `@@` headers + `+`/`−`/` ` lines into
  a hunk list, keep only hunks containing a line matching the query (same literal/regex/case
  semantics), return those (context lines included).

### C. IPC + preload + `global.d.ts`

- `electron/ipc-handlers/git-handlers.ts`: the existing `workspace:searchCommits` already passes
  `options` straight through (content rides inside it). Add
  `workspace:getCommitFileHunks (repoName, hash, path, query, options)` → service.
- `electron/preload.cjs` + `src/renderer/global.d.ts`: `workspaceController.getCommitFileHunks(...)`.

### D. Renderer — model (`commit-search-model.ts`)

- `CommitSearchModel`: add
  `fileHunks(repoName, hash, path, query, options): Promise<SearchHunk[]>` — the query is passed
  explicitly (stateless; no hidden "last query" stash). `IpcCommitSearchModel` delegates straight
  to `getCommitFileHunks`; `TestCommitSearchModel` returns the fixture's matching-hunk-subset for
  the file and records calls.
- `TestCommitSearchModel.search` content dimension: any hunk-line substring match (ci, regex)
  counts as a hit in every scope (union). Records calls for assertion.

### E. Renderer — sidebar UI (`commit-search-system-tab.ts`)

- Third **Search/into** toggle `Content` (`_searchContent`) beside Messages/Files, same icon-row /
  grey-when-off styling; `toggleSearchContent` re-runs the debounced search. `_runSearch` passes
  `content: this._searchContent`.
- Per-file sub-rows become expandable (chevron + expand state `_expandedFileHunks`). When a file
  row is expanded under a commit whose search had `content` on, fetch hunks lazily through
  `_searchModel.fileHunks`, render:
  - header line `@@ -old +new @@` (muted), `+` lines green / `−` lines red / context neutral,
    left margin indented to the file depth, monospace stack — hunks rendered in full (v2 kee-
    ps the DOM small: `--unified=3` only returns hunks that actually match);
  - inline muted "Loading…"/"No matching hunks"/error rows for the transient states.
- No re-render loop: expansion toggles re-render from the cached `_lastCommits`; hunks are cached
  per `repoName:shortHash:path` (`_hunkCache`) so toggling back is instant and never refetches.
- With the Content toggle OFF the file-row chevron slot is inert (opacity 0, no expand) — the
  familiar single-click-open-preview / ArrowLeft::Right-keys behaviour is otherwise unchanged.

## Files Changed

- `packages/openp41ge-git/src/types.ts` — `content?` on `CommitSearchOptions`, `SearchHunk`,
  `SearchResultFile.hunks?`.
- `packages/openp41ge/src/main/interfaces/git-commit-service.ts` — `getCommitFileHunks` (+ hunks
  stay out of `searchCommits` return: lazy, so `SearchResultCommit` shape is unchanged).
- `packages/openp41ge/src/main/services/node-git-commit-service.ts` — content pass + hunk parse.
- `packages/openp41ge/electron/ipc-handlers/git-handlers.ts`, `electron/preload.cjs`,
  `src/renderer/global.d.ts` — `getCommitFileHunks` IPC.
- `packages/openp41ge/src/renderer/models/commit-search-model.ts` — `fileHunks` on both impls.
- `packages/openp41ge/src/renderer/apps/system-tabs/commit-search-system-tab.ts` — Content toggle +
  per-file hunk sub-rows (lazy fetch + cache).
- Tests: `node-git-commit-service-search.test.ts`, new `node-git-commit-service-file-hunks.test.ts`,
  `commit-search-model.test.ts`, `commit-search-system-tab.test.ts` (visible toggles + hunk rows).
- `plans/2026-08-30-commit-search-phase2.md` — this file.

## SOLID Review

- **S** — `commit-search-system-tab.ts` is large (renders the whole panel). The Content toggle is
  just another `_searchContent` flag + a `fileHunks` call like the others; hunk-row render is a new
  focused method (`_fileHunkRows`) — no second responsibility pulled in. Acceptable.
- **O** — the content pass is an *extra* independent scan whose hits are unioned by hash; adding a
  future 4th dimension (e.g. author) is the same additive pattern — no edits to existing scopes.
- **L** — `TestCommitSearchModel` must satisfy the `fileHunks` contract identically (filtered fixture
  vs real git) — return `[]` for unknown files, never throw. Match the search passthrough.
- **I** — `CommitSearchModel` gains exactly one narrow read method; `IGitCommitService` one too.
  Hunks are not bolted onto `SearchResultCommit` (lazy), so commit-search consumers that never expand
  files don’t carry it.
- **D** — sidebar depends on `CommitSearchModel` via the existing `_searchModel` public property;
  no concrete import added. Main service methods are called through the injected `IGitCommitService`
  registry in `git-handlers.ts`.

## UX Considerations

- Content toggle lives with Messages/Files (icon-row) — same grey/white + re-run semantics; tooltip
  “Search changed content lines”.
- Hunk rows: monospace, indented under the file row, `@@` header muted, `+` `#3fb950`, `−`
  `#f85149`, context normal — matching the commit adds/dels colours already in the panel.
- File rows stay single-click preview (working-tree path — file-at-revision remains open/Q1).
  Hunk fetch is expand-triggered; an inline “Loading…” → rows → error fallback keeps it non-blocking.
- Keyboard: ArrowRight on a file row expands hunks, ArrowLeft collapses; Enter/Space toggle (mirror
  commit rows). Escape restores focus per existing sidebar pattern.
- Depth cap + still running up to 5000 commits: content scan is pickaxe (C) — measured acceptable;
  hunk fetch is one `git show` per expanded file, cached.

## Testing Strategy

- **Unit (real local git repo, mirroring `node-git-service.test.ts`)**:
  - `searchCommits` with `content:true` matches a commit whose diff adds/removes the literal query;
    literal is matched literally (`a+b` doesn’t act as regex); `regex:true` uses a pattern;
    `caseSensitive:false` is the default; depth cap still applies; failure of the content pass
    (e.g. bad regex) doesn’t drop message hits.
  - `getCommitFileHunks`: returns only hunks containing the match (+/−/context lines, `@@` header);
    empty when the file/hash has no match; literal vs regex/case honoured.
  - `commit-search-model.test.ts`: `TestCommitSearchModel` content filter + `fileHunks` fixture.
- **Integration** (`commit-search-system-tab.test.ts`): toggling Content re-runs search with
  `content:true`; a content-matched commit shows hunks under an expanded file row; lazy fetch fires
  once and is cached (second expand re-renders, doesn’t refetch); error → muted row, no throw.
- **Live (dev restart — main-process IPC change)**: type a literal code token → Content on → matching
  commits appear; expand a file → hunks show; toggle off → they don’t. Check the error overlay stays
  clear.

## Open Questions

- **`-S` (string pickaxe) vs `-G` (regex pickaxe)**: picking `-G` (with the literal input
  regex-escaped) means “commits whose content lines match pattern”, and it lets the existing regex
  toggle work for free. `-S` counts occurrence deltas (different semantics). Default: `-G`, with
  literal escaping. Flag if occurrence-delta semantics are actually wanted.
- **Hunk size cap**: `git show --unified=3` + “first N hunks” keeps DOM small; confirm N=5 with a
  “+N more” (no paging) is enough for v2.
- **Content + depth**: content scan over `maxCount` (default 5K) — same cap as message. Confirm the
  5K default is acceptable for content on large repos, or default content to a smaller cap (e.g.
  2K).

## Completion Criteria

- [x] `CommitSearchOptions.content` + `SearchHunk` + `SearchResultFile.hunks?` added (backwards
      compatible — existing `in` untouched).
- [x] `searchCommits` honors content via `-G` (literal escaped / regex raw, case toggle), depth-capped,
      unioned by hash; a content-pass failure never drops message/files hits.
- [x] `getCommitFileHunks` returns query-matching hunks for a commit+file (real git).
- [x] `workspaceController.getCommitFileHunks` IPC wired (handler + preload + `global.d.ts`).
- [x] Sidebar has a Content toggle beside Messages/Files; turning it on re-runs with `content:true`.
- [x] Expanding a file row lazily fetches + renders its matching hunks (colours, monospace), caches,
      and shows inline loading/error/empty states.
- [x] Unit + integration suites green; typecheck/lint/build clean (openp41ge 1061/1061 incl. +19 new).
- [x] Live-verified in the running dev app (main-process restart + CDP): content toggle drives
      a `-G` search; expanding a file row fetches + renders real hunks for `public/app.js` in
      `ascii-drawing-tool` (header muted, context grey, 34 green/red diff lines), hunk
      collapse/re-expand cache-reused; 0 captured errors.
