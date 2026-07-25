/**
 * Renderer-side ConfigService — loads config on startup, caches in memory,
 * provides typed accessors, emits events on change.
 *
 * On mount, calls window.openp41ge.config.getAll() to populate the cache.
 * Changes are debounced and re-fetched from the main process.
 */

import { createLogger } from "openp41ge-logger";

const log = createLogger("config-service");

// ─── Config type (mirrors main process types) ────────────────────────────

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

// ─── ConfigService ───────────────────────────────────────────────────────

export class ConfigService {
  private _config: UserConfig | null = null;
  private _loaded = false;
  private _loadPromise: Promise<void> | null = null;
  private _changeListeners = new Set<(config: UserConfig) => void>();
  private _keyListeners = new Map<string, Set<(value: unknown) => void>>();

  /** Load config from the main process via IPC. Idempotent — safe to call early. */
  async load(): Promise<void> {
    if (this._loadPromise) return this._loadPromise;
    this._loadPromise = this._doLoad();
    return this._loadPromise;
  }

  private async _doLoad(): Promise<void> {
    try {
      const raw = await window.openp41ge.config.getAll();
      this._config = raw as UserConfig;
      this._loaded = true;
      log.info("config loaded");
    } catch (err) {
      log.error("failed to load config:", err);
      this._loaded = false;
    }
  }

  /** Whether config has been loaded from the main process. */
  get loaded(): boolean {
    return this._loaded;
  }

  /** Get a specific key (dot-separated, e.g., "editor.fontSize"). */
  get(key: string): unknown {
    if (!this._config) return undefined;
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

  /** Get the entire config object. */
  getAll(): UserConfig | null {
    return this._config;
  }

  /** Set a config key (dot-separated) via IPC, updates cache, emits events. */
  async set(key: string, value: unknown): Promise<void> {
    try {
      await window.openp41ge.config.set(key, value);
      // Update local cache
      const keys = key.split(".");
      if (this._config) {
        let obj = this._config as unknown as Record<string, unknown>;
        for (let i = 0; i < keys.length - 1; i++) {
          if (!obj[keys[i]] || typeof obj[keys[i]] !== "object") {
            obj[keys[i]] = {};
          }
          obj = obj[keys[i]] as Record<string, unknown>;
        }
        obj[keys[keys.length - 1]] = value;
      }
      // Notify
      this._notifyAll();
      this._notifyKey(key, value);
      // Dispatch DOM event for cross-component communication
      document.dispatchEvent(
        new CustomEvent("openp41ge:config-changed", {
          detail: { key, value },
          bubbles: true,
          composed: true,
        }),
      );
    } catch (err) {
      log.error(`failed to set config key "${key}":`, err);
    }
  }

  /** Get the syntax theme ID for a given file extension. */
  getSyntaxTheme(extension: string): string {
    if (!this._config) return "openp41ge-dark";
    return this._config.syntaxThemes[extension] ?? "openp41ge-dark";
  }

  /** Get the app theme ("dark" | "light"). */
  getAppTheme(): "dark" | "light" {
    if (!this._config) return "dark";
    return this._config.appTheme;
  }

  /** Subscribe to all config changes. Returns unsubscribe function. */
  onChange(callback: (config: UserConfig) => void): () => void {
    this._changeListeners.add(callback);
    return () => this._changeListeners.delete(callback);
  }

  /** Subscribe to changes for a specific key. Returns unsubscribe function. */
  onKeyChange(key: string, callback: (value: unknown) => void): () => void {
    if (!this._keyListeners.has(key)) {
      this._keyListeners.set(key, new Set());
    }
    this._keyListeners.get(key)!.add(callback);
    return () => this._keyListeners.get(key)?.delete(callback);
  }

  /** Apply the current app theme to the document. */
  applyAppTheme(): void {
    const theme = this.getAppTheme();
    document.documentElement.setAttribute("data-app-theme", theme);
    log.info("app theme applied:", theme);
  }

  // ── Private ──────────────────────────────────────────────────────────

  private _notifyAll(): void {
    if (!this._config) return;
    for (const fn of this._changeListeners) {
      try {
        fn(this._config);
      } catch (err) {
        log.error("change listener error:", err);
      }
    }
  }

  private _notifyKey(key: string, value: unknown): void {
    const listeners = this._keyListeners.get(key);
    if (listeners) {
      for (const fn of listeners) {
        try {
          fn(value);
        } catch (err) {
          log.error("key change listener error:", err);
        }
      }
    }
  }
}
