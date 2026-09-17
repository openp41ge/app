/**
 * ReposWatcher — watches the repositories directory in the main process and
 * reports filesystem changes to renderer windows so the Explorer stays in sync
 * with external edits (deletes/creates/renames made outside the app).
 *
 * Uses Node's `fs.watch` with the recursive flag (kernel FSEvents on macOS,
 * ReadDirectoryChangesW on Windows). On platforms that don't support recursive
 * watching (Linux), it falls back to watching every directory in the tree
 * non-recursively and re-scanning for new directories as they appear.
 *
 * Events are debounced per path and filtered to skip high-noise subtrees such
 * as `.git`, `node_modules`, and build output that the Explorer doesn't show.
 */

import fs from "fs";
import path from "path";

/** Debounce per-path so bursty writes (a build, a multi-file save) coalesce. */
const DEBOUNCE_MS = 200;

/** Directories whose changes are not shown in the Explorer — skip entirely. */
const IGNORED_SUBPATH_SEGMENTS = [
  ".git",
  "node_modules",
  "dist",
  "build",
  "out",
  ".next",
  ".cache",
  ".venv",
  "__pycache__",
  "coverage",
  "target",
  ".turbo",
];

export class ReposWatcher {
  private _watchers = new Map<string, fs.FSWatcher>();
  private _debounces = new Map<string, NodeJS.Timeout>();
  private _rescanTimer: NodeJS.Timeout | null = null;
  private _started = false;
  private _closed = false;

  constructor(
    private readonly _root: string,
    private readonly _onChange: (changedPath: string) => void,
  ) {}

  /** Begin watching. Idempotent — safe to call multiple times. */
  start(): void {
    if (this._started || this._closed) return;
    this._started = true;
    try {
      fs.mkdirSync(this._root, { recursive: true });
    } catch {
      // Root dir may be unavailable (e.g. unmounted) — watch will retry next start.
    }
    this._watchRecursive();
  }

  /** Stop watching and cancel all pending events. */
  stop(): void {
    this._closed = true;
    for (const w of this._watchers.values()) {
      try {
        w.close();
      } catch {
        /* already closed */
      }
    }
    this._watchers.clear();
    for (const t of this._debounces.values()) clearTimeout(t);
    this._debounces.clear();
    if (this._rescanTimer) clearTimeout(this._rescanTimer);
  }

  // ── Recursive watch (macOS/Windows) ───────────────────────────────────

  private _watchRecursive(): void {
    try {
      const watcher = fs.watch(this._root, { recursive: true }, (_event, filename) => {
        const changed = filename ? path.resolve(this._root, filename.toString()) : this._root;
        this._schedule(changed);
      });
      watcher.on("error", () => {
        // Recursive not supported (Linux) — close and fall back to manual tree watch.
        try {
          watcher.close();
        } catch {
          /* ignore */
        }
        this._watchers.delete(this._root);
        this._watchTree();
      });
      this._watchers.set(this._root, watcher);
    } catch {
      this._watchTree();
    }
  }

  // ── Per-directory fallback (Linux) ────────────────────────────────────

  private _watchTree(): void {
    for (const dir of this._collectDirs(this._root)) {
      if (!this._watchers.has(dir)) this._addDirWatcher(dir);
    }
  }

  private _collectDirs(root: string): string[] {
    const out: string[] = [];
    const walk = (dir: string) => {
      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const e of entries) {
        if (e.isDirectory()) walk(path.join(dir, e.name));
      }
      out.push(dir);
    };
    walk(root);
    return out;
  }

  private _addDirWatcher(dir: string): void {
    try {
      const watcher = fs.watch(dir, (_event, filename) => {
        const changed = filename ? path.join(dir, filename.toString()) : dir;
        this._schedule(changed);
        // A change may have added a directory — rescan to watch it too.
        this._scheduleRescan();
      });
      watcher.on("error", () => {
        try {
          watcher.close();
        } catch {
          /* ignore */
        }
        this._watchers.delete(dir);
      });
      this._watchers.set(dir, watcher);
    } catch {
      /* directory disappeared or unreadable */
    }
  }

  private _scheduleRescan(): void {
    if (this._rescanTimer) return;
    this._rescanTimer = setTimeout(() => {
      this._rescanTimer = null;
      this._watchTree();
    }, DEBOUNCE_MS * 2);
  }

  // ── Event flow ────────────────────────────────────────────────────────

  private _schedule(changedPath: string): void {
    if (this._closed) return;
    if (!this._shouldReport(changedPath)) return;
    const key = changedPath;
    const existing = this._debounces.get(key);
    if (existing) clearTimeout(existing);
    this._debounces.set(
      key,
      setTimeout(() => {
        this._debounces.delete(key);
        if (this._closed) return;
        this._onChange(changedPath);
      }, DEBOUNCE_MS),
    );
  }

  /** Whether a changed path is worth reporting (skip git internals, node_modules, etc.). */
  private _shouldReport(changedPath: string): boolean {
    const rel = path.relative(this._root, changedPath);
    // A change to a repo root itself matters (a worktree folder created/deleted).
    if (!rel) return true;
    const segments = rel.split(path.sep);
    for (const seg of segments) {
      if (IGNORED_SUBPATH_SEGMENTS.includes(seg)) return false;
    }
    return true;
  }
}
