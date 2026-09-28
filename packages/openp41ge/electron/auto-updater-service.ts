/**
 * AutoUpdaterService — wires electron-updater into the main process.
 *
 * The update channel is driven by the persisted `updateChannel` config value
 * (set in Settings), NOT by the channel baked into `app-update.yml` at build
 * time. This is what keeps the semantic clean:
 *
 *   - `updateChannel = "latest"` (the default) -> `allowPrerelease = false`.
 *     The GitHub provider then only ever resolves GitHub's "latest" release,
 *     which is guaranteed to be a non-prerelease -> stable users can NEVER be
 *     offered an alpha/beta build.
 *   - `updateChannel = "alpha" | "beta" | "rc"` -> `allowPrerelease = true`
 *     and the matching channel, so the atom-feed walk can pick up prereleases.
 *
 * Only runs in a packaged build (dev has no `app-update.yml` / no feed). The
 * updater object is injected (or lazily imported) so unit tests can drive the
 * configuration logic without touching electron-updater.
 */

import { app } from "electron";
import { createLogger } from "openp41ge-logger";
import type { ConfigService } from "../src/main/services/config-service.js";

const log = createLogger("openp41ge", "auto-updater");

/** Update channels understood by electron-updater's GitHub provider.
 *  `latest` is the stable/default channel; prereleases mirror the version suffix. */
export const UPDATE_CHANNELS = ["latest", "alpha", "beta", "rc"] as const;
export type UpdateChannel = (typeof UPDATE_CHANNELS)[number];

/** The slice of electron-updater's `AppUpdater` the service needs. */
export interface UpdaterLike {
  channel: string | null;
  allowPrerelease: boolean;
  autoDownload: boolean;
  on: (event: string, listener: (...args: unknown[]) => void) => unknown;
  checkForUpdates: () => Promise<unknown>;
  checkForUpdatesAndNotify: () => Promise<unknown>;
  quitAndInstall: () => void;
}

/** Renderer-facing update status snapshot. */
export type UpdaterStatus =
  | { state: "idle"; channel: string }
  | { state: "checking"; channel: string }
  | { state: "update-available"; version: string }
  | { state: "update-not-available"; version: string }
  | { state: "update-downloaded"; version: string }
  | { state: "error"; message: string };

export interface AutoUpdaterOptions {
  /** Overrides `app.isPackaged` (used by tests). */
  isPackaged?: boolean;
  /** Injects the updater implementation (used by tests); default lazy-imports electron-updater. */
  updaterFactory?: () => Promise<UpdaterLike>;
}

/** Pure mapping from a persisted channel value to the electron-updater config. */
export function updaterSettingsForChannel(channel: string): {
  channel: UpdateChannel;
  allowPrerelease: boolean;
} {
  const normalized = (UPDATE_CHANNELS as readonly string[]).includes(channel)
    ? (channel as UpdateChannel)
    : "latest";
  return { channel: normalized, allowPrerelease: normalized !== "latest" };
}

export class AutoUpdaterService {
  private _updater: UpdaterLike | null | undefined;
  private _status: UpdaterStatus = { state: "idle", channel: "latest" };
  private _statusListeners = new Set<(status: UpdaterStatus) => void>();
  private _started = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly options: AutoUpdaterOptions = {},
  ) {}

  /** The client's configured channel (validated, defaults to "latest"). */
  getChannel(): UpdateChannel {
    const raw = this.configService.get("updateChannel");
    const val = typeof raw === "string" ? raw : "latest";
    return updaterSettingsForChannel(val).channel;
  }

  /** Current update status snapshot (safe to query before start()). */
  getStatus(): UpdaterStatus {
    return this._status;
  }

  /** Subscribe to update status changes. Returns unsubscribe. */
  onStatus(callback: (status: UpdaterStatus) => void): () => void {
    this._statusListeners.add(callback);
    return () => this._statusListeners.delete(callback);
  }

  /**
   * Configure electron-updater from the persisted channel and check on startup.
   * No-op in dev (unpackaged) or when called twice.
   */
  async start(): Promise<void> {
    if (this._started) return;
    this._started = true;

    const packaged = this.options.isPackaged ?? app.isPackaged;
    if (!packaged) {
      log.info("auto-update disabled (dev build — no packaged updater feed)");
      return;
    }

    const { channel, allowPrerelease } = updaterSettingsForChannel(this.getChannel());
    const updater = await this._loadUpdater();
    if (!updater) return;

    updater.channel = channel;
    updater.allowPrerelease = allowPrerelease;
    updater.autoDownload = true;
    this._wireEvents(updater);

    log.info("auto-update ready", { channel, allowPrerelease });
    // Defer the first check a few seconds so it never blocks startup.
    setTimeout(() => {
      void this.checkForUpdates();
    }, 4000);
  }

  /** Trigger an update check now (idempotent; safe pre-start). */
  async checkForUpdates(): Promise<UpdaterStatus> {
    const updater = await this._loadUpdater();
    if (!updater) {
      this._setStatus({ state: "error", message: "auto-update is not available" });
      return this._status;
    }
    this._setStatus({ state: "checking", channel: updater.channel ?? "latest" });
    try {
      await updater.checkForUpdatesAndNotify();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.warn("update check failed:", message);
      this._setStatus({ state: "error", message });
    }
    return this._status;
  }

  /** Download-and-install the staged update (called when the user confirms). */
  quitAndInstall(): void {
    const updater = this._updater;
    if (!updater) return;
    try {
      updater.quitAndInstall();
    } catch (err) {
      log.warn("quitAndInstall failed:", err);
    }
  }

  // ── Private ─────────────────────────────────────────────────────────────

  private async _loadUpdater(): Promise<UpdaterLike | null> {
    if (this._updater !== undefined) return this._updater;
    if (this.options.updaterFactory) {
      this._updater = (await this.options.updaterFactory()) ?? null;
      return this._updater;
    }
    try {
      // Lazy import so unit tests (and dev) never evaluate electron-updater.
      const mod = (await import("electron-updater")) as {
        autoUpdater: UpdaterLike;
      };
      this._updater = mod.autoUpdater;
    } catch (err) {
      log.warn("electron-updater unavailable:", err);
      this._updater = null;
    }
    return this._updater;
  }

  private _wireEvents(updater: UpdaterLike): void {
    updater.on("checking-for-update", () => {
      this._setStatus({ state: "checking", channel: updater.channel ?? "latest" });
    });
    updater.on("update-available", (info) => {
      const version =
        info && typeof info === "object" && "version" in info
          ? String((info as { version: unknown }).version)
          : "unknown";
      this._setStatus({ state: "update-available", version });
    });
    updater.on("update-not-available", (info) => {
      const version =
        info && typeof info === "object" && "version" in info
          ? String((info as { version: unknown }).version)
          : "current";
      this._setStatus({ state: "update-not-available", version });
    });
    updater.on("update-downloaded", (info) => {
      const version =
        info && typeof info === "object" && "version" in info
          ? String((info as { version: unknown }).version)
          : "unknown";
      this._setStatus({ state: "update-downloaded", version });
    });
    updater.on("error", (err) => {
      const message = err instanceof Error ? err.message : String(err);
      this._setStatus({ state: "error", message });
    });
  }

  private _setStatus(status: UpdaterStatus): void {
    this._status = status;
    for (const listener of this._statusListeners) {
      try {
        listener(status);
      } catch (err) {
        log.warn("status listener error:", err);
      }
    }
  }
}
