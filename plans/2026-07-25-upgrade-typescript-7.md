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

### Phase 1 — Wait for dependency compatibility (current state)

**Blocking dependency: `typescript-eslint`**

The `typescript-eslint` ecosystem (`@typescript-eslint/eslint-plugin`, `@typescript-eslint/parser`, `typescript-eslint`) currently caps its TypeScript peer dependency at `<6.1.0`. Even the latest stable (v8.65.0) restricts:

```
typescript: ">=4.8.4 <6.1.0"
```

This means we **cannot upgrade `typescript` to 7** without losing ESLint type-aware linting (or disabling it entirely). All 9 packages in the monorepo are covered by the root `eslint.config.js` which uses `@typescript-eslint/parser` and `@typescript-eslint/eslint-plugin`.

Additionally, the TypeScript programmatic API is not yet stable in TS 7.0 — Microsoft recommends waiting for **TS 7.1** for stable API consumers (which includes `typescript-eslint`).

**Status**: BLOCKED — monitor `typescript-eslint` releases for TS 7 support (likely `typescript-eslint` v9).

### Phase 2 — Execute upgrade (once unblocked)

1. **Update root `package.json`** — bump `typescript` from `^5.9.3` to `^7.0.2`.
2. **Update all 9 package-level `package.json` files** — bump `typescript` from `^5.7.0`/`^5.5.0` to `^7.0.2`.
3. **Run `pnpm install`** — let pnpm resolve the new TypeScript version.
4. **Run `npx tsc --noEmit` across the monorepo** — identify any new type errors introduced by TS 7's stricter checking. The codebase has zero `@ts-ignore`/`@ts-expect-error` directives, so any new errors are genuine type issues.
5. **Fix type errors iteratively** — per package, resolve errors found in step 4.
6. **Update `tsconfig.json` files if needed** — review target/module settings for TS 7 compatibility. Current `tsconfig.json` files use `target: "ESNext"` / `module: "ESNext"` / `moduleResolution: "bundler"` — these should remain valid.
7. **Consider TS 7 parallelism flags** — evaluate `--checkers` and `--builders` for optimal CI performance. The root `tsconfig.json` has `noEmit: true`; flags can be added via `tsc` CLI or per-package build scripts.
8. **Run full test suite** — `pnpm test` must pass.
9. **Run full build** — `cd packages/openp41ge && pnpm build` must succeed.
10. **Run linting** — ensure ESLint still works correctly with the updated typescript-eslint.

## Files Changed

### Root level

- `package.json` — bump `typescript` to `^7.0.2`
- `eslint.config.js` — may need adjustments if typescript-eslint API changes

### Per-package `package.json` (9 files)

- `packages/openp41ge/package.json` — bump `typescript` from `^5.7.0` to `^7.0.2`
- `packages/openp41ge-file-editor/package.json` — same
- `packages/openp41ge-terminal/package.json` — same
- `packages/openp41ge-git-repository/package.json` — same
- `packages/openp41ge-agent-chat/package.json` — same
- `packages/openp41ge-logger/package.json` — same
- `packages/openp41ge-syntax-highlighting/package.json` — same
- `packages/openp41ge-themes/package.json` — same
- `packages/openp41ge-tabs/package.json` — bump from `^5.5.0` to `^7.0.2`

### Config files (if needed)

- `packages/*/tsconfig.json` — review for TS 7-specific options

## Testing Strategy

| What                     | How                                                                                 |
| ------------------------ | ----------------------------------------------------------------------------------- |
| Type-checking            | `npx tsc --noEmit` across the monorepo — zero errors expected                       |
| Unit / integration tests | `pnpm test` — all 2134+ tests must pass                                             |
| Build                    | `cd packages/openp41ge && pnpm build` — must succeed                                |
| Linting                  | `npx eslint .` — must pass with updated typescript-eslint                           |
| E2E                      | `cd packages/openp41ge && bash scripts/test-e2e.sh` — verify no runtime regressions |

Pre-existing issues to be aware of:

- `packages/openp41ge-tabs` has a pre-existing build error in `src/orchestrator.ts:270` (unrelated type assertion) — this is a separate issue, not caused by the TS 7 upgrade.

## UX Considerations

Not directly applicable — this is a build tooling upgrade with no user-facing changes. However:

- **Developer experience**: TS 7's 8–12× faster type-checking will significantly improve the dev loop for all contributors.
- **CI pipeline**: Faster builds mean faster CI feedback. Consider tuning `--checkers` and `--builders` flags for CI runners with constrained resources.

## Open Questions

1. **typescript-eslint compatibility** — will `typescript-eslint` v9 support TS 7, or will we need a v8.x minor that relaxes the peer dep? Monitor https://github.com/typescript-eslint/typescript-eslint.
2. **TS 7.1 timing** — the stable programmatic API arrives in 7.1. If `typescript-eslint` requires this, we may need to wait for TS 7.1. Current latest is 7.0.2.
3. **Pre-existing build error** — should we fix the `openp41ge-tabs/src/orchestrator.ts:270` type assertion issue as part of this upgrade, or file separately?

## Completion Criteria

- [ ] `typescript-eslint` has published a version compatible with TypeScript 7
- [ ] All `package.json` files updated to `typescript: "^7.0.2"`
- [ ] `pnpm install` succeeds
- [ ] `npx tsc --noEmit` produces zero errors across all packages
- [ ] `pnpm test` passes (95 test files, 2134+ tests)
- [ ] `cd packages/openp41ge && pnpm build` succeeds
- [ ] `npx eslint .` passes
- [ ] Any new TS 7-specific warnings/errors are resolved
