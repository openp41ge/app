/**
 * JavaScript / TypeScript tokenizer.
 */

import { type Token, formatTokens, type LanguageHandler } from "../registry";

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

function _tokenizeJsStringContent(
  line: string,
  start: number,
  quote: string,
): { tokens: Token[]; endIndex: number } {
  const tokens: Token[] = [];
  let i = start;

  while (i < line.length) {
    if (line[i] === "\\") {
      const esc = line[i] + (line[i + 1] ?? "");
      tokens.push({ type: "escape", value: esc });
      i += 2;
    } else if (line[i] === quote) {
      break;
    } else if (quote === "`" && line[i] === "$" && line[i + 1] === "{") {
      break;
    } else {
      let text = "";
      while (
        i < line.length &&
        line[i] !== "\\" &&
        line[i] !== quote &&
        !(quote === "`" && line[i] === "$" && line[i + 1] === "{")
      ) {
        text += line[i];
        i++;
      }
      if (text) tokens.push({ type: "text", value: text });
    }
  }

  return { tokens, endIndex: i };
}

export function tokenizeJsLine(line: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < line.length) {
    if (line[i] === " " || line[i] === "\t") {
      let ws = "";
      while (i < line.length && (line[i] === " " || line[i] === "\t")) {
        ws += line[i];
        i++;
      }
      tokens.push({ type: "text", value: ws });
      continue;
    }

    if (line[i] === "/" && line[i + 1] === "/") {
      tokens.push({ type: "comment", value: line.slice(i) });
      return tokens;
    }

    if (line[i] === "/" && line[i + 1] === "*") {
      let c = "/*";
      i += 2;
      while (i < line.length) {
        if (line[i] === "*" && line[i + 1] === "/") {
          c += "*/";
          i += 2;
          break;
        }
        c += line[i];
        i++;
      }
      tokens.push({ type: "comment", value: c });
      continue;
    }

    if (line[i] === "`" || line[i] === '"' || line[i] === "'") {
      const quote = line[i];
      tokens.push({ type: "string", value: quote });
      i++;

      const { tokens: content, endIndex } = _tokenizeJsStringContent(line, i, quote);
      tokens.push(...content);
      i = endIndex;

      if (i < line.length && line[i] === quote) {
        tokens.push({ type: "string", value: quote });
        i++;
      }
      continue;
    }

    if (
      (line[i] >= "0" && line[i] <= "9") ||
      (line[i] === "." && i + 1 < line.length && line[i + 1] >= "0" && line[i + 1] <= "9")
    ) {
      let num = "";
      if (line[i] === "0" && (line[i + 1] === "x" || line[i + 1] === "X")) {
        num = "0x";
        i += 2;
        while (i < line.length && /[0-9a-fA-F]/.test(line[i])) {
          num += line[i];
          i++;
        }
      } else {
        while (i < line.length && /[0-9.eE+-]/.test(line[i])) {
          num += line[i];
          i++;
        }
      }
      tokens.push({ type: "number", value: num });
      continue;
    }

    if ("{}()[]".includes(line[i])) {
      tokens.push({ type: "bracket", value: line[i] });
      i++;
      continue;
    }

    const three = line.slice(i, i + 3);
    if (three === "===" || three === "!==" || three === ">>>") {
      tokens.push({ type: "punctuation", value: three });
      i += 3;
      continue;
    }

    const two = line.slice(i, i + 2);
    const TWO_CHAR_OPS = new Set([
      "==",
      "!=",
      ">=",
      "<=",
      "&&",
      "||",
      "??",
      "?.",
      "=>",
      "++",
      "--",
      "+=",
      "-=",
      "*=",
      "/=",
      "%=",
      "**",
      "<<",
      ">>",
    ]);
    if (TWO_CHAR_OPS.has(two)) {
      tokens.push({ type: "punctuation", value: two });
      i += 2;
      continue;
    }

    if (";:.,=<>!+-*/%&|^~?@#".includes(line[i])) {
      tokens.push({ type: "punctuation", value: line[i] });
      i++;
      continue;
    }

    if (line[i] === "/") {
      tokens.push({ type: "punctuation", value: "/" });
      i++;
      continue;
    }

    if (/[a-zA-Z_$]/.test(line[i])) {
      let word = "";
      while (i < line.length && /[a-zA-Z0-9_$]/.test(line[i])) {
        word += line[i];
        i++;
      }

      if (JS_KEYWORDS.has(word)) {
        tokens.push({ type: "key", value: word });
        continue;
      }
      if (word === "true" || word === "false") {
        tokens.push({ type: "boolean", value: word });
        continue;
      }
      if (word === "null" || word === "undefined") {
        tokens.push({ type: "null", value: word });
        continue;
      }
      if (JS_TYPES.has(word)) {
        tokens.push({ type: "type", value: word });
        continue;
      }

      tokens.push({ type: "text", value: word });
      continue;
    }

    tokens.push({ type: "text", value: line[i] });
    i++;
  }

  for (let j = 1; j < tokens.length; j++) {
    if (tokens[j].type === "bracket" && tokens[j].value === "(" && tokens[j - 1].type === "text") {
      tokens[j - 1] = { type: "method", value: tokens[j - 1].value };
    }
  }

  return tokens;
}

export const jsHandler: LanguageHandler = {
  name: "JavaScript/TypeScript",
  formatLine(line: string): string {
    return formatTokens(tokenizeJsLine(line), line);
  },
};
