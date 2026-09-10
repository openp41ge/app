2026-09-10

# Agent chat code-block syntax highlighting + language badge

## Goal

Fenced code blocks (``` … ```) in assistant responses should be syntax
highlighted, and each block should show a small language badge in its top-right.
When the language was inferred (not written after the backticks), the badge is
clickable to change the highlight language.

## Findings

- The platform's lightweight regex tokenizers live inside the `openp41ge` app
  renderer (`renderer/controllers/syntax-highlight/`) and are not importable by
  `openp41ge-agents` (which depends only on `lit`).
- The `openp41ge-syntax-highlighting` package is TextMate-based (grammars +
  oniguruma wasm, async, editor-oriented) — too heavy for an interactive chat
  renderer.
- The chat transcript is in a shadow root, so global scrollbar/highlight styles
  from `document.head` don't reach it (styles must live in the component).

## Approach

### Lightweight highlighter (`syntax-highlight.ts`)

A dependency-free, line-based, best-effort tokenizer that emits `hl-*` spans
(same classes the platform editor uses) for: typescript, javascript, python,
bash, json, yaml, css, html/xml, go, rust, sql, markdown, text.

- `highlight(code, lang)` → HTML string (escaped, `hl-*` spans).
- `detectLanguage(code)` → content-based inference for blocks with no tag.
- `normalizeLanguage(alias)` → canonical id (js→javascript, py→python, …).
- `SUPPORTED_LANGUAGES` + `cycleLanguage(current)` for the badge interaction.

### Markdown integration (`markdown.ts`)

Fenced blocks now render as:

```html
<div class="code-block" data-code-index="0" data-code-lang="javascript" data-msg-id="…" data-code-inferred="true">
  <button type="button" class="code-lang" …>JS</button>
  <pre><code>…hl-* spans…</code></pre>
</div>
```

`renderMarkdown(md, options)` accepts `codeLanguages` (per-block index overrides)
and `msgId` (routed by the UI). `data-code-inferred` is present only when the
language was inferred rather than explicitly tagged.

### UI interaction (`openp41ge-agents.ts`)

- `_codeLangOverrides` state keyed by `${msgId}::${index}`; `_codeLangForMessage`
  builds the per-message override map passed to `renderMarkdown`.
- `_onMsgContentClick` delegates clicks on `.code-lang`, reads `data-code-lang`,
  calls `cycleLanguage`, stores the override, and re-renders.
- Added `.code-block`, `.code-lang`, and `hl-*` CSS inside the component's shadow
  styles (transparent track/border handled by `.code-block`).

## Files Changed

- `packages/openp41ge-agents/src/ui/syntax-highlight.ts` (new).
- `packages/openp41ge-agents/src/ui/markdown.ts` — renderCodeBlock + options.
- `packages/openp41ge-agents/src/ui/openp41ge-agents.ts` — badge interaction + CSS.
- `packages/openp41ge-agents/test/unit/chat/syntax-highlight.test.ts` (new).
- `packages/openp41ge-agents/test/unit/chat/markdown.test.ts` — updated fenced-block
  test + inferred/override/msgId tests.
- `packages/openp41ge-agents/test/unit/chat/openp41ge-agents.test.ts` — badge-click
  cycle test.

## Testing Strategy

- Unit tests for `highlight`, `detectLanguage`, `normalizeLanguage`,
  `cycleLanguage`, `langLabel`, and HTML escaping.
- `renderMarkdown` tests for the badge markup, inferred vs explicit, overrides,
  and msgId stamping.
- Component test that clicking the badge cycles the block's language.
- `npx tsc --noEmit`, `npx oxlint`, `npx prettier --check`.

## Assumptions

- Badge is always rendered and clickable (it also lets users correct an explicit
  tag); the inferred flag is surfaced via `data-code-inferred`.
- Clicking cycles through `SUPPORTED_LANGUAGES` rather than opening a dropdown
  menu (simplest interaction; can be upgraded later).

## Completion Criteria

- [x] Fenced code blocks are syntax highlighted and escaped.
- [x] Each block shows a language badge in the top-right.
- [x] Detected/inferred blocks are clickable to change the highlight language.
- [x] Unit + component tests pass; `tsc`, `oxlint`, `prettier` green.
