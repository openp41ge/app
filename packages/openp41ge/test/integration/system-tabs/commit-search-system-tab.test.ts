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
  {
    // Long message with TWO message hits + one file-path hit — exercises the
    // match-context window, the "+ N more instances" meta line, and the
    // "matched file" indicator.
    repoName: "innova",
    hash: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    shortHash: "bbbbbbb",
    message:
      "feat: wiring plus a very long commit subject here to force the window around the engine marker way out here near the tail (engine goes here twice) so the highlighted hit stays visible close to the end plus trailing filler beyond the window plus more filler tails",
    author: "B",
    date: "2026-02-01",
    relativeDate: "1 week ago",
    files: [
      { path: "src/engine/core.ts", additions: 3, deletions: 5 },
      { path: "README.md", additions: 1, deletions: 0 },
    ],
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

  it("single-click on a commit toggles its file sub-rows open/closed (no preview event)", async () => {
    await search(controller, "readme");
    let row = host.querySelector<HTMLElement>("[data-commit-row]")!;
    expect(host.querySelectorAll(".commit-file-row").length).toBe(0);
    row.click();
    await flush();
    expect(host.querySelectorAll(".commit-file-row").length).toBeGreaterThan(0);
    expect(events.openCommit).toHaveLength(0); // click expands, it no longer previews

    row = host.querySelector<HTMLElement>("[data-commit-row]")!;
    row.click();
    await flush();
    expect(host.querySelectorAll(".commit-file-row").length).toBe(0);
  });

  it("double-click on a commit emits openp41ge:open-commit with pinned:true", async () => {
    await search(controller, "readme");
    const row = host.querySelector<HTMLElement>("[data-commit-row]")!;
    row.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    expect(events.openCommit).toHaveLength(1);
    expect(events.openCommit[0].detail.pinned).toBe(true);
  });

  it("clicking a commit row expands file sub-rows with +adds/−dels", async () => {
    await search(controller, "a");
    let row = host.querySelector<HTMLElement>("[data-commit-row]")!;
    expect(host.querySelectorAll(".commit-file-row").length).toBe(0);

    row.click();
    await flush();
    row = host.querySelector<HTMLElement>("[data-commit-row]")!;

    expect(host.querySelectorAll(".commit-file-row").length).toBe(2);
    expect(host.textContent).toContain("src/app.ts");
    expect(host.textContent).toContain("+4");
    expect(host.textContent).toContain("−1");
  });

  it("commit rows carry drag markers (git-commit-search scoped to the commit) and a two-line layout", async () => {
    await search(controller, "readme");
    const row = host.querySelector<HTMLElement>("[data-commit-row]")!;
    // Distinct from explorer repo rows so the drop opens git-commit-search.
    expect(row.getAttribute("data-git-search-result")).not.toBeNull();
    expect(row.getAttribute("data-repo-row")).not.toBeNull();
    expect(row.getAttribute("data-repo")).toBe("globex");
    expect(row.getAttribute("data-hash")).toBe("cccccccccccccccccccccccccccccccccccccccc");
    expect(row.getAttribute("data-short-hash")).toBe("ccccccc");
    // [repo] [commit id] on top and the message on its own (truncated) line.
    expect(host.textContent).toContain("globex");
    expect(host.textContent).toContain("ccccccc");
    expect(host.textContent).toContain("docs: update readme");

    // Falling counter: the file sub-row also carries the search markers.
    row.click();
    await flush();
    const fileRow = host.querySelector<HTMLElement>(".commit-file-row")!;
    expect(fileRow.getAttribute("data-git-search-result")).not.toBeNull();
    expect(fileRow.getAttribute("data-hash")).toBe("cccccccccccccccccccccccccccccccccccccccc");
  });

  it("commit rows use the explorer chevrons (chevron-right folded, chevron-down expanded)", async () => {
    await search(controller, "readme");
    let row = host.querySelector<HTMLElement>("[data-commit-row]")!;
    const icon = (row.querySelector("openp41ge-icon") as HTMLElement | null)!;
    expect(icon.getAttribute("name")).toBe("chevron-right");

    row.click();
    await flush();
    row = host.querySelector<HTMLElement>("[data-commit-row]")!;
    const icon2 = row.querySelector("openp41ge-icon") as HTMLElement | null;
    expect(icon2?.getAttribute("name")).toBe("chevron-down");
  });

  it("message line windows around the search hit, highlights it, and shows the +N more / matched-file meta", async () => {
    const scope = host.querySelector("select") as HTMLSelectElement;
    scope.value = "innova";
    await search(controller, "engine");

    // The hit is highlighted inline…
    const hit = host.querySelector(".commit-result-row .search-hit") as HTMLElement | null;
    expect(hit).not.toBeNull();
    expect(hit?.textContent).toBe("engine");
    // …and the window starts mid-message (leading ellipsis) so the tail hit is
    // visible rather than only the message's beginning.
    const row = host.querySelector<HTMLElement>("[data-commit-row]")!;
    expect(row.textContent).toContain("\u2026"); // truncated context either side
    // Optional third line: repeated hits + a file-path match.
    expect(row.textContent).toContain("+ 1 more instance");
    expect(row.textContent).toContain("matched file: src/engine/core.ts");
  });

  it("file sub-rows get coloured +adds/−dels and highlight the matched path", async () => {
    const scope = host.querySelector("select") as HTMLSelectElement;
    scope.value = "innova";
    await search(controller, "engine");
    const row = host.querySelector<HTMLElement>("[data-commit-row]")!;
    row.click();
    await flush();

    const adds = host.querySelector(".commit-adds") as HTMLElement | null;
    const dels = host.querySelector(".commit-dels") as HTMLElement | null;
    expect(adds?.textContent).toBe("+3");
    expect(adds?.style.color).toBe("rgb(63, 185, 80)"); // #3fb950
    expect(dels?.textContent).toBe("\u22125");
    expect(dels?.style.color).toBe("rgb(248, 81, 73)"); // #f85149

    // The matched file path is highlighted inside its sub-row.
    const fileHit = host.querySelector(".commit-file-row .search-hit") as HTMLElement | null;
    expect(fileHit).not.toBeNull();
    expect(fileHit?.textContent).toBe("engine");
  });

  it("hover highlight is per-row: the header block and each file row, not the whole container", () => {
    const styleText = (host.querySelector("style") as HTMLStyleElement).textContent;
    expect(styleText).toContain(".commit-result-head:hover");
    expect(styleText).toContain(".commit-file-row:hover");
    expect(styleText).not.toContain(".commit-result-row:hover");
  });

  it("file sub-row click emits openp41ge:open-file with pinned:false (working-tree preview)", async () => {
    await search(controller, "a");
    let row = host.querySelector<HTMLElement>("[data-commit-row]")!;
    row.click();
    await flush();
    row = host.querySelector<HTMLElement>("[data-commit-row]")!;

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
