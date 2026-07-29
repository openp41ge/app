/**
 * Mock git data generator for the git repository demo.
 *
 * Produces realistic BranchEntry, CommitEntry, and DiffStatEntry arrays
 * covering all states (many branches, long messages, empty commits, etc.)
 */

import type {
  BranchEntry,
  CommitEntry,
  DiffStatEntry,
  GitBrowserData,
} from "openp41ge-uikit";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let _hashCounter = 0xabcdef;

function nextHash(): string {
  _hashCounter += 0x1111;
  return _hashCounter.toString(16).padStart(7, "0").slice(0, 7);
}

function randomDate(daysAgo: number): { date: string; relativeDate: string } {
  const d = new Date();
  d.setDate(d.getDate() - Math.floor(Math.random() * daysAgo));
  return {
    date: d.toISOString(),
    relativeDate: humanRelativeDate(d),
  };
}

function humanRelativeDate(d: Date): string {
  const now = Date.now();
  const diffMs = now - d.getTime();
  const diffMins = Math.round(diffMs / 60000);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `${diffDays}d ago`;
  const diffMonths = Math.floor(diffDays / 30);
  return `${diffMonths}mo ago`;
}

function makeCommit(message: string, authorName: string, daysAgo: number): CommitEntry {
  const h = nextHash();
  const rd = randomDate(daysAgo);
  return {
    hash: h + "deadbeefcafe".slice(h.length),
    shortHash: h,
    authorName,
    authorEmail: `${authorName.toLowerCase().replace(/\s+/g, ".")}@example.com`,
    date: rd.date,
    relativeDate: rd.relativeDate,
    message,
    fullMessage: message,
    refs: [],
    parents: [],
  };
}

// ---------------------------------------------------------------------------
// Authors
// ---------------------------------------------------------------------------

const AUTHORS = ["Alice Johnson", "Bob Chen", "Carol Martinez", "Dave Wilson", "Eve Kim"];

// ---------------------------------------------------------------------------
// Commit message templates
// ---------------------------------------------------------------------------

const COMMIT_TEMPLATES: string[] = [
  "feat: add drag-and-drop column reordering",
  "fix: prevent crash when grid has zero columns",
  "refactor: extract layout computation into pure functions",
  "docs: update README with new API examples",
  "chore: bump version to 0.2.1",
  "feat: implement tab close animation",
  "fix: correct tab ordering after drop on edge",
  "style: lint all source files",
  "test: add integration tests for grid operations",
  "feat: add ghost preview during drag",
  "fix: handle empty pane gracefully",
  "refactor: simplify tabbar event delegation",
  "feat: support dark/light theme switching",
  "fix: resize observer cleanup on disconnect",
  "docs: add agent guide for contributors",
  "chore: update pnpm lockfile",
  "feat: add keyboard shortcuts for tab navigation",
  "fix: prevent duplicate pane when dropping on self",
  "test: cover edge cases in movePaneInGrid",
  "This is a very long commit message intended to test text overflow behaviour with ellipsis truncation in the commit row rendering",
  "feat: add minimap for large files",
  "fix: calculate drag threshold correctly",
  "refactor: extract drag state into module-level singleton",
];

// ---------------------------------------------------------------------------
// Branch definitions
// ---------------------------------------------------------------------------

interface BranchDef {
  name: string;
  shortName: string;
  isLocal: boolean;
  isCurrent: boolean;
  ahead: number;
  behind: number;
  tracking?: string;
  commits: string[];
}

const MAIN_BRANCH: BranchDef = {
  name: "refs/heads/main",
  shortName: "main",
  isLocal: true,
  isCurrent: true,
  ahead: 2,
  behind: 0,
  commits: COMMIT_TEMPLATES.slice(0, 6),
};

const BRANCH_DEFS: BranchDef[] = [
  MAIN_BRANCH,
  {
    name: "refs/heads/feature/file-editor",
    shortName: "feature/file-editor",
    isLocal: true,
    isCurrent: false,
    ahead: 5,
    behind: 1,
    commits: COMMIT_TEMPLATES.slice(2, 5),
  },
  {
    name: "refs/heads/feature/drag-ghost",
    shortName: "feature/drag-ghost",
    isLocal: true,
    isCurrent: false,
    ahead: 0,
    behind: 3,
    commits: COMMIT_TEMPLATES.slice(6, 9),
  },
  {
    name: "refs/heads/fix/grid-crash",
    shortName: "fix/grid-crash",
    isLocal: true,
    isCurrent: false,
    ahead: 0,
    behind: 0,
    commits: COMMIT_TEMPLATES.slice(10, 12),
  },
  {
    name: "refs/heads/release/v0.3.0",
    shortName: "release/v0.3.0",
    isLocal: true,
    isCurrent: false,
    ahead: 42,
    behind: 13,
    commits: COMMIT_TEMPLATES.slice(12, 15),
  },
  {
    name: "refs/remotes/origin/main",
    shortName: "origin/main",
    isLocal: false,
    isCurrent: false,
    ahead: 0,
    behind: 0,
    tracking: "origin/main",
    commits: [],
  },
  {
    name: "refs/remotes/origin/feature/dark-mode",
    shortName: "origin/feature/dark-mode",
    isLocal: false,
    isCurrent: false,
    ahead: 0,
    behind: 0,
    tracking: "origin/feature/dark-mode",
    commits: [],
  },
];

// ---------------------------------------------------------------------------
// File change patterns
// ---------------------------------------------------------------------------

interface FileChangeDef {
  filePath: string;
  added: number;
  deleted: number;
  status: "added" | "modified" | "deleted" | "renamed";
}

const FILE_CHANGE_SETS: Record<string, FileChangeDef[]> = {
  [MAIN_BRANCH.name]: [
    { filePath: "src/layout/operations.ts", added: 24, deleted: 8, status: "modified" },
    {
      filePath: "src/renderer/components/openp41ge-grid.ts",
      added: 56,
      deleted: 12,
      status: "modified",
    },
    {
      filePath: "src/renderer/components/openp41ge-tabbar.ts",
      added: 10,
      deleted: 3,
      status: "modified",
    },
    { filePath: "src/styles/themes.css", added: 42, deleted: 0, status: "added" },
    { filePath: "src/renderer/drag-overlay.ts", added: 0, deleted: 4, status: "deleted" },
    { filePath: "docs/AGENT-GUIDE.md", added: 87, deleted: 0, status: "added" },
    { filePath: "pnpm-lock.yaml", added: 1, deleted: 1, status: "modified" },
    { filePath: "src/utils/helpers.ts", added: 0, deleted: 0, status: "renamed" },
  ],
  "refs/heads/feature/file-editor": [
    {
      filePath: "packages/openp41ge-file-editor/src/editor-controller.ts",
      added: 120,
      deleted: 30,
      status: "modified",
    },
    {
      filePath: "packages/openp41ge-file-editor/src/syntax-highlighter.ts",
      added: 200,
      deleted: 45,
      status: "modified",
    },
    {
      filePath: "packages/openp41ge-file-editor/src/index.ts",
      added: 15,
      deleted: 2,
      status: "modified",
    },
    {
      filePath: "packages/openp41ge-file-editor/package.json",
      added: 3,
      deleted: 1,
      status: "modified",
    },
  ],
  "refs/heads/feature/drag-ghost": [
    { filePath: "src/renderer/drag-overlay.ts", added: 89, deleted: 0, status: "added" },
    {
      filePath: "src/renderer/components/openp41ge-grid.ts",
      added: 34,
      deleted: 20,
      status: "modified",
    },
    { filePath: "electron/ipc-handlers/drag-handlers.ts", added: 45, deleted: 0, status: "added" },
    { filePath: "src/renderer/global.d.ts", added: 5, deleted: 0, status: "modified" },
  ],
  "refs/heads/fix/grid-crash": [
    { filePath: "src/layout/operations.ts", added: 8, deleted: 15, status: "modified" },
    { filePath: "src/layout/types.ts", added: 2, deleted: 1, status: "modified" },
  ],
  "refs/heads/release/v0.3.0": [
    { filePath: "package.json", added: 2, deleted: 2, status: "modified" },
    { filePath: "CHANGELOG.md", added: 45, deleted: 0, status: "added" },
    { filePath: "README.md", added: 12, deleted: 3, status: "modified" },
  ],
};

const FALLBACK_FILES: FileChangeDef[] = [
  { filePath: "src/index.ts", added: 6, deleted: 2, status: "modified" },
  { filePath: "src/utils/helpers.ts", added: 18, deleted: 0, status: "added" },
  { filePath: "src/styles/theme.css", added: 0, deleted: 5, status: "deleted" },
];

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createMockRepository(): GitBrowserData {
  const branches: BranchEntry[] = BRANCH_DEFS.map((def) => {
    const commits = def.commits.map((msg, i) =>
      makeCommit(msg, AUTHORS[i % AUTHORS.length], (def.commits.length - i) * 2),
    );
    const lastCommit = commits.length > 0 ? commits[0] : null;
    return {
      name: def.name,
      shortName: def.shortName,
      isLocal: def.isLocal,
      isCurrent: def.isCurrent,
      ahead: def.ahead,
      behind: def.behind,
      tracking: def.tracking,
      lastCommit,
    };
  });

  // Commits for main branch (the selected branch initially)
  const mainBranchDef = BRANCH_DEFS[0];
  const mainCommits = mainBranchDef.commits.map((msg, i) =>
    makeCommit(msg, AUTHORS[i % AUTHORS.length], (mainBranchDef.commits.length - i) * 2),
  );

  // Extra "Show more" commits — set 2
  const MORE_MESSAGES = [
    "fix: correct off-by-one error in column calculation",
    "chore: remove unused imports",
    "test: add contract tests for IPC handlers",
    "feat: add tooltip on branch hover",
    "refactor: rename Openp41geWindow to WindowState",
    "fix: ensure tab is selected after drop",
    "docs: add architecture overview diagram",
    "style: format with prettier",
    "feat: add file watcher for auto-reload",
    "fix: debounce resize handler",
  ];
  const moreCommits = MORE_MESSAGES.map((msg, i) =>
    makeCommit(
      msg,
      AUTHORS[(mainCommits.length + i) % AUTHORS.length],
      (mainBranchDef.commits.length + i + 1) * 2,
    ),
  );

  const allCommits = [...mainCommits, ...moreCommits];

  const filesChanged = FILE_CHANGE_SETS[MAIN_BRANCH.name] || FALLBACK_FILES;

  return {
    repoName: "openp41ge",
    branches,
    selectedBranch: "refs/heads/main",
    commits: allCommits,
    filesChanged,
    loadingBranches: false,
    loadingCommits: false,
    loadingFiles: false,
    commitSkipCount: 0,
    hasMoreCommits: true,
    visibleCommitCount: 6,
    selectedCommit: allCommits[0].hash,
  };
}

/**
 * Generate commits for a specific branch name.
 */
export function createCommitsForBranch(
  branchName: string,
  commitCount: number = 5,
): { commits: CommitEntry[]; filesChanged: DiffStatEntry[] } {
  const def = BRANCH_DEFS.find((d) => d.name === branchName);
  const messages = def?.commits ?? COMMIT_TEMPLATES.slice(0, commitCount);
  const commits = messages.map((msg, i) =>
    makeCommit(msg, AUTHORS[i % AUTHORS.length], (messages.length - i) * 2),
  );

  const filesChanged = FILE_CHANGE_SETS[branchName] ?? FALLBACK_FILES;

  return { commits, filesChanged };
}

/**
 * Generate additional "Show more" commits.
 */
export function createMoreCommits(startIndex: number, count: number = 10): CommitEntry[] {
  const MORE = [
    "fix: handle undefined in grid operations",
    "chore: clean up console.log statements",
    "test: add e2e for drag-and-drop across windows",
    "feat: add close button to pane header",
    "refactor: extract PaneController interface",
    "fix: prevent memory leak in event listeners",
    "docs: update troubleshooting guide",
    "style: consistent spacing in CSS files",
    "feat: add tab reordering with keyboard",
    "fix: correct theme variable names",
    "chore: upgrade vite to v6",
    "test: add snapshot tests for layout computation",
    "feat: add resize handle between panes",
    "refactor: consolidate IPC handler registration",
    "fix: handle race condition in file watcher",
  ];
  const commits: CommitEntry[] = [];
  for (let i = 0; i < count && startIndex + i < MORE.length; i++) {
    commits.push(
      makeCommit(
        MORE[startIndex + i],
        AUTHORS[(startIndex + i) % AUTHORS.length],
        (startIndex + i + 1) * 3,
      ),
    );
  }
  return commits;
}
