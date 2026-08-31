/**
 * Unit tests for GitRepositoryController file-row clicks — the "Files
 * changed (n)" rows open in the NEXT cell (right of the git pane) as an
 * UNPINNED commit-file-diff preview, so clicking another file swaps it.
 *
 * The controller dispatches the existing `openp41ge:open-commit-file` event
 * with an explicit `col` (git pane col + 1) and `mode: "preview"` — the
 * platform's preview-slot machinery handles fill/replace + pin-on-second-click.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { GitRepositoryController } from "../../../src/renderer/apps/git-repository/git-repository-controller";

interface FiredEvent {
  type: string;
  detail: Record<string, unknown>;
}

function makeWorkspace(col = 0, cols = 1): unknown {
  return {
    windows: [
      {
        id: "win-1",
        grid: {
          rows: 1,
          cols,
          placements: [
            { position: { row: 0, col }, tabIds: ["tab-git"] },
          ],
        },
      },
    ],
  };
}

/** Stub window.openp41ge so the controller can read its own column, and
 * capture the dispatched open-commit-file event. */
function installBridge(state: unknown): FiredEvent[] {
  const fired: FiredEvent[] = [];
  document.addEventListener(
    "openp41ge:open-commit-file",
    ((e: CustomEvent) => {
      fired.push({ type: e.type, detail: (e.detail ?? {}) as Record<string, unknown> });
    }) as EventListener,
  );
  (window as unknown as Record<string, unknown>).openp41ge = {
    workspace: {
      getWindowId: () => "win-1",
      getState: () => Promise.resolve(JSON.stringify(state)),
    },
  };
  return fired;
}

function makeController(repoName: string, data: Record<string, unknown>): GitRepositoryController {
  const c = new GitRepositoryController("tab-git", "git-repository");
  (c as unknown as { repoName: string }).repoName = repoName;
  (c as unknown as { _data: Record<string, unknown> | null })._data = data;
  return c;
}

/** Fire a git-file-row-click like the <git-repository-panel> component does. */
function fileRowClick(c: GitRepositoryController, filePath: string): void {
  c._onFileRowClick(new CustomEvent("git-file-row-click", { detail: { filePath } }));
}

describe("GitRepositoryController file-row click", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("opens an unpinned commit-file-diff preview in the NEXT cell (right of the git pane)", async () => {
    const fired = installBridge(makeWorkspace(0, 1));
    const c = makeController("github.com/acme/repo", {
      selectedCommit: "abc123",
      commits: [],
      branches: [],
    });

    fileRowClick(c, "src/app.ts");

    await new Promise((r) => setTimeout(r, 0));
    expect(fired.length).toBe(1);
    expect(fired[0].detail).toEqual({
      repoName: "github.com/acme/repo",
      hash: "abc123",
      path: "src/app.ts",
      name: "app.ts",
      col: 1,
      mode: "preview",
    });
  });

  it("uses the git pane's actual column + 1 (pane not in col 0)", async () => {
    const fired = installBridge(makeWorkspace(2, 3));
    const c = makeController("acme", {
      selectedCommit: "def456",
      commits: [],
      branches: [],
    });

    fileRowClick(c, "lib/mod.ts");

    await new Promise((r) => setTimeout(r, 0));
    expect(fired[0].detail.col).toBe(3);
  });

  it("falls back to the branch tip hash when no commit is selected", async () => {
    const fired = installBridge(makeWorkspace(0, 1));
    const c = makeController("acme", {
      selectedCommit: null,
      commits: [{ hash: "tip123" }],
      branches: [],
    });

    fileRowClick(c, "readme.md");

    await new Promise((r) => setTimeout(r, 0));
    expect(fired[0].detail.hash).toBe("tip123");
  });

  it("resolves rename rows (old => new) to the new path", async () => {
    const fired = installBridge(makeWorkspace(0, 1));
    const c = makeController("acme", {
      selectedCommit: "abc123",
      commits: [],
      branches: [],
    });

    fileRowClick(c, "old.txt => new.txt");

    await new Promise((r) => setTimeout(r, 0));
    expect(fired[0].detail.path).toBe("new.txt");
    expect(fired[0].detail.name).toBe("new.txt");
  });

  it("still opens in the next cell when the workspace state cannot be read", async () => {
    const fired: FiredEvent[] = [];
    document.addEventListener(
      "openp41ge:open-commit-file",
      ((e: CustomEvent) => {
        fired.push({ type: e.type, detail: (e.detail ?? {}) as Record<string, unknown> });
      }) as EventListener,
    );
    (window as unknown as Record<string, unknown>).openp41ge = {
      workspace: {
        getWindowId: () => "win-1",
        getState: () => Promise.reject(new Error("boom")),
      },
    };
    const c = makeController("acme", { selectedCommit: "abc", commits: [] });

    fileRowClick(c, "x.ts");

    await new Promise((r) => setTimeout(r, 0));
    // Fallback assumes the git pane is in col 0 → next cell is col 1.
    expect(fired[0].detail.col).toBe(1);
  });

  it("does nothing without a file path or without a diff context hash", async () => {
    const fired = installBridge(makeWorkspace(0, 1));
    const noPath = makeController("acme", { selectedCommit: "abc", commits: [] });
    const noHash = makeController("acme", { selectedCommit: null, commits: [] });

    fileRowClick(noPath, "   ");
    fileRowClick(noHash, "x.ts");

    await new Promise((r) => setTimeout(r, 0));
    expect(fired.length).toBe(0);
  });
});
