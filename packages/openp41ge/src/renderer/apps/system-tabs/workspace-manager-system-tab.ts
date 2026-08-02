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
      return "Workspaces  >  Create Workspace";
    }
    if (this._view === "detail" && this._selected) {
      return `Workspaces  >  ${this._selected.data.name ?? "(unnamed)"}`;
    }
    return "Workspaces";
  }

  private _view: View = "list";
  private _selected: { filePath: string; data: WorkspaceFileData } | null = null;

  /** Whether we're in the "creating" state (showing the create form). */
  private _creating = false;
  private _createName = "";
  private _createRepos: CreateRepoEntry[] = [];
  private _newRepoValue = "";
  private _showNewRepoInput = false;

  /** Error message for workspace name validation. */
  private _nameError = "";

  /** Whether user has attempted to create (triggers validation UI). */
  private _nameTouched = false;

  /** Error for repo URL validation. */
  private _repoUrlError = "";

  /** Detail view editing state. */
  private _showAddInput = false;
  private _addInputValue = "";

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

  /** Style string for a repo wrapper based on expanded/collapsed state and neighbor state. */
  private _repoWrapperStyle(i: number, entry: CreateRepoEntry): string {
    if (entry.expanded) {
      return 'box-sizing:border-box;min-height:38px;border:1px solid var(--divider,#333);border-radius:6px;margin:4px 0;background:rgba(255,255,255,.04);';
    }
    // Collapsed — figure out if neighbors are expanded for border-radius
    const prevExpanded = i > 0 && this._createRepos[i - 1]?.expanded;
    const nextExpanded = i < this._createRepos.length - 1 && this._createRepos[i + 1]?.expanded;
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
      return 'display:flex;align-items:center;gap:4px;padding:8px 10px;height:38px;box-sizing:border-box;border:1px solid var(--divider,#333);border-radius:6px;margin:-1px 0 0;background:rgba(255,255,255,.04);cursor:pointer;color:var(--text-secondary,#999);font-size:12px;';
    }
    // Connected to the group above — always left, right, bottom; top only if first
    let style = 'display:flex;align-items:center;gap:4px;padding:8px 10px;height:38px;box-sizing:border-box;background:rgba(255,255,255,.04);cursor:pointer;color:var(--text-secondary,#999);font-size:12px;';
    style += 'border-left:1px solid var(--divider,#333);';
    style += 'border-right:1px solid var(--divider,#333);';
    style += 'border-bottom:1px solid var(--divider,#333);';
    if (showTopBorder) style += 'border-top:1px solid var(--divider,#333);';
    style += isFirst ? 'border-radius:6px;' : 'border-radius:0 0 6px 6px;';
    return style;
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
    this._showNewRepoInput = false;
    this._emitUpdate();
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
    repo.showNewWorktreeInput = false;
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
    this._selected.data.repos.push({ url, worktrees: [] });
    await window.openp41ge.dialog.writeWorkspaceFile(this._selected.filePath, this._selected.data);
    this._showAddInput = false;
    this._addInputValue = "";
    this._emitUpdate();
  }

  private _onAddCancel(): void {
    this._showAddInput = false;
    this._addInputValue = "";
    this._emitUpdate();
  }

  private async _onRemoveRepo(index: number): Promise<void> {
    if (!this._selected) return;
    this._selected.data.repos.splice(index, 1);
    await window.openp41ge.dialog.writeWorkspaceFile(this._selected.filePath, this._selected.data);
    this._emitUpdate();
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
        .cr-spinner { animation:cr-spin 1s linear infinite; }
        @keyframes cr-spin { from { transform:rotate(0deg); } to { transform:rotate(360deg); } }
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

        .wm-back {
          display:flex; align-items:center; gap:4px;
          padding:6px 10px; cursor:pointer;
          color:var(--text-secondary,#999); font-size:13px;
          transition:color .1s;
        }
        .wm-back:hover { color:var(--text-primary,#ccc); }

        /* Detail section styles (reused from old workspace-manager-system-tab) */
        .ws-section { padding:8px 12px; margin:6px 10px; border-radius:8px; background:transparent; border:none; }
        .ws-row { display:flex; align-items:center; gap:12px; min-height:28px; }
        .ws-label { font-size:11px; font-weight:600; text-transform:uppercase; color:var(--text-secondary,#999); flex-shrink:0; width:140px; }
        .ws-value { font-size:13px; color:var(--text-primary,#ccc); flex:1 1 auto; min-width:0; text-align:right; }
        .ws-actions { display:inline-flex; gap:2px; }
        .ws-act-btn {
          padding:2px 6px; font-size:12px; border:none; border-radius:3px;
          cursor:pointer; background:transparent; color:var(--text-secondary,#999);
          transition:background .1s;
        }
        .ws-act-btn:hover { background:var(--bg-hover,rgba(128,128,128,.15)); color:var(--text-primary,#ccc); }
        .ws-path { font-family:monospace; font-size:12px; color:var(--text-secondary,#999); text-align:left; word-break:break-all; padding:2px 0 0; }
        .ws-name-input {
          background:transparent; border:none; border-bottom:1px solid var(--divider,#555);
          color:var(--text-primary,#ccc); font-size:13px; padding:0 0 2px; outline:none; width:100%;
        }
        .ws-name-input:focus { border-bottom-color:var(--accent,#007acc); }
        .ws-empty { color:var(--text-secondary,#999); font-size:13px; }
      </style>
      <div class="wm-wrap">
        <!-- ── List view ── -->
        <div class="wm-view list ${this._view === 'detail' ? 'slide-out' : ''}">
          <div style="flex:1;overflow-y:auto;padding:4px 0;">
          ${this._creating ? html`
            <div class="wm-create-area" style="margin:0;padding:0;display:flex;flex-direction:column;min-height:100%;">
              <div style="padding:12px 14px;">
                <label style="display:block;font-size:11px;font-weight:600;text-transform:uppercase;color:var(--text-secondary,#999);margin-bottom:4px;">Name</label>
                <input
                  type="text"
                  placeholder="Workspace name"
                  .value=${this._createName}
                  @input=${(e: Event) => { this._createName = (e.target as HTMLInputElement).value; this._nameError = ''; }}
                  @keydown=${(e: KeyboardEvent) => { if (e.key === 'Enter') this._createWorkspace(); }}
                  style="width:100%;background:rgba(255,255,255,.08);border:${this._nameTouched && !this._nameValid ? '1px solid var(--error,#e53e3e)' : 'none'};border-radius:4px;color:var(--text-primary,#ccc);font-size:14px;padding:7px 9px;outline:none;"
                  autofocus
                />
                ${this._nameTouched && !this._nameValid ? html`
                  <div style="font-size:11px;color:var(--error,#e53e3e);margin-top:4px;">${this._nameError}</div>
                ` : ''}
              </div>
              <div style="padding:0 14px 12px;">
                <label style="display:block;font-size:11px;font-weight:600;text-transform:uppercase;color:var(--text-secondary,#999);margin-bottom:4px;">Repositories</label>
                <div style="display:block;">
                  ${this._createRepos.map((entry, i) => html`
                    <!-- Repo row -->
                    <div class="repo-wrapper" style="${this._repoWrapperStyle(i, entry)}">
                      ${entry.status === "success" ? html`
                        <!-- Verified repo: collapsible header -->
                        <div class="cr-row" tabindex="0"
                          style="display:flex;align-items:center;gap:6px;padding:8px 10px;height:37px;box-sizing:border-box;cursor:pointer;user-select:none;${i === 0 ? 'border-radius:6px 6px 0 0;' : ''}"
                          @click=${() => this._toggleRepoExpanded(i)}
                        >
                          <svg width="12" height="12" viewBox="0 -960 960 960" fill="currentColor" style="color:var(--text-secondary,#999);transform:rotate(${entry.expanded ? '90deg' : '0deg'});">
                            <path d="M504-480 320-664l56-56 240 240-240 240-56-56 184-184Z"/>
                          </svg>
                          <span style="flex:1;font-size:12px;color:var(--text-primary,#ccc);word-break:break-all;">${entry.url}</span>
                          <svg width="14" height="14" viewBox="0 -960 960 960" fill="currentColor" style="color:var(--accent,#007acc);flex-shrink:0;" title="Ready to clone">
                            <path d="m424-296 282-282-56-56-226 226-114-114-56 56 170 170Zm56 216q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Zm0-80q134 0 227-93t93-227q0-134-93-227t-227-93q-134 0-227 93t-93 227q0 134 93 227t227 93Zm0-320Z"/>
                          </svg>
                          <span
                            style="cursor:pointer;display:flex;align-items:center;color:var(--text-secondary,#999);flex-shrink:0;padding:2px;border-radius:3px;transition:background .1s,color .1s;"
                            @mouseenter=${(e: MouseEvent) => { const el = e.currentTarget as HTMLElement; el.style.background = 'rgba(229,62,62,0.15)'; el.style.color = 'var(--error,#e53e3e)'; }}
                            @mouseleave=${(e: MouseEvent) => { const el = e.currentTarget as HTMLElement; el.style.background = 'transparent'; el.style.color = 'var(--text-secondary,#999)'; }}
                            @click=${(e: Event) => { e.stopPropagation(); this._removeCreateRepo(i); }}
                          >
                            <svg width="12" height="12" viewBox="0 -960 960 960" fill="currentColor"><path d="m256-200-56-56 224-224-224-224 56-56 224 224 224-224 56 56-224 224 224 224-56 56-224-224-224 224Z"/></svg>
                          </span>
                        </div>
                        <!-- Expanded sub-list for worktrees -->
                        ${entry.expanded ? html`
                          <div>
                            ${entry.worktrees.map((wt, wtIndex) => html`
                              <div class="cr-row" tabindex="0" style="display:flex;align-items:center;gap:6px;padding:8px 10px;">
                                <span style="color:var(--text-secondary,#555);flex-shrink:0;font-size:12px;font-family:monospace;line-height:12px;width:12px;text-align:center;">└</span>
                                <span style="flex:1;font-size:12px;color:var(--text-primary,#ccc);word-break:break-all;">${wt}</span>
                                <span
                                  style="cursor:pointer;display:flex;align-items:center;color:var(--text-secondary,#999);flex-shrink:0;padding:2px;border-radius:3px;transition:background .1s,color .1s;"
                                  @mouseenter=${(e: MouseEvent) => { const el = e.currentTarget as HTMLElement; el.style.background = 'rgba(229,62,62,0.15)'; el.style.color = 'var(--error,#e53e3e)'; }}
                                  @mouseleave=${(e: MouseEvent) => { const el = e.currentTarget as HTMLElement; el.style.background = 'transparent'; el.style.color = 'var(--text-secondary,#999)'; }}
                                  @click=${() => this._removeWorktree(i, wtIndex)}
                                >
                                  <svg width="10" height="10" viewBox="0 -960 960 960" fill="currentColor"><path d="m256-200-56-56 224-224-224-224 56-56 224 224 224-224 56 56-224 224 224 224-56 56-224-224-224 224Z"/></svg>
                                </span>
                              </div>
                            `)}
                            ${entry.showNewWorktreeInput ? html`
                              <div class="cr-row" tabindex="0" style="display:flex;align-items:center;gap:6px;padding:8px 10px;">
                                <span style="color:var(--text-secondary,#555);flex-shrink:0;font-size:12px;font-family:monospace;line-height:12px;width:12px;text-align:center;">└</span>
                                <input
                                  type="text"
                                  placeholder="Branch or path"
                                  .value=${entry.newWorktreeValue}
                                  @input=${(e: Event) => { entry.newWorktreeValue = (e.target as HTMLInputElement).value; }}
                                  @keydown=${(e: KeyboardEvent) => { if (e.key === 'Enter') this._addWorktree(i); }}
                                  style="flex:1;background:transparent;border:none;color:var(--text-primary,#ccc);font-size:12px;padding:4px 0;outline:none;"
                                  autofocus
                                />
                                <span
                                  style="cursor:pointer;display:flex;align-items:center;color:var(--accent,#007acc);flex-shrink:0;"
                                  @click=${() => this._addWorktree(i)}
                                >
                                  <svg width="14" height="14" viewBox="0 -960 960 960" fill="currentColor"><path d="M440-440H200v-80h240v-240h80v240h240v80H520v240h-80v-240Z"/></svg>
                                </span>
                              </div>
                            ` : ''}
                          </div>
                          <div
                            style="display:flex;align-items:center;gap:6px;padding:8px 10px;cursor:pointer;color:var(--text-secondary,#999);font-size:12px;border-top:1px solid var(--divider,#333);"
                            @click=${() => { entry.showNewWorktreeInput = true; this._emitUpdate(); }}
                            @mouseenter=${(e: MouseEvent) => (e.currentTarget as HTMLElement).style.color = 'var(--text-primary,#ccc)'}
                            @mouseleave=${(e: MouseEvent) => (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary,#999)'}
                          >
                            <svg width="12" height="12" viewBox="0 -960 960 960" fill="currentColor"><path d="M440-440H200v-80h240v-240h80v240h240v80H520v240h-80v-240Z"/></svg>
                            <span>add worktree</span>
                          </div>
                        ` : ''}
                      ` : html`
                        <!-- Unverified repo: URL text + verify + remove -->
                        <div class="cr-row" tabindex="0" style="display:flex;align-items:center;gap:6px;padding:8px 10px;height:37px;box-sizing:border-box;${i === 0 ? 'border-radius:6px 6px 0 0;' : ''}">
                          <svg width="12" height="12" viewBox="0 -960 960 960" fill="currentColor" style="color:var(--text-secondary,#555);flex-shrink:0;">
                            <path d="M504-480 320-664l56-56 240 240-240 240-56-56 184-184Z"/>
                          </svg>
                          <span style="flex:1;font-size:12px;color:var(--text-primary,#ccc);word-break:break-all;">${entry.url}</span>
                          <!-- Always-rendered status icon (hidden when unverified so layout doesn't shift) -->
                          <span
                            style="cursor:pointer;display:flex;align-items:center;color:${entry.status === 'failure' ? 'var(--error,#e53e3e)' : 'var(--accent,#007acc)'};flex-shrink:0;padding:2px;border-radius:3px;transition:background .1s,color .1s;visibility:${entry.status === 'unverified' ? 'hidden' : 'visible'};"
                            @mouseenter=${(e: MouseEvent) => { if (entry.status === 'failure') { const el = e.currentTarget as HTMLElement; el.style.background = 'rgba(229,62,62,0.15)'; } }}
                            @mouseleave=${(e: MouseEvent) => { const el = e.currentTarget as HTMLElement; el.style.background = 'transparent'; }}
                            @click=${(e: Event) => { if (entry.status === 'failure') { e.stopPropagation(); this._verifyRepo(i); } }}
                          >
                            ${entry.status === 'failure' ? html`
                              <svg width="12" height="12" viewBox="0 -960 960 960" fill="currentColor"><path d="M480-160q-134 0-227-93t-93-227q0-134 93-227t227-93q69 0 132 28.5T720-690v-110h80v280H520v-80h168q-32-56-87.5-88T480-720q-100 0-170 70t-70 170q0 100 70 170t170 70q77 0 139-44t87-116h84q-28 106-114 173t-196 67Z"/></svg>
                            ` : html`
                              <svg class="cr-spinner" width="12" height="12" viewBox="0 -960 960 960" fill="currentColor"><path d="M480-80q-82 0-155-31.5t-127.5-86Q143-252 111.5-325T80-480q0-83 31.5-155.5t86-127Q252-817 325-848.5T480-880q17 0 28.5 11.5T520-840q0 17-11.5 28.5T480-800q-134 0-227 93t-93 227q0 134 93 227t227 93q134 0 227-93t93-227q0-17 11.5-28.5T840-520q17 0 28.5 11.5T880-480q0 82-31.5 155t-86 127.5q-54.5 54.5-127 86T480-80Z"/></svg>
                            `}
                          </span>
                          <span
                            style="cursor:pointer;display:flex;align-items:center;color:var(--text-secondary,#999);flex-shrink:0;padding:2px;border-radius:3px;transition:background .1s,color .1s;"
                            @mouseenter=${(e: MouseEvent) => { const el = e.currentTarget as HTMLElement; el.style.background = 'rgba(229,62,62,0.15)'; el.style.color = 'var(--error,#e53e3e)'; }}
                            @mouseleave=${(e: MouseEvent) => { const el = e.currentTarget as HTMLElement; el.style.background = 'transparent'; el.style.color = 'var(--text-secondary,#999)'; }}
                            @click=${() => this._removeCreateRepo(i)}
                          >
                            <svg width="12" height="12" viewBox="0 -960 960 960" fill="currentColor"><path d="m256-200-56-56 224-224-224-224 56-56 224 224 224-224 56 56-224 224 224 224-56 56-224-224-224 224Z"/></svg>
                          </span>
                        </div>
                        ${entry.status === 'failure' && entry.errorMessage ? html`
                          <div style="font-size:12px;color:var(--error,#e53e3e);padding:4px 10px 6px 28px;">${entry.errorMessage}</div>
                        ` : ''}
                      `}
                    </div>
                  `)}
                  <!-- New repo URL input row (above +add) -->
                  ${this._showNewRepoInput ? html`
                    <div class="cr-row" tabindex="0" style="display:flex;flex-direction:column;padding:6px 10px;height:38px;box-sizing:border-box;background:rgba(255,255,255,.04);border-left:1px solid var(--divider,#333);border-right:1px solid var(--divider,#333);border-bottom:1px solid var(--divider,#333);${(this._createRepos.length === 0 || (this._createRepos.length > 0 && this._createRepos[this._createRepos.length - 1].expanded)) ? 'border-top:1px solid var(--divider,#333);border-radius:6px 6px 0 0;' : ''}" @click=${() => { const inp = document.querySelector('.new-repo-input'); if (inp instanceof HTMLInputElement) inp.focus(); }}>
                      <div style="display:flex;align-items:center;gap:6px;">
                          <svg width="12" height="12" viewBox="0 -960 960 960" fill="currentColor" style="color:var(--text-secondary,#555);flex-shrink:0;">
                            <path d="M504-480 320-664l56-56 240 240-240 240-56-56 184-184Z"/>
                          </svg>
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
                        <span
                          style="cursor:pointer;display:flex;align-items:center;color:var(--accent,#007acc);flex-shrink:0;padding:2px;border-radius:3px;transition:background .1s,color .1s;"
                          @mouseenter=${(e: MouseEvent) => { const el = e.currentTarget as HTMLElement; el.style.background = 'rgba(0,122,204,0.15)'; }}
                          @mouseleave=${(e: MouseEvent) => { const el = e.currentTarget as HTMLElement; el.style.background = 'transparent'; }}
                          @click=${(e: Event) => { e.stopPropagation(); this._addCreateRepo(); }}
                        >
                          <svg width="14" height="14" viewBox="0 -960 960 960" fill="currentColor"><path d="M440-440H200v-80h240v-240h80v240h240v80H520v240h-80v-240Z"/></svg>
                        </span>
                      </div>
                      ${this._repoUrlError ? html`
                        <div style="font-size:12px;color:var(--error,#e53e3e);margin-top:2px;">${this._repoUrlError}</div>
                      ` : ''}
                    </div>
                  ` : ''}
                  <!-- + add repository row -->
                  <div class="cr-row" tabindex="0"
                    style="${this._addRepoRowStyle()}"
                    @click=${() => { this._repoUrlError = ""; this._showNewRepoInput = true; this._emitUpdate(); setTimeout(() => { const el = document.querySelector('.new-repo-input'); if (el instanceof HTMLInputElement) el.focus(); }, 0); }}
                    @mouseenter=${(e: MouseEvent) => (e.currentTarget as HTMLElement).style.color = 'var(--text-primary,#ccc)'}
                    @mouseleave=${(e: MouseEvent) => (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary,#999)'}
                  >
                    <svg width="12" height="12" viewBox="0 -960 960 960" fill="currentColor"><path d="M440-440H200v-80h240v-240h80v240h240v80H520v240h-80v-240Z"/></svg>
                    <span>add repository</span>
                  </div>
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
    const data = entry.data;

    return html`
      <div class="ws-section">
        <div class="ws-row">
          <div class="ws-label">Name</div>
          <div class="ws-value">
            <input
              class="ws-name-input"
              type="text"
              .value=${data.name ?? ''}
              placeholder="Unnamed workspace"
              @input=${(e: Event) => this._onNameChange(e)}
            />
          </div>
        </div>
      </div>
      <div class="ws-section">
        <div class="ws-row">
          <div class="ws-label">ID</div>
          <div class="ws-value">
            <span class="ws-actions">
              <button class="ws-act-btn" @click=${(e: MouseEvent) => this._onCopy(e, data.id)}>Copy</button>
            </span>
          </div>
        </div>
        <div class="ws-path">${data.id}</div>
      </div>
      <div class="ws-section">
        <div class="ws-row">
          <div class="ws-label">File</div>
          <div class="ws-value">
            <span class="ws-actions">
              <button class="ws-act-btn" @click=${() => this._onSaveAs()}>Edit</button>
              <button class="ws-act-btn" @click=${(e: MouseEvent) => this._onCopy(e, entry.filePath)}>Copy</button>
            </span>
          </div>
        </div>
        <div class="ws-path">${entry.filePath}</div>
      </div>
      <div class="ws-section">
        <div class="ws-row">
          <div class="ws-label">Data Directory</div>
          <div class="ws-value">
            <span class="ws-actions">
              <button class="ws-act-btn" @click=${() => this._onChangeDataDir()}>Edit</button>
              <button class="ws-act-btn" @click=${(e: MouseEvent) => this._onCopy(e, data.dataDir)}>Copy</button>
            </span>
          </div>
        </div>
        <div class="ws-path">${data.dataDir}</div>
      </div>
      <div class="ws-section">
        <div class="ws-row">
          <div class="ws-label">Repositories (${data.repos.length})</div>
          <div class="ws-value">
            <span class="ws-actions">
              <button class="ws-act-btn" @click=${() => this._onAddRepo()}>Add</button>
            </span>
          </div>
        </div>
        ${this._showAddInput ? html`
          <div style="display:flex;align-items:center;gap:4px;margin-left:-6px;padding:4px 6px;border-radius:4px;background:rgba(255,255,255,.06)">
            <input
              type="text"
              placeholder="Enter repo URL"
              .value=${this._addInputValue}
              @input=${(e: Event) => { this._addInputValue = (e.target as HTMLInputElement).value; }}
              @keydown=${(e: KeyboardEvent) => { if (e.key === 'Enter') this._onAddConfirm(); if (e.key === 'Escape') this._onAddCancel(); }}
              style="flex:1;background:transparent;color:var(--text-primary,#ccc);border:none;border-radius:3px;padding:3px 0;font-size:12px;outline:none"
            />
            <span style="cursor:pointer;display:flex;align-items:center;color:var(--accent,#007acc)" @click=${() => this._onAddConfirm()}>
              <svg width="16" height="16" viewBox="0 -960 960 960" fill="currentColor"><path d="M382-240 154-468l57-57 171 171 367-367 57 57-424 424Z"/></svg>
            </span>
            <span style="cursor:pointer;display:flex;align-items:center;color:var(--text-secondary,#999)" @click=${() => this._onAddCancel()}>
              <svg width="16" height="16" viewBox="0 -960 960 960" fill="currentColor"><path d="m256-200-56-56 224-224-224-224 56-56 224 224 224-224 56 56-224 224 224 224-56 56-224-224-224 224Z"/></svg>
            </span>
          </div>
        ` : ''}
        <div class="ws-path">
          ${data.repos.length > 0
            ? data.repos.map((r, i) => html`
              <div style="display:flex;align-items:center;gap:6px;margin:6px 0;padding:6px 10px;border-radius:6px;background:var(--bg-secondary,rgba(255,255,255,.04))">
                <span style="flex:1;font-size:13px;color:var(--text-primary,#ccc);word-break:break-all">${r.url}</span>
                <span
                  style="cursor:pointer;display:flex;align-items:center;color:var(--text-secondary,#999);flex-shrink:0"
                  title="Remove repository"
                  @click=${() => this._onRemoveRepo(i)}
                  @mouseenter=${(e: MouseEvent) => (e.currentTarget as HTMLElement).style.color = 'var(--text-primary,#ccc)'}
                  @mouseleave=${(e: MouseEvent) => (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary,#999)'}
                >
                  <svg width="14" height="14" viewBox="0 -960 960 960" fill="currentColor"><path d="M280-120q-33 0-56.5-23.5T200-200v-520h-40v-80h200v-40h240v40h200v80h-40v520q0 33-23.5 56.5T680-120H280Zm400-600H280v520h400v-520ZM360-280h80v-360h-80v360Zm160 0h80v-360h-80v360ZM280-720v520-520Z"/></svg>
                </span>
              </div>
            `)
            : html`<span class="ws-empty">No repositories added</span>`}
        </div>
      </div>
    `;
  }
}
