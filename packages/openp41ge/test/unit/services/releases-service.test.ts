/**
 * Tests for the renderer GitHub releases service: API fetch, channel-based
 * prerelease filtering, and tag/date helpers used by the Releases tab pane.
 */
import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import {
  fetchReleases,
  filterReleases,
  channelShowsPrereleases,
  channelFromTag,
  formatReleaseDate,
  RELEASES_API,
  type GithubRelease,
} from "../../../src/renderer/services/releases-service";

const STABLE: GithubRelease = {
  tag_name: "v0.1.0",
  name: "v0.1.0",
  prerelease: false,
  published_at: "2026-09-30T00:00:00Z",
  body: "First stable release.",
  html_url: "https://github.com/openp41ge/app/releases/tag/v0.1.0",
};

const ALPHA: GithubRelease = {
  tag_name: "v0.1.0-alpha.4",
  name: "v0.1.0-alpha.4",
  prerelease: true,
  published_at: "2026-09-29T03:27:53Z",
  body: "Alpha 4.",
  html_url: "https://github.com/openp41ge/app/releases/tag/v0.1.0-alpha.4",
};

describe("releases-service — fetchReleases", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("fetches the repo releases endpoint and parses the array", async () => {
    const mock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [STABLE, ALPHA],
    });
    vi.stubGlobal("fetch", mock);

    const releases = await fetchReleases();
    expect(mock).toHaveBeenCalledWith(
      RELEASES_API,
      expect.objectContaining({ headers: { Accept: "application/vnd.github+json" } }),
    );
    expect(releases).toEqual([STABLE, ALPHA]);
  });

  test("throws on a non-2xx response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 403, json: async () => ({}) }),
    );
    await expect(fetchReleases()).rejects.toThrow(/403/);
  });

  test("returns [] when the payload is not an array", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) }),
    );
    await expect(fetchReleases()).resolves.toEqual([]);
  });

  test("forwards an abort signal", async () => {
    const mock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => [] });
    vi.stubGlobal("fetch", mock);
    const controller = new AbortController();
    await fetchReleases("https://example.test/releases", controller.signal);
    expect(mock.mock.calls[0][1]).toMatchObject({ signal: controller.signal });
  });
});

describe("releases-service — channel filtering", () => {
  test("latest channel hides prerelease builds", () => {
    expect(channelShowsPrereleases("latest")).toBe(false);
    expect(filterReleases("latest", [STABLE, ALPHA])).toEqual([STABLE]);
  });

  test("prerelease tracks show both stable and prerelease builds", () => {
    for (const ch of ["alpha", "beta", "rc"]) {
      expect(channelShowsPrereleases(ch)).toBe(true);
      expect(filterReleases(ch, [STABLE, ALPHA])).toEqual([STABLE, ALPHA]);
    }
  });

  test("an unknown channel behaves like a prerelease track (shows everything)", () => {
    expect(filterReleases("nightly", [STABLE, ALPHA])).toEqual([STABLE, ALPHA]);
  });
});

describe("releases-service — helpers", () => {
  test("channelFromTag derives alpha/beta/rc/stable from the tag", () => {
    expect(channelFromTag("v0.1.0-alpha.4")).toBe("alpha");
    expect(channelFromTag("v0.2.0-beta.1")).toBe("beta");
    expect(channelFromTag("v0.3.0-rc.2")).toBe("rc");
    expect(channelFromTag("v1.0.0")).toBe("stable");
  });

  test("formatReleaseDate renders a localized date and handles bad input", () => {
    const out = formatReleaseDate("2026-09-29T03:27:53Z");
    expect(out).toMatch(/2026/);
    expect(formatReleaseDate(null)).toBe("");
    expect(formatReleaseDate("not-a-date")).toBe("");
  });
});
