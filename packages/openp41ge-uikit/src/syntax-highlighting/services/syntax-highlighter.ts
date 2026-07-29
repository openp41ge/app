/**
 * SyntaxHighlighter — produces syntax-highlighted HTML from code content.
 *
 * Uses a TextMate ITokenizer to tokenize each line and wraps tokens in
 * <span> elements with CSS classes derived from the token scopes.
 *
 * This is a standalone service that doesn't depend on the file editor's
 * rendering pipeline. The generated HTML can be used anywhere — in the
 * agent chat's markdown renderer, in a demo, or in custom UI.
 */

import type { ITokenizer, StateStack } from "../tokenization";
import type { ISyntaxHighlighter, IGrammar } from "../interfaces";
import { renderTokensToHtml } from "./token-html-renderer";

export interface HighlightResult {
  /** Syntax-highlighted HTML string. */
  html: string;
  /** Number of lines highlighted. */
  lineCount: number;
  /** Time taken in milliseconds. */
  durationMs: number;
}

/**
 * High-level API: highlight a code string with a tokenizer.
 * Tokenizes each line and wraps tokens in styled <span> elements.
 *
 * @param code - The source code to highlight.
 * @param tokenizer - A TextMate ITokenizer (from TokenRegistry.getTokenizer()).
 * @returns HighlightResult with HTML string.
 */
export function highlightCode(code: string, tokenizer: ITokenizer): HighlightResult {
  const start = performance.now();
  const lines = code.split("\n");
  let prevState: StateStack | null = null;
  const htmlParts: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const result = tokenizer.tokenizeLine(line, prevState);
    prevState = result.ruleStack;

    const lineHtml = renderTokensToHtml(line, result.tokens);
    htmlParts.push(lineHtml);
  }

  const html = htmlParts.join("\n");
  const durationMs = performance.now() - start;

  return { html, lineCount: lines.length, durationMs };
}

/**
 * SyntaxHighlighter class implementing ISyntaxHighlighter.
 * Wraps the stateless highlightCode() for compatibility with the
 * ISyntaxHighlighter interface used by the file editor.
 */
export class SyntaxHighlighter implements ISyntaxHighlighter {
  constructor(private _tokenizer: ITokenizer) {}

  highlight(content: string, _grammar: IGrammar | null): string {
    return highlightCode(content, this._tokenizer).html;
  }
}

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
