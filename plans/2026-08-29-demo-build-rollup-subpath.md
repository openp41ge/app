2026-08-29

# Fix Demo Build Failures (openp41ge-tabs subpath resolution)

## Goal

Make the two failing demo builds (`openp41ge-syntax-highlighting-demo`, `openp41ge-git-repository-demo`) succeed, by resolving the Rollup subpath-resolution failure for `openp41ge-tabs/sources/*` imports coming through `openp41ge-uikit`.

## Context

- **Pre-existing** — present before the TypeScript 7 upgrade (audited at HEAD/TS 5.9); unrelated to `tsc`/TypeScript (vite/rollup resolution).
- **Error**: `[vite]: Rollup failed to resolve import "openp41ge-tabs/sources/tab-drag-source" from "packages/openp41ge-uikit/src/index.ts"`.

## Root cause (to confirm during investigation)

`openp41ge-uikit/src/index.ts` deep-imports `openp41ge-tabs/sources/tab-drag-source` (and possibly other `openp41ge-tabs/sources/*` subpaths). At demo build time Rollup must resolve that subpath against the built `packages/openp41ge-tabs/dist` output, but resolution fails — typically one of:

1. **Ordering/parallelism**: the tabs `dist` isn't produced (or isn't on disk) before the dependent demo builds run, so Rollup can't resolve the deep import.
2. **Missing export/entry**: `openp41ge-tabs` package.json may not expose `./sources/*` subpath exports, or the `dist` layout doesn't include a `sources/` directory.
3. **Source-only import**: the import path points at `src/` (dev alias) but has no matching built output mapping.

## Approach

1. **Reproduce deterministically**: build the two failing demos alone (`nx run <demo>:build --skip-nx-cache`) and confirm the exact failing import.
2. **Inspect wiring**: read `packages/openp41ge-uikit/src/index.ts`, `packages/openp41ge-tabs/package.json` (exports map), the tabs `vite.config.ts` / rollup output layout under `dist/`, and how the demos depend on uikit.
3. **Pick the minimal fix**, prefer in order:
   - Fix the import in `openp41ge-uikit/src/index.ts` to reference the package root (`openp41ge-tabs`) or the correct built entry, if the deep subpath import is unnecessary.
   - Add the missing `./sources/*` exports entry / ensure `dist/sources/` is emitted by the tabs build.
   - Declare the subpath as a Rollup `external` only if uikit genuinely must not bundle it.
4. Do **not** change drag-and-drop runtime behaviour — verify the `openp41ge-tabs` demo (`test-openp41ge-tabs-demo`) and drag behaviour still work after the fix.

## Related minor follow-ups (carried over from the TS-7 plan; lower priority)

- Decide on the no-test-file vitest quirk (`openp41ge-filesystem:test` reports a failure when a package has no test files).
- Optionally tune TS 7 parallelism flags (`--checkers` / `--builders`) for CI.

## Verification / Completion Criteria

- [ ] `nx run-many -t build --skip-nx-cache` succeeds for all 21 projects (no demo failures).
- [ ] `nx run-many -t typecheck` still green.
- [ ] `nx lint` (oxlint) still green.
- [ ] Drag behaviour unaffected — `openp41ge-tabs` demo + explorer drag-and-drop sanity check.
