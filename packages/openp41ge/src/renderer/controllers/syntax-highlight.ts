/**
 * syntax-highlight.ts — barrel re-export for backward compatibility.
 *
 * All implementation is now in the syntax-highlight/ directory.
 */
export type { Token, LanguageHandler } from "./syntax-highlight/registry.js";
export { registerLanguage, getHandler, formatTokens } from "./syntax-highlight/registry.js";
export { tokenizeJsonLine, jsonHandler } from "./syntax-highlight/tokenizers/json.js";
export { tokenizeYamlLine, yamlHandler } from "./syntax-highlight/tokenizers/yaml.js";
export { tokenizeJsLine, jsHandler } from "./syntax-highlight/tokenizers/javascript.js";
export { tokenizeMarkdownLine, mdHandler } from "./syntax-highlight/tokenizers/markdown.js";
export { tokenizeShellLine, shHandler } from "./syntax-highlight/tokenizers/shell.js";
export { tokenizeHtmlLine, htmlHandler } from "./syntax-highlight/tokenizers/html.js";
export { tokenizeCssLine, cssHandler } from "./syntax-highlight/tokenizers/css.js";
export { ensureHighlightStyles } from "./syntax-highlight/index.js";

// ── Register built-in languages ──
// Import handlers locally (re-exports don't create local bindings)
import { registerLanguage as _reg } from "./syntax-highlight/registry.js";
import { jsonHandler as _json } from "./syntax-highlight/tokenizers/json.js";
import { yamlHandler as _yaml } from "./syntax-highlight/tokenizers/yaml.js";
import { jsHandler as _js } from "./syntax-highlight/tokenizers/javascript.js";
import { mdHandler as _md } from "./syntax-highlight/tokenizers/markdown.js";
import { shHandler as _sh } from "./syntax-highlight/tokenizers/shell.js";
import { htmlHandler as _html } from "./syntax-highlight/tokenizers/html.js";
import { cssHandler as _css } from "./syntax-highlight/tokenizers/css.js";
_reg([".json"], _json);
_reg([".yaml", ".yml"], _yaml);
_reg([".js", ".mjs", ".cjs", ".jsx"], _js);
_reg([".ts", ".mts", ".cts", ".tsx"], _js);
_reg([".md", ".markdown"], _md);
_reg([".sh", ".bash", ".zsh", ".fish"], _sh);
_reg([".html", ".htm"], _html);
_reg([".css"], _css);
