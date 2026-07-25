/**
 * Unit tests for GitBrowserRenderer — pure DOM rendering service.
 *
 * All methods create DOM elements without side effects (no IPC, no state).
 * jsdom provides the DOM APIs needed.
 */

import {
  gitBrowserRenderer,
  type GitBrowserData,
  type GitBrowserCallbacks,
} from "@openp41ge-git-repository/services/git-browser-renderer";

function makeData(overrides?: Partial<GitBrowserData>): GitBrowserData {
  return {
    repoName: "test-org/test-repo",
    branches: [
      {
        name: "main",
        shortName: "main",
        isLocal: true,
        isCurrent: true,
        ahead: 0,
        behind: 0,
        lastCommit: null,
      },
    ],
    selectedBranch: "main",
    commits: [],
    filesChanged: [],
    loadingBranches: false,
    loadingCommits: false,
    loadingFiles: false,
    commitSkipCount: 0,
    hasMoreCommits: false,
    visibleCommitCount: 10,
    selectedCommit: null,
    ...overrides,
  };
}

function makeCallbacks(): GitBrowserCallbacks {
  return {
    onSelectBranch: vi.fn(),
    onSelectCommit: vi.fn(),
    onRefreshBranches: vi.fn(),
    onRefreshCommits: vi.fn(),
    onRefreshFiles: vi.fn(),
    onLoadMoreCommits: vi.fn(),
    onClose: vi.fn(),
    onCheckoutWorktree: vi.fn(),
    onBranchContextMenu: vi.fn(),
    onFileRowClick: vi.fn(),
  };
}

function querySection(panel: HTMLElement, key: string): HTMLElement | null {
  return panel.querySelector(`[data-section="${key}"]`) as HTMLElement | null;
}

function querySectionBody(section: HTMLElement): HTMLElement | null {
  return section.querySelector(".git-section-body") as HTMLElement | null;
}

function queryChevron(section: HTMLElement): SVGElement | null {
  return section.querySelector("svg") as SVGElement | null;
}

function querySectionHeader(section: HTMLElement): HTMLElement | null {
  return section.querySelector(".git-section-header") as HTMLElement | null;
}

describe("GitBrowserRenderer", () => {
  let panel: HTMLElement;

  beforeEach(() => {
    // Reset internal state between tests
    (gitBrowserRenderer as any)._sectionStates?.clear();
    panel = gitBrowserRenderer.renderGitPanel(makeData(), makeCallbacks());
  });

  // ── renderGitPanel ───────────────────────────────────────────────────

  describe("renderGitPanel", () => {
    test("renders all three sections", () => {
      expect(querySection(panel, "branches")).not.toBeNull();
      expect(querySection(panel, "commits")).not.toBeNull();
      expect(querySection(panel, "files")).not.toBeNull();
    });

    test("all sections are expanded by default", () => {
      for (const key of ["branches", "commits", "files"]) {
        const section = querySection(panel, key);
        expect(section).not.toBeNull();
        const body = querySectionBody(section!);
        expect(body).not.toBeNull();
        // Expanded: display should not be "none"
        expect(body!.style.display).not.toBe("none");
      }
    });

    test("section headers have clickable cursor style", () => {
      for (const key of ["branches", "commits", "files"]) {
        const section = querySection(panel, key);
        const header = querySectionHeader(section!);
        expect(header).not.toBeNull();
        expect(header!.style.cursor).toBe("pointer");
      }
    });

    test("each section has a chevron-down SVG icon when expanded", () => {
      for (const key of ["branches", "commits", "files"]) {
        const section = querySection(panel, key);
        const chevron = queryChevron(section!);
        expect(chevron).not.toBeNull();
      }
    });

    test("header contains section label with correct text", () => {
      const branchesSection = querySection(panel, "branches");
      const header = querySectionHeader(branchesSection!);
      expect(header!.textContent).toContain("Branches");

      const commitsSection = querySection(panel, "commits");
      const commitsHeader = querySectionHeader(commitsSection!);
      expect(commitsHeader!.textContent).toContain("Commits");
    });

    test("commits section label includes branch name and count", () => {
      const data = makeData({ selectedBranch: "develop" });
      panel = gitBrowserRenderer.renderGitPanel(data, makeCallbacks());
      const section = querySection(panel, "commits");
      const header = querySectionHeader(section!);
      expect(header!.textContent).toContain("Commits");
      expect(header!.textContent).toContain("develop");
    });

    test("loading state shows spinner in header", () => {
      const data = makeData({ loadingBranches: true });
      panel = gitBrowserRenderer.renderGitPanel(data, makeCallbacks());
      const section = querySection(panel, "branches");
      // Spinner has the git-section-spinner class
      const spinner = section!.querySelector(".git-section-spinner");
      expect(spinner).not.toBeNull();
    });
  });

  // ── Accordion collapse/expand ────────────────────────────────────────

  describe("accordion collapse/expand", () => {
    test("clicking section header hides the body and shows chevron-right", () => {
      const branchesSection = querySection(panel, "branches")!;
      const branchesBody = querySectionBody(branchesSection)!;
      const branchesHeader = querySectionHeader(branchesSection)!;

      expect(branchesBody.style.display).not.toBe("none");

      branchesHeader.click();

      expect(branchesBody.style.display).toBe("none");
      // Chevron should now be the right-pointing variant — query AFTER click
      const chevronAfter = queryChevron(branchesSection)!;
      expect(chevronAfter.innerHTML).toContain('points="6,4 10,8 6,12"');
    });

    test("clicking header twice toggles collapsed → expanded", () => {
      const branchesSection = querySection(panel, "branches")!;
      const branchesBody = querySectionBody(branchesSection)!;
      const branchesHeader = querySectionHeader(branchesSection)!;

      // Initial: expanded
      expect(branchesBody.style.display).not.toBe("none");
      const initialChevronHtml = queryChevron(branchesSection)!.innerHTML;

      // First click: collapse
      branchesHeader.click();
      expect(branchesBody.style.display).toBe("none");
      expect(queryChevron(branchesSection)!.innerHTML).not.toBe(initialChevronHtml);

      // Second click: expand
      branchesHeader.click();
      expect(branchesBody.style.display).not.toBe("none");
    });

    test("collapsing a section sets flex to 0 1 auto on the container", () => {
      const branchesSection = querySection(panel, "branches")!;
      const branchesHeader = querySectionHeader(branchesSection)!;

      // Initial: flex:1 (serialized as 1 1 0% in Chromium/jsdom)
      expect(branchesSection.style.flex).toBe("1 1 0%");

      branchesHeader.click();

      // Collapsed: flex 0 1 auto (set via inline style)
      expect(branchesSection.style.flex).toBe("0 1 auto");
    });

    test("expanding a section restores flex to 1", () => {
      const branchesSection = querySection(panel, "branches")!;
      const branchesHeader = querySectionHeader(branchesSection)!;

      branchesHeader.click();
      expect(branchesSection.style.flex).toBe("0 1 auto");

      branchesHeader.click();
      expect(branchesSection.style.flex).toBe("1 1 0%");
    });

    test("commits section collapses independently of branches", () => {
      const branchesSection = querySection(panel, "branches")!;
      const branchesBody = querySectionBody(branchesSection)!;
      const branchesHeader = querySectionHeader(branchesSection)!;

      const commitsSection = querySection(panel, "commits")!;
      const commitsBody = querySectionBody(commitsSection)!;
      const commitsHeader = querySectionHeader(commitsSection)!;

      // Collapse branches only
      branchesHeader.click();

      expect(branchesBody.style.display).toBe("none");
      expect(commitsBody.style.display).not.toBe("none");

      // Expand branches, collapse commits
      branchesHeader.click();
      commitsHeader.click();

      expect(branchesBody.style.display).not.toBe("none");
      expect(commitsBody.style.display).toBe("none");
    });

    test("all three sections can be collapsed independently", () => {
      const sections = ["branches", "commits", "files"] as const;
      const headers = sections.map((key) => querySectionHeader(querySection(panel, key)!)!);
      const bodies = sections.map((key) => querySectionBody(querySection(panel, key)!)!);

      // Collapse all three
      for (const h of headers) h.click();

      for (const b of bodies) expect(b.style.display).toBe("none");

      // Expand all three
      for (const h of headers) h.click();

      for (const b of bodies) expect(b.style.display).not.toBe("none");
    });

    test("section transitions are set on container", () => {
      const branchesSection = querySection(panel, "branches")!;
      const transition = branchesSection.style.transition;
      expect(transition).toContain("flex");
    });
  });

  // ── replaceSection preserves states ──────────────────────────────────

  describe("replaceSection preserves accordion state", () => {
    test("collapsed state is preserved after replaceSection", () => {
      const branchesSection = querySection(panel, "branches")!;
      const branchesHeader = querySectionHeader(branchesSection)!;

      // Collapse branches
      branchesHeader.click();

      const newBranches = gitBrowserRenderer.replaceSection(
        panel,
        "branches",
        makeData(),
        makeCallbacks(),
      );
      expect(newBranches).not.toBeNull();

      // After replacement, branches section should still be collapsed
      const newBody = querySectionBody(newBranches!);
      expect(newBody!.style.display).toBe("none");
      expect(newBranches!.style.flex).toBe("0 1 auto");
    });

    test("expanded state is preserved after replaceSection", () => {
      const newFiles = gitBrowserRenderer.replaceSection(
        panel,
        "files",
        makeData(),
        makeCallbacks(),
      );
      expect(newFiles).not.toBeNull();

      // Files were never collapsed, should still be expanded
      const newBody = querySectionBody(newFiles!);
      expect(newBody!.style.display).not.toBe("none");
    });
  });

  // ── renderError ──────────────────────────────────────────────────────

  describe("renderError", () => {
    test("renders error message and retry button", () => {
      const container = document.createElement("div");
      const onRetry = vi.fn();
      gitBrowserRenderer.renderError(container, "Something went wrong", onRetry);

      expect(container.textContent).toContain("Something went wrong");
      const btn = container.querySelector("button");
      expect(btn).not.toBeNull();
      expect(btn!.textContent).toBe("Retry");
    });

    test("retry button calls the callback on click", () => {
      const container = document.createElement("div");
      const onRetry = vi.fn();
      gitBrowserRenderer.renderError(container, "err", onRetry);

      const btn = container.querySelector("button")!;
      btn.click();
      expect(onRetry).toHaveBeenCalledTimes(1);
    });
  });

  // ── renderLoading ────────────────────────────────────────────────────

  describe("renderLoading", () => {
    test("renders loading text and spinner", () => {
      const container = document.createElement("div");
      gitBrowserRenderer.renderLoading(container);

      expect(container.textContent).toContain("Loading git data");
      const spinner = container.querySelector(".wt-spinner");
      expect(spinner).not.toBeNull();
    });
  });

  // ── renderBranchRow ──────────────────────────────────────────────────

  describe("renderBranchRow", () => {
    test("renders selected branch with different style", () => {
      const branch = {
        name: "main",
        shortName: "main",
        isLocal: true,
        isCurrent: true,
        ahead: 0,
        behind: 0,
        lastCommit: null,
      };
      const row = gitBrowserRenderer.renderBranchRow(branch, true);
      expect(row).not.toBeNull();
      expect(row.textContent).toContain("main");
    });

    test("renders unselected branch", () => {
      const branch = {
        name: "develop",
        shortName: "develop",
        isLocal: true,
        isCurrent: false,
        ahead: 0,
        behind: 0,
        lastCommit: null,
      };
      const row = gitBrowserRenderer.renderBranchRow(branch, false);
      expect(row).not.toBeNull();
      expect(row.textContent).toContain("develop");
    });

    test("selected branch shows commit history line when lastCommit is set", () => {
      const branch = {
        name: "main",
        shortName: "main",
        isLocal: true,
        isCurrent: true,
        ahead: 0,
        behind: 0,
        lastCommit: {
          hash: "abc123def456",
          shortHash: "abc123d",
          authorName: "Jane Doe",
          authorEmail: "jane@example.com",
          date: "2026-01-15T10:00:00Z",
          relativeDate: "2 weeks ago",
          message: "Fix login validation",
          fullMessage: "Fix login validation",
          refs: [],
          parents: [],
        },
      };
      const row = gitBrowserRenderer.renderBranchRow(branch, true);
      expect(row.textContent).toContain("abc123d");
      expect(row.textContent).toContain("Fix login validation");
    });

    test("remote branch renders with ↗ icon and dimmed text", () => {
      const branch = {
        name: "origin/feature/login",
        shortName: "feature/login",
        isLocal: false,
        isCurrent: false,
        ahead: 0,
        behind: 0,
        lastCommit: null,
      };
      const row = gitBrowserRenderer.renderBranchRow(branch, false);
      // Remote branch has ↗ character
      expect(row.textContent).toContain("\u2197");
    });

    test("branch with ahead/behind shows badges", () => {
      const branch = {
        name: "main",
        shortName: "main",
        isLocal: true,
        isCurrent: true,
        ahead: 5,
        behind: 2,
        lastCommit: null,
      };
      const row = gitBrowserRenderer.renderBranchRow(branch, true);
      expect(row.textContent).toContain("\u2191");
      expect(row.textContent).toContain("5");
      expect(row.textContent).toContain("\u2193");
      expect(row.textContent).toContain("2");
    });
  });

  // ── renderCommitRow ──────────────────────────────────────────────────

  describe("renderCommitRow", () => {
    test("renders commit with hash, message, author and date", () => {
      const commit = {
        hash: "a1b2c3d4e5f6",
        shortHash: "a1b2c3d",
        authorName: "Jane Doe",
        authorEmail: "jane@example.com",
        date: "2026-01-15T10:00:00Z",
        relativeDate: "2 hours ago",
        message: "Fix login validation",
        fullMessage: "Fix login validation",
        refs: [],
        parents: [],
      };
      const row = gitBrowserRenderer.renderCommitRow(commit, false);
      expect(row).not.toBeNull();
      expect(row.textContent).toContain("a1b2c3d");
      expect(row.textContent).toContain("Fix login validation");
      expect(row.textContent).toContain("Jane Doe");
      expect(row.textContent).toContain("2 hours ago");
    });

    test("selected commit has highlighted background", () => {
      const commit = {
        hash: "a1b2c3d4e5f6",
        shortHash: "a1b2c3d",
        authorName: "Jane",
        authorEmail: "jane@example.com",
        date: "2026-01-15T10:00:00Z",
        relativeDate: "2 hours ago",
        message: "Fix",
        fullMessage: "Fix",
        refs: [],
        parents: [],
      };
      const row = gitBrowserRenderer.renderCommitRow(commit, true);
      expect(row.style.background).toContain("rgba");
    });
  });

  // ── renderFileRow ────────────────────────────────────────────────────

  describe("renderFileRow", () => {
    test("renders file row with path and diff stat", () => {
      const file = { filePath: "src/index.ts", added: 5, deleted: 2, status: "modified" as const };
      const row = gitBrowserRenderer.renderFileRow(file);
      expect(row).not.toBeNull();
      expect(row.textContent).toContain("src/index.ts");
    });

    test("added file shows + icon and green added count", () => {
      const file = { filePath: "src/new.ts", added: 10, deleted: 0, status: "added" as const };
      const row = gitBrowserRenderer.renderFileRow(file);
      expect(row.textContent).toContain("+10");
      expect(row.textContent).toContain("src/new.ts");
    });

    test("deleted file shows red deleted count", () => {
      const file = { filePath: "src/old.ts", added: 0, deleted: 8, status: "deleted" as const };
      const row = gitBrowserRenderer.renderFileRow(file);
      // SVG icons don't produce textContent, but filename + counts do
      expect(row.textContent).toContain("src/old.ts");
      expect(row.textContent).toContain("-8");
      // Verify SVG icon element is present in row
      const svgEl = row.querySelector("svg");
      expect(svgEl).not.toBeNull();
    });

    test("renamed file shows arrow icon", () => {
      const file = {
        filePath: "src/moved.ts",
        added: 1,
        deleted: 1,
        status: "renamed" as const,
      };
      const row = gitBrowserRenderer.renderFileRow(file);
      expect(row.textContent).toContain("src/moved.ts");
      // Verify SVG icon element is present in row
      const svgEl = row.querySelector("svg");
      expect(svgEl).not.toBeNull();
    });
  });

  // ── git panel empty/loading states ───────────────────────────────────

  describe("git panel states", () => {
    test("empty branches shows 'No branches' message", () => {
      const data = makeData({ branches: [] });
      panel = gitBrowserRenderer.renderGitPanel(data, makeCallbacks());
      const section = querySection(panel, "branches");
      const body = querySectionBody(section!);
      expect(body!.textContent).toContain("No branches");
    });

    test("empty commits shows 'No commits yet' message", () => {
      const data = makeData({ selectedBranch: "main" });
      panel = gitBrowserRenderer.renderGitPanel(data, makeCallbacks());
      const section = querySection(panel, "commits");
      const body = querySectionBody(section!);
      expect(body!.textContent).toContain("No commits yet");
    });

    test("empty files changed shows 'No changed files' message", () => {
      const data = makeData({ filesChanged: [] });
      panel = gitBrowserRenderer.renderGitPanel(data, makeCallbacks());
      const section = querySection(panel, "files");
      const body = querySectionBody(section!);
      expect(body!.textContent).toContain("No changed files");
    });

    test("'Show more' button renders when hasMoreCommits is true", () => {
      const commit = {
        hash: "a1b2c3d4e5f6",
        shortHash: "a1b2c3d",
        authorName: "Jane",
        authorEmail: "jane@example.com",
        date: "2026-01-15T10:00:00Z",
        relativeDate: "2 hours ago",
        message: "Fix",
        fullMessage: "Fix",
        refs: [],
        parents: [],
      };
      const data = makeData({
        commits: [commit, commit, commit],
        hasMoreCommits: true,
        visibleCommitCount: 2,
      });
      panel = gitBrowserRenderer.renderGitPanel(data, makeCallbacks());
      const section = querySection(panel, "commits");
      const body = querySectionBody(section!);
      expect(body!.textContent).toContain("Show more");
    });
  });
});
