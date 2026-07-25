/**
 * openp41ge-syntax-highlighting — TextMate-based syntax highlighting engine.
 *
 * Provides the tokenization infrastructure (vscode-textmate + oniguruma),
 * grammar definitions for 23 languages, syntax themes, and a highlighter
 * service that produces syntax-highlighted HTML.
 */

// Tokenization
export {
  LazyTokenizationManager,
  TextMateTokenizer,
  pickBestScope,
  decodeTokens,
  StandardTokenType,
  FontStyle,
  ContiguousTokensStore,
  initTextMate,
  resetTextMateInit,
  EncodedTokenAttributes,
  TokenRegistry,
  BUILTIN_LANGUAGES,
} from "./tokenization";

export type {
  ITokenizer,
  StateStack,
  IToken,
  ITokenizeLineResult,
  TokenizationConfig,
  LanguageDefinition,
} from "./tokenization";

// Interfaces
export type { ISyntaxHighlighter, IGrammar, IGrammarRegistry } from "./interfaces";

// Service implementations
export { SyntaxHighlighter, highlightCode, escapeHtml } from "./services/syntax-highlighter";
export type { HighlightResult } from "./services/syntax-highlighter";
export { renderTokensToHtml } from "./services/token-html-renderer";
