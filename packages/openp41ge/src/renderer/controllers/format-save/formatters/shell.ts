/**
 * Shell script formatter — trailing whitespace, comment spacing,
 * = assignment normalization.
 */

import { type Formatter } from "../registry";

export const shellFormatter: Formatter = (content: string): string => {
  let s = content.replace(/\r\n?/g, "\n");

  const lines = s.split("\n");
  const out: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    line = line.replace(/[ \t]+$/, "");

    if (!line.startsWith("#!")) {
      line = line.replace(/^(\s*#)([^\s!#])/g, "$1 $2");
    }

    line = line.replace(/^(\s*[a-zA-Z_][a-zA-Z0-9_]*)\s*=\s+(.*)/g, "$1=$2");
    line = line.replace(/^(\s*[a-zA-Z_][a-zA-Z0-9_]*)\s+=(.*)/g, "$1=$2");

    out.push(line);
  }

  s = out.join("\n");
  if (!s.endsWith("\n")) s += "\n";

  return s;
};
