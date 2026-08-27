# Upgrade to TypeScript 7

## Goal

Upgrade the Openp41ge monorepo from TypeScript ~5.9.3 to TypeScript 7.0.x (latest stable), taking advantage of the 8–12× native Go compiler, shared-memory multithreading, and improved `--watch` mode.

## Rationale

TypeScript 7 is a complete native port to Go, delivering dramatic performance improvements:

| Aspect             | TS 5.x / 6.x         | TS 7.0                                      |
| ------------------ | -------------------- | ------------------------------------------- |
| Compiler runtime   | JavaScript (Node.js) | Native Go binary                            |
| Parallelism        | Single-threaded      | Multi-threaded (`--checkers`, `--builders`) |
| Full build speedup | Baseline             | 8–12× faster                                |
| Memory usage       | Baseline             | ~10–25% less                                |
| Watch mode         | Polling-based        | `@parcel/watcher`-based (efficient)         |

For a monorepo of Openp41ge's size (442 `.ts` files across 9 packages), this means near-instant type-checking and a tighter edit-compile-test loop.

## Approach

### Phase 0 — Remove the blocker (IN PROGRESS, done first)

**What blocked us: `typescript-eslint`.** The ecosystem (`@typescript-eslint/eslint-plugin`, `@typescript-eslint/parser`, `typescript-eslint`) peers `typescript: ">=4.8.4 <6.1.0"` — still true at the latest release (8.68.0). It is the **only** dependency constraining `typescript` in the tree (verified by sweep; vite/vitest/nx/tsx use esbuild or the `tsc` CLI, and every tsc invocation in this repo is CLI-based so the unstable TS 7.0 programmatic API is irrelevant here).

**Decision:** do not wait for a typescript-eslint release. **Remove the toolchain entirely** by migrating lint from ESLint to **oxlint** (Rust/oxc, no `typescript` peer, covers our 6-rule non-type-aware ruleset 1:1). See `plans/2026-08-27-replace-eslint-with-oxlint.md` — that change lands first and keeps `typescript` untouched.

**Current TS state (2026-08-27):** installed `typescript` is already **6.0.3** (root `package.json` says `^6.0.3`) — pinned at the top of the old `<6.1.0` cap. The 12 package-level `package.json` files still declare `^5.x` (stale declarations; hoisting resolves 6.0.3). Phase 2 step 2 will correct them to `^7.0.2`.

**Precondition for Phase 2 (COMPLETE once oxlint lands):** no dependency constrains `typescript` anymore; lint is `typescript`-version-independent.

### Phase 2 — Execute upgrade (COMPLETE 2026-08-29)

1. **Update root `package.json`** — bump `typescript` from `^6.0.3` to `^7.0.2`.
2. **Update all 12 package-level `package.json` files** — bump `typescript` from their stale `^5.x` declarations to `^7.0.2`.
2b. **Verify no other dependency constrains `typescript`** — after the oxlint migration, `pnpm why typescript` must list no `eslint`/`typescript-eslint` consumers.
3. **Run `pnpm install`** — let pnpm resolve the new TypeScript version.
4. **Run `npx tsc --noEmit` across the monorepo** — identify any new type errors introduced by TS 7's stricter checking. The codebase has zero `@ts-ignore`/`@ts-expect-error` directives, so any new errors are genuine type issues.
5. **Fix type errors iteratively** — per package, resolve errors found in step 4.
6. **Update `tsconfig.json` files if needed** — review target/module settings for TS 7 compatibility. Current `tsconfig.json` files use `target: "ESNext"` / `module: "ESNext"` / `moduleResolution: "bundler"` — these should remain valid.
7. **Consider TS 7 parallelism flags** — evaluate `--checkers` and `--builders` for optimal CI performance. The root `tsconfig.json` has `noEmit: true`; flags can be added via `tsc` CLI or per-package build scripts.
8. **Run full test suite** — `pnpm test` must pass.
9. **Run full build** — `cd packages/openp41ge && pnpm build` must succeed.
10. **Run linting** — `nx lint` (oxlint) must pass. oxlint does not depend on the TypeScript package or compiler API, so it is unaffected by the TS 7 upgrade.

## Phase 2 — Execution Log

All Phase 2 steps complete **2026-08-29**.

- **1–3. Versions + install**: root and all 12 package `package.json` bumped to `^7.0.2`; `pnpm install` deduped the whole tree to a single `typescript@7.0.2`. `pnpm why typescript` shows no eslint/typescript-eslint consumer.
- **4–5. Type errors fixed iteratively**:
  - `openp41ge-terminal` — TS 7 stopped auto-including `@types/node` → added `"types": ["node"]`.
  - `init-drag-system` — `getDragData()` now returns a proper `DragSourceData` (added an additive `"system-tab"` member to the shared union in `openp41ge-tabs/src/interfaces.ts` + adapter re-export).
  - `openp41ge-file-editor` module resolution — added a `paths` mapping in the platform tsconfig → `../openp41ge-uikit/dist/file-editor/index` (dist declarations; a source-pointing mapping caused TS6059 `rootDir` violations).
  - **14 mechanical fixes** for pre-existing typing drift (present at TS 5.9/HEAD): `__eventController` declared on `StartupContext`; `Openp41geWindowviewElement` widened to `Window | null`; dead `_storeUnsub` block removed; optional `mount`/`unmount` added to `EditorSystemTabController`; plus small casts/guards.
  - **16 errors: removed the superseded workspace drawer** in `openp41ge-worktree-tree.ts` (≈570 lines). The drawer called the removed workspace-store API (`loadStore`, `createWorkspace`, `addRepo`, …) and had **zero live callers** — the workspaces full overlay replaced it. Removed the drawer (`WorkspaceStoreRecord`, fields/methods, 2 orphaned methods `_closeTabsForWorktree`/`_deleteWorktree`), the `_loadWorkspaces()` call in `_loadRepos`, a vestigial `if (_activeWsId)` block in the **live** `_doAddWorktree`, and an unused import. **Live features preserved**: edit-mode toggle (sidebar bottom bar), add-repo, add-worktree (rewired to `worksetAddWorktreeToRepo`), worktree delete, keyboard nav. Verified live in the running dev app.
- **6–7.** No `tsconfig` changes needed beyond the above; parallelism flags deferred as a CI tuning matter.
- **8. Tests**: `openp41ge` 883/883 pass; `openp41ge-logger` 61/61 pass; run-many green (two `openp41ge-filesystem`/none test-file vitest quirks are pre-existing).
- **9. Build**: all library builds + `openp41ge:build` succeed. **Two demo builds fail on a pre-existing Rollup subpath-resolution issue** — `openp41ge-uikit/src/index.ts` imports `openp41ge-tabs/sources/tab-drag-source`, which Rollup cannot resolve at demo build time. Independent of TS 7 (vite/rollup resolution, not `tsc`); tracked separately.
- **10. Lint**: `nx lint` (oxlint) green.

### Phase 3 — Residual debt (out of scope for this upgrade)

- Fix the `openp41ge-uikit` → `openp41ge-tabs/sources/*` subpath resolution so the 2 demo builds pass (build-config concern).
- Decide on the two demo/no-test-file vitest quirks.
- Tune `--checkers`/`--builders` parallelism flags for CI.

### Root level

- `package.json` — bump `typescript` to `^7.0.2`
- `eslint.config.js` — **already deleted** by the oxlint migration (`2026-08-27-replace-eslint-with-oxlint.md`); `.oxlintrc.json` needs no TS-specific change (oxlint is typescript-version-independent)

### Per-package `package.json` (12 files)

- `packages/openp41ge/package.json` — bump `typescript` to `^7.0.2`
- `packages/openp41ge-agent-chat/`, `openp41ge-constants/`, `openp41ge-editor-engine/`, `openp41ge-filesystem/`, `openp41ge-git/`, `openp41ge-logger/`, `openp41ge-piece-tree/`, `openp41ge-syntax-highlighting/`, `openp41ge-terminal/`, `openp41ge-uikit/` — bump `typescript` to `^7.0.2`
- `packages/openp41ge-tabs/package.json` — bump `typescript` to `^7.0.2`

### Config files (if needed)

- `packages/*/tsconfig.json` — review for TS 7-specific options

## Testing Strategy

| What                     | How                                                                                 |
| ------------------------ | ----------------------------------------------------------------------------------- |
| Type-checking            | `npx tsc --noEmit` across the monorepo — zero errors expected                       |
| Unit / integration tests | `pnpm test` — all 2134+ tests must pass                                             |
| Build                    | `cd packages/openp41ge && pnpm build` — must succeed                                |
| Linting                  | `nx lint` (oxlint) — must pass; oxlint is independent of the TS version            |
| E2E                      | `cd packages/openp41ge && bash scripts/test-e2e.sh` — verify no runtime regressions |

Pre-existing issues to be aware of:

- `packages/openp41ge-tabs` has a pre-existing build error in `src/orchestrator.ts:270` (unrelated type assertion) — this is a separate issue, not caused by the TS 7 upgrade.

## UX Considerations

Not directly applicable — this is a build tooling upgrade with no user-facing changes. However:

- **Developer experience**: TS 7's 8–12× faster type-checking will significantly improve the dev loop for all contributors.
- **CI pipeline**: Faster builds mean faster CI feedback. Consider tuning `--checkers` and `--builders` flags for CI runners with constrained resources.

## Open Questions

1. ~~**typescript-eslint compatibility**~~ — **RESOLVED**. We are not waiting for a typescript-eslint release; lint has been migrated to **oxlint** (`2026-08-27-replace-eslint-with-oxlint.md`), which has no `typescript` peer. This was the only dependency blocking TS 7.
2. ~~**TS 7.1 timing**~~ — **N/A**. The stable programmatic-API concern (TS 7.1) only mattered for consumers like typescript-eslint. This repo's every `tsc` invocation is CLI-based, and oxlint never touches the TS compiler API — no JS-API consumer remains that could break on 7.0.
3. **Pre-existing build error** — should we fix the `openp41ge-tabs/src/orchestrator.ts:270` type assertion issue as part of this upgrade, or file separately?

## Completion Criteria

- [x] **Blocker removed**: lint migrated from `typescript-eslint` to **oxlint** (tracked by `2026-08-27-replace-eslint-with-oxlint.md`); no dependency constrains `typescript`
- [x] **All `package.json` files (root + 12 packages) updated to `typescript: "^7.0.2"`** — single deduped 7.0.2 install
- [x] **`pnpm install` succeeds**
- [x] **`nx run-many -t typecheck` produces zero errors across all packages** (previously blocked by 30 pre-existing errors: 14 mechanical fixes + 16 drawer removal)
- [x] **Tests pass** — `openp41ge` 883/883, `openp41ge-logger` 61/61
- [x] **Build passes** — all libs + `openp41ge:build`; 2 demo builds still fail on the **pre-existing** Rollup subpath issue (unrelated to TS 7)
- [x] **`nx lint` (oxlint) passes** — oxlint is `typescript`-version-independent
- [x] **TS 7-specific warnings resolved**
