/**
 * Shell tokenizer (.sh, .bash, .zsh, .fish).
 */

import { type Token, formatTokens, type LanguageHandler } from "../registry";

const SH_KEYWORDS = new Set([
  "if",
  "then",
  "else",
  "elif",
  "fi",
  "for",
  "while",
  "until",
  "do",
  "done",
  "case",
  "esac",
  "in",
  "function",
  "return",
  "exit",
  "export",
  "local",
  "declare",
  "typeset",
  "readonly",
  "unset",
  "shift",
  "trap",
  "exec",
  "eval",
  "source",
  "select",
  "continue",
  "break",
  "echo",
  "printf",
  "read",
  "test",
  "let",
]);

function _tokenizeShellVariable(line: string, i: number): Token[] {
  const tokens: Token[] = [];
  if (line[i] !== "$") return tokens;

  if (line[i + 1] === "{") {
    tokens.push({ type: "punctuation", value: "${" });
    let j = i + 2;
    let name = "";
    while (j < line.length && /[a-zA-Z0-9_]/.test(line[j])) {
      name += line[j];
      j++;
    }
    if (name) tokens.push({ type: "type", value: name });
    let rest = "";
    while (j < line.length && line[j] !== "}") {
      rest += line[j];
      j++;
    }
    if (rest) tokens.push({ type: "text", value: rest });
    if (j < line.length && line[j] === "}") {
      tokens.push({ type: "punctuation", value: "}" });
    }
    return tokens;
  }

  if (line[i + 1] === "(") {
    tokens.push({ type: "punctuation", value: "$(" });
    return tokens;
  }

  tokens.push({ type: "punctuation", value: "$" });
  let name = "";
  let j = i + 1;
  while (j < line.length && /[a-zA-Z0-9_]/.test(line[j])) {
    name += line[j];
    j++;
  }
  if (name) tokens.push({ type: "type", value: name });
  return tokens;
}

export function tokenizeShellLine(line: string): Token[] {
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

    if (line[i] === "#") {
      tokens.push({ type: "comment", value: line.slice(i) });
      return tokens;
    }

    if (line[i] === '"') {
      tokens.push({ type: "string", value: '"' });
      i++;
      while (i < line.length) {
        if (line[i] === "\\") {
          const esc = line[i] + (line[i + 1] ?? "");
          tokens.push({ type: "escape", value: esc });
          i += 2;
        } else if (line[i] === '"') {
          tokens.push({ type: "string", value: '"' });
          i++;
          break;
        } else if (line[i] === "$") {
          tokens.push(..._tokenizeShellVariable(line, i));
          let varEnd = i + 1;
          if (line[i + 1] === "{") {
            let depth = 1;
            varEnd = i + 2;
            while (varEnd < line.length && depth > 0) {
              if (line[varEnd] === "{") depth++;
              else if (line[varEnd] === "}") depth--;
              if (depth > 0) varEnd++;
            }
            varEnd++;
          } else if (/[a-zA-Z_]/.test(line[i + 1] ?? "")) {
            varEnd = i + 1;
            while (varEnd < line.length && /[a-zA-Z0-9_]/.test(line[varEnd])) varEnd++;
          } else {
            varEnd = i + 1;
          }
          i = varEnd;
        } else {
          let text = "";
          while (i < line.length && line[i] !== "\\" && line[i] !== '"' && line[i] !== "$") {
            text += line[i];
            i++;
          }
          if (text) tokens.push({ type: "text", value: text });
        }
      }
      continue;
    }

    if (line[i] === "'") {
      let str = "'";
      i++;
      while (i < line.length && line[i] !== "'") {
        str += line[i];
        i++;
      }
      if (i < line.length) {
        str += "'";
        i++;
      }
      tokens.push({ type: "string", value: str });
      continue;
    }

    if (line[i] === "$") {
      const varTokens = _tokenizeShellVariable(line, i);
      tokens.push(...varTokens);

      if (line[i + 1] === "{") {
        let depth = 1;
        let j = i + 2;
        while (j < line.length && depth > 0) {
          if (line[j] === "{") depth++;
          else if (line[j] === "}") depth--;
          j++;
        }
        i = j;
      } else if (line[i + 1] === "(") {
        let depth = 1;
        let j = i + 2;
        while (j < line.length && depth > 0) {
          if (line[j] === "(") depth++;
          else if (line[j] === ")") depth--;
          j++;
        }
        i = j;
      } else {
        i += 1;
        while (i < line.length && /[a-zA-Z0-9_]/.test(line[i])) i++;
      }
      continue;
    }

    if (line[i] >= "0" && line[i] <= "9") {
      let num = "";
      while (i < line.length && /[0-9.]/.test(line[i])) {
        num += line[i];
        i++;
      }
      tokens.push({ type: "number", value: num });
      continue;
    }

    const two = line.slice(i, i + 2);
    if (
      two === "&&" ||
      two === "||" ||
      two === ">>" ||
      two === "<<" ||
      two === "==" ||
      two === "!="
    ) {
      tokens.push({ type: "punctuation", value: two });
      i += 2;
      continue;
    }

    if ("|&;><(){}".includes(line[i])) {
      tokens.push({ type: "punctuation", value: line[i] });
      i++;
      continue;
    }

    if (/[a-zA-Z_]/.test(line[i])) {
      let word = "";
      while (i < line.length && /[a-zA-Z0-9_]/.test(line[i])) {
        word += line[i];
        i++;
      }

      if (SH_KEYWORDS.has(word)) {
        tokens.push({ type: "key", value: word });
        continue;
      }

      tokens.push({ type: "text", value: word });
      continue;
    }

    tokens.push({ type: "text", value: line[i] });
    i++;
  }

  return tokens;
}

export const shHandler: LanguageHandler = {
  name: "Shell",
  formatLine(line: string): string {
    return formatTokens(tokenizeShellLine(line), line);
  },
};
