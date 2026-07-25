/**
 * HTML formatter — attribute quotes, indentation, inline JS formatting.
 */

import { type Formatter } from "../registry";

/** Void / self-closing HTML elements that never contain child content. */
const VOID_ELEMENTS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);

/**
 * Re-indent HTML so every element is on its own line, aligned at the
 * correct nesting depth.  Script and style block content is preserved
 * verbatim.
 */
function indentHtml(html: string): string {
  let safe = html.replace(
    /(<[\w-]+)(\s[\s\S]*?>)/g,
    (_tag, open: string, rest: string) => open + rest.replace(/\n\s*/g, " "),
  );

  safe = safe.replace(/>\s+</g, ">\n<");

  const lines = safe.split("\n");
  const out: string[] = [];
  let depth = 0;
  let inRawBlock = false;
  const tagRe = /<(\/?)([\w-]+)(?:\s[^>]*)?(\/?)>/g;

  for (const raw of lines) {
    const trimmed = raw.trim();

    if (trimmed.length === 0) {
      out.push("");
      continue;
    }

    if (inRawBlock) {
      if (/^<\/(script|style)\s*>$/i.test(trimmed)) {
        inRawBlock = false;
        depth = Math.max(0, depth - 1);
        out.push("  ".repeat(depth) + trimmed);
      } else {
        out.push(raw);
      }
      continue;
    }

    if (/^<(script|style)\b/i.test(trimmed) && !/<\/(script|style)\s*>/i.test(trimmed)) {
      inRawBlock = true;
      out.push("  ".repeat(depth) + trimmed);
      depth++;
      continue;
    }

    let closeCount = 0;
    let scan = trimmed;
    while (/^<\//.test(scan)) {
      closeCount++;
      const endIdx = scan.indexOf(">");
      if (endIdx === -1) break;
      scan = scan.substring(endIdx + 1).trimStart();
    }

    let openTags = 0;
    let closeTags = 0;
    let m: RegExpExecArray | null;
    tagRe.lastIndex = 0;
    while ((m = tagRe.exec(trimmed)) !== null) {
      const isClosing = m[1] === "/";
      const tagName = m[2].toLowerCase();
      const isSelfClosing = m[3] === "/";
      if (isClosing) {
        closeTags++;
      } else if (!isSelfClosing && !VOID_ELEMENTS.has(tagName)) {
        openTags++;
      }
    }

    const lineDepth = Math.max(0, depth - closeCount);
    depth = Math.max(0, depth + openTags - closeTags);

    out.push("  ".repeat(lineDepth) + trimmed);
  }

  return out.join("\n");
}

/**
 * Detect the minimum common leading whitespace across all non-empty lines.
 */
function detectBaseIndent(lines: string[]): number {
  let min = Infinity;
  for (const line of lines) {
    if (line.trim().length === 0) continue;
    const leading = line.match(/^ */)?.[0].length ?? 0;
    if (leading < min) min = leading;
  }
  return min === Infinity ? 0 : min;
}

/**
 * Format JavaScript code — re-indent based on brace depth.
 */
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

/**
 * Format inline JavaScript inside <script> tags.
 */
function formatInlineJavaScript(html: string): string {
  return html.replace(
    /( *)(<script\b[^>]*>)([\s\S]*?)(<\/script\s*>)/gi,
    (_match, indent: string, openTag: string, jsCode: string, closeTag: string) => {
      if (/src\s*=/.test(openTag)) {
        if (jsCode.trim() && !jsCode.includes("\n")) {
          return `${indent}${openTag}${jsCode.trim()}${closeTag}`;
        }
        return _match;
      }

      if (!jsCode.includes("\n")) {
        return `${indent}${openTag}${jsCode.trim()}${closeTag}`;
      }

      const lines = jsCode.split("\n");
      const baseIndent = detectBaseIndent(lines);
      const normalized = lines
        .filter((l, i, arr) => {
          if (i === 0 && l.trim().length === 0) return false;
          if (i === arr.length - 1 && l.trim().length === 0) return false;
          return true;
        })
        .map((l) => l.replace(new RegExp(`^ {${baseIndent}}`), ""));

      const formatted = formatJavaScript(normalized.join("\n"));

      const tagDepth = indent.length / 2;
      const contentIndent = tagDepth + 1;
      const reindented = formatted
        .split("\n")
        .map((l) => {
          if (l.trim().length === 0) return "";
          return "  ".repeat(contentIndent) + l;
        })
        .join("\n");

      return `${indent}${openTag}\n${reindented}\n${indent}${closeTag}`;
    },
  );
}

export const htmlFormatter: Formatter = (content: string): string => {
  const quoteNormalised = content.replace(
    /(<script\b[^>]*>[\s\S]*?<\/script\s*>|<style\b[^>]*>[\s\S]*?<\/style\s*>|<[^>]+>)/gi,
    (segment) => {
      if (/^<[^>]+>$/g.test(segment) && !/^<\/(script|style)>$/i.test(segment)) {
        return segment.replace(/(\w[\w-]*)\s*=\s*'([^']*)'/g, (_m, name: string, value: string) => {
          const escaped = value.replace(/"/g, '\\"');
          return `${name}="${escaped}"`;
        });
      }
      return segment;
    },
  );

  const indented = indentHtml(quoteNormalised);
  const jsFormatted = formatInlineJavaScript(indented);
  return jsFormatted.replace(/[ \t]+$/gm, "");
};
