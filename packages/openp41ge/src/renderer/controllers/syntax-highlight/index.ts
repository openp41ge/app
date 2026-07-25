/**
 * syntax-highlight/index.ts — barrel that re-exports all tokenizers
 * and the registry, then registers built-in languages.
 */

// Note: re-exports of individual tokenizers live in the barrel file
// (syntax-highlight.ts). This file only exports ensureHighlightStyles.
export type { Token, LanguageHandler } from "./registry";

// ──────────────────────────────────────────────
// Syntax highlight stylesheet (injected once)
// ──────────────────────────────────────────────

const STYLE_ID = "openp41ge-syntax-highlight-style";

/**
 * Ensure the syntax highlighting CSS is present in the document
 * `<head>`.  Safe to call multiple times — only injects once.
 */
export function ensureHighlightStyles(): void {
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .hl-key    { color: #7ec6f0; }
    .hl-string { color: #ce9178; }
    .hl-number { color: #b5cea8; }
    .hl-bool   { color: #569cd6; }
    .hl-null   { color: #569cd6; }
    .hl-punct  { color: #808080; }
    .hl-text   { color: #d4d4d4; }
    .hl-comment { color: #6a9955; }
    .hl-escape { color: #d7ba7d; }
    .hl-bracket { color: #ffd700; }
    .hl-method { color: #dcdcaa; }
    .hl-type   { color: #4ec9b0; }
  `;
  document.head.appendChild(style);
}

// Note: language registration happens in the barrel file (syntax-highlight.ts)
// to ensure correct import order.
