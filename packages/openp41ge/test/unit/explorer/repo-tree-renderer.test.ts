/**
 * Unit tests for RepoTreeRenderer — pure DOM rendering service.
 *
 * All methods create DOM elements without side effects (no IPC, no state).
 * jsdom provides the DOM APIs needed.
 */

import { repoTreeRenderer, type FileEntry } from "@openp41ge/renderer/services/repo-tree-renderer";

function makeCallbacks() {
  return {
    onFileClick: vi.fn(),
    onFileDoubleClick: vi.fn(),
    onFileContextMenu: vi.fn(),
    onToggleDir: vi.fn(),
    onWorktreeContextMenu: vi.fn(),
  };
}

describe("RepoTreeRenderer", () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement("div");
  });

  // ── renderEmpty ────────────────────────────────────────────────────────

  describe("renderEmpty", () => {
    test("renders empty state text and a clone button", () => {
      const onClone = vi.fn();
      repoTreeRenderer.renderEmpty(container, onClone);
      expect(container.textContent).toContain("No repositories cloned yet");
      const btn = container.querySelector("#wt-clone-btn");
      expect(btn).toBeTruthy();
    });

    test("clone button click triggers callback", () => {
      const onClone = vi.fn();
      repoTreeRenderer.renderEmpty(container, onClone);
      const btn = container.querySelector("#wt-clone-btn") as HTMLElement;
      btn.click();
      expect(onClone).toHaveBeenCalledTimes(1);
    });

    test("clone button hover changes background", () => {
      const onClone = vi.fn();
      repoTreeRenderer.renderEmpty(container, onClone);
      const btn = container.querySelector("#wt-clone-btn") as HTMLElement;
      btn.dispatchEvent(new MouseEvent("mouseenter"));
      expect(btn.style.background).toBe("rgb(30, 91, 181)");
      btn.dispatchEvent(new MouseEvent("mouseleave"));
      expect(btn.style.background).toBe("rgb(42, 111, 209)");
    });
  });

  // ── renderLoading ──────────────────────────────────────────────────────

  describe("renderLoading", () => {
    test("renders loading text", () => {
      repoTreeRenderer.renderLoading(container);
      expect(container.textContent).toContain("Loading...");
    });
  });

  // ── renderError ────────────────────────────────────────────────────────

  describe("renderError", () => {
    test("renders error message and retry button", () => {
      const onRetry = vi.fn();
      repoTreeRenderer.renderError(container, "Something went wrong", onRetry);
      expect(container.textContent).toContain("Something went wrong");
      const btn = container.querySelector("#wt-retry-btn");
      expect(btn).toBeTruthy();
    });

    test("retry button click triggers callback", () => {
      const onRetry = vi.fn();
      repoTreeRenderer.renderError(container, "Error", onRetry);
      const btn = container.querySelector("#wt-retry-btn") as HTMLElement;
      btn.click();
      expect(onRetry).toHaveBeenCalledTimes(1);
    });

    test("escapes HTML in error message", () => {
      const onRetry = vi.fn();
      repoTreeRenderer.renderError(container, '<script>alert("xss")</script>', onRetry);
      expect(container.innerHTML).not.toContain("<script>");
      expect(container.textContent).toContain('<script>alert("xss")</script>');
    });
  });

  // ── renderCloneProgress ────────────────────────────────────────────────

  describe("renderCloneProgress", () => {
    test("renders progress bar at given percent", () => {
      repoTreeRenderer.renderCloneProgress(container, 42, "Receiving objects...");
      expect(container.textContent).toContain("Cloning repository...");
      expect(container.textContent).toContain("Receiving objects...");
      const innerBar = container.querySelector("div > div > div") as HTMLElement;
      expect(innerBar.style.width).toBe("42%");
    });

    test("escapes message HTML", () => {
      repoTreeRenderer.renderCloneProgress(container, 0, "<b>bold</b>");
      expect(container.innerHTML).not.toContain("<b>");
      expect(container.textContent).toContain("<b>bold</b>");
    });

    test("handles 0% and 100%", () => {
      repoTreeRenderer.renderCloneProgress(container, 0, "start");
      let innerBar = container.querySelector("div > div > div") as HTMLElement;
      expect(innerBar.style.width).toBe("0%");

      repoTreeRenderer.renderCloneProgress(container, 100, "done");
      innerBar = container.querySelector("div > div > div") as HTMLElement;
      expect(innerBar.style.width).toBe("100%");
    });
  });

  // ── renderRepoHeader ───────────────────────────────────────────────────

  describe("renderRepoHeader", () => {
    test("renders header with repo name", () => {
      const onToggle = vi.fn();
      const header = repoTreeRenderer.renderRepoHeader(
        "org/repo",
        "https://example.com",
        false,
        onToggle,
      );
      expect(header.textContent).toContain("org/repo");
    });

    test("shows right chevron when collapsed", () => {
      const onToggle = vi.fn();
      const header = repoTreeRenderer.renderRepoHeader("r", "u", false, onToggle);
      const chevron = header.querySelector("span")!;
      expect(chevron.innerHTML).toContain("polyline");
      expect(chevron.innerHTML).toContain("6,4 10,8 6,12"); // chevronRight
    });

    test("shows down chevron when expanded", () => {
      const onToggle = vi.fn();
      const header = repoTreeRenderer.renderRepoHeader("r", "u", true, onToggle);
      const chevron = header.querySelector("span")!;
      expect(chevron.innerHTML).toContain("polyline");
      expect(chevron.innerHTML).toContain("4,6 8,10 12,6"); // chevronDown
    });

    test("click on header triggers toggle", () => {
      const onToggle = vi.fn();
      const header = repoTreeRenderer.renderRepoHeader("r", "u", false, onToggle);
      header.click();
      expect(onToggle).toHaveBeenCalledTimes(1);
    });

    test("click on chevron triggers toggle without bubbling", () => {
      const onToggle = vi.fn();
      const header = repoTreeRenderer.renderRepoHeader("r", "u", false, onToggle);
      const chevron = header.querySelector("span")!;
      chevron.click();
      expect(onToggle).toHaveBeenCalledTimes(1);
    });

    test("hover changes background", () => {
      const onToggle = vi.fn();
      const header = repoTreeRenderer.renderRepoHeader("r", "u", false, onToggle);
      header.dispatchEvent(new MouseEvent("mouseenter"));
      expect(header.style.background).toBe("rgb(37, 37, 37)");
      header.dispatchEvent(new MouseEvent("mouseleave"));
      expect(header.style.background).toBe("rgb(30, 30, 30)");
    });
  });

  // ── renderWorktreeRow ──────────────────────────────────────────────────

  describe("renderWorktreeRow", () => {
    test("renders branch name in header", () => {
      const cbs = makeCallbacks();
      const row = repoTreeRenderer.renderWorktreeRow("feature-x", [], false, 1, "", cbs);
      expect(row.textContent).toContain("feature-x");
      expect(row.dataset.branch).toBe("feature-x");
    });

    test("sets selected background when path matches", () => {
      const cbs = makeCallbacks();
      const row = repoTreeRenderer.renderWorktreeRow("main", [], false, 0, "main", cbs);
      const header = row.firstElementChild as HTMLElement;
      expect(header.style.background).toContain("rgba(74, 158, 255, 0.12)");
    });

    test("click on header triggers toggleDir callback", () => {
      const cbs = makeCallbacks();
      const row = repoTreeRenderer.renderWorktreeRow("main", [], false, 0, "", cbs);
      const header = row.firstElementChild as HTMLElement;
      header.click();
      expect(cbs.onToggleDir).toHaveBeenCalledWith("main");
    });

    test("contextmenu on header triggers onWorktreeContextMenu", () => {
      const cbs = makeCallbacks();
      const row = repoTreeRenderer.renderWorktreeRow("main", [], false, 0, "", cbs);
      const header = row.firstElementChild as HTMLElement;
      header.dispatchEvent(
        new MouseEvent("contextmenu", { bubbles: true, clientX: 50, clientY: 100 }),
      );
      expect(cbs.onWorktreeContextMenu).toHaveBeenCalledWith("main", 50, 100);
    });

    test("renders chevron right when collapsed, down when expanded", () => {
      const cbs = makeCallbacks();
      const collapsed = repoTreeRenderer.renderWorktreeRow("b", [], false, 0, "", cbs);
      const collapsedChevron = collapsed.querySelector("span")!;
      expect(collapsedChevron.innerHTML).toContain("6,4 10,8 6,12"); // chevronRight

      const expanded = repoTreeRenderer.renderWorktreeRow("b", [], true, 0, "", cbs);
      const expandedChevron = expanded.querySelector("span")!;
      expect(expandedChevron.innerHTML).toContain("4,6 8,10 12,6"); // chevronDown
    });

    test("renders files container when expanded", () => {
      const cbs = makeCallbacks();
      const files: FileEntry[] = [
        { name: "readme.md", path: "/readme.md", isDirectory: false, size: 100, modifiedAt: 0 },
      ];
      const row = repoTreeRenderer.renderWorktreeRow("main", files, true, 0, "", cbs);
      const filesContainer = row.querySelector(".wt-files-container");
      expect(filesContainer).toBeTruthy();
      expect(filesContainer!.textContent).toContain("readme.md");
    });

    test("shows empty message when expanded with no files", () => {
      const cbs = makeCallbacks();
      const row = repoTreeRenderer.renderWorktreeRow("main", [], true, 0, "", cbs);
      expect(row.textContent).toContain("No files");
    });

    test("does not render files container when collapsed", () => {
      const cbs = makeCallbacks();
      const row = repoTreeRenderer.renderWorktreeRow("main", [], false, 0, "", cbs);
      expect(row.querySelector(".wt-files-container")).toBeNull();
    });

    test("hover on header updates background (not selected)", () => {
      const cbs = makeCallbacks();
      const row = repoTreeRenderer.renderWorktreeRow("main", [], false, 0, "", cbs);
      const header = row.firstElementChild as HTMLElement;
      header.dispatchEvent(new MouseEvent("mouseenter"));
      expect(header.style.background).toBe("rgb(37, 37, 37)");
      header.dispatchEvent(new MouseEvent("mouseleave"));
      expect(header.style.background).toBe("rgba(42, 111, 209, 0.08)");
    });

    test("hover on selected header keeps selected background on leave", () => {
      const cbs = makeCallbacks();
      const row = repoTreeRenderer.renderWorktreeRow("main", [], false, 0, "main", cbs);
      const header = row.firstElementChild as HTMLElement;
      header.dispatchEvent(new MouseEvent("mouseleave"));
      expect(header.style.background).toContain("rgba(74, 158, 255, 0.12)");
    });
  });

  // ── renderFileRow (file) ───────────────────────────────────────────────

  describe("renderFileRow", () => {
    test("renders a file row with name", () => {
      const cbs = makeCallbacks();
      const file: FileEntry = {
        name: "index.ts",
        path: "/index.ts",
        isDirectory: false,
        size: 200,
        modifiedAt: 0,
      };
      const row = repoTreeRenderer.renderFileRow(file, 2, "", cbs);
      expect(row.textContent).toContain("index.ts");
      expect(row.dataset.path).toBe("/index.ts");
      expect(row.dataset.type).toBe("file");
    });

    test("click on file row triggers onFileClick", () => {
      const cbs = makeCallbacks();
      const file: FileEntry = {
        name: "a.ts",
        path: "/a.ts",
        isDirectory: false,
        size: 1,
        modifiedAt: 0,
      };
      const row = repoTreeRenderer.renderFileRow(file, 0, "", cbs);
      row.click();
      expect(cbs.onFileClick).toHaveBeenCalledWith("/a.ts", "a.ts");
    });

    test("double-click on file row triggers onFileDoubleClick", () => {
      const cbs = makeCallbacks();
      const file: FileEntry = {
        name: "b.ts",
        path: "/b.ts",
        isDirectory: false,
        size: 1,
        modifiedAt: 0,
      };
      const row = repoTreeRenderer.renderFileRow(file, 0, "", cbs);
      row.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
      expect(cbs.onFileDoubleClick).toHaveBeenCalledWith("/b.ts", "b.ts");
    });

    test("contextmenu on file triggers onFileContextMenu", () => {
      const cbs = makeCallbacks();
      const file: FileEntry = {
        name: "c.ts",
        path: "/c.ts",
        isDirectory: false,
        size: 1,
        modifiedAt: 0,
      };
      const row = repoTreeRenderer.renderFileRow(file, 0, "", cbs);
      row.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, clientX: 10, clientY: 20 }));
      expect(cbs.onFileContextMenu).toHaveBeenCalledWith("/c.ts", "c.ts", 10, 20);
    });

    test("selected row has selected background", () => {
      const cbs = makeCallbacks();
      const file: FileEntry = {
        name: "a.ts",
        path: "/a.ts",
        isDirectory: false,
        size: 1,
        modifiedAt: 0,
      };
      const row = repoTreeRenderer.renderFileRow(file, 0, "/a.ts", cbs);
      expect(row.style.background).toContain("rgba(74, 158, 255, 0.12)");
    });

    test("hover on file changes background", () => {
      const cbs = makeCallbacks();
      const file: FileEntry = {
        name: "a.ts",
        path: "/a.ts",
        isDirectory: false,
        size: 1,
        modifiedAt: 0,
      };
      const row = repoTreeRenderer.renderFileRow(file, 0, "", cbs);
      row.dispatchEvent(new MouseEvent("mouseenter"));
      expect(row.style.background).toBe("rgb(37, 37, 37)");
      row.dispatchEvent(new MouseEvent("mouseleave"));
      expect(row.style.background).toBe("transparent");
    });
  });

  // ── renderFileRow (directory) ──────────────────────────────────────────

  describe("renderFileRow (directory)", () => {
    test("renders a folder row with chevron and folder icon", () => {
      const cbs = makeCallbacks();
      const dir: FileEntry = {
        name: "src",
        path: "/src",
        isDirectory: true,
        size: 0,
        modifiedAt: 0,
      };
      const row = repoTreeRenderer.renderFileRow(dir, 1, "", cbs);
      expect(row.textContent).toContain("src");
      expect(row.dataset.type).toBe("folder");
    });

    test("click on folder triggers onToggleDir", () => {
      const cbs = makeCallbacks();
      const dir: FileEntry = {
        name: "src",
        path: "/src",
        isDirectory: true,
        size: 0,
        modifiedAt: 0,
      };
      const row = repoTreeRenderer.renderFileRow(dir, 0, "", cbs);
      row.click();
      expect(cbs.onToggleDir).toHaveBeenCalledWith("/src");
    });

    test("click on file does not trigger onToggleDir", () => {
      const cbs = makeCallbacks();
      const file: FileEntry = {
        name: "a.ts",
        path: "/a.ts",
        isDirectory: false,
        size: 1,
        modifiedAt: 0,
      };
      const row = repoTreeRenderer.renderFileRow(file, 0, "", cbs);
      row.click();
      expect(cbs.onToggleDir).not.toHaveBeenCalled();
    });
  });

  // ── renderRepoSection ──────────────────────────────────────────────────

  describe("renderRepoSection", () => {
    test("appends header and child wrapper when expanded", () => {
      const onToggle = vi.fn();
      const onAddWorktree = vi.fn();
      const child = document.createElement("div");
      child.textContent = "worktree-child";
      repoTreeRenderer.renderRepoSection(
        container,
        { name: "org/repo", url: "u" },
        true,
        [child],
        onToggle,
        onAddWorktree,
      );
      expect(container.textContent).toContain("org/repo");
      expect(container.textContent).toContain("worktree-child");
    });

    test("shows add worktree row when repo has name", () => {
      const onToggle = vi.fn();
      const onAddWorktree = vi.fn();
      repoTreeRenderer.renderRepoSection(
        container,
        { name: "org/repo", url: "u" },
        true,
        [],
        onToggle,
        onAddWorktree,
      );
      expect(container.textContent).toContain("add worktree");
    });

    test("add worktree click triggers callback", () => {
      const onToggle = vi.fn();
      const onAddWorktree = vi.fn();
      repoTreeRenderer.renderRepoSection(
        container,
        { name: "org/repo", url: "u" },
        true,
        [],
        onToggle,
        onAddWorktree,
      );

      // The add worktree row is the last child of the child wrapper
      const childWrapper = container.lastElementChild as HTMLElement;
      expect(childWrapper).toBeTruthy();
      expect(childWrapper.style.cssText).toContain("flex-direction");
      const addRow = childWrapper.lastElementChild as HTMLElement;
      expect(addRow).toBeTruthy();
      expect(addRow.textContent).toContain("add worktree");

      // Click the text "add worktree" inside the row — the label span
      const labelSpan = Array.from(addRow.querySelectorAll("span")).find(
        (s) => s.textContent === "add worktree",
      );
      expect(labelSpan).toBeTruthy();
      // Clicking the label span should bubble to the parent addRow
      labelSpan!.click();
      expect(onAddWorktree).toHaveBeenCalledTimes(1);
    });

    test("does not append child wrapper when collapsed", () => {
      const onToggle = vi.fn();
      const onAddWorktree = vi.fn();
      const child = document.createElement("div");
      child.textContent = "hidden-child";
      repoTreeRenderer.renderRepoSection(
        container,
        { name: "org/repo", url: "u" },
        false,
        [child],
        onToggle,
        onAddWorktree,
      );
      expect(container.textContent).toContain("org/repo");
      expect(container.textContent).not.toContain("hidden-child");
      expect(container.textContent).not.toContain("add worktree");
    });
  });

  // ── _escapeHtml ────────────────────────────────────────────────────────

  describe("_escapeHtml", () => {
    test("escapes & < > and quotes", () => {
      const result = (repoTreeRenderer as any)._escapeHtml('<a href="x&y">test</a>');
      expect(result).toBe("&lt;a href=&quot;x&amp;y&quot;&gt;test&lt;/a&gt;");
    });

    test("passes through safe strings", () => {
      const result = (repoTreeRenderer as any)._escapeHtml("hello world");
      expect(result).toBe("hello world");
    });
  });

  // ── renderCloneProgress (additional edge cases) ────────────────────────

  describe("renderCloneProgress edge cases", () => {
    test("handles empty message", () => {
      repoTreeRenderer.renderCloneProgress(container, 50, "");
      expect(container.textContent).toContain("Cloning repository...");
      const innerBar = container.querySelector("div > div > div") as HTMLElement;
      expect(innerBar.style.width).toBe("50%");
    });
  });
});
