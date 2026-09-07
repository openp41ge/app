# 2026-09-06 — Logs settings card + reusable uikit toggle

## Goal

Redesign the Logs settings grid tab into a sectioned settings surface (no intro title/line,
GENERAL section header, padded, brighter borderless cards with a question → answer control →
explanation). Extract the existing editor word-wrap switch into a reusable uikit toggle
(`<openp41ge-toggle>`), and use it in both the Editor and Logs settings tabs so it can be
reused by future settings.

## Approach

1. **New uikit component** `openp41ge-toggle`: a switch (hidden checkbox + track + state label)
   extracted from `openp41ge-file-editor-settings.ts`. Props `checked` (reflect), `onLabel`
   (default "On"), `offLabel` (default "Off"); dispatches a composed `change` CustomEvent with
   `detail: { checked }`. Shadow DOM + static styles, exported from `openp41ge-uikit`.
2. **Editor settings** (`openp41ge-file-editor-settings.ts`): replace the inline `.fes-switch`
   markup/ CSS with `<openp41ge-toggle .onLabel=${'On'} .offLabel=${'Off'}>`; `_onWordWrapToggle` reads
   `e.detail.checked`.
3. **Logs settings** (`openp41ge-logs-settings.ts`): remove intro `<h2>`/hint; add a padded
   container, a "GENERAL" section header, and a single borderless brighter card
   (`rgba(255,255,255,0.05)`, no border) with the question "Would you like to capture debug
   logs?", a Yes/No `<openp41ge-toggle>`, and a short explanation. `_onDebugToggle` reads
   `e.detail.checked`.

### Learnings (non-obvious fixes hit during implementation)

- **Toggle labels must be set as property bindings with expressions**, e.g. `.onLabel=${'Yes'}`,
  NOT as plain attributes `on-label="Yes"`. In the jsdom/vitest environment the `@property`
  attribute→property sync does not fire for `on-label`/`off-label`, so the defaults ("On"/"Off")
  leak through. Property bindings with an explicit `${...}` expression work reliably.
  (`.onLabel="Yes"` literal form is also NOT applied — Lit needs an expression.)
- **Import uikit via a side-effect import.** Loading uikit with a named export
  `import { Openp41geToggle } from "openp41ge-uikit"` did not register `<openp41ge-toggle>` as a
  custom element under the vitest alias resolution (the element stayed a plain `HTMLElement`),
  even though `import("openp41ge-uikit")` did. Use `import "openp41ge-uikit";` for the
  registration side effect (the tag is used in the template, the class value is not needed).
- oxlint flags the unused named import — the side-effect import also fixes `no-unused-vars`.
- **`::host { padding }` is overridden by the app's global reset.** The app injects a
  preflight `* { margin: 0; padding: 0; box-sizing: border-box }` that beats any `:host` padding
  in the shadow DOM (only `!important` or moving the padding off the host wins). The Editor
  settings already avoided this by padding an inner `.fes-pane`. So Logs and Agent settings now
  put their padding on an inner `.ls-pane` / `.as-pane` wrapper instead of `:host`. Verified in
  the running app: the Logs card is inset 32px from each edge. **Do not put padding on `:host`**
  for settings surfaces while this reset exists.

## Files Changed

- `packages/openp41ge-uikit/src/components/openp41ge-toggle.ts` — NEW reusable toggle.
- `packages/openp41ge-uikit/src/index.ts` — export `Openp41geToggle`.
- `packages/openp41ge/src/renderer/components/openp41ge-file-editor-settings.ts` — use toggle.
- `packages/openp41ge/src/renderer/components/openp41ge-logs-settings.ts` — redesign.
- `packages/openp41ge/test/unit/modals/file-editor-settings.test.ts` — word-wrap switch tests.
- `packages/openp41ge/test/unit/components/openp41ge-logs-settings.test.ts` — toggle tests.

## Testing Strategy

- Unit: update editor word-wrap tests to drive `<openp41ge-toggle>` (shadow input + label).
- Unit: rewrite logs-settings tests to assert the question, the toggle's yes/no label, and the
  `setMinLevel`/`setDebug` behaviour on `change`.
- Run `nx run-many -t typecheck`, `nx lint`, `nx run-many -t test`, `nx run-many -t build`.

## UX Considerations

- Card matches the existing editor settings card: brighter translucent background, no border,
  Q on top, answer control beneath within the card, explanation under it.
- Section header "GENERAL" is a small uppercase muted heading; container padded so cards don't
  reach the edges.
- Toggle default labels "On"/"Off" (editor) and "Yes"/"No" (logs) via the `onLabel`/`offLabel`
  props.

## Open Questions

None.

## Completion Criteria

- [x] `<openp41ge-toggle>` lives in uikit and is reused by Editor + Logs settings.
- [x] Logs settings has no intro title/line; shows GENERAL section; padded; borderless brighter
      cards.
- [x] Logs card question reads "Would you like to capture debug logs?" with a Yes/No toggle.
- [x] Typecheck, lint, tests, build pass.

## Status — DONE

Full platform test suite: 95 files / 1220 tests pass. `nx run-many -t typecheck`, `nx lint`,
`nx format:check`, `openp41ge-uikit:build`, and `openp41ge:build` all pass. The uikit package has
no `test` target (no vitest config there) — the toggle is exercised through the platform's
Editor and Logs settings tests.
