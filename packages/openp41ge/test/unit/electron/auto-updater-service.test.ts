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
} from "../../../electron/auto-updater-service.js";

function fakeConfig(overrides: Record<string, unknown> = {}) {
  return {
    get: (key: string) => {
      if (!key) return overrides;
      return overrides[key] ?? overrides[key.split(".")[0]];
    },
  };
}

function makeUpdater(): UpdaterLike & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    channel: null,
    allowPrerelease: false,
    autoDownload: false,
    on: vi.fn(),
    checkForUpdates: vi.fn(async () => {
      calls.push("checkForUpdates");
    }),
    checkForUpdatesAndNotify: vi.fn(async () => {
      calls.push("checkForUpdatesAndNotify");
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
    expect(updater.autoDownload).toBe(true);
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

  it("triggers a check and updates the status", async () => {
    const updater = makeUpdater();
    const svc = new AutoUpdaterService(fakeConfig({ updateChannel: "latest" }), {
      isPackaged: true,
      updaterFactory: async () => updater,
    });
    await svc.start();
    const status = await svc.checkForUpdates();
    expect(updater.calls).toContain("checkForUpdatesAndNotify");
    expect(status.state).toBe("checking");
  });

  it("broadcasts status to subscribers and reports errors", async () => {
    const updater = makeUpdater();
    updater.checkForUpdatesAndNotify = vi.fn(async () => {
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
});
