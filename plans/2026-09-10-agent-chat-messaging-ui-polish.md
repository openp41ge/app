2026-09-10

# Agent chat messaging UI polish

## Goal

Improve the agent chat transcript presentation:
1. Assistant responses render as **inline markdown text** (no chat bubble).
2. User messages render as **grey bubbles** that hug their content.

## Rationale

Today both user and assistant messages are rendered as the same grey/blue
`chat-message` bubble (blue accent for user, grey box for assistant). The user
wants assistant responses to read as flowing prose (markdown was believed to
already be rendered; it was not), and user messages to be compact grey bubbles
with a distinct corner treatment.

## Findings

There is no markdown renderer for chat. The repo only has an editor
syntax-highlight markdown *tokenizer*
(`openp41ge/renderer/controllers/syntax-highlight/tokenizers/markdown.ts`) and an
editor markdown formatter — neither produces HTML for display. `openp41ge-agents`
depends only on `lit` (no `marked`/`markdown-it`/`remark`). So a small,
self-contained renderer was added rather than pulling in a dependency.

## Approach

### Markdown renderer

Add `packages/openp41ge-agents/src/ui/markdown.ts` exposing `renderMarkdown(md)`
that returns an HTML string. It covers the constructs an agent emits: headings,
fenced + inline code, paragraphs, unordered/ordered lists, blockquotes,
horizontal rules, bold/italic/strikethrough, links and images.

- All text is HTML-escaped and only a fixed tag set is emitted — the LLM's output
  cannot inject arbitrary HTML.
- Code spans / links / images are carved out as placeholders *before* escaping so
  emphasis markers inside them are not mangled and URLs are not double-escaped.
- Rendered via `unsafeHTML` from `lit/directives/unsafe-html.js` in the assistant
  `msg-content`.

### Message styling

- `.chat-message.user`: grey bubble (`var(--bg-active, #37373d)`), radius
  `12px 12px 4px 12px` (3 medium corners + smaller bottom-right), padding
  `4px 12px` (reduced vertical spacing), `width: fit-content`, `max-width: 90%`.
- `.chat-message.assistant`: no bubble — `align-self: stretch`,
  transparent background, no border/padding, `white-space: normal`, plus rules to
  style the markdown elements (`p`, headings, lists, blockquote, `code`, `pre`,
  `a`, `img`, `hr`).

## Files Changed

- `packages/openp41ge-agents/src/ui/markdown.ts` (new) — `renderMarkdown`.
- `packages/openp41ge-agents/src/ui/openp41ge-agents.ts` — import
  `unsafeHTML` + `renderMarkdown`; render assistant content as markdown; update
  message CSS.
- `packages/openp41ge-agents/test/unit/chat/markdown.test.ts` (new) — unit tests
  for `renderMarkdown`.
- `packages/openp41ge-agents/test/unit/chat/openp41ge-agents.test.ts` — replace
  skipped message-DOM tests with active tests asserting the user bubble and the
  markdown-rendered assistant content.

## Testing Strategy

- Unit tests for `renderMarkdown` cover paragraphs, headings, emphasis, inline +
  fenced code, lists, blockquote, hr, links/images, and HTML escaping.
- Component tests assert a user message renders a `.chat-message.user` bubble and
  an assistant message renders inline markdown (`.msg-content strong`).
- `npx tsc --noEmit`, `npx oxlint`, and `npx prettier --check` on changed files.

## UX Considerations

- User bubble is content-hugging (`fit-content`) and capped at 90% width, so long
  text still wraps.
- Old blue accent bubble replaced with a neutral grey per the request; text is
  `--text-primary` for contrast.

## Open Questions

- None; the only judgement call (what counts as "inline text" vs a bubble) is
  answered by the request itself.

## Completion Criteria

- [x] `renderMarkdown` renders the common markdown constructs and escapes HTML.
- [x] Assistant responses render as inline markdown text (no bubble).
- [x] User messages are grey, content-hugging bubbles with the requested corners.
- [x] Unit + component tests pass; `tsc`, `oxlint`, `prettier` are green.
