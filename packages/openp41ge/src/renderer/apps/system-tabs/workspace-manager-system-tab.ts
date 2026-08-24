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
  private _selected: { filePath: string; data: WorkspaceFileData } | null = null;

  /** Card currently focused by a click (a second click on it activates). */
  private _focusedPath: string | null = null;

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
    this._focusedPath = null;
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
  ): TemplateResult {
    const item = items[index];
    const isStandalone = item.expanded;
    const isFirst = index === 0;
    const prevExpanded = index > 0 && items[index - 1].expanded;
    const nextExpanded = index < items.length - 1 && items[index + 1].expanded;

    let wrapperStyle = 'box-sizing:border-box;min-height:38px;background:rgba(255,255,255,.04);overflow:hidden;';
    let headerStyle = 'display:flex;align-items:center;gap:6px;padding:8px 10px;height:37px;box-sizing:border-box;';

    if (isStandalone) {
      wrapperStyle += 'border:1px solid var(--divider,#333);border-radius:6px;margin:4px 0;';
      headerStyle += 'cursor:pointer;user-select:none;border-radius:6px 6px 0 0;';
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
        ${item.expanded && expandedContent ? expandedContent : ''}
      </div>
    `;
  }

  /** Shared delete/hover span for repo rows */
  private _renderDeleteAction(onRemove: (e: Event) => void): TemplateResult {
    return html`
      <openp41ge-inline-icon name="close" size="12" icon-color="var(--text-secondary,#999)" hover-color="danger" @click=${onRemove}></openp41ge-inline-icon>
    `;
  }

  /** Render a worktree row with verification status and sync/retry actions */
  private _renderWorktreeRow(
    repoIndex: number,
    wtIndex: number,
    wt: WorktreeEntry,
    onRemove: () => void,
    onRetry: () => void,
    onSync: () => void,
  ): TemplateResult {
    const statusIcon = wt.status === 'unverified' ? nothing
      : wt.status === 'validating' ? html`<openp41ge-inline-icon name="spinner" size="12" no-hover icon-color="var(--text-secondary,#999)"></openp41ge-inline-icon>`
      : wt.status === 'success' ? html`<openp41ge-inline-icon name="check-circle" size="12" icon-color="var(--accent,#007acc)" no-hover></openp41ge-inline-icon>`
      : wt.status === 'failure' ? html`<openp41ge-inline-icon name="refresh" size="12" icon-color="var(--error,#e53e3e)" hover-color="danger" @click=${onRetry}></openp41ge-inline-icon>`
      : wt.status === 'diverged' ? html`<openp41ge-inline-icon name="refresh" size="12" icon-color="var(--error,#e53e3e)" hover-color="danger" @click=${onRetry}></openp41ge-inline-icon>`
      : wt.status === 'needs-sync' ? html`<openp41ge-inline-icon name="sync" size="12" icon-color="var(--accent,#007acc)" hover-color="accent" @click=${onSync}></openp41ge-inline-icon>`
      : nothing;
    return html`
      <div class="cr-row" tabindex="-1" style="display:flex;align-items:center;gap:6px;padding:8px 10px;" @mouseenter=${(e: Event) => { const del = (e.currentTarget as HTMLElement).querySelector('.wt-del'); if (del instanceof HTMLElement) del.style.visibility = 'visible'; }} @mouseleave=${(e: Event) => { const del = (e.currentTarget as HTMLElement).querySelector('.wt-del'); if (del instanceof HTMLElement) del.style.visibility = 'hidden'; }} @keydown=${(e: KeyboardEvent) => {
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              e.preventDefault();
              const all = Array.from((e.currentTarget as HTMLElement).closest('.repo-wrapper')?.querySelectorAll('.cr-row') ?? []);
              const idx = all.indexOf(e.currentTarget as HTMLElement);
              const next = e.key === 'ArrowDown' ? all[idx + 1] : all[idx - 1];
              if (next instanceof HTMLElement) next.focus();
            }
          }}>
        <openp41ge-inline-icon name="corner" size="12" no-hover icon-color="var(--text-secondary,#555)"></openp41ge-inline-icon>
        <span style="flex:1;font-size:12px;color:var(--text-primary,#ccc);word-break:break-all;">${wt.name}</span>
        <span class="wt-del" style="display:flex;align-items:center;visibility:hidden;">
          <openp41ge-inline-icon name="close" size="12" icon-color="var(--text-secondary,#999)" hover-color="danger" @click=${onRemove}></openp41ge-inline-icon>
        </span>
        <span style="display:flex;align-items:center;visibility:${wt.status === 'unverified' ? 'hidden' : 'visible'};">${statusIcon}</span>
      </div>
      ${wt.errorMessage && (wt.status === 'failure' || wt.status === 'diverged') ? html`
        <div style="font-size:12px;color:var(--error,#e53e3e);padding:2px 10px 6px 32px;">${wt.errorMessage}</div>
      ` : wt.errorMessage && wt.status === 'needs-sync' ? html`
        <div style="font-size:12px;color:var(--accent,#007acc);padding:2px 10px 6px 32px;">${wt.errorMessage}</div>
      ` : wt.warningMessage && wt.status === 'success' ? html`
        <div style="font-size:12px;color:var(--text-warning,#e5a50a);padding:2px 10px 6px 32px;">${wt.warningMessage}</div>
      ` : ''}
    `;
  }

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
    const hasRepos = this._detailRepos.length > 0;
    const directlyAfterRepos = !this._showAddInput;
    const lastExpanded = hasRepos && directlyAfterRepos && this._detailRepos[this._detailRepos.length - 1].expanded;
    const isFirst = !hasRepos && !this._showAddInput;
    if (lastExpanded) {
      return 'display:flex;align-items:center;gap:4px;padding:8px 10px;height:38px;box-sizing:border-box;border:1px solid var(--divider,#333);border-radius:6px;margin:-1px 0 0;background:rgba(255,255,255,.04);cursor:pointer;color:var(--text-placeholder,#6e6e6e);font-size:12px;';
    }
    let style = 'display:flex;align-items:center;gap:4px;padding:8px 10px;height:38px;box-sizing:border-box;background:rgba(255,255,255,.04);cursor:pointer;color:var(--text-placeholder,#6e6e6e);font-size:12px;';
    style += 'border-left:1px solid var(--divider,#333);';
    style += 'border-right:1px solid var(--divider,#333);';
    style += 'border-bottom:1px solid var(--divider,#333);';
    if (isFirst) style += 'border-top:1px solid var(--divider,#333);';
    style += isFirst ? 'border-radius:6px;' : 'border-radius:0 0 6px 6px;';
    return style;
  }

  /** Shared renderer for an unverified/failed/validating repo row (no accordion). */
  private _renderUnverifiedRepoRow(
    i: number,
    entry: CreateRepoEntry,
    repos?: CreateRepoEntry[],
    onRemove?: (i: number) => void,
    onRetry?: (i: number) => void,
  ): TemplateResult {
    const arr = repos ?? this._createRepos;
    const handleRemove = onRemove ?? ((idx: number) => this._removeCreateRepo(idx));
    const handleRetry = onRetry ?? ((idx: number) => this._verifyRepo(idx));
    return html`
      <div class="repo-wrapper" style="${this._repoWrapperStyle(i, entry, arr)}">
        <div class="cr-row" tabindex="0" style="display:flex;align-items:center;gap:6px;padding:8px 10px;height:37px;box-sizing:border-box;${i === 0 ? 'border-radius:6px 6px 0 0;' : ''}">
          <openp41ge-inline-icon name="chevron-right" size="12" no-hover icon-color="var(--text-secondary,#555)"></openp41ge-inline-icon>
          <span style="flex:1;font-size:12px;color:var(--text-primary,#ccc);word-break:break-all;">${entry.url}</span>
          <div class="row-actions">
            <openp41ge-inline-icon name="close" size="12" icon-color="var(--text-secondary,#999)" hover-color="danger" @click=${() => handleRemove(i)}></openp41ge-inline-icon>
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

  private _onCardClick(entry: { filePath: string; data: WorkspaceFileData }): void {
    // First click focuses the card; a second click (on the focused card) activates it.
    if (this._focusedPath === entry.filePath) {
      this._activateWorkspace(entry);
    } else {
      this._focusedPath = entry.filePath;
      this._emitUpdate();
    }
  }

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
      worktrees: r.worktrees.map(w => ({ name: w, status: 'success' as const })),
      newWorktreeValue: "",
      showNewWorktreeInput: false,
    }));
    this._detailExpanded = entry.data.repos.map(() => false);
    this._showAddInput = false;
    this._addInputValue = "";
    this._detailRepoUrlError = "";
    this._emitUpdate();
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
    if (!wt || wt.status !== "needs-sync") return;
    // Re-verify after sync
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
      wt.errorMessage = (e as Error).message || "Sync failed";
    }
    this._emitUpdate();
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
   * 3. Return to list view
   */
  private async _onDetailSave(): Promise<void> {
    if (!this._selected) return;
    await this._cloneReposAndCheckoutWorktrees(this._detailRepos);
    await this._syncDetailReposToFile();
    this._showList();
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
        .wm-wrap { display:flex; flex-direction:column; height:100%; overflow:hidden; position:relative; }
        .cr-row { outline:none; }
        .cr-row:focus-visible { outline:2px solid var(--accent,#007acc); outline-offset:-2px; }
        .wm-view {
          position:absolute; inset:0;
          transition:transform .25s ease, opacity .2s ease;
          display:flex; flex-direction:column;
        }
        .wm-view.list {
          transform:translateX(0); opacity:1;
        }
        .wm-view.list.slide-out {
          transform:translateX(-40px); opacity:0;
          pointer-events:none;
        }
        .wm-view.detail {
          transform:translateX(40px); opacity:0;
          pointer-events:none;
        }
        .wm-view.detail.slide-in {
          transform:translateX(0); opacity:1;
          pointer-events:auto;
        }

        .wm-card {
          padding:10px 14px; margin:6px 10px; border-radius:8px;
          background:var(--bg-primary,#252526);
          border:1px solid var(--divider,#333);
          cursor:pointer;
          position:relative;
          transition:background .1s, border-color .1s;
        }
        .wm-card:hover { background:var(--bg-hover,#2a2a2a); }
        .wm-card.active { border-color:var(--accent,#007acc); }
        .wm-card.focused:not(.active) {
          background:rgba(128,128,128,0.12);
          border-color:var(--text-secondary,#999);
        }
        .wm-card-title { font-size:14px; color:var(--text-primary,#ccc); font-weight:500; padding-right:100px; }
        .wm-card-sub { display:flex; align-items:center; gap:4px; font-size:11px; color:var(--text-secondary,#999); margin-top:2px; font-family:monospace; }
        .wm-card-copy {
          display:flex; align-items:center; justify-content:center;
          background:transparent; border:none; cursor:pointer;
          color:var(--text-secondary,#999); padding:2px; border-radius:4px;
          transition:background .1s, color .1s;
        }
        .wm-card-copy:hover { color:var(--text-primary,#ccc); background:var(--bg-hover-strong,#333); }
        .wm-card-active-pill {
          padding:2px 10px; border-radius:999px; font-size:11px;
          background:rgba(0,122,204,.15); color:var(--accent,#007acc);
        }
        .wm-card-edit {
          display:flex; align-items:center; justify-content:center;
          background:transparent; border:none; cursor:pointer;
          color:var(--text-secondary,#999); padding:3px; border-radius:4px;
          transition:background .1s, color .1s;
        }
        .wm-card-edit:hover { color:var(--text-primary,#ccc); background:var(--bg-hover-strong,#333); }
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
          display:flex; align-items:center; gap:4px;
          padding:6px 10px; cursor:pointer;
          color:var(--text-secondary,#999); font-size:13px;
          transition:color .1s;
        }
        .wm-back:hover { color:var(--text-primary,#ccc); }

        /* Detail section styles (reused from old workspace-manager-system-tab) */
        .row-actions { display:none; align-items:center; gap:0; }
        .cr-row:hover .row-actions { display:flex; }

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
                  <div class="wm-card ${isActive(entry) ? 'active' : ''} ${this._focusedPath === entry.filePath ? 'focused' : ''}" @click=${() => this._onCardClick(entry)}>
                    <div style="position:absolute;top:8px;right:12px;display:flex;align-items:center;gap:6px;">
                      ${isActive(entry) ? html`<span class="wm-card-active-pill">Active</span>` : nothing}
                      <button class="wm-card-edit" title="Edit workspace" @click=${(e: MouseEvent) => { e.stopPropagation(); this._showDetail(entry); }}>
                        <svg width="12" height="12" viewBox="0 -960 960 960" fill="currentColor"><path d="M200-120q-33 0-56.5-23.5T120-200v-56q0-17 6-32l584-584q12-12 27-18t31-6q16 0 31 6t27 18l52 52q12 12 18 27t6 31q0 16-6 31t-18 27l-584 584q-15 15-30 21t-32 6h-56Zm0-80h56l568-568-56-56-568 568v56Zm640-616-56-56 56 56Z"/></svg>
                      </button>
                    </div>
                    <div class="wm-card-title">${entry.data.name ?? "(unnamed)"}</div>
                    <div class="wm-card-sub">
                      <span>${entry.data.id.slice(0, 8)}</span>
                      <button class="wm-card-copy" title="Copy ID" @click=${(e: MouseEvent) => { e.stopPropagation(); this._onCopy(e, entry.data.id); }}>
                        <svg width="12" height="12" viewBox="0 -960 960 960" fill="currentColor"><path d="M360-240q-33 0-56.5-23.5T280-320v-480q0-33 23.5-56.5T360-880h360q33 0 56.5 23.5T800-800v480q0 33-23.5 56.5T720-240H360Zm0-80h360v-480H360v480ZM200-80q-33 0-56.5-23.5T120-160v-560h80v560h440v80H200Z"/></svg>
                      </button>
                    </div>
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
    return html`
      <div class="wm-create-area" style="margin:0;padding:0;display:flex;flex-direction:column;min-height:100%;">
        <div style="padding:12px 14px;">
          <label style="display:block;font-size:11px;font-weight:600;text-transform:uppercase;color:var(--text-secondary,#999);margin-bottom:4px;">Name</label>
          <div style="display:flex;align-items:center;padding:6px 10px;height:38px;box-sizing:border-box;background:rgba(255,255,255,.04);border:1px solid var(--divider,#333);border-radius:6px;">
            <input
              type="text"
              placeholder="Workspace name"
              .value=${entry.data.name ?? ''}
              @input=${(e: Event) => this._onNameChange(e)}
              style="flex:1;background:transparent;border:none;color:var(--text-primary,#ccc);font-size:12px;padding:5px 0;outline:none;font-family:inherit;"
              autofocus
            />
          </div>
        </div>
        <div style="padding:12px 14px;flex:1;display:flex;flex-direction:column;">
          <label style="display:block;font-size:11px;font-weight:600;text-transform:uppercase;color:var(--text-secondary,#999);margin-bottom:4px;">Repositories</label>
          <div style="flex:1;overflow-y:auto;">
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
                    html`<openp41ge-inline-icon name="check-circle" size="12" icon-color="var(--accent,#007acc)" no-hover title="Ready to clone"></openp41ge-inline-icon>`,
                    () => { this._detailRepos[i].expanded = !this._detailRepos[i].expanded; this._emitUpdate(); },
                  )
                : this._renderUnverifiedRepoRow(i, entry, this._detailRepos, (idx) => this._onRemoveRepo(idx), (idx) => this._detailVerifyRepo(idx))}
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
            style="font-size:13px;padding:6px 12px;border-radius:4px;border:none;cursor:pointer;background:transparent;color:var(--text-secondary,#999);"
            @mouseenter=${(e: MouseEvent) => (e.currentTarget as HTMLElement).style.color = 'var(--text-primary,#ccc)'}
            @mouseleave=${(e: MouseEvent) => { (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary,#999)'; }}
            @click=${() => this._showList()}
          >Cancel</button>
          <button
            style="font-size:13px;padding:6px 12px;border-radius:4px;border:none;cursor:pointer;background:rgba(0,122,204,0.15);color:var(--accent,#007acc);transition:background .1s;"
            @mouseenter=${(e: MouseEvent) => { (e.currentTarget as HTMLElement).style.background = 'rgba(0,122,204,0.25)'; }}
            @mouseleave=${(e: MouseEvent) => { (e.currentTarget as HTMLElement).style.background = 'rgba(0,122,204,0.15)'; }}
            @click=${() => this._onDetailSave()}
          >Save</button>
          </div>
        </div>
      </div>
    `;
  }
}
