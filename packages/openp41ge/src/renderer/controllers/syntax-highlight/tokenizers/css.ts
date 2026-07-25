/**
 * CSS tokenizer.
 */

import { type Token, formatTokens, type LanguageHandler } from "../registry";

export function tokenizeCssLine(line: string): Token[] {
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

    if (line.slice(i).startsWith("/*")) {
      let c = "/*";
      i += 2;
      while (i < line.length && !line.slice(i).startsWith("*/")) {
        c += line[i];
        i++;
      }
      if (line.slice(i).startsWith("*/")) {
        c += "*/";
        i += 2;
      }
      tokens.push({ type: "comment", value: c });
      continue;
    }

    if (line[i] === '"' || line[i] === "'") {
      const quote = line[i];
      let str = quote;
      i++;
      while (i < line.length && line[i] !== quote) {
        if (line[i] === "\\") {
          str += line[i] + (line[i + 1] ?? "");
          i += 2;
        } else {
          str += line[i];
          i++;
        }
      }
      if (i < line.length) {
        str += quote;
        i++;
      }
      tokens.push({ type: "string", value: str });
      continue;
    }

    if (
      (line[i] >= "0" && line[i] <= "9") ||
      (line[i] === "." && i + 1 < line.length && line[i + 1] >= "0" && line[i + 1] <= "9")
    ) {
      let num = "";
      if (line[i] === ".") {
        num = ".";
        i++;
      }
      while (i < line.length && /[0-9.]/.test(line[i])) {
        num += line[i];
        i++;
      }
      let unit = "";
      while (i < line.length && /[a-zA-Z%]/.test(line[i])) {
        unit += line[i];
        i++;
      }
      tokens.push({ type: "number", value: num + unit });
      continue;
    }

    if (line[i] === "#" && i + 1 < line.length && /[0-9a-fA-F]/.test(line[i + 1])) {
      let hex = "#";
      i++;
      while (i < line.length && /[0-9a-fA-F]/.test(line[i])) {
        hex += line[i];
        i++;
      }
      tokens.push({ type: "number", value: hex });
      continue;
    }

    if (line[i] === "@") {
      let at = "@";
      i++;
      while (i < line.length && /[a-zA-Z-]/.test(line[i])) {
        at += line[i];
        i++;
      }
      tokens.push({ type: "key", value: at });
      continue;
    }

    if (line[i] === "{" || line[i] === "}") {
      tokens.push({ type: "bracket", value: line[i] });
      i++;
      continue;
    }

    if (line[i] === "(" || line[i] === ")") {
      tokens.push({ type: "bracket", value: line[i] });
      i++;
      continue;
    }

    if (line[i] === ":") {
      if (line[i + 1] === ":") {
        tokens.push({ type: "punctuation", value: "::" });
        i += 2;
        let name = "";
        while (i < line.length && /[a-zA-Z-]/.test(line[i])) {
          name += line[i];
          i++;
        }
        if (name) tokens.push({ type: "key", value: name });
      } else {
        tokens.push({ type: "punctuation", value: ":" });
        i++;
        if (i < line.length && /[a-zA-Z-]/.test(line[i])) {
          let name = "";
          while (i < line.length && /[a-zA-Z-]/.test(line[i])) {
            name += line[i];
            i++;
          }
          tokens.push({ type: "key", value: name });
        }
      }
      continue;
    }

    if (">~+,;*".includes(line[i])) {
      tokens.push({ type: "punctuation", value: line[i] });
      i++;
      continue;
    }

    if (line[i] === ".") {
      tokens.push({ type: "punctuation", value: "." });
      i++;
      let cls = "";
      while (i < line.length && /[a-zA-Z0-9_-]/.test(line[i])) {
        cls += line[i];
        i++;
      }
      tokens.push({ type: "key", value: cls });
      continue;
    }

    if (line[i] === "#") {
      tokens.push({ type: "punctuation", value: "#" });
      i++;
      let id = "";
      while (i < line.length && /[a-zA-Z0-9_-]/.test(line[i])) {
        id += line[i];
        i++;
      }
      tokens.push({ type: "key", value: id });
      continue;
    }

    if (line[i] === "[") {
      tokens.push({ type: "bracket", value: "[" });
      i++;
      continue;
    }
    if (line[i] === "]") {
      tokens.push({ type: "bracket", value: "]" });
      i++;
      continue;
    }

    if (/[a-zA-Z*_]/.test(line[i])) {
      let word = "";
      while (i < line.length && /[a-zA-Z0-9_-]/.test(line[i])) {
        word += line[i];
        i++;
      }

      if (word === "") {
        tokens.push({ type: "text", value: line[i] });
        i++;
        continue;
      }

      const CSS_VALUES = new Set([
        "auto",
        "inherit",
        "initial",
        "unset",
        "revert",
        "none",
        "solid",
        "dashed",
        "dotted",
        "double",
        "groove",
        "ridge",
        "inset",
        "outset",
        "hidden",
        "visible",
        "scroll",
        "auto",
        "flex",
        "grid",
        "block",
        "inline",
        "inline-block",
        "table",
        "relative",
        "absolute",
        "fixed",
        "sticky",
        "static",
        "center",
        "left",
        "right",
        "top",
        "bottom",
        "middle",
        "bold",
        "normal",
        "italic",
        "underline",
        "overline",
        "repeat",
        "no-repeat",
        "cover",
        "contain",
        "transparent",
        "currentColor",
        "ellipsis",
        "clip",
        "hidden",
        "visible",
        "column",
        "row",
        "wrap",
        "nowrap",
        "baseline",
        "stretch",
        "start",
        "end",
        "space-between",
        "space-around",
        "space-evenly",
      ]);

      if (i < line.length && line[i] === "(") {
        tokens.push({ type: "method", value: word });
        continue;
      }

      if (CSS_VALUES.has(word)) {
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

export const cssHandler: LanguageHandler = {
  name: "CSS",
  formatLine(line: string): string {
    return formatTokens(tokenizeCssLine(line), line);
  },
};
