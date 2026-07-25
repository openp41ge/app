/**
 * Markdown tokenizer.
 */

import { type Token, formatTokens, type LanguageHandler } from "../registry";

export function tokenizeMarkdownLine(line: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  let ws = "";
  while (i < line.length && (line[i] === " " || line[i] === "\t")) {
    ws += line[i];
    i++;
  }
  if (ws) tokens.push({ type: "text", value: ws });
  if (i >= line.length) return tokens;

  const heading = line.slice(i).match(/^(#{1,6})\s/);
  if (heading) {
    tokens.push({ type: "comment", value: heading[1] + " " });
    i += heading[0].length;
    tokens.push({ type: "key", value: line.slice(i) });
    return tokens;
  }

  if (line.slice(i).match(/^(-{3,}|\*{3,}|_{3,})\s*$/)) {
    tokens.push({ type: "comment", value: line.slice(i) });
    return tokens;
  }

  if (line[i] === ">") {
    tokens.push({ type: "comment", value: "> " });
    i += 2;
  }

  const list = line.slice(i).match(/^([-*+]|\d+\.)\s/);
  if (list) {
    tokens.push({ type: "punctuation", value: list[1] + " " });
    i += list[0].length;
  }

  while (i < line.length) {
    if (line[i] === "`") {
      let code = "`";
      i++;
      while (i < line.length && line[i] !== "`") {
        code += line[i];
        i++;
      }
      if (i < line.length) {
        code += "`";
        i++;
      }
      tokens.push({ type: "string", value: code });
      continue;
    }

    if (line[i] === "!" && line[i + 1] === "[") {
      tokens.push({ type: "punctuation", value: "![" });
      i += 2;
      let alt = "";
      while (i < line.length && line[i] !== "]") {
        alt += line[i];
        i++;
      }
      if (i < line.length) {
        tokens.push({ type: "string", value: alt });
        tokens.push({ type: "punctuation", value: "]" });
        i++;
      }
      if (i < line.length && line[i] === "(") {
        tokens.push({ type: "punctuation", value: "(" });
        i++;
        let url = "";
        while (i < line.length && line[i] !== ")") {
          url += line[i];
          i++;
        }
        tokens.push({ type: "text", value: url });
        if (i < line.length) {
          tokens.push({ type: "punctuation", value: ")" });
          i++;
        }
      }
      continue;
    }

    if (line[i] === "!") {
      tokens.push({ type: "text", value: "!" });
      i++;
      continue;
    }

    if (line[i] === "[") {
      tokens.push({ type: "punctuation", value: "[" });
      i++;
      let text = "";
      while (i < line.length && line[i] !== "]") {
        text += line[i];
        i++;
      }
      tokens.push({ type: "key", value: text });
      if (i < line.length) {
        tokens.push({ type: "punctuation", value: "]" });
        i++;
      }
      if (i < line.length && line[i] === "(") {
        tokens.push({ type: "punctuation", value: "(" });
        i++;
        let url = "";
        while (i < line.length && line[i] !== ")") {
          url += line[i];
          i++;
        }
        tokens.push({ type: "text", value: url });
        if (i < line.length) {
          tokens.push({ type: "punctuation", value: ")" });
          i++;
        }
      }
      continue;
    }

    if (line[i] === "*" && line[i + 1] === "*") {
      tokens.push({ type: "punctuation", value: "**" });
      i += 2;
      let bold = "";
      while (i < line.length && !(line[i] === "*" && line[i + 1] === "*")) {
        bold += line[i];
        i++;
      }
      tokens.push({ type: "key", value: bold });
      if (i < line.length) {
        tokens.push({ type: "punctuation", value: "**" });
        i += 2;
      }
      continue;
    }

    if (line[i] === "*" && line[i + 1] !== " ") {
      const asterisk = line[i];
      let italic = "";
      i++;
      while (i < line.length && line[i] !== asterisk) {
        italic += line[i];
        i++;
      }
      if (italic.length > 0) {
        tokens.push({ type: "punctuation", value: asterisk });
        tokens.push({ type: "key", value: italic });
        if (i < line.length) {
          tokens.push({ type: "punctuation", value: asterisk });
          i++;
        }
        continue;
      }
      tokens.push({ type: "text", value: asterisk + italic });
      continue;
    }

    if (line[i] === "*") {
      tokens.push({ type: "text", value: line[i] });
      i++;
      continue;
    }

    if ("{}[]()<>|:~".includes(line[i])) {
      tokens.push({ type: "punctuation", value: line[i] });
      i++;
      continue;
    }

    let text = "";
    while (
      i < line.length &&
      line[i] !== "`" &&
      line[i] !== "[" &&
      line[i] !== "!" &&
      line[i] !== "*" &&
      !"{}[]()<>|:~".includes(line[i])
    ) {
      text += line[i];
      i++;
    }
    tokens.push({ type: "text", value: text });
  }

  return tokens;
}

export const mdHandler: LanguageHandler = {
  name: "Markdown",
  formatLine(line: string): string {
    return formatTokens(tokenizeMarkdownLine(line), line);
  },
};
