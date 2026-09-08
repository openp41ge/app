/**
 * explorer-filter — shared name/path filter helpers for the Explorer search.
 *
 * Used by both <openp41ge-worktree-tree> (repo names) and
 * <openp41ge-repo-tree-item> (worktree branches + file/dir names) so the regex
 * and match-case semantics match the content-match behaviour exactly.
 */

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Whether `name` passes the filter. An empty query always matches. An invalid
 * regex (when `regex` is true) matches nothing rather than throwing.
 */
export function matchesNameFilter(
  name: string,
  query: string,
  regex: boolean,
  caseSensitive: boolean,
): boolean {
  if (!query) return true;
  try {
    const re = new RegExp(regex ? query : escapeRegExp(query), caseSensitive ? "" : "i");
    return re.test(name);
  } catch {
    return false;
  }
}
