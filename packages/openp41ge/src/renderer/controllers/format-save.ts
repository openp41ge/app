/**
 * format-save.ts — backward-compatible barrel.
 *
 * All implementation is now in the format-save/ directory.
 */

export type { Formatter } from "./format-save/registry.js";
export { getFormatterForPath } from "./format-save/registry.js";

// ── Register built-in formatters ──
import { registerFormatter as _reg } from "./format-save/registry.js";
import { htmlFormatter as _html } from "./format-save/formatters/html.js";
import { jsFormatter as _js } from "./format-save/formatters/javascript.js";
import { markdownFormatter as _md } from "./format-save/formatters/markdown.js";
import { shellFormatter as _sh } from "./format-save/formatters/shell.js";
import { jsonFormatter as _json } from "./format-save/formatters/json.js";
import { yamlFormatter as _yaml } from "./format-save/formatters/yaml.js";

_reg(["html", "htm"], _html);
_reg(["js", "mjs", "cjs", "ts", "mts", "cts", "tsx"], _js);
_reg(["md", "markdown"], _md);
_reg(["sh", "bash", "zsh", "env"], _sh);
_reg(["json", "jsonc"], _json);
_reg(["yaml", "yml"], _yaml);
