2026-08-31

# Fix: line numbers lag AND stop rendering below the viewport fold

## Symptom
Two related regressions after the previous compositor-layer change:
1. Numbers only render down to the bottom of the viewport; scrolling reveals no
   further numbers below the fold.
2. The numbers still lag/trail the content.

## Root cause
The numbers were **siblings of the native scroller** moved by a JS CSS
transform. That architecture is inherently behind the compositor:
- the band was clipped to the viewport height (`overflow:hidden;height:100%`),
  so "below the fold" only got numbers when the transform follower happened to
  paint them — fragile and easy to lose;
- every scroll frame needed a main-thread transform write + band repaint, so
  the columns trailed the compositor-scrolled content.

## Fix — put the numbers INSIDE the native scroll (VSCode-style unified scroll)
Monaco/VSCode never follow the scroll with JS: their `.margin` (line numbers)
and `.content` share ONE coordinate space driven by the same scroll, so they
are lockstep by construction. Our editor already uses native scrolling for the
content, so the equivalent guarantee is to place the columns IN the same native
scroll container:

```
.fe-viewport (the scroller)
  .fe-scroll-content (flex row, width:max-content, min-width:100%)
    .fe-inline-left (BEFORE column; sticky left:0)
    .fe-gutter     (AFTER column; the LineNumbersOverlay)
    .fe-text-region (all content renderers re-parented here)
```

Consequences:
- The `.view-lines` element (already full document height) drives the flex
  row's height, so the gutter columns stretch to the WHOLE document (30500px
  live) — numbers exist and natively scroll for the entire file. The
  "only to the bottom of the view" clip is gone.
- NO transform, NO scroll-following listener, NO will-change layer. The
  numbers move exclusively by native scroll (compositor-driven, in lockstep
  with the text) — the lag architecture is removed, not reduced.
- Band virtualization is retained (write-on-change repaint from the previous
  commit), so per-frame cost is still O(boundary) — it just no longer owns the
  offset (native scroll does).

Changes:
- `file-editor.ts`: template drops the sibling `.fe-gutter`; `_createViewport`
  builds scroll-content/gutter/text-region inside the viewport; ALL content
  renderers (ViewLines, cursor, selection, find, current-line, inline-diff
  tints, indentation guides) are re-parented to the text-region — every one of
  them uses its own pixel math against the parent's left edge, so the
  coordinate bases are preserved exactly; removed the transform scroll
  listener + `_bindGutterWheel` (native wheel now works over the columns).
- `inline-diff-gutter-columns.ts`: BEFORE column becomes `position:sticky;
  left:0`; removed wheel forwarding + scrollTarget; `setScrollOffset` → no-op.
- `line-numbers-overlay.ts`: `setScrollOffset` → no-op; removed the
  will-change layer.
- `view-lines.ts`: stop clobbering the parent's existing class with
  `fe-viewport` (only set it when the parent has none) — the clamp renamed the
  text-region and broke its CSS.
- tests updated: caret-focus/read-only locate the caret under the text-region.

## Verification
- Live: scroll-content = [before, after, text-region]; text-region holds
  view-lines/cursor/current-line/guides/tints; gutter height == scroll height
  == 30500px (full document); both columns have NO transform; numbers sit at
  doc-absolute tops offset by native `scrollTop` exactly (y = docTop -
  scrollTop); a scroll to 5000 moved the initial 1..42 band off-screen natively
  (before this change the transform follower stayed frozen in this headless
  env); repainting the band at 240..300 renders at the expected offsets;
  0 captured errors.
- Suites: uikit+editor-engine 159/159, `nx run openp41ge:test` 1071/1071,
  typecheck + lint green.
- Caveat: this headless CDP context cannot fire real (trusted) scroll events,
  so there is no frame-timing video here — the guarantee comes from THE
  ARCHITECTURE: numbers and text share one native scroll container, so they
  cannot be out of sync (unlike the previous transform follower). Verified
  positionally (doc positions + native offset) and visually near-atomic via
  the selector-overlay'd pane.
