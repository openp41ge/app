/**
 * Workspace manager modal controller — list + detail views.
 *
 * List view shows all .openp41ge-workspace files from
 * ~/.openp41ge/workspaces/. Clicking a workspace slides to a detail
 * view with its settings. "New Workspace" creates a new workspace file.
 */

import { html, nothing, type TemplateResult } from "lit";
import type { EditorSystemTabController } from "../../controllers/types";
import type { WorkspaceFileData } from "../../../layout/types";
import { workspaceFileService, workspaceMatchesQuery } from "../../services/workspace-file-service";
import { showConfirmModal } from "../../components/openp41ge-confirm-modal";
import { toastService } from "../../components/openp41ge-toast";
import { emitOpenSystemTab } from "../../components/openp41ge-worktree-controller";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const bridge = (): any => window.openp41ge;

interface WorktreeEntry {
  name: string;
  status: "unverified" | "validating" | "success" | "failure" | "diverged" | "needs-sync";
  errorMessage?: string;
  warningMessage?: string;
}

interface CreateRepoEntry {
  url: string;
  status: "unverified" | "validating" | "success" | "failure" | "diverged" | "needs-sync";
  errorMessage?: string;
  expanded: boolean;
  worktrees: WorktreeEntry[];
  newWorktreeValue: string;
  showNewWorktreeInput: boolean;
}

/** A single line in a status list: coloured dot + text + optional action button. */
interface StatusItem {
  tone: "ok" | "info" | "warn" | "error";
  text: string;
  detail?: string;
  action?: { label: string; title: string; icon?: string; onClick: () => void };
}

type View = "list" | "detail";

export class WorkspaceManagerModal implements EditorSystemTabController {
  readonly id: string;
  readonly appType = "workspace-manager";

  get title(): string {
    if (this._creating) {
      const name = this._createName.trim();
      return `Workspaces  >  ${name || "Unnamed"}`;
    }
    if (this._view === "detail" && this._selected) {
      const name = this._selected.data.name ?? "";
      return `Workspaces  >  ${name.trim() || "Unnamed"}`;
    }
    return "Workspaces";
  }

  private _view: View = "list";

  /** Active view of the modal ('list' | 'detail'). */
  get view(): View { return this._view; }
  private _selected: { filePath: string; data: WorkspaceFileData } | null = null;

  /** Per-workspace working-tree change stats (loaded async per card). */
  private _stats = new Map<string, { filesChanged: number; added: number; deleted: number; untracked: number }>();

  /** Whether we're in the "creating" state (showing the create form). */
  private _creating = false;
  private _createName = "";
  private _createRepos: CreateRepoEntry[] = [];
  private _reordering = false;
  private _reorderSnapshot: CreateRepoEntry[] = [];
  private _dragIndex: number | null = null;
  private _newRepoValue = "";
  private _showNewRepoInput = false;

  /** Error message for workspace name validation. */
  private _nameError = "";

  /** Whether user has attempted to create (triggers validation UI). */
  private _nameTouched = false;

  /** Error for repo URL validation. */
  private _repoUrlError = "";

  /** Detail view editing state. */
  private _detailRepos: CreateRepoEntry[] = [];
  private _showAddInput = false;
  private _addInputValue = "";
  private _detailRepoUrlError = "";
  private _detailExpanded: boolean[] = [];

  private get _nameValid(): boolean {
    return this._createName.trim().length > 0;
  }

  /**
   * Whether the panel renders its own search box. When hosted in the
   * title-bar pill the search input lives in the pill instead (no duplicates).
   */
  private readonly _showSearch: boolean;

  constructor(tabId: string, options?: { showSearch?: boolean }) {
    this.id = tabId;
    this._showSearch = options?.showSearch ?? true;
  }

  /** Search query driving the workspace filter (used by a hosted search input). */
  get query(): string {
    return this._searchQuery;
  }
  set query(q: string) {
    if (this._searchQuery === q) return;
    this._searchQuery = q;
    this._emitUpdate();
  }

  /** Access the openp41ge bridge (guaranteed non-null in app). */
  private get _bridge(): ReturnType<typeof bridge> {
    return bridge();
  }

  mount(): void {
    document.addEventListener("workspace-modal:back", this._onModalBack);
    this._loadWorkspaces();
    // Focus the search input so "click the pill → type → filter" works
    // immediately (HTML `autofocus` doesn't fire on dynamically mounted nodes).
    setTimeout(() => this._focusSearch(), 0);
  }

  private _focusSearch(): void {
    const el = document.querySelector("[data-workspace-search-input]");
    if (el instanceof HTMLInputElement) el.focus();
  }

  // ── State refresh ───────────────────────────────────────────────

  private _workspaces: Array<{ filePath: string; data: WorkspaceFileData }> = [];

  /** Search query filtering the workspace list (name, repo, worktree). */
  private _searchQuery = "";

  private get _filteredWorkspaces(): Array<{ filePath: string; data: WorkspaceFileData }> {
    const q = this._searchQuery.trim();
    return q
      ? this._workspaces.filter((e) => workspaceMatchesQuery(e.data, e.filePath, q))
      : this._workspaces;
  }

  private async _loadWorkspaces(): Promise<void> {
    try {
      this._workspaces = await workspaceFileService.listWorkspaces();
    } catch {
      this._workspaces = [];
    }
    this._emitUpdate();
    this._refreshStats();
  }

  /** Fetch working-tree change stats for every listed workspace (best-effort). */
  private _refreshStats(): void {
    for (const entry of this._workspaces) {
      this._stats.delete(entry.filePath); // mark as loading
      void this._fetchStats(entry);
    }
    this._emitUpdate();
  }

  private async _fetchStats(entry: { filePath: string; data: WorkspaceFileData }): Promise<void> {
    try {
      const stats = await this._bridge.workspaceData.getWorkspaceStats(entry.data.repos ?? []);
      if (this._workspaces.some((w) => w.filePath === entry.filePath)) {
        this._stats.set(entry.filePath, stats);
        this._emitUpdate();
      }
    } catch {
      // Leave card without stats.
    }
  }

  /** Render the metadata line for a workspace card (repos, worktrees, edits). */
  private _cardMeta(entry: { filePath: string; data: WorkspaceFileData }): TemplateResult {
    const repos = entry.data.repos ?? [];
    const reposCount = repos.length;
    const worktreesCount = repos.reduce((s, r) => s + (r.worktrees?.length ?? 0), 0);
    const stats = this._stats.get(entry.filePath);
    const showEdits = !!stats && (stats.added > 0 || stats.deleted > 0 || stats.untracked > 0);
    return html`
      <span>${reposCount} ${reposCount === 1 ? "repo" : "repos"}</span>
      <span class="wm-meta-sep">·</span>
      <span>${worktreesCount} ${worktreesCount === 1 ? "worktree" : "worktrees"}</span>
      ${!stats
        ? html`<span class="wm-meta-sep">·</span><span class="wm-meta-loading">…</span>`
        : showEdits
          ? html`
              <span class="wm-meta-sep">·</span>
              ${stats.added > 0 ? html`<span class="wm-add">+${stats.added}</span>` : nothing}
              ${stats.deleted > 0 ? html`<span class="wm-del">−${stats.deleted}</span>` : nothing}
              ${stats.untracked > 0
                ? html`<span class="wm-meta-sep">·</span><span>${stats.untracked} untracked</span>`
                : nothing}
            `
          : nothing}
    `;
  }

  private _emitUpdate(): void {
    document.dispatchEvent(new CustomEvent("workspaces-tab:update", { bubbles: true }));
  }

  /**
   * Self-contained accordion item renderer.
   * Neighbor-aware border/radius logic is computed internally from the full items array + index.
   * Every caller gets identical behavior — no external opts needed.
   */
  private _renderAccordionItem(
    items: ReadonlyArray<{ url: string; expanded: boolean }>,
    index: number,
    expandedContent: TemplateResult | null,
    actionsContent: TemplateResult | null,
    trailingContent: TemplateResult | null,
    onToggle: () => void,
    statusContent: TemplateResult | null = null,
  ): TemplateResult {
    const item = items[index];
    const isStandalone = item.expanded;
    const isFirst = index === 0;
    const prevExpanded = index > 0 && items[index - 1].expanded;
    const nextExpanded = index < items.length - 1 && items[index + 1].expanded;

    let wrapperStyle = 'box-sizing:border-box;min-height:38px;background:rgba(255,255,255,.04);overflow:hidden;';
    let headerStyle = 'display:flex;align-items:center;gap:6px;padding:8px 10px;height:37px;box-sizing:border-box;cursor:pointer;user-select:none;';

    if (isStandalone) {
      wrapperStyle += `border-radius:6px;margin:${index === 0 ? '0 0 4px 0' : '4px 0'};`;
      headerStyle += 'border-radius:6px 6px 0 0;';
    } else {
      const showTopBorder = isFirst || prevExpanded;
      const topRounded = isFirst || prevExpanded;
      const bottomRounded = !!nextExpanded;
      wrapperStyle += 'border-left:1px solid var(--divider,#333);';
      wrapperStyle += 'border-right:1px solid var(--divider,#333);';
      wrapperStyle += 'border-bottom:1px solid var(--divider,#333);';
      if (showTopBorder) wrapperStyle += 'border-top:1px solid var(--divider,#333);';
      if (topRounded && bottomRounded) wrapperStyle += 'border-radius:6px;';
      else if (topRounded) wrapperStyle += 'border-radius:6px 6px 0 0;';
      else if (bottomRounded) wrapperStyle += 'border-radius:0 0 6px 6px;';
      if (topRounded) headerStyle += 'border-radius:6px 6px 0 0;';
    }

    return html`
      <div class="repo-wrapper" style="${wrapperStyle}">
        <div class="cr-row" tabindex="0"
          style="${headerStyle}"
          @click=${onToggle}
          @keydown=${(e: KeyboardEvent) => {
            if (e.key === 'ArrowRight' && !item.expanded) { onToggle(); }
            if (e.key === 'ArrowLeft' && item.expanded) { onToggle(); }
            if (e.key === 'ArrowDown' && item.expanded) {
              e.preventDefault();
              const wrapper = (e.currentTarget as HTMLElement).closest('.repo-wrapper');
              if (wrapper) {
                const first = wrapper.querySelector('input, .cr-row');
                if (first instanceof HTMLElement) first.focus();
              }
            }
            if (e.key === 'ArrowUp') {
              e.preventDefault();
              const allHeaders = Array.from(document.querySelectorAll('.repo-wrapper > .cr-row'));
              const idx = allHeaders.indexOf(e.currentTarget as HTMLElement);
              const prev = allHeaders[idx - 1];
              if (prev instanceof HTMLElement) prev.focus();
            }
          }}
        >
          <openp41ge-inline-icon name="chevron-right" size="12" no-hover icon-color="var(--text-secondary,#999)" style="transform:rotate(${item.expanded ? '90deg' : '0deg'});"></openp41ge-inline-icon>
          <span style="flex:1;font-size:12px;color:var(--text-primary,#ccc);word-break:break-all;">${item.url}</span>
          ${actionsContent}
          ${trailingContent}
        </div>
        ${statusContent ?? ''}
        ${item.expanded && expandedContent ? expandedContent : ''}
      </div>
    `;
  }

  /** Shared delete/hover span for repo rows */
  private _renderDeleteAction(onRemove: (e: Event) => void): TemplateResult {
    return html`
      <openp41ge-inline-icon name="close" size="12" no-hover @click=${onRemove}></openp41ge-inline-icon>
    `;
  }

  /** Colour for a status tone. */
  private _toneColor(tone: StatusItem["tone"]): string {
    return tone === "ok" ? "var(--accent,#007acc)"
      : tone === "warn" ? "var(--text-warning,#e5a50a)"
      : tone === "error" ? "var(--error,#e53e3e)"
      : "var(--text-secondary,#999)";
  }

  /** Stacked status lines: coloured dot + text + optional action pill. */
  private _renderStatusList(items: StatusItem[], onAreaClick?: () => void): TemplateResult {
    return html`
      <div class="wsc-status-list" style="display:flex;flex-direction:column;gap:4px;${onAreaClick ? 'cursor:pointer;' : ''}"
        @click=${(e: Event) => {
          if (!onAreaClick) return;
          const target = e.target as HTMLElement | null;
          if (target && target.closest && target.closest('.wsc-status-btn')) return;
          onAreaClick();
        }}>
        ${items.map((it) => html`
          <div style="display:flex;align-items:center;gap:7px;font-size:11px;line-height:1.35;">
            <span style="flex:1;min-width:0;color:${this._toneColor(it.tone)};">${it.text}${it.detail ? html` <span style="color:var(--text-secondary,#999);">· ${it.detail}</span>` : ''}</span>
            ${it.action ? (it.action.icon
              ? html`
              <span class="wsc-status-icon-btn" flex-shrink="0" title=${it.action.title} style="display:inline-flex;align-items:center;justify-content:center;padding:1px;border-radius:4px;background:rgba(255,255,255,.08);color:var(--text-secondary,#999);cursor:pointer;transition:background .1s;"
                @mouseenter=${(e: Event) => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,.18)'; }}
                @mouseleave=${(e: Event) => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,.08)'; }}
                @click=${(e: Event) => { e.stopPropagation(); it.action!.onClick(); }}>
                <openp41ge-inline-icon name=${it.action.icon} size="12" no-hover></openp41ge-inline-icon>
              </span>
              `
              : html`
              <button type="button" class="wsc-status-btn" style="flex-shrink:0;display:inline-flex;align-items:center;height:18px;box-sizing:border-box;background:var(--bg-hover,#2a2d2e);border:1px solid var(--divider,#444);color:var(--text-primary,#ddd);border-radius:4px;font-size:10px;font-weight:600;padding:0 8px;cursor:pointer;" title=${it.action.title}
                @click=${(e: Event) => { e.stopPropagation(); it.action!.onClick(); }}
                @mouseenter=${(e: Event) => ((e.currentTarget as HTMLElement).style.background = 'var(--accent,#007acc)')}
                @mouseleave=${(e: Event) => ((e.currentTarget as HTMLElement).style.background = 'var(--bg-hover,#2a2d2e)')}>${it.action.label}</button>
              `) : ''}
          </div>
        `)}
      </div>
    `;
  }

  /** True while any of a repo's worktrees is being checked (validating). */
  private _repoIsChecking(repoIndex: number): boolean {
    const repo = this._detailRepos[repoIndex] ?? this._createRepos[repoIndex];
    return !!repo?.worktrees.some((w) => w.status === "validating");
  }

  /** Status list for a single worktree row: one line per state with its action. */
  private _worktreeStatusContent(
    repoIndex: number,
    _wtIndex: number,
    wt: WorktreeEntry,
    onVerify: () => void,
    onSync: () => void,
  ): TemplateResult {
    const items: StatusItem[] = [];
    const checking = this._repoIsChecking(repoIndex);
    switch (wt.status) {
      case 'success':
        items.push({ tone: 'ok', text: 'In sync with remote', detail: wt.warningMessage });
        break;
      case 'needs-sync':
        items.push({ tone: 'warn', text: 'Needs sync', detail: wt.errorMessage || 'ahead/behind remote', action: { label: 'Sync', title: 'Fetch and reset branch to remote', onClick: onSync } });
        break;
      case 'diverged':
        items.push({ tone: 'error', text: 'Diverged from remote', detail: wt.errorMessage, action: { label: 'Resync', title: 'Fetch and reset branch to remote (discards local commits)', onClick: onSync } });
        break;
      case 'failure':
        items.push({ tone: 'error', text: 'Verification failed', detail: wt.errorMessage, action: { label: 'Retry', title: 'Re-check branch status', onClick: onVerify } });
        break;
      case 'validating':
        items.push({ tone: 'info', text: 'Checking status…' });
        break;
      case 'unverified':
        items.push({ tone: 'info', text: 'Not yet verified', action: checking ? undefined : { label: 'Verify', title: 'Check branch status', onClick: onVerify } });
        break;
    }
    return this._renderStatusList(items);
  }

  /** Render a worktree row: title line + status list with actions. */
  private _renderWorktreeRow(
    repoIndex: number,
    wtIndex: number,
    wt: WorktreeEntry,
    onRemove: () => void,
    onVerify: () => void,
    onSync: () => void,
  ): TemplateResult {
    return html`
      <div class="cr-row wsc-wt-row" tabindex="-1" style="display:flex;flex-direction:column;padding:8px 10px;" @mouseenter=${(e: Event) => { const del = (e.currentTarget as HTMLElement).querySelector('.wt-del'); if (del instanceof HTMLElement) del.style.visibility = 'visible'; }} @mouseleave=${(e: Event) => { const del = (e.currentTarget as HTMLElement).querySelector('.wt-del'); if (del instanceof HTMLElement) del.style.visibility = 'hidden'; }} @keydown=${(e: KeyboardEvent) => {
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              e.preventDefault();
              const all = Array.from((e.currentTarget as HTMLElement).closest('.repo-wrapper')?.querySelectorAll('.cr-row') ?? []);
              const idx = all.indexOf(e.currentTarget as HTMLElement);
              const next = e.key === 'ArrowDown' ? all[idx + 1] : all[idx - 1];
              if (next instanceof HTMLElement) next.focus();
            }
          }}>
        <div style="display:flex;align-items:center;gap:6px;">
          <openp41ge-inline-icon name="corner" size="12" no-hover icon-color="var(--text-secondary,#555)"></openp41ge-inline-icon>
          <span style="flex:1;font-size:12px;color:var(--text-primary,#ccc);word-break:break-all;">${wt.name}</span>
          <span class="wt-del" style="display:flex;align-items:center;visibility:hidden;">
            <openp41ge-inline-icon name="close" size="12" no-hover @click=${onRemove}></openp41ge-inline-icon>
          </span>
        </div>
        ${this._worktreeStatusContent(repoIndex, wtIndex, wt, onVerify, onSync)}
      </div>
    `;
  }

  /** Status list for a repository row (cloned): aggregate + per-worktree trouble lines. */
  private _repoStatusContent(i: number, entry: CreateRepoEntry, onToggle: () => void): TemplateResult {
    const items: StatusItem[] = [];
    const trouble: Array<{ tone: 'warn' | 'error'; wt: WorktreeEntry; label: string; title: string; onClick: () => void }> = [];
    let validating = 0;
    let unverified = 0;
    entry.worktrees.forEach((wt, wtIndex) => {
      if (wt.status === 'needs-sync') {
        trouble.push({ tone: 'warn', wt, label: 'Sync', title: 'Fetch and reset branch to remote', onClick: () => { this._detailSyncWorktree(i, wtIndex); } });
      } else if (wt.status === 'diverged') {
        trouble.push({ tone: 'error', wt, label: 'Resync', title: 'Fetch and reset branch to remote (discards local commits)', onClick: () => { this._detailSyncWorktree(i, wtIndex); } });
      } else if (wt.status === 'failure') {
        trouble.push({ tone: 'error', wt, label: 'Retry', title: 'Re-check branch status', onClick: () => { this._forceVerifyWorktree(i, wtIndex); } });
      } else if (wt.status === 'validating') {
        validating += 1;
      } else if (wt.status === 'unverified') {
        unverified += 1;
      }
    });
    const total = entry.worktrees.length;
    if (validating > 0) {
      items.push({ tone: 'info', text: 'Checking worktrees…' });
    }
    if (total === 0) {
      items.push({ tone: 'info', text: 'No worktrees yet — add one when the repository is expanded.' });
    } else if (trouble.length > 0) {
      items.push({
        tone: 'warn',
        text: `${trouble.length} of ${total} worktree${total > 1 ? 's' : ''} need attention`,
        action: { label: 'Sync all', title: 'Resync all out-of-sync worktrees to remote', onClick: () => { this._detailSyncAll(i); } },
      });
      for (const t of trouble) {
        items.push({ tone: t.tone, text: `worktree ${t.wt.name}`, detail: t.wt.errorMessage, action: { label: t.label, title: t.title, onClick: t.onClick } });
      }
    } else if (unverified > 0) {
      items.push({
        tone: 'info',
        text: `${unverified} of ${total} worktree${total > 1 ? 's' : ''} not yet verified`,
        action: validating === 0 ? { label: 'Verify', title: 'Check worktree sync status', onClick: () => { this._detailVerifyAll(i); } } : undefined,
      });
    } else if (validating === 0) {
      items.push({
        tone: 'ok',
        text: 'All worktrees are up to date',
        action: { label: 'Reverify', title: 'Re-check worktree sync status', icon: 'refresh', onClick: () => { this._detailVerifyAll(i); } },
      });
    }
    return this._renderStatusList(items, onToggle);
  }

  /** Repo-level sync indicator: warning when any worktree needs attention, else a green check. */
  /** Style string for a repo wrapper based on expanded/collapsed state and neighbor state. */
  private _repoWrapperStyle(i: number, entry: CreateRepoEntry, repos?: CreateRepoEntry[]): string {
    const arr = repos ?? this._createRepos;
    if (entry.expanded) {
      return 'box-sizing:border-box;min-height:38px;border:1px solid var(--divider,#333);border-radius:6px;margin:4px 0;background:rgba(255,255,255,.04);';
    }
    // Collapsed — figure out if neighbors are expanded for border-radius
    const prevExpanded = i > 0 && arr[i - 1]?.expanded;
    const nextExpanded = i < arr.length - 1 && arr[i + 1]?.expanded;
    const showTopBorder = i === 0 || prevExpanded;
    const topRounded = i === 0 || prevExpanded;
    const bottomRounded = !!nextExpanded;
    let style = 'box-sizing:border-box;min-height:38px;background:rgba(255,255,255,.04);';
    style += 'border-left:1px solid var(--divider,#333);';
    style += 'border-right:1px solid var(--divider,#333);';
    style += 'border-bottom:1px solid var(--divider,#333);';
    style += showTopBorder ? 'border-top:1px solid var(--divider,#333);' : '';
    if (topRounded && bottomRounded) style += 'border-radius:6px;';
    else if (topRounded) style += 'border-radius:6px 6px 0 0;';
    else if (bottomRounded) style += 'border-radius:0 0 6px 6px;';
    return style;
  }

  /** Style string for the "+ add repository" row, which gets top rounded corners when the last repo is expanded. */
  private _addRepoRowStyle(): string {
    // When the input row is visible, +add is connected BELOW it (not directly after repos)
    const directlyAfterRepos = !this._showNewRepoInput;
    const lastExpanded = directlyAfterRepos && this._createRepos.length > 0 && this._createRepos[this._createRepos.length - 1].expanded;
    const isFirst = this._createRepos.length === 0 && !this._showNewRepoInput;
    const showTopBorder = isFirst;
    // If last repo above is expanded and there's no input row between, this row becomes its own card
    if (lastExpanded) {
      return 'display:flex;align-items:center;gap:4px;padding:8px 10px;height:38px;box-sizing:border-box;border:1px solid var(--divider,#333);border-radius:6px;margin:-1px 0 0;background:rgba(255,255,255,.04);cursor:pointer;color:var(--text-placeholder,#6e6e6e);font-size:12px;';
    }
    // Connected to the group above — always left, right, bottom; top only if first
    let style = 'display:flex;align-items:center;gap:4px;padding:8px 10px;height:38px;box-sizing:border-box;background:rgba(255,255,255,.04);cursor:pointer;color:var(--text-placeholder,#6e6e6e);font-size:12px;';
    style += 'border-left:1px solid var(--divider,#333);';
    style += 'border-right:1px solid var(--divider,#333);';
    style += 'border-bottom:1px solid var(--divider,#333);';
    if (showTopBorder) style += 'border-top:1px solid var(--divider,#333);';
    style += isFirst ? 'border-radius:6px;' : 'border-radius:0 0 6px 6px;';
    return style;
  }

  /** Style string for the detail view's "+ add repository" row, matching create form's _addRepoRowStyle. */
  private _detailAddRepoRowStyle(): string {
    // Flat row: no box. The CSS rule `.repo-wrapper + .cr-row` renders the
    // bright inner separator above it.
    return 'display:flex;align-items:center;gap:4px;padding:8px 10px;height:38px;box-sizing:border-box;background:rgba(255,255,255,.04);cursor:pointer;color:var(--text-placeholder,#6e6e6e);font-size:12px;';
  }

  /** Shared renderer for an unverified/failed/validating repo row (no accordion). */
  private _renderUnverifiedRepoRow(
    i: number,
    entry: CreateRepoEntry,
    repos?: CreateRepoEntry[],
    onRemove?: (i: number) => void,
    onRetry?: (i: number) => void,
    detailed = false,
  ): TemplateResult {
    const arr = repos ?? this._createRepos;
    const handleRemove = onRemove ?? ((idx: number) => this._removeCreateRepo(idx));
    const handleRetry = onRetry ?? ((idx: number) => this._verifyRepo(idx));
    if (detailed) {
      // Larger row with a status list + action buttons (Workspace detail view).
      const items: StatusItem[] = [];
      if (entry.status === 'validating') {
        items.push({ tone: 'info', text: 'Verifying repository access…' });
      } else if (entry.status === 'failure') {
        items.push({ tone: 'error', text: 'Repository not accessible', detail: entry.errorMessage, action: { label: 'Retry', title: 'Re-check repository access', onClick: () => handleRetry(i) } });
      } else {
        items.push({ tone: 'info', text: 'Not verified yet', action: { label: 'Verify', title: 'Check repository access', onClick: () => handleRetry(i) } });
      }
      return html`
        <div class="repo-wrapper" style="${this._repoWrapperStyle(i, entry, arr)}">
          <div class="cr-row" tabindex="0" style="display:flex;align-items:center;gap:6px;padding:8px 10px;height:37px;box-sizing:border-box;${i === 0 ? 'border-radius:6px 6px 0 0;' : ''}">
            <openp41ge-inline-icon name="chevron-right" size="12" no-hover icon-color="var(--text-secondary,#555)"></openp41ge-inline-icon>
            <span style="flex:1;font-size:12px;color:var(--text-primary,#ccc);word-break:break-all;">${entry.url}</span>
            <div class="row-actions">
              <openp41ge-inline-icon name="close" size="12" no-hover @click=${() => handleRemove(i)}></openp41ge-inline-icon>
            </div>
            <span style="display:flex;align-items:center;visibility:${entry.status === 'unverified' ? 'hidden' : 'visible'};">
              ${entry.status === 'failure' ? html`
                <openp41ge-inline-icon name="refresh" size="12" icon-color="var(--error,#e53e3e)" hover-color="danger" title="Retry" @click=${() => handleRetry(i)}></openp41ge-inline-icon>
              ` : html`
                <openp41ge-inline-icon name="spinner" size="12" no-hover icon-color="var(--text-secondary,#999)"></openp41ge-inline-icon>
              `}
            </span>
          </div>
          ${this._renderStatusList(items)}
        </div>
      `;
    }
    return html`
      <div class="repo-wrapper" style="${this._repoWrapperStyle(i, entry, arr)}">
        <div class="cr-row" tabindex="0" style="display:flex;align-items:center;gap:6px;padding:8px 10px;height:37px;box-sizing:border-box;${i === 0 ? 'border-radius:6px 6px 0 0;' : ''}">
          <openp41ge-inline-icon name="chevron-right" size="12" no-hover icon-color="var(--text-secondary,#555)"></openp41ge-inline-icon>
          <span style="flex:1;font-size:12px;color:var(--text-primary,#ccc);word-break:break-all;">${entry.url}</span>
          <div class="row-actions">
            <openp41ge-inline-icon name="close" size="12" no-hover @click=${() => handleRemove(i)}></openp41ge-inline-icon>
          </div>
          <!-- Always-rendered status icon (hidden when unverified so layout doesn't shift) -->
          <span
            style="display:flex;align-items:center;visibility:${entry.status === 'unverified' ? 'hidden' : 'visible'};"
            @click=${(e: Event) => { if (entry.status === 'failure') { e.stopPropagation(); handleRetry(i); } }}
          >
            ${entry.status === 'failure' ? html`
              <openp41ge-inline-icon name="refresh" size="12" icon-color="var(--error,#e53e3e)" hover-color="danger"></openp41ge-inline-icon>
            ` : html`
              <openp41ge-inline-icon name="spinner" size="12" no-hover icon-color="var(--text-secondary,#999)"></openp41ge-inline-icon>
            `}
          </span>
        </div>
        ${entry.status === 'failure' && entry.errorMessage ? html`
          <div style="font-size:12px;color:var(--error,#e53e3e);padding:2px 10px 6px 32px;">${entry.errorMessage}</div>
        ` : ''}
      </div>
    `;
  }

  private _moveRepoUp(i: number): void {
    if (i <= 0) return;
    const temp = this._createRepos[i];
    this._createRepos[i] = this._createRepos[i - 1];
    this._createRepos[i - 1] = temp;
    this._emitUpdate();
  }

  private _moveRepoDown(i: number): void {
    if (i >= this._createRepos.length - 1) return;
    const temp = this._createRepos[i];
    this._createRepos[i] = this._createRepos[i + 1];
    this._createRepos[i + 1] = temp;
    this._emitUpdate();
  }

  private _startReorder(): void {
    this._reorderSnapshot = this._createRepos.map(r => ({ ...r, worktrees: [...r.worktrees] }));
    this._reordering = true;
    window.addEventListener('dragover', this._onWindowDragOver);
    window.addEventListener('drop', this._onWindowDrop);
    this._emitUpdate();
  }

  private _confirmReorder(): void {
    this._reordering = false;
    this._reorderSnapshot = [];
    this._removeWindowListeners();
    this._emitUpdate();
  }

  private _cancelReorder(): void {
    this._createRepos = this._reorderSnapshot;
    this._reordering = false;
    this._reorderSnapshot = [];
    this._removeWindowListeners();
    this._emitUpdate();
  }

  private _removeWindowListeners(): void {
    window.removeEventListener('dragover', this._onWindowDragOver);
    window.removeEventListener('drop', this._onWindowDrop);
  }

  private _onWindowDragOver = (e: DragEvent): void => {
    if (!this._reordering) return;
    e.preventDefault();
  }

  private _onWindowDrop = (): void => {
    if (!this._reordering) return;
    this._dragIndex = null;
    this._emitUpdate();
  }

  private _onDragStart(e: DragEvent, i: number): void {
    this._dragIndex = i;
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(i));
      // Create opaque drag ghost
      const el = e.currentTarget as HTMLElement;
      const ghost = el.cloneNode(true) as HTMLElement;
      ghost.style.position = 'absolute';
      ghost.style.top = '-1000px';
      ghost.style.left = '-1000px';
      ghost.style.opacity = '1';
      ghost.style.width = el.offsetWidth + 'px';
      ghost.style.background = 'rgba(255,255,255,.04)';
      document.body.appendChild(ghost);
      e.dataTransfer.setDragImage(ghost, Math.min(e.offsetX || 0, el.offsetWidth - 10), e.offsetY || 0);
      setTimeout(() => ghost.remove(), 0);
    }
    this._emitUpdate();
  }

  private _onDragOver(e: DragEvent, i: number): void {
    e.preventDefault();
    if (this._dragIndex === null || this._dragIndex === i) return;
    // Swap dragged item with target
    const temp = this._createRepos[this._dragIndex];
    this._createRepos[this._dragIndex] = this._createRepos[i];
    this._createRepos[i] = temp;
    this._dragIndex = i;
    this._emitUpdate();
  }

  private _onDrop(): void {
    this._dragIndex = null;
    this._emitUpdate();
  }

  private _onDragEnd(): void {
    this._dragIndex = null;
    this._emitUpdate();
  }

  // ── Navigation ──────────────────────────────────────────────────

  private _onModalBack = (): void => {
    if (this._creating) {
      this._creating = false;
      this._emitUpdate();
    } else if (this._view === "detail") {
      this._showList();
    }
  };

  private _showDetail(entry: { filePath: string; data: WorkspaceFileData }): void {
    this._selected = entry;
    this._view = "detail";
    this._detailRepos = entry.data.repos.map(r => ({
      url: r.url,
      status: "success" as const,
      expanded: false,
      worktrees: r.worktrees.map(w => ({ name: w, status: 'unverified' as const })),
      newWorktreeValue: "",
      showNewWorktreeInput: false,
    }));
    this._detailExpanded = entry.data.repos.map(() => false);
    this._showAddInput = false;
    this._addInputValue = "";
    this._detailRepoUrlError = "";
    this._emitUpdate();
    // Verify the real worktree status on open so the status list reflects
    // actual ahead/behind/diverged state rather than pre-marked "success".
    for (let i = 0; i < this._detailRepos.length; i++) {
      void this._detailVerifyAll(i);
    }
  }

  private _showList(): void {
    this._view = "list";
    this._selected = null;
    this._creating = false;
    this._createName = "";
    this._loadWorkspaces();
    this._emitUpdate();
  }

  private _showCreate(): void {
    this._creating = true;
    this._createName = "";
    this._createRepos = [];
    this._newRepoValue = "";
    this._showNewRepoInput = false;
    this._nameError = "";
    this._nameTouched = false;
    this._repoUrlError = "";
    this._emitUpdate();
  }

  private async _addCreateRepo(): Promise<void> {
    const url = this._newRepoValue.trim();
    if (!url) return;
    // Validate URL has a protocol
    if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(url) && !/^git@/.test(url)) {
      this._repoUrlError = "URL must include a protocol (e.g. https://, git@)";
      this._emitUpdate();
      return;
    }
    this._repoUrlError = "";
    this._createRepos.push({ url, status: "unverified", expanded: false, worktrees: [], newWorktreeValue: "", showNewWorktreeInput: false });
    this._newRepoValue = "";
    this._emitUpdate();
    setTimeout(() => { const el = document.querySelector('.new-repo-input'); if (el instanceof HTMLInputElement) { el.value = ''; el.focus(); } }, 0);
    // Start validation immediately
    await this._verifyRepo(this._createRepos.length - 1);
  }

  private _removeCreateRepo(index: number): void {
    this._createRepos.splice(index, 1);
    this._emitUpdate();
  }

  private async _verifyRepo(index: number): Promise<void> {
    const repo = this._createRepos[index];
    if (!repo || repo.status === "success" || repo.status === "validating") return;
    repo.status = "validating";
    repo.errorMessage = undefined;
    this._emitUpdate();
    try {
      const result = await this._bridge.workspaceData.checkRepoAccess(repo.url);
      if (result.ok) {
        repo.status = "success";
      } else {
        repo.status = "failure";
        repo.errorMessage = result.error || "Repository not accessible";
      }
    } catch (e) {
      repo.status = "failure";
      repo.errorMessage = (e as Error).message || "Verification failed";
    }
    this._emitUpdate();
  }

  private _toggleRepoExpanded(index: number): void {
    const repo = this._createRepos[index];
    if (!repo || repo.status !== "success") return;
    repo.expanded = !repo.expanded;
    this._emitUpdate();
  }

  private async _addWorktree(repoIndex: number): Promise<void> {
    const repo = this._createRepos[repoIndex];
    if (!repo) return;
    const name = repo.newWorktreeValue.trim();
    if (!name) return;
    const entry: WorktreeEntry = { name, status: "unverified" };
    repo.worktrees.push(entry);
    repo.newWorktreeValue = "";
    this._emitUpdate();
    setTimeout(() => { const el = document.querySelector('.wt-input'); if (el instanceof HTMLInputElement) { el.value = ''; el.focus(); } }, 0);
    // Trigger verification
    await this._verifyWorktree(repoIndex, repo.worktrees.length - 1);
  }

  private async _verifyWorktree(repoIndex: number, wtIndex: number): Promise<void> {
    const repo = this._createRepos[repoIndex];
    if (!repo) return;
    const wt = repo.worktrees[wtIndex];
    if (!wt || wt.status === "success" || wt.status === "validating") return;
    wt.status = "validating";
    wt.errorMessage = undefined;
    this._emitUpdate();
    try {
      const result = await this._bridge.workspaceData.checkWorktreeBranch("", repo.url, wt.name);
      wt.status = result.status;
      if (result.error) wt.errorMessage = result.error;
      wt.warningMessage = result.warning || undefined;
    } catch (e) {
      wt.status = "failure";
      wt.errorMessage = (e as Error).message || "Verification failed";
    }
    this._emitUpdate();
  }

  private async _syncWorktree(repoIndex: number, wtIndex: number): Promise<void> {
    const repo = this._createRepos[repoIndex];
    if (!repo) return;
    const wt = repo.worktrees[wtIndex];
    if (!wt || wt.status !== "needs-sync") return;
    // Re-verify after sync (in real git, this would trigger git pull)
    wt.status = "validating";
    wt.errorMessage = undefined;
    this._emitUpdate();
    try {
      const result = await this._bridge.workspaceData.checkWorktreeBranch("", repo.url, wt.name);
      wt.status = result.status;
      if (result.error) wt.errorMessage = result.error;
      wt.warningMessage = result.warning || undefined;
    } catch (e) {
      wt.status = "failure";
      wt.errorMessage = (e as Error).message || "Sync failed";
    }
    this._emitUpdate();
  }

  private _removeWorktree(repoIndex: number, wtIndex: number): void {
    const repo = this._createRepos[repoIndex];
    if (!repo) return;
    repo.worktrees.splice(wtIndex, 1);
    this._emitUpdate();
  }

  // ── Actions ─────────────────────────────────────────────────────

  private async _createWorkspace(): Promise<void> {
    this._nameTouched = true;
    const name = this._createName.trim();
    if (!name) {
      this._nameError = "Name is required";
      this._emitUpdate();
      return;
    }
    this._nameError = "";
    const data = await workspaceFileService.createWorkspace(name);
    if (data) {
      // Check for failures — only save verified repos
      let hasDiverged = false;
      let hasFailures = false;
      for (const entry of this._createRepos) {
        if (entry.status === "diverged") hasDiverged = true;
        if (entry.status === "failure") hasFailures = true;
      }
      if (hasDiverged || hasFailures) {
        // Don't save — let user fix verification first
        return;
      }

      // Clone bare repos and checkout worktrees
      for (const entry of this._createRepos) {
        if (entry.status !== "success") continue;
        const cloneResult = await this._bridge.workspaceData.cloneBareRepo(entry.url);
        if (!cloneResult.ok) {
          entry.status = "failure";
          entry.errorMessage = cloneResult.error || "Clone failed";
          this._emitUpdate();
          continue;
        }
        // Checkout worktrees
        for (const wt of entry.worktrees) {
          if (wt.status !== "success") continue;
          const wtResult = await this._bridge.workspaceData.checkoutWorktree(entry.url, wt.name);
          if (!wtResult.ok) {
            wt.status = "failure";
            wt.errorMessage = wtResult.error || "Worktree checkout failed";
            this._emitUpdate();
          }
        }
      }

      // Persist verified repos with their worktrees
      for (const entry of this._createRepos) {
        if (entry.status === "success") {
          data.repos.push({ url: entry.url, worktrees: entry.worktrees.map(w => w.name) });
        }
      }
      if (this._createRepos.length > 0) {
        await this._bridge.dialog.writeWorkspaceFile(
          `~/.openp41ge/workspaces/${data.id}.openp41ge-workspace`,
          data
        );
      }
      this._creating = false;
      this._createName = "";
      this._createRepos = [];
      this._newRepoValue = "";
      this._showNewRepoInput = false;
      this._loadWorkspaces();
      this._showDetail({ filePath: `~/.openp41ge/workspaces/${data.id}.openp41ge-workspace`, data });
    }
  }

  private async _activateWorkspace(entry: { filePath: string; data: WorkspaceFileData }): Promise<void> {
    workspaceFileService.activateWorkspace(entry);
    // Activating a workspace always opens its default sidebar tab (Explorer →
    // right sidebar); the openSystemTab op creates it if needed, or opens and
    // activates the existing one.
    try {
      const winId = window.openp41ge.workspace.getWindowId();
      if (winId) emitOpenSystemTab(winId, "explorer", "Explorer");
    } catch {
      // ignore — explorer opening is best-effort alongside workspace-file-changed
    }
    this._emitUpdate();
  }

  private async _onDeleteWorkspace(entry: { filePath: string; data: WorkspaceFileData }): Promise<void> {
    const name = entry.data.name?.trim() || entry.data.id || "this workspace";
    const result = await showConfirmModal({
      title: "Delete workspace",
      message: `Delete workspace "${name}"?`,
      detail: "This removes the workspace from the list. Repositories and their worktrees are not deleted unless you also remove the workspace data.",
      confirmLabel: "Delete",
      confirmStyle: "danger",
      checkboxLabel: "Also delete workspace data on disk",
      checkboxDetail: "Removes ~/.openp41ge/workspaces-data/ for this workspace (cloned repos and worktrees).",
    });

    if (!result.confirmed) return;

    const ok = await window.openp41ge.dialog.deleteWorkspaceFile(entry.filePath, result.checked);
    if (!ok) {
      toastService.show("Failed to delete workspace", "error");
      return;
    }

    // If the deleted workspace was the active one, clear the active state
    if (workspaceFileService.activeFilePath === entry.filePath) {
      workspaceFileService.clear();
    }

    toastService.show(`Workspace "${name}" deleted`, "success");
    this._showList();
  }

  // ── Detail view actions ─────────────────────────────────────────

  private async _onSaveAs(): Promise<void> {
    if (this._selected) {
      // Temporarily set as active to use saveAs
      const prevPath = workspaceFileService.activeFilePath;
      const prevData = workspaceFileService.activeData;
      workspaceFileService.activateWorkspace(this._selected);
      await workspaceFileService.saveAs();
      // Restore previous active workspace
      if (prevPath && prevData) {
        workspaceFileService.activateWorkspace({ filePath: prevPath, data: prevData });
      }
      this._loadWorkspaces();
      this._emitUpdate();
    }
  }

  private async _onChangeDataDir(): Promise<void> {
    const folder = await this._bridge.dialog.pickFolder();
    if (!folder || !this._selected) return;
    this._selected.data.dataDir = folder;
    // Persist to disk
    await this._bridge.dialog.writeWorkspaceFile(this._selected.filePath, this._selected.data);
    this._emitUpdate();
  }

  private async _onNameChange(e: Event): Promise<void> {
    if (!this._selected) return;
    const val = (e.target as HTMLInputElement).value;
    this._selected.data.name = val || undefined;
    await this._bridge.dialog.writeWorkspaceFile(this._selected.filePath, this._selected.data);
    this._emitUpdate();
  }

  private _onAddRepo(): void {
    this._showAddInput = true;
    this._addInputValue = "";
    this._emitUpdate();
  }

  private async _onAddConfirm(): Promise<void> {
    const url = this._addInputValue.trim();
    if (!url || !this._selected) return;
    // Validate URL has a protocol
    if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(url) && !/^git@/.test(url)) {
      this._detailRepoUrlError = "URL must include a protocol (e.g. https://, git@)";
      this._emitUpdate();
      return;
    }
    this._detailRepoUrlError = "";
    const index = this._detailRepos.length;
    this._detailRepos.push({ url, status: "unverified", expanded: false, worktrees: [], newWorktreeValue: "", showNewWorktreeInput: false });
    this._detailExpanded.push(false);
    this._addInputValue = "";
    this._emitUpdate();
    setTimeout(() => { const el = document.querySelector('.detail-repo-input'); if (el instanceof HTMLInputElement) { el.value = ''; el.focus(); } }, 0);
    // Verify via real git check
    const repo = this._detailRepos[index];
    repo.status = "validating";
    repo.errorMessage = undefined;
    this._emitUpdate();
    try {
      const result = await this._bridge.workspaceData.checkRepoAccess(url);
      if (result.ok) {
        repo.status = "success";
        await this._syncDetailReposToFile();
      } else {
        repo.status = "failure";
        repo.errorMessage = result.error || "Repository not accessible";
      }
    } catch (e) {
      repo.status = "failure";
      repo.errorMessage = (e as Error).message || "Verification failed";
    }
    this._emitUpdate();
  }

  private _onAddCancel(): void {
    this._showAddInput = false;
    this._addInputValue = "";
    this._emitUpdate();
  }

  private async _onRemoveRepo(index: number): Promise<void> {
    if (!this._selected) return;
    this._detailRepos.splice(index, 1);
    this._detailExpanded.splice(index, 1);
    await this._syncDetailReposToFile();
    this._emitUpdate();
  }

  private async _detailVerifyRepo(index: number): Promise<void> {
    const repo = this._detailRepos[index];
    if (!repo || repo.status === "success" || repo.status === "validating") return;
    repo.status = "validating";
    repo.errorMessage = undefined;
    this._emitUpdate();
    try {
      const result = await this._bridge.workspaceData.checkRepoAccess(repo.url);
      if (result.ok) {
        repo.status = "success";
        await this._syncDetailReposToFile();
      } else {
        repo.status = "failure";
        repo.errorMessage = result.error || "Repository not accessible";
      }
    } catch (e) {
      repo.status = "failure";
      repo.errorMessage = (e as Error).message || "Verification failed";
    }
    this._emitUpdate();
  }

  private async _detailVerifyWorktree(repoIndex: number, wtIndex: number): Promise<void> {
    const repo = this._detailRepos[repoIndex];
    if (!repo) return;
    const wt = repo.worktrees[wtIndex];
    if (!wt || wt.status === "success" || wt.status === "validating") return;
    wt.status = "validating";
    wt.errorMessage = undefined;
    this._emitUpdate();
    try {
      const result = await this._bridge.workspaceData.checkWorktreeBranch("", repo.url, wt.name);
      wt.status = result.status;
      if (result.error) wt.errorMessage = result.error;
      wt.warningMessage = result.warning || undefined;
      if (result.status === "success") await this._syncDetailReposToFile();
    } catch (e) {
      wt.status = "failure";
      wt.errorMessage = (e as Error).message || "Verification failed";
    }
    this._emitUpdate();
  }

  private async _detailSyncWorktree(repoIndex: number, wtIndex: number): Promise<void> {
    const repo = this._detailRepos[repoIndex];
    if (!repo) return;
    const wt = repo.worktrees[wtIndex];
    if (!wt) return;
    wt.status = "validating";
    wt.errorMessage = undefined;
    this._emitUpdate();
    try {
      const sync = await this._bridge.workspaceData.syncWorktree(repo.url, wt.name);
      if (sync?.ok) {
        const result = await this._bridge.workspaceData.checkWorktreeBranch("", repo.url, wt.name);
        wt.status = result.status;
        if (result.error) wt.errorMessage = result.error;
        wt.warningMessage = result.warning || undefined;
        if (result.status === "success") await this._syncDetailReposToFile();
      } else {
        wt.status = "failure";
        wt.errorMessage = sync?.error || "Sync failed";
      }
    } catch (e) {
      wt.status = "failure";
      wt.errorMessage = (e as Error).message || "Sync failed";
    }
    this._emitUpdate();
  }

  /** Re-verify every worktree of a repo, bypassing the existing status. */
  private async _detailVerifyAll(repoIndex: number): Promise<void> {
    const repo = this._detailRepos[repoIndex];
    if (!repo) return;
    for (let w = 0; w < repo.worktrees.length; w++) {
      await this._forceVerifyWorktree(repoIndex, w);
    }
  }

  /** Resync every out-of-sync/diverged worktree of a repo to its remote. */
  private async _detailSyncAll(repoIndex: number): Promise<void> {
    const repo = this._detailRepos[repoIndex];
    if (!repo) return;
    for (let w = 0; w < repo.worktrees.length; w++) {
      const wt = repo.worktrees[w];
      if (wt.status === "needs-sync" || wt.status === "diverged") {
        await this._detailSyncWorktree(repoIndex, w);
      }
    }
  }

  /** Force re-verification of a single worktree (ignores current status). */
  private async _forceVerifyWorktree(repoIndex: number, wtIndex: number): Promise<void> {
    const repo = this._detailRepos[repoIndex];
    const wt = repo?.worktrees[wtIndex];
    if (repo && wt) {
      wt.status = "unverified";
      wt.errorMessage = undefined;
    }
    await this._detailVerifyWorktree(repoIndex, wtIndex);
  }

  private async _syncDetailReposToFile(): Promise<void> {
    if (!this._selected) return;
    this._selected.data.repos = this._detailRepos.map(r => ({ url: r.url, worktrees: r.worktrees.map(w => w.name) }));
    await this._bridge.dialog.writeWorkspaceFile(this._selected.filePath, this._selected.data);
  }

  /**
   * Clone bare repos and checkout worktrees for a set of entries.
   * Updates status and errorMessage in place for any failures.
   * Returns true if all operations succeeded.
   */
  private async _cloneReposAndCheckoutWorktrees(entries: CreateRepoEntry[]): Promise<boolean> {
    let allOk = true;
    for (const entry of entries) {
      if (entry.status !== "success") {
        allOk = false;
        continue;
      }
      // Clone bare repo
      if (!(await this._bridge.workspaceData.repoAlreadyCloned(entry.url))) {
        const cloneResult = await this._bridge.workspaceData.cloneBareRepo(entry.url);
        if (!cloneResult.ok) {
          entry.status = "failure";
          entry.errorMessage = cloneResult.error || "Clone failed";
          allOk = false;
          continue;
        }
      }
      // Checkout worktrees
      for (const wt of entry.worktrees) {
        if (wt.status !== "success") {
          allOk = false;
          continue;
        }
        const wtResult = await this._bridge.workspaceData.checkoutWorktree(entry.url, wt.name);
        if (!wtResult.ok) {
          wt.status = "failure";
          wt.errorMessage = wtResult.error || "Worktree checkout failed";
          allOk = false;
        }
      }
    }
    return allOk;
  }

  /**
   * Handle detail view Save button:
   * 1. Clone bare repos and checkout worktrees
   * 2. Sync to disk
   *
   * Stays on the detail view (use the Back arrow to return to the list).
   */
  private async _onDetailSave(): Promise<void> {
    if (!this._selected) return;
    await this._cloneReposAndCheckoutWorktrees(this._detailRepos);
    await this._syncDetailReposToFile();
  }

  private async _onCopy(e: MouseEvent, path: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(path);
      this._showButtonToast(e.target as HTMLElement, "Copied");
    } catch {
      // ignore
    }
  }

  private _showButtonToast(anchor: HTMLElement, text: string): void {
    const rect = anchor.getBoundingClientRect();
    const el = document.createElement("div");
    el.textContent = text;
    el.style.cssText = `
      position:fixed;
      left:${rect.left + rect.width / 2}px;
      top:${rect.top}px;
      transform:translate(-50%,0);
      z-index:2147483646;
      padding:2px 8px;
      border-radius:4px;
      background:var(--bg-secondary,#1e1e1e);
      color:var(--text-primary,#ccc);
      font-size:11px;
      white-space:nowrap;
      opacity:0;
      transition:opacity .2s ease, transform .2s ease;
      pointer-events:none;
    `;
    document.body.appendChild(el);

    requestAnimationFrame(() => {
      el.style.opacity = "1";
      el.style.transform = "translate(-50%,-28px)";
    });

    setTimeout(() => {
      el.style.opacity = "0";
      el.style.transform = "translate(-50%,-20px)";
      setTimeout(() => el.remove(), 200);
    }, 1500);
  }

  // ═══ Render ─────────────────────────────────────────────────────

  render(): TemplateResult {
    const isActive = (entry: { filePath: string; data: WorkspaceFileData }): boolean => {
      return workspaceFileService.activeFilePath === entry.filePath;
    };

    return html`
      <style>
        .wm-wrap { display:flex; flex-direction:column; overflow:hidden; position:relative; }
        .cr-row { outline:none; }
        .cr-row:focus-visible { outline:2px solid var(--accent,#007acc); outline-offset:-2px; }
        .wm-view {
          position:absolute; inset:0;
          transition:transform .25s ease, opacity .2s ease;
          display:flex; flex-direction:column;
        }
        .wm-view.list {
          position:relative;
          max-height:min(70vh, 520px);
          transform:translateX(0); opacity:1;
        }
        .wm-view.list.slide-out {
          position:absolute; inset:0;
          max-height:none;
          transform:translateX(-40px); opacity:0;
          pointer-events:none;
        }
        .wm-view.detail {
          transform:translateX(40px); opacity:0;
          pointer-events:none;
        }
        .wm-view.detail.slide-in {
          position:relative;
          max-height:min(70vh, 520px);
          transform:translateX(0); opacity:1;
          pointer-events:auto;
        }

        .wm-card {
          padding:12px 14px; margin:6px 10px; border-radius:8px;
          background:var(--bg-primary,#252526);
          border:1px solid var(--divider,#333);
          cursor:pointer;
          position:relative;
          transition:background .1s, border-color .1s;
        }
        .wm-card:hover { background:var(--bg-hover,#2a2a2a); }
        .wm-card-title { font-size:15px; color:var(--text-primary,#ccc); font-weight:500; padding-right:78px; }
        .wm-card-sub { display:flex; align-items:center; gap:4px; font-size:11px; color:var(--text-secondary,#999); margin-top:2px; font-family:monospace; }
        .wm-card-copy {
          display:flex; align-items:center; justify-content:center;
          background:transparent; border:none; cursor:pointer;
          color:var(--text-secondary,#999); padding:2px; border-radius:4px;
          transition:background .1s, color .1s;
        }
        .wm-card-copy:hover { color:var(--text-primary,#ccc); background:var(--bg-hover-strong,#333); }
        .wm-card-meta { display:flex; align-items:center; gap:5px; margin-top:6px; font-size:11px; color:var(--text-secondary,#999); flex-wrap:wrap; }
        .wm-meta-sep { opacity:.45; }
        .wm-add { color:#4caf50; }
        .wm-del { color:#ef5350; }
        .wm-meta-loading { opacity:.6; }
        .wsc-field {
          margin:12px 14px;
          padding:12px 14px;
          border-radius:8px;
          background:rgba(255,255,255,.05);
          outline:none;
          cursor:text;
        }
        .wsc-field-repos { cursor:default; }
        .wsc-field:focus-within {
          outline:2px solid var(--accent,#007acc);
          outline-offset:-2px;
        }
        .wsc-field:not(.wsc-field-repos) input:focus,
        .wsc-field:not(.wsc-field-repos) input:focus-visible {
          outline:none;
          box-shadow:none;
        }
        .wsc-field-repos .repo-wrapper:not(:has(> .cr-row + div:not(.wsc-status-list))):not(:has(> .wsc-status-list + div)) {
          border:none !important;
          background:transparent !important;
          border-radius:0 !important;
          margin:0 !important;
        }
        /* Expanded repos keep their detached boxed look (inline border,
           radius, 4px margin) untouched. */
        /* Each row keeps a subtle background so rows read as distinct */
        .wsc-field-repos .cr-row,
        .wsc-field-repos .add-wt-trigger {
          background: rgba(255,255,255,.04);
        }
        .wsc-field-repos .wsc-status-list {
          padding: 2px 10px 6px 32px;
          background: rgba(255,255,255,.04);
        }
        /* Nested worktree status: don't stack another tint on the worktree
           row's background (it would read as a lighter band). */
        .wsc-field-repos .wsc-wt-row .wsc-status-list {
          background: transparent;
        }
        /* Status list nested inside a worktree row: the cr-row already adds
           10px left padding, so use less so text still aligns with the name. */
        .wsc-field-repos .wsc-wt-row .wsc-status-list {
          padding-left: 22px;
        }
        .wsc-field-repos .add-wt-trigger {
          border-top-color: var(--wsc-sep) !important;
        }
        .wsc-field-repos .add-repo-trigger {
          border-radius: 0 0 8px 8px;
        }
        .wsc-field-repos .repo-wrapper:has(> .cr-row + div:not(.wsc-status-list)) + .add-repo-trigger,
        .wsc-field-repos .repo-wrapper:has(> .wsc-status-list + div) + .add-repo-trigger {
          border-top:none;
          border-radius:8px;
        }
        /* Inner separators only — no outer borders. One shared color so
           worktree separators match the repo separators exactly. */
        .wsc-field-repos { --wsc-sep: rgba(255,255,255,.2); }
        .wsc-field-repos .repo-wrapper + .repo-wrapper {
          border-top: 1px solid var(--wsc-sep);
        }
        .wsc-field-repos .repo-wrapper + .cr-row {
          border-top: 1px solid var(--wsc-sep);
        }
        .wsc-field-repos .repo-wrapper:has(> .cr-row + div:not(.wsc-status-list)) + .repo-wrapper,
        .wsc-field-repos .repo-wrapper:has(> .wsc-status-list + div) + .repo-wrapper {
          border-top:none;
          margin-top:8px !important;
        }
        .wsc-field-repos .repo-wrapper > .cr-row + div,
        .wsc-field-repos .repo-wrapper > div > .cr-row ~ .cr-row {
          border-top: 1px solid var(--wsc-sep);
        }
        /* Status messages sit above the separator — the line goes between the
           status list and the worktree rows, not above the status list. */
        .wsc-field-repos .repo-wrapper > .cr-row + .wsc-status-list,
        .wsc-field-repos .repo-wrapper > .wsc-status-list {
          border-top: none;
        }
        .wsc-field-repos .repo-wrapper > .wsc-status-list + div {
          border-top: 1px solid var(--wsc-sep);
        }
        .wsc-label {
          display:block;
          font-size:12px;
          color:var(--text-secondary,#bbb);
        }
        .wsc-input {
          display:block;
          width:100%;
          margin-top:8px;
          background:transparent;
          border:none;
          outline:none;
          color:var(--text-primary,#ccc);
          font-size:14px;
          font-family:inherit;
          padding:0;
        }
        .wm-btn.activate { background:rgba(0,122,204,.2); color:var(--accent,#007acc); padding:5px 14px; }
        .wm-btn.activate:hover { background:rgba(0,122,204,.3); color:var(--accent,#007acc); }
        .wm-card-active-pill {
          padding:2px 10px; border-radius:999px; font-size:11px;
          background:rgba(0,122,204,.15); color:var(--accent,#007acc);
        }
        .wm-btn {
          padding:3px 8px; font-size:12px; border:none; border-radius:4px;
          cursor:pointer; background:transparent; color:var(--text-secondary,#999);
          transition:background .1s, color .1s;
        }
        .wm-btn:hover { background:var(--bg-hover-strong,#333); color:var(--text-primary,#ccc); }

        .wm-create-area {
          margin:6px 10px; padding:10px 14px; border-radius:8px;
          background:transparent; border:none;
        }
        .wm-create-input {
          background:transparent; border:none; border-bottom:1px solid var(--divider,#555);
          color:var(--text-primary,#ccc); font-size:14px; padding:4px 0; outline:none; width:100%;
        }
        .wm-create-input:focus { border-bottom-color:var(--accent,#007acc); }
        .wm-create-area input::placeholder {
          color:var(--text-placeholder,#6e6e6e);
        }

        .wm-back {
          display:flex; align-items:center; justify-content:center;
          padding:5px; border-radius:4px; cursor:pointer;
          background:var(--bg-secondary,#252526);
          color:var(--text-secondary,#999);
          transition:background .1s, color .1s;
        }
        .wm-back:hover { background:var(--bg-hover-strong,#333); color:var(--text-primary,#ccc); }

        /* Detail section styles (reused from old workspace-manager-system-tab) */
        .row-actions {
          display:none;
          align-items:center;
          gap:0;
          padding:1px;
          border-radius:3px;
          background: rgba(229,62,62,.14);
        }
        .cr-row:hover .row-actions { display:flex; }
        /* The repo header and its status list are one unit: hovering the
           statuses also reveals the row's delete action. */
        .repo-wrapper:has(> .wsc-status-list:hover) > .cr-row .row-actions { display:flex; }
        /* Red delete button; brighten both the background and icon when
           hovering the button itself. */
        .row-actions:hover { background: rgba(229,62,62,.38); }
        .row-actions openp41ge-inline-icon { color: var(--error,#e53e3e); }
        .row-actions:hover openp41ge-inline-icon { color: #ff7b72; }
        /* Worktree row delete button: same red-on-hover treatment. */
        .wsc-wt-row .wt-del {
          padding:1px;
          border-radius:3px;
          background: rgba(229,62,62,.14);
        }
        .wsc-wt-row .wt-del:hover { background: rgba(229,62,62,.38); }
        .wsc-wt-row .wt-del openp41ge-inline-icon { color: var(--error,#e53e3e); }
        .wsc-wt-row .wt-del:hover openp41ge-inline-icon { color: #ff7b72; }

        .drag-row {
          display:flex; align-items:center; gap:6px; padding:8px 10px; height:37px; box-sizing:border-box;
          cursor:grab; user-select:none;
          background:rgba(255,255,255,.04);
          border-left:1px solid var(--divider,#333);
          border-right:1px solid var(--divider,#333);
          border-bottom:1px solid var(--divider,#333);
        }
        .drag-row.drag-over { border-top:2px solid var(--accent,#007acc); }
        .drag-row.drop-target {
          border:1px solid var(--accent,#007acc); background:rgba(0,122,204,0.12);
          min-height:37px; height:37px; box-sizing:border-box;
        }
        .drag-row:first-child { border-top:1px solid var(--divider,#333); }
        .drag-row.drop-target:first-child { border-top:1px solid var(--accent,#007acc); }
        .reorder-footer { display:flex; gap:6px; padding:8px 10px; justify-content:flex-end; }
      </style>
      <div class="wm-wrap">
        <!-- ── List view ── -->
        <div class="wm-view list ${this._view === 'detail' ? 'slide-out' : ''}">
          <div style="flex:1;overflow-y:auto;padding:4px 0;">
          ${this._creating ? html`
            <div class="wm-create-area" style="margin:0;padding:0;display:flex;flex-direction:column;min-height:100%;">
              <div style="padding:12px 14px;">
                <label style="display:block;font-size:11px;font-weight:600;text-transform:uppercase;color:var(--text-secondary,#999);margin-bottom:4px;">Name</label>
                <div style="display:flex;align-items:center;padding:6px 10px;height:38px;box-sizing:border-box;background:rgba(255,255,255,.04);border:1px solid var(--divider,#333);border-radius:6px;">
                  <input
                    type="text"
                    placeholder="Workspace name"
                    .value=${this._createName}
                    @input=${(e: Event) => { this._createName = (e.target as HTMLInputElement).value; this._nameError = ''; this._emitUpdate(); }}
                    @keydown=${(e: KeyboardEvent) => { if (e.key === 'Enter') this._createWorkspace(); }}
                    style="flex:1;background:transparent;border:none;color:var(--text-primary,#ccc);font-size:12px;padding:5px 0;outline:none;font-family:inherit;"
                    autofocus
                  />
                </div>
                ${this._nameTouched && !this._nameValid ? html`
                  <div style="font-size:11px;color:var(--error,#e53e3e);margin-top:4px;">${this._nameError}</div>
                ` : ''}
              </div>
              <div style="padding:12px 14px;">
                <label style="display:block;font-size:11px;font-weight:600;text-transform:uppercase;color:var(--text-secondary,#999);margin-bottom:4px;">Repositories</label>
                <div style="display:block;">
                  ${this._reordering ? html`
                    <!-- Reorder mode: draggable rows -->
                    ${this._createRepos.map((entry, i) => html`
                      <div class="drag-row${i === this._dragIndex ? ' drop-target' : ''}"
                        draggable="true"
                        @dragstart=${(e: DragEvent) => this._onDragStart(e, i)}
                        @dragover=${(e: DragEvent) => this._onDragOver(e, i)}
                        @drop=${() => this._onDrop()}
                        @dragend=${() => this._onDragEnd()}
                      >
                        ${i === this._dragIndex ? '' : html`
                          <openp41ge-inline-icon name="chevron-right" size="12" no-hover icon-color="var(--text-secondary,#555)"></openp41ge-inline-icon>
                          <span style="flex:1;font-size:12px;color:var(--text-primary,#ccc);word-break:break-all;">${entry.url}</span>
                        `}
                      </div>
                    `)}
                    <!-- + add repository row (not draggable, always shown) -->
                    <div class="cr-row add-repo-trigger" tabindex="0"
                      style="${this._addRepoRowStyle()}"
                      @click=${() => { this._repoUrlError = ""; this._newRepoValue = ""; this._showNewRepoInput = true; this._emitUpdate(); setTimeout(() => { const el = document.querySelector('.new-repo-input'); if (el instanceof HTMLInputElement) el.focus(); }, 0); }}
                      @keydown=${(e: KeyboardEvent) => { if (e.key === 'Enter') { (e.currentTarget as HTMLElement).click(); } }}
                      @mouseenter=${(e: MouseEvent) => (e.currentTarget as HTMLElement).style.color = 'var(--text-primary,#ccc)'}
                      @mouseleave=${(e: MouseEvent) => (e.currentTarget as HTMLElement).style.color = 'var(--text-placeholder,#6e6e6e)'}
                    >
                      <openp41ge-inline-icon name="plus" size="12" icon-color="var(--text-placeholder,#6e6e6e)" no-hover></openp41ge-inline-icon>
                      <span>Add repository</span>
                    </div>
                    <div class="reorder-footer">
                      <button
                        style="font-size:13px;padding:6px 12px;border-radius:4px;border:none;cursor:pointer;background:transparent;color:var(--text-secondary,#999);"
                        @mouseenter=${(e: MouseEvent) => (e.currentTarget as HTMLElement).style.color = 'var(--text-primary,#ccc)'}
                        @mouseleave=${(e: MouseEvent) => (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary,#999)'}
                        @click=${() => this._cancelReorder()}
                      >Cancel</button>
                      <button
                        style="font-size:13px;padding:6px 12px;border-radius:4px;border:none;cursor:pointer;background:rgba(0,122,204,0.15);color:var(--accent,#007acc);transition:background .1s;"
                        @mouseenter=${(e: MouseEvent) => { (e.currentTarget as HTMLElement).style.background = 'rgba(0,122,204,0.25)'; }}
                        @mouseleave=${(e: MouseEvent) => { (e.currentTarget as HTMLElement).style.background = 'rgba(0,122,204,0.15)'; }}
                        @click=${() => this._confirmReorder()}
                      >Confirm</button>
                    </div>
                  ` : html`
                    ${this._createRepos.map((entry, i) => html`
                      ${entry.status === "success"
                        ? this._renderAccordionItem(
                              this._createRepos,
                              i,
                              entry.expanded ? html`
                                <div>
                                  ${entry.worktrees.map((wt, wtIndex) => this._renderWorktreeRow(
                                      i, wtIndex, wt,
                                      () => this._removeWorktree(i, wtIndex),
                                      () => this._verifyWorktree(i, wtIndex),
                                      () => this._syncWorktree(i, wtIndex),
                                    ))}
                                  ${entry.showNewWorktreeInput ? html`
                                    <div class="cr-row" tabindex="-1" style="display:flex;align-items:center;gap:6px;padding:8px 10px;">
                                      <openp41ge-inline-icon name="corner" size="12" no-hover icon-color="var(--text-secondary,#555)"></openp41ge-inline-icon>
                                      <input
                                        type="text"
                                        placeholder="Branch or path"
                                        .value=${entry.newWorktreeValue}
                                        @input=${(e: Event) => { entry.newWorktreeValue = (e.target as HTMLInputElement).value; }}
                                        @keydown=${(e: KeyboardEvent) => {
                                          if (e.key === 'Enter') this._addWorktree(i);
                                          if (e.key === 'Escape') {
                                            entry.showNewWorktreeInput = false;
                                            entry.newWorktreeValue = '';
                                            this._emitUpdate();
                                            setTimeout(() => {
                                              const wrapper = (e.currentTarget as HTMLElement).closest('.repo-wrapper');
                                              if (wrapper) {
                                                const trigger = wrapper.querySelector('.add-wt-trigger');
                                                if (trigger instanceof HTMLElement) trigger.focus();
                                              }
                                            }, 0);
                                          }
                                          if (e.key === 'ArrowUp') {
                                            e.preventDefault();
                                            const wrapper = (e.currentTarget as HTMLElement).closest('.repo-wrapper');
                                            if (wrapper) {
                                              const rows = wrapper.querySelectorAll('.cr-row');
                                              if (rows.length > 1) {
                                                const lastRow = rows[rows.length - 2];
                                                if (lastRow instanceof HTMLElement) lastRow.focus();
                                              }
                                            }
                                          }
                                        }}
                                        style="flex:1;background:transparent;border:none;color:var(--text-primary,#ccc);font-size:12px;padding:0;outline:none;font-family:inherit;"
                                        class="wt-input" autofocus
                                      />
                                      <openp41ge-inline-icon name="plus" size="12" icon-color="var(--accent,#007acc)" hover-color="accent" @click=${() => this._addWorktree(i)}></openp41ge-inline-icon>
                                    </div>
                                  ` : ''}
                                </div>
                                <div class="add-wt-trigger"
                                  style="display:flex;align-items:center;gap:6px;padding:8px 10px;cursor:pointer;color:var(--text-placeholder,#6e6e6e);font-size:12px;border-top:1px solid var(--divider,#333);"
                                  tabindex="-1"
                                  @keydown=${(e: KeyboardEvent) => {
                                    if (e.key === 'ArrowUp') {
                                      e.preventDefault();
                                      const all = Array.from((e.currentTarget as HTMLElement).closest('.repo-wrapper')?.querySelectorAll('.cr-row') ?? []);
                                      const idx = all.indexOf(e.currentTarget as HTMLElement);
                                      const prev = all[idx - 1];
                                      if (prev instanceof HTMLElement) prev.focus();
                                    }
                                  }}
                                  @click=${() => { entry.showNewWorktreeInput = true; entry.newWorktreeValue = ""; this._emitUpdate(); setTimeout(() => { const el = document.querySelector('.wt-input'); if (el instanceof HTMLInputElement) el.focus(); }, 0); }}
                                  @mouseenter=${(e: MouseEvent) => (e.currentTarget as HTMLElement).style.color = 'var(--text-primary,#ccc)'}
                                  @mouseleave=${(e: MouseEvent) => (e.currentTarget as HTMLElement).style.color = 'var(--text-placeholder,#6e6e6e)'}
                                >
                                  <openp41ge-inline-icon name="plus" size="12" icon-color="var(--text-placeholder,#6e6e6e)" no-hover></openp41ge-inline-icon>
                                  <span>Add worktree</span>
                                </div>
                              ` : null,
                              html`<div class="row-actions">${this._renderDeleteAction((e: Event) => { e.stopPropagation(); this._removeCreateRepo(i); })}</div>`,
                              html`<openp41ge-inline-icon name="check-circle" size="12" icon-color="var(--accent,#007acc)" no-hover title="Ready to clone"></openp41ge-inline-icon>`,
                              () => this._toggleRepoExpanded(i),
                            )
                        : this._renderUnverifiedRepoRow(i, entry)}
                    `)}
                    <!-- New repo URL input row (above +add) -->
                    ${this._showNewRepoInput ? html`
                      <div class="cr-row" tabindex="0" style="display:flex;flex-direction:column;padding:6px 10px;height:38px;box-sizing:border-box;background:rgba(255,255,255,.04);border-left:1px solid var(--divider,#333);border-right:1px solid var(--divider,#333);border-bottom:1px solid var(--divider,#333);${(this._createRepos.length === 0 || (this._createRepos.length > 0 && this._createRepos[this._createRepos.length - 1].expanded)) ? 'border-top:1px solid var(--divider,#333);border-radius:6px 6px 0 0;' : ''}" @click=${() => { const inp = document.querySelector('.new-repo-input'); if (inp instanceof HTMLInputElement) inp.focus(); }}>
                        <div style="display:flex;align-items:center;gap:6px;">
                            <openp41ge-inline-icon name="chevron-right" size="12" no-hover icon-color="var(--text-secondary,#555)"></openp41ge-inline-icon>
                          <input
                            type="text"
                            placeholder="Paste repo URL and press Enter"
                            class="new-repo-input"
                            .value=${this._newRepoValue}
                            @input=${(e: Event) => { this._newRepoValue = (e.target as HTMLInputElement).value; this._repoUrlError = ''; }}
                            @keydown=${(e: KeyboardEvent) => {
                              if (e.key === 'Enter') this._addCreateRepo();
                              if (e.key === 'Escape') {
                                this._showNewRepoInput = false;
                                this._repoUrlError = '';
                                this._emitUpdate();
                                setTimeout(() => {
                                  const trigger = document.querySelector('.add-repo-trigger');
                                  if (trigger instanceof HTMLElement) trigger.focus();
                                }, 0);
                              }
                              if (e.key === 'ArrowUp' && this._createRepos.length > 0) {
                                // Focus the last repo row's header
                                const wrappers = document.querySelectorAll('.repo-wrapper .cr-row');
                                const last = wrappers[wrappers.length - 1];
                                if (last instanceof HTMLElement) last.focus();
                              }
                            }}
                            style="flex:1;background:transparent;border:none;color:var(--text-primary,#ccc);font-size:12px;padding:5px 0;outline:none;font-family:inherit;"
                            autofocus
                          />
                          <openp41ge-inline-icon name="plus" size="12" icon-color="var(--accent,#007acc)" hover-color="accent" @click=${(e: Event) => { e.stopPropagation(); this._addCreateRepo(); }}></openp41ge-inline-icon>
                        </div>
                        ${this._repoUrlError ? html`
                          <div style="font-size:12px;color:var(--error,#e53e3e);margin-top:2px;">${this._repoUrlError}</div>
                        ` : ''}
                      </div>
                    ` : ''}
                    <!-- + add repository row -->
                    <div class="cr-row add-repo-trigger" tabindex="0"
                      style="${this._addRepoRowStyle()}"
                      @click=${() => { this._repoUrlError = ""; this._newRepoValue = ""; this._showNewRepoInput = true; this._emitUpdate(); setTimeout(() => { const el = document.querySelector('.new-repo-input'); if (el instanceof HTMLInputElement) el.focus(); }, 0); }}
                      @keydown=${(e: KeyboardEvent) => { if (e.key === 'Enter') { (e.currentTarget as HTMLElement).click(); } }}
                      @mouseenter=${(e: MouseEvent) => (e.currentTarget as HTMLElement).style.color = 'var(--text-primary,#ccc)'}
                      @mouseleave=${(e: MouseEvent) => (e.currentTarget as HTMLElement).style.color = 'var(--text-placeholder,#6e6e6e)'}
                    >
                      <openp41ge-inline-icon name="plus" size="12" icon-color="var(--text-placeholder,#6e6e6e)" no-hover></openp41ge-inline-icon>
                      <span>Add repository</span>
                    </div>
                    <!-- Reorder repos button (only when 2+ repos) -->
                    ${this._createRepos.length >= 2 ? html`
                      <div style="display:flex;justify-content:flex-end;">
                        <div
                          style="display:flex;align-items:center;cursor:pointer;color:var(--text-secondary,#999);font-size:12px;gap:4px;padding:4px 8px;border-radius:4px;"
                          @click=${() => this._startReorder()}
                          @mouseenter=${(e: MouseEvent) => { const el = e.currentTarget as HTMLElement; el.style.background = 'rgba(128,128,128,0.15)'; el.style.color = 'var(--text-primary,#ccc)'; }}
                          @mouseleave=${(e: MouseEvent) => { const el = e.currentTarget as HTMLElement; el.style.background = 'transparent'; el.style.color = 'var(--text-secondary,#999)'; }}
                        >
                          <svg width="14" height="14" viewBox="0 -960 960 960" fill="currentColor"><path d="M120-200v-80h720v80H120Zm0-160v-80h720v80H120Zm0-160v-80h720v80H120Zm0-160v-80h720v80H120Z"/></svg>
                          <span>Reorder repos</span>
                        </div>
                      </div>
                    ` : ''}
                  `}
                </div>
              </div>
            </div>
          ` : ''}

          ${!this._creating ? html`
            ${this._showSearch ? html`
              <!-- Search: filters by workspace name, repo name/url, worktree name -->
              <div style="position:sticky;top:0;padding:8px 10px 6px;background:var(--bg-primary,#252526);z-index:1;">
                <div style="display:flex;align-items:center;gap:6px;border:1px solid var(--divider,#333);border-radius:6px;background:rgba(255,255,255,.04);padding:6px 10px;">
                  <svg width="12" height="12" viewBox="0 -960 960 960" fill="currentColor" style="color:var(--text-secondary,#999);flex-shrink:0;"><path d="M784-120 532-372q-30 24-69 38t-83 14q-109 0-184.5-75.5T120-580q0-109 75.5-184.5T380-840q109 0 184.5 75.5T640-580q0 44-14 83t-38 69l252 252-56 56ZM380-400q75 0 127.5-52.5T560-580q0-75-52.5-127.5T380-760q-75 0-127.5 52.5T200-580q0 75 52.5 127.5T380-400Z"/></svg>
                  <input
                    type="text"
                    data-workspace-search-input
                    placeholder="Search workspaces… (name, repo, worktree)"
                    .value=${this._searchQuery}
                    @input=${(e: Event) => { this._searchQuery = (e.target as HTMLInputElement).value; this._emitUpdate(); }}
                    style="flex:1;background:transparent;border:none;color:var(--text-primary,#ccc);font-size:12px;outline:none;"
                    autofocus
                  />
                </div>
              </div>
            ` : nothing}
            ${this._workspaces.length === 0
              ? html`<div style="padding:20px;text-align:center;color:var(--text-secondary,#999);font-size:13px;">No workspaces yet.</div>`
              : this._filteredWorkspaces.length === 0
                ? html`<div style="padding:20px;text-align:center;color:var(--text-secondary,#999);font-size:13px;">No workspaces match your search.</div>`
                : this._filteredWorkspaces.map((entry) => html`
                  <div class="wm-card ${isActive(entry) ? 'active' : ''}" @click=${() => this._showDetail(entry)}>
                    <div style="position:absolute;top:8px;right:12px;">
                      ${isActive(entry) ? html`<span class="wm-card-active-pill">Active</span>` : nothing}
                    </div>
                    <div class="wm-card-title">${entry.data.name ?? "(unnamed)"}</div>
                    <div class="wm-card-sub">
                      <span>${entry.data.id.slice(0, 8)}</span>
                      <button class="wm-card-copy" title="Copy ID" @click=${(e: MouseEvent) => { e.stopPropagation(); this._onCopy(e, entry.data.id); }}>
                        <svg width="12" height="12" viewBox="0 -960 960 960" fill="currentColor"><path d="M360-240q-33 0-56.5-23.5T280-320v-480q0-33 23.5-56.5T360-880h360q33 0 56.5 23.5T800-800v480q0 33-23.5 56.5T720-240H360Zm0-80h360v-480H360v480ZM200-80q-33 0-56.5-23.5T120-160v-560h80v560h440v80H200Z"/></svg>
                      </button>
                    </div>
                    <div class="wm-card-meta">${this._cardMeta(entry)}</div>
                  </div>
                `)}
          ` : ''}
          </div>
          <!-- Bottom bar: Create/Cancel when creating, otherwise + New -->
          <div style="display:flex;align-items:center;justify-content:flex-end;padding:0 6px;height:40px;border-top:1px solid var(--divider,#333);flex-shrink:0;gap:6px;">
            ${this._creating ? html`
              <button
                style="font-size:13px;padding:6px 12px;border-radius:4px;border:none;cursor:pointer;background:transparent;color:var(--text-secondary,#999);"
                @mouseenter=${(e: MouseEvent) => (e.currentTarget as HTMLElement).style.color = 'var(--text-primary,#ccc)'}
                @mouseleave=${(e: MouseEvent) => (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary,#999)'}
                @click=${() => { this._creating = false; this._emitUpdate(); }}
              >Cancel</button>
              <button
                style="font-size:13px;padding:6px 12px;border-radius:4px;border:none;cursor:pointer;background:rgba(0,122,204,0.15);color:var(--accent,#007acc);transition:background .1s;"
                @mouseenter=${(e: MouseEvent) => { (e.currentTarget as HTMLElement).style.background = 'rgba(0,122,204,0.25)'; }}
                @mouseleave=${(e: MouseEvent) => { (e.currentTarget as HTMLElement).style.background = 'rgba(0,122,204,0.15)'; }}
                @click=${() => this._createWorkspace()}
              >Create</button>
            ` : html`
              <button
                style="font-size:13px;padding:6px 12px;border-radius:4px;border:none;cursor:pointer;background:rgba(0,122,204,0.15);color:var(--accent,#007acc);"
                @mouseenter=${(e: MouseEvent) => (e.currentTarget as HTMLElement).style.background = 'rgba(0,122,204,0.25)'}
                @mouseleave=${(e: MouseEvent) => (e.currentTarget as HTMLElement).style.background = 'rgba(0,122,204,0.15)'}
                @click=${() => this._showCreate()}
              >Create Workspace</button>
            `}
          </div>
        </div>

        <!-- ── Detail view ── -->
        <div class="wm-view detail ${this._view === 'detail' ? 'slide-in' : ''}" style="padding-top:0;">
          ${this._selected ? this._renderDetail(this._selected) : ''}
        </div>
      </div>
    `;
  }

  private _renderDetail(entry: { filePath: string; data: WorkspaceFileData }): TemplateResult {
    const active = workspaceFileService.activeFilePath === entry.filePath;
    return html`
      <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 14px 12px;gap:8px;flex-shrink:0;border-bottom:1px solid var(--divider,#333);">
        <div class="wm-back" title="Back" @click=${() => this._showList()}>
          <svg width="14" height="14" viewBox="0 -960 960 960" fill="currentColor"><path d="M560-240 320-480l240-240 56 56-184 184 184 184-56 56Z"/></svg>
        </div>
        ${active
          ? html`<span class="wm-card-active-pill">Active</span>`
          : html`<button class="wm-btn activate" @click=${() => this._activateWorkspace(entry)}>Activate</button>`}
      </div>
      <div class="wm-create-area" style="margin:0;padding:0;display:flex;flex-direction:column;flex:1;min-height:0;overflow-y:auto;">
        <div class="wsc-field" @click=${(e: Event) => { (e.currentTarget as HTMLElement).querySelector("input")?.focus(); }}>
          <label class="wsc-label">What's the workspace name?</label>
          <input
            type="text"
            class="wsc-input"
            placeholder="Workspace name"
            .value=${entry.data.name ?? ''}
            @input=${(e: Event) => this._onNameChange(e)}
          />
        </div>
        <div class="wsc-field wsc-field-repos" style="display:flex;flex-direction:column;">
          <label class="wsc-label">What repos are you working on?</label>
          <div style="display:flex;align-items:flex-start;gap:6px;margin:6px 0 0;padding:6px 8px;border-radius:4px;background:rgba(229,165,10,.10);border:1px solid rgba(229,165,10,.30);font-size:11px;color:var(--text-warning,#e5a50a);line-height:1.35;">
            <openp41ge-inline-icon name="warning" size="12" no-hover icon-color="var(--text-warning,#e5a50a)" style="flex-shrink:0;margin-top:1px;"></openp41ge-inline-icon>
            <span>You need read access to each repository so openp41ge can pull (clone/sync) them without asking for a password.</span>
          </div>
          <div style="margin-top:8px;">
            ${this._detailRepos.map((entry, i) => html`
              ${entry.status === "success"
                ? this._renderAccordionItem(
                    this._detailRepos,
                    i,
                    entry.expanded ? html`
                      <div>
                        ${entry.worktrees.map((wt, wtIndex) => this._renderWorktreeRow(
                            i, wtIndex, wt,
                            async () => { this._detailRepos[i].worktrees.splice(wtIndex, 1); this._emitUpdate(); await this._syncDetailReposToFile(); },
                            () => this._detailVerifyWorktree(i, wtIndex),
                            async () => { this._detailSyncWorktree(i, wtIndex); },
                          ))}
                        ${entry.showNewWorktreeInput ? html`
                          <div class="cr-row" tabindex="-1" style="display:flex;align-items:center;gap:6px;padding:8px 10px;">
                            <openp41ge-inline-icon name="corner" size="12" no-hover icon-color="var(--text-secondary,#555)"></openp41ge-inline-icon>
                            <input
                              type="text"
                              placeholder="Branch or path"
                              .value=${entry.newWorktreeValue}
                              @input=${(e: Event) => { entry.newWorktreeValue = (e.target as HTMLInputElement).value; }}
                              @keydown=${(e: KeyboardEvent) => {
                                if (e.key === 'Enter') { if (entry.newWorktreeValue.trim()) { const name = entry.newWorktreeValue.trim(); entry.worktrees.push({ name, status: 'unverified' }); entry.newWorktreeValue = ''; this._emitUpdate(); setTimeout(() => { const el = document.querySelector('.wt-input'); if (el instanceof HTMLInputElement) { el.value = ''; el.focus(); } }, 0); this._detailVerifyWorktree(i, entry.worktrees.length - 1); } }
                                if (e.key === 'Escape') {
                                  entry.showNewWorktreeInput = false;
                                  entry.newWorktreeValue = '';
                                  this._emitUpdate();
                                  setTimeout(() => {
                                    const wrapper = (e.currentTarget as HTMLElement).closest('.repo-wrapper');
                                    if (wrapper) {
                                      const trigger = wrapper.querySelector('.add-wt-trigger');
                                      if (trigger instanceof HTMLElement) trigger.focus();
                                    }
                                  }, 0);
                                }
                                if (e.key === 'ArrowUp') {
                                  e.preventDefault();
                                  const wrapper = (e.currentTarget as HTMLElement).closest('.repo-wrapper');
                                  if (wrapper) {
                                    const rows = wrapper.querySelectorAll('.cr-row');
                                    if (rows.length > 1) {
                                      const lastRow = rows[rows.length - 2];
                                      if (lastRow instanceof HTMLElement) lastRow.focus();
                                    }
                                  }
                                }
                              }}
                              style="flex:1;background:transparent;border:none;color:var(--text-primary,#ccc);font-size:12px;padding:0;outline:none;font-family:inherit;"
                              class="wt-input" autofocus
                            />
                            <openp41ge-inline-icon name="plus" size="12" icon-color="var(--accent,#007acc)" hover-color="accent" @click=${async () => { if (entry.newWorktreeValue.trim()) { const name = entry.newWorktreeValue.trim(); entry.worktrees.push({ name, status: 'unverified' }); entry.newWorktreeValue = ''; this._emitUpdate(); setTimeout(() => { const el = document.querySelector('.wt-input'); if (el instanceof HTMLInputElement) { el.value = ''; el.focus(); } }, 0); await this._syncDetailReposToFile(); this._detailVerifyWorktree(i, entry.worktrees.length - 1); } }}></openp41ge-inline-icon>
                          </div>
                        ` : ''}
                      </div>
                      <div class="add-wt-trigger"
                        style="display:flex;align-items:center;gap:6px;padding:8px 10px;cursor:pointer;color:var(--text-placeholder,#6e6e6e);font-size:12px;border-top:1px solid var(--divider,#333);"
                        tabindex="-1"
                        @keydown=${(e: KeyboardEvent) => {
                          if (e.key === 'ArrowUp') {
                            e.preventDefault();
                            const all = Array.from((e.currentTarget as HTMLElement).closest('.repo-wrapper')?.querySelectorAll('.cr-row') ?? []);
                            const idx = all.indexOf(e.currentTarget as HTMLElement);
                            const prev = all[idx - 1];
                            if (prev instanceof HTMLElement) prev.focus();
                          }
                        }}
                        @click=${() => { entry.showNewWorktreeInput = true; entry.newWorktreeValue = ""; this._emitUpdate(); setTimeout(() => { const el = document.querySelector('.wt-input'); if (el instanceof HTMLInputElement) el.focus(); }, 0); }}
                        @mouseenter=${(e: MouseEvent) => (e.currentTarget as HTMLElement).style.color = 'var(--text-primary,#ccc)'}
                        @mouseleave=${(e: MouseEvent) => (e.currentTarget as HTMLElement).style.color = 'var(--text-placeholder,#6e6e6e)'}
                      >
                        <openp41ge-inline-icon name="plus" size="12" icon-color="var(--text-placeholder,#6e6e6e)" no-hover></openp41ge-inline-icon>
                        <span>Add worktree</span>
                      </div>
                    ` : null,
                    html`<div class="row-actions">${this._renderDeleteAction((e: Event) => { e.stopPropagation(); this._onRemoveRepo(i); })}</div>`,
                    html``, // no trailing status icon — sync state is shown in the status list below
                    () => { this._detailRepos[i].expanded = !this._detailRepos[i].expanded; this._emitUpdate(); },
                    this._repoStatusContent(i, entry, () => { this._detailRepos[i].expanded = !this._detailRepos[i].expanded; this._emitUpdate(); }),
                  )
                : this._renderUnverifiedRepoRow(i, entry, this._detailRepos, (idx) => this._onRemoveRepo(idx), (idx) => this._detailVerifyRepo(idx), true)}
            `)}
            <!-- New repo URL input row (above +add) -->
            ${this._showAddInput ? html`
              <div class="cr-row" tabindex="0" style="display:flex;flex-direction:column;padding:6px 10px;height:38px;box-sizing:border-box;background:rgba(255,255,255,.04);border-left:1px solid var(--divider,#333);border-right:1px solid var(--divider,#333);border-bottom:1px solid var(--divider,#333);${(this._detailRepos.length === 0 || (this._detailRepos.length > 0 && this._detailRepos[this._detailRepos.length - 1].expanded)) ? 'border-top:1px solid var(--divider,#333);border-radius:6px 6px 0 0;' : ''}" @click=${() => { const inp = document.querySelector('.detail-repo-input'); if (inp instanceof HTMLInputElement) inp.focus(); }}>
                <div style="display:flex;align-items:center;gap:6px;">
                  <openp41ge-inline-icon name="chevron-right" size="12" no-hover icon-color="var(--text-secondary,#555)"></openp41ge-inline-icon>
                  <input
                    type="text"
                    placeholder="Paste repo URL and press Enter"
                    class="detail-repo-input"
                    .value=${this._addInputValue}
                    @input=${(e: Event) => { this._addInputValue = (e.target as HTMLInputElement).value; this._detailRepoUrlError = ''; }}
                    @keydown=${(e: KeyboardEvent) => { if (e.key === 'Enter') this._onAddConfirm(); if (e.key === 'Escape') this._onAddCancel(); }}
                    style="flex:1;background:transparent;border:none;color:var(--text-primary,#ccc);font-size:12px;padding:5px 0;outline:none;font-family:inherit;"
                    autofocus
                  />
                    <openp41ge-inline-icon name="plus" size="12" icon-color="var(--accent,#007acc)" hover-color="accent" @click=${(e: Event) => { e.stopPropagation(); this._onAddConfirm(); }}></openp41ge-inline-icon>
                </div>
                ${this._detailRepoUrlError ? html`
                  <div style="font-size:12px;color:var(--error,#e53e3e);margin-top:2px;">${this._detailRepoUrlError}</div>
                ` : ''}
              </div>
            ` : ''}
            <!-- + add repository row -->
            <div class="cr-row add-repo-trigger" tabindex="0"
              style="${this._detailAddRepoRowStyle()}"
              @click=${() => { this._showAddInput = true; this._addInputValue = ""; this._detailRepoUrlError = ""; this._emitUpdate(); setTimeout(() => { const el = document.querySelector('.detail-repo-input'); if (el instanceof HTMLInputElement) el.focus(); }, 0); }}
              @keydown=${(e: KeyboardEvent) => { if (e.key === 'Enter') { (e.currentTarget as HTMLElement).click(); } }}
              @mouseenter=${(e: MouseEvent) => (e.currentTarget as HTMLElement).style.color = 'var(--text-primary,#ccc)'}
              @mouseleave=${(e: MouseEvent) => (e.currentTarget as HTMLElement).style.color = 'var(--text-placeholder,#6e6e6e)'}
            >
              <openp41ge-inline-icon name="plus" size="12" icon-color="var(--text-placeholder,#6e6e6e)" no-hover></openp41ge-inline-icon>
              <span>Add repository</span>
            </div>
          </div>
        </div>
        </div>
        <!-- Bottom bar: Delete (left) · Save/Cancel (right) -->
        <div style="display:flex;align-items:center;justify-content:space-between;padding:0 6px;height:40px;border-top:1px solid var(--divider,#333);flex-shrink:0;gap:6px;">
          <button
            style="font-size:13px;padding:6px 12px;border-radius:4px;border:none;cursor:pointer;background:rgba(244,71,71,0.15);color:var(--accent-error,#f44747);transition:background .1s;"
            @mouseenter=${(e: MouseEvent) => { (e.currentTarget as HTMLElement).style.background = 'rgba(244,71,71,0.25)'; }}
            @mouseleave=${(e: MouseEvent) => { (e.currentTarget as HTMLElement).style.background = 'rgba(244,71,71,0.15)'; }}
            @click=${() => { if (this._selected) this._onDeleteWorkspace(this._selected); }}
          >Delete</button>
          <div style="display:flex;gap:6px;">
          <button
            style="font-size:13px;padding:6px 12px;border-radius:4px;border:none;cursor:pointer;background:rgba(0,122,204,0.15);color:var(--accent,#007acc);transition:background .1s;"
            @mouseenter=${(e: MouseEvent) => { (e.currentTarget as HTMLElement).style.background = 'rgba(0,122,204,0.25)'; }}
            @mouseleave=${(e: MouseEvent) => { (e.currentTarget as HTMLElement).style.background = 'rgba(0,122,204,0.15)'; }}
            @click=${() => this._onDetailSave()}
          >Save</button>
          </div>
      </div>
    `;
  }
}
