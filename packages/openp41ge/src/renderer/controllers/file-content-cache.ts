/**
 * File-content cache.
 *
 * Pre-reads the first 1 KB of visible files in the file tree so that
 * clicking a file shows content from memory instantly.  The remainder of
 * the file is loaded in the background after the first paint.
 */

// ─── Cache ────────────────────────────────────────────────────────────────

const CACHE = new Map<string, string>();

const CHUNK_SIZE = 1024; // 1 KB — enough for an instant first paint

// ─── API ──────────────────────────────────────────────────────────────────

/** Store a cached chunk for a file path. */
export function cacheFileChunk(path: string, chunk: string): void {
  CACHE.set(path, chunk);
}

/**
 * Retrieve and remove a cached chunk for a file path.
 * Returns `null` when nothing is cached for that path.
 */
export function consumeCachedChunk(path: string): string | null {
  const chunk = CACHE.get(path) ?? null;
  if (chunk !== null) CACHE.delete(path);
  return chunk;
}

/** Clear the entire cache. */
export function clearFileCache(): void {
  CACHE.clear();
}

/**
 * Preload the first 1 KB of all visible file rows inside the given
 * container element.  Runs asynchronously and never throws — failures
 * are silently ignored.
 *
 * Uses a concurrency limit of 4 to avoid flooding the main process
 * with concurrent IPC calls when many files are visible.
 */
export function preloadVisibleFiles(container: HTMLElement): void {
  const fileRows = container.querySelectorAll<HTMLElement>('[data-type="file"][data-path]');
  const paths: string[] = [];
  for (const row of fileRows) {
    const p = row.dataset.path;
    if (p && !CACHE.has(p)) paths.push(p);
  }

  const MAX_CONCURRENCY = 4;
  let i = 0;

  function next(): void {
    if (i >= paths.length) return;
    const path = paths[i++];
    if (CACHE.has(path)) {
      next();
      return;
    }
    window.openp41ge.file
      .readRange(path, 0, CHUNK_SIZE)
      .then((result) => {
        if (result && result.data.length > 0) {
          CACHE.set(path, result.data);
        }
      })
      .catch(() => {
        // Silently ignore read errors during preload
      })
      .finally(() => {
        next();
      });
  }

  for (let slot = 0; slot < MAX_CONCURRENCY; slot++) {
    next();
  }
}
