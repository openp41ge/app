/**
 * <openp41ge-window-manager> — Window Manager window with a drawer system.
 *
 * The top level is a simple list of workspaces. Clicking a card opens a drawer
 * from the right (75% width, full height, scrollable) showing that workspace's
 * detail. Drilling further (workspace → repo → worktree) opens stacked drawers:
 * the deepest is always 75% wide, its direct parent moves to 80%, and every
 * ancestor above that caps at 85%. Clicking a card opens the workspace detail
 * drawer with an "Open" button (the old "Activate" action); the top-level cards
 * themselves carry no Open button — only an "Opened" pill when the workspace is
 * already open.
 */

import { html, nothing, type TemplateResult } from "lit";
import { LitElement } from "lit";
import { state } from "lit/decorators.js";
import type { WorkspaceFileData } from "../../layout/types";
import { workspaceFileService, deriveRepoName } from "../services/workspace-file-service";

const isMac = (() => {
  try {
    return window.openp41ge?.platform === "darwin" || navigator.platform.startsWith("Mac");
  } catch {
    return false;
  }
})();

interface OpenWindowSummary {
  windowId: string;
  windowType: "workspace" | "window-manager";
  workspacePath: string | null;
}

interface DrawerState {
  id: string;
  kind: "workspace" | "repo" | "worktree";
  workspacePath: string;
  data: WorkspaceFileData;
  repoUrl?: string;
  worktree?: string;
  title: string;
}

/** A drawer that is animating out; keeps its last width so it exits in place. */
interface ClosingDrawer extends DrawerState {
  width: number;
}

class Openp41geWindowManager extends LitElement {
  @state() private _workspaces: Array<{ filePath: string; data: WorkspaceFileData }> = [];
  @state() private _openWindows: OpenWindowSummary[] = [];
  @state() private _drawers: DrawerState[] = [];
  @state() private _closingDrawers: ClosingDrawer[] = [];
  @state() private _loaded = false;

  connectedCallback(): void {
    super.connectedCallback();
    window.addEventListener("focus", this._onFocus);
    void this._load();
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    window.removeEventListener("focus", this._onFocus);
  }

  private _onFocus = (): void => {
    void this._load();
  };

  private async _load(): Promise<void> {
    try {
      this._workspaces = await workspaceFileService.listWorkspaces();
    } catch {
      this._workspaces = [];
    }
    try {
      this._openWindows = await window.openp41ge.windowManager.openWindowSummaries();
    } catch {
      this._openWindows = [];
    }
    this._loaded = true;
  }

  private _nextId(): string {
    return `d-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  }

  /** Open (or re-focus) a workspace-bound window; refresh open-state pills. */
  private _openWorkspaceWindow(path: string): void {
    window.openp41ge.windowManager.openWorkspaceWindow(path);
    window.setTimeout(() => void this._load(), 350);
  }

  /** Clicking a top-level card resets the drawer stack to that workspace's detail. */
  private _openWorkspace(ws: { filePath: string; data: WorkspaceFileData }): void {
    this._drawers = [
      {
        id: this._nextId(),
        kind: "workspace",
        workspacePath: ws.filePath,
        data: ws.data,
        title: ws.data.name?.trim() || "Unnamed",
      },
    ];
  }

  /** Drill from a workspace drawer into one of its repositories. */
  private _openRepo(d: DrawerState, repo: { url: string; worktrees: string[] }): void {
    this._drawers = [
      ...this._drawers,
      {
        id: this._nextId(),
        kind: "repo",
        workspacePath: d.workspacePath,
        data: d.data,
        repoUrl: repo.url,
        title: deriveRepoName(repo.url),
      },
    ];
  }

  /** Drill from a repo drawer into one of its worktrees. */
  private _openWorktree(d: DrawerState, worktree: string): void {
    this._drawers = [
      ...this._drawers,
      {
        id: this._nextId(),
        kind: "worktree",
        workspacePath: d.workspacePath,
        data: d.data,
        repoUrl: d.repoUrl,
        worktree,
        title: worktree,
      },
    ];
  }

  private _closeDrawer(id: string): void {
    const idx = this._drawers.findIndex((d) => d.id === id);
    if (idx === -1) return;
    const width = this._widthFor(idx);
    const closing = this._drawers[idx];
    this._drawers = this._drawers.filter((d) => d.id !== id);
    this._finalizeClose([{ ...closing, width }]);
  }

  /** Close every drawer deeper than `index` (clicking a parent/grandparent sliver). */
  private _closeDeeper(index: number): void {
    const closing = this._drawers
      .slice(index + 1)
      .map((d, i) => ({ ...d, width: this._widthFor(index + 1 + i) }));
    this._drawers = this._drawers.slice(0, index + 1);
    this._finalizeClose(closing);
  }

  /** Close every drawer (background click). */
  private _closeAll(): void {
    const closing = this._drawers.map((d, i) => ({ ...d, width: this._widthFor(i) }));
    this._drawers = [];
    this._finalizeClose(closing);
  }

  /** Queue closed drawers to animate out, then drop them after the exit. */
  private _finalizeClose(closing: ClosingDrawer[]): void {
    if (closing.length === 0) return;
    this._closingDrawers = [...this._closingDrawers, ...closing];
    const ids = new Set(closing.map((c) => c.id));
    window.setTimeout(() => {
      this._closingDrawers = this._closingDrawers.filter((c) => !ids.has(c.id));
    }, 220);
  }

  /** Width of the single shared shadow, matching the widest (outermost) drawer. */
  private _stackWidth(): number {
    return this._drawers.length ? this._widthFor(0) : 0;
  }

  /** Clicking the background (card list area) closes all drawers. */
  private _onBackgroundClick = (e: Event): void => {
    if (this._drawers.length === 0) return;
    // A click on a card opens that workspace's drawer instead of closing all.
    if ((e.target as HTMLElement | null)?.closest?.(".ws-row")) return;
    this._closeAll();
  };

  /**
   * Drawer width rules: the deepest drawer is 75%, its direct parent 80%, and
   * every ancestor above that caps at 85%.
   */
  private _widthFor(index: number): number {
    const L = this._drawers.length;
    if (index === L - 1) return 75;
    if (index === L - 2) return 80;
    return 85;
  }

  /** "2 repos" / "1 repo" style label. */
  private _countLabel(n: number, singular: string): string {
    return `${n} ${n === 1 ? singular : singular + "s"}`;
  }

  render(): TemplateResult {
    // Workspaces that already have at least one live workspace window.
    const openPaths = new Set(
      this._openWindows
        .filter((w) => w.windowType === "workspace" && w.workspacePath)
        .map((w) => w.workspacePath as string),
    );
    // Live window count per open workspace path.
    const windowCounts = new Map<string, number>();
    for (const w of this._openWindows) {
      if (w.windowType === "workspace" && w.workspacePath) {
        windowCounts.set(w.workspacePath, (windowCounts.get(w.workspacePath) ?? 0) + 1);
      }
    }

    return html`
      <style>
        :host {
          display: flex;
          height: 100vh;
          background: var(--bg, #1e1e1e);
          color: var(--text-primary, #ddd);
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }
        .wm-root {
          display: flex;
          flex-direction: column;
          flex: 1;
          min-width: 0;
          height: 100%;
          position: relative;
        }
        /* Draggable top bar (native drag region) with a macOS traffic-light spacer. */
        .wm-titlebar {
          display: flex;
          align-items: center;
          flex-shrink: 0;
          height: 32px;
          padding-left: ${isMac ? 85 : 12}px;
          box-sizing: border-box;
          -webkit-app-region: drag;
          user-select: none;
          background: var(--bg-secondary, #252526);
          border-bottom: 1px solid var(--divider, #333);
        }
        .wm-title {
          font-size: 12px;
          font-weight: 600;
          letter-spacing: 0.02em;
          color: var(--text-secondary, #999);
        }
        .wm-drawer-layer {
          position: relative;
          flex: 1;
          min-height: 0;
          overflow: hidden;
        }
        .wm-body {
          position: absolute;
          inset: 0;
          overflow-y: auto;
          padding: 20px;
          box-sizing: border-box;
        }
        ul { list-style: none; margin: 0; padding: 0; }
        li.ws-row {
          position: relative;
          display: flex;
          flex-direction: column;
          gap: 4px;
          padding: 8px 10px;
          margin-bottom: 6px;
          background: var(--bg-hover, #2a2d2e);
          border: 1px solid var(--divider, #333);
          border-radius: 6px;
          cursor: pointer;
          transition: background 0.1s ease;
        }
        li.ws-row:hover { background: var(--bg-active, #37373d); }
        .ws-top { display: flex; align-items: center; gap: 8px; width: 100%; }
        .ws-name {
          flex: 1;
          min-width: 0;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          padding-right: 24px;
        }
        .ws-row--open .ws-name { padding-right: 152px; }
        .ws-meta { color: var(--text-secondary, #999); font-size: 12px; text-align: left; }
        /* Right-side group (Open pill + drill-in chevron), centred in the card. */
        .ws-right {
          position: absolute;
          right: 10px;
          top: 50%;
          transform: translateY(-50%);
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .ws-window-pill {
          border-radius: 999px;
          padding: 2px 9px;
          font-size: 11px;
          font-weight: 600;
          font-family: inherit;
          color: var(--text-secondary, #999);
          background: var(--bg-active, #37373d);
          white-space: nowrap;
          user-select: none;
        }
        .ws-open-pill {
          border-radius: 999px;
          padding: 2px 9px;
          font-size: 11px;
          font-weight: 600;
          font-family: inherit;
          color: var(--accent, #569cd6);
          background: rgba(86, 156, 214, 0.15);
          white-space: nowrap;
          user-select: none;
        }
        .ws-chevron { flex-shrink: 0; display: block; color: var(--accent, #569cd6); }
        .empty { color: var(--text-secondary, #777); font-size: 13px; }
        /* ── Drawer ─────────────────────────────────────────────── */
        /* A single shared shadow element whose width tracks the widest drawer,
           so the stack never stacks multiple shadows on top of each other. */
        .drawer-shadow {
          position: absolute;
          top: 0;
          right: 0;
          bottom: 0;
          pointer-events: none;
          box-shadow: -8px 0 24px rgba(0, 0, 0, 0.35);
          transition: width 0.2s ease;
          /* Slide out with the first drawer so the shadow emerges in lockstep,
             rather than popping in at full width. */
          animation: dw-slide 0.18s ease;
        }
        .drawer {
          position: absolute;
          top: 0;
          right: 0;
          bottom: 0;
          display: flex;
          flex-direction: column;
          min-width: 0;
          background: var(--bg-secondary, #252526);
          border-left: 1px solid var(--divider, #444);
          transition: width 0.2s ease;
          animation: dw-slide 0.18s ease;
        }
        /* Mask over any non-top drawer: blocks its buttons/items (no tint — the
           drawer keeps the same colour). Clicking the exposed sliver closes the
           deeper drawers. */
        .drawer-mask {
          position: absolute;
          inset: 0;
          z-index: 2;
          background: transparent;
          cursor: pointer;
        }
        @keyframes dw-slide {
          from { transform: translateX(24px); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        @keyframes dw-slide-out {
          from { transform: translateX(0); opacity: 1; }
          to { transform: translateX(24px); opacity: 0; }
        }
        /* A drawer that is leaving slides out to the right and fades. */
        .drawer--closing {
          animation: dw-slide-out 0.18s ease forwards;
          pointer-events: none;
        }
        .drawer-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          flex-shrink: 0;
          height: 44px;
          padding: 0 14px;
          border-bottom: 1px solid var(--divider, #333);
        }
        .drawer-title {
          font-size: 13px;
          font-weight: 600;
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .drawer-actions { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
        .dw-open {
          border: none;
          border-radius: 4px;
          background: rgba(86, 156, 214, 0.15);
          color: var(--accent, #569cd6);
          font-size: 12px;
          font-weight: 600;
          padding: 4px 10px;
          cursor: pointer;
        }
        .dw-open:hover { background: rgba(86, 156, 214, 0.25); }
        .dw-close {
          border: none;
          background: transparent;
          color: var(--text-secondary, #999);
          font-size: 16px;
          width: 26px;
          height: 26px;
          border-radius: 4px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
        }
        .dw-close:hover { background: var(--bg-active, #37373d); color: var(--text-primary, #ddd); }
        .drawer-body { flex: 1; min-height: 0; overflow-y: auto; padding: 14px; }
        .dw-list { list-style: none; margin: 0; padding: 0; }
        .dw-item {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 10px;
          margin-bottom: 4px;
          border-radius: 4px;
          cursor: pointer;
        }
        .dw-item:hover { background: var(--bg-active, #37373d); }
        .dw-item-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .dw-item-meta { color: var(--text-secondary, #999); font-size: 12px; }
        .dw-meta-block { color: var(--text-secondary, #999); font-size: 12px; line-height: 1.6; }
      </style>
      <div class="wm-root">
        <div class="wm-titlebar">
          <span class="wm-title">Window Manager</span>
        </div>
        <div class="wm-drawer-layer">
          <div class="wm-body" @click=${this._onBackgroundClick}>
            ${this._loaded && this._workspaces.length === 0
              ? html`<p class="empty">No workspaces yet. Create one from an open workspace window.</p>`
              : html`
                  <ul>
                    ${this._workspaces.map((w) => {
                      const name = w.data.name?.trim() || "Unnamed";
                      const repos = w.data.repos?.length ?? 0;
                      const worktrees = (w.data.repos ?? []).reduce(
                        (n, r) => n + (r.worktrees?.length ?? 0),
                        0,
                      );
                      const isOpen = openPaths.has(w.filePath);
                      const windows = windowCounts.get(w.filePath) ?? 0;
                      return html`
                        <li class="ws-row ${isOpen ? "ws-row--open" : ""}" @click=${(e: Event) => { e.stopPropagation(); this._openWorkspace(w); }}>
                          <div class="ws-top">
                            <span class="ws-name">${name}</span>
                          </div>
                          <div class="ws-meta">${this._countLabel(repos, "repo")} · ${this._countLabel(worktrees, "worktree")}</div>
                          <div class="ws-right">
                            ${isOpen
                              ? html`
                                  <span class="ws-window-pill">${this._countLabel(windows, "window")}</span>
                                  <span class="ws-open-pill">Open</span>
                                `
                              : nothing}
                            <svg class="ws-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>
                          </div>
                        </li>
                      `;
                    })}
                  </ul>
                `}
          </div>
          ${this._drawers.length > 0
            ? html`<div class="drawer-shadow" style="width:${this._stackWidth()}%"></div>`
            : nothing}
          ${this._drawers.map(
            (d, i) => html`
              <div class="drawer" style="width:${this._widthFor(i)}%">
                ${i < this._drawers.length - 1
                  ? html`<div class="drawer-mask" @click=${(e: Event) => { e.stopPropagation(); this._closeDeeper(i); }}></div>`
                  : nothing}
                <div class="drawer-head">
                  <span class="drawer-title">${d.title}</span>
                  <div class="drawer-actions">
                    ${d.kind === "workspace" && !openPaths.has(d.workspacePath)
                      ? html`<button class="dw-open" @click=${(e: Event) => { e.stopPropagation(); this._openWorkspaceWindow(d.workspacePath); }}>Open</button>`
                      : nothing}
                    <button class="dw-close" @click=${(e: Event) => { e.stopPropagation(); this._closeDrawer(d.id); }} title="Close">✕</button>
                  </div>
                </div>
                <div class="drawer-body">${this._drawerContent(d)}</div>
              </div>
            `,
          )}
          ${this._closingDrawers.map(
            (c) => html`
              <div class="drawer drawer--closing" style="width:${c.width}%">
                <div class="drawer-head">
                  <span class="drawer-title">${c.title}</span>
                </div>
                <div class="drawer-body">${this._drawerContent(c)}</div>
              </div>
            `,
          )}
        </div>
      </div>
    `;
  }

  private _drawerContent(d: DrawerState): TemplateResult {
    if (d.kind === "workspace") {
      const repos = d.data.repos ?? [];
      if (repos.length === 0) {
        return html`<p class="empty">No repositories in this workspace.</p>`;
      }
      return html`
        <ul class="dw-list">
          ${repos.map(
            (repo) => html`
              <li class="dw-item" @click=${(e: Event) => { e.stopPropagation(); this._openRepo(d, repo); }}>
                <span class="dw-item-name">${deriveRepoName(repo.url)}</span>
                <span class="dw-item-meta">${repo.worktrees?.length ?? 0} worktree${(repo.worktrees?.length ?? 0) === 1 ? "" : "s"}</span>
              </li>
            `,
          )}
        </ul>
      `;
    }

    if (d.kind === "repo") {
      const repo = d.data.repos?.find((r) => r.url === d.repoUrl);
      const wts = repo?.worktrees ?? [];
      if (wts.length === 0) {
        return html`<p class="empty">No worktrees yet.</p>`;
      }
      return html`
        <ul class="dw-list">
          ${wts.map(
            (wt) => html`
              <li class="dw-item" @click=${(e: Event) => { e.stopPropagation(); this._openWorktree(d, wt); }}>
                <span class="dw-item-name">${wt}</span>
                <span class="dw-item-meta">worktree</span>
              </li>
            `,
          )}
        </ul>
      `;
    }

    // worktree detail
    const repoName = d.repoUrl ? deriveRepoName(d.repoUrl) : d.title;
    return html`
      <p class="empty">${d.worktree ?? ""}</p>
      <p class="dw-meta-block">Workspace: ${d.data.name?.trim() || "Unnamed"}<br />Repo: ${repoName}</p>
    `;
  }
}

customElements.define("openp41ge-window-manager", Openp41geWindowManager);
