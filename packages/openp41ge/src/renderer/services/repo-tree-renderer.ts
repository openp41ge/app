/**
 * RepoTreeRenderer — pure DOM tree rendering for worktree explorer.
 *
 * Single Responsibility: turn workspace data into DOM elements.
 * No IPC, no state management, no event wiring beyond what's passed in.
 */

import {
  folderClosedIcon,
  fileIcon,
  chevronRight,
  chevronDown,
  gitBranchIcon,
  plusIcon,
  gitInfoIcon,
  eyeIcon,
  eyeOffIcon,
} from "../icons";

export interface FileEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  size: number;
  modifiedAt: number;
}

export interface TreeRowCallbacks {
  onFileClick: (path: string, name: string) => void;
  onFileDoubleClick: (path: string, name: string) => void;
  onFileContextMenu: (path: string, name: string, x: number, y: number) => void;
  onToggleDir: (path: string) => void;
  onWorktreeContextMenu: (branch: string, x: number, y: number) => void;
}

class RepoTreeRenderer {
  renderEmpty(container: HTMLElement, onCloneClick: () => void): void {
    container.innerHTML = `
      <div style="padding:32px 16px;text-align:center;">
        <div style="color:var(--text-muted);font-size:13px;margin-bottom:16px;">
          No repositories cloned yet
        </div>
        <button id="wt-clone-btn" style="
          background:var(--accent);border:none;border-radius:4px;color:#fff;
          font-size:12px;padding:7px 20px;cursor:pointer;
          transition:background 0.15s;
        ">Clone Repository</button>
      </div>
    `;
    const btn = container.querySelector("#wt-clone-btn") as HTMLElement | null;
    if (btn) {
      btn.addEventListener("click", onCloneClick);
      btn.addEventListener("mouseenter", () => (btn.style.background = "#1e5bb5"));
      btn.addEventListener("mouseleave", () => (btn.style.background = "#2a6fd1"));
    }
  }

  renderCloneProgress(container: HTMLElement, percent: number, message: string): void {
    container.innerHTML = `
      <div style="padding:24px 16px;text-align:center;">
        <div style="color:var(--text-secondary);font-size:12px;margin-bottom:8px;">Cloning repository...</div>
        <div style="
          width:100%;height:6px;background:var(--bg-tertiary);border-radius:3px;
          overflow:hidden;margin-bottom:8px;
        ">
          <div style="
            width:${percent}%;height:100%;background:var(--accent);
            border-radius:3px;transition:width 0.3s ease;
          "></div>
        </div>
        <div style="color:var(--text-muted);font-size:10px;font-family:monospace;">${this._escapeHtml(message)}</div>
      </div>
    `;
  }

  renderLoading(container: HTMLElement): void {
    container.innerHTML = `
      <div style="padding:32px 16px;text-align:center;">
        <div style="color:var(--text-muted);font-size:12px;">Loading...</div>
      </div>
    `;
  }

  renderError(container: HTMLElement, message: string, onRetry: () => void): void {
    container.innerHTML = `
      <div style="padding:24px 16px;text-align:center;">
        <div style="color:#c55;font-size:12px;margin-bottom:12px;">
          ${this._escapeHtml(message)}
        </div>
        <button id="wt-retry-btn" style="
          background:var(--bg-tertiary);border:1px solid var(--border-light);border-radius:4px;color:#ccc;
          font-size:11px;padding:5px 14px;cursor:pointer;
        ">Retry</button>
      </div>
    `;
    const btn = container.querySelector("#wt-retry-btn") as HTMLElement | null;
    if (btn) {
      btn.addEventListener("click", onRetry);
    }
  }

  renderWorktreeRow(
    branch: string,
    files: FileEntry[],
    expanded: boolean,
    depth: number,
    selectedPath: string,
    callbacks: TreeRowCallbacks,
    visible?: boolean,
    onVisibilityToggle?: () => void,
  ): HTMLElement {
    const row = document.createElement("div");
    row.dataset.branch = branch;
    row.dataset.path = branch;
    row.style.cssText = `
      display:flex;flex-direction:column;
    `;

    // Worktree header
    const header = document.createElement("div");
    header.style.cssText = `
      display:flex;align-items:center;height:28px;
      padding-left:${8 + depth * 16}px;padding-right:8px;
      cursor:pointer;user-select:none;font-size:13px;
      transition:background 0.1s;
      background:rgba(42,111,209,0.08);
      border-bottom:1px solid var(--border-divider);
    `;
    if (selectedPath === branch) {
      header.style.background = "rgba(74,158,255,0.12)";
    }

    // Chevron
    const chevron = document.createElement("span");
    chevron.innerHTML = expanded ? chevronDown(10) : chevronRight(10);
    chevron.style.cssText =
      "width:16px;display:flex;align-items:center;justify-content:center;flex-shrink:0;";
    header.appendChild(chevron);

    // Branch icon (always the same, no open/closed variant)
    const icon = document.createElement("span");
    icon.innerHTML = gitBranchIcon(12);
    icon.style.cssText =
      "width:16px;height:28px;display:flex;align-items:center;justify-content:center;flex-shrink:0;";
    header.appendChild(icon);

    // Branch name
    const label = document.createElement("span");
    label.textContent = branch;
    label.style.cssText =
      "margin-left:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#ddd;flex:1;";
    header.appendChild(label);

    // Visibility toggle button (edit mode)
    if (onVisibilityToggle !== undefined && visible !== undefined) {
      const visBtn = document.createElement("span");
      visBtn.innerHTML = visible ? eyeIcon(13) : eyeOffIcon(13);
      visBtn.style.cssText = `
        width:22px;height:22px;display:flex;
        align-items:center;justify-content:center;
        cursor:pointer;border-radius:3px;
        color:${visible ? "#4a9eff" : "#555"};font-size:12px;flex-shrink:0;
        margin-left:auto;margin-right:4px;
        transition:color 0.1s,background 0.1s;
      `;
      visBtn.title = visible ? "Click to hide worktree" : "Click to show worktree";
      visBtn.addEventListener("mouseenter", () => {
        visBtn.style.background = "rgba(255,255,255,0.08)";
        visBtn.style.color = visible ? "#5aafff" : "#888";
      });
      visBtn.addEventListener("mouseleave", () => {
        visBtn.style.background = "transparent";
        visBtn.style.color = visible ? "#4a9eff" : "#555";
      });
      visBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        onVisibilityToggle();
      });
      header.appendChild(visBtn);
    }

    // Chevron click
    chevron.addEventListener("click", (e) => {
      e.stopPropagation();
      callbacks.onToggleDir(branch);
    });

    // Header click — toggle
    header.addEventListener("click", () => {
      callbacks.onToggleDir(branch);
    });

    // Context menu
    header.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      e.stopPropagation();
      callbacks.onWorktreeContextMenu(branch, e.clientX, e.clientY);
    });

    // Hover
    header.addEventListener("mouseenter", () => {
      if (!header.style.background.includes("rgba(74,158,255")) {
        header.style.background = "#252525";
      }
    });
    header.addEventListener("mouseleave", () => {
      if (selectedPath === branch) {
        header.style.background = "rgba(74,158,255,0.12)";
      } else {
        header.style.background = "rgba(42,111,209,0.08)";
      }
    });

    row.appendChild(header);

    // Files container (if expanded)
    if (expanded) {
      const filesContainer = document.createElement("div");
      filesContainer.className = "wt-files-container";
      row.appendChild(filesContainer);

      if (files.length === 0) {
        const empty = document.createElement("div");
        empty.style.cssText = `
          padding:8px 8px 8px ${8 + (depth + 1) * 16}px;
          color:#444;font-size:11px;font-style:italic;
        `;
        empty.textContent = "No files";
        filesContainer.appendChild(empty);
      } else {
        for (const file of files) {
          const fileRow = this._createFileRow(file, depth + 1, selectedPath, callbacks);
          filesContainer.appendChild(fileRow);
        }
      }
    }

    return row;
  }

  renderFileRow(
    file: FileEntry,
    depth: number,
    selectedPath: string,
    callbacks: TreeRowCallbacks,
  ): HTMLElement {
    return this._createFileRow(file, depth, selectedPath, callbacks);
  }

  private _createFileRow(
    file: FileEntry,
    depth: number,
    selectedPath: string,
    callbacks: TreeRowCallbacks,
  ): HTMLElement {
    const row = document.createElement("div");
    row.dataset.path = file.path;

    if (file.isDirectory) {
      row.dataset.type = "folder";
    } else {
      row.dataset.type = "file";
    }

    row.style.cssText = `
      display:flex;align-items:center;height:26px;
      padding-left:${8 + depth * 16}px;padding-right:8px;
      cursor:pointer;user-select:none;font-size:12px;
      transition:background 0.1s;
    `;

    if (selectedPath === file.path) {
      row.style.background = "rgba(74,158,255,0.12)";
    }

    // Icon
    if (file.isDirectory) {
      // Folder — show chevron + folder icon
      const chevron = document.createElement("span");
      chevron.innerHTML = chevronRight(10);
      chevron.style.cssText =
        "width:14px;display:flex;align-items:center;justify-content:center;flex-shrink:0;";
      row.appendChild(chevron);

      const icon = document.createElement("span");
      icon.innerHTML = folderClosedIcon(12);
      icon.style.cssText =
        "width:16px;height:26px;display:flex;align-items:center;justify-content:center;flex-shrink:0;";
      row.appendChild(icon);
    } else {
      const spacer = document.createElement("span");
      spacer.style.cssText = "width:14px;flex-shrink:0;";
      row.appendChild(spacer);

      const icon = document.createElement("span");
      icon.innerHTML = fileIcon(12);
      icon.style.cssText =
        "width:16px;height:26px;display:flex;align-items:center;justify-content:center;flex-shrink:0;";
      row.appendChild(icon);
    }

    const label = document.createElement("span");
    label.textContent = file.name;
    label.style.cssText =
      "margin-left:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#aaa;flex:1;";
    row.appendChild(label);

    // Events
    row.addEventListener("mouseenter", () => {
      if (selectedPath !== file.path) {
        row.style.background = "#252525";
      }
    });
    row.addEventListener("mouseleave", () => {
      if (selectedPath !== file.path) {
        row.style.background = "transparent";
      }
    });

    if (file.isDirectory) {
      row.addEventListener("click", () => callbacks.onToggleDir(file.path));
    } else {
      row.addEventListener("click", () => callbacks.onFileClick(file.path, file.name));
      row.addEventListener("dblclick", () => callbacks.onFileDoubleClick(file.path, file.name));
      row.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        e.stopPropagation();
        callbacks.onFileContextMenu(file.path, file.name, e.clientX, e.clientY);
      });
    }

    return row;
  }

  private _escapeHtml(str: string): string {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /** Render a repo section header with collapse/expand chevron and optional git info button. */
  renderRepoHeader(
    name: string,
    url: string,
    expanded: boolean,
    onToggle: () => void,
    onGitInfo?: () => void,
    visible?: boolean,
    onVisibilityToggle?: () => void,
  ): HTMLElement {
    const header = document.createElement("div");
    header.style.cssText = `
      display:flex;align-items:center;height:30px;
      padding-left:8px;padding-right:8px;
      cursor:pointer;user-select:none;font-size:12px;font-weight:600;
      background:var(--bg-primary);border-bottom:1px solid var(--border-divider);
      transition:background 0.1s;
    `;

    // Chevron
    const chevron = document.createElement("span");
    chevron.innerHTML = expanded ? chevronDown(10) : chevronRight(10);
    chevron.style.cssText =
      "width:16px;display:flex;align-items:center;justify-content:center;flex-shrink:0;";
    header.appendChild(chevron);

    // Label
    const label = document.createElement("span");
    label.textContent = this._formatRepoLabel(name, url);
    label.style.cssText =
      "margin-left:6px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#ccc;flex:1;";
    header.appendChild(label);

    // Visibility toggle button (edit mode)
    if (onVisibilityToggle !== undefined && visible !== undefined) {
      const visBtn = document.createElement("span");
      visBtn.innerHTML = visible ? eyeIcon(13) : eyeOffIcon(13);
      visBtn.style.cssText = `
        width:22px;height:22px;display:flex;
        align-items:center;justify-content:center;
        cursor:pointer;border-radius:3px;
        color:${visible ? "#4a9eff" : "#555"};font-size:12px;flex-shrink:0;
        margin-left:auto;margin-right:4px;
        transition:color 0.1s,background 0.1s;
      `;
      visBtn.title = visible ? "Click to hide" : "Click to show";
      visBtn.addEventListener("mouseenter", () => {
        visBtn.style.background = "rgba(255,255,255,0.08)";
        visBtn.style.color = visible ? "#5aafff" : "#888";
      });
      visBtn.addEventListener("mouseleave", () => {
        visBtn.style.background = "transparent";
        visBtn.style.color = visible ? "#4a9eff" : "#555";
      });
      visBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        onVisibilityToggle();
      });
      header.appendChild(visBtn);
    } else {
      // Git info button (only show when not in edit mode)
      if (onGitInfo) {
        const gitBtn = document.createElement("span");
        gitBtn.innerHTML = gitInfoIcon(13);
        gitBtn.style.cssText = `
          width:22px;height:22px;display:flex;
          align-items:center;justify-content:center;
          cursor:pointer;border-radius:3px;
          color:var(--text-muted);font-size:12px;flex-shrink:0;
          margin-left:auto;margin-right:2px;
          transition:color 0.1s,background 0.1s;
        `;
        gitBtn.title = "Git info";
        gitBtn.addEventListener("mouseenter", () => {
          gitBtn.style.background = "rgba(255,255,255,0.08)";
          gitBtn.style.color = "#aaa";
        });
        gitBtn.addEventListener("mouseleave", () => {
          gitBtn.style.background = "transparent";
          gitBtn.style.color = "#555";
        });
        gitBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          onGitInfo();
        });
        header.appendChild(gitBtn);
      }
    }

    // Chevron click
    chevron.addEventListener("click", (e) => {
      e.stopPropagation();
      onToggle();
    });

    // Header click
    header.addEventListener("click", () => onToggle());

    // Hover
    header.addEventListener("mouseenter", () => {
      header.style.background = "#252525";
    });
    header.addEventListener("mouseleave", () => {
      header.style.background = "#1e1e1e";
    });

    return header;
  }

  /** Format a short label from repo name and URL. */
  private _formatRepoLabel(name: string, _url: string): string {
    // Just use the name (e.g. "org/repo"); URL shown on hover or in sub-label
    return name;
  }

  /**
   * Render a full repo section: header followed by children (worktrees + add-row).
   * Children are pre-built by the caller.
   */
  renderRepoSection(
    container: HTMLElement,
    repo: { name: string; url: string },
    repoExpanded: boolean,
    children: HTMLElement[],
    onToggle: () => void,
    onAddWorktree: () => void,
    onGitInfo?: () => void,
    visible?: boolean,
    onVisibilityToggle?: () => void,
  ): HTMLElement {
    const header = this.renderRepoHeader(
      repo.name,
      repo.url,
      repoExpanded,
      onToggle,
      onGitInfo,
      visible,
      onVisibilityToggle,
    );
    container.appendChild(header);

    if (repoExpanded) {
      const childWrapper = document.createElement("div");
      childWrapper.style.cssText = "display:flex;flex-direction:column;";
      for (const child of children) {
        childWrapper.appendChild(child);
      }

      // "+ Add worktree" row (structure matches worktree rows at depth 1)
      if (repo.name) {
        const addRow = document.createElement("div");
        addRow.style.cssText = `
          display:flex;align-items:center;height:28px;
          padding-left:${8 + 1 * 16}px;padding-right:8px;
          cursor:pointer;user-select:none;font-size:12px;
          color:var(--text-muted);transition:color 0.1s,background 0.1s;
          border-bottom:1px solid var(--border-divider);
        `;

        // Chevron spacer (matches worktree rows)
        const chevronSpacer = document.createElement("span");
        chevronSpacer.style.cssText =
          "width:16px;display:flex;align-items:center;justify-content:center;flex-shrink:0;";
        addRow.appendChild(chevronSpacer);

        // Plus icon
        const icon = document.createElement("span");
        icon.innerHTML = plusIcon(12);
        icon.style.cssText =
          "width:16px;height:28px;display:flex;align-items:center;justify-content:center;flex-shrink:0;";
        addRow.appendChild(icon);

        // Label
        const label = document.createElement("span");
        label.textContent = "add worktree";
        label.style.cssText =
          "margin-left:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text-muted);flex:1;";
        addRow.appendChild(label);

        addRow.addEventListener("mouseenter", () => {
          addRow.style.background = "#1e1e1e";
          label.style.color = "#aaa";
        });
        addRow.addEventListener("mouseleave", () => {
          addRow.style.background = "transparent";
          label.style.color = "#666";
        });
        addRow.addEventListener("click", () => onAddWorktree());
        childWrapper.appendChild(addRow);
      }

      container.appendChild(childWrapper);
    }

    return header;
  }
}

/** Singleton renderer instance. */
export const repoTreeRenderer = new RepoTreeRenderer();
