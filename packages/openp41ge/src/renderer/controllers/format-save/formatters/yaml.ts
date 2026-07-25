/**
 * YAML formatter — colon spacing, list item spacing, comment spacing,
 * trailing whitespace removal.
 */

import { type Formatter } from "../registry";

export const yamlFormatter: Formatter = (content: string): string => {
  let s = content.replace(/\r\n?/g, "\n");

  const lines = s.split("\n");
  const out: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    line = line.replace(/[ \t]+$/, "");

    if (line.length === 0 || line === "---" || line === "...") {
      out.push(line);
      continue;
    }

    line = line.replace(/(:\s*)([^\s#].*)/g, (_match, colon, rest) => {
      if (!rest.trim()) return colon;
      return `: ${rest.trimStart()}`;
    });

    line = line.replace(/^(\s*-)([^\s-].*)/g, (_m, dash, rest) => {
      return `${dash} ${rest.trimStart()}`;
    });

    line = line.replace(/(?<!["'])(#)([^\s{#].*)/g, (_m, hash, rest) => {
      return `${hash} ${rest.trimStart()}`;
    });

    out.push(line);
  }

  s = out.join("\n");
  if (!s.endsWith("\n")) s += "\n";

  return s;
};
