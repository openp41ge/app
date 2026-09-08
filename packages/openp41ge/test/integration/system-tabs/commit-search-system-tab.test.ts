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
import { workspaceFileService } from "../../../src/renderer/services/workspace-file-service";
import type { WorkspaceFileData } from "../../../src/layout/types";

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
      {
        path: "src/app.ts",
        additions: 4,
        deletions: 1,
        hunks: [
          {
            header: "@@ -1 +1 @@",
            lines: [
              { type: "-", text: "import { crashy } from 'old'" },
              { type: "+", text: "import { stable } from 'new'" },
              { type: " ", text: "export function open() {" },
            ],
          },
        ],
      },
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

/** Repos connected to the test workspace. URLs derive to the fixture repo names. */
const connectedRepos: WorkspaceFileData["repos"] = [
  { url: "acme", worktrees: [] },
  { url: "globex", worktrees: [] },
  { url: "innova", worktrees: [] },
];

/** A minimal open workspace record for the controller. */
const testOpenData = (repos: WorkspaceFileData["repos"]): WorkspaceFileData =>
  ({
    id: "w1",
    name: "test",
    version: 1,
    dataDir: "/data",
    repos,
  }) as WorkspaceFileData;

type Events = { openCommit: CustomEvent[]; openFile: CustomEvent[]; openCommitFile: CustomEvent[] };

function installBridge(): { events: Events } {
  const events: Events = { openCommit: [], openFile: [], openCommitFile: [] };
  (window as unknown as { openp41ge: unknown }).openp41ge = {
    workspace: { getWindowId: () => "win-1" },
    workspaceController: {
      listRepos: vi.fn().mockResolvedValue([
        { path: "/w/acme", name: "acme", url: "git@example.com:acme.git" },
        { path: "/w/globex", name: "globex", url: "git@example.com:globex.git" },
        { path: "/w/innova", name: "innova", url: "git@example.com:innova.git" },
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
  document.addEventListener("openp41ge:open-commit-file", ((e: CustomEvent) => {
    events.openCommitFile.push(e);
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
    // The repo scope comes from the workspace repo list, not the repo-dir scan.
    workspaceFileService.openData = testOpenData(connectedRepos);
    controller = new CommitSearchSystemTabController("sys-git-test");
    controller._searchModel = new TestCommitSearchModel(fixtures);
    controller.mount(host);
  });

  afterEach(() => {
    controller.unmount();
    host.remove();
    document.removeEventListener("openp41ge:open-commit", () => {});
    workspaceFileService.openFilePath = "/w/test.openp41ge-workspace";
    workspaceFileService.openData = null;
  });

  it("mounts the search UI: main input + files toggle on one row, a filter box with a repo icon + text-filter input (no select), focused main input", async () => {
    await flush();
    await new Promise((r) => requestAnimationFrame(r));
    expect(host.textContent).not.toContain("SEARCH COMMITS");
    // The "All repos" <select> is gone — the repo scope is a text input
    // with an autocompletion dropdown.
    expect(host.querySelector("select")).toBeNull();

    // Main search row: the full-width input plus the regex + match-case
    // toggles at the end. The search-into toggles (files + content) live in
    // the filter box.
    const toggles = host.querySelectorAll<HTMLButtonElement>("[data-search-into]");
    expect(toggles.length).toBe(2);
    expect(toggles[0].dataset.searchInto).toBe("files");
    expect(toggles[1].dataset.searchInto).toBe("content");
    // Files on by default → icon rendered white (enabled); content off → grey.
    expect(toggles[0].style.color).toBe("rgb(227, 227, 227)");
    expect(toggles[1].style.color).toBe("var(--text-secondary,#888)");

    const input = host.querySelector("input[placeholder^='Search']") as HTMLInputElement;
    expect(document.activeElement).toBe(input);
    const inputRow = input.parentElement as HTMLElement;
    // The files toggle is no longer on the search row — the regex + case
    // toggles are.
    expect(inputRow.querySelectorAll("[data-search-into]").length).toBe(0);
    expect(inputRow.querySelector("[data-search-regex]")).not.toBeNull();
    expect(inputRow.querySelector("[data-search-case]")).not.toBeNull();
    // Case toggle starts off, showing the grey 'match case off' icon.
    expect(
      (inputRow.querySelector<HTMLButtonElement>("[data-search-case]") as HTMLButtonElement).style
        .color,
    ).toBe("var(--text-secondary,#888)");
    expect(
      (inputRow.querySelector<HTMLButtonElement>("[data-search-regex]") as HTMLButtonElement).style
        .color,
    ).toBe("var(--text-secondary,#888)");

    // Filter box below the search box: the funnel icon (on by default)
    // exposes a repo-filter row. A vertical separator splits the icon groups.
    const repoFilterIcon = host.querySelector<HTMLButtonElement>('[data-filter-icon="repo"]')!;
    expect(repoFilterIcon).not.toBeNull();
    expect(repoFilterIcon.style.color).toBe("rgb(227, 227, 227)");
    // The repo scope is a text field (not a <select>), with its own regex +
    // match-case toggles, flush/full-width and below the config options row.
    const repoFilter = host.querySelector<HTMLInputElement>("[data-repo-filter]")!;
    expect(repoFilter).not.toBeNull();
    expect(repoFilter.tagName).toBe("INPUT"); // text field, not a native <select>
    expect(repoFilter.placeholder).toContain("Filter repos");
    expect(host.querySelector("[data-repo-filter] select")).toBeNull();
    expect(host.querySelector("[data-repo-regex]")).not.toBeNull();
    expect(host.querySelector("[data-repo-case]")).not.toBeNull();
    // The repo filter field lives in the filter box, not on the main input row.
    expect(repoFilter.parentElement === inputRow).toBe(false);
    // The field is flush (no card/border chrome, like the main search input)
    // and shown as its own row while the funnel icon is on, separated from the
    // config-icon row above by a top border.
    const repoFilterRow = repoFilter.parentElement as HTMLElement;
    expect(repoFilterRow.style.display).toBe("flex");
    expect(repoFilterRow.style.borderTop).toBe("1px solid var(--divider,#333)");
    // The field itself is chrome-free (no border/background), just like the
    // main search input, so it reads as a full-width row rather than a box.
    expect(getComputedStyle(repoFilter).borderStyle).toBe("none");
    expect(getComputedStyle(repoFilter).backgroundColor).toBe("rgba(0, 0, 0, 0)");

    // Depth-limit options: a fixed row next to the filter icon where exactly
    // one is active — ascending numerical order; 5K (5000) default white.
    const limitOpts = host.querySelectorAll<HTMLButtonElement>("[data-limit-option]");
    expect(Array.from(limitOpts).map((b) => Number(b.dataset.limitOption))).toEqual([
      1000, 2000, 3000, 5000, 10000,
    ]);
    const fiveK = host.querySelector<HTMLButtonElement>('[data-limit-option="5000"]')!;
    expect(fiveK.style.color).toBe("rgb(227, 227, 227)"); // 5K active
    for (const b of Array.from(limitOpts)) {
      if (b === fiveK) continue;
      expect(b.style.color).toBe("var(--text-secondary,#888)"); // inactive grey
    }
    // The limit options share the wrapping config row with the filter icon —
    // grouped by the separator: [config toggles] | [limits], so each group
    // wraps as a unit when the sidebar narrows.
    const iconRow = repoFilterIcon.parentElement as HTMLElement; // config group (repo/files/content/divider)
    const limitGroup = fiveK.parentElement as HTMLElement; // limit group (buttons only)
    const configRow = iconRow.parentElement as HTMLElement;
    expect(configRow).toBe(limitGroup.parentElement);
    expect(iconRow.querySelectorAll("[data-search-into]").length).toBe(2);
    expect(iconRow.querySelector("[data-search-into]")).toBe(toggles[0]);
    expect(limitGroup.querySelectorAll("[data-limit-option]").length).toBe(5);
    // The separator trails the config group (only the middle 50% of the row
    // height), NOT the limit group — so when the row wraps the limit buttons
    // sit flush with the container's padding instead of being indented.
    expect(limitGroup.querySelector("[data-icon-separator]")).toBeNull();
    const sep = iconRow.querySelector<HTMLElement>("[data-icon-separator]");
    expect(sep).not.toBeNull();
    expect(sep!.style.height).toBe("50%");
    expect(sep!.style.alignSelf).toBe("center");
    expect(sep!.parentElement).toBe(iconRow);
    // The content toggle sits right before the divider at the end of the
    // config group.
    expect(toggles[1].parentElement).toBe(iconRow);
    expect(sep!.previousElementSibling).toBe(toggles[1]);
  });

  it("search-config buttons use custom tooltips, not a native title attr", async () => {
    const find = (sel: string) => host.querySelector<HTMLButtonElement>(sel)!;
    const configButtons = [
      find('[data-search-into="files"]'),
      find('[data-search-into="content"]'),
      find("[data-search-regex]"),
      find("[data-search-case]"),
      find('[data-filter-icon="repo"]'),
      find('[data-limit-option="5000"]'),
      find("[data-repo-regex]"),
      find("[data-repo-case]"),
    ];
    // No native tooltip anywhere on the config controls — the custom system
    // replaces it.
    for (const b of configButtons) expect(b.hasAttribute("title")).toBe(false);

    // Hovering a toggle surfaces the custom tooltip with its descriptive label.
    const caseBtn = find("[data-search-case]");
    caseBtn.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 180));
    const popup = document
      .querySelector("openp41ge-tooltip-host")
      ?.querySelector('[role="tooltip"]');
    expect(popup).not.toBeNull();
    expect(popup?.querySelector(".tt-panel")?.textContent).toContain("Match case");
    caseBtn.dispatchEvent(new MouseEvent("mouseleave", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 100));
  });

  it("depth-limit options are exclusive: clicking one activates it and searches with that maxCount", async () => {
    await search(controller, "readme");
    const model = controller["_searchModel"] as TestCommitSearchModel;
    expect(model.calls.at(-1)?.options.maxCount).toBe(5000); // default 5K

    const threeK = host.querySelector<HTMLButtonElement>('[data-limit-option="3000"]')!;
    threeK.click();
    expect(threeK.style.color).toBe("rgb(227, 227, 227)");
    const fiveK = host.querySelector<HTMLButtonElement>('[data-limit-option="5000"]')!;
    expect(fiveK.style.color).toBe("var(--text-secondary,#888)");

    await search(controller, "readme");
    expect(model.calls.at(-1)?.options.maxCount).toBe(3000);
  });

  it("replaces the whole UI with a select-a-workspace prompt when none is open, then rebuilds the search UI once one opens", async () => {
    const model = controller["_searchModel"] as TestCommitSearchModel;

    // Closing the workspace swaps the built search UI for a single prompt.
    workspaceFileService.openFilePath = null;
    document.dispatchEvent(new CustomEvent("workspace-file-changed"));
    await flush();

    const tab = host.querySelector('[data-system-tab="git"]') as HTMLElement;
    expect(tab).not.toBeNull();
    expect(tab.textContent).toContain("Select a workspace to get started");
    // The search UI is not built at all in this state.
    expect(host.querySelector("input")).toBeNull();
    expect(host.querySelector("[data-search-into]")).toBeNull();
    expect(host.querySelector("[data-repo-filter]")).toBeNull();
    expect(host.querySelector("[data-limit-option]")).toBeNull();
    // No input exists, so a search cannot even be attempted.
    expect(model.calls.length).toBe(0);

    // Opening a workspace rebuilds the full UI and search works again.
    workspaceFileService.openFilePath = "/w/test.openp41ge-workspace";
    document.dispatchEvent(new CustomEvent("workspace-file-changed"));
    await flush();

    const input = host.querySelector("input[placeholder^='Search']") as HTMLInputElement;
    expect(input).not.toBeNull();
    expect(host.querySelector("[data-repo-filter]")).not.toBeNull();
    expect(host.querySelector("[data-limit-option]")).not.toBeNull();
    await search(controller, "readme");
    expect(model.calls.at(-1)?.options.query).toBe("readme");
  });

  it("repo filter is a text field: empty means all repos, a typed name scopes the search", async () => {
    const repoFilter = host.querySelector<HTMLInputElement>("[data-repo-filter]")!;
    const model = controller["_searchModel"] as TestCommitSearchModel;

    // Empty filter → every connected repo is searched.
    await search(controller, "readme");
    expect(model.calls.at(-1)?.repoNames).toEqual(connectedRepos.map((r) => r.url));

    // A typed name scopes the search to the matching repo.
    repoFilter.value = "acme";
    repoFilter.dispatchEvent(new Event("input", { bubbles: true }));
    await search(controller, "readme");
    expect(model.calls.at(-1)?.repoNames).toEqual(["acme"]);

    // A substring matches repo names (case-insensitive by default).
    repoFilter.value = "GLOB";
    repoFilter.dispatchEvent(new Event("input", { bubbles: true }));
    await search(controller, "readme");
    expect(model.calls.at(-1)?.repoNames).toEqual(["globex"]);

    // Clearing the field returns to all repos.
    repoFilter.value = "";
    repoFilter.dispatchEvent(new Event("input", { bubbles: true }));
    await search(controller, "readme");
    expect(model.calls.at(-1)?.repoNames).toEqual(connectedRepos.map((r) => r.url));
  });

  it("repo filter regex + match-case toggles scope the repo list by pattern", async () => {
    const repoFilter = host.querySelector<HTMLInputElement>("[data-repo-filter]")!;
    const repoRegex = host.querySelector<HTMLButtonElement>("[data-repo-regex]")!;
    const repoCase = host.querySelector<HTMLButtonElement>("[data-repo-case]")!;
    const model = controller["_searchModel"] as TestCommitSearchModel;

    await search(controller, "readme");
    expect(model.calls.at(-1)?.repoNames).toEqual(connectedRepos.map((r) => r.url));

    // Regex mode: ^g matches only repos starting with "g" (globex).
    repoFilter.value = "^g";
    repoRegex.click();
    expect(repoRegex.style.color).toBe("rgb(227, 227, 227)"); // regex on
    repoFilter.dispatchEvent(new Event("input", { bubbles: true }));
    await search(controller, "readme");
    expect(model.calls.at(-1)?.repoNames).toEqual(["globex"]);

    // Case-sensitive (off by default) — "GLOB" matches globex case-insensitively.
    repoFilter.value = "GLOB";
    repoFilter.dispatchEvent(new Event("input", { bubbles: true }));
    await search(controller, "readme");
    expect(model.calls.at(-1)?.repoNames).toEqual(["globex"]);

    repoCase.click();
    expect(repoCase.style.color).toBe("rgb(227, 227, 227)"); // case on
    repoFilter.dispatchEvent(new Event("input", { bubbles: true }));
    await search(controller, "readme");
    // Case-sensitive regex "GLOB" no longer matches the lowercase "globex"
    // repo, so the scope is empty and no search is dispatched — the no-match
    // hint is shown instead.
    expect(host.textContent).toContain("No repos match the filter");
  });

  it("repo filter matching no repo renders a no-repos-match hint and never searches", async () => {
    const repoFilter = host.querySelector<HTMLInputElement>("[data-repo-filter]")!;
    const model = controller["_searchModel"] as TestCommitSearchModel;

    repoFilter.value = "zzz-no-such-repo";
    repoFilter.dispatchEvent(new Event("input", { bubbles: true }));
    await search(controller, "readme");

    expect(host.textContent).toContain("No repos match the filter");
    // No search is dispatched for an empty repo scope.
    const callsBefore = model.calls.length;
    await search(controller, "readme");
    expect(model.calls.length).toBe(callsBefore);
  });

  it("toggling the repo filter icon off hides the row and searches all repos", async () => {
    const repoFilterIcon = host.querySelector<HTMLButtonElement>('[data-filter-icon="repo"]')!;
    const repoFilter = host.querySelector<HTMLInputElement>("[data-repo-filter]")!;
    // A typed scope that is ignored once the filter is toggled off.
    repoFilter.value = "acme";
    repoFilter.dispatchEvent(new Event("input", { bubbles: true }));

    repoFilterIcon.click();
    expect(repoFilterIcon.style.color).toBe("var(--text-secondary,#888)"); // grey = off
    expect(repoFilter.parentElement?.style.display).toBe("none");

    await search(controller, "readme");
    const model = controller["_searchModel"] as TestCommitSearchModel;
    // Filter off = "all repos", which means every workspace-connected repo.
    expect(model.calls.at(-1)?.repoNames).toEqual(connectedRepos.map((r) => r.url));

    repoFilterIcon.click();
    expect(repoFilter.parentElement?.style.display).toBe("flex");
  });

  it("regex and match-case toggles re-run the search with their flags", async () => {
    const model = controller["_searchModel"] as TestCommitSearchModel;
    await search(controller, "readme");
    expect(model.calls.at(-1)?.options.caseSensitive).toBe(false);
    expect(model.calls.at(-1)?.options.regex).toBe(false);

    const regexBtn = host.querySelector<HTMLButtonElement>("[data-search-regex]")!;
    const caseBtn = host.querySelector<HTMLButtonElement>("[data-search-case]")!;
    regexBtn.click(); // regex on → icon white
    caseBtn.click(); // case on → icon white
    expect(regexBtn.style.color).toBe("rgb(227, 227, 227)");
    expect(caseBtn.style.color).toBe("rgb(227, 227, 227)");

    await search(controller, "readme");
    expect(model.calls.at(-1)?.options.regex).toBe(true);
    expect(model.calls.at(-1)?.options.caseSensitive).toBe(true);

    regexBtn.click();
    caseBtn.click();
    await search(controller, "readme");
    expect(model.calls.at(-1)?.options.regex).toBe(false);
    expect(model.calls.at(-1)?.options.caseSensitive).toBe(false);
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
    // Only the files+content toggles exist — commit-message search can't be
    // switched off; content only adds a third dimension.
    expect(host.querySelectorAll("[data-search-into]").length).toBe(2);

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
    const repoFilter = host.querySelector<HTMLInputElement>("[data-repo-filter]")!;
    repoFilter.value = "innova";
    repoFilter.dispatchEvent(new Event("input", { bubbles: true }));
    await search(controller, "engine");
    const model = controller["_searchModel"] as TestCommitSearchModel;
    expect(model.calls.at(-1)?.repoNames).toEqual(["innova"]); // scoped via the repo filter

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
    const repoFilter = host.querySelector<HTMLInputElement>("[data-repo-filter]")!;
    repoFilter.value = "innova";
    repoFilter.dispatchEvent(new Event("input", { bubbles: true }));
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

  it("file sub-row click emits openp41ge:open-commit-file (preview) — file at the revision, never working-tree", async () => {
    await search(controller, "a");
    let row = host.querySelector<HTMLElement>("[data-commit-row]")!;
    row.click();
    await flush();
    row = host.querySelector<HTMLElement>("[data-commit-row]")!;

    const fileRow = host.querySelector<HTMLElement>(".commit-file-row")!;
    fileRow.click();
    expect(events.openCommitFile).toHaveLength(1);
    expect(events.openCommitFile[0].detail).toMatchObject({
      repoName: "acme",
      hash: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      path: "src/app.ts",
      pinned: false,
    });
    // The old working-tree open-file path is NOT used for git search files.
    expect(events.openFile).toHaveLength(0);
    // No hunk content is ever rendered below the file row in the sidebar.
    expect(host.querySelector(".commit-hunk-block")).toBeNull();
  });

  it("file sub-row double-click / Enter emit openp41ge:open-commit-file pinned", async () => {
    await search(controller, "a");
    host.querySelector<HTMLElement>("[data-commit-row]")!.click();
    await flush();
    const fileRow = host.querySelector<HTMLElement>(".commit-file-row")!;

    fileRow.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    expect(events.openCommitFile.at(-1)?.detail.pinned).toBe(true);

    fileRow.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(events.openCommitFile.at(-1)?.detail.pinned).toBe(true);
    expect(events.openCommitFile.at(-1)?.detail.path).toBe("src/app.ts");
  });

  it("renders a no-results message when nothing matches", async () => {
    await search(controller, "zzz-no-match");
    expect(host.textContent).toContain("No matching commits");
    expect(host.querySelector("[data-commit-row]")).toBeNull();
  });

  it("renders a no-repos hint before any search when the workspace has no connected repos", async () => {
    workspaceFileService.openData = testOpenData([]);
    controller.unmount();
    controller = new CommitSearchSystemTabController("sys-git-test");
    controller._searchModel = new TestCommitSearchModel(fixtures);
    controller.mount(host);
    await flush();
    expect(host.textContent).toContain("No repositories to search");
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

  it("content toggle sends content:true on the next search; sidebar never renders hunk content", async () => {
    const toggle = host.querySelector<HTMLButtonElement>('[data-search-into="content"]')!;
    expect(toggle).not.toBeNull();
    expect(toggle.style.color).toBe("var(--text-secondary,#888)"); // off

    // Off → search runs WITHOUT the content dimension.
    await search(controller, "readme");
    const model = controller["_searchModel"] as TestCommitSearchModel;
    expect(model.calls.at(-1)?.options.content).toBeFalsy();

    // Expand a commit and activate a file — the sidebar must only ever hold
    // the search results; no diff/hunk content is rendered below the rows.
    host.querySelector<HTMLElement>("[data-commit-row]")!.click();
    await flush();
    const fileRow = [...host.querySelectorAll<HTMLElement>(".commit-file-row")].find((r) =>
      r.textContent?.includes("README.md"),
    )!;
    fileRow.click();
    await flush();
    expect(events.openCommitFile.at(-1)?.detail.path).toBe("README.md");
    expect(host.querySelector(".commit-hunk-block")).toBeNull();

    // Toggle on → grey becomes white; a re-search carries content:true. The
    // content dimension only affects WHICH commits match — still no sidebar
    // hunk content, and activation still opens the reverse diff pane.
    toggle.click();
    expect(toggle.style.color).toBe("rgb(227, 227, 227)");
    await search(controller, "readme");
    expect(model.calls.at(-1)?.options).toMatchObject({ content: true });
    expect(host.querySelector(".commit-hunk-block")).toBeNull();
  });

  it("excludes leftover repos that exist on disk but are not in the workspace repo list", async () => {
    // The repo-dir scan also sees an "orphan" folder, but the scope is the
    // workspace repo list — orphan must never appear in a search scope.
    (window.openp41ge.workspaceController.listRepos as ReturnType<typeof vi.fn>).mockResolvedValue([
      { path: "/w/acme", name: "acme", url: "git@example.com:acme.git" },
      { path: "/w/orphan", name: "orphan", url: "git@example.com:orphan.git" },
      { path: "/w/globex", name: "globex", url: "git@example.com:globex.git" },
      { path: "/w/innova", name: "innova", url: "git@example.com:innova.git" },
    ]);
    controller.unmount();
    controller = new CommitSearchSystemTabController("sys-git-test");
    controller._searchModel = new TestCommitSearchModel(fixtures);
    controller.mount(host);
    await flush();

    const repoFilter = host.querySelector<HTMLInputElement>("[data-repo-filter]")!;
    // A filter matching only the orphan finds no connected repo — the orphan is
    // never part of the workspace scope, so no search is dispatched.
    repoFilter.value = "orph";
    repoFilter.dispatchEvent(new Event("input", { bubbles: true }));
    await search(controller, "readme");
    expect(host.textContent).toContain("No repos match the filter");

    // With an empty filter, the search scope is exactly the workspace repo list
    // (never the orphan).
    repoFilter.value = "";
    repoFilter.dispatchEvent(new Event("input", { bubbles: true }));
    await search(controller, "readme");
    const model = controller["_searchModel"] as TestCommitSearchModel;
    expect(model.calls.at(-1)?.repoNames).toEqual(connectedRepos.map((r) => r.url));
    expect(model.calls.at(-1)?.repoNames).not.toContain("orphan");
  });

  it("does not dispatch a search when the workspace has no connected repos", async () => {
    workspaceFileService.openData = testOpenData([]);
    controller.unmount();
    controller = new CommitSearchSystemTabController("sys-git-test");
    const model = new TestCommitSearchModel(fixtures);
    controller._searchModel = model;
    controller.mount(host);
    await flush();

    const input = host.querySelector("input[placeholder^='Search']") as HTMLInputElement;
    expect(input).not.toBeNull();
    input.value = "readme";
    pressEnter(input);
    await flush();

    expect(model.calls.length).toBe(0); // no search dispatched
    expect(host.textContent).toContain("No repositories to search");
  });
});
