// @ts-nocheck
/**
 * Unit tests for the main-process AutoUpdaterService and the channel → config
 * mapping. The electron module is stubbed (the service is dev-gated on
 * `app.isPackaged`), and the updater is injected so electron-updater itself is
 * never evaluated in the unit environment.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Stub `electron` so static `import { app } from "electron"` resolves in jsdom.
vi.mock("electron", () => ({ app: { isPackaged: false } }));

import {
  AutoUpdaterService,
  updaterSettingsForChannel,
  type UpdaterLike,
  type UpdaterStatus,
} from "../../../electron/auto-updater-service.js";

function fakeConfig(overrides: Record<string, unknown> = {}) {
  return {
    get: (key: string) => {
      if (!key) return overrides;
      return overrides[key] ?? overrides[key.split(".")[0]];
    },
  };
}

function makeUpdater(): UpdaterLike & {
  calls: string[];
  handlers: Record<string, (...args: unknown[]) => void>;
} {
  const calls: string[] = [];
  const handlers: Record<string, (...args: unknown[]) => void> = {};
  return {
    calls,
    handlers,
    channel: null,
    allowPrerelease: false,
    autoDownload: false,
    on: ((event: string, handler: (...args: unknown[]) => void) => {
      handlers[event] = handler;
    }) as never,
    checkForUpdates: vi.fn(async () => {
      calls.push("checkForUpdates");
    }),
    checkForUpdatesAndNotify: vi.fn(async () => {
      calls.push("checkForUpdatesAndNotify");
    }),
    downloadUpdate: vi.fn(async () => {
      calls.push("downloadUpdate");
      return [];
    }),
    quitAndInstall: vi.fn(() => {
      calls.push("quitAndInstall");
    }),
  } as never;
}

describe("updaterSettingsForChannel", () => {
  it("maps latest to the stable channel with prereleases disabled", () => {
    expect(updaterSettingsForChannel("latest")).toEqual({
      channel: "latest",
      allowPrerelease: false,
    });
  });

  it("maps prerelease channels to themselves with prereleases enabled", () => {
    expect(updaterSettingsForChannel("alpha")).toEqual({
      channel: "alpha",
      allowPrerelease: true,
    });
    expect(updaterSettingsForChannel("beta")).toEqual({
      channel: "beta",
      allowPrerelease: true,
    });
    expect(updaterSettingsForChannel("rc")).toEqual({
      channel: "rc",
      allowPrerelease: true,
    });
  });

  it("falls back to latest for unknown values", () => {
    expect(updaterSettingsForChannel("nightly")).toEqual({
      channel: "latest",
      allowPrerelease: false,
    });
    expect(updaterSettingsForChannel("")).toEqual({
      channel: "latest",
      allowPrerelease: false,
    });
  });
});

describe("AutoUpdaterService", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it("reads the persisted channel from config", () => {
    const svc = new AutoUpdaterService(fakeConfig({ updateChannel: "alpha" }));
    expect(svc.getChannel()).toBe("alpha");
  });

  it("defaults to latest when config is missing or invalid", () => {
    const missing = new AutoUpdaterService(fakeConfig({}));
    expect(missing.getChannel()).toBe("latest");
    const invalid = new AutoUpdaterService(fakeConfig({ updateChannel: "bogus" }));
    expect(invalid.getChannel()).toBe("latest");
  });

  it("does nothing when not packaged (dev build)", async () => {
    const updater = makeUpdater();
    const svc = new AutoUpdaterService(fakeConfig({ updateChannel: "alpha" }), {
      isPackaged: false,
      updaterFactory: async () => updater,
    });
    await svc.start();
    expect(updater.channel).toBeNull();
    expect(updater.allowPrerelease).toBe(false);
  });

  it("configures the updater channel + allowPrerelease when packaged", async () => {
    const updater = makeUpdater();
    const svc = new AutoUpdaterService(fakeConfig({ updateChannel: "alpha" }), {
      isPackaged: true,
      updaterFactory: async () => updater,
    });
    await svc.start();
    expect(updater.channel).toBe("alpha");
    expect(updater.allowPrerelease).toBe(true);
    // User-controlled updates: the service never auto-downloads.
    expect(updater.autoDownload).toBe(false);
  });

  it("sets allowPrerelease=false for the stable latest channel", async () => {
    const updater = makeUpdater();
    const svc = new AutoUpdaterService(fakeConfig({ updateChannel: "latest" }), {
      isPackaged: true,
      updaterFactory: async () => updater,
    });
    await svc.start();
    expect(updater.channel).toBe("latest");
    expect(updater.allowPrerelease).toBe(false);
  });

  it("triggers a silent check and updates the status", async () => {
    const updater = makeUpdater();
    const svc = new AutoUpdaterService(fakeConfig({ updateChannel: "latest" }), {
      isPackaged: true,
      updaterFactory: async () => updater,
    });
    await svc.start();
    const status = await svc.checkForUpdates();
    expect(updater.calls).toContain("checkForUpdates");
    expect(status.state).toBe("checking");
  });

  it("broadcasts status to subscribers and reports errors", async () => {
    const updater = makeUpdater();
    updater.checkForUpdates = vi.fn(async () => {
      throw new Error("no feed");
    });
    const svc = new AutoUpdaterService(fakeConfig({ updateChannel: "latest" }), {
      isPackaged: true,
      updaterFactory: async () => updater,
    });
    const seen = [];
    svc.onStatus((s) => seen.push(s));
    const status = await svc.checkForUpdates();
    expect(status.state).toBe("error");
    expect(status.message).toContain("no feed");
    expect(seen.some((s) => s.state === "error")).toBe(true);
  });

  it("quitAndInstall delegates to the updater", async () => {
    const updater = makeUpdater();
    const svc = new AutoUpdaterService(fakeConfig({ updateChannel: "latest" }), {
      isPackaged: true,
      updaterFactory: async () => updater,
    });
    await svc.start();
    svc.quitAndInstall();
    expect(updater.calls).toContain("quitAndInstall");
  });

  it("reports the installed version from the injected getter", () => {
    const svc = new AutoUpdaterService(fakeConfig({}), {
      getVersion: () => "9.9.9",
    });
    expect(svc.getCurrentVersion()).toBe("9.9.9");
  });

  it("downloadUpdate checks first when no update is staged, then downloads", async () => {
    const updater = makeUpdater();
    updater.checkForUpdates = vi.fn(async () => {
      updater.calls.push("checkForUpdates");
      // electron-updater emits update-available during the check.
      updater.handlers["update-available"]?.({ version: "1.2.3" });
    });
    updater.downloadUpdate = vi.fn(async () => {
      updater.calls.push("downloadUpdate");
      // electron-updater emits update-downloaded when the stage completes.
      updater.handlers["update-downloaded"]?.({ version: "1.2.3" });
      return [];
    });
    const svc = new AutoUpdaterService(fakeConfig({ updateChannel: "latest" }), {
      isPackaged: true,
      updaterFactory: async () => updater,
    });
    await svc.start();
    const status = await svc.downloadUpdate();
    // A check was run first (there was no staged update), then the download.
    expect(status.state).toBe("update-downloaded");
    expect(updater.calls).toContain("checkForUpdates");
    expect(updater.calls).toContain("downloadUpdate");
  });

  it("downloadUpdate reports an error when the updater has no update to download", async () => {
    const updater = makeUpdater();
    const svc = new AutoUpdaterService(fakeConfig({ updateChannel: "latest" }), {
      isPackaged: true,
      updaterFactory: async () => updater,
    });
    await svc.start();
    const status = await svc.downloadUpdate();
    // No update-available was ever emitted, so the download is refused.
    expect(status.state).toBe("error");
  });

  it("broadcasts download progress as a downloading status", async () => {
    const updater = makeUpdater();
    const svc = new AutoUpdaterService(fakeConfig({ updateChannel: "latest" }), {
      isPackaged: true,
      updaterFactory: async () => updater,
    });
    await svc.start();
    const seen: UpdaterStatus[] = [];
    svc.onStatus((s) => seen.push(s));
    updater.handlers["update-available"]?.({ version: "1.2.3" });
    updater.handlers["download-progress"]?.({
      percent: 50,
      bytesPerSecond: 1024,
      transferred: 500,
      total: 1000,
    });
    const last = seen[seen.length - 1];
    expect(last.state).toBe("downloading");
    if (last.state === "downloading") {
      expect(last.version).toBe("1.2.3");
      expect(last.progress).toBe(50);
    }
  });
});
