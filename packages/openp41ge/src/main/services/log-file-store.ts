/**
 * LogFileStore — persists the structured log bus to disk as JSONL.
 *
 * Files live under `<baseDir>/logs/` (default `~/.openp41ge/logs`; dev build
 * `~/.openp41ge-dev/logs`):
 *   - `openp41ge.log`            — the live day's file (stable name for `tail -f`)
 *   - `openp41ge-YYYY-MM-DD.log` — archived previous days, pruned after
 *                                   retentionDays (default 14)
 *
 * Renderer entries arrive over IPC (`log:append`); main-process entries arrive
 * from the shared log bus via `subscribeLogs`. Everything lands in the same
 * file set, tagged by `process` / `winId` for cross-window correlation.
 */

import fs from "fs";
import path from "path";
import {
  LogLevel,
  LOG_LEVEL_LABELS,
  createLogger,
  type LogQuery,
  type StoredLogEntry,
} from "openp41ge-logger";

const log = createLogger("openp41ge", "LogFileStore");

export interface LogFileInfo {
  name: string;
  sizeBytes: number;
  mtimeMs: number;
}

export interface PersistedLogEntry {
  timestamp: number;
  level: LogLevel;
  levelLabel: string;
  system: string;
  source: string;
  message: string;
  data?: Record<string, unknown>;
  process: "main" | "renderer";
  winId?: string;
}

/** Cursor for backward paging through the daily log files. */
export interface LogBackCursor {
  /** Index into `listFiles()` (0 = newest file). */
  fileIndex: number;
  /** Raw lines already served from that file's bottom. */
  lineCount: number;
}

export interface LogBackPage {
  /** Entries in this window, oldest → newest. */
  entries: PersistedLogEntry[];
  /** True if more (older) entries are available **within the current file**. */
  hasOlder: boolean;
  /** Cursor to continue older within the current file; `null` when none. */
  cursor: LogBackCursor | null;
  /**
   * Set when `hasOlder` is false and an **older day** exists: the reader must
   * not silently cross the day boundary. Load it only after explicit
   * confirmation (the viewer renders a "Load yesterday's logs" row).
   */
  nextDay?: { cursor: LogBackCursor; label: string } | null;
}

const LIVE_FILE = "openp41ge.log";
const MS_PER_DAY = 86_400_000;

function _dayString(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export class LogFileStore {
  private readonly _logsDir: string;
  private readonly _retentionDays: number;
  /** Calendar day currently being written to the live file ('' = none yet). */
  private _liveDay = "";
  /** Guards against the log-bus → append → log → append loop on write errors. */
  private _inWrite = false;

  constructor(baseDir: string, retentionDays = 14) {
    this._logsDir = path.join(baseDir, "logs");
    this._retentionDays = Math.max(1, retentionDays);
  }

  get logsDir(): string {
    return this._logsDir;
  }

  private get _livePath(): string {
    return path.join(this._logsDir, LIVE_FILE);
  }

  // ── Writing ─────────────────────────────────────────────────────────

  private _ensureDir(): void {
    if (!fs.existsSync(this._logsDir)) {
      fs.mkdirSync(this._logsDir, { recursive: true });
    }
  }

  private _rollOverIfNeeded(): void {
    const today = _dayString(new Date());
    if (this._liveDay === today) return;
    this._ensureDir();

    if (fs.existsSync(this._livePath)) {
      try {
        const mtimeDay = _dayString(new Date(fs.statSync(this._livePath).mtimeMs));
        // Same-day restart: keep appending to the existing live file.
        // New calendar day: archive the live file, naming it by its own day.
        if (mtimeDay !== today) {
          const archiveDay = this._liveDay || mtimeDay;
          const archivePath = path.join(this._logsDir, `openp41ge-${archiveDay}.log`);
          if (!fs.existsSync(archivePath)) {
            fs.renameSync(this._livePath, archivePath);
          } else {
            // Rare: archive already exists — append live into it, then drop it.
            fs.appendFileSync(archivePath, fs.readFileSync(this._livePath, "utf-8"), "utf-8");
            fs.rmSync(this._livePath, { force: true });
          }
        }
      } catch {
        // Archive rollover is best-effort; keep writing to the live file.
      }
    }

    this._liveDay = today;
    this._pruneArchives();
  }

  private _serialize(entry: StoredLogEntry): string {
    const line: Record<string, unknown> = {
      timestamp: entry.timestamp,
      level: LOG_LEVEL_LABELS[entry.level],
      system: entry.system,
      source: entry.source,
      message: entry.message,
      process: entry.process,
    };
    if (entry.data !== undefined && entry.data !== null) {
      line.data = entry.data;
    }
    if (entry.winId) {
      line.winId = entry.winId;
    }
    return JSON.stringify(line);
  }

  /** Append a single entry (main-process bus subscription). */
  append(entry: StoredLogEntry): void {
    if (!entry || this._inWrite) return;
    this._inWrite = true;
    try {
      this._rollOverIfNeeded();
      fs.appendFileSync(this._livePath, this._serialize(entry) + "\n", "utf-8");
    } catch (err) {
      // Never let persistence take down the app.
      log.error("[LogFileStore] append failed:", err);
    } finally {
      this._inWrite = false;
    }
  }

  /** Append a batch of entries (renderer IPC flush). */
  appendBatch(entries: readonly StoredLogEntry[]): void {
    if (!entries || entries.length === 0 || this._inWrite) return;
    this._inWrite = true;
    try {
      this._rollOverIfNeeded();
      const lines = entries.map((e) => this._serialize(e)).join("\n") + "\n";
      fs.appendFileSync(this._livePath, lines, "utf-8");
    } catch (err) {
      log.error("[LogFileStore] appendBatch failed:", err);
    } finally {
      this._inWrite = false;
    }
  }

  // ── Retention ───────────────────────────────────────────────────────

  private _pruneArchives(): void {
    const cutoff = Date.now() - this._retentionDays * MS_PER_DAY;
    let files: string[];
    try {
      files = fs.readdirSync(this._logsDir);
    } catch {
      return;
    }
    for (const name of files) {
      if (!name.startsWith("openp41ge-") || name === LIVE_FILE) continue;
      try {
        const p = path.join(this._logsDir, name);
        if (fs.statSync(p).mtimeMs < cutoff) {
          fs.rmSync(p, { force: true });
        }
      } catch {
        // ignore
      }
    }
  }

  // ── Reading (agent + overlay queries) ────────────────────────────────

  /** List log files in the logs dir (newest mtime first). */
  listFiles(): LogFileInfo[] {
    this._ensureDir();
    try {
      return fs
        .readdirSync(this._logsDir)
        .filter((name) => name.startsWith("openp41ge") && name.endsWith(".log"))
        .map((name) => {
          const p = path.join(this._logsDir, name);
          const st = fs.statSync(p);
          return { name, sizeBytes: st.size, mtimeMs: st.mtimeMs };
        })
        .sort((a, b) => b.mtimeMs - a.mtimeMs);
    } catch {
      return [];
    }
  }

  private _parseLine(line: string): PersistedLogEntry | null {
    try {
      const raw = JSON.parse(line) as Record<string, unknown>;
      const levelLabel = String(raw.level ?? "INFO").toUpperCase();
      const levelIdx = Object.keys(LOG_LEVEL_LABELS).indexOf(levelLabel);
      return {
        timestamp: typeof raw.timestamp === "number" ? raw.timestamp : Date.now(),
        level: levelIdx >= 0 ? levelIdx : LogLevel.INFO,
        levelLabel,
        system: String(raw.system ?? "unknown"),
        source: String(raw.source ?? "unknown"),
        message: String(raw.message ?? ""),
        ...(raw.data !== undefined ? { data: raw.data as Record<string, unknown> } : {}),
        process: raw.process === "main" ? "main" : "renderer",
        ...(typeof raw.winId === "string" ? { winId: raw.winId } : {}),
      };
    } catch {
      return null;
    }
  }

  private _readLines(fileName: string): string[] {
    try {
      const content = fs.readFileSync(path.join(this._logsDir, fileName), "utf-8");
      return content.split("\n").filter((l) => l.trim().length > 0);
    } catch {
      return [];
    }
  }

  /**
   * Human label for the confirmation row shown at a day boundary.
   *
   * Files are newest-first, so the file at `fileIndex` is normally `fileIndex`
   * days old. When the name embeds a `YYYY-MM-DD` date, that is used to compute
   * an exact age; otherwise the index is the fallback.
   */
  private _dayBoundaryLabel(fileName: string, fileIndex: number): string {
    let daysAgo = fileIndex;
    const m = /openp41ge-(\d{4}-\d{2}-\d{2})\.log$/.exec(fileName);
    if (m) {
      const fileDate = new Date(`${m[1]}T00:00:00`);
      const today = new Date(`${_dayString(new Date())}T00:00:00`);
      if (!Number.isNaN(fileDate.getTime())) {
        const diff = Math.round((today.getTime() - fileDate.getTime()) / MS_PER_DAY);
        if (diff > 0) daysAgo = diff;
      }
    }
    if (daysAgo === 1) return "Load yesterday's logs";
    return `Load logs from ${daysAgo} days ago`;
  }

  /**
   * Read log entries **backward**, strictly **within a single daily file**.
   *
   * Starts at the bottom of the file at `cursor.fileIndex` (0 = newest) and
   * returns up to `limit` entries (oldest → newest), plus a cursor to continue
   * loading older lines **from that same file**. When the file is exhausted,
   * `hasOlder` is `false` and, if an older day exists, `nextDay` is set — the
   * reader must not silently cross the day boundary; it loads that file only
   * after explicit confirmation.
   *
   * `cursor === null` means "start at the very end of the newest file".
   */
  readLogsBackward(cursor: LogBackCursor | null, limit = 200): LogBackPage {
    const files = this.listFiles(); // newest first
    if (files.length === 0) {
      return { entries: [], hasOlder: false, cursor: null, nextDay: null };
    }
    const want = Math.max(1, Math.floor(limit));
    const fileIndex = cursor ? Math.max(0, Math.min(cursor.fileIndex, files.length - 1)) : 0;
    const lineCount = cursor ? Math.max(0, cursor.lineCount) : 0;

    const lines = this._readLines(files[fileIndex].name);
    const total = lines.length;

    // Current file fully consumed → expose the older day as a confirmable
    // boundary, rather than silently crossing into it.
    if (lineCount >= total) {
      const nextIndex = fileIndex + 1;
      if (nextIndex < files.length) {
        return {
          entries: [],
          hasOlder: false,
          cursor: null,
          nextDay: {
            cursor: { fileIndex: nextIndex, lineCount: 0 },
            label: this._dayBoundaryLabel(files[nextIndex].name, nextIndex),
          },
        };
      }
      return { entries: [], hasOlder: false, cursor: null, nextDay: null };
    }

    const end = total - lineCount; // raw lines already served
    const start = Math.max(0, end - want);
    const entries: PersistedLogEntry[] = [];
    for (let i = start; i < end; i++) {
      const entry = this._parseLine(lines[i]);
      if (entry) entries.push(entry);
    }
    const newLineCount = lineCount + (end - start);
    const hasMoreInFile = newLineCount < total;
    const hasOlder = hasMoreInFile;
    const nextDay = hasOlder
      ? null
      : fileIndex + 1 < files.length
        ? {
            cursor: { fileIndex: fileIndex + 1, lineCount: 0 },
            label: this._dayBoundaryLabel(files[fileIndex + 1].name, fileIndex + 1),
          }
        : null;
    return {
      entries,
      hasOlder,
      cursor: hasOlder ? { fileIndex, lineCount: newLineCount } : null,
      nextDay,
    };
  }

  /**
   * Query persisted log entries across the most recent files (newest first,
   * within a file oldest → newest). Returns matches in read order;
   * `limit` caps the result set to the first N matches.
   */
  query(filter: LogQuery = {}): PersistedLogEntry[] {
    const sources = filter.source
      ? new Set(Array.isArray(filter.source) ? filter.source : [filter.source])
      : null;
    const minLevel = filter.minLevel ?? LogLevel.DEBUG;
    const maxLevel = filter.maxLevel ?? LogLevel.ERROR;
    const search = filter.search?.trim().toLowerCase();

    const files = this.listFiles().slice(0, 8);
    const collected: PersistedLogEntry[] = [];

    for (const file of files) {
      let content = "";
      try {
        content = fs.readFileSync(path.join(this._logsDir, file.name), "utf-8");
      } catch {
        continue;
      }
      for (const line of content.split("\n")) {
        if (!line.trim()) continue;
        const entry = this._parseLine(line);
        if (!entry) continue;
        if (sources && !sources.has(entry.source)) continue;
        if (entry.level < minLevel || entry.level > maxLevel) continue;
        if (filter.since !== undefined && entry.timestamp < filter.since) continue;
        if (filter.before !== undefined && entry.timestamp > filter.before) continue;
        if (filter.process !== undefined && entry.process !== filter.process) continue;
        if (filter.winId !== undefined && entry.winId !== filter.winId) continue;
        if (search) {
          const haystack = `${entry.source} ${entry.message}`.toLowerCase();
          if (!haystack.includes(search)) continue;
        }
        collected.push(entry);
        if (filter.limit !== undefined && filter.limit > 0 && collected.length >= filter.limit) {
          return collected;
        }
      }
    }

    return collected;
  }
}
