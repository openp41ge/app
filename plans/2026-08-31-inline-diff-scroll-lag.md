2026-08-31

# Fix: line-number columns lag behind the viewport while scrolling

## Symptom
The BEFORE/AFTER line-number columns appear to scroll a tiny step behind the
file content during fast scrolling.

## Root cause
Two per-frame main-thread costs made the gutter trail the natively-scrolled
(note: compositor-driven) viewport content:

1. The normal gutter's inner scroll container used `translateY(-Npx)` with NO
   `will-change` and an UNSIZED box whose absolutely-positioned band extends to
   the full document height (~29k px). Each scroll frame forced a main-thread
   repaint of that huge area, visibly lagging the compositor.
2. Two duplicate `scroll` listeners updated the transform (one in
   firstUpdated, one re-attached on EVERY `_initWithModel` — a listener leak
   that compounded per model load).

## Changes
- `LineNumbersOverlay` scroll container: `will-change: transform`,
   `height:100%`, `overflow:hidden`, `translate3d` — a bounded, composited
   layer that the compositor scrolls in lockstep with the content (labels stay
   document-positioned; only the visible band is painted).
- `InlineDiffGutterColumns` inner: same viewport-height, clipped, will-change
   layer (+ existing translate3d).
- `file-editor.ts`: removed the per-model-load duplicate `scroll` listener
   (firstUpdated's single listener already syncs transforms for the element's
   lifetime; `onVisibleRangeChanged` still repaints the label band).

## Verification
- 117 tests (incl. container classes/transform unchanged), typecheck + lint
  green.
- Live: both columns' inner containers are `will-change: transform`,
  794px (viewport height, NOT ~29k), transforms `translate3d`; 0 captured
  errors. (Note: CDP scrollTop/wheel dispatch does not fire real scroll events
  in this headless context, so the transient lag itself is not measurable
  here — this is the standard compositor-layer fix for the class of lag.)
