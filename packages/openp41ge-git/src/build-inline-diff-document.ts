/**
 * buildInlineDiffDocument — build a FULL-FILE diff document for the file
 * editor's read-only diff mode.
 *
 * The post-commit file content (`git show <hash>:<path>`) is merged with the
 * commit's hunks so the editor shows the ENTIRE file with the additions and
 * deletions injected at their positions:
 *   - every unchanged line is present verbatim (no cropping, no 3-line context
 *     truncation) — it is a "context" row with its new-file line number;
 *   - at each change the hunk's removed lines (red) and added lines (green)
 *     are injected in place, with their old|new line numbers;
 *   - each `@@` range renders as a muted header divider row.
 *
 * This mirrors VS Code's inline diff: the full file reads normally, changed
 * regions are highlighted green/red.
 */

import type { DiffDocument, DiffLine, SearchHunk } from "./types";

/** New side: `+N[,C]` immediately before the trailing `@@`. */
function parseNewRange(header: string): { start: number; count: number } {
  const m = /\+(\d+)(?:,(\d+))?\s+@@/.exec(header);
  if (!m) return { start: 1, count: 0 };
  return { start: Math.max(0, Number(m[1])), count: Math.max(0, Number(m[2] ?? 1)) };
}

/** Old side: the first `-N[,C]` in the header (normal diffs have one). */
function parseOldStart(header: string): number {
  const m = /@@\s+-(\d+)/.exec(header);
  return m ? Math.max(0, Number(m[1])) : 1;
}

/** Split file content into lines, dropping the single trailing "\n" artifact. */
function splitLines(content: string): string[] {
  if (!content) return [];
  const lines = content.split("\n");
  if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  return lines;
}

export function buildInlineDiffDocument(
  fileContent: string,
  hunks: SearchHunk[],
): DiffDocument {
  const rows: DiffLine[] = [];
  const fileLines = splitLines(fileContent ?? "");
  const fileLen = fileLines.length;
  // Cursor into the NEW-side file: indices below it are already emitted.
  let cursor = 0;

  for (const hunk of hunks ?? []) {
    const { start: newStart, count: newCount } = parseNewRange(hunk.header);
    const hunkShift = newStart - 1; // 1-based start -> 0-based index

    // Full unchanged content before this hunk's new range — never cropped.
    if (hunkShift > cursor) {
      const end = Math.min(hunkShift, fileLen);
      for (let i = cursor; i < end; i++) {
        rows.push({ type: "context", text: fileLines[i], newLine: i + 1 });
      }
    }

    // Muted range header divider.
    if (hunk.header) rows.push({ type: "header", text: hunk.header });

    // The change itself: removed (red) / added (green) injected in git's
    // old-file order, context neutral. Line-number cursors advance per type.
    let oldC = newStart > 0 ? parseOldStart(hunk.header) : 1;
    let newC = newStart;
    for (const line of hunk.lines ?? []) {
      const text = line.text;
      if (line.type === "+") {
        rows.push({ type: "added", text, newLine: newC });
        newC += 1;
      } else if (line.type === "-") {
        rows.push({ type: "removed", text, oldLine: oldC });
        oldC += 1;
      } else {
        rows.push({ type: "context", text, oldLine: oldC, newLine: newC });
        oldC += 1;
        newC += 1;
      }
    }

    // Consume the hunk's new-side span (even if the file is shorter than the
    // range claims — clamp so the tail still prints).
    cursor = Math.max(cursor, Math.min(hunkShift + newCount, fileLen));
  }

  // Remaining full content after the last hunk — never cropped.
  for (let i = cursor; i < fileLen; i++) {
    rows.push({ type: "context", text: fileLines[i], newLine: i + 1 });
  }

  return { lines: rows };
}
