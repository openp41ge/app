/**
 * content-search — pure full-text content matching for the Explorer search.
 *
 * This module only matches a query against an in-memory string; it performs no
 * filesystem I/O. The IPC handler (`file:searchContents`) is responsible for
 * walking roots and reading text files, then delegating to `findMatchesInText`.
 *
 * Keeping the matching logic pure makes it unit-testable without a filesystem.
 */

export interface ContentMatchOptions {
  /** Treat the query as a regular expression. */
  regex?: boolean;
  /** Case-sensitive matching (default false, i.e. case-insensitive). */
  caseSensitive?: boolean;
}

export interface FileContentMatch {
  /** 1-based line number. */
  lineNumber: number;
  /** 1-based column of the first matching character. */
  column: number;
  /** 0-based offset of the match start within the line. */
  startIndex: number;
  /** 0-based offset of the match end (exclusive) within the line. */
  endIndex: number;
  /** The full (untrimmed) line containing the match, without the trailing \r. */
  lineText: string;
}

/** Escape regex metacharacters so a literal query is matched exactly. */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Find every match of `query` in `text`.
 *
 * An empty query returns `[]`. An invalid regex (when `regex` is on) also
 * returns `[]` rather than throwing. Zero-length matches are skipped to avoid
 * an infinite loop.
 */
export function findMatchesInText(
  text: string,
  query: string,
  options: ContentMatchOptions = {},
): FileContentMatch[] {
  if (!query) return [];
  const flags = options.caseSensitive ? "g" : "gi";
  let re: RegExp;
  try {
    re = new RegExp(options.regex ? query : escapeRegExp(query), flags);
  } catch {
    return []; // invalid regex → no matches
  }

  // Precompute line-start offsets (index just after each '\n').
  const lineStarts: number[] = [0];
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) === 10) lineStarts.push(i + 1);
  }

  const matches: FileContentMatch[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m[0].length === 0) {
      re.lastIndex++;
      continue;
    }
    const idx = m.index;

    // Find the line containing idx via binary search over lineStarts.
    let lo = 0;
    let hi = lineStarts.length - 1;
    let lineIdx = 0;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (lineStarts[mid] <= idx) {
        lineIdx = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }

    const lineStart = lineStarts[lineIdx];
    let lineEnd = text.indexOf("\n", idx);
    if (lineEnd === -1) lineEnd = text.length;
    const lineText = text.slice(lineStart, lineEnd).replace(/\r$/, "");

    matches.push({
      lineNumber: lineIdx + 1,
      column: idx - lineStart + 1,
      startIndex: idx - lineStart,
      endIndex: idx - lineStart + m[0].length,
      lineText,
    });
  }

  return matches;
}
