/**
 * JSON tokenizer.
 */

import { type Token, formatTokens, type LanguageHandler } from "../registry";

export function tokenizeJsonLine(line: string): Token[] {
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

    if (ch === '"') {
      let str = '"';
      i++;
      while (i < line.length) {
        if (line[i] === "\\") {
          str += line[i] + (line[i + 1] ?? "");
          i += 2;
        } else if (line[i] === '"') {
          str += '"';
          i++;
          break;
        } else {
          str += line[i];
          i++;
        }
      }
      tokens.push({ type: "string", value: str });
      continue;
    }

    if ("{}[]:,".includes(ch)) {
      tokens.push({ type: "punctuation", value: ch });
      i++;
      continue;
    }

    if (ch === "-" || (ch >= "0" && ch <= "9")) {
      let num = "";
      while (i < line.length && /[-\d.eE+]/.test(line[i])) {
        num += line[i];
        i++;
      }
      tokens.push({ type: "number", value: num });
      continue;
    }

    if (line.startsWith("true", i)) {
      tokens.push({ type: "boolean", value: "true" });
      i += 4;
      continue;
    }
    if (line.startsWith("false", i)) {
      tokens.push({ type: "boolean", value: "false" });
      i += 5;
      continue;
    }
    if (line.startsWith("null", i)) {
      tokens.push({ type: "null", value: "null" });
      i += 4;
      continue;
    }

    let text = ch;
    i++;
    while (
      i < line.length &&
      line[i] !== '"' &&
      !"{}[]:,".includes(line[i]) &&
      line[i] !== " " &&
      line[i] !== "\t"
    ) {
      text += line[i];
      i++;
    }
    tokens.push({ type: "text", value: text });
    continue;
  }

  for (let j = 0; j < tokens.length; j++) {
    if (tokens[j].type === "string") {
      let k = j + 1;
      while (
        k < tokens.length &&
        (tokens[k].type === "punctuation" || tokens[k].type === "text") &&
        tokens[k].value !== ":"
      ) {
        k++;
      }
      if (k < tokens.length && tokens[k].type === "punctuation" && tokens[k].value === ":") {
        tokens[j] = { type: "key", value: tokens[j].value } as Token;
      }
    }
  }

  return tokens;
}

export const jsonHandler: LanguageHandler = {
  name: "JSON",
  formatLine(line: string): string {
    return formatTokens(tokenizeJsonLine(line), line);
  },
};
