/**
 * Markdown formatter — heading spacing, blockquote spacing, list spacing,
 * trailing whitespace removal.
 */

import { type Formatter } from "../registry";

export const markdownFormatter: Formatter = (content: string): string => {
  let s = content.replace(/\r\n?/g, "\n");

  const lines = s.split("\n");
  const out: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    line = line.replace(/^(#{1,6})([^#\s])/g, "$1 $2");
    line = line.replace(/^(\s*>)([^\s>])/g, "$1 $2");
    line = line.replace(/^(\s*[-*+])([^\s])/g, "$1 $2");
    line = line.replace(/^(\s*\d+\.)([^\s])/g, "$1 $2");
    line = line.replace(/[ \t]+$/, "");

    out.push(line);
  }

  s = out.join("\n");
  if (!s.endsWith("\n")) s += "\n";

  return s;
};
