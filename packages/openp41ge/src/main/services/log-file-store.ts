/**
 * LogFileStore — persists the structured log bus to disk as JSONL.
 *
 * Files live under `<baseDir>/logs/` (default `~/.openp41ge/logs`):
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

const log = createLogger("LogFileStore");

export interface LogFileInfo {
  name: string;
  sizeBytes: number;
  mtimeMs: number;
}

export interface PersistedLogEntry {
  timestamp: number;
  level: LogLevel;
  levelLabel: string;
  source: string;
  message: string;
  data?: Record<string, unknown>;
  process: "main" | "renderer";
  winId?: string;
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
