/**
 * buildInlineDiffFile — merge full post-commit file content with git hunks into
 * ONE inline-diff document for the file editor.
 *
 * The returned `text` is the ENTIRE file at the commit with the removed lines
 * spliced back in at their positions, forming a normal loadable buffer (real
 * line numbers, scroll, find — and crucially full syntax highlighting). `rows`
 * decorates that buffer for the editor:
 *   - "added"   → the real line is a commit addition (green row),
 *   - "removed" → a synthetic row re-injecting a deleted line (red row),
 *   - "context" → unchanged (plain).
 *
 * `fileLine` holds the REAL new-file 1-based line number for context/added
 * rows (null for removed rows), so the gutter shows the file's true numbers
 * even though removed rows occupy buffer rows too.
 *
 * No `@@` section headers are produced — this is the file itself, not a diff.
 */

import type { SearchHunk } from "./types";

/** One rendered row of an inline-diff buffer. */
export interface InlineDiffRow {
  readonly kind: "context" | "added" | "removed";
  /** Real new-file line number (1-based); null for removed (synthetic) rows. */
  readonly fileLine: number | null;
}

/** A full-file inline diff: the merged document plus per-line decorations. */
export interface InlineDiffFile {
  /** Document to load into the editor (full file + removed lines spliced). */
  readonly text: string;
  /** One entry per line of `text`, in document order. */
  readonly rows: readonly InlineDiffRow[];
}

/** New side of a `@@` header: `+N[,C]` immediately before the trailing `@@`. */
function parseNewRange(header: string): { start: number; count: number } {
  const m = /\+(\d+)(?:,(\d+))?\s+@@/.exec(header);
  if (!m) return { start: 1, count: 0 };
  return { start: Math.max(0, Number(m[1])), count: Math.max(0, Number(m[2] ?? 1)) };
}

/** Split file content into lines, dropping the single trailing "\n" artifact. */
function splitLines(content: string): string[] {
  if (!content) return [];
  const lines = content.split("\n");
  if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  return lines;
}

interface MergedLine {
  readonly kind: "context" | "added" | "removed";
  readonly text: string;
  readonly fileLine: number | null;
}

export function buildInlineDiffFile(
  fileContent: string | null | undefined,
  hunks: readonly SearchHunk[] | null | undefined,
): InlineDiffFile {
  const fileLines = splitLines(fileContent ?? "");
  const fileLen = fileLines.length;
  const sorted = [...(hunks ?? [])].sort((a, b) => {
    const sa = parseNewRange(a.header).start;
    const sb = parseNewRange(b.header).start;
    return sa - sb || (a.header < b.header ? -1 : a.header > b.header ? 1 : 0);
  });

  const merged: MergedLine[] = [];
  // Cursor into the NEW-side file: lines below it are already emitted.
  let newCursor = 1; // 1-based

  for (const hunk of sorted) {
    const hunkStart = parseNewRange(hunk.header).start;

    // Full unchanged run BEFORE this hunk's new range — never cropped.
    const gapFrom = Math.min(newCursor, fileLen + 1);
    const gapTo = Math.min(hunkStart, fileLen + 1);
    for (let i = gapFrom; i < gapTo; i++) {
      merged.push({ kind: "context", text: fileLines[i - 1], fileLine: i });
    }
    // Advance past the gap (or clamp if the hunk overlaps/starts earlier).
    newCursor = Math.max(newCursor, Math.min(hunkStart, fileLen + 1));

    // The change: walk the hunk's own line order (context/removed/added as git
    // emits them) so deleted rows sit exactly where the old file had them —
    // straight before their green replacement, after any leading context.
    for (const line of hunk.lines ?? []) {
      const text = line.text;
      if (line.type === "-") {
        merged.push({ kind: "removed", text, fileLine: null });
      } else if (line.type === "+") {
        merged.push({ kind: "added", text: fileLines[newCursor - 1] ?? textOf(text), fileLine: newCursor });
        if (newCursor <= fileLen) newCursor += 1;
      } else {
        merged.push({ kind: "context", text: fileLines[newCursor - 1] ?? textOf(text), fileLine: newCursor });
        if (newCursor <= fileLen) newCursor += 1;
      }
    }
  }

  // Remaining full content after the last hunk — never cropped.
  for (let i = newCursor; i <= fileLen; i++) {
    merged.push({ kind: "context", text: fileLines[i - 1], fileLine: i });
  }

  const text = merged.map((l) => l.text).join("\n");
  const rows: InlineDiffRow[] = merged.map(({ kind, fileLine }) => ({ kind, fileLine }));
  return { text, rows };
}

/** Guard against an undefined hunk line text. */
function textOf(t: string): string {
  return t ?? "";
}
