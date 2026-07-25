/**
 * JavaScript formatter — re-indent based on brace depth, trailing whitespace removal.
 */

import { type Formatter } from "../registry";

function formatJavaScript(code: string): string {
  const lines = code.split("\n");
  const out: string[] = [];
  let depth = 0;

  for (const raw of lines) {
    const trimmed = raw.trim();
    if (trimmed.length === 0) {
      out.push("");
      continue;
    }

    let closeCount = 0;
    for (const ch of trimmed) {
      if (ch === "}" || ch === "]" || ch === ")") closeCount++;
      else break;
    }

    const openBraces = (trimmed.match(/\{/g) || []).length;
    const closeBraces = (trimmed.match(/\}/g) || []).length;
    const openBrackets = (trimmed.match(/\[/g) || []).length;
    const closeBrackets = (trimmed.match(/\]/g) || []).length;
    const openParens = (trimmed.match(/\(/g) || []).length;
    const closeParens = (trimmed.match(/\)/g) || []).length;

    const lineDepth = Math.max(0, depth - closeCount);
    depth = Math.max(
      0,
      depth + openBraces - closeBraces + openBrackets - closeBrackets + openParens - closeParens,
    );

    out.push("  ".repeat(lineDepth) + trimmed);
  }

  return out.join("\n");
}

export const jsFormatter: Formatter = (content: string): string => {
  const result = formatJavaScript(content);
  return result.replace(/[ \t]+$/gm, "");
};
