2026-08-31

# Per-file word wrap + a default toggle in the Editor settings tab

## Symptom / requirement
Word wrap behaved like a global (per-extension) switch:
`_toggleWordWrap` saved `openp41ge:wordWrap:<ext>` in localStorage, and every
file of that extension read the same value — toggling wrap in one file applied
it to all of them. It must instead be:
- applied AND remembered PER FILE (per path), and
- governed by a new DEFAULT on/off control in the Editor overlay tab for files
  without their own per-file choice.

## Changes
`packages/openp41ge-uikit/.../file-editor.ts`
- Wrap resolves per path at init: per-file override
  (`openp41ge:wordWrap:path:<filePath>`) wins, otherwise `_wordWrapDefault`.
- New public `setWordWrapDefault(enabled)` — the Editor-settings default. If this
  editor is loaded and has NO per-file override, applies live. A file with a
  saved override is never disturbed by default changes.
- `_toggleWordWrap` now writes only the per-file path key (no ext-global key).
  The old extension-wide key is ignored.

`packages/openp41ge/src/renderer/apps/file-viewer/file-editor-controller.ts`
- `_applyEditorSettings` reads `editor.wordWrap` from the config service and
  calls `editor.setWordWrapDefault(...)` on mount and on config change.

`packages/openp41ge/src/renderer/components/openp41ge-file-editor-settings.ts`
- New card "Word wrap for new files" with an on/off switch persisting the
  boolean `editor.wordWrap` (absent => off). Stays live on external changes.

## Verification
- New uikit tests (5): default applies when no override; per-file override wins
  over the default; toggling one file never affects another and writes only the
  path key; the legacy ext key is ignored; overridden wrap is remembered across
  editor instances for the same path.
- New settings tests (4): switch renders (default OFF), reflects saved value,
  toggle persists `editor.wordWrap`, responds to external config change.
- Live: on an editor with no override, `setWordWrapDefault(true)` applies live
  (overflowX hidden); with a per-file override stored, default changes do not
  disturb the open file.
- Suites: openp41ge 1075, uikit+editor-engine 124, typecheck + lint green.
- Note: leftover `openp41ge:wordWrap:<ext>` keys from earlier sessions are
  ignored (no read path), and are not back-migrated.
