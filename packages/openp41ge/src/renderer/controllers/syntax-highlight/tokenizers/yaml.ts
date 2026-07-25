/**
 * YAML tokenizer.
 */

import { type Token, formatTokens, type LanguageHandler } from "../registry";

export function tokenizeYamlLine(line: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  let ws = "";
  while (i < line.length && (line[i] === " " || line[i] === "\t")) {
    ws += line[i];
    i++;
  }
  if (ws) tokens.push({ type: "text", value: ws });

  if (i >= line.length) return tokens;

  if (line[i] === "#") {
    tokens.push({ type: "comment", value: "#" + line.slice(i + 1) });
    return tokens;
  }

  if (line.startsWith("---", i)) {
    tokens.push({ type: "punctuation", value: "---" });
    i += 3;
    let restWs = "";
    while (i < line.length && (line[i] === " " || line[i] === "\t")) {
      restWs += line[i];
      i++;
    }
    if (restWs) tokens.push({ type: "text", value: restWs });
    if (i < line.length && line[i] === "#") {
      tokens.push({ type: "comment", value: "#" + line.slice(i + 1) });
    } else if (i < line.length) {
      tokens.push({ type: "text", value: line.slice(i) });
    }
    return tokens;
  }

  if (line[i] === "-" && (i + 1 >= line.length || line[i + 1] === " " || line[i + 1] === "\t")) {
    tokens.push({ type: "punctuation", value: "-" });
    i++;
    if (i < line.length && (line[i] === " " || line[i] === "\t")) {
      let ws2 = "";
      while (i < line.length && (line[i] === " " || line[i] === "\t")) {
        ws2 += line[i];
        i++;
      }
      tokens.push({ type: "text", value: ws2 });
    }
    if (i >= line.length) return tokens;
  }

  _parseYamlContent(line, i, tokens);
  return tokens;
}

function _parseYamlContent(line: string, start: number, tokens: Token[]): void {
  let i = start;

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

    if (ch === "#") {
      tokens.push({ type: "comment", value: "#" + line.slice(i + 1) });
      return;
    }

    if (
      (ch === "|" || ch === ">") &&
      (i + 1 >= line.length || line[i + 1] === " " || line[i + 1] === "\t")
    ) {
      tokens.push({ type: "punctuation", value: ch });
      i++;
      continue;
    }

    if (ch === '"' || ch === "'") {
      const quote = ch;
      let str = quote;
      i++;
      while (i < line.length) {
        if (line[i] === "\\") {
          str += line[i] + (line[i + 1] ?? "");
          i += 2;
        } else if (line[i] === quote) {
          str += quote;
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

    if (ch === "-" || (ch >= "0" && ch <= "9")) {
      if (ch === "-" && i + 1 < line.length && !(line[i + 1] >= "0" && line[i + 1] <= "9")) {
        let text = ch;
        i++;
        while (
          i < line.length &&
          line[i] !== " " &&
          line[i] !== "\t" &&
          line[i] !== "#" &&
          line[i] !== '"' &&
          line[i] !== "'"
        ) {
          text += line[i];
          i++;
        }
        tokens.push({ type: "text", value: text });
        continue;
      }
      let num = "";
      while (i < line.length && /[-\d.eE+]/.test(line[i])) {
        num += line[i];
        i++;
      }
      tokens.push({ type: "number", value: num });
      continue;
    }

    if (/[a-zA-Z_]/.test(ch)) {
      const rest = line.slice(i);
      const keyMatch = rest.match(/^([a-zA-Z_][a-zA-Z0-9_-]*?)(\s*:\s*|:\s*$)/);
      if (keyMatch) {
        const keyName = keyMatch[1];
        tokens.push({ type: "key", value: keyName });
        i += keyName.length;
        while (i < line.length && (line[i] === " " || line[i] === "\t")) {
          tokens.push({ type: "text", value: line[i] });
          i++;
        }
        tokens.push({ type: "punctuation", value: ":" });
        i++;
        while (i < line.length && (line[i] === " " || line[i] === "\t")) {
          tokens.push({ type: "text", value: line[i] });
          i++;
        }
        continue;
      }
    }

    if (/[a-zA-Z_]/.test(ch)) {
      const wordMatch = line.slice(i).match(/^[a-zA-Z_][a-zA-Z0-9_]*/);
      const word = wordMatch![0];
      const lower = word.toLowerCase();
      if (["true", "yes", "on"].includes(lower)) {
        tokens.push({ type: "boolean", value: word });
        i += word.length;
        continue;
      }
      if (["false", "no", "off"].includes(lower)) {
        tokens.push({ type: "boolean", value: word });
        i += word.length;
        continue;
      }
      if (lower === "null") {
        tokens.push({ type: "null", value: word });
        i += word.length;
        continue;
      }
    }

    if (ch === "~") {
      tokens.push({ type: "null", value: "~" });
      i++;
      continue;
    }

    if ("{}[],".includes(ch)) {
      tokens.push({ type: "punctuation", value: ch });
      i++;
      continue;
    }

    let text = "";
    while (
      i < line.length &&
      line[i] !== " " &&
      line[i] !== "\t" &&
      line[i] !== "#" &&
      line[i] !== '"' &&
      line[i] !== "'" &&
      !"{}[],".includes(line[i])
    ) {
      text += line[i];
      i++;
    }
    tokens.push({ type: "text", value: text });
  }
}

export const yamlHandler: LanguageHandler = {
  name: "YAML",
  formatLine(line: string): string {
    return formatTokens(tokenizeYamlLine(line), line);
  },
};
