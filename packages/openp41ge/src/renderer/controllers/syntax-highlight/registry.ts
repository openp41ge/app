/**
 * Registry — token types, LanguageHandler interface, CSS class mapping,
 * formatter helper, and extension-based handler lookup.
 */

import { escapeHtml } from "../virtual-scroll";

// ──────────────────────────────────────────────
// Token types shared across all languages
// ──────────────────────────────────────────────

export type Token =
  | { type: "key"; value: string }
  | { type: "string"; value: string }
  | { type: "number"; value: string }
  | { type: "boolean"; value: string }
  | { type: "null"; value: string }
  | { type: "punctuation"; value: string }
  | { type: "text"; value: string }
  | { type: "comment"; value: string }
  | { type: "escape"; value: string }
  | { type: "bracket"; value: string }
  | { type: "method"; value: string }
  | { type: "type"; value: string };

// ──────────────────────────────────────────────
// LanguageHandler interface
// ──────────────────────────────────────────────

export interface LanguageHandler {
  name: string;
  formatLine(line: string): string;
}

// ──────────────────────────────────────────────
// CSS class mapping
// ──────────────────────────────────────────────

const CSS_CLASS: Record<Token["type"], string> = {
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

// ──────────────────────────────────────────────
// Formatter helper
// ──────────────────────────────────────────────

export function formatTokens(tokens: Token[], line: string): string {
  if (tokens.length === 0) return escapeHtml(line);
  return tokens
    .map((t) => `<span class="${CSS_CLASS[t.type]}">${escapeHtml(t.value)}</span>`)
    .join("");
}

// ──────────────────────────────────────────────
// Registry
// ──────────────────────────────────────────────

type LineFormatter = (line: string) => string;

const EXTENSION_REGISTRY = new Map<string, LineFormatter>();

export function registerLanguage(extensions: string[], handler: LanguageHandler): void {
  for (const ext of extensions) {
    EXTENSION_REGISTRY.set(ext, handler.formatLine.bind(handler));
  }
}

export function getHandler(filePath: string): LineFormatter | null {
  const dot = filePath.lastIndexOf(".");
  if (dot === -1) return null;
  const ext = filePath.slice(dot).toLowerCase();
  return EXTENSION_REGISTRY.get(ext) ?? null;
}
