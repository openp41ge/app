/**
 * hunksToDiffDocument — convert git `SearchHunk[]` (as returned by the
 * `getCommitFileHunks` IPC) into a renderable `DiffDocument` for the file
 * editor's read-only diff view.
 *
 * Each hunk header `@@ -oldStart[,oldCount] +newStart[,newCount] @@` seeds a
 * pair of cursors; walking the hunk's lines advances them:
 *   - " " context → old and new, in lockstep;
 *   - "+" added   → advances new only;
 *   - "-" removed → advances old only.
 *
 * Line numbers are 1-based. A `0` start (a freshly added or wholly removed
 * file) yields no numbers for that side. `@@` headers become standalone
 * "header" rows so the diff reads like a unified patch.
 */

import type { DiffDocument, DiffLine, SearchHunk } from "./types";

/**
 * Parse the leading numeric ranges of a hunk header.
 * `@@ -808,15 +771,20 @@ context...` → { oldStart: 808, newStart: 771 }.
 * Returns starts defaulting to 1 (a header without counts still starts there).
 */
function parseHunkRanges(header: string): { oldStart: number; newStart: number } {
  // Match the git unified-diff range syntax (old and new are both optional in
  // count): /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/
  const m = /^@@\s+-(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?\s+@@/.exec(header);
  if (!m) return { oldStart: 1, newStart: 1 };
  const oldStart = Number(m[1]);
  const newStart = Number(m[3]);
  return { oldStart: Math.max(0, oldStart), newStart: Math.max(0, newStart) };
}

export function hunksToDiffDocument(hunks: SearchHunk[]): DiffDocument {
  const lines: DiffLine[] = [];
  for (const hunk of hunks ?? []) {
    if (hunk.header) {
      lines.push({ type: "header", text: hunk.header });
    }
    const { oldStart, newStart } = parseHunkRanges(hunk.header);
    let old = oldStart;
    let new_ = newStart;
    for (const line of hunk.lines ?? []) {
      const text = line.text;
      if (line.type === "+") {
        lines.push({ type: "added", text, newLine: new_ });
        new_ += 1;
      } else if (line.type === "-") {
        lines.push({ type: "removed", text, oldLine: old });
        old += 1;
      } else {
        lines.push({
          type: "context",
          text,
          oldLine: old,
          newLine: new_,
        });
        old += 1;
        new_ += 1;
      }
    }
  }
  return { lines };
}
