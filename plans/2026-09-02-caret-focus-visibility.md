# 2026-09-02 — Carets hidden on all but the focused file editor

## Goal

Only the **focused** file editor may show its caret(s). If no file editor is
focused, none show. This must not destroy carets — refocusing restores placement,
including multiple (secondary) carets.

## Rationale

Every `FileEditorElement` shows a caret even when its textarea is not focused.
Reproduced live: caret `visibility: visible`, opacity animated by the blink loop,
while `document.activeElement` is an unrelated element (e.g. the worktree tree).

Root cause: `_syncCursorView()` (file-editor.ts:1128) ends with an unconditional
`this._cursorRenderer.show()`. The `onFocus`/`onBlur` handlers correctly call
`show()`/`hide()`, but any cursor view sync — initial mount render, a model/cursor
update in a background tab, etc. — forces the caret visible again, overriding the
blur-hide. So an editor that was never focused (or lost focus) shows a live caret.

## Approach

- Add a private `_isFocused = false` flag to `FileEditorElement`.
- Set it in the existing `TextAreaInput` callbacks:
  - `onFocus`: `this._isFocused = true; this._cursorRenderer?.show();`
  - `onBlur`: `this._isFocused = false; this._cursorRenderer?.hide();`
- `_syncCursorView()`: replace `this._cursorRenderer.show()` with
  `if (this._isFocused) this._cursorRenderer.show();` — a view sync must never
  resurrect carets in a blurred editor.
- Multi-caret path is untouched: `syncCursorCount()`/`positionAt()` still create and
  position all caret elements; `show()/hide()` reveal/hide them all together, so
  refocus shows primary + secondary carets at their saved positions.

## Files Changed

- `packages/openp41ge-uikit/src/components/file-editor/file-editor.ts` — the flag +
  focus callbacks + gated `show()`.
- `packages/openp41ge-uikit/test/components/file-editor/caret-focus.test.ts` (new) —
  regression suite (mount in jsdom; editor-engine + syntax-highlighting now source-
  aliased in root `vitest.config.ts` so tests can construct a `PieceTreeTextContentModel`).
- `vitest.config.ts` — add `openp41ge-editor-engine` + `openp41ge-syntax-highlighting`
  source aliases (mirrors `openp41ge-tabs` precedent and the main app's dev aliases).

## Testing Strategy

- Test-first (fails before fix):
  1. Unfocused editor → caret hidden (currently fails: caret is visible on mount).
  2. Focus → caret visible.
  3. Blur → caret hidden.
  4. **Regression core:** while blurred, an input/cursor sync runs → caret stays
     hidden (currently fails: sync re-shows it).
  5. Refocus → caret visible again (not destroyed).
  6. Multi-caret: second cursor added → 2 caret elements; blur hides both; refocus
     shows both at their positions.
- Live: open two file editors in the app, click one → only its caret blinks; click
  the other → theirs; click empty grid/sidebar → no caret anywhere.

## UX Considerations

- No new focus-stealing: opening a file still does not focus the textarea, so no
  caret appears until the user actually clicks into an editor (current intentional
  behaviour, unchanged).
- Click-into-editor: `_syncCursorView` runs before the next-frame `focus()`, so the
  caret appears the moment focus lands (onFocus → show) — no visible change in feel.

## Open Questions

None — requirement is unambiguous.

## Completion Criteria

- [ ] All six regression tests pass (fail pre-fix, pass post-fix).
- [ ] Live: only the focused editor's caret is visible; none when nothing is focused.
- [ ] Full `openp41ge:test` + uikit suites green; tsc/lint/format clean.
- [ ] Documented in `AGENTS.md`? No — behaviour fix, no guide-change needed.
