# Sentry: release pipeline + source-map upload & version plumbing (plan)

Status: proposed
Date: 2026-09-29

## Goal

Make packaged-app crashes readable in Sentry by:
1. **Emitting source maps** for both the renderer (Vite) and main process (esbuild).
2. **Uploading them to Sentry tagged with the release version** during the release pipeline.
3. **Ensuring the version (and ideally channel) is embedded in the built app** so the app's reported `release`/`environment` exactly matches the upload, so Sentry maps stacks to source.

## Current state

- Renderer bundled by Vite → `dist/`. **No source maps today** (`build.sourcemap` unset).
- Main bundled by esbuild → `dist-electron/electron/main.js` (single file, `--external:electron`). **No source maps today** (`--sourcemap` unset).
- `release.yml`:
  - `meta` job computes `version` (e.g. `0.1.0-alpha.1`), `tag`, `channel` (`alpha`/`beta`/`rc`/`stable`), `prerelease`.
  - `build-macos` (macos-14) writes that `version` into `packages/openp41ge/package.json`, then `pnpm nx build openp41ge` (vite → main tsc → esbuild → cp preload), then `electron-builder --mac`.
  - `release` job creates/updates the GitHub release and uploads artifacts + `install.sh`.
- `electron/sentry.ts` already sets `release: app.getVersion()` and `environment: app.isPackaged ? "production" : "development"`. `app.getVersion()` reads `package.json` (the same version CI writes) — so **the app already reports the correct release**.
- `electron-builder.yml` `files` ships `dist/**`, `dist-electron/electron/main.js`, `preload.cjs`, `package.json`. Source maps (if emitted) would currently be **shipped inside the asar** unless excluded.

## Changes

### 1. Emit source maps

- **Vite** (`packages/openp41ge/vite.config.ts`): add
  `build: { sourcemap: "hidden", ... }`.
  `"hidden"` writes `.js.map` files but omits the `//# sourceMappingURL` comment, so
  maps aren't referenced by the shipped bundle (and won't be picked up by devtools
  against packaged files) — Sentry uploads them.
- **esbuild** (`packages/openp41ge/project.json` → `build` target command): add
  `--sourcemap=external`, which writes `dist-electron/electron/main.js.map`
  beside the bundle. Leave `build:electron` (dev tsc) unchanged.
- **Do not ship maps** (`packages/openp41ge/electron-builder.yml` `files`): add
  negations so the asar stays lean:
  ```yaml
  files:
    - dist/**
    - dist-electron/electron/main.js
    - dist-electron/electron/preload.cjs
    - package.json
    - "!dist/**/*.map"
    - "!dist-electron/**/*.map"
  ```

### 2. Upload source maps with the release version

- Add `@sentry/cli` as a **devDependency** in `packages/openp41ge/package.json`
  (pin the version so builds are reproducible).
- Add a `.sentryclirc` at the repo root (committed; **no secrets**):
  ```ini
  [defaults]
  url = https://sentry.io
  org = tw050x
  project = openp41ge
  ```
  Auth is provided via the `SENTRY_AUTH_TOKEN` env var at runtime.
- Add an upload script `packages/openp41ge/scripts/upload-sourcemaps.sh`:
  - Args/`env`: `VERSION` (required), `CHANNEL` (optional → `DIST`).
  - Runs `sentry-cli sourcemaps upload --release "$VERSION" [--dist "$CHANNEL"]`
    with the two globs: `dist/**/*.map` and `dist-electron/**/*.map`.
  - Optional `--url-prefix` if Sentry can't resolve the `file://`/`app.asar`
    paths out of the box (verify against a real event; the Sentry wizard picks
    this up automatically, we can mirror whatever it writes).
- **Wire into `release.yml`** `build-macos` job, right after `pnpm nx build
  openp41ge`:
  ```yaml
  - name: Upload source maps to Sentry
    working-directory: packages/openp41ge
    env:
      SENTRY_AUTH_TOKEN: ${{ secrets.SENTRY_AUTH_TOKEN }}
      VERSION: ${{ needs.meta.outputs.version }}
      CHANNEL: ${{ needs.meta.outputs.channel }}
    run: bash scripts/upload-sourcemaps.sh
  ```
- Add a GitHub **secret `SENTRY_AUTH_TOKEN`** (create in Sentry: Settings →
  Auth Tokens, org + release:write scope). **Required action by a human** — can't
  be done from code.

### 3. Embed version (and channel) in the built app

The main process already reports `release: app.getVersion()`, which matches the
upload version. Two refinements so `release`/`environment` are exact and the
renderer is consistent too:

- **Vite define** (`vite.config.ts`):
  ```ts
  define: {
    __OPENP41GE_VERSION__: JSON.stringify(process.env.APP_VERSION ?? "0.0.0-dev"),
    __OPENP41GE_CHANNEL__: JSON.stringify(process.env.APP_CHANNEL ?? "development"),
  }
  ```
  and set `APP_VERSION=${{ needs.meta.outputs.version }}`,
  `APP_CHANNEL=${{ needs.meta.outputs.channel }}` in the `build-macos` step.
- **Main (`electron/sentry.ts`)**: prefer the baked build constant when present so
  release/environment are build-time authoritative, falling back to
  `app.getVersion()`:
  ```ts
  const version = __OPENP41GE_VERSION__ && __OPENP41GE_VERSION__ !== "0.0.0-dev"
    ? __OPENP41GE_VERSION__
    : app.getVersion();
  const environment = __OPENP41GE_CHANNEL__ && __OPENP41GE_CHANNEL__ !== "development"
    ? __OPENP41GE_CHANNEL__
    : (app.isPackaged ? "production" : "development");
  ```
  (These constants need a `declare` in `electron/`'s ambient types — same pattern
  as the existing `__OPENP41GE_DEBUG__` renderer define.)
- **Renderer (`src/renderer/main.ts`)**: `Sentry.init({ release: __OPENP41GE_VERSION__ })`
  so the renderer's own client is consistent (delivery still goes through main,
  but it removes any release mismatch).

Result: the version the app reports in every event == the version maps are
uploaded under == the release tag. Channel flows into `environment` so the
Sentry UI can filter `alpha` vs `beta` vs `stable`.

## Required human actions (no code can do)

1. **Add `SENTRY_AUTH_TOKEN` secret** to the GitHub repo (Settings → Secrets and
   variables → Actions) with a Sentry auth token scoped to `tw050x`/`openp41ge`
   (org read + release write).
2. **Create the Sentry project already done** (`openp41ge`, org `tw050x`).
3. Verify a real event resolves its stack against uploaded maps after the first
   source-mapped release (adjust `--url-prefix` if not).

## File-touch summary

| File | Change |
|------|--------|
| `packages/openp41ge/vite.config.ts` | `build.sourcemap: "hidden"` + `__OPENP41GE_VERSION__`/`__OPENP41GE_CHANNEL__` defines |
| `packages/openp41ge/project.json` | add `--sourcemap=external` to esbuild build command |
| `packages/openp41ge/electron-builder.yml` | exclude `*.map` from packaged files |
| `packages/openp41ge/electron/sentry.ts` | use baked version/channel with fallback |
| `packages/openp41ge/electron/ambient types` | `declare` the two defines |
| `packages/openp41ge/src/renderer/main.ts` | pass `release` to renderer init |
| `packages/openp41ge/package.json` | add `@sentry/cli` devDependency |
| `packages/openp41ge/scripts/upload-sourcemaps.sh` | new — `sentry-cli sourcemaps upload` |
| `.sentryclirc` | new — org/project defaults |
| `.github/workflows/release.yml` | build-macos: set `APP_VERSION`/`APP_CHANNEL`, then upload maps |

## Validation

- Locally: run `pnpm nx build openp41ge` and confirm `dist/**/*.map` +
  `dist-electron/electron/main.js.map` exist and contain valid mappings; confirm
  the packaged asar contains NO `.map` files.
- CI: dry-run `sentry-cli sourcemaps upload` against a throwaway Sentry release
  (`--release 0.0.0-test`) to confirm auth + globs.
- End-to-end after a release: trigger an error in the packaged alpha, confirm the
  Sentry event `release` equals the tag, stack is source-mapped, and
  `environment` = the channel.
