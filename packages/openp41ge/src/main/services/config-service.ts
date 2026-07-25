/**
 * ConfigService — reads/writes ~/.openp41ge/.config/config.json from the main process.
 *
 * The .config directory is dot-prefixed so it doesn't appear as a project
 * in ~/.openp41ge/ (projects are direct subdirectories like ~/.openp41ge/myproject/).
 *
 * On startup:
 * - If the file exists, it is read and parsed.
 * - If the file is missing, a config with defaults is created.
 * - External edits are detected via fs.watchFile.
 *
 * Write strategy: atomic write (temp file + rename) to prevent corruption.
 */

import fs from "fs";
import path from "path";
import os from "os";
import { createLogger } from "openp41ge-logger";

const log = createLogger("ConfigService");

// ─── Default config ──────────────────────────────────────────────────────

export interface UserConfig {
  version: number;
  appTheme: "dark" | "light";
  editor: {
    lineHeight: number;
    fontSize: number;
    fontFamily: string;
  };
  syntaxThemes: Record<string, string>;
}

const DEFAULT_CONFIG: UserConfig = {
  version: 1,
  appTheme: "dark",
  editor: {
    lineHeight: 20,
    fontSize: 14,
    fontFamily: "'Cascadia Code', 'Fira Code', 'JetBrains Mono', 'Consolas', monospace",
  },
  syntaxThemes: {
    ".ts": "openp41ge-dark",
    ".tsx": "openp41ge-dark",
    ".js": "openp41ge-dark",
    ".jsx": "openp41ge-dark",
    ".json": "openp41ge-dark",
    ".md": "github-dark",
    ".css": "openp41ge-dark",
    ".html": "openp41ge-dark",
    ".yaml": "openp41ge-dark",
    ".sh": "openp41ge-dark",
  },
};

// ─── Helper: deep merge ──────────────────────────────────────────────────

function deepMerge<T extends Record<string, unknown>>(base: T, override: Partial<T>): T {
  const result = { ...base };
  for (const key of Object.keys(override) as (keyof T)[]) {
    const val = override[key];
    if (val !== undefined && val !== null) {
      if (
        typeof val === "object" &&
        !Array.isArray(val) &&
        typeof result[key] === "object" &&
        !Array.isArray(result[key])
      ) {
        result[key] = deepMerge(
          result[key] as unknown as Record<string, unknown>,
          val as unknown as Record<string, unknown>,
        ) as unknown as T[keyof T];
      } else {
        result[key] = val as T[keyof T];
      }
    }
  }
  return result;
}

// ─── ConfigService ───────────────────────────────────────────────────────

export class ConfigService {
  private _config: UserConfig = { ...DEFAULT_CONFIG };
  private _configPath: string;
  private _configDir: string;
  private _watchHandle: fs.FSWatcher | null = null;
  private _changeListeners = new Set<(config: UserConfig) => void>();

  /** Allow OPENP41GE_DIR override (used in tests). */
  constructor(openp41geDir?: string) {
    const baseDir = openp41geDir ?? path.join(os.homedir(), ".openp41ge");
    this._configDir = path.join(baseDir, ".config");
    this._configPath = path.join(this._configDir, "config.json");
  }

  /** Load config from disk on startup. Creates with defaults if missing. */
  init(): void {
    try {
      if (!fs.existsSync(this._configDir)) {
        fs.mkdirSync(this._configDir, { recursive: true });
      }

      if (fs.existsSync(this._configPath)) {
        const raw = fs.readFileSync(this._configPath, "utf-8");
        const parsed = JSON.parse(raw) as Partial<UserConfig>;
        this._config = deepMerge({ ...DEFAULT_CONFIG }, parsed);
      } else {
        this._writeAtomic(this._config);
      }

      this._watch();
    } catch (err) {
      log.error("init error:", err);
      this._config = { ...DEFAULT_CONFIG };
    }
  }

  /** Get the entire config or a specific key (dot-separated). */
  get(key?: string): unknown {
    if (!key) return this._config;
    return this._resolveKey(key);
  }

  /** Get the entire config object. */
  getAll(): UserConfig {
    return this._config;
  }

  /** Set a config key (dot-separated) and persist to disk. */
  set(key: string, value: unknown): void {
    const keys = key.split(".");
    let obj: Record<string, unknown> = this._config as unknown as Record<string, unknown>;
    for (let i = 0; i < keys.length - 1; i++) {
      if (!obj[keys[i]] || typeof obj[keys[i]] !== "object") {
        obj[keys[i]] = {};
      }
      obj = obj[keys[i]] as Record<string, unknown>;
    }
    obj[keys[keys.length - 1]] = value;
    this._writeAtomic(this._config);
    this._notify();
  }

  /** Subscribe to config changes. Returns unsubscribe function. */
  onChange(callback: (config: UserConfig) => void): () => void {
    this._changeListeners.add(callback);
    return () => this._changeListeners.delete(callback);
  }

  /** Destroy — stop file watcher, clear listeners. */
  destroy(): void {
    if (this._watchHandle) {
      this._watchHandle.close();
      this._watchHandle = null;
    }
    this._changeListeners.clear();
  }

  // ── Private ──────────────────────────────────────────────────────────

  private _resolveKey(key: string): unknown {
    const keys = key.split(".");
    let obj: unknown = this._config;
    for (const k of keys) {
      if (obj === null || obj === undefined) return undefined;
      if (typeof obj === "object" && k in (obj as Record<string, unknown>)) {
        obj = (obj as Record<string, unknown>)[k];
      } else {
        return undefined;
      }
    }
    return obj;
  }

  /** Atomic write: write to temp file, then rename. */
  private _writeAtomic(config: UserConfig): void {
    try {
      if (!fs.existsSync(this._configDir)) {
        fs.mkdirSync(this._configDir, { recursive: true });
      }
      const tmpPath = this._configPath + ".tmp";
      fs.writeFileSync(tmpPath, JSON.stringify(config, null, 2), "utf-8");
      fs.renameSync(tmpPath, this._configPath);
    } catch (err) {
      log.error("write error:", err);
    }
  }

  /** Watch for external file changes. */
  private _watch(): void {
    try {
      if (!fs.existsSync(this._configPath)) return;
      // Use watchFile for cross-platform compatibility
      fs.watchFile(this._configPath, { interval: 2000 }, (curr, prev) => {
        if (curr.mtimeMs !== prev.mtimeMs || curr.size !== prev.size) {
          try {
            const raw = fs.readFileSync(this._configPath, "utf-8");
            const parsed = JSON.parse(raw) as Partial<UserConfig>;
            this._config = deepMerge({ ...DEFAULT_CONFIG }, parsed);
            this._notify();
          } catch {
            // Ignore parse errors during rapid writes
          }
        }
      });
    } catch (err) {
      log.error("watch error:", err);
    }
  }

  private _notify(): void {
    for (const fn of this._changeListeners) {
      try {
        fn(this._config);
      } catch (err) {
        log.error("listener error:", err);
      }
    }
  }
}
