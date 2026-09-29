/**
 * Tests for <openp41ge-releases-pane>, the management window's Releases tab.
 *
 * The pane fetches the app's releases from the GitHub API and shows only fully
 * released builds by default; when the configured update channel is a
 * prerelease track (alpha/beta/rc) it also lists prerelease builds. Release
 * notes are untrusted and must render as escaped text, never live HTML.
 *
 * All network/config access is injected via the static `deps` seam.
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

/** Injectable deps with a controllable channel. */
function makeDeps(initialChannel: string, releases: GithubRelease[]) {
  let channel = initialChannel;
  const listeners = new Set<(c: string) => void>();
  const deps: ReleasesPaneDeps = {
    fetchReleases: async () => releases,
    getChannel: () => channel,
    onChannelChange: (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
  };
  return {
    deps,
    setChannel(c: string) {
      channel = c;
      for (const l of listeners) l(c);
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

describe("openp41ge-releases-pane", () => {
  beforeEach(() => {
    Openp41geReleasesPane.deps = null;
  });
  afterEach(() => {
    document.body.innerHTML = "";
    Openp41geReleasesPane.deps = null;
  });

  test("shows only fully released builds on the default (latest) channel", async () => {
    const { deps } = makeDeps("latest", [STABLE, ALPHA]);
    const el = await mount(deps);
    const tags = Array.from(el.shadowRoot!.querySelectorAll(".rp-tag")).map((n) => n.textContent);
    expect(tags).toEqual(["v0.1.0"]);
    expect(el.shadowRoot!.textContent).not.toContain("alpha.4");
  });

  test("lists prerelease builds too when the channel opts into a prerelease track", async () => {
    const { deps } = makeDeps("alpha", [STABLE, ALPHA]);
    const el = await mount(deps);
    const tags = Array.from(el.shadowRoot!.querySelectorAll(".rp-tag")).map((n) => n.textContent);
    expect(tags).toEqual(["v0.1.0", "v0.1.0-alpha.4"]);
    expect(el.shadowRoot!.querySelector(".rp-badge--alpha")).not.toBeNull();
  });

  test("renders release notes as escaped text (no HTML injection)", async () => {
    const malicious: GithubRelease = {
      ...STABLE,
      body: "Release <img src=x onerror=alert(1)> notes & <b>bold</b>",
    };
    const { deps } = makeDeps("latest", [malicious]);
    const el = await mount(deps);
    const body = el.shadowRoot!.querySelector(".rp-body")!;
    expect(body.querySelector("img")).toBeNull();
    expect(body.querySelector("b")).toBeNull();
    expect(body.textContent).toContain("<img src=x onerror=alert(1)>");
    expect(body.textContent).toContain("<b>bold</b>");
  });

  test("re-filters live when the update channel changes", async () => {
    const ctrl = makeDeps("latest", [STABLE, ALPHA]);
    const el = await mount(ctrl.deps);
    expect(
      Array.from(el.shadowRoot!.querySelectorAll(".rp-tag")).map((n) => n.textContent),
    ).toEqual(["v0.1.0"]);
    ctrl.setChannel("alpha");
    await el.updateComplete;
    expect(
      Array.from(el.shadowRoot!.querySelectorAll(".rp-tag")).map((n) => n.textContent),
    ).toEqual(["v0.1.0", "v0.1.0-alpha.4"]);
  });

  test("shows a loading state while fetching", async () => {
    let resolveFetch!: (r: GithubRelease[]) => void;
    const deps: ReleasesPaneDeps = {
      fetchReleases: () => new Promise((r) => (resolveFetch = r)),
      getChannel: () => "latest",
      onChannelChange: () => () => {},
    };
    const el = await mount(deps);
    expect(el.shadowRoot!.textContent).toContain("Loading releases");
    resolveFetch([STABLE]);
    await tick();
    await el.updateComplete;
    expect(el.shadowRoot!.textContent).toContain("v0.1.0");
  });

  test("surfaces the error message when the request fails", async () => {
    const deps: ReleasesPaneDeps = {
      fetchReleases: async () => {
        throw new Error("GitHub releases request failed (403)");
      },
      getChannel: () => "latest",
      onChannelChange: () => () => {},
    };
    const el = await mount(deps);
    expect(el.shadowRoot!.textContent).toContain("GitHub releases request failed (403)");
  });
});
