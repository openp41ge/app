/**
 * Unit tests for CommitSearchModel — the Git sidebar commit-search DI seam.
 *
 * TestCommitSearchModel filters an in-memory fixture with the same
 * message/path substring semantics as the main-process implementation (so the
 * controller can be tested with no git/electron). IpcCommitSearchModel
 * delegates to the preload bridge.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  TestCommitSearchModel,
  IpcCommitSearchModel,
  type CommitSearchModel,
} from "../../../src/renderer/models/commit-search-model";

function fixture(): ReturnType<typeof makeCommits>["all"] {
  return makeCommits().all;
}

function makeCommits() {
  const all = [
    {
      repoName: "acme",
      hash: "aaa1",
      shortHash: "aaa1",
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
              header: "@@ -1,5 +1,8 @@",
              lines: [
                { type: "-", text: "import { crashy } from 'old'" },
                { type: "+", text: "import { stable } from 'new'" },
                { type: " ", text: "export function open() {" },
                { type: "+", text: "  // widget wiring" },
              ],
            },
          ],
        },
        { path: "src/util/helper.ts", additions: 2, deletions: 0 },
      ],
    },
    {
      repoName: "acme",
      hash: "bbb2",
      shortHash: "bbb2",
      message: "feat: add search sidebar",
      author: "B",
      date: "2026-01-02",
      relativeDate: "1 day ago",
      files: [{ path: "src/panel/search.ts", additions: 40, deletions: 0 }],
    },
    {
      repoName: "globex",
      hash: "ccc3",
      shortHash: "ccc3",
      message: "docs: update readme",
      author: "C",
      date: "2026-01-03",
      relativeDate: "12 hours ago",
      files: [{ path: "README.md", additions: 5, deletions: 2 }],
    },
  ];
  return { all };
}

describe("TestCommitSearchModel", () => {
  let model: TestCommitSearchModel;

  beforeEach(() => {
    model = new TestCommitSearchModel(fixture());
  });

  it("message scope filters by message substring (case-insensitive), all repos", async () => {
    const results = await model.search(null, { query: "SEARCH", in: "message" });
    expect(results).toHaveLength(1);
    expect(results[0].shortHash).toBe("bbb2");
  });

  it("files scope filters by file path", async () => {
    const results = await model.search(null, { query: "helper", in: "files" });
    expect(results).toHaveLength(1);
    expect(results[0].shortHash).toBe("aaa1");
  });

  it("all scope matches message OR file path", async () => {
    const results = await model.search(null, { query: "readme", in: "all" });
    expect(results).toHaveLength(1);
    expect(results[0].repoName).toBe("globex");
  });

  it("repoNames narrow to a set of repos", async () => {
    const results = await model.search(["acme", "globex"], { query: "a", in: "all" });
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((c) => c.repoName === "acme" || c.repoName === "globex")).toBe(true);
  });

  it("records every call (scope + options) for controller assertions", async () => {
    await model.search(["acme"], { query: "fix", in: "message", limit: 10 });
    await model.search(null, { query: "docs", in: "files" });

    expect(model.calls).toEqual([
      { repoNames: ["acme"], options: { query: "fix", in: "message", limit: 10 } },
      { repoNames: null, options: { query: "docs", in: "files" } },
    ]);
  });

  it("applies offset/limit", async () => {
    const all = await model.search(null, { query: "", in: "message" });
    expect(all).toEqual([]); // empty query → no results

    const paged = await model.search(null, { query: "a", in: "all", limit: 1, offset: 0 });
    expect(paged).toHaveLength(1);
  });

  it("empty query returns no results without touching fixtures", async () => {
    const results = await model.search(null, { query: "   ", in: "all" });
    expect(results).toEqual([]);
  });

  it("content on finds commits by changed LINES when no message/path matches", async () => {
    // "widget" appears only in aaa1's changed line — never in a message or
    // file path.
    const without = await model.search(null, { query: "widget", in: "message" });
    expect(without).toEqual([]);

    const withContent = await model.search(null, {
      query: "widget",
      in: "message",
      content: true,
    });
    expect(withContent.map((r) => r.shortHash)).toEqual(["aaa1"]);
  });

  it("content adds to (never replaces) message/path hits in every scope", async () => {
    // "crash" matches aaa1's MESSAGE too; content must not drop it nor the
    // path-only globex "README.md" hit in all scope.
    const all = await model.search(null, { query: "readme", in: "all", content: true });
    expect(all.map((r) => r.shortHash)).toEqual(["ccc3"]);

    const msg = await model.search(null, { query: "crash", in: "message", content: true });
    expect(msg.map((r) => r.shortHash)).toEqual(["aaa1"]);
  });
});

describe("IpcCommitSearchModel", () => {
  beforeEach(() => {
    (window as unknown as { openp41ge: any }).openp41ge = undefined;
  });

  it("delegates to window.openp41ge.workspaceController.searchCommits", async () => {
    const stub = vi.fn().mockResolvedValue([{ shortHash: "x" }]);
    (window as unknown as { openp41ge: any }).openp41ge = {
      workspaceController: { searchCommits: stub },
    };

    const model: CommitSearchModel = new IpcCommitSearchModel();
    const out = await model.search("acme", { query: "fix", in: "message" });

    expect(stub).toHaveBeenCalledWith("acme", { query: "fix", in: "message" });
    expect(out).toEqual([{ shortHash: "x" }]);
  });
});
