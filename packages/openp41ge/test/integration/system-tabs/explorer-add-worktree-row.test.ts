/**
 * Regression guards for the per-repo "+ add worktree" row in the Explorer
 * sidebar:
 *
 * 1. The "+" icon button that used to live on the right side of the repo
 *    header row is gone — replaced by the row.
 * 2. Each expanded repo renders an "add worktree" row (matching the sidebar's
 *    "+ add repository" row style).
 * 3. Clicking the row reveals the inline branch-name input, and confirming
 *    dispatches the `repo-add-worktree` event.
 * 4. A duplicate branch name cannot be submitted (Enter or Confirm) and does
 *    NOT collapse the repo row — the input stays open for the user to fix it.
 * 5. Confirm/Cancel are full-height square `.p41ge-icon-btn` buttons using the
 *    shared check/cross icons (checkIcon/closeIcon).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Side-effects: register the components so document.createElement returns the
// real classes.
import "../../../src/renderer/components/openp41ge-repo-tree-item";
import type { Openp41geRepoTreeItem } from "../../../src/renderer/components/openp41ge-repo-tree-item";
import type { WorktreeData } from "../../../src/renderer/components/openp41ge-repo-tree-item";

// openp41ge-repo-tree-item is a real LitElement with private helpers we must
// drive from the test; cast through an unknown interface.
type PrivItem = Openp41geRepoTreeItem & {
  _expanded: boolean;
  _showingAddWorktree: boolean;
};

describe("Explorer per-repo add-worktree row", () => {
  let host: HTMLElement;
  const ORIG_OPENP41GE: unknown = window.openp41ge;

  const stub = () => {
    (window as unknown as { openp41ge: unknown }).openp41ge = {
      workspace: { getWindowId: () => "test-win" },
      workspaceController: {
        getBranches: async () => [],
      },
    } as unknown as typeof window.openp41ge;
  };

  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    stub();
  });

  afterEach(() => {
    (window as unknown as { openp41ge: unknown }).openp41ge = ORIG_OPENP41GE;
    host.remove();
  });

  async function makeItem(
    repoName: string,
    worktrees: WorktreeData[],
    expanded: boolean,
  ): Promise<PrivItem> {
    const el = document.createElement("openp41ge-repo-tree-item") as unknown as PrivItem;
    el.repoName = repoName;
    el.worktrees = worktrees;
    host.appendChild(el);
    (el as unknown as { _expanded: boolean })._expanded = expanded;
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete;
    return el;
  }

  /** Open the inline add-worktree input and return it. */
  async function openInput(item: PrivItem): Promise<HTMLInputElement> {
    const row = item.querySelector<HTMLElement>("[class*='add-worktree-row']");
    expect(row).not.toBeNull();
    row!.click();
    await (item as unknown as { updateComplete: Promise<unknown> }).updateComplete;
    const input = item.querySelector<HTMLInputElement>("#wt-addwt-input");
    expect(input).not.toBeNull();
    return input!;
  }

  async function flush(item: PrivItem): Promise<void> {
    await new Promise((r) => setTimeout(r, 200));
    await (item as unknown as { updateComplete: Promise<unknown> }).updateComplete;
  }

  it("removes the header '+' icon button (replaced by the row)", async () => {
    const item = await makeItem("org/repo", [], true);
    // No repo-header-btn with the Add worktree title remains.
    const addButtons = Array.from(item.querySelectorAll<HTMLElement>(".repo-header-btn")).filter(
      (btn) => btn.title === "Add worktree",
    );
    expect(addButtons.length).toBe(0);
  });

  it("shows the 'add worktree' row when the repo is expanded", async () => {
    const item = await makeItem("org/repo", [], true);
    const row = item.querySelector<HTMLElement>("[class*='add-worktree-row']");
    expect(row).not.toBeNull();
    expect(row!.textContent).toContain("add worktree");
    expect(item.textContent).toContain("add worktree");
  });

  it("hides the row when the repo is collapsed", async () => {
    const item = await makeItem("org/repo", [], false);
    expect(item.textContent).not.toContain("add worktree");
    expect(item.querySelector("[class*='add-worktree-row']")).toBeNull();
  });

  it("reveals the inline branch input when the row is clicked", async () => {
    const item = await makeItem("org/repo", [], true);
    expect(item.querySelector("#wt-addwt-input")).toBeNull();
    await openInput(item);
  });

  it("dispatches repo-add-worktree on confirm", async () => {
    const item = await makeItem("org/repo", [], true);
    const onAdd = vi.fn();
    item.addEventListener("repo-add-worktree", onAdd as EventListener);

    const input = await openInput(item);
    input.value = "feature-x";
    input.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true, composed: true }),
    );
    await flush(item);

    expect(onAdd).toHaveBeenCalledTimes(1);
    const detail = (onAdd.mock.calls[0][0] as CustomEvent).detail;
    expect(detail).toEqual({ repoName: "org/repo", branch: "feature-x" });
  });

  it("does not submit a duplicate branch name on Enter and keeps the repo open", async () => {
    const item = await makeItem("org/repo", [{ name: "main", branch: "main", path: "/p/main", exists: true }], true);
    const onAdd = vi.fn();
    item.addEventListener("repo-add-worktree", onAdd as EventListener);

    const input = await openInput(item);
    expect(item._expanded).toBe(true);

    // Duplicate (case-insensitive, trailing whitespace) of the existing branch.
    input.value = "  MAIN ";
    input.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true, composed: true }),
    );
    await flush(item);

    // No event fired, repo stayed expanded, input still open for correction.
    expect(onAdd).not.toHaveBeenCalled();
    expect(item._expanded).toBe(true);
    expect(item._showingAddWorktree).toBe(true);
    expect(item.querySelector("#wt-addwt-input")).not.toBeNull();
  });

  it("disables the confirm button while the name is a duplicate", async () => {
    const item = await makeItem("org/repo", [{ name: "main", branch: "main", path: "/p/main", exists: true }], true);
    const input = await openInput(item);

    input.value = "main";
    input.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    await (item as unknown as { updateComplete: Promise<unknown> }).updateComplete;

    const confirm = item.querySelector<HTMLButtonElement>("button[title='Confirm']");
    expect(confirm).not.toBeNull();
    expect(confirm!.disabled).toBe(true);

    // Duplicate row also gets the red border class.
    const row = item.querySelector<HTMLElement>("#wt-addwt-row");
    expect(row!.classList.contains("duplicate-name")).toBe(true);
  });

  it("uses full-height square p41ge-icon-btn buttons with check/cross icons", async () => {
    const item = await makeItem("org/repo", [], true);
    await openInput(item);

    const confirm = item.querySelector<HTMLButtonElement>("button[title='Confirm']");
    const cancel = item.querySelector<HTMLButtonElement>("button[title='Cancel']");
    expect(confirm).not.toBeNull();
    expect(cancel).not.toBeNull();
    for (const btn of [confirm!, cancel!]) {
      expect(btn.classList.contains("p41ge-icon-btn")).toBe(true);
      // No gap classes — the two buttons sit flush (separator handles it).
      expect(btn.classList.contains("ml-1")).toBe(false);
    }
    // The confirm button carries the leading cap separator (input | check).
    expect(confirm!.getAttribute("data-cap-side")).toBe("left");

    // The shared check/cross icons (stroke-based) in the confirm/cancel buttons.
    const confirmSvg = item.querySelector("#wt-addwt-row button[title='Confirm'] svg");
    const cancelSvg = item.querySelector("#wt-addwt-row button[title='Cancel'] svg");
    const checkPath = confirmSvg?.querySelector("path")?.getAttribute("d") ?? "";
    const cancelLineCount = cancelSvg?.querySelectorAll("line").length ?? 0;
    expect(checkPath).toContain("M3 8.5L6.5 12L13 4.5");
    expect(cancelLineCount).toBe(2);
  });
});
