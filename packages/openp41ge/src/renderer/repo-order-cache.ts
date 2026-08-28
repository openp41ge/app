/**
 * Repo display order cache for the explorer.
 *
 * Repos are reordered by drag-and-drop in the explorer tree; the order is
 * persisted to localStorage so it survives reloads. The previous per-project
 * repo-order store (project:setRepoOrder IPC) was removed with the project
 * system, so a single app-wide order list lives here.
 */

const STORAGE_KEY = "openp41ge:repoOrder";

/** Cached across reads so we don't parse localStorage on every call. */
let cached: string[] | null = null;

function loadNames(): string[] {
  if (cached === null) {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      cached = raw ? (JSON.parse(raw) as string[]) : [];
    } catch {
      cached = [];
    }
  }
  return cached;
}

/** Persist the current repo display order. */
export function saveRepoOrder(names: string[]): void {
  cached = names;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(names));
  } catch {
    // ignore quota / private-mode errors — order still applies for this session
  }
}

/**
 * Reorder a fetched repo list to match the persisted order. Repos not in the
 * persisted list (e.g. newly added) keep their relative position at the end.
 */
export function applyRepoOrder<T extends { name: string }>(repos: T[]): T[] {
  const order = loadNames();
  if (order.length === 0) return repos;
  const rank = new Map(order.map((name, i) => [name, i]));
  return [...repos].sort((a, b) => {
    const ra = rank.get(a.name);
    const rb = rank.get(b.name);
    if (ra === undefined && rb === undefined) return 0;
    if (ra === undefined) return 1;
    if (rb === undefined) return -1;
    return ra - rb;
  });
}
