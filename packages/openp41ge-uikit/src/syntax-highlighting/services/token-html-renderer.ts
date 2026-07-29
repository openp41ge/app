/**
 * token-html-renderer — renders IToken[] arrays into syntax-highlighted HTML.
 *
 * Maps TextMate scope names to CSS classes (same SCOPE_CLASSES mapping used
 * by the file editor's view-line-renderer) and wraps token segments in
 * <span> elements with appropriate class names.
 *
 * This is a standalone utility that produces HTML suitable for display
 * anywhere — in a demo page, in the agent chat markdown renderer, etc.
 */

import type { IToken } from "../tokenization/line-tokens";
import { escapeHtml } from "./syntax-highlighter";

// ---------------------------------------------------------------------------
// Scope-to-CSS-class mapping
// ---------------------------------------------------------------------------

const SCOPE_CLASSES: Record<string, string> = {
  // ── Keywords ──────────────────────────────────────────────────────
  keyword: "mtk-kw",
  "keyword.control": "mtk-kw",
  "keyword.control.import": "mtk-kw",
  "keyword.control.export": "mtk-kw",
  "keyword.control.flow": "mtk-kw",
  "keyword.control.loop": "mtk-kw",
  "keyword.control.conditional": "mtk-kw",
  "keyword.control.directive": "mtk-kw",
  "keyword.operator": "mtk-op",
  "keyword.operator.assignment": "mtk-op",
  "keyword.operator.comparison": "mtk-op",
  "keyword.operator.logical": "mtk-op",
  "keyword.operator.arithmetic": "mtk-op",
  "keyword.operator.bitwise": "mtk-op",
  "keyword.operator.ternary": "mtk-op",
  "keyword.operator.increment": "mtk-op",
  "keyword.operator.decrement": "mtk-op",
  "keyword.operator.spread": "mtk-op",
  "keyword.operator.rest": "mtk-op",
  "keyword.operator.expression.import": "mtk-kw",
  "keyword.operator.expression.export": "mtk-kw",
  "keyword.operator.new": "mtk-kw",
  "keyword.operator.delete": "mtk-kw",
  "keyword.other": "mtk-kw",

  // ── Storage / Type ────────────────────────────────────────────────
  storage: "mtk-type",
  "storage.type": "mtk-type",
  "storage.modifier": "mtk-kw",

  // ── Constants / Literals ──────────────────────────────────────────
  constant: "mtk-num",
  "constant.numeric": "mtk-num",
  "constant.numeric.integer": "mtk-num",
  "constant.numeric.float": "mtk-num",
  "constant.numeric.hex": "mtk-num",
  "constant.language": "mtk-kw",
  "constant.character": "mtk-str",
  "constant.character.escape": "mtk-str",
  "constant.other": "mtk-num",
  "constant.other.object.key": "mtk-var",

  // ── Variables ─────────────────────────────────────────────────────
  variable: "mtk-var",
  "variable.other": "mtk-var",
  "variable.other.enummember": "mtk-lbl",
  "variable.other.object": "mtk-var",
  "variable.other.property": "mtk-var",
  "variable.language": "mtk-kw",
  "variable.language.this": "mtk-kw",
  "variable.language.super": "mtk-kw",
  "variable.parameter": "mtk-var",

  // ── Entities (names) ──────────────────────────────────────────────
  entity: "mtk-ent",
  "entity.name.section": "mtk-mh",
  "entity.name": "mtk-ent",
  "entity.name.function": "mtk-fun",
  "entity.name.type": "mtk-type",
  "entity.name.type.class": "mtk-type",
  "entity.name.type.interface": "mtk-type",
  "entity.name.type.alias": "mtk-type",
  "entity.name.type.module": "mtk-type",
  "entity.name.type.enum": "mtk-type",
  "entity.name.tag": "mtk-tag",
  "entity.other": "mtk-atr",
  "entity.other.attribute-name": "mtk-atr",

  // ── Support (built-in) ────────────────────────────────────────────
  support: "mtk-sup",
  "support.function": "mtk-fun",
  "support.type": "mtk-type",
  "support.class": "mtk-scl",
  "support.constant": "mtk-num",
  "support.variable": "mtk-var",

  // ── Strings ───────────────────────────────────────────────────────
  string: "mtk-str",
  "string.quoted": "mtk-str",
  "string.quoted.double": "mtk-str",
  "string.quoted.single": "mtk-str",
  "string.quoted.template": "mtk-str",
  "string.template": "mtk-str",
  "string.regexp": "mtk-rgx",
  "string.other": "mtk-str",

  // ── Comments ──────────────────────────────────────────────────────
  comment: "mtk-cmt",
  "comment.line": "mtk-cmt",
  "comment.line.double-slash": "mtk-cmt",
  "comment.block": "mtk-cmt",
  "comment.block.documentation": "mtk-cmt",

  // ── Punctuation ───────────────────────────────────────────────────
  punctuation: "mtk-pun",
  "punctuation.definition": "mtk-pun",
  "punctuation.definition.constant": "mtk-num",
  "punctuation.definition.heading": "mtk-mh",
  "punctuation.definition.block": "mtk-pun",
  "punctuation.definition.parameters": "mtk-pun",
  "punctuation.definition.bracket": "mtk-pun",
  "punctuation.definition.string": "mtk-str",
  "punctuation.definition.string.begin": "mtk-str",
  "punctuation.definition.string.end": "mtk-str",
  "punctuation.definition.template-expression": "mtk-pun",
  "punctuation.definition.tag": "mtk-pun",
  "punctuation.definition.comment": "mtk-cmt",
  "punctuation.definition.dictionary": "mtk-pun",
  "punctuation.definition.array": "mtk-pun",
  "punctuation.separator": "mtk-pun",
  "punctuation.separator.comma": "mtk-pun",
  "punctuation.separator.semicolon": "mtk-pun",
  "punctuation.separator.colon": "mtk-pun",
  "punctuation.separator.period": "mtk-pun",
  "punctuation.accessor": "mtk-pun",
  "punctuation.terminator": "mtk-pun",

  // ── Meta (structural) ────────────────────────────────────────────
  meta: "",
  "meta.tag": "",
  "meta.block": "",
  "meta.function": "",
  "meta.class": "",
  "meta.import": "",
  "meta.export": "",
  "meta.var": "",
  "meta.arguments": "",
  "meta.brace": "",
  "meta.brace.round": "",
  "meta.brace.square": "",
  "meta.brace.curly": "",
  "meta.parameters": "",
  "meta.type.annotation": "",
  "meta.type.declaration": "",
  "meta.arrow": "",
  "meta.method": "",
  "meta.property": "",
  "meta.object": "",
  "meta.embedded": "",
  "meta.structure.array": "",
  "meta.structure.dictionary": "",
  "meta.structure.dictionary.key": "mtk-atr",
  "meta.structure.dictionary.key.json": "mtk-atr",
  "meta.map.key": "mtk-atr",

  // ── Template expressions ──────────────────────────────────────────
  "template.expression": "mtk-te",

  // ── Invalid ───────────────────────────────────────────────────────
  invalid: "mtk-inv",
  "invalid.deprecated": "mtk-inv",
  "invalid.illegal": "mtk-inv",

  // ── Markup (Markdown) ─────────────────────────────────────────────
  markup: "mtk-mup",
  "markup.heading": "mtk-mh",
  "markup.bold": "mtk-mb",
  "markup.italic": "mtk-mi",
  "markup.underline.link": "mtk-ml",
  "markup.raw": "mtk-mup",
  "markup.raw.inline": "mtk-mup",
  "markup.list": "mtk-mup",
  "markup.quote": "mtk-mup",
  "markup.code": "mtk-mup",
  "markup.inline.raw": "mtk-mup",
  "markup.fenced_code": "mtk-mup",
};

// ---------------------------------------------------------------------------
// Render function
// ---------------------------------------------------------------------------

/**
 * Render a line of text with its tokens into an HTML string with
 * <span> elements wrapping each token segment.
 *
 * @param lineContent - The raw text of the line.
 * @param tokens - Token array for the line, or null.
 * @returns HTML string with syntax-highlighted spans.
 */
export function renderTokensToHtml(lineContent: string, tokens: IToken[] | null): string {
  if (!tokens || tokens.length === 0) {
    return escapeHtml(lineContent);
  }

  const parts: string[] = [];
  let pos = 0;

  for (const token of tokens) {
    if (token.startIndex > pos) {
      // Non-tokenized gap before this token
      parts.push(escapeHtml(lineContent.slice(pos, token.startIndex)));
    }

    const segmentText = lineContent.slice(token.startIndex, token.endIndex);
    if (segmentText.length === 0) continue;

    const cssClass = scopeToCssClass(token.scope);
    if (cssClass) {
      parts.push(`<span class="${cssClass}">${escapeHtml(segmentText)}</span>`);
    } else {
      parts.push(escapeHtml(segmentText));
    }

    pos = token.endIndex;
  }

  // Trailing text after the last token
  if (pos < lineContent.length) {
    parts.push(escapeHtml(lineContent.slice(pos)));
  }

  return parts.join("");
}

// ---------------------------------------------------------------------------
// Scope → CSS class resolution
// ---------------------------------------------------------------------------

/**
 * Resolve a TextMate scope string to a CSS class name.
 * Uses dot-by-dot fallback to find the most specific match.
 */
function scopeToCssClass(scope: string): string {
  if (!scope) return "";

  let prefix = scope;
  while (prefix.length > 0) {
    const cls = SCOPE_CLASSES[prefix];
    if (cls !== undefined) {
      return cls;
    }
    const lastDot = prefix.lastIndexOf(".");
    if (lastDot < 0) break;
    prefix = prefix.substring(0, lastDot);
  }

  return "";
}
