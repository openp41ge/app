/**
 * Workspace manager modal controller — list + detail views.
 *
 * List view shows all .openp41ge-workspace files from
 * ~/.openp41ge/workspaces/. Clicking a workspace slides to a detail
 * view with its settings. "New Workspace" creates a new workspace file.
 */

import { html, type TemplateResult } from "lit";
import type { EditorSystemTabController } from "../../controllers/types";
import type { WorkspaceFileData } from "../../../layout/types";
import { workspaceFileService } from "../../services/workspace-file-service";

interface CreateRepoEntry {
  url: string;
  status: "unverified" | "validating" | "success" | "failure";
  errorMessage?: string;
  expanded: boolean;
  worktrees: string[];
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

  constructor(tabId: string) {
    this.id = tabId;
  }

  mount(): void {
    document.addEventListener("workspace-modal:back", this._onModalBack);
    this._loadWorkspaces();
  }

  // ── State refresh ───────────────────────────────────────────────

  private _workspaces: Array<{ filePath: string; data: WorkspaceFileData }> = [];

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
          <div style="font-size:12px;color:var(--error,#e53e3e);padding:2px 10px 6px 28px;">${entry.errorMessage}</div>
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
      worktrees: [...r.worktrees],
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

  private _addCreateRepo(): void {
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
    this._verifyRepo(this._createRepos.length - 1);
  }

  private _removeCreateRepo(index: number): void {
    this._createRepos.splice(index, 1);
    this._emitUpdate();
  }

  private _verifyRepo(index: number): void {
    const repo = this._createRepos[index];
    if (!repo || repo.status === "success" || repo.status === "validating") return;
    repo.status = "validating";
    this._emitUpdate();
    setTimeout(() => {
      const msgs = [
        "Repository not found at this URL",
        "Access denied: no permission to clone",
        "Connection refused: host unreachable",
        "Invalid repository URL format",
        "Authentication required"
      ];
      const success = Math.random() > 0.3;
      repo.status = success ? "success" : "failure";
      if (!success) repo.errorMessage = msgs[Math.floor(Math.random() * msgs.length)];
      this._emitUpdate();
    }, 1500);
  }

  private _toggleRepoExpanded(index: number): void {
    const repo = this._createRepos[index];
    if (!repo || repo.status !== "success") return;
    repo.expanded = !repo.expanded;
    this._emitUpdate();
  }

  private _addWorktree(repoIndex: number): void {
    const repo = this._createRepos[repoIndex];
    if (!repo) return;
    const name = repo.newWorktreeValue.trim();
    if (!name) return;
    repo.worktrees.push(name);
    repo.newWorktreeValue = "";
    this._emitUpdate();
    setTimeout(() => { const el = document.querySelector('.wt-input'); if (el instanceof HTMLInputElement) { el.value = ''; el.focus(); } }, 0);
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
      // Persist verified repos with their worktrees
      for (const entry of this._createRepos) {
        if (entry.status === "success") {
          data.repos.push({ url: entry.url, worktrees: entry.worktrees });
        }
      }
      if (this._createRepos.length > 0) {
        await window.openp41ge.dialog.writeWorkspaceFile(
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
    this._emitUpdate();
  }

  private async _onDeleteWorkspace(entry: { filePath: string; data: WorkspaceFileData }): Promise<void> {
    // We can't easily delete via IPC right now — just skip
    // For now, let the user manage files manually
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
    const folder = await window.openp41ge.dialog.pickFolder();
    if (!folder || !this._selected) return;
    this._selected.data.dataDir = folder;
    // Persist to disk
    await window.openp41ge.dialog.writeWorkspaceFile(this._selected.filePath, this._selected.data);
    this._emitUpdate();
  }

  private async _onNameChange(e: Event): Promise<void> {
    if (!this._selected) return;
    const val = (e.target as HTMLInputElement).value;
    this._selected.data.name = val || undefined;
    await window.openp41ge.dialog.writeWorkspaceFile(this._selected.filePath, this._selected.data);
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
    // Verify
    const repo = this._detailRepos[index];
    repo.status = "validating";
    this._emitUpdate();
    setTimeout(async () => {
      const msgs = [
        "Repository not found at this URL",
        "Access denied: no permission to clone",
        "Connection refused: host unreachable",
        "Invalid repository URL format",
        "Authentication required"
      ];
      const success = Math.random() > 0.3;
      if (success) {
        repo.status = "success";
        await this._syncDetailReposToFile();
      } else {
        repo.status = "failure";
        repo.errorMessage = msgs[Math.floor(Math.random() * msgs.length)];
      }
      this._emitUpdate();
    }, 1500);
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

  private _detailVerifyRepo(index: number): void {
    const repo = this._detailRepos[index];
    if (!repo || repo.status === "success" || repo.status === "validating") return;
    repo.status = "validating";
    this._emitUpdate();
    setTimeout(async () => {
      const msgs = [
        "Repository not found at this URL",
        "Access denied: no permission to clone",
        "Connection refused: host unreachable",
        "Invalid repository URL format",
        "Authentication required"
      ];
      const success = Math.random() > 0.3;
      if (success) {
        repo.status = "success";
        await this._syncDetailReposToFile();
      } else {
        repo.status = "failure";
        repo.errorMessage = msgs[Math.floor(Math.random() * msgs.length)];
      }
      this._emitUpdate();
    }, 1500);
  }

  private async _syncDetailReposToFile(): Promise<void> {
    if (!this._selected) return;
    this._selected.data.repos = this._detailRepos.map(r => ({ url: r.url, worktrees: [...r.worktrees] }));
    await window.openp41ge.dialog.writeWorkspaceFile(this._selected.filePath, this._selected.data);
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
        .cr-row { }
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
          transition:background .1s, border-color .1s;
        }
        .wm-card:hover { background:var(--bg-hover,#2a2a2a); }
        .wm-card.active { border-color:var(--accent,#007acc); }
        .wm-card-title { font-size:14px; color:var(--text-primary,#ccc); font-weight:500; }
        .wm-card-sub { font-size:11px; color:var(--text-secondary,#999); margin-top:2px; font-family:monospace; }
        .wm-card-actions { display:flex; gap:6px; margin-top:6px; }
        .wm-btn {
          padding:3px 8px; font-size:12px; border:none; border-radius:4px;
          cursor:pointer; background:transparent; color:var(--text-secondary,#999);
          transition:background .1s, color .1s;
        }
        .wm-btn:hover { background:var(--bg-hover-strong,#333); color:var(--text-primary,#ccc); }
        .wm-btn.primary { color:var(--accent,#007acc); }
        .wm-btn.primary:hover { background:rgba(0,122,204,.15); }

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
                    <div class="cr-row" tabindex="0"
                      style="${this._addRepoRowStyle()}"
                      @click=${() => { this._repoUrlError = ""; this._newRepoValue = ""; this._showNewRepoInput = true; this._emitUpdate(); setTimeout(() => { const el = document.querySelector('.new-repo-input'); if (el instanceof HTMLInputElement) el.focus(); }, 0); }}
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
                                  ${entry.worktrees.map((wt, wtIndex) => html`
                                    <div class="cr-row" tabindex="0" style="display:flex;align-items:center;gap:6px;padding:8px 10px;">
                                      <openp41ge-inline-icon name="corner" size="12" no-hover icon-color="var(--text-secondary,#555)"></openp41ge-inline-icon>
                                      <span style="flex:1;font-size:12px;color:var(--text-primary,#ccc);word-break:break-all;">${wt}</span>
                                      <openp41ge-inline-icon name="close" size="12" icon-color="var(--text-secondary,#999)" hover-color="danger" @click=${() => this._removeWorktree(i, wtIndex)}></openp41ge-inline-icon>
                                    </div>
                                  `)}
                                  ${entry.showNewWorktreeInput ? html`
                                    <div class="cr-row" tabindex="0" style="display:flex;align-items:center;gap:6px;padding:8px 10px;">
                                      <openp41ge-inline-icon name="corner" size="12" no-hover icon-color="var(--text-secondary,#555)"></openp41ge-inline-icon>
                                      <input
                                        type="text"
                                        placeholder="Branch or path"
                                        .value=${entry.newWorktreeValue}
                                        @input=${(e: Event) => { entry.newWorktreeValue = (e.target as HTMLInputElement).value; }}
                                        @keydown=${(e: KeyboardEvent) => { if (e.key === 'Enter') this._addWorktree(i); }}
                                        style="flex:1;background:transparent;border:none;color:var(--text-primary,#ccc);font-size:12px;padding:0;outline:none;font-family:inherit;"
                                        class="wt-input" autofocus
                                      />
                                      <openp41ge-inline-icon name="plus" size="12" icon-color="var(--accent,#007acc)" hover-color="accent" @click=${() => this._addWorktree(i)}></openp41ge-inline-icon>
                                    </div>
                                  ` : ''}
                                </div>
                                <div
                                  style="display:flex;align-items:center;gap:6px;padding:8px 10px;cursor:pointer;color:var(--text-placeholder,#6e6e6e);font-size:12px;border-top:1px solid var(--divider,#333);"
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
                            @keydown=${(e: KeyboardEvent) => { if (e.key === 'Enter') this._addCreateRepo(); }}
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
                    <div class="cr-row" tabindex="0"
                      style="${this._addRepoRowStyle()}"
                      @click=${() => { this._repoUrlError = ""; this._newRepoValue = ""; this._showNewRepoInput = true; this._emitUpdate(); setTimeout(() => { const el = document.querySelector('.new-repo-input'); if (el instanceof HTMLInputElement) el.focus(); }, 0); }}
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

          ${!this._creating && this._workspaces.length === 0
            ? html`<div style="padding:20px;text-align:center;color:var(--text-secondary,#999);font-size:13px;">No workspaces yet.</div>`
            : !this._creating ? this._workspaces.map((entry) => html`
              <div class="wm-card ${isActive(entry) ? 'active' : ''}" @click=${() => this._showDetail(entry)}>
                <div class="wm-card-title">${entry.data.name ?? "(unnamed)"}</div>
                <div class="wm-card-sub">${entry.data.id.slice(0, 8)}</div>
                <div class="wm-card-actions">
                  ${isActive(entry)
                    ? html`<span style="font-size:11px;color:var(--accent,#007acc);align-self:center;">Active</span>`
                    : html`<button class="wm-btn primary" @click=${(e: MouseEvent) => { e.stopPropagation(); this._activateWorkspace(entry); }}>Activate</button>`}
                  <button class="wm-btn" @click=${(e: MouseEvent) => { e.stopPropagation(); this._onCopy(e, entry.data.id); }}>Copy ID</button>
                </div>
              </div>
            `) : ''}
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
              >+ Create Workspace</button>
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
                        ${entry.worktrees.map((wt, wtIndex) => html`
                          <div class="cr-row" tabindex="0" style="display:flex;align-items:center;gap:6px;padding:8px 10px;">
                            <openp41ge-inline-icon name="corner" size="12" no-hover icon-color="var(--text-secondary,#555)"></openp41ge-inline-icon>
                            <span style="flex:1;font-size:12px;color:var(--text-primary,#ccc);word-break:break-all;">${wt}</span>
                            <openp41ge-inline-icon name="close" size="12" icon-color="var(--text-secondary,#999)" hover-color="danger" @click=${async () => { this._detailRepos[i].worktrees.splice(wtIndex, 1); this._emitUpdate(); await this._syncDetailReposToFile(); }}></openp41ge-inline-icon>
                          </div>
                        `)}
                        ${entry.showNewWorktreeInput ? html`
                          <div class="cr-row" tabindex="0" style="display:flex;align-items:center;gap:6px;padding:8px 10px;">
                            <openp41ge-inline-icon name="corner" size="12" no-hover icon-color="var(--text-secondary,#555)"></openp41ge-inline-icon>
                            <input
                              type="text"
                              placeholder="Branch or path"
                              .value=${entry.newWorktreeValue}
                              @input=${(e: Event) => { entry.newWorktreeValue = (e.target as HTMLInputElement).value; }}
                              @keydown=${(e: KeyboardEvent) => { if (e.key === 'Enter') { if (entry.newWorktreeValue.trim()) { entry.worktrees.push(entry.newWorktreeValue.trim()); entry.newWorktreeValue = ''; this._emitUpdate(); setTimeout(() => { const el = document.querySelector('.wt-input'); if (el instanceof HTMLInputElement) { el.value = ''; el.focus(); } }, 0); } } }}
                              style="flex:1;background:transparent;border:none;color:var(--text-primary,#ccc);font-size:12px;padding:0;outline:none;font-family:inherit;"
                              class="wt-input" autofocus
                            />
                            <openp41ge-inline-icon name="plus" size="12" icon-color="var(--accent,#007acc)" hover-color="accent" @click=${async () => { if (entry.newWorktreeValue.trim()) { entry.worktrees.push(entry.newWorktreeValue.trim()); entry.newWorktreeValue = ''; this._emitUpdate(); setTimeout(() => { const el = document.querySelector('.wt-input'); if (el instanceof HTMLInputElement) { el.value = ''; el.focus(); } }, 0); await this._syncDetailReposToFile(); } }}></openp41ge-inline-icon>
                          </div>
                        ` : ''}
                      </div>
                      <div
                        style="display:flex;align-items:center;gap:6px;padding:8px 10px;cursor:pointer;color:var(--text-placeholder,#6e6e6e);font-size:12px;border-top:1px solid var(--divider,#333);"
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
            <div class="cr-row" tabindex="0"
              style="${this._detailAddRepoRowStyle()}"
              @click=${() => { this._showAddInput = true; this._addInputValue = ""; this._detailRepoUrlError = ""; this._emitUpdate(); setTimeout(() => { const el = document.querySelector('.detail-repo-input'); if (el instanceof HTMLInputElement) el.focus(); }, 0); }}
              @mouseenter=${(e: MouseEvent) => (e.currentTarget as HTMLElement).style.color = 'var(--text-primary,#ccc)'}
              @mouseleave=${(e: MouseEvent) => (e.currentTarget as HTMLElement).style.color = 'var(--text-placeholder,#6e6e6e)'}
            >
              <openp41ge-inline-icon name="plus" size="12" icon-color="var(--text-placeholder,#6e6e6e)" no-hover></openp41ge-inline-icon>
              <span>Add repository</span>
            </div>
          </div>
        </div>
        <!-- Bottom bar: Save/Cancel -->
        <div style="display:flex;align-items:center;justify-content:flex-end;padding:0 6px;height:40px;border-top:1px solid var(--divider,#333);flex-shrink:0;gap:6px;">
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
            @click=${async () => { await this._syncDetailReposToFile(); this._showList(); }}
          >Save</button>
        </div>
      </div>
    `;
  }
}
