2026-08-31

# Fix: red/green diff tints misalign when word wrap is enabled

## Symptom
With word wrap on, the full-width red (removed) / green (added) row tints in
the inline commit-diff viewer don't line up with the wrapped text lines (and
the number cells).

## Root cause
`InlineDiffHighlightsRenderer.render` placed each band at `(modelLine-1)*lh`
with height `lh` — it was wrap-unaware. A wrapped model line occupies
`vCount*lh` of vertical space starting at its first VIEW segment
(`getViewLineStart(modelLine)`), but the tint painted exactly one row at the
model position, so it landed on the wrong visual row and never covered the
extra wrapped segments.

## Fix
Made the tint renderer wrap-aware exactly like the number columns: `render`
now takes the same `getViewLineStart`/`getViewLineCount` view mapping, and
paints each band at `(vStart-1)*lineHeight` with height `vCount*lineHeight`.
`_updateInlineHighlights` passes the mapping from `_inlineWrapGetters()` —
the identical mapping the BEFORE/AFTER columns use — so text, numbers, and
tints all agree on wrapped geometry.

## Verification
- New unit tests: a wrapped added row's tint spans ALL its segments (top at
  first view line, height vCount*lh); identity mapping reproduces the old
  single-row behavior.
- Live: enable wrap on the diff (view lines 1490 -> 1562). Non-wrapped rows
  verified view-positioned; wrapped row model 669 (-> view 709, 2 segments)
  renders at top 14160px / height 40px — exact.
- Suites: uikit+editor-engine 161, openp41ge 1071, typecheck + lint green.
