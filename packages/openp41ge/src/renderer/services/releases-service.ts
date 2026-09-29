/**
 * Renderer-side GitHub releases service for the management window's Releases
 * tab.
 *
 * Fetches the app's published releases from the GitHub REST API and exposes a
 * pure filter that hides prerelease builds unless the user's configured update
 * channel opts in ("alpha"/"beta"/"rc").
 *
 * `api.github.com` is a public endpoint for a public repo: no credentials are
 * sent and the response is CORS-enabled, so a plain renderer `fetch` works.
 * Release `body` text is untrusted — callers must render it as text (never
 * via `unsafeHTML`).
 */

export interface GithubRelease {
  tag_name: string;
  name: string;
  prerelease: boolean;
  published_at: string | null;
  body: string | null;
  html_url: string | null;
}

/** The repository whose releases the manager shows. */
export const RELEASES_REPO = "openp41ge/app";

export const RELEASES_API = `https://api.github.com/repos/${RELEASES_REPO}/releases?per_page=100`;

/** Fetch published releases for the app repo, newest first (GitHub orders the
 *  list by creation date). Throws on network/HTTP failure — callers catch to
 *  surface an error state rather than crashing. */
export async function fetchReleases(
  url: string = RELEASES_API,
  signal?: AbortSignal,
): Promise<GithubRelease[]> {
  const res = await fetch(url, {
    signal,
    headers: { Accept: "application/vnd.github+json" },
  });
  if (!res.ok) {
    throw new Error(`GitHub releases request failed (${res.status})`);
  }
  const data: unknown = await res.json();
  return Array.isArray(data) ? (data as GithubRelease[]) : [];
}

/** Whether prerelease builds are shown for the given update channel — only the
 *  default "latest" (stable) channel hides them. */
export function channelShowsPrereleases(channel: string): boolean {
  return channel !== "latest";
}

/** Filter the full release list for an update channel.
 *  "latest" keeps only fully-released (non-prerelease) builds; a prerelease
 *  track ("alpha"/"beta"/"rc") also shows prerelease builds. */
export function filterReleases(channel: string, releases: GithubRelease[]): GithubRelease[] {
  return channelShowsPrereleases(channel) ? releases : releases.filter((r) => !r.prerelease);
}

/** Derive the channel encoded in a release tag, e.g. "alpha" from
 *  "v0.1.0-alpha.4", or "stable" when no prerelease segment is present. */
export function channelFromTag(tag: string): string {
  const pre = /-(alpha|beta|rc)\./i.exec(tag);
  return pre ? pre[1].toLowerCase() : "stable";
}

/** Format an ISO timestamp as a short localized date (e.g. "Sep 29, 2026"). */
export function formatReleaseDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}
