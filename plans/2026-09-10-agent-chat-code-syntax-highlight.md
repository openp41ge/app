2026-09-10

# Agent chat code-block syntax highlighting + language picker

## Goal

Fenced code blocks (``` … ```) in assistant responses should be syntax
highlighted, with a small toolbar *above* each block (not overlapping the code)
holding a language badge (full name) and a line-wrap toggle. Clicking the badge
opens an inline language picker. When the language was inferred, the picker only
lists the detected candidate languages rather than every supported language.

## Findings

- The platform's lightweight regex tokenizers live inside the `openp41ge` app
  renderer (`renderer/controllers/syntax-highlight/`) and are not importable by
  `openp41ge-agents` (which depends only on `lit`).
- The `openp41ge-syntax-highlighting` package is TextMate-based (grammars +
  oniguruma wasm, async, editor-oriented) — too heavy for an interactive chat
  renderer.
- The chat transcript is in a shadow root, so global styles from `document.head`
  don't reach it (styles must live in the component).

## Approach

### Lightweight highlighter (`syntax-highlight.ts`)

A dependency-free, line-based, best-effort tokenizer that emits `hl-*` spans
(same classes the platform editor uses) for: typescript, javascript, python,
bash, json, yaml, css, html/xml, go, rust, sql, markdown, text.

- `highlight(code, lang)` → HTML string (escaped, `hl-*` spans).
- `detectLanguage(code)` → single best match for blocks with no tag (delegates to
  candidates).
- `detectLanguageCandidates(code)` → ordered list of matched language ids (used
  to filter the picker for inferred blocks).
- `normalizeLanguage(alias)` → canonical id (js→javascript, py→python, …).
- `langLabel(id)` → full human-readable name (e.g. "TypeScript", "Python").
- `SUPPORTED_LANGUAGES`.

### Markdown integration (`markdown.ts`)

Fenced blocks are now exposed as structured segments (not static HTML):

```ts
type MarkdownSegment =
  | { type: "html"; html: string }
  | { type: "code"; code: string; language: string; inferred: boolean; index: number; msgId?: string };
```

- `renderMarkdownSegments(md, options)` → `MarkdownSegment[]` (the UI renders code
  blocks interactively from these).
- `renderMarkdown(md, options)` → static HTML string; code blocks render as a
  plain `<pre><code>…</code></pre>` (non-interactive fallback, e.g. tests).
- `resolveCodeLanguage` honors per-block `codeLanguages` overrides, then explicit
  tags, then content detection.

### UI interaction (`openp41ge-agents.ts`)

Each code block renders as:

```html
<div class="code-block-wrap">
  <div class="code-block-toolbar">
    <button class="code-lang">TypeScript</button>   <!-- opens picker -->
    <button class="code-wrap">…</button>            <!-- line-wrap toggle -->
  </div>
  <div class="code-block [wrap]"><pre><code>…hl-* spans…</code></pre></div>
  <div class="code-lang-menu">…candidate options…</div>  <!-- when open -->
</div>
```

- `_codeLangOverrides` keyed by `${msgId}::${index}`; `_codeLangForMessage` builds
  the per-message override map.
- `_codeWrap` toggles `.wrap` (pre-wrap + word-break).
- `_openLangMenu` drives the picker; `_toggleLangMenu`/`_toggleWrap`/`_pickLang`
  handle clicks. The badge shows full names; the toolbar sits above the block so
  the first code line is not pushed down.
- `_languageCandidates` returns only detector matches for inferred blocks, and
  all supported languages for explicitly-tagged blocks.
- Toolbar, block, wrap, and picker CSS live inside the component's shadow styles.

## Files Changed

- `packages/openp41ge-agents/src/ui/syntax-highlight.ts` — full labels,
  `detectLanguageCandidates`, removed `cycleLanguage`.
- `packages/openp41ge-agents/src/ui/markdown.ts` — `renderMarkdownSegments`,
  `MarkdownSegment` types, static `renderMarkdown` fallback.
- `packages/openp41ge-agents/src/ui/openp41ge-agents.ts` — toolbar + picker +
  wrap toggle + CSS.
- `packages/openp41ge-agents/test/unit/chat/syntax-highlight.test.ts` —
  candidates + full label tests.
- `packages/openp41ge-agents/test/unit/chat/markdown.test.ts` — segment-based
  code-block tests.
- `packages/openp41ge-agents/test/unit/chat/openp41ge-agents.test.ts` — picker
  shows only matches + picking a language, and wrap-toggle test.

## Testing Strategy

- Unit tests for `highlight`, `detectLanguage`, `detectLanguageCandidates`,
  `normalizeLanguage`, `langLabel`, and HTML escaping.
- `renderMarkdownSegments` tests for language/inferred/override/msgId fields.
- Component tests: picker lists only detected matches and applying a selection
  updates the badge; the wrap toggle toggles the `.wrap` class.
- `npx tsc --noEmit`, `npx oxlint`, `npx prettier --check`.

## Completion Criteria

- [x] Fenced code blocks are syntax highlighted and escaped.
- [x] A toolbar above each block shows the full language name and a wrap toggle.
- [x] Clicking the badge opens an inline picker (no cycling).
- [x] Inferred blocks list only matched languages; explicit blocks list all.
- [x] The toolbar does not push the first code line down.
- [x] Unit + component tests pass; `tsc`, `oxlint`, `prettier` green.
