2026-08-31

# Inline diff: wrap-aware left column + commit ID in the bottom bar

## 1. Left (BEFORE) number column now accounts for word wrap

The left labels were placed at `(line-1)*lineHeight` with a single row height,
so with word wrap enabled a long buffer line wrapped into N rows while the
left label still occupied one row — every label below it drifted out of
alignment.

`InlineDiffGutterColumns.setVisibleRange` now accepts the same per-model-line
VIEW mapping as the normal gutter (`getViewLineStart`/`getViewLineCount`):
- top anchored at the model line's FIRST view segment `(vStart-1)*lh`,
- height spans the whole wrapped block `vCount*lh`,
- the number text stays top-aligned (`align-items:flex-start`) so it sits on
  the first segment, exactly like the AFTER column.
The red/green/active cell backgrounds (label height) therefore also run
continuously down the wrapped segments.

`<file-editor>` passes guarded wrap getters (`_inlineWrapGetters`, identity
when word wrap is off) at both repaint sites (setInlineDiff paint and the
onVisibleRangeChanged scroll repaint).

## 2. Remove the header bar; commit ID lives in the bottom bar

The commit-file-diff pane had a 28px header strip ("path — short-hash").
Removed it; the pane is now edge-to-edge editor. The short commit ID renders
right-aligned in the file editor's bottom status bar, immediately LEFT of the
icon cluster:

- `FeStatusBar.setInfo(text | null)` + a right-aligned `.sbb-info` span placed
  between the size group and the icon group (left group is flex:1, so the info
  sits right, leftmost of the icons).
- `FileEditorElement.setStatusInfo(text | null)` forwards to the status bar and
  HOLDs the pending value until `firstUpdated` finds `<fe-status-bar>` (the
  pane sets it synchronously at mount, before the editor initialises).
- `CommitFileDiffController`: header build removed; mount calls
  `editor.setStatusInfo(hash.slice(0,7))`.

## Verification

- gutter-columns wrap test: fake view map positions labels at the first view
  segment and spans `vCount*lh`, `flex-start` alignment.
- pane test: `.sbb-info` shows the short hash; the old header border style no
  longer appears in the pane DOM.
- openp41ge 1071, uikit+editor-engine 153, typecheck/lint green.
- Live (public/app.js@43985c3): no header; `fe-status-bar` shows `43985c3`
  right-aligned near the row's right edge; 0 captured errors.
