/**
 * Integration tests for CommitSearchSystemTabController — the Git sidebar
 * commit-search panel (registration id `"git"`).
 *
 * Mounts the controller with an injected TestCommitSearchModel (the DI seam)
 * and verifies: repo scope options, search run (Enter), hierarchical commit →
 * file rows, single/double-click preview events, empty/error states, and
 * unmount keep-alive contract.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { CommitSearchSystemTabController } from "../../../src/renderer/apps/system-tabs/commit-search-system-tab";
import { TestCommitSearchModel } from "../../../src/renderer/models/commit-search-model";

const fixtures = [
  {
    repoName: "acme",
    hash: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    shortHash: "aaaaaaa",
    message: "fix: resolve crash on open",
    author: "A",
    date: "2026-01-01",
    relativeDate: "2 days ago",
    files: [
      { path: "src/app.ts", additions: 4, deletions: 1 },
      { path: "src/util/helper.ts", additions: 2, deletions: 0 },
    ],
  },
  {
    repoName: "globex",
    hash: "cccccccccccccccccccccccccccccccccccccccc",
    shortHash: "ccccccc",
    message: "docs: update readme",
    author: "C",
    date: "2026-01-03",
    relativeDate: "12 hours ago",
    files: [{ path: "README.md", additions: 5, deletions: 2 }],
  },
];

type Events = { openCommit: CustomEvent[]; openFile: CustomEvent[] };

function installBridge(): { events: Events } {
  const events: Events = { openCommit: [], openFile: [] };
  (window as unknown as { openp41ge: unknown }).openp41ge = {
    workspace: { getWindowId: () => "win-1" },
    workspaceController: {
      listRepos: vi.fn().mockResolvedValue([
        { path: "/w/acme", name: "acme", url: "git@example.com:acme.git" },
        { path: "/w/globex", name: "globex", url: "git@example.com:globex.git" },
      ]),
      searchCommits: vi.fn(),
    },
    file: { readRange: vi.fn() },
  } as unknown as typeof window.openp41ge;
  document.addEventListener("openp41ge:open-commit", ((e: CustomEvent) => {
    events.openCommit.push(e);
  }) as EventListener);
  document.addEventListener("openp41ge:open-file", ((e: CustomEvent) => {
    events.openFile.push(e);
  }) as EventListener);
  return { events };
}

const flush = () => new Promise((r) => setTimeout(r, 10));

function pressEnter(input: HTMLInputElement): void {
  input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
}

async function search(controller: CommitSearchSystemTabController, query: string): Promise<void> {
  const input = controller["_input"] as HTMLInputElement;
  input.value = query;
  pressEnter(input);
  await flush();
}

describe("CommitSearchSystemTabController", () => {
  let host: HTMLElement;
  let controller: CommitSearchSystemTabController;
  let events: Events;

  beforeEach(() => {
    events = installBridge().events;
    host = document.createElement("div");
    document.body.appendChild(host);
    controller = new CommitSearchSystemTabController("sys-git-test");
    controller._searchModel = new TestCommitSearchModel(fixtures);
    controller.mount(host);
  });

  afterEach(() => {
    controller.unmount();
    host.remove();
    document.removeEventListener("openp41ge:open-commit", () => {});
  });

  it("mounts the search UI: one files icon toggle (on by default), scope options (All repos + each repo), focused full-width input, no header", async () => {
    await flush();
    await new Promise((r) => requestAnimationFrame(r));
    expect(host.textContent).not.toContain("SEARCH COMMITS");
    const toggles = host.querySelectorAll<HTMLButtonElement>("[data-search-into]");
    // The commits toggle is gone — only the files icon remains.
    expect(toggles.length).toBe(1);
    expect(toggles[0].dataset.searchInto).toBe("files");
    // Files on by default → icon rendered white (enabled); jsdom normalises #e3e3e3.
    expect(toggles[0].style.color).toBe("rgb(227, 227, 227)");
    const scope = host.querySelector("select") as HTMLSelectElement;
    const options = Array.from(scope.options).map((o) => o.value);
    expect(options).toEqual(["", "acme", "globex"]);
    const input = host.querySelector("input") as HTMLInputElement;
    expect(document.activeElement).toBe(input);
    // input shares a row with the files toggle; the scope select sits below in searchBox
    const inputRow = input.parentElement as HTMLElement;
    expect(inputRow.querySelectorAll("[data-search-into]").length).toBe(1);
    expect(inputRow !== scope.parentElement).toBe(true);
  });

  it("runs a search on Enter and renders hierarchical commit rows", async () => {
    await search(controller, "readme");
    const model = controller["_searchModel"] as TestCommitSearchModel;
    expect(model.calls.length).toBe(1);
    // Files toggle on by default (commit messages always searched) → combined search.
    expect(model.calls[0].options.in).toBe("all");
    expect(host.querySelector("[data-commit-row]")).not.toBeNull();
    expect(host.textContent).toContain("globex");
    expect(host.textContent).toContain("docs: update readme");
  });

  it("combined ('all') search returns a commit when only a file path matches (not the message)", async () => {
    // "helper.ts" appears only as a file path, never in a message — combined
    // mode must still surface the commit.
    await search(controller, "helper.ts");
    const model = controller["_searchModel"] as TestCommitSearchModel;
    expect(model.calls[0].options.in).toBe("all");
    expect(host.textContent).toContain("resolve crash on open");
    expect(host.querySelector("[data-commit-row]")).not.toBeNull();
  });

  it("the files toggle is on by default — searches run in combined message + file mode ('all')", async () => {
    await search(controller, "readme");
    const model = controller["_searchModel"] as TestCommitSearchModel;
    expect(model.calls.length).toBe(1);
    expect(model.calls[0].options.in).toBe("all");
  });

  it("toggling the Files icon off restricts search to commit messages only; back on restores combined", async () => {
    const filesBtn = host.querySelector<HTMLButtonElement>('[data-search-into="files"]')!;
    // Only the files toggle exists — commit-message search can't be switched off.
    expect(host.querySelectorAll("[data-search-into]").length).toBe(1);

    await search(controller, "readme");
    const model = controller["_searchModel"] as TestCommitSearchModel;
    expect(model.calls[model.calls.length - 1].options.in).toBe("all");

    filesBtn.click();
    expect(filesBtn.style.color).toBe("var(--text-secondary,#888)"); // grey = off
    await search(controller, "readme");
    expect(model.calls[model.calls.length - 1].options.in).toBe("message");

    filesBtn.click();
    await search(controller, "readme");
    expect(model.calls[model.calls.length - 1].options.in).toBe("all");
  });

  it("single-click on a commit emits openp41ge:open-commit with pinned:false (preview)", async () => {
    await search(controller, "readme");
    const row = host.querySelector<HTMLElement>("[data-commit-row]")!;
    row.click();
    expect(events.openCommit).toHaveLength(1);
    expect(events.openCommit[0].detail).toMatchObject({
      repoName: "globex",
      pinned: false,
    });
  });

  it("double-click on a commit emits openp41ge:open-commit with pinned:true", async () => {
    await search(controller, "readme");
    const row = host.querySelector<HTMLElement>("[data-commit-row]")!;
    row.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    expect(events.openCommit).toHaveLength(1);
    expect(events.openCommit[0].detail.pinned).toBe(true);
  });

  it("chevron expands file sub-rows with +adds/−dels", async () => {
    await search(controller, "a");
    const row = host.querySelector<HTMLElement>("[data-commit-row]")!;
    expect(host.querySelectorAll(".commit-file-row").length).toBe(0);

    // Click the chevron (first span inside the head).
    const chevron = row.querySelector("span") as HTMLSpanElement;
    chevron.click();
    await flush();

    expect(host.querySelectorAll(".commit-file-row").length).toBe(2);
    expect(host.textContent).toContain("src/app.ts");
    expect(host.textContent).toContain("+4");
    expect(host.textContent).toContain("−1");
  });

  it("file sub-row click emits openp41ge:open-file with pinned:false (working-tree preview)", async () => {
    await search(controller, "a");
    const row = host.querySelector<HTMLElement>("[data-commit-row]")!;
    (row.querySelector("span") as HTMLSpanElement).click();
    await flush();

    const fileRow = host.querySelector<HTMLElement>(".commit-file-row")!;
    fileRow.click();
    expect(events.openFile).toHaveLength(1);
    expect(events.openFile[0].detail).toMatchObject({ path: "src/app.ts", pinned: false });
  });

  it("renders a no-results message when nothing matches", async () => {
    await search(controller, "zzz-no-match");
    expect(host.textContent).toContain("No matching commits");
    expect(host.querySelector("[data-commit-row]")).toBeNull();
  });

  it("renders a no-repos hint before any search when no repos exist", async () => {
    (window.openp41ge.workspaceController.listRepos as ReturnType<typeof vi.fn>).mockResolvedValue(
      [],
    );
    controller.unmount();
    controller = new CommitSearchSystemTabController("sys-git-test");
    controller._searchModel = new TestCommitSearchModel(fixtures);
    controller.mount(host);
    await flush();
    expect(host.textContent).toContain("No repos");
  });

  it("shows a search-failure message when the model throws", async () => {
    const bad = new TestCommitSearchModel([]);
    bad.search = vi.fn().mockRejectedValue(new Error("git exploded"));
    controller._searchModel = bad;
    await search(controller, "whatever");
    expect(host.textContent).toContain("Search failed: git exploded");
  });

  it("Escape clears the query then blurs; unmount removes the view and stops git:refresh", async () => {
    const input = host.querySelector("input") as HTMLInputElement;
    input.value = "abc";
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(input.value).toBe("");
    expect(host.textContent).toContain("Type to search");

    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(input === document.activeElement).toBe(false);

    expect(host.children.length).toBeGreaterThan(0);
    controller.unmount();
    expect(host.children.length).toBe(0);
    // After unmount, a git:refresh must not resurrect content.
    document.dispatchEvent(new CustomEvent("git:refresh", { bubbles: true }));
    await flush();
    expect(host.children.length).toBe(0);
  });
});
