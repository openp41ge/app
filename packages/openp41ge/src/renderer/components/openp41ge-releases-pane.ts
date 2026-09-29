/**
 * openp41ge-releases-pane — the management window's Releases tab content.
 *
 * Fetches the app's published releases from the GitHub REST API and lists them
 * newest-first with tag, channel badge, publication date and notes.
 *
 * Channel gating: by default only fully-released builds are shown ("latest"
 * channel). When the user opts into a prerelease track via the Settings
 * `updateChannel` value ("alpha"/"beta"/"rc"), prerelease builds (e.g.
 * v0.1.0-alpha.4) are listed too.
 *
 * Release notes come from an untrusted external source and are rendered as
 * escaped text (never `unsafeHTML`), so a crafted description cannot inject
 * markup into the manager window.
 *
 * Test seams: override the static `deps` to supply a fake fetch / channel
 * provider. By default the real GitHub API and the platform ConfigService
 * (`appServices.configService`) are used.
 */
import { LitElement, html, css, type TemplateResult } from "lit";
import { customElement, state } from "lit/decorators.js";
import { appServices } from "../app";
import {
  fetchReleases,
  filterReleases,
  channelFromTag,
  formatReleaseDate,
  type GithubRelease,
} from "../services/releases-service";

/** Injectable seams used by the pane. Tests replace these via the static. */
export interface ReleasesPaneDeps {
  fetchReleases?: (signal?: AbortSignal) => Promise<GithubRelease[]>;
  getChannel: () => string;
  onChannelChange: (cb: (channel: string) => void) => () => void;
}

const CHANNEL_LABELS: Record<string, string> = {
  latest: "Stable",
  stable: "Stable",
  alpha: "Alpha",
  beta: "Beta",
  rc: "RC",
};

@customElement("openp41ge-releases-pane")
export class Openp41geReleasesPane extends LitElement {
  /** Injectable seams; when null the real GitHub API + ConfigService are used. */
  static deps: ReleasesPaneDeps | null = null;

  @state() private _releases: GithubRelease[] = [];
  @state() private _visible: GithubRelease[] = [];
  @state() private _loading = true;
  @state() private _error: string | null = null;
  @state() private _channel = "latest";

  private _unsub: (() => void) | null = null;
  private _abort: AbortController | null = null;
  private _loadToken = 0;

  override connectedCallback(): void {
    super.connectedCallback();
    const deps = this._resolveDeps();
    this._channel = deps.getChannel();
    this._unsub = deps.onChannelChange((ch) => {
      this._channel = ch;
      this._recompute();
    });
    void this._load();
  }

  override disconnectedCallback(): void {
    this._abort?.abort();
    this._unsub?.();
    this._unsub = null;
    super.disconnectedCallback();
  }

  private async _load(): Promise<void> {
    this._abort?.abort();
    const controller = new AbortController();
    this._abort = controller;
    const token = ++this._loadToken;
    this._loading = true;
    this._error = null;
    try {
      const releases = (await this._resolveDeps().fetchReleases?.(controller.signal)) ?? [];
      if (token !== this._loadToken) return; // superseded by a newer load/abort
      this._releases = releases;
      this._recompute();
      this._loading = false;
    } catch (err) {
      if (token !== this._loadToken) return;
      this._loading = false;
      this._error = err instanceof Error ? err.message : "Failed to load releases";
    }
  }

  private _recompute(): void {
    this._visible = filterReleases(this._channel, this._releases);
  }

  private _resolveDeps(): ReleasesPaneDeps {
    const injected = Openp41geReleasesPane.deps;
    if (injected) return injected;
    return {
      fetchReleases: (signal) => fetchReleases(undefined, signal),
      getChannel: () => {
        const c = appServices.configService.get("updateChannel");
        return typeof c === "string" && c !== "" ? c : "latest";
      },
      onChannelChange: (cb) =>
        appServices.configService.onKeyChange("updateChannel", (v) =>
          cb(typeof v === "string" && v !== "" ? v : "latest"),
        ),
    };
  }

  override render(): TemplateResult {
    return html`
      <div class="rp">
        <header class="rp-head">
          <span class="rp-title">Releases</span>
          <button class="rp-refresh" @click=${() => void this._load()}>Refresh</button>
        </header>
        ${
          this._loading
            ? html`<p class="rp-state">Loading releases…</p>`
            : this._error
              ? html`<p class="rp-state rp-state--error">${this._error}</p>`
              : this._visible.length === 0
                ? html`<p class="rp-state">No releases yet.</p>`
                : html`<ul class="rp-list">
                    ${this._visible.map((r) => this._renderRelease(r))}
                  </ul>`
        }
      </div>
    `;
  }

  private _renderRelease(r: GithubRelease): TemplateResult {
    const channel = channelFromTag(r.tag_name);
    const badge = CHANNEL_LABELS[channel] ?? channel;
    return html`
      <li class="rp-item">
        <div class="rp-item-head">
          ${
            r.html_url
              ? html`<a class="rp-tag" href=${r.html_url} target="_blank" rel="noopener noreferrer"
                  >${r.tag_name}</a
                >`
              : html`<span class="rp-tag">${r.tag_name}</span>`
          }
          <span class="rp-badge rp-badge--${channel}">${badge}</span>
          ${
            r.published_at
              ? html`<span class="rp-date">${formatReleaseDate(r.published_at)}</span>`
              : ""
          }
        </div>
        ${r.body ? html`<div class="rp-body">${r.body}</div>` : ""}
      </li>
    `;
  }

  static override styles = css`
    :host {
      display: block;
      color: var(--text-primary, #d4d4d4);
    }
    .rp {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .rp-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .rp-title {
      font-size: 14px;
      font-weight: 600;
      color: var(--text-primary, #d4d4d4);
    }
    .rp-refresh {
      font: inherit;
      font-size: 12px;
      color: var(--text-primary, #d4d4d4);
      background: var(--bg-secondary, #252526);
      border: 1px solid var(--divider, #454545);
      border-radius: 6px;
      padding: 4px 10px;
      cursor: pointer;
    }
    .rp-refresh:hover {
      border-color: var(--accent, #4f9cf9);
    }
    .rp-state {
      margin: 0;
      font-size: 13px;
      color: var(--muted-color, #8b93a1);
    }
    .rp-state--error {
      color: #e57373;
    }
    .rp-list {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .rp-item {
      border: 1px solid var(--divider, #2d2d2d);
      border-radius: 8px;
      padding: 10px 12px;
      background: var(--bg-secondary, #1e1e1e);
    }
    .rp-item-head {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }
    .rp-tag {
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 13px;
      font-weight: 600;
      color: var(--text-primary, #d4d4d4);
      text-decoration: none;
    }
    a.rp-tag:hover {
      text-decoration: underline;
      color: var(--accent, #4f9cf9);
    }
    .rp-badge {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      padding: 1px 7px;
      border-radius: 999px;
    }
    .rp-badge--stable,
    .rp-badge--latest {
      background: rgba(111, 200, 114, 0.16);
      color: #6fc872;
    }
    .rp-badge--alpha {
      background: rgba(237, 137, 54, 0.16);
      color: #ef8946;
    }
    .rp-badge--beta {
      background: rgba(190, 137, 255, 0.16);
      color: #c597ff;
    }
    .rp-badge--rc {
      background: rgba(79, 156, 249, 0.16);
      color: #6aa9ff;
    }
    .rp-date {
      margin-left: auto;
      font-size: 12px;
      color: var(--muted-color, #8b93a1);
    }
    .rp-body {
      margin-top: 8px;
      font-size: 12.5px;
      line-height: 1.55;
      color: color-mix(in srgb, var(--text-primary, #d4d4d4) 82%, #000);
      white-space: pre-wrap;
      word-break: break-word;
    }
  `;
}
