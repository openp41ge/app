/**
 * JSON formatter — parse and re-stringify with consistent 2-space indentation.
 */

import { type Formatter } from "../registry";

export const jsonFormatter: Formatter = (content: string): string => {
  const normalised = content.replace(/\r\n?/g, "\n").replace(/[ \t]+$/gm, "");
  try {
    const parsed = JSON.parse(normalised);
    return JSON.stringify(parsed, null, 2) + "\n";
  } catch {
    const cleaned = normalised.replace(/[ \t]+$/gm, "");
    return cleaned.endsWith("\n") ? cleaned : cleaned + "\n";
  }
};
