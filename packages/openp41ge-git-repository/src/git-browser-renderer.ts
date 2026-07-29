/**
 * GitBrowserRenderer — pure DOM rendering for the git info panel.
 *
 * Single Responsibility: turn git data (branches, commits, files) into DOM elements.
 * No IPC, no state management, no event wiring beyond what's passed in callbacks.
 */

import type {
  GitBrowserData,
  GitBrowserCallbacks,
  BranchEntry,
  CommitEntry,
  DiffStatEntry,
} from "./types";

export {
  type GitBrowserData,
  type GitBrowserCallbacks,
  type BranchEntry,
  type CommitEntry,
  type DiffStatEntry,
};

type SectionKey = "branches" | "commits" | "files";

/**
 * Inline SVG for a chevron-right icon.
 */
function chevronRight(size = 10): string {
  const s = Math.round(size);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6,4 10,8 6,12"/></svg>`;
}

/**
 * Inline SVG for a chevron-down icon.
 */
function chevronDown(size = 10): string {
  const s = Math.round(size);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4,6 8,10 12,6"/></svg>`;
}

/** Inline SVG for file added — green circle with plus */
function fileAddedSvg(size = 10): string {
  const s = Math.round(size);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 16 16" fill="none" stroke="#4caf50" stroke-width="1.5" stroke-linecap="round"><circle cx="8" cy="8" r="6"/><line x1="8" y1="5" x2="8" y2="11"/><line x1="5" y1="8" x2="11" y2="8"/></svg>`;
}

/** Inline SVG for file deleted — red circle with minus */
function fileDeletedSvg(size = 10): string {
  const s = Math.round(size);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 16 16" fill="none" stroke="#f44" stroke-width="1.5" stroke-linecap="round"><circle cx="8" cy="8" r="6"/><line x1="5" y1="8" x2="11" y2="8"/></svg>`;
}

/** Inline SVG for file renamed — blue arrow */
function fileRenamedSvg(size = 10): string {
  const s = Math.round(size);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 16 16" fill="none" stroke="#4a9eff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="6"/><path d="M7 5.5L10.5 8L7 10.5"/></svg>`;
}

/** Inline SVG for file modified — amber tilde */
function fileModifiedSvg(size = 10): string {
  const s = Math.round(size);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 16 16" fill="none" stroke="#ffa726" stroke-width="1.5" stroke-linecap="round"><circle cx="8" cy="8" r="6"/><path d="M5.5 9.5C6.5 7.5 9.5 7.5 10.5 9.5"/></svg>`;
}

class GitBrowserRenderer {
  renderGitPanel(data: GitBrowserData, callbacks: GitBrowserCallbacks): HTMLElement {
    const panel = document.createElement("div");
    panel.style.cssText = `
      display:flex;flex-direction:column;height:100%;
      background:#121212;overflow:hidden;
      font-size:12px;
    `;

    // No header — tab handle provides the title and close button

    // Body — each accordion section scrolls independently
    const body = document.createElement("div");
    body.style.cssText =
      "flex:1;overflow:hidden;padding:0 0 4px 0;display:flex;flex-direction:column;";

    // Build all three sections
    const branchesSection = this._renderSection(
      "branches",
      "Branches (" + (data.loadingBranches ? "..." : data.branches.length) + ")",
      data.loadingBranches,
      () => this._renderBranchesContent(data, callbacks),
    );
    this._addRefreshButton(branchesSection, "Refresh branches", callbacks.onRefreshBranches);
    body.appendChild(branchesSection);

    const commitsLabel = data.selectedBranch
      ? "Commits \u2014 " +
        data.selectedBranch +
        " (" +
        (data.loadingCommits ? "..." : data.visibleCommitCount) +
        ")"
      : "Commits";
    const commitsSection = this._renderSection(
      "commits",
      commitsLabel,
      data.loadingCommits || data.loadingBranches,
      () => this._renderCommitsContent(data, callbacks),
    );
    this._addRefreshButton(commitsSection, "Refresh commits", callbacks.onRefreshCommits);
    body.appendChild(commitsSection);

    const filesLabel = data.selectedCommit
      ? "Files changed (" + (data.loadingFiles ? "..." : data.filesChanged.length) + ")"
      : "Files changed (" + (data.loadingFiles ? "..." : data.filesChanged.length) + ")";
    const filesSection = this._renderSection(
      "files",
      filesLabel,
      data.loadingFiles || data.loadingBranches,
      () => this._renderFilesContent(data, callbacks),
    );
    this._addRefreshButton(filesSection, "Refresh files", callbacks.onRefreshFiles);
    body.appendChild(filesSection);

    panel.appendChild(body);
    return panel;
  }

  private _sectionStates = new Map<SectionKey, boolean>();

  private _renderSection(
    key: SectionKey,
    title: string,
    loading: boolean,
    renderContent: () => HTMLElement,
  ): HTMLElement {
    const container = document.createElement("div");
    container.style.cssText =
      "display:flex;flex-direction:column;overflow:hidden;min-height:0;transition:flex 0.2s ease,flex-grow 0.2s ease;";

    const expanded = this._sectionStates.get(key) !== false; // default expanded
    container.style.flex = expanded ? "1" : "0 1 auto";

    const header = document.createElement("div");
    header.className = "git-section-header";
    header.style.cssText = `
      display:flex;align-items:center;height:26px;
      padding:0 8px;cursor:pointer;user-select:none;
      background:#222;transition:background 0.1s;
    `;
    header.addEventListener("mouseenter", () => {
      header.style.background = "#2a2a2a";
    });
    header.addEventListener("mouseleave", () => {
      header.style.background = "#222";
    });

    // Chevron
    const chevron = document.createElement("span");
    chevron.innerHTML = expanded ? chevronDown(10) : chevronRight(10);
    chevron.style.cssText =
      "width:14px;display:flex;align-items:center;justify-content:center;flex-shrink:0;color:#888;";
    header.appendChild(chevron);

    const label = document.createElement("span");
    label.textContent = title;
    label.style.cssText = "margin-left:4px;color:#aaa;font-size:11px;font-weight:600;flex:1;";
    header.appendChild(label);

    if (loading) {
      const spinner = document.createElement("span");
      spinner.className = "git-section-spinner";
      spinner.style.cssText = `
        width:12px;height:12px;flex-shrink:0;
        border:1.5px solid #444;border-top-color:#4a9eff;
        border-radius:50%;animation:wt-spin 0.8s linear infinite;
      `;
      header.appendChild(spinner);
    }

    header.addEventListener("click", () => {
      const isExpanded = this._sectionStates.get(key) !== false;
      this._sectionStates.set(key, !isExpanded);
      const bodyEl = container.querySelector(".git-section-body") as HTMLElement;
      if (bodyEl) {
        bodyEl.style.display = isExpanded ? "none" : "";
      }
      container.style.flex = isExpanded ? "0 1 auto" : "1";
      chevron.innerHTML = isExpanded ? chevronRight(10) : chevronDown(10);
    });

    container.appendChild(header);

    const body = document.createElement("div");
    body.className = "git-section-body";
    body.style.cssText =
      "display:" +
      (expanded ? "" : "none") +
      ";flex-direction:column;overflow-y:auto;flex:1;min-height:0;";
    body.appendChild(renderContent());
    container.appendChild(body);

    container.dataset.section = key;

    return container;
  }

  private _renderBranchesContent(
    data: GitBrowserData,
    callbacks: GitBrowserCallbacks,
  ): HTMLElement {
    const wrapper = document.createElement("div");
    wrapper.style.cssText = "display:flex;flex-direction:column;";

    if (data.loadingBranches) {
      wrapper.textContent = "Loading branches...";
      (wrapper.style as CSSStyleDeclaration).padding = "8px";
      wrapper.style.color = "#555";
      wrapper.style.fontStyle = "italic";
      wrapper.style.fontSize = "11px";
      return wrapper;
    }

    if (data.branches.length === 0) {
      wrapper.textContent = "No branches";
      (wrapper.style as CSSStyleDeclaration).padding = "8px";
      wrapper.style.color = "#555";
      wrapper.style.fontStyle = "italic";
      wrapper.style.fontSize = "11px";
      return wrapper;
    }

    // Group branches by shortName (e.g., "master" groups local master + origin/master)
    const groups = new Map<string, BranchEntry[]>();
    for (const branch of data.branches) {
      const key = branch.shortName;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(branch);
    }

    // Sort: groups with a local branch first, then alphabetically
    const sortedGroups = Array.from(groups.entries()).sort((a, b) => {
      const aHasLocal = a[1].some((v) => v.isLocal);
      const bHasLocal = b[1].some((v) => v.isLocal);
      if (aHasLocal && !bHasLocal) return -1;
      if (!aHasLocal && bHasLocal) return 1;
      return a[0].localeCompare(b[0]);
    });

    for (const [branchName, variants] of sortedGroups) {
      const hasLocal = variants.some((v) => v.isLocal);
      const localVariant = variants.find((v) => v.isLocal);

      // Sort sub-items: local first (if any), then alphabetical by full name
      const sortedVariants = [...variants].sort((a, b) => {
        if (a.isLocal && !b.isLocal) return -1;
        if (!a.isLocal && b.isLocal) return 1;
        return a.name.localeCompare(b.name);
      });

      if (hasLocal && localVariant) {
        // ── Branch name row IS the local entry ────────────────
        const isSelected = localVariant.name === data.selectedBranch;
        const row = document.createElement("div");
        row.style.cssText = `
          display:flex;align-items:center;
          padding:4px 8px 2px 9px;cursor:pointer;user-select:none;
          font-size:12px;font-family:monospace;font-weight:600;
          color:${isSelected ? "#4a9eff" : "#ccc"};
          background:${isSelected ? "rgba(74,158,255,0.08)" : "transparent"};
          transition:background 0.1s;
        `;

        row.addEventListener("mouseenter", () => {
          if (!isSelected) row.style.background = "rgba(255,255,255,0.04)";
        });
        row.addEventListener("mouseleave", () => {
          if (!isSelected) row.style.background = "transparent";
        });

        // Branch name (no dot — it's implicit that the branch name is the local entry)
        const nameEl = document.createElement("span");
        nameEl.textContent = branchName;
        nameEl.style.cssText = "margin-left:4px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
        row.appendChild(nameEl);

        // Ahead/behind badges
        if (localVariant.ahead > 0 || localVariant.behind > 0) {
          const badges = document.createElement("span");
          badges.style.cssText =
            "display:flex;align-items:center;gap:3px;font-size:10px;flex-shrink:0;margin-left:6px;";

          if (localVariant.ahead > 0) {
            const aheadEl = document.createElement("span");
            aheadEl.textContent = "\u2191" + localVariant.ahead;
            aheadEl.style.cssText = "color:#4caf50;";
            badges.appendChild(aheadEl);
          }
          if (localVariant.behind > 0) {
            const behindEl = document.createElement("span");
            behindEl.textContent = "\u2193" + localVariant.behind;
            behindEl.style.cssText = "color:#f44;";
            badges.appendChild(behindEl);
          }

          row.appendChild(badges);
        }

        row.addEventListener("click", () => callbacks.onSelectBranch(localVariant.name));
        row.addEventListener("contextmenu", (e) => {
          e.preventDefault();
          e.stopPropagation();
          callbacks.onBranchContextMenu(localVariant.name, e.clientX, e.clientY);
        });

        wrapper.appendChild(row);

        // ── Remote sub-items ──────────────────────────────────
        for (const variant of sortedVariants) {
          if (variant.isLocal) continue;
          this._appendRemoteSubItem(wrapper, variant, data, callbacks);
        }
      } else {
        // ── No local checkout — header with [remote] badge ────
        const headerRow = document.createElement("div");
        headerRow.style.cssText = `
          display:flex;align-items:center;
          padding:6px 8px 2px 9px;
          font-size:12px;font-family:monospace;font-weight:600;
          color:#ccc;
        `;

        const nameEl = document.createElement("span");
        nameEl.textContent = branchName;
        nameEl.style.cssText = "flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
        headerRow.appendChild(nameEl);

        const remoteBadge = document.createElement("span");
        remoteBadge.textContent = "[remote]";
        remoteBadge.style.cssText =
          "color:#888;font-size:10px;font-style:italic;flex-shrink:0;margin-left:auto;";
        headerRow.appendChild(remoteBadge);

        wrapper.appendChild(headerRow);

        // ── Remote sub-items ──────────────────────────────────
        for (const variant of sortedVariants) {
          this._appendRemoteSubItem(wrapper, variant, data, callbacks);
        }
      }
    }

    return wrapper;
  }

  private _appendRemoteSubItem(
    container: HTMLElement,
    variant: BranchEntry,
    data: GitBrowserData,
    callbacks: GitBrowserCallbacks,
  ): void {
    const isSelected = variant.name === data.selectedBranch;
    const source = variant.name.split("/")[0];

    const subRow = document.createElement("div");
    subRow.style.cssText = `
      display:flex;align-items:center;
      padding:2px 8px 2px 24px;cursor:pointer;user-select:none;
      font-size:11px;font-family:monospace;
      color:${isSelected ? "#4a9eff" : "#aaa"};
      background:${isSelected ? "rgba(74,158,255,0.08)" : "transparent"};
      transition:background 0.1s;
    `;

    subRow.addEventListener("mouseenter", () => {
      if (!isSelected) subRow.style.background = "rgba(255,255,255,0.04)";
    });
    subRow.addEventListener("mouseleave", () => {
      if (!isSelected) subRow.style.background = "transparent";
    });

    // Dot
    const dot = document.createElement("span");
    dot.textContent = "\u25CB";
    dot.style.color = "#555";
    dot.style.cssText = "width:12px;text-align:center;flex-shrink:0;font-size:8px;";
    subRow.appendChild(dot);

    // Remote source name
    const sourceEl = document.createElement("span");
    sourceEl.textContent = source;
    sourceEl.style.cssText = "margin-left:4px;color:#888;flex-shrink:0;";
    subRow.appendChild(sourceEl);

    // Ahead/behind badges
    if (variant.ahead > 0 || variant.behind > 0) {
      const badges = document.createElement("span");
      badges.style.cssText =
        "display:flex;align-items:center;gap:3px;font-size:10px;flex-shrink:0;margin-left:6px;";

      if (variant.ahead > 0) {
        const aheadEl = document.createElement("span");
        aheadEl.textContent = "\u2191" + variant.ahead;
        aheadEl.style.cssText = "color:#4caf50;";
        badges.appendChild(aheadEl);
      }
      if (variant.behind > 0) {
        const behindEl = document.createElement("span");
        behindEl.textContent = "\u2193" + variant.behind;
        behindEl.style.cssText = "color:#f44;";
        badges.appendChild(behindEl);
      }

      subRow.appendChild(badges);
    }

    subRow.addEventListener("click", () => callbacks.onSelectBranch(variant.name));
    subRow.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      e.stopPropagation();
      callbacks.onBranchContextMenu(variant.name, e.clientX, e.clientY);
    });

    container.appendChild(subRow);
  }

  private _renderCommitsContent(data: GitBrowserData, callbacks: GitBrowserCallbacks): HTMLElement {
    const wrapper = document.createElement("div");
    wrapper.style.cssText = "display:flex;flex-direction:column;";

    if (data.loadingCommits || data.loadingBranches) {
      wrapper.textContent = "Loading commits...";
      (wrapper.style as CSSStyleDeclaration).padding = "8px";
      wrapper.style.color = "#555";
      wrapper.style.fontStyle = "italic";
      wrapper.style.fontSize = "11px";
      return wrapper;
    }

    if (data.commits.length === 0) {
      wrapper.textContent = "No commits yet";
      (wrapper.style as CSSStyleDeclaration).padding = "8px";
      wrapper.style.color = "#555";
      wrapper.style.fontStyle = "italic";
      wrapper.style.fontSize = "11px";
      return wrapper;
    }

    const visible = data.commits.slice(0, data.visibleCommitCount);
    for (const commit of visible) {
      const isSelected = commit.hash === data.selectedCommit;
      const row = this.renderCommitRow(commit, isSelected);
      row.addEventListener("click", () => {
        callbacks.onSelectCommit(commit.hash === data.selectedCommit ? null : commit.hash);
      });
      wrapper.appendChild(row);
    }

    // Show more button
    if (data.commits.length > data.visibleCommitCount || data.hasMoreCommits) {
      const btn = document.createElement("div");
      btn.textContent = "Show more";
      btn.style.cssText = `
        padding:6px 8px;color:#4a9eff;font-size:11px;
        cursor:pointer;transition:background 0.1s;
      `;
      btn.addEventListener("mouseenter", () => {
        btn.style.background = "rgba(255,255,255,0.04)";
      });
      btn.addEventListener("mouseleave", () => {
        btn.style.background = "transparent";
      });
      btn.addEventListener("click", () => callbacks.onLoadMoreCommits());
      wrapper.appendChild(btn);
    }

    return wrapper;
  }

  private _renderFilesContent(data: GitBrowserData, callbacks: GitBrowserCallbacks): HTMLElement {
    const wrapper = document.createElement("div");
    wrapper.style.cssText = "display:flex;flex-direction:column;";

    if (data.loadingFiles || data.loadingBranches) {
      wrapper.textContent = "Loading files...";
      (wrapper.style as CSSStyleDeclaration).padding = "8px";
      wrapper.style.color = "#555";
      wrapper.style.fontStyle = "italic";
      wrapper.style.fontSize = "11px";
      return wrapper;
    }

    if (data.filesChanged.length === 0) {
      wrapper.textContent = "No changed files";
      (wrapper.style as CSSStyleDeclaration).padding = "8px";
      wrapper.style.color = "#555";
      wrapper.style.fontStyle = "italic";
      wrapper.style.fontSize = "11px";
      return wrapper;
    }

    for (const file of data.filesChanged) {
      const row = this.renderFileRow(file);
      row.addEventListener("click", () => callbacks.onFileRowClick(file.filePath));
      wrapper.appendChild(row);
    }

    return wrapper;
  }

  renderBranchRow(branch: BranchEntry, isSelected: boolean): HTMLElement {
    if (isSelected) {
      return this._renderSelectedBranchRow(branch);
    }
    return this._renderUnselectedBranchRow(branch);
  }

  private _renderUnselectedBranchRow(branch: BranchEntry): HTMLElement {
    const PAD = 6;
    const row = document.createElement("div");
    row.style.cssText = `
      display:flex;align-items:center;
      padding:${PAD}px 8px ${PAD}px 9px;cursor:pointer;user-select:none;
      font-size:12px;font-family:monospace;color:#ccc;
      transition:background 0.1s;
    `;

    this._addBranchDot(row, branch, false);
    this._addBranchName(row, branch);
    this._addBranchBadges(row, branch);

    row.addEventListener("mouseenter", () => {
      row.style.background = "rgba(255,255,255,0.04)";
    });
    row.addEventListener("mouseleave", () => {
      row.style.background = "transparent";
    });

    return row;
  }

  private _renderSelectedBranchRow(branch: BranchEntry): HTMLElement {
    const PAD = 6;
    const row = document.createElement("div");
    row.style.cssText = `
      display:flex;flex-direction:column;
      padding:${PAD}px 8px ${PAD}px 9px;cursor:pointer;user-select:none;
      font-size:12px;font-family:monospace;
      background:rgba(74,158,255,0.08);color:#4a9eff;
      transition:background 0.1s;
    `;

    // Top line: bullet + name + badges
    const topLine = document.createElement("div");
    topLine.style.cssText = "display:flex;align-items:center;height:18px;";

    this._addBranchDot(topLine, branch, true);
    this._addBranchName(topLine, branch);
    this._addBranchBadges(topLine, branch);

    row.appendChild(topLine);

    // Commit history line(s) below
    const commits = branch.lastCommit ? [branch.lastCommit] : [];
    if (commits.length > 0) {
      const commitList = document.createElement("div");
      commitList.style.cssText =
        "display:flex;flex-direction:column;margin-top:2px;margin-left:16px;gap:1px;";

      for (const commit of commits) {
        const commitLine = document.createElement("div");
        commitLine.style.cssText = `
          display:flex;align-items:center;height:16px;
          font-size:10px;color:#777;font-family:monospace;
          overflow:hidden;
        `;

        const hash = document.createElement("span");
        hash.textContent = commit.shortHash;
        hash.style.cssText = "color:#666;flex-shrink:0;margin-right:4px;";
        commitLine.appendChild(hash);

        const msg = document.createElement("span");
        msg.textContent = commit.message;
        msg.style.cssText =
          "color:#888;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;";
        commitLine.appendChild(msg);

        commitList.appendChild(commitLine);
      }

      row.appendChild(commitList);
    }

    return row;
  }

  private _addBranchDot(container: HTMLElement, branch: BranchEntry, isSelected: boolean): void {
    const dot = document.createElement("span");
    if (isSelected) {
      dot.textContent = "\u25CF";
      dot.style.color = "#4a9eff";
    } else if (branch.isCurrent) {
      dot.textContent = "\u25CF";
      dot.style.color = "#4a9eff";
    } else if (!branch.isLocal) {
      dot.textContent = "\u2197";
      dot.style.color = "#555";
    } else {
      dot.textContent = "\u25CB";
      dot.style.color = "#666";
    }
    dot.style.cssText = "width:12px;text-align:center;flex-shrink:0;font-size:8px;";
    container.appendChild(dot);
  }

  private _addBranchName(container: HTMLElement, branch: BranchEntry): void {
    const name = document.createElement("span");
    name.textContent = branch.shortName;
    name.style.cssText =
      "margin-left:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;";
    container.appendChild(name);
  }

  private _addBranchBadges(container: HTMLElement, branch: BranchEntry): void {
    const badges = document.createElement("span");
    badges.style.cssText =
      "display:flex;align-items:center;gap:3px;font-size:10px;flex-shrink:0;";

    if (!branch.isLocal) {
      const remote = document.createElement("span");
      remote.textContent = "remote";
      remote.style.cssText = "color:#888;font-size:9px;font-style:italic;padding:0 2px;";
      badges.appendChild(remote);
    }

    if (branch.ahead > 0) {
      const ahead = document.createElement("span");
      ahead.textContent = "\u2191" + branch.ahead;
      ahead.style.cssText = "color:#4caf50;";
      badges.appendChild(ahead);
    }
    if (branch.behind > 0) {
      const behind = document.createElement("span");
      behind.textContent = "\u2193" + branch.behind;
      behind.style.cssText = "color:#f44;";
      badges.appendChild(behind);
    }

    if (badges.children.length > 0) {
      container.appendChild(badges);
    }
  }

  renderCommitRow(commit: CommitEntry, isSelected: boolean): HTMLElement {
    const row = document.createElement("div");
    row.style.cssText = `
      display:flex;flex-direction:column;
      padding:4px 8px 4px 9px;cursor:pointer;user-select:none;
      font-size:11px;
      background:${isSelected ? "rgba(74,158,255,0.06)" : "transparent"};
      transition:background 0.1s;
    `;

    // First line: hash
    const hashLine = document.createElement("div");
    hashLine.textContent = commit.shortHash;
    hashLine.style.cssText =
      "color:#ccc;font-family:monospace;font-size:13px;line-height:1.6;font-weight:500;";
    row.appendChild(hashLine);

    // Second line: commit message
    const msgLine = document.createElement("div");
    msgLine.textContent = commit.message;
    msgLine.style.cssText =
      "color:#ccc;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;line-height:1.4;";
    row.appendChild(msgLine);

    // Third line: author + date
    const metaLine = document.createElement("div");
    metaLine.style.cssText = "display:flex;align-items:center;margin-top:1px;";

    const author = document.createElement("span");
    author.textContent = commit.authorName;
    author.style.cssText = "color:#666;font-size:10px;";
    metaLine.appendChild(author);

    const date = document.createElement("span");
    date.textContent = " \u00B7 " + commit.relativeDate;
    date.style.cssText = "color:#555;font-size:10px;margin-left:4px;";
    metaLine.appendChild(date);

    row.appendChild(metaLine);

    row.addEventListener("mouseenter", () => {
      if (!isSelected) row.style.background = "rgba(255,255,255,0.03)";
    });
    row.addEventListener("mouseleave", () => {
      if (!isSelected) row.style.background = "transparent";
    });

    return row;
  }

  renderFileRow(file: DiffStatEntry): HTMLElement {
    const row = document.createElement("div");
    row.style.cssText = `
      display:flex;align-items:center;height:26px;
      padding:0 8px 0 9px;cursor:pointer;user-select:none;
      font-size:11px;font-family:monospace;color:#aaa;
      transition:background 0.1s;
    `;

    // Status indicator (SVG icon)
    const statusIcon = document.createElement("span");
    statusIcon.style.cssText =
      "width:14px;display:flex;align-items:center;justify-content:center;flex-shrink:0;";
    switch (file.status) {
      case "added":
        statusIcon.innerHTML = fileAddedSvg(12);
        break;
      case "deleted":
        statusIcon.innerHTML = fileDeletedSvg(12);
        break;
      case "renamed":
        statusIcon.innerHTML = fileRenamedSvg(12);
        break;
      default:
        statusIcon.innerHTML = fileModifiedSvg(12);
    }
    row.appendChild(statusIcon);

    // Filename
    const name = document.createElement("span");
    name.textContent = file.filePath;
    name.style.cssText =
      "margin-left:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;";
    row.appendChild(name);

    // Counts
    const counts = document.createElement("span");
    counts.style.cssText =
      "display:flex;align-items:center;gap:2px;font-size:10px;flex-shrink:0;margin-left:8px;";

    if (file.added > 0) {
      const added = document.createElement("span");
      added.textContent = "+" + file.added;
      added.style.cssText = "color:#4caf50;";
      counts.appendChild(added);
    }

    if (file.deleted > 0) {
      const deleted = document.createElement("span");
      deleted.textContent = "-" + file.deleted;
      deleted.style.cssText = "color:#f44;";
      counts.appendChild(deleted);
    }

    row.appendChild(counts);

    row.addEventListener("mouseenter", () => {
      row.style.background = "rgba(255,255,255,0.04)";
    });
    row.addEventListener("mouseleave", () => {
      row.style.background = "transparent";
    });

    return row;
  }

  renderLoading(container: HTMLElement): void {
    container.innerHTML = `
      <div style="padding:24px;text-align:center;color:#555;font-size:12px;">
        <div class="wt-spinner" style="
          width:16px;height:16px;margin:0 auto 8px;
          border:2px solid #444;border-top-color:#4a9eff;
          border-radius:50%;animation:wt-spin 0.8s linear infinite;
        "></div>
        Loading git data...
      </div>
    `;
  }

  renderError(container: HTMLElement, message: string, onRetry: () => void): void {
    container.innerHTML = `
      <div style="padding:16px;text-align:center;">
        <div style="color:#c55;font-size:11px;margin-bottom:8px;">
          ${this._escapeHtml(message)}
        </div>
        <button style="
          background:#2a2a2a;border:1px solid #444;border-radius:4px;
          color:#ccc;font-size:11px;padding:4px 12px;cursor:pointer;
        ">Retry</button>
      </div>
    `;
    const btn = container.querySelector("button") as HTMLElement | null;
    if (btn) btn.addEventListener("click", onRetry);
  }

  private _escapeHtml(str: string): string {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  private _addRefreshButton(section: HTMLElement, title: string, callback: () => void): void {
    const header = section.querySelector(".git-section-header") as HTMLElement;
    if (!header) return;
    const btn = document.createElement("span");
    btn.textContent = "\u21bb";
    btn.style.cssText = `
      width:20px;height:20px;display:flex;
      align-items:center;justify-content:center;
      cursor:pointer;border-radius:3px;
      color:#666;font-size:13px;flex-shrink:0;margin-left:auto;margin-right:4px;
      transition:color 0.1s,background 0.1s;
    `;
    btn.title = title;
    btn.style.color = "#666";
    btn.style.background = "transparent";
    btn.addEventListener("mouseenter", () => {
      btn.style.color = "#aaa";
      btn.style.background = "rgba(255,255,255,0.06)";
    });
    btn.addEventListener("mouseleave", () => {
      btn.style.color = "#666";
      btn.style.background = "transparent";
    });
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      callback();
    });
    header.appendChild(btn);
  }

  /**
   * Replace a single section in the panel by data-section key.
   * Returns the new section element (or null if not found).
   */
  replaceSection(
    panel: HTMLElement,
    key: SectionKey,
    data: GitBrowserData,
    callbacks: GitBrowserCallbacks,
  ): HTMLElement | null {
    const oldSection = panel.querySelector(`[data-section="${key}"]`) as HTMLElement | null;
    if (!oldSection) return null;

    let label: string;
    let loading: boolean;
    let contentFn: () => HTMLElement;
    let refreshCb: () => void;

    switch (key) {
      case "branches":
        label = "Branches (" + (data.loadingBranches ? "..." : data.branches.length) + ")";
        loading = data.loadingBranches;
        contentFn = () => this._renderBranchesContent(data, callbacks);
        refreshCb = callbacks.onRefreshBranches;
        break;
      case "commits":
        label = data.selectedBranch
          ? "Commits \u2014 " +
            data.selectedBranch +
            " (" +
            (data.loadingCommits ? "..." : data.commits.length) +
            ")"
          : "Commits";
        loading = data.loadingCommits || data.loadingBranches;
        contentFn = () => this._renderCommitsContent(data, callbacks);
        refreshCb = callbacks.onRefreshCommits;
        break;
      case "files":
        label = "Files changed (" + (data.loadingFiles ? "..." : data.filesChanged.length) + ")";
        loading = data.loadingFiles || data.loadingBranches;
        contentFn = () => this._renderFilesContent(data, callbacks);
        refreshCb = callbacks.onRefreshFiles;
        break;
    }

    const newSection = this._renderSection(key, label, loading, contentFn);
    this._addRefreshButton(newSection, "Refresh " + key, refreshCb);
    oldSection.replaceWith(newSection);
    return newSection;
  }
}

/** Singleton renderer instance. */
export const gitBrowserRenderer = new GitBrowserRenderer();
