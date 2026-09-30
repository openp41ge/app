/**
 * Tests for <openp41ge-releases-pane>, the management window's Releases tab.
 *
 * The pane shows the LATEST release per channel in the configured update
 * window (stale-while-revalidate), marks the installed version, offers an
 * Install action on the configured channel's latest, and opens a History
 * drawer for a channel. Network/config/updater access is injected via the
 * static `deps` seam.
 */
import { describe, test, expect, beforeEach, afterEach } from "vitest";
import {
  Openp41geReleasesPane,
  type ReleasesPaneDeps,
} from "../../../src/renderer/components/openp41ge-releases-pane";
import type { GithubRelease } from "../../../src/renderer/services/releases-service";

const STABLE: GithubRelease = {
  tag_name: "v0.1.0",
  name: "v0.1.0",
  prerelease: false,
  published_at: "2026-09-30T00:00:00Z",
  body: "First stable release.\nStable notes.",
  html_url: "https://github.com/openp41ge/app/releases/tag/v0.1.0",
};

const ALPHA: GithubRelease = {
  tag_name: "v0.1.0-alpha.4",
  name: "v0.1.0-alpha.4",
  prerelease: true,
  published_at: "2026-09-29T03:27:53Z",
  body: "Alpha build.",
  html_url: "https://github.com/openp41ge/app/releases/tag/v0.1.0-alpha.4",
};

const ALPHA_OLD: GithubRelease = {
  tag_name: "v0.1.0-alpha.1",
  name: "v0.1.0-alpha.1",
  prerelease: true,
  published_at: "2026-09-25T00:00:00Z",
  body: "Older alpha.",
  html_url: "https://github.com/openp41ge/app/releases/tag/v0.1.0-alpha.1",
};

/** Injectable deps with a controllable channel, releases and installed version. */
function makeDeps(
  opts: {
    initialChannel?: string;
    releases?: GithubRelease[];
    installed?: string;
    cache?: { releases: GithubRelease[]; fetchedAt: number } | null;
    download?: ReleasesPaneDeps["download"];
    confirmRestart?: ReleasesPaneDeps["confirmRestart"];
    quitAndInstall?: () => void;
    morePages?: GithubRelease[];
  } = {},
) {
  let channel = opts.initialChannel ?? "latest";
  const listeners = new Set<(c: string) => void>();
  let status: UpdaterStatus = { state: "idle", channel };
  const statusListeners = new Set<(s: UpdaterStatus) => void>();
  const deps: ReleasesPaneDeps = {
    fetchReleases: async () => opts.releases ?? [STABLE, ALPHA],
    fetchReleasesPage: async (p) => {
      if (opts.morePages && p >= 2) return opts.morePages;
      return [];
    },
    getChannel: () => channel,
    onChannelChange: (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    getInstalledVersion: async () => opts.installed ?? "",
    download: opts.download ?? (async () => ({ state: "idle", channel })),
    getStatus: async () => status,
    onUpdaterStatus: (cb) => {
      statusListeners.add(cb);
      return () => statusListeners.delete(cb);
    },
    quitAndInstall: opts.quitAndInstall ?? (() => {}),
    confirmRestart: opts.confirmRestart ?? (async () => true),
    loadCache: opts.cache === undefined ? () => null : () => opts.cache ?? null,
    saveCache: () => {},
  };
  return {
    deps,
    setChannel(c: string) {
      channel = c;
      for (const l of listeners) l(c);
    },
    emitStatus(s: UpdaterStatus) {
      status = s;
      for (const l of statusListeners) l(s);
    },
  };
}

const tick = (ms = 20) => new Promise((r) => setTimeout(r, ms));

async function mount(deps: ReleasesPaneDeps): Promise<Openp41geReleasesPane> {
  Openp41geReleasesPane.deps = deps;
  const el = document.createElement("openp41ge-releases-pane") as Openp41geReleasesPane;
  document.body.appendChild(el);
  await tick();
  await el.updateComplete;
  return el;
}

function tags(el: Openp41geReleasesPane): (string | null)[] {
  return Array.from(el.shadowRoot!.querySelectorAll(".rp-tag")).map((n) => n.textContent);
}

describe("openp41ge-releases-pane", () => {
  beforeEach(() => {
    Openp41geReleasesPane.deps = null;
    localStorage.clear();
  });
  afterEach(() => {
    document.body.innerHTML = "";
    Openp41geReleasesPane.deps = null;
    localStorage.clear();
  });

  test("latest channel shows only the latest stable release (drops old history)", async () => {
    const { deps } = makeDeps({ initialChannel: "latest", releases: [STABLE, ALPHA, ALPHA_OLD] });
    const el = await mount(deps);
    expect(tags(el)).toEqual(["v0.1.0"]);
    expect(el.shadowRoot!.textContent).not.toContain("alpha.4");
  });

  test("alpha channel shows the latest of each included channel", async () => {
    const { deps } = makeDeps({ initialChannel: "alpha", releases: [STABLE, ALPHA, ALPHA_OLD] });
    const el = await mount(deps);
    expect(tags(el)).toEqual(["v0.1.0", "v0.1.0-alpha.4"]);
    expect(el.shadowRoot!.textContent).not.toContain("alpha.1");
  });

  test("renders release notes as escaped text (no HTML injection)", async () => {
    const malicious: GithubRelease = {
      ...STABLE,
      body: "Release <img src=x onerror=alert(1)> notes & <b>bold</b>",
    };
    const { deps } = makeDeps({ releases: [malicious] });
    const el = await mount(deps);
    const body = el.shadowRoot!.querySelector(".rp-body")!;
    expect(body.querySelector("img")).toBeNull();
    expect(body.querySelector("b")).toBeNull();
    expect(body.textContent).toContain("<img src=x onerror=alert(1)>");
    expect(body.textContent).toContain("<b>bold</b>");
  });

  test("re-filters live when the update channel changes", async () => {
    const ctrl = makeDeps({ initialChannel: "latest", releases: [STABLE, ALPHA] });
    const el = await mount(ctrl.deps);
    expect(tags(el)).toEqual(["v0.1.0"]);
    ctrl.setChannel("alpha");
    await el.updateComplete;
    expect(tags(el)).toEqual(["v0.1.0", "v0.1.0-alpha.4"]);
  });

  test("shows the installed version and marks the matching row", async () => {
    const { deps } = makeDeps({ releases: [STABLE, ALPHA], installed: "0.1.0" });
    const el = await mount(deps);
    expect(el.shadowRoot!.textContent).toContain("Installed:");
    expect(el.shadowRoot!.textContent).toContain("v0.1.0");
    const chips = Array.from(el.shadowRoot!.querySelectorAll(".rp-chip--installed"));
    expect(chips).toHaveLength(1);
  });

  test("offers Install only on the configured channel's latest", async () => {
    const { deps } = makeDeps({ initialChannel: "alpha", releases: [STABLE, ALPHA] });
    const el = await mount(deps);
    // Install button is present only on the alpha row (the configured channel).
    const install = el.shadowRoot!.querySelector(".rp-btn--install")!;
    const row = install.closest(".rp-item")!;
    expect(row.querySelector(".rp-badge--alpha")).not.toBeNull();
    // Only one install button in the top-level list.
    expect(el.shadowRoot!.querySelectorAll(".rp-btn--install")).toHaveLength(1);
  });

  test("triggers a download when Install is clicked", async () => {
    let downloaded = false;
    const { deps } = makeDeps({
      initialChannel: "alpha",
      releases: [STABLE, ALPHA],
      download: async () => {
        downloaded = true;
        return {
          state: "downloading",
          version: "0.1.0-alpha.4",
          progress: 0,
          bytesPerSecond: 0,
          transferred: 0,
          total: 0,
        };
      },
    });
    const el = await mount(deps);
    (el.shadowRoot!.querySelector(".rp-btn--install") as HTMLButtonElement).click();
    await tick();
    expect(downloaded).toBe(true);
  });

  test("shows download progress then a restart prompt on the downloaded row", async () => {
    const { deps, emitStatus } = makeDeps({ initialChannel: "alpha", releases: [STABLE, ALPHA] });
    const el = await mount(deps);
    emitStatus({
      state: "downloading",
      version: "0.1.0-alpha.4",
      progress: 42,
      bytesPerSecond: 1000,
      transferred: 1000,
      total: 2400,
    });
    await el.updateComplete;
    expect(el.shadowRoot!.textContent).toContain("42%");
    emitStatus({ state: "update-downloaded", version: "0.1.0-alpha.4" });
    await el.updateComplete;
    // Once downloaded, the card shows a ready message and an Update button
    // (no longer a Download button) that triggers the restart flow.
    expect(el.shadowRoot!.textContent).toContain("Downloaded — ready to update");
    expect(el.shadowRoot!.querySelector(".rp-btn--restart")).not.toBeNull();
    expect(el.shadowRoot!.textContent).toContain("Update");
    expect(el.shadowRoot!.querySelectorAll(".rp-btn--install")).toHaveLength(0);
  });

  test("confirming restart calls quitAndInstall", async () => {
    let restarted = false;
    const { deps, emitStatus } = makeDeps({
      initialChannel: "alpha",
      releases: [STABLE, ALPHA],
      confirmRestart: async () => true,
      quitAndInstall: () => {
        restarted = true;
      },
    });
    const el = await mount(deps);
    emitStatus({ state: "update-downloaded", version: "0.1.0-alpha.4" });
    await el.updateComplete;
    (el.shadowRoot!.querySelector(".rp-btn--restart") as HTMLButtonElement).click();
    await tick();
    expect(restarted).toBe(true);
  });

  test("history drawer lists older versions and loads more pages", async () => {
    const { deps } = makeDeps({
      initialChannel: "alpha",
      releases: [STABLE, ALPHA],
      morePages: [ALPHA_OLD],
    });
    const el = await mount(deps);
    // Open the drawer for the alpha channel specifically.
    (
      el.shadowRoot!.querySelector('.rp-btn--history[data-channel="alpha"]') as HTMLButtonElement
    ).click();
    await el.updateComplete;
    expect(el.shadowRoot!.textContent).toContain("Alpha history");
    // The drawer starts with the channel releases already in the cached list.
    expect(el.shadowRoot!.textContent).toContain("alpha.4");
    // The older alpha is present once the next page is loaded.
    (el.shadowRoot!.querySelector(".rp-drawer-footer .rp-btn") as HTMLButtonElement).click();
    await tick();
    await el.updateComplete;
    expect(el.shadowRoot!.textContent).toContain("alpha.1");
  });

  test("serves stale-while-revalidate from cache then refreshes", async () => {
    const cache = { releases: [STABLE], fetchedAt: Date.now() - 60000 };
    let resolveFetch!: (r: GithubRelease[]) => void;
    const { deps } = makeDeps({ initialChannel: "alpha", releases: [STABLE, ALPHA], cache });
    deps.fetchReleases = () => new Promise((r) => (resolveFetch = r));
    const el = await mount(deps);
    // While the background fetch is pending, the cached list is shown as stale.
    expect(tags(el)).toEqual(["v0.1.0"]);
    expect(el.shadowRoot!.textContent).toContain("showing cached");
    // After revalidation the fresh list replaces it and the stale flag clears.
    resolveFetch([STABLE, ALPHA]);
    await tick();
    await el.updateComplete;
    expect(el.shadowRoot!.textContent).not.toContain("showing cached");
    expect(tags(el)).toEqual(["v0.1.0", "v0.1.0-alpha.4"]);
  });

  test("surfaces an error when the request fails and nothing is cached", async () => {
    const deps: ReleasesPaneDeps = {
      ...makeDeps({}).deps,
      fetchReleases: async () => {
        throw new Error("GitHub releases request failed (403)");
      },
    };
    const el = await mount(deps);
    expect(el.shadowRoot!.textContent).toContain("GitHub releases request failed (403)");
  });
});
