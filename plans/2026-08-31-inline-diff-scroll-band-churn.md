2026-08-31

# Fix: number columns still lag while scrolling (band-rebuild churn)

## Symptom
After compositing the gutter layers (will-change + translate3d) the number
columns still visibly lag/trail the content during fast scrolling.

## Root cause
Both line-number columns re-painted their ENTIRE visible band on every
scroll-driven visible-range change:

- `LineNumbersOverlay.setVisibleRange` rewrote top/height/overflow/text/
  decoration classes for EVERY visible line (~50) every call, even though the
  band only shifts by a boundary line or two.
- `InlineDiffGutterColumns.setVisibleRange` did the same for the BEFORE column.

That is ~100 DOM style writes per scroll frame on the main thread (plus the
editor's own line rebuild), so the main thread lags the compositor-scrolled
content — the columns visibly drag behind.

## Changes
Write-on-change band painting in both components:

- Each band entry caches its last-applied geometry (top/height/overflow),
  label text, active flag, and decoration-class key.
- A repaint diffs against the cache: reused entries are touched only when a
  value actually changed, so a plain scroll becomes O(boundary) instead of
  O(band) — one create + one remove per frame, zero writes on the rest.
- `setActiveLines` keeps the per-cell cache coherent so a subsequent band
  repaint doesn't re-write an unchanged class.

## Verification
- New regression tests (17 for the two components):
  - Re-painting the same range = ZERO MutationObserver records.
  - A shifted band adds exactly the entering cell and removes the leaving one;
    no attribute/text writes land on reused elements (asserted via
    MutationObserver, filtering writes on pre-existing targets).
  - Unchanged decorations are a no-op; changed decorations repaint that cell.
  - The new overlay test FAILS against the old code (proves it tests the bug).
- Suites: uikit file-editor + editor-engine 118/118; `nx run openp41ge:test`
  1071/1071; typecheck + lint green.
- Live: band trims 500→42 on range shrink with correct document-absolute tops;
  0 captured errors.
  (Note: CDP cannot fire real scroll events in this headless context, so the
  transient lag itself is not measurable here; this removes the concrete
  main-thread cost that caused it.)
