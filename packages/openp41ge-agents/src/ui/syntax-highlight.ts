/**
 * Lightweight, dependency-free syntax highlighter for chat code blocks.
 *
 * Renders code as HTML with `hl-*` span classes (same classes the platform's
 * editor uses). It is a best-effort, line-based tokenizer — good enough for the
 * short snippets an agent emits — covering the most common languages, with a
 * content-based language detector for fenced blocks that omit a language tag.
 *
 * All text is HTML-escaped; only a fixed set of spans is emitted.
 */

export type TokenType =
  | "key"
  | "string"
  | "number"
  | "boolean"
  | "null"
  | "punctuation"
  | "text"
  | "comment"
  | "escape"
  | "bracket"
  | "method"
  | "type";

export interface Token {
  type: TokenType;
  value: string;
}

const CSS_CLASS: Record<TokenType, string> = {
  key: "hl-key",
  string: "hl-string",
  number: "hl-number",
  boolean: "hl-bool",
  null: "hl-null",
  punctuation: "hl-punct",
  text: "hl-text",
  comment: "hl-comment",
  escape: "hl-escape",
  bracket: "hl-bracket",
  method: "hl-method",
  type: "hl-type",
};

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function formatTokens(tokens: Token[], line: string): string {
  if (tokens.length === 0) return escapeHtml(line);
  return tokens
    .map((t) => `<span class="${CSS_CLASS[t.type]}">${escapeHtml(t.value)}</span>`)
    .join("");
}

// ──────────────────────────────────────────────
// Language configs
// ──────────────────────────────────────────────

interface LangConfig {
  id: string;
  label: string;
  keywords?: Set<string>;
  types?: Set<string>;
  booleans?: Set<string>;
  nulls?: Set<string>;
  lineComments?: string[];
  blockComment?: [string, string];
  stringQuotes?: string[];
  /** Treat an identifier immediately followed by `:` as a key (CSS/yaml/json). */
  keyBeforeColon?: boolean;
}

const JS_KEYWORDS = new Set([
  "async",
  "await",
  "break",
  "case",
  "catch",
  "class",
  "const",
  "continue",
  "debugger",
  "default",
  "delete",
  "do",
  "else",
  "export",
  "extends",
  "finally",
  "for",
  "function",
  "if",
  "import",
  "in",
  "instanceof",
  "let",
  "new",
  "of",
  "return",
  "static",
  "super",
  "switch",
  "this",
  "throw",
  "try",
  "typeof",
  "var",
  "void",
  "while",
  "with",
  "yield",
  "type",
  "interface",
  "enum",
  "implements",
  "abstract",
  "private",
  "protected",
  "public",
  "readonly",
  "as",
  "from",
  "declare",
  "namespace",
  "module",
]);

const JS_TYPES = new Set([
  "any",
  "never",
  "unknown",
  "string",
  "number",
  "boolean",
  "symbol",
  "void",
  "undefined",
  "null",
  "object",
  "bigint",
]);

const PY_KEYWORDS = new Set([
  "and",
  "as",
  "assert",
  "async",
  "await",
  "break",
  "class",
  "continue",
  "def",
  "del",
  "elif",
  "else",
  "except",
  "False",
  "finally",
  "for",
  "from",
  "global",
  "if",
  "import",
  "in",
  "is",
  "lambda",
  "None",
  "nonlocal",
  "not",
  "or",
  "pass",
  "raise",
  "return",
  "True",
  "try",
  "while",
  "with",
  "yield",
]);

const GO_KEYWORDS = new Set([
  "break",
  "case",
  "chan",
  "const",
  "continue",
  "default",
  "defer",
  "else",
  "fallthrough",
  "for",
  "func",
  "go",
  "goto",
  "if",
  "import",
  "interface",
  "map",
  "package",
  "range",
  "return",
  "select",
  "struct",
  "switch",
  "type",
  "var",
  "make",
  "new",
  "len",
  "cap",
  "append",
  "copy",
  "delete",
  "nil",
]);

const RUST_KEYWORDS = new Set([
  "as",
  "async",
  "await",
  "break",
  "const",
  "continue",
  "crate",
  "dyn",
  "else",
  "enum",
  "extern",
  "false",
  "fn",
  "for",
  "if",
  "impl",
  "in",
  "let",
  "loop",
  "match",
  "mod",
  "move",
  "mut",
  "pub",
  "ref",
  "return",
  "self",
  "Self",
  "static",
  "struct",
  "super",
  "trait",
  "true",
  "type",
  "unsafe",
  "use",
  "where",
  "while",
]);

const SQL_KEYWORDS = new Set([
  "select",
  "from",
  "where",
  "insert",
  "into",
  "values",
  "update",
  "set",
  "delete",
  "create",
  "table",
  "drop",
  "alter",
  "join",
  "left",
  "right",
  "inner",
  "outer",
  "on",
  "group",
  "by",
  "order",
  "having",
  "limit",
  "offset",
  "and",
  "or",
  "not",
  "null",
  "as",
  "distinct",
  "count",
  "sum",
  "avg",
  "min",
  "max",
  "like",
  "between",
  "in",
  "exists",
  "case",
  "when",
  "then",
  "else",
  "end",
  "union",
  "all",
  "primary",
  "key",
  "foreign",
  "references",
  "index",
]);

const LANG_CONFIGS: Record<string, LangConfig> = {
  javascript: {
    id: "javascript",
    label: "JS",
    keywords: JS_KEYWORDS,
    types: JS_TYPES,
    booleans: new Set(["true", "false"]),
    nulls: new Set(["null", "undefined"]),
    lineComments: ["//"],
    blockComment: ["/*", "*/"],
    stringQuotes: ["'", '"', "`"],
  },
  typescript: {
    id: "typescript",
    label: "TS",
    keywords: JS_KEYWORDS,
    types: JS_TYPES,
    booleans: new Set(["true", "false"]),
    nulls: new Set(["null", "undefined"]),
    lineComments: ["//"],
    blockComment: ["/*", "*/"],
    stringQuotes: ["'", '"', "`"],
  },
  json: {
    id: "json",
    label: "JSON",
    booleans: new Set(["true", "false"]),
    nulls: new Set(["null"]),
    stringQuotes: ['"'],
    keyBeforeColon: true,
  },
  python: {
    id: "python",
    label: "PY",
    keywords: PY_KEYWORDS,
    booleans: new Set(["True", "False"]),
    nulls: new Set(["None"]),
    lineComments: ["#"],
    stringQuotes: ["'", '"', "```"],
  },
  go: {
    id: "go",
    label: "Go",
    keywords: GO_KEYWORDS,
    booleans: new Set(["true", "false"]),
    nulls: new Set(["nil"]),
    lineComments: ["//"],
    blockComment: ["/*", "*/"],
    stringQuotes: ['"', "`"],
  },
  rust: {
    id: "rust",
    label: "RS",
    keywords: RUST_KEYWORDS,
    booleans: new Set(["true", "false"]),
    lineComments: ["//"],
    blockComment: ["/*", "*/"],
    stringQuotes: ['"'],
  },
  sql: {
    id: "sql",
    label: "SQL",
    keywords: SQL_KEYWORDS,
    nulls: new Set(["null"]),
    lineComments: ["--"],
    blockComment: ["/*", "*/"],
    stringQuotes: ["'"],
  },
  bash: {
    id: "bash",
    label: "sh",
    keywords: new Set([
      "if",
      "then",
      "else",
      "elif",
      "fi",
      "for",
      "while",
      "do",
      "done",
      "case",
      "esac",
      "function",
      "in",
      "echo",
      "exit",
      "return",
      "local",
      "export",
      "source",
      "echo",
      "cd",
      "ls",
      "mkdir",
      "rm",
      "cp",
      "mv",
    ]),
    lineComments: ["#"],
    stringQuotes: ["'", '"'],
  },
  yaml: {
    id: "yaml",
    label: "YAML",
    keywords: new Set(["true", "false", "null", "yes", "no", "on", "off"]),
    booleans: new Set(["true", "false", "yes", "no", "on", "off"]),
    nulls: new Set(["null", "~"]),
    lineComments: ["#"],
    stringQuotes: ["'", '"'],
    keyBeforeColon: true,
  },
  css: {
    id: "css",
    label: "CSS",
    booleans: new Set(["inherit", "initial", "unset", "auto", "none", "block"]),
    nulls: new Set(["none", "transparent"]),
    lineComments: [],
    blockComment: ["/*", "*/"],
    stringQuotes: ["'", '"'],
    keyBeforeColon: true,
  },
  markdown: {
    id: "markdown",
    label: "MD",
    lineComments: [],
    stringQuotes: [],
  },
  text: {
    id: "text",
    label: "text",
    lineComments: [],
    stringQuotes: [],
  },
};

/** Languages that need HTML/XML-specific tokenization. */
const HTML_LANGS = new Set(["html", "xml", "svg", "vue"]);

// ──────────────────────────────────────────────
// Generic line tokenizer
// ──────────────────────────────────────────────

function isWordChar(c: string): boolean {
  return /[A-Za-z0-9_-]/.test(c);
}

function tokenizeLine(line: string, cfg: LangConfig): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < line.length) {
    const ch = line[i];

    if (ch === " " || ch === "\t") {
      let ws = "";
      while (i < line.length && (line[i] === " " || line[i] === "\t")) {
        ws += line[i];
        i++;
      }
      tokens.push({ type: "text", value: ws });
      continue;
    }

    const lineComment = cfg.lineComments?.find((c) => line.startsWith(c, i));
    if (lineComment) {
      tokens.push({ type: "comment", value: line.slice(i) });
      break;
    }

    if (cfg.blockComment && line.startsWith(cfg.blockComment[0], i)) {
      let c = cfg.blockComment[0];
      i += cfg.blockComment[0].length;
      while (i < line.length && !line.startsWith(cfg.blockComment[1], i)) {
        c += line[i];
        i++;
      }
      if (line.startsWith(cfg.blockComment[1], i)) {
        c += cfg.blockComment[1];
        i += cfg.blockComment[1].length;
      }
      tokens.push({ type: "comment", value: c });
      continue;
    }

    if (cfg.stringQuotes?.includes(ch)) {
      const quote = ch;
      let s = quote;
      i++;
      while (i < line.length) {
        if (line[i] === "\\") {
          s += line[i] + (line[i + 1] ?? "");
          i += 2;
          continue;
        }
        if (line[i] === quote) {
          s += quote;
          i++;
          break;
        }
        s += line[i];
        i++;
      }
      tokens.push({ type: "string", value: s });
      continue;
    }

    if (/[0-9]/.test(ch) && !/[A-Za-z0-9_-]/.test(line[i - 1] ?? "")) {
      let num = "";
      while (i < line.length && /[0-9A-Za-z._]/.test(line[i])) {
        num += line[i];
        i++;
      }
      tokens.push({ type: "number", value: num });
      continue;
    }

    if (isWordChar(ch)) {
      let w = "";
      while (i < line.length && isWordChar(line[i])) {
        w += line[i];
        i++;
      }
      let skip = i;
      while (skip < line.length && (line[skip] === " " || line[skip] === "\t")) skip++;
      const isKey = cfg.keyBeforeColon === true && line[skip] === ":";
      if (isKey) {
        tokens.push({ type: "key", value: w });
        continue;
      }
      if (cfg.booleans?.has(w)) {
        tokens.push({ type: "boolean", value: w });
        continue;
      }
      if (cfg.nulls?.has(w)) {
        tokens.push({ type: "null", value: w });
        continue;
      }
      if (cfg.keywords?.has(w)) {
        tokens.push({ type: "key", value: w });
        continue;
      }
      if (cfg.types?.has(w)) {
        tokens.push({ type: "type", value: w });
        continue;
      }
      tokens.push({ type: "text", value: w });
      continue;
    }

    const t: TokenType =
      ch === "(" || ch === ")" || ch === "[" || ch === "]" || ch === "{" || ch === "}"
        ? "bracket"
        : "punctuation";
    tokens.push({ type: t, value: ch });
    i++;
  }

  for (let j = 1; j < tokens.length; j++) {
    if (tokens[j].type === "bracket" && tokens[j].value === "(" && tokens[j - 1].type === "text") {
      tokens[j - 1] = { type: "method", value: tokens[j - 1].value };
    }
  }

  return tokens;
}

// ──────────────────────────────────────────────
// HTML / XML tokenizer
// ──────────────────────────────────────────────

function tokenizeHtmlLine(line: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < line.length) {
    const ch = line[i];

    if (ch === "<") {
      tokens.push({ type: "bracket", value: "<" });
      i++;
      continue;
    }
    if (ch === ">") {
      tokens.push({ type: "bracket", value: ">" });
      i++;
      continue;
    }
    if (ch === "/" && line[i + 1] === ">") {
      tokens.push({ type: "punctuation", value: "/>" });
      i += 2;
      continue;
    }
    if (ch === '"' || ch === "'") {
      const quote = ch;
      let s = quote;
      i++;
      while (i < line.length && line[i] !== quote) {
        s += line[i];
        i++;
      }
      if (i < line.length) {
        s += quote;
        i++;
      }
      tokens.push({ type: "string", value: s });
      continue;
    }
    if (isWordChar(ch)) {
      let w = "";
      while (i < line.length && isWordChar(line[i])) {
        w += line[i];
        i++;
      }
      // A word immediately after `<` is a tag name; otherwise it's an attribute.
      const prev = tokens[tokens.length - 1];
      const prevValue = (prev?.type === "text" ? prev.value : prev?.value) ?? "";
      const isTag = prev?.type === "bracket" && prev.value === "<";
      tokens.push({ type: isTag ? "key" : "type", value: w });
      void prevValue;
      continue;
    }
    tokens.push({ type: "text", value: ch });
    i++;
  }

  return tokens;
}

// ──────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────

export interface SupportedLanguage {
  id: string;
  label: string;
}

export const SUPPORTED_LANGUAGES: SupportedLanguage[] = [
  { id: "typescript", label: "TS" },
  { id: "javascript", label: "JS" },
  { id: "python", label: "PY" },
  { id: "bash", label: "sh" },
  { id: "json", label: "JSON" },
  { id: "yaml", label: "YAML" },
  { id: "css", label: "CSS" },
  { id: "html", label: "HTML" },
  { id: "go", label: "Go" },
  { id: "rust", label: "RS" },
  { id: "sql", label: "SQL" },
  { id: "markdown", label: "MD" },
  { id: "text", label: "text" },
];

const ALIASES: Record<string, string> = {
  ts: "typescript",
  js: "javascript",
  jsx: "javascript",
  node: "javascript",
  py: "python",
  sh: "bash",
  shell: "bash",
  zsh: "bash",
  bash: "bash",
  yml: "yaml",
  yaml: "yaml",
  xml: "html",
  html: "html",
  svg: "html",
  vue: "html",
  scss: "css",
  less: "css",
  css: "css",
  md: "markdown",
  markdown: "markdown",
  json: "json",
  jsonc: "json",
  golang: "go",
  go: "go",
  rs: "rust",
  rust: "rust",
  sql: "sql",
  psql: "sql",
  text: "text",
  txt: "text",
  plaintext: "text",
};

/** Normalise a user-supplied language tag to a canonical id, or null. */
export function normalizeLanguage(lang: string): string | null {
  const key = lang.trim().toLowerCase();
  if (!key) return null;
  return ALIASES[key] ?? null;
}

/** Human-friendly label for a language id. */
export function langLabel(id: string): string {
  return SUPPORTED_LANGUAGES.find((l) => l.id === id)?.label ?? id;
}

function getLangConfig(id: string): LangConfig {
  return LANG_CONFIGS[id] ?? LANG_CONFIGS.text;
}

/** Highlight code as an HTML string of `hl-*` spans (lines joined by `\n`). */
export function highlight(code: string, langId: string): string {
  const id = ALIASES[langId.toLowerCase()] ?? langId.toLowerCase();
  if (HTML_LANGS.has(id)) {
    return code
      .split("\n")
      .map((line) => formatTokens(tokenizeHtmlLine(line), line))
      .join("\n");
  }
  const cfg = getLangConfig(id);
  return code
    .split("\n")
    .map((line) => formatTokens(tokenizeLine(line, cfg), line))
    .join("\n");
}

/** Best-effort detect the language of a code snippet from its content. */
export function detectLanguage(code: string): string {
  const trimmed = code.trim();
  if (!trimmed) return "text";
  const head = trimmed.slice(0, 2000);

  if (
    /^\s*<!doctype\s+html/i.test(head) ||
    (/<[a-z][\s\S]*>/i.test(head) && /<\/?[a-z]/.test(head))
  ) {
    return "html";
  }
  if (/^\s*\{[\s\n]*"[^"]+"\s*:/m.test(head)) return "json";
  if (
    /^\s*[-]?\s*\w+\s*:\s/m.test(head) &&
    !/\b(function|const|let|var|import|export|def|class)\b/.test(head)
  ) {
    return "yaml";
  }
  if (/^\s*(#!\/bin\/|.*\$\s*|export\s+\w+=|cd\s+\S+)/m.test(head)) return "bash";
  if (/\b(select\s+[\s\S]+from|insert\s+into|update\s+\S+\s+set)\b/i.test(head)) return "sql";
  if (/\b(fn\s+\w+\s*\(|use\s+std::|^\s*pub\s+fn\b)/m.test(head)) return "rust";
  if (/\b(package\s+main|func\s+\w+\s*\(|go\s+func)\b/m.test(head)) return "go";
  if (
    /\b(def\s+\w+\s*\(|^\s*import\s+\w+\s*$|^\s*from\s+\S+\s+import\b|:\s*$)/m.test(head) &&
    /\b(start|if|elif|else|for|while|def)\b/.test(head)
  )
    return "python";
  if (/\b(import\s+|export\s+|const\s+|let\s+|function\s+|=>\s*\{)/.test(head)) {
    if (/\b(interface|type\s+\w+\s*[={]|:\s*(string|number|boolean)\b)/.test(head))
      return "typescript";
    return "javascript";
  }
  if (/\b(@media|^\s*[.#\w][^{}]*\{\s*$|^\s*[a-z-]+\s*:\s*[^;]+;\s*$)/m.test(head)) return "css";
  if (/^\s*\[[a-z0-9_]+\s*:\s*[^\]]+\]|\b(bind|script)\b/.test(head)) return "bash";
  return "text";
  return "text";
}

/** Cycle to the next supported language for the badge. */
export function cycleLanguage(current: string): string {
  const ids = SUPPORTED_LANGUAGES.map((l) => l.id);
  const idx = ids.indexOf(current);
  return ids[(idx + 1) % ids.length] ?? "text";
}
