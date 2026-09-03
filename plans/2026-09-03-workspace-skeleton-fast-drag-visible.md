# 2026-09-03 — Workspace skeleton vanishes on a fast grab-and-drag

## Goal
The workspace skeleton drag ghost must be visible on a fast grab-and-drag
(mousedown + immediately move, no pause). It currently appears only if the user
pauses after mousedown or grabs-and-holds.

## Approach
- Pre-capture the skeleton bitmap on **hover** (`pointerenter`) so the capture
  starts before pointerdown — the pre-capture is then resolved (or well along)
  by the time `drag.start` fires on a fast drag.
- Make the `drag-prepare-bitmap` handler reuse an already-captured or in-flight
  bitmap for the **same rect**, so the pointerdown re-request does not start a
  duplicate capture that races the hover one.
- Keep the existing `drag.start` fallback: use the ready bitmap via `setBitmap`,
  or await the in-flight capture (`pendingPrepare`) rather than issuing a second
  `capturePage`.

## Completion criteria
- Fast drag shows the skeleton drag ghost immediately (no blank/transparent ghost).
- No double `capturePage` races the first.
- `nx run openp41ge:typecheck`, `nx run openp41ge:test`, `nx lint` all pass.
- Live-verified: hover → fast drag yields `preparedBitmap: true` and the ghost
  renders the skeleton at the lifted frame.

## Status
Done. Commit follows.
