2026-09-18

> **STATUS: IMPLEMENTED (v1).** The `edit_file` and `create_or_replace_file` tools are
> built as single-agent, multi-repo tools (scope via `ctx.roots`, git-patch apply,
> unstaged working-tree change). See the completion checkboxes below.

# Agent Tools v1 — `edit_file` and `create_or_replace_file` (single-agent, multi-repo)

## Goal

Implement two agent tools for the connected-worktree system:

- **`edit_file`** — apply targeted textual changes to an existing file.
- **`create_or_replace_file`** — create a new file, or replace an existing file's
  contents.

**Scope for v1: single-agent, multi-repo.** No concurrent-agent reconciliation (that is
the parked editor-agent architecture). The tools must be **multi-repo aware**: they lock
down to **one file in one worktree in one repo**, selected via the connected-worktree
scope (`ctx.roots`). All writes go through **git patches applied via `git apply`**.

These tools mirror the existing `read_file`/`search_files` patterns (registry/strategy
based, in-band errors, scope enforcement via `ctx.roots`).

## Rationale / Current State

- Existing pattern: `openp41ge-agents-tool-types` defines `AgentTool` /
  `ToolExecutionContext` (with `cwd` + `roots`); each tool package exposes
  `register(registry)` and is aggregated in `node-tool-executor.ts` → `registerBuiltinTools`.
- `read_file` already enforces connected-worktree scope and in-band errors. These tools
  reuse that scope model exactly.
- Writes must be applied **via git** (`git apply` of a generated patch), not raw
  `fs.writeFile`/`fs.promises.writeFile`.
- `run_command` exists but is intentionally **not** registered (shell execution disabled).
  These edit tools must NOT depend on running the user's shell — all git invocation is
  via `child_process` `git` directly, or a project git adapter.

## Approach

### 1. `edit_file` (surgical edits)

Input:

```
{
  path:   string   // absolute or cwd-relative, must resolve inside a connected root
  edits:  Array<{ old: string; new: string }>
}
```

- Resolve `path` against `ctx.cwd`; reject if outside every connected root (empty roots →
  deny; missing roots → unrestricted; a path within more than one root → ambiguous →
  reject).
- Read the current file content (`utf-8`), verify each `edits[i].old` occurs **exactly
  once** (0 → "text not found"; >1 → "ambiguous, matches N times"). Apply all
  substitutions to produce new content.
- Go through git: generate a patch from current→new content and `git apply` it.
  (E.g. write current/new content to temp files and `git diff --no-index`, then patch the
  paths back, or emit a unified diff and `git apply`.) The file's working-tree bytes and
  the index are never implicitly staged.
- Return success: confirmation + optionally the applied diff, and the new file content's
  git blob hash (`git hash-object`) for future use.

### 2. `create_or_replace_file` (create or overwrite)

Input:

```
{
  path:     string
  content:  string
  mode?:    "create" | "replace" | "create_or_replace"   // default "create_or_replace"
}
```

- `mode: "create"` — fail if the file already exists.
- `mode: "replace"` — fail if the file does not exist.
- `mode: "create_or_replace"` (default) — create if absent, replace if present.
- Scope-check the path like `edit_file`.
- Apply via git: for create, generate a new-file patch; for replace, generate a
  full-file diff patch; `git apply`. Never implicitly stage/commit.

### 3. Path / worktree resolution (shared helper)

Both tools need identical scope + single-worktree resolution. Extract a small shared
module (e.g. `openp41ge-agents-tool-shared`, or duplicated helpers) that provides:

- `resolvePath(p, ctx)` — absolute or cwd-relative.
- `isWithin(p, root)` — lexical containment (already used by read_file/search_files).
- `scopeError(p, ctx)` — scope enforcement; also detect a path inside **more than one**
  connected root → ambiguous error.
- `findWorktreeFor(file, roots)` — the single connected root containing the file.

### 4. Git invocation & patch application

- Determine the repo root / worktree root for the file: use `git -C <dir> rev-parse
--show-toplevel` to confirm the actual worktree (in case the path is inside a nested
  repo).
- Generate the diff with git and `git apply` it within that worktree root. No implicit
  `git add` / `git commit`. All messages/errors in-band (`{content, error?}`).

## Files Changed (proposed)

- `packages/openp41ge-agents-tool-edit-file/` — **new** package (`src/index.ts`,
  `package.json`, `project.json`, `tsconfig.json`).
- `packages/openp41ge-agents-tool-write-file/` — **new** package.
- (Optional) `packages/openp41ge-agents-tool-shared/` — shared path/scope/worktree
  helpers, to avoid duplicating `resolvePath`/`isWithin`/`scopeError` across tools.
- `packages/openp41ge/src/main/services/node-tool-executor.ts` — register the two new
  tools in `registerBuiltinTools`.
- `packages/openp41ge/test/unit/services/builtin-tools.test.ts` and/or a new
  `edit-file-tool.test.ts` / `write-file-tool.test.ts` — scope + behavior tests.

## Testing Strategy

- **Scope:** path outside roots → deny; empty roots → deny; inside one root → allow;
  path within two overlapping roots → ambiguous → reject; cwd-relative resolution.
- **edit_file:** multi-substitution; exact-once validation (0 occurrences → error, >1 →
  ambiguous); success returns confirmation + new blob hash.
- **create_or_replace:** create (absent→ok; present→error); replace (present→ok;
  absent→error); create_or_replace (both directions).
- **Git application:** after a successful edit/create, the file on disk matches the
  expected content; `git status`/`git diff` reflect an **unstaged** working-tree change
  (no auto-stage/commit).
- Real temp git repo (or an existing fixture) for the apply path.
- Quality gate: `nx run-many -t typecheck`, `nx lint`; `nx run openp41ge:test`.

## Scope

- **In:** `edit_file` + `create_or_replace_file`; connected-worktree scope; single
  worktree/repo targeting; git-patch application; no implicit stage/commit.
- **Out (parked):** editor agent, multi-agent reconciliation, snapshot/version ledger,
  `ToolExecutionResult.snapshot` extension, commit-to-master. Those stay in
  `2026-09-18-editor-agent.md`.

## Open Questions

1. **Edit input format** — confirmed `{old, new}` substitutions (content-addressed). Keep
   line/column-based hunks out for v1? (Recommend yes.)
2. **Patch generation** — `git diff --no-index` between temp copies (paths rewritten) vs
   hand-built unified diff. Which is more robust for apply? (Lean `git diff` and patch the
   header paths.)
3. **New-blob hash return** — should `edit_file`/`create_or_replace_file` return the
   resulting blob hash (for future snapshot use), given v1 is single-agent? (Recommend:
   return it anyway — cheap, forward-compatible.)
4. **Trim trailing newline / line-ending normalization** — preserve file's existing
   newline style (LF vs CRLF) when applying? (Recommend: do not rewrite line endings; only
   substitute the given text.)

## Completion Criteria

- [x] `edit_file` applies `{old, new}` substitutions via a git-generated patch + `git apply`.
- [x] `create_or_replace_file` creates (absent) and replaces (present) via git patch.
- [x] Both reject paths outside the connected worktrees; ambiguous multi-root paths rejected.
- [x] No implicit `git add`/`git commit`; writes are unstaged working-tree changes.
- [x] In-band `{content, error?}` results, never thrown across the interface.
- [x] `nx run-many -t typecheck`, `oxlint` clean; `nx run openp41ge:test` passes
      (services suite 411 tests / 38 files green).
