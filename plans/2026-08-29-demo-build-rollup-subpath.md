2026-08-29

# Fix Demo Build Failures (openp41ge-tabs subpath resolution)

## Goal

Make the two failing demo builds (`openp41ge-syntax-highlighting-demo`, `openp41ge-git-repository-demo`) succeed, by resolving the Rollup subpath-resolution failure for `openp41ge-tabs/sources/*` imports coming through `openp41ge-uikit`.

## Context

- **Pre-existing** — present before the TypeScript 7 upgrade (audited at HEAD/TS 5.9); unrelated to `tsc`/TypeScript (vite/rollup resolution).
- **Error**: `[vite]: Rollup failed to resolve import "openp41ge-tabs/sources/tab-drag-source" from "packages/openp41ge-uikit/src/index.ts"`.

## Root cause (confirmed during investigation)

Two related problems:

1. **Demos resolve uikit from source but don't source-alias the transitive libs.**
   `openp41ge-uikit` is aliased to `src/` in the failing demos, and uikit source
   deep-imports several packages by subpath (`openp41ge-tabs/sources/*`,
   `openp41ge-tabs/interfaces`, `openp41ge-editor-engine/input/*`,
   `openp41ge-editor-engine/model/*`, `openp41ge-syntax-highlighting/textmate-init`, …).
   The demos don't alias those packages to source (unlike `openp41ge-file-editor-demo`
   and the main app), so Rollup resolves the subpaths against each package's
   `exports` map → `dist/<subpath>.js`, which is **never emitted** by the
   single-entry `vite build` lib (only `dist/index.js` + per-module `.d.ts` exist).
   Hence "Rollup failed to resolve import …".

2. **The syntax-highlighting demo referenced APIs it can't import.** It imported
   `initTextMate`, `TokenRegistry` from the uikit **root** (those live behind
   `openp41ge-uikit/file-editor` / `openp41ge-editor-engine`), and `highlightCode` —
   which **never existed in any package** (confirmed via `git log -S highlightCode`
   at the syntax-highlighting extraction commit).

## Approach

1. **Source-alias the library packages in both failing demos** (`git-repository-demo`, `syntax-highlighting-demo`): add
   `openp41ge-uikit/theme`, `openp41ge-editor-engine`, `openp41ge-syntax-highlighting`, `openp41ge-tabs`,
   `openp41ge-piece-tree`, `openp41ge-git` → `../../packages/*/src`, mirroring `openp41ge-file-editor-demo` (the
   working reference) and the main app's convention.
2. **Fix the syntax demo's imports + add a local `highlightCode` (user-chosen Option A):**
   import `initTextMate`, `TokenRegistry`, `renderViewLine` from `openp41ge-editor-engine` and `ITokenizer` from
   `openp41ge-syntax-highlighting`; implement `highlightCode(code, tokenizer)` demo-locally via
   `tokenizeLine` (threaded textmate ruleStack) + `renderViewLine`, returning `{ html, lineCount, durationMs }` as
   the demo documented. No public package API was added.
3. Do **not** change drag-and-drop runtime behaviour — none of the drag code was touched.

## Related minor follow-ups (carried over from the TS-7 plan; lower priority)

- Decide on the no-test-file vitest quirk (`openp41ge-filesystem:test` reports a failure when a package has no test files).
- Optionally tune TS 7 parallelism flags (`--checkers` / `--builders`) for CI.

## Verification / Completion Criteria

- [x] `nx run-many -t build --skip-nx-cache` succeeds for all 21 projects (both demos now build).
- [x] `nx run-many -t typecheck` green (12 projects).
- [x] `nx lint` (oxlint) green.
- [x] Drag behaviour unaffected — no drag code touched; the `openp41ge-tabs` demo builds as part of the 21; main-app dev unchanged.
- [x] `nx run-many -t test` — only the known pre-existing `openp41ge-filesystem:test` no-test-files quirk fails.

## Verified (2026-08-29)

- Reproduced both failures (`git-repository-demo`, `syntax-highlighting-demo` → `Rollup failed to resolve import`).
- Root cause confirmed (source-alias gap + syntax demo's never-implemented `highlightCode`).
- Fix applied; `nx run-many -t build --skip-nx-cache` → **"Successfully ran target build for 21 projects"**.
- Prettier clean on all touched files; all three were compliant at HEAD.

## Notes / follow-ups (not done here)

- The `openp41ge-tabs` / `openp41ge-editor-engine` `exports` maps still reference `dist/<subpath>.js` files their single-entry `vite build` libs never emit; only source-alias consumers avoid it. Not changed here — a packaging-level follow-up if subpath exports are ever expected to resolve by a non-aliased consumer.
- `openp41ge-filesystem:test` no-test-files vitest quirk remains a known baseline.
