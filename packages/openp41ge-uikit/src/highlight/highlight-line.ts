/**
 * highlightLine — lightweight synchronous syntax highlighting for a single
 * line of code, used by the Explorer's content-search match rows.
 *
 * It is intentionally NOT the full TextMate tokenizer (which is async and
 * depends on grammar loading). Instead it scans the line left-to-right and
 * wraps common constructs (comments, strings, keywords, numbers, function
 * calls, types) in the editor's `.s-*` scope class names, so the colours
 * match the file editor. It also wraps the matched search term in
 * `.cm-match-term` (respecting the regex / case-sensitivity flags).
 *
 * Pure module — no DOM, no platform dependencies.
 */

import { BUILTIN_LANGUAGES } from "openp41ge-syntax-highlighting/token-registry";

/** Extension (lowercase, no dot) → language id, plus a couple of specials. */
const EXT_TO_LANG: Map<string, string> = (() => {
  const m = new Map<string, string>();
  for (const def of BUILTIN_LANGUAGES) {
    for (const ext of def.extensions) m.set(ext.toLowerCase(), def.id);
  }
  return m;
})();

/** Map a file path to a language id (based on its extension). */
export function languageFromPath(path: string): string | undefined {
  const base = (path.split("/").pop() ?? path).toLowerCase();
  if (base === "dockerfile") return "dockerfile";
  const dot = base.lastIndexOf(".");
  if (dot < 0) return undefined;
  return EXT_TO_LANG.get(base.slice(dot + 1));
}

/** Token class → scope class name (matches the editor's `.s-*` classes). */
const SCOPE_CLASS: Record<string, string> = {
  keyword: "s-kw",
  string: "s-str",
  comment: "s-cmt",
  number: "s-num",
  function: "s-fun",
  type: "s-type",
  operator: "s-op",
  tag: "s-tag",
  attr: "s-atr",
  "string.regex": "s-rgx",
};

/** Typical keyword sets — merged and matched case-insensitively. */
const LANGUAGE_KEYWORDS: Record<string, string[]> = {
  javascript: [
    "function",
    "const",
    "let",
    "var",
    "if",
    "else",
    "for",
    "while",
    "do",
    "return",
    "class",
    "extends",
    "new",
    "import",
    "export",
    "from",
    "try",
    "catch",
    "finally",
    "throw",
    "switch",
    "case",
    "break",
    "continue",
    "async",
    "await",
    "typeof",
    "instanceof",
    "in",
    "of",
    "this",
    "super",
    "null",
    "undefined",
    "true",
    "false",
    "void",
    "delete",
    "yield",
    "static",
  ],
  typescript: [
    "function",
    "const",
    "let",
    "var",
    "if",
    "else",
    "for",
    "while",
    "do",
    "return",
    "class",
    "extends",
    "new",
    "import",
    "export",
    "from",
    "try",
    "catch",
    "finally",
    "throw",
    "switch",
    "case",
    "break",
    "continue",
    "async",
    "await",
    "typeof",
    "instanceof",
    "in",
    "of",
    "this",
    "super",
    "null",
    "undefined",
    "true",
    "false",
    "void",
    "delete",
    "yield",
    "static",
    "interface",
    "type",
    "enum",
    "implements",
    "readonly",
    "public",
    "private",
    "protected",
    "as",
    "declare",
    "abstract",
    "namespace",
    "module",
    "keyof",
  ],
  python: [
    "def",
    "class",
    "import",
    "from",
    "as",
    "if",
    "elif",
    "else",
    "for",
    "while",
    "return",
    "try",
    "except",
    "finally",
    "with",
    "raise",
    "pass",
    "lambda",
    "yield",
    "global",
    "nonlocal",
    "del",
    "assert",
    "break",
    "continue",
    "in",
    "is",
    "not",
    "and",
    "or",
    "None",
    "True",
    "False",
    "async",
    "await",
    "match",
    "case",
    "self",
  ],
};

/** A single highlighted segment. */
interface Segment {
  text: string;
  cls: string;
}

function keywordSet(language?: string): Set<string> {
  const list = (language && LANGUAGE_KEYWORDS[language]) || LANGUAGE_KEYWORDS.javascript;
  return new Set((list ?? []).map((k) => k.toLowerCase()));
}

function isIdentChar(ch: string): boolean {
  return /[A-Za-z0-9_$]/.test(ch);
}

/**
 * Scan a line into segments (text + scope class). No term-highlighting here —
 * that's applied by `renderHighlighted` so it can overlay query matches.
 */
function scanLine(text: string, language?: string): Segment[] {
  const segs: Segment[] = [];
  const kw = keywordSet(language);
  let i = 0;
  const n = text.length;
  let buffer = "";
  let bufferCls = "";
  const flush = () => {
    if (buffer) segs.push({ text: buffer, cls: bufferCls });
    buffer = "";
    bufferCls = "";
  };

  while (i < n) {
    const ch = text[i];
    const next = text[i + 1];

    // Line comment
    if (
      (ch === "/" && next === "/") ||
      (ch === "#" && (language === "python" || language === "shell")) ||
      (ch === "-" && next === "-" && language === "sql")
    ) {
      flush();
      segs.push({ text: text.slice(i), cls: SCOPE_CLASS.comment });
      return segs;
    }

    // Block comment
    if (ch === "/" && next === "*") {
      flush();
      const end = text.indexOf("*/", i + 2);
      const stop = end === -1 ? n : end + 2;
      segs.push({ text: text.slice(i, stop), cls: SCOPE_CLASS.comment });
      i = stop;
      continue;
    }
    if (ch === "<" && next === "!" && text[i + 2] === "-" && text[i + 3] === "-") {
      flush();
      const end = text.indexOf("-->", i + 4);
      const stop = end === -1 ? n : end + 3;
      segs.push({ text: text.slice(i, stop), cls: SCOPE_CLASS.comment });
      i = stop;
      continue;
    }

    // String
    if (ch === '"' || ch === "'" || ch === "`") {
      flush();
      const quote = ch;
      let j = i + 1;
      while (j < n && text[j] !== quote) {
        if (text[j] === "\\") j += 2;
        else j += 1;
      }
      const stop = j < n ? j + 1 : j;
      segs.push({ text: text.slice(i, stop), cls: SCOPE_CLASS.string });
      i = stop;
      continue;
    }

    // Number
    if (/[0-9]/.test(ch) && !isIdentChar(text[i - 1] ?? "")) {
      flush();
      let j = i;
      while (j < n && /[0-9a-fA-FxXoObB_.]/.test(text[j])) j++;
      segs.push({ text: text.slice(i, j), cls: SCOPE_CLASS.number });
      i = j;
      continue;
    }

    // Identifier / keyword / function / type
    if (isIdentChar(ch)) {
      flush();
      let j = i;
      while (j < n && isIdentChar(text[j])) j++;
      const word = text.slice(i, j);
      const lower = word.toLowerCase();
      if (kw.has(lower)) {
        segs.push({ text: word, cls: SCOPE_CLASS.keyword });
      } else if (text[j] === "(") {
        segs.push({ text: word, cls: SCOPE_CLASS.function });
      } else if (/^[A-Z]/.test(word)) {
        segs.push({ text: word, cls: SCOPE_CLASS.type });
      } else {
        segs.push({ text: word, cls: "" });
      }
      i = j;
      continue;
    }

    // Operator-ish punctuation
    if ("+-*/%=&|^~!<>?:".includes(ch)) {
      if (bufferCls !== SCOPE_CLASS.operator) {
        flush();
        bufferCls = SCOPE_CLASS.operator;
      }
      buffer += ch;
      i++;
      continue;
    }

    // Plain char
    if (bufferCls !== "") flush();
    buffer += ch;
    i++;
  }
  flush();
  return segs;
}

export interface HighlightLineOptions {
  language?: string;
  /** The search term to highlight (empty = none). */
  query?: string;
  regex?: boolean;
  caseSensitive?: boolean;
}

/** Find all occurrences of a query in the raw text (start/end char offsets). */
function matchRanges(
  text: string,
  query: string,
  regex: boolean,
  caseSensitive: boolean,
): Array<[number, number]> {
  if (!query) return [];
  const ranges: Array<[number, number]> = [];
  try {
    let re: RegExp;
    if (regex) {
      re = new RegExp(query, caseSensitive ? "g" : "gi");
    } else {
      re = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), caseSensitive ? "g" : "gi");
    }
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      // Guard against zero-width matches to avoid an infinite loop.
      if (m.index === re.lastIndex) re.lastIndex++;
      if (m[0].length > 0) ranges.push([m.index, m.index + m[0].length]);
    }
  } catch {
    // Invalid regex — ignore highlighting rather than breaking the row.
  }
  return ranges;
}

/** Escape HTML so user content can't inject markup. */
function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      case "'":
        return "&#39;";
      default:
        return c;
    }
  });
}

/**
 * Highlight a single line into an HTML string, wrapping the matched search
 * term in `.cm-match-term` and syntax tokens in `.s-*` spans.
 */
export function highlightLine(text: string, opts: HighlightLineOptions = {}): string {
  const segments = scanLine(text, opts.language);
  const ranges = matchRanges(
    text,
    opts.query ?? "",
    opts.regex ?? false,
    opts.caseSensitive ?? false,
  );
  return renderWithOffsets(segments, ranges);
}

/**
 * Render segments with correct absolute offsets so query-match overlays land
 * on the right characters.
 */
function renderWithOffsets(segments: Segment[], ranges: Array<[number, number]>): string {
  if (!ranges.length) {
    let out = "";
    for (const seg of segments) {
      out += seg.cls
        ? `<span class="${seg.cls}">${escapeHtml(seg.text)}</span>`
        : escapeHtml(seg.text);
    }
    return out;
  }
  let out = "";
  let offset = 0;
  for (const seg of segments) {
    const start = offset;
    const end = offset + seg.text.length;
    offset = end;
    // Chunk the segment into matched / unmatched pieces.
    const overlaps = ranges.filter(([rs, re]) => rs < end && re > start);
    if (overlaps.length === 0) {
      out += seg.cls
        ? `<span class="${seg.cls}">${escapeHtml(seg.text)}</span>`
        : escapeHtml(seg.text);
      continue;
    }
    // Build pieces.
    let pos = start;
    for (const [rs, re] of overlaps) {
      const s = Math.max(rs, start);
      const e = Math.min(re, end);
      if (s > pos) {
        const gap = seg.text.slice(pos - start, s - start);
        out += seg.cls ? `<span class="${seg.cls}">${escapeHtml(gap)}</span>` : escapeHtml(gap);
      }
      const matched = seg.text.slice(s - start, e - start);
      out += `<span class="cm-match-term${seg.cls ? ` ${seg.cls}` : ""}">${escapeHtml(matched)}</span>`;
      pos = e;
    }
    if (pos < end) {
      const tail = seg.text.slice(pos - start);
      out += seg.cls ? `<span class="${seg.cls}">${escapeHtml(tail)}</span>` : escapeHtml(tail);
    }
  }
  return out;
}
