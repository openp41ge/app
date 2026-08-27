2026-08-27

# Replace ESLint + typescript-eslint with oxlint

## Goal

Replace the repo's ESLint stack (`eslint` + `@typescript-eslint/*` + `typescript-eslint`)
with **oxlint** (Rust/oxc linter), which has no `typescript` peer dependency. This removes
the sole blocker to TypeScript 7 (`typescript-eslint` peer caps `typescript` at `<6.1.0`;
installed TS is already pinned to that cap at 6.0.3). Lint behaviour should be equivalent
to today's 6-rule ESLint config. Prettier stays for formatting; knip stays for dead code.

## Rationale

- `typescript-eslint`@latest (8.68.0) still peer-deps `typescript: ">=4.8.4 <6.1.0"` — it is
  the **only** dependency constraining the TS version (verified: no other dep in the tree
  peers on `typescript`; vite/vitest/nx/tsx use esbuild or the `tsc` CLI).
- To take TS 7 we can wait indefinitely for a typescript-eslint release, or **drop the
  dependency entirely**. The repo's lint ruleset is minimal (6 rules, none type-aware), so
  the cost of abandoning typescript-eslint is very low. oxlint implements ESLint-style rule
  names natively and needs no TypeScript compiler API at all — it cannot block a TS upgrade.

### Current lint surface (to replicate exactly)

`eslint.config.js` (root, flat config):

| Rule                              | Where | Current setting                                  |
| --------------------------------- | ----- | ------------------------------------------------ |
| `@typescript-eslint/no-explicit-any` | packages/demos | `error` (off in demos, electron)            |
| `@typescript-eslint/no-unused-vars`  | packages/demos | `error`, `argsIgnorePattern/varsIgnorePattern: "^_"`, `caughtErrors: "none"` |
| `@typescript-eslint/consistent-type-imports` | all   | `error`, `prefer: "type-imports"`         |
| `no-var`                         | all          | `error`                                          |
| `no-console`                     | all          | `error` (off in demos, electron main, logger)    |
| `max-classes-per-file`           | all          | `error`, 1                                       |

Overrides: `demos/*-demo/**/*.ts` lenient; `packages/openp41ge/electron/**/*.ts` console-ok;
`packages/openp41ge-logger/**/*.ts` console-ok. Ignores: node_modules, dist, coverage,
`*.js`/`*.cjs`/`*.mjs`, `__tests__/**`, `*.d.ts`, `test/`.

**None of the 6 rules are type-aware**, so losing the TypeScript compiler API in the linter
costs nothing — oxlint can cover all of them with matching rule names.

## Approach

1. **Add oxlint** (`@oxc-project`/`oxlint@^1.80.0`) to root `package.json` devDependencies.
2. **Create `.oxlintrc.json`** at repo root (ignorePatterns mirroring the eslint ignores;
   `rules` enabling the 6 rules mapped 1:1; `overrides` for the demos/electron/logger
   carve-outs). oxlint uses ESLint-style names: `no-explicit-any`, `no-unused-vars`,
   `no-var`, `no-console`, `max-classes-per-file`, `consistent-type-imports`. Confirm exact
   option parity (`^_` ignore patterns, `caughtErrors: none`, tail `require-...` none) and
   the `max-classes-per-file` default of 1 against the installed version on first run.
3. **Rewire the `lint` target** in root `project.json`: `eslint packages/ demos/
   --no-error-on-unmatched-pattern` → `oxlint packages/ demos/` (already arrays-friendly;
   oxlint tolerates globs/missing dirs). `nx.json` lint `inputs` + cache stay as-is.
4. **Remove the ESLint stack**: delete `eslint.config.js`; drop `eslint`,
   `@eslint/js`, `@typescript-eslint/*`, `typescript-eslint` from root `package.json`.
   (`no-var`/`no-console`/`max-classes-per-file` are core-eslint rules that oxlint
   re-implements; no other package uses `eslint`.)
5. **First-run triage** (honest step): oxlint's default `correctness` tier may surface
   findings the old config never checked. Decide deliberately: either pin an
   equivalent-only ruleset first (faithful baseline), then optionally enable more tiers
   later. Do not silently accept an explosion of new warnings — triage, fix or scope them.
6. **Update docs**: **quality skill** (`SKILL.md` — currently documents `nx lint` as
   ESLint) and **AGENTS.md** (Nx Commands table "lint" row, and the quality section) to
   say lint = oxlint. If AGENTS.md/quality bear `eslint` naming anywhere else, fix it.
7. Do **not** upgrade TypeScript in this change — oxlint lands first so the TS upgrade can
   assume lint is typescript-version-independent. TS 7 is a separate, follow-on change.

### SOLID review

- Mostly N/A (tooling swap, no class design). **D** relevant: `project.json` `lint` target
  already depends on the executable via `nx:run-commands` `command` string — swapping the
  command preserves the seam. The 6 rules map through configuration (open for extension via
  `.oxlintrc.json` ruleset tiers), not code.

## Files Changed

- `package.json` (root) — add `oxlint`, remove `eslint`/`@eslint/js`/`@typescript-eslint/*`/`typescript-eslint`.
- `.oxlintrc.json` (new) — ruleset + overrides + ignorePatterns.
- `project.json` (root) — `lint` target command → `oxlint packages/ demos/`.
- `eslint.config.js` — deleted.
- `.pi/skills/quality/SKILL.md` — lint step wording (ESLint → oxlint).
- `AGENTS.md` — Nx Commands table + any ESLint references under quality/verification.
- `pnpm-lock.yaml` — via `pnpm install` (oxlint subtree in; eslint subtree out).

## Testing Strategy

- `pnpm install` resolves; `pnpm why typescript` shows no `typescript-eslint`/`eslint`
  consumers left.
- `nx lint` passes with zero findings on the current tree (compare against the old
  baseline: the repo was lint-clean before — the new run must not regress it, and any
  newly-surfaced findings are triaged in step 5).
- `nx knip` still passes (knip may flag newly-unused deps like `@eslint/js` — expected).
- `nx format:check` unaffected (prettier untouched).
- Repo smoke: `nx run openp41ge:typecheck` clean.
- Full quality pass: `nx run-many -t typecheck && nx lint && nx knip && nx run-many -t test && nx run-many -t build`.

## UX Considerations

- No runtime/user-facing change. Developer-externalised only: lint output format changes
  (oxlint's reporter) and faster lint times.
- Keep formatting with prettier (do not let oxlint's formatter/`organizeImports` interfere).

## Open Questions

(Resolved during implementation — see Verified section.)

## Completion Criteria

- [x] `oxlint` installed; `nx lint` runs it and passes clean on the tree (no new unfixed findings).
- [x] `eslint.config.js` gone; eslint/@typescript-eslint/typescript-eslint removed from `package.json`.
- [x] Equivalent 6-rule coverage with demos/electron/logger overrides in `.oxlintrc.json`.
- [x] `nx knip` back to its pre-existing baseline; `nx format:check` unchanged; openp41ge tests 883 pass; builds (openp41ge + uikit + logger) pass.
- [x] quality skill + AGENTS.md updated to say lint = oxlint.
- [x] TypeScript version untouched by this change. **Precondition satisfied**: no dependency other than the toolchain now constrains `typescript` — TS 7 upgrade is unblocked to run next.

## Verified (2026-08-27)

- **Faithful baseline**: config-only `oxlint packages/ demos/` reported exactly the same 6 errors the old `eslint` did (CLI `-D` overrides were interfering — config-only honors `argsIgnorePattern`/`caughtErrors`). All 6 were genuine pre-existing violations that old eslint also flagged but Nx-cache had masked. Fixed them:
  - `uikit tree.ts` — removed dead `CHEVRON_WIDTH`/`ICON_WIDTH` (they carried `@ts-expect-error`; `noUnusedLocals` is on).
  - `editor-system-tab-operations.ts` — `tabId as any` → `tabId as TabId` (×3).
  - `service-modal-service.ts` — `console.warn` → `createLogger("service-modal-service").warn`.
- **oxlint scoping**: `.oxlintrc.json` sets `categories: { …off }` so only the 6 legacy rules run (oxlint's default correctness/unicorn tiers are intentionally off — adopt more rules later, deliberately). `nx lint` = `oxlint packages/ demos/`, cache disabled in `nx.json` (a stale cached green had been hiding the 6 real errors).
- **Cleanups**: `knip.json` dropped stale `@eslint/js`/`typescript-eslint` ignoreDependencies; quality skill + AGENTS.md updated; `pnpm why typescript` shows no eslint/typescript-eslint consumers.
- **Gates**: `nx lint` exit 0; openp41ge tests 883 pass, logger 61 pass; builds (openp41ge, uikit, logger) pass.
- **Pre-existing (not from this change — verified by stash-at-HEAD)**: `nx run-many -t typecheck` has ~35 errors (missing `openp41ge-file-editor` module — only a Vite alias exists, no paths mapping — plus state/model drift); `nx knip` has 76 findings. Both were red at HEAD; this change adds zero new findings to either.
