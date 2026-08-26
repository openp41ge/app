// @ts-nocheck
/**
 * Tests for the <git-repository-panel> loading skeleton.
 *
 * The panel must show a shimmer skeleton the instant it mounts with no
 * `data` (fresh tab / initial fetch) and replace it with the real panel
 * once `data` arrives — never a blank container.
 */

import { describe, test, expect, beforeEach, afterEach } from "vitest";
import "../../src/components/git-repository-panel";

function makeData(overrides = {}) {
  return {
    repoName: "acme",
    branches: [],
    selectedBranch: "",
    commits: [],
    filesChanged: [],
    loadingBranches: false,
    loadingCommits: false,
    loadingFiles: false,
    commitSkipCount: 0,
    hasMoreCommits: false,
    visibleCommitCount: 0,
    selectedCommit: null,
    ...overrides,
  };
}

describe("git-repository-panel skeleton", () => {
  let host: HTMLElement;
  let panel: HTMLElement & { data: unknown };

  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
  });

  afterEach(() => {
    host.remove();
  });

  test("shows a shimmer skeleton while data is null (fresh mount)", async () => {
    panel = document.createElement("git-repository-panel") as typeof panel;
    host.appendChild(panel);
    await panel.updateComplete;
    const container = panel.querySelector("#panel-container");
    await new Promise((r) => setTimeout(r, 0));

    expect(container).not.toBeNull();
    expect(container.querySelectorAll(".gsk-shimmer").length).toBeGreaterThan(0);
  });

  test("replaces the skeleton with the real panel once data arrives", async () => {
    panel = document.createElement("git-repository-panel") as typeof panel;
    host.appendChild(panel);
    await panel.updateComplete;

    panel.data = makeData();
    await panel.updateComplete;
    await new Promise((r) => setTimeout(r, 0));

    const container = panel.querySelector("#panel-container");
    expect(container.querySelectorAll(".gsk-shimmer").length).toBe(0);
    expect((container.textContent ?? "").includes("Branches")).toBe(true);
  });

  test("shows the error view instead of a skeleton on error data", async () => {
    panel = document.createElement("git-repository-panel") as typeof panel;
    host.appendChild(panel);
    await panel.updateComplete;

    panel.data = makeData({ error: "boom" });
    await panel.updateComplete;
    await new Promise((r) => setTimeout(r, 0));

    const container = panel.querySelector("#panel-container");
    expect(container.querySelectorAll(".gsk-shimmer").length).toBe(0);
    expect(container.textContent).toContain("boom");
  });
});
