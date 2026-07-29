/**
 * RepoTreeRenderer — pure DOM tree rendering for worktree explorer.
 *
 * Single Responsibility: turn workspace data into DOM elements using
 * Tailwind utility classes (injected globally from openp41ge-components).
 * No IPC, no state management, no event wiring beyond what's passed in.
 *
 * Colour/font tokens reference CSS custom properties set by themes.css,
 * so dark/light mode works automatically.
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
      <div class="p-8 text-center">
        <div class="text-muted text-13 mb-4">
          No repositories cloned yet
        </div>
        <button id="wt-clone-btn" class="
          bg-accent border-none rounded text-white text-sm
          py-[7px] px-5 cursor-pointer
          transition-[background] duration-150 ease-linear
        ">Clone Repository</button>
      </div>
    `;
    const btn = container.querySelector("#wt-clone-btn") as HTMLElement | null;
    if (btn) {
      btn.addEventListener("click", onCloneClick);
      btn.addEventListener("mouseenter", () => btn.classList.add("bg-hover"));
      btn.addEventListener("mouseleave", () => btn.classList.remove("bg-hover"));
    }
  }

  renderCloneProgress(container: HTMLElement, percent: number, message: string): void {
    container.innerHTML = `
      <div class="p-6 text-center">
        <div class="text-secondary text-sm mb-2">Cloning repository...</div>
        <div class="
          w-full h-[6px] bg-bg-tertiary rounded-[3px]
          overflow-hidden mb-2
        ">
          <div class="
            h-full bg-accent rounded-[3px]
            transition-[width] duration-300 ease-[ease]
          " style="width:${percent}%"></div>
        </div>
        <div class="text-muted text-2xs font-mono">${this._escapeHtml(message)}</div>
      </div>
    `;
  }

  renderLoading(container: HTMLElement): void {
    container.innerHTML = `
      <div class="p-8 text-center">
        <div class="text-muted text-sm">Loading...</div>
      </div>
    `;
  }

  renderError(container: HTMLElement, message: string, onRetry: () => void): void {
    container.innerHTML = `
      <div class="p-6 text-center">
        <div class="text-error text-sm mb-3">
          ${this._escapeHtml(message)}
        </div>
        <button id="wt-retry-btn" class="
          bg-bg-primary border border-border-light rounded
          text-primary text-xs py-[5px] px-[14px] cursor-pointer
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
    row.className = "flex flex-col";

    // Worktree header
    const header = document.createElement("div");
    header.className = `
      flex items-center h-row px-2 cursor-pointer select-none text-13
      bg-[rgba(42,111,209,0.08)] border-b border-divider
      transition-[background] duration-100
    `;
    if (selectedPath === branch) {
      header.classList.add("bg-[rgba(74,158,255,0.12)]");
    }

    // Chevron
    const chevron = document.createElement("span");
    chevron.innerHTML = expanded ? chevronDown(10) : chevronRight(10);
    chevron.className = "w-4 flex items-center justify-center shrink-0";
    header.appendChild(chevron);

    // Branch icon
    const icon = document.createElement("span");
    icon.innerHTML = gitBranchIcon(12);
    icon.className = "w-4 h-row flex items-center justify-center shrink-0";
    header.appendChild(icon);

    // Branch name
    const label = document.createElement("span");
    label.textContent = branch;
    label.className = "ml-1 overflow-hidden text-ellipsis whitespace-nowrap text-primary flex-1";
    header.appendChild(label);

    // Visibility toggle button (edit mode)
    if (onVisibilityToggle !== undefined && visible !== undefined) {
      const visBtn = this._createVisToggle(visible, () => onVisibilityToggle());
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
      if (!header.classList.contains("bg-[rgba(74,158,255,0.12)]")) {
        header.classList.add("bg-hover");
      }
    });
    header.addEventListener("mouseleave", () => {
      header.classList.remove("bg-hover");
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
        empty.className = `text-muted text-xs italic pl-[${8 + (depth + 1) * 16}px] pr-2 py-2`;
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

  private _createVisToggle(
    visible: boolean,
    onToggle: () => void,
  ): HTMLElement {
    const visBtn = document.createElement("span");
    visBtn.innerHTML = visible ? eyeIcon(13) : eyeOffIcon(13);
    visBtn.className = `
      w-[22px] h-[22px] flex items-center justify-center
      cursor-pointer rounded shrink-0 ml-auto mr-1
      text-sm transition-[color,background] duration-100
    `;
    visBtn.style.color = visible ? "#4a9eff" : "#555";
    visBtn.title = visible ? "Click to hide worktree" : "Click to show worktree";
    visBtn.addEventListener("mouseenter", () => {
      visBtn.classList.add("bg-hover");
      visBtn.style.color = visible ? "#5aafff" : "#888";
    });
    visBtn.addEventListener("mouseleave", () => {
      visBtn.classList.remove("bg-hover");
      visBtn.style.color = visible ? "#4a9eff" : "#555";
    });
    visBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      onToggle();
    });
    return visBtn;
  }

  private _createFileRow(
    file: FileEntry,
    depth: number,
    selectedPath: string,
    callbacks: TreeRowCallbacks,
  ): HTMLElement {
    const row = document.createElement("div");
    row.dataset.path = file.path;
    row.dataset.type = file.isDirectory ? "folder" : "file";

    row.className = `flex items-center h-[26px] pl-[${8 + depth * 16}px] pr-2 cursor-pointer select-none text-sm transition-[background] duration-100`;
    if (selectedPath === file.path) {
      row.classList.add("bg-[rgba(74,158,255,0.12)]");
    }

    // Icon
    if (file.isDirectory) {
      const chevron = document.createElement("span");
      chevron.innerHTML = chevronRight(10);
      chevron.className = "w-[14px] flex items-center justify-center shrink-0";
      row.appendChild(chevron);

      const icon = document.createElement("span");
      icon.innerHTML = folderClosedIcon(12);
      icon.className = "w-4 h-[26px] flex items-center justify-center shrink-0";
      row.appendChild(icon);
    } else {
      const spacer = document.createElement("span");
      spacer.className = "w-[14px] shrink-0";
      row.appendChild(spacer);

      const icon = document.createElement("span");
      icon.innerHTML = fileIcon(12);
      icon.className = "w-4 h-[26px] flex items-center justify-center shrink-0";
      row.appendChild(icon);
    }

    const label = document.createElement("span");
    label.textContent = file.name;
    label.className =
      "ml-1 overflow-hidden text-ellipsis whitespace-nowrap text-secondary flex-1";
    row.appendChild(label);

    // Events
    row.addEventListener("mouseenter", () => {
      if (selectedPath !== file.path) {
        row.classList.add("bg-hover");
      }
    });
    row.addEventListener("mouseleave", () => {
      if (selectedPath !== file.path) {
        row.classList.remove("bg-hover");
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
    header.className = `
      flex items-center h-[30px] px-2 cursor-pointer select-none
      text-sm font-semibold bg-bg-primary border-b border-divider
      transition-[background] duration-100
    `;

    // Chevron
    const chevron = document.createElement("span");
    chevron.innerHTML = expanded ? chevronDown(10) : chevronRight(10);
    chevron.className = "w-4 flex items-center justify-center shrink-0";
    header.appendChild(chevron);

    // Label
    const label = document.createElement("span");
    label.textContent = this._formatRepoLabel(name, url);
    label.className = "ml-1.5 overflow-hidden text-ellipsis whitespace-nowrap text-primary flex-1";
    header.appendChild(label);

    // Visibility toggle button (edit mode)
    if (onVisibilityToggle !== undefined && visible !== undefined) {
      const visBtn = this._createVisToggle(visible, () => onVisibilityToggle());
      header.appendChild(visBtn);
    } else {
      // Git info button (only show when not in edit mode)
      if (onGitInfo) {
        const gitBtn = document.createElement("span");
        gitBtn.innerHTML = gitInfoIcon(13);
        gitBtn.className = `
          w-[22px] h-[22px] flex items-center justify-center
          cursor-pointer rounded shrink-0 ml-auto mr-0.5
          text-sm transition-[color,background] duration-100
        `;
        gitBtn.style.color = "#555";
        gitBtn.title = "Git info";
        gitBtn.addEventListener("mouseenter", () => {
          gitBtn.classList.add("bg-hover");
          gitBtn.style.color = "#aaa";
        });
        gitBtn.addEventListener("mouseleave", () => {
          gitBtn.classList.remove("bg-hover");
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
      header.classList.add("bg-hover");
    });
    header.addEventListener("mouseleave", () => {
      header.classList.remove("bg-hover");
    });

    return header;
  }

  /** Format a short label from repo name and URL. */
  private _formatRepoLabel(name: string, _url: string): string {
    return name;
  }

  /**
   * Render a full repo section: header followed by children (worktrees + add-row).
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
      childWrapper.className = "flex flex-col";
      for (const child of children) {
        childWrapper.appendChild(child);
      }

      // "+ Add worktree" row
      if (repo.name) {
        const addRow = document.createElement("div");
        addRow.className = `
          flex items-center h-row pl-[24px] pr-2 cursor-pointer select-none
          text-sm text-muted border-b border-divider
          transition-[color,background] duration-100
        `;

        // Chevron spacer (matches worktree rows)
        const chevronSpacer = document.createElement("span");
        chevronSpacer.className = "w-4 flex items-center justify-center shrink-0";
        addRow.appendChild(chevronSpacer);

        // Plus icon
        const icon = document.createElement("span");
        icon.innerHTML = plusIcon(12);
        icon.className = "w-4 h-row flex items-center justify-center shrink-0";
        addRow.appendChild(icon);

        // Label
        const label = document.createElement("span");
        label.textContent = "add worktree";
        label.className = "ml-1 overflow-hidden text-ellipsis whitespace-nowrap text-muted flex-1";
        addRow.appendChild(label);

        addRow.addEventListener("mouseenter", () => {
          addRow.classList.add("bg-hover");
          label.style.color = "#aaa";
        });
        addRow.addEventListener("mouseleave", () => {
          addRow.classList.remove("bg-hover");
          label.style.color = "";
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
