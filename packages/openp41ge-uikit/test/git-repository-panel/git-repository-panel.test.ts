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

  test("renders the accordion with header spinners while data is null", async () => {
    panel = document.createElement("git-repository-panel") as typeof panel;
    host.appendChild(panel);
    await panel.updateComplete;
    const container = panel.querySelector("#panel-container");
    await new Promise((r) => setTimeout(r, 0));

    expect(container).not.toBeNull();
    // The accordion sections render immediately (structure is known).
    expect(container.textContent).toContain("Branches");
    expect(container.textContent).toContain("Commits");
    // Loading is indicated by the round spinner in each section header.
    expect(container.querySelectorAll(".git-section-spinner").length).toBe(3);
    // No skeleton rows or placeholder text in the bodies while loading.
    expect(container.querySelectorAll(".gbr-skel").length).toBe(0);
    expect(container.textContent).not.toContain("Loading");
  });

  test("replaces each section's spinner once data arrives", async () => {
    panel = document.createElement("git-repository-panel") as typeof panel;
    host.appendChild(panel);
    await panel.updateComplete;

    panel.data = makeData({ branches: [{ name: "main", shortName: "main", isLocal: true }] });
    await panel.updateComplete;
    await new Promise((r) => setTimeout(r, 0));

    const container = panel.querySelector("#panel-container");
    expect(container.querySelectorAll(".git-section-spinner").length).toBe(0);
    expect(container.textContent).toContain("main");
    expect(container.textContent).toContain("Branches");
  });

  test("shows the error view instead of loading spinners on error data", async () => {
    panel = document.createElement("git-repository-panel") as typeof panel;
    host.appendChild(panel);
    await panel.updateComplete;

    panel.data = makeData({ error: "boom" });
    await panel.updateComplete;
    await new Promise((r) => setTimeout(r, 0));

    const container = panel.querySelector("#panel-container");
    expect(container.querySelectorAll(".git-section-spinner").length).toBe(0);
    expect(container.textContent).toContain("boom");
  });
});
