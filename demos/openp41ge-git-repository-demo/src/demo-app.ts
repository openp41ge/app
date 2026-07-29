/**
 * demo-app.ts — Standalone demo application for the git repository browser.
 *
 * Manages mock git state, renders the git panel via GitBrowserRenderer,
 * provides interactive controls for loading/error/empty states,
 * and logs callbacks to a console output panel.
 */

import { gitBrowserRenderer } from "openp41ge-uikit";
import type { GitBrowserData, GitBrowserCallbacks } from "openp41ge-uikit";
import { createMockRepository, createCommitsForBranch, createMoreCommits } from "./mock-data";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ConsoleLogEntry {
  timestamp: string;
  message: string;
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let data: GitBrowserData = createMockRepository();
const logs: ConsoleLogEntry[] = [];
let logLimit = 200;

// DOM references (set during init)
let gitPanelEl: HTMLElement | null = null;
let consoleBodyEl: HTMLElement | null = null;

// ---------------------------------------------------------------------------
// Console Logging
// ---------------------------------------------------------------------------

function timeStr(): string {
  const d = new Date();
  return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}:${d.getSeconds().toString().padStart(2, "0")}`;
}

function addLog(message: string): void {
  logs.push({ timestamp: timeStr(), message });
  if (logs.length > logLimit) logs.shift();
  renderLogs();
}

function renderLogs(): void {
  if (!consoleBodyEl) return;
  consoleBodyEl.innerHTML = logs
    .map(
      (l) =>
        `<div class="log-entry"><span class="timestamp">[${l.timestamp}]</span>${escapeHtml(l.message)}</div>`,
    )
    .join("");
  consoleBodyEl.scrollTop = consoleBodyEl.scrollHeight;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ---------------------------------------------------------------------------
// Full Panel Render
// ---------------------------------------------------------------------------

function renderFullPanel(): void {
  if (!gitPanelEl) return;
  gitPanelEl.innerHTML = "";

  const callbacks = createCallbacks();
  const panel = gitBrowserRenderer.renderGitPanel(data, callbacks);
  gitPanelEl.appendChild(panel);
}

// ---------------------------------------------------------------------------
// Section Update Helper
// ---------------------------------------------------------------------------

function updateSection(key: "branches" | "commits" | "files"): void {
  if (!gitPanelEl) return;
  const panel = gitPanelEl.firstElementChild as HTMLElement | null;
  if (!panel) {
    renderFullPanel();
    return;
  }
  const callbacks = createCallbacks();
  gitBrowserRenderer.replaceSection(panel, key, data, callbacks);
}

// ---------------------------------------------------------------------------
// Callbacks
// ---------------------------------------------------------------------------

function createCallbacks(): GitBrowserCallbacks {
  return {
    onSelectBranch: (branchName: string) => {
      if (branchName === data.selectedBranch) return;
      addLog(`Selected branch: ${branchName}`);

      // Update selection
      data.selectedBranch = branchName;

      // Show loading state then update
      data.loadingCommits = true;
      updateSection("commits");
      updateSection("branches");

      // Simulate async loading
      setTimeout(() => {
        const { commits, filesChanged } = createCommitsForBranch(branchName, 8);
        data.commits = commits;
        data.filesChanged = filesChanged;
        data.visibleCommitCount = Math.min(6, commits.length);
        data.commitSkipCount = 0;
        data.hasMoreCommits = commits.length > data.visibleCommitCount;
        data.loadingCommits = false;
        data.loadingFiles = false;
        // Auto-select the first (most recent) commit
        data.selectedCommit = commits.length > 0 ? commits[0].hash : null;
        updateSection("commits");
        updateSection("files");
      }, 600);
    },

    onSelectCommit: (commitHash: string | null) => {
      // Radio-style: always select, never deselect.
      // The renderer passes null when clicking the already-selected commit (old toggle logic).
      if (!commitHash || commitHash === data.selectedCommit) return;
      data.selectedCommit = commitHash;
      addLog(`Selected commit: ${commitHash.slice(0, 7)}`);

      // Show brief loading for files
      data.loadingFiles = true;
      updateSection("commits");
      updateSection("files");

      // Simulate brief file load
      setTimeout(() => {
        data.loadingFiles = false;
        updateSection("files");
      }, 300);
    },

    onRefreshBranches: () => {
      addLog("Refreshing branches...");
      data.loadingBranches = true;
      updateSection("branches");
      setTimeout(() => {
        data = createMockRepository();
        data.loadingBranches = false;
        renderFullPanel();
        addLog("Branches refreshed");
      }, 1500);
    },

    onRefreshCommits: () => {
      const branchName = data.selectedBranch;
      addLog(`Refreshing commits for ${branchName}...`);
      data.loadingCommits = true;
      updateSection("commits");
      setTimeout(() => {
        const { commits } = createCommitsForBranch(branchName, 8);
        data.commits = commits;
        data.visibleCommitCount = Math.min(6, commits.length);
        data.commitSkipCount = 0;
        data.hasMoreCommits = commits.length > data.visibleCommitCount;
        data.loadingCommits = false;
        // Auto-select the first commit after refresh
        data.selectedCommit = commits.length > 0 ? commits[0].hash : null;
        updateSection("commits");
        addLog("Commits refreshed");
      }, 1500);
    },

    onRefreshFiles: () => {
      addLog("Refreshing files...");
      data.loadingFiles = true;
      updateSection("files");
      setTimeout(() => {
        const { filesChanged } = createCommitsForBranch(data.selectedBranch, 5);
        data.filesChanged = filesChanged;
        data.loadingFiles = false;
        updateSection("files");
        addLog("Files refreshed");
      }, 1500);
    },

    onLoadMoreCommits: () => {
      addLog("Loading more commits...");
      const _existing = data.commits.length;
      const newCommits = createMoreCommits(data.commitSkipCount);
      data.commits = [...data.commits, ...newCommits];
      data.visibleCommitCount = data.commits.length;
      data.commitSkipCount += newCommits.length;
      if (data.commitSkipCount >= 15) {
        data.hasMoreCommits = false;
      }
      updateSection("commits");
      addLog(`Loaded ${newCommits.length} more commits (total: ${data.commits.length})`);
    },

    onClose: () => {
      addLog("Close panel (would close in real app)");
    },

    onCheckoutWorktree: (branchName: string) => {
      addLog(`Checkout worktree: ${branchName}`);
    },

    onBranchContextMenu: (branchName: string, x: number, y: number) => {
      addLog(`Context menu for ${branchName} at (${x}, ${y})`);
    },

    onFileRowClick: (filePath: string) => {
      addLog(`File clicked: ${filePath}`);
    },
  };
}

// ---------------------------------------------------------------------------
// State Control Actions
// ---------------------------------------------------------------------------

function toggleLoadingBranches(): void {
  data.loadingBranches = !data.loadingBranches;
  addLog(data.loadingBranches ? "Loading branches (simulated)" : "Branches loaded");
  updateSection("branches");
}

function toggleLoadingCommits(): void {
  data.loadingCommits = !data.loadingCommits;
  addLog(data.loadingCommits ? "Loading commits (simulated)" : "Commits loaded");
  updateSection("commits");
}

function toggleLoadingFiles(): void {
  data.loadingFiles = !data.loadingFiles;
  addLog(data.loadingFiles ? "Loading files (simulated)" : "Files loaded");
  updateSection("files");
}

function showError(): void {
  if (!gitPanelEl) return;
  const panel = gitPanelEl.firstElementChild as HTMLElement | null;
  if (!panel) return;
  addLog("Showing error state");
  gitBrowserRenderer.renderError(panel, "Failed to load git data: connection timed out", () => {
    addLog("Retry clicked — restoring normal state");
    renderFullPanel();
  });
}

function clearBranches(): void {
  data.branches = [];
  addLog("Cleared all branches");
  updateSection("branches");
}

function clearCommits(): void {
  data.commits = [];
  data.selectedCommit = null;
  data.visibleCommitCount = 0;
  data.hasMoreCommits = false;
  addLog("Cleared all commits");
  updateSection("commits");
  updateSection("files");
}

function clearFiles(): void {
  data.filesChanged = [];
  addLog("Cleared all files");
  updateSection("files");
}

function resetAll(): void {
  addLog("Resetting all data to initial state");
  data = createMockRepository();
  renderFullPanel();
}

/**
 * Ensure a commit is always selected (radio invariant).
 * Call after operations that might leave selectedCommit out of range (clearing, etc.).
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function ensureCommitSelected(): void {
  if (!data.selectedCommit && data.commits.length > 0) {
    data.selectedCommit = data.commits[0].hash;
  }
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

function init(): void {
  // Get DOM refs
  gitPanelEl = document.getElementById("git-panel");
  consoleBodyEl = document.getElementById("console-body");

  if (!gitPanelEl) {
    console.error("Git panel element (#git-panel) not found");
    return;
  }

  // Initial render
  addLog("Demo initialized — rendering git panel");
  renderFullPanel();

  // Wire sidebar controls
  wireControl("btn-load-branches", toggleLoadingBranches);
  wireControl("btn-load-commits", toggleLoadingCommits);
  wireControl("btn-load-files", toggleLoadingFiles);
  wireControl("btn-show-error", showError);
  wireControl("btn-clear-branches", clearBranches);
  wireControl("btn-clear-commits", clearCommits);
  wireControl("btn-clear-files", clearFiles);
  wireControl("btn-reset", resetAll);
}

function wireControl(id: string, handler: () => void): void {
  const el = document.getElementById(id);
  if (el) {
    el.addEventListener("click", handler);
  } else {
    console.warn(`Control element #${id} not found`);
  }
}

// Boot on DOM ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}

// Export for debugging from DevTools
(window as any).__demoState = {
  get data() {
    return data;
  },
  refresh: renderFullPanel,
};
