/**
 * HTML tokenizer.
 */

import { type Token, formatTokens, type LanguageHandler } from "../registry";

export function tokenizeHtmlLine(line: string): Token[] {
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

    if (line.slice(i).startsWith("<!--")) {
      let comment = "<!--";
      i += 4;
      while (i < line.length && !line.slice(i).startsWith("-->")) {
        comment += line[i];
        i++;
      }
      if (line.slice(i).startsWith("-->")) {
        comment += "-->";
        i += 3;
      }
      tokens.push({ type: "comment", value: comment });
      continue;
    }

    if (line.slice(i).startsWith("</")) {
      tokens.push({ type: "punctuation", value: "</" });
      i += 2;
      let tagName = "";
      while (i < line.length && /[a-zA-Z0-9_-]/.test(line[i])) {
        tagName += line[i];
        i++;
      }
      if (tagName) tokens.push({ type: "key", value: tagName });
      let ws = "";
      while (i < line.length && (line[i] === " " || line[i] === "\t")) {
        ws += line[i];
        i++;
      }
      if (ws) tokens.push({ type: "text", value: ws });
      if (i < line.length && line[i] === ">") {
        tokens.push({ type: "bracket", value: ">" });
        i++;
      }
      continue;
    }

    if (line[i] === "<") {
      tokens.push({ type: "punctuation", value: "<" });
      i++;

      let tagName = "";
      while (i < line.length && /[a-zA-Z0-9_-]/.test(line[i])) {
        tagName += line[i];
        i++;
      }
      if (tagName) tokens.push({ type: "key", value: tagName });

      while (i < line.length && line[i] !== ">" && !line.slice(i).startsWith("/>")) {
        if (line[i] === " " || line[i] === "\t") {
          let ws = "";
          while (i < line.length && (line[i] === " " || line[i] === "\t")) {
            ws += line[i];
            i++;
          }
          tokens.push({ type: "text", value: ws });
          continue;
        }

        if (/[a-zA-Z_]/.test(line[i])) {
          let attrName = "";
          while (i < line.length && /[a-zA-Z0-9_-]/.test(line[i])) {
            attrName += line[i];
            i++;
          }
          tokens.push({ type: "key", value: attrName });
          continue;
        }

        if (line[i] === "=") {
          tokens.push({ type: "punctuation", value: "=" });
          i++;
          continue;
        }

        if (line[i] === '"' || line[i] === "'") {
          const quote = line[i];
          tokens.push({ type: "string", value: quote });
          i++;
          let val = "";
          while (i < line.length && line[i] !== quote) {
            val += line[i];
            i++;
          }
          if (val) tokens.push({ type: "text", value: val });
          if (i < line.length && line[i] === quote) {
            tokens.push({ type: "string", value: quote });
            i++;
          }
          continue;
        }

        if (line[i] !== ">" && !line.slice(i).startsWith("/>") && line[i] !== " ") {
          let val = "";
          while (
            i < line.length &&
            line[i] !== ">" &&
            !line.slice(i).startsWith("/>") &&
            line[i] !== " " &&
            line[i] !== "\t"
          ) {
            val += line[i];
            i++;
          }
          tokens.push({ type: "text", value: val });
          continue;
        }

        tokens.push({ type: "text", value: line[i] });
        i++;
      }

      if (line.slice(i).startsWith("/>")) {
        tokens.push({ type: "punctuation", value: "/>" });
        i += 2;
        continue;
      }

      if (i < line.length && line[i] === ">") {
        tokens.push({ type: "bracket", value: ">" });
        i++;
      }
      continue;
    }

    if (line[i] === "&") {
      let entity = "&";
      i++;
      while (i < line.length && /[a-zA-Z0-9#;]/.test(line[i])) {
        entity += line[i];
        i++;
        if (line[i - 1] === ";") break;
      }
      tokens.push({ type: "escape", value: entity });
      continue;
    }

    let text = "";
    while (
      i < line.length &&
      line[i] !== "<" &&
      line[i] !== "&" &&
      line[i] !== " " &&
      line[i] !== "\t"
    ) {
      text += line[i];
      i++;
    }
    if (text) tokens.push({ type: "text", value: text });
  }

  return tokens;
}

export const htmlHandler: LanguageHandler = {
  name: "HTML",
  formatLine(line: string): string {
    return formatTokens(tokenizeHtmlLine(line), line);
  },
};
