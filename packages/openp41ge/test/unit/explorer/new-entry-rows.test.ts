/**
 * Tests for the Explorer “+ add folder” / “+ add file” rows.
 *
 * The rows must appear in every folder's list (and the worktree root), be
 * clickable to reveal an inline name input, and create the item on confirm —
 * writing a file or making a directory. “+ add folder” always sits above the
 * file list (folders sort above files), and “+ add file” sits at the very
 * bottom. An empty folder/worktree must still show both rows.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Side-effect: registers the <openp41ge-repo-tree-item> custom element.
import "../../../src/renderer/components/openp41ge-repo-tree-item";
import type { Openp41geRepoTreeItem } from "../../../src/renderer/components/openp41ge-repo-tree-item";
import type { WorktreeData } from "../../../src/renderer/components/openp41ge-repo-tree-item";
import type { FileEntry } from "openp41ge-filesystem";

type PrivItem = Openp41geRepoTreeItem & {
  _expanded: boolean;
  _expandedWorktrees: Set<string>;
  _expandedDirs: Map<string, Set<string>>;
  _fileLoader: {
    worktreeFiles: Map<string, FileEntry[]>;
    dirContents: Map<string, FileEntry[]>;
    isWorktreeLoaded(branch: string): boolean;
    isRefreshingWorktree(branch: string): boolean;
    isLoadingWorktree(branch: string): boolean;
  };
};

function dir(name: string, path: string): FileEntry {
  return { name, path, isDirectory: true, size: 0, modifiedAt: 0 };
}
function file(name: string, path: string): FileEntry {
  return { name, path, isDirectory: false, size: 1, modifiedAt: 0 };
}

describe("Explorer new-entry rows", () => {
  let host: HTMLElement;
  const ORIG_OPENP41GE: unknown = window.openp41ge;
  const readdir = vi.fn();
  const writeFile = vi.fn();
  const mkdir = vi.fn();

  const stub = () => {
    (window as unknown as { openp41ge: unknown }).openp41ge = {
      workspace: { getWindowId: () => "test-win" },
      workspaceController: { getBranches: async () => [] },
      file: { readdir, writeFile, mkdir },
    } as unknown as typeof window.openp41ge;
  };

  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    readdir.mockReset().mockResolvedValue([]);
    writeFile.mockReset().mockResolvedValue({ success: true });
    mkdir.mockReset().mockResolvedValue({ success: true, path: "" });
    stub();
  });

  afterEach(() => {
    (window as unknown as { openp41ge: unknown }).openp41ge = ORIG_OPENP41GE;
    host.remove();
  });

  async function makeItem(
    worktrees: WorktreeData[],
    rootEntries: FileEntry[],
    opts?: { subdir?: string; subdirEntries?: FileEntry[] },
  ): Promise<PrivItem> {
    const el = document.createElement("openp41ge-repo-tree-item") as unknown as PrivItem;
    el.repoName = "org/repo";
    el.worktrees = worktrees;
    host.appendChild(el);
    (el as unknown as { _expanded: boolean })._expanded = true;
    el._expandedWorktrees.add("main");
    el._fileLoader.worktreeFiles.set("main", rootEntries);
    if (opts?.subdir && opts.subdirEntries) {
      el._expandedDirs.set("main", new Set([opts.subdir]));
      el._fileLoader.dirContents.set(opts.subdir, opts.subdirEntries);
    }
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete;
    return el;
  }

  /** Collects the visible row label texts (across the uikit tree shadow DOM). */
  function rowLabels(item: PrivItem): string[] {
    const out: string[] = [];
    const walk = (root: ParentNode): void => {
      for (const el of Array.from((root as Element).querySelectorAll?.("*") ?? [])) {
        const h = el as HTMLElement;
        if (h.shadowRoot) walk(h.shadowRoot);
        if (h.classList?.contains("tree-label")) {
          out.push((h.textContent ?? "").trim());
        }
      }
    };
    walk(item);
    return out;
  }

  /** Find a row element by its label text, anywhere in the shadow DOM. */
  function rowByLabel(item: PrivItem, label: string): HTMLElement | null {
    let found: HTMLElement | null = null;
    const walk = (root: ParentNode): void => {
      for (const el of Array.from((root as Element).querySelectorAll?.("*") ?? [])) {
        const h = el as HTMLElement;
        if (h.shadowRoot) walk(h.shadowRoot);
        if (h.classList?.contains("tree-label") && (h.textContent ?? "").trim() === label) {
          const row = h.closest(".tree-node") as HTMLElement | null;
          if (row) found = row;
        }
      }
    };
    walk(item);
    return found;
  }

  async function flush(item: PrivItem): Promise<void> {
    await new Promise((r) => setTimeout(r, 30));
    await (item as unknown as { updateComplete: Promise<unknown> }).updateComplete;
  }

  it("shows + add folder below the folder group and + add file at the bottom", async () => {
    const item = await makeItem(
      [{ branch: "main", path: "/repo/main", exists: true }],
      [dir("src", "/repo/main/src"), file("README.md", "/repo/main/README.md")],
    );

    const labels = rowLabels(item);
    expect(labels).toEqual(["src", "add folder", "README.md", "add file"]);
  });

  it("always keeps + add folder above the files, even with no subdirectories", async () => {
    const item = await makeItem(
      [{ branch: "main", path: "/repo/main", exists: true }],
      [file("app.ts", "/repo/main/app.ts"), file("b.ts", "/repo/main/b.ts")],
    );

    const labels = rowLabels(item);
    // Folders sort above files, so the folder create row must sit above the
    // files too — not pushed after them.
    expect(labels).toEqual(["add folder", "app.ts", "b.ts", "add file"]);
  });

  it("marks create rows as muted (tree-node--muted)", async () => {
    const item = await makeItem(
      [{ branch: "main", path: "/repo/main", exists: true }],
      [],
    );

    const folderRow = rowByLabel(item, "add folder");
    const fileRow = rowByLabel(item, "add file");
    expect(folderRow?.classList.contains("tree-node--muted")).toBe(true);
    expect(fileRow?.classList.contains("tree-node--muted")).toBe(true);
  });

  it("shows both rows when a worktree has no files or folders", async () => {
    const item = await makeItem(
      [{ branch: "main", path: "/repo/main", exists: true }],
      [],
    );

    const labels = rowLabels(item);
    expect(labels).toEqual(["add folder", "add file"]);
  });

  it("shows + add file after the files and + add folder after the folders at a subfolder level", async () => {
    const item = await makeItem(
      [{ branch: "main", path: "/repo/main", exists: true }],
      [dir("src", "/repo/main/src")],
      { subdir: "/repo/main/src", subdirEntries: [file("app.ts", "/repo/main/src/app.ts")] },
    );

    const labels = rowLabels(item);
    // Root has a folder group (src) and no files.
    expect(labels).toContain("add folder");
    expect(labels.indexOf("add folder")).toBeGreaterThan(labels.indexOf("src"));
    expect(labels.indexOf("add file")).toBeGreaterThan(labels.indexOf("add folder"));
    // The expanded subfolder shows its file + both create rows.
    expect(labels).toContain("app.ts");
    expect(labels.indexOf("app.ts")).toBeLessThan(labels.lastIndexOf("add file"));
  });

  it("reveals an inline input when a + add file row is clicked", async () => {
    const item = await makeItem(
      [{ branch: "main", path: "/repo/main", exists: true }],
      [],
    );

    const row = rowByLabel(item, "add file");
    expect(row).not.toBeNull();
    row!.click();
    await (item as unknown as { updateComplete: Promise<unknown> }).updateComplete;

    const tree = item.querySelector("openp41ge-tree");
    expect(tree?.shadowRoot?.querySelector(".tree-new-entry-input")).not.toBeNull();
  });

  it("creates a file on confirm and opens it", async () => {
    const item = await makeItem(
      [{ branch: "main", path: "/repo/main", exists: true }],
      [],
    );
    const onOpen = vi.fn();
    document.addEventListener("openp41ge:open-file", onOpen as EventListener);

    const row = rowByLabel(item, "add file");
    row!.click();
    await (item as unknown as { updateComplete: Promise<unknown> }).updateComplete;
    const input = item
      .querySelector("openp41ge-tree")
      ?.shadowRoot?.querySelector<HTMLInputElement>(".tree-new-entry-input");
    expect(input).not.toBeNull();

    input!.value = "notes.md";
    input!.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    input!.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true, composed: true }),
    );
    await flush(item);

    expect(writeFile).toHaveBeenCalledWith("/repo/main/notes.md", "");
    expect(onOpen).toHaveBeenCalledTimes(1);
    const detail = (onOpen.mock.calls[0][0] as CustomEvent).detail as {
      path: string;
      name: string;
    };
    expect(detail.path).toBe("/repo/main/notes.md");
  });

  it("creates a folder on confirm (no file opened)", async () => {
    const item = await makeItem(
      [{ branch: "main", path: "/repo/main", exists: true }],
      [],
    );
    const onOpen = vi.fn();
    document.addEventListener("openp41ge:open-file", onOpen as EventListener);

    const row = rowByLabel(item, "add folder");
    row!.click();
    await (item as unknown as { updateComplete: Promise<unknown> }).updateComplete;
    const input = item
      .querySelector("openp41ge-tree")
      ?.shadowRoot?.querySelector<HTMLInputElement>(".tree-new-entry-input");
    expect(input).not.toBeNull();

    input!.value = "docs";
    input!.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    input!.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true, composed: true }),
    );
    await flush(item);

    expect(mkdir).toHaveBeenCalledWith("/repo/main/docs");
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("escapes out of inline edit without creating anything", async () => {
    const item = await makeItem(
      [{ branch: "main", path: "/repo/main", exists: true }],
      [],
    );

    const row = rowByLabel(item, "add file");
    row!.click();
    await (item as unknown as { updateComplete: Promise<unknown> }).updateComplete;
    const input = item
      .querySelector("openp41ge-tree")
      ?.shadowRoot?.querySelector<HTMLInputElement>(".tree-new-entry-input");
    expect(input).not.toBeNull();

    input!.value = "should-not-exist.md";
    input!.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    input!.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true, composed: true }),
    );
    await (item as unknown as { updateComplete: Promise<unknown> }).updateComplete;

    expect(writeFile).not.toHaveBeenCalled();
    expect(item.querySelector("openp41ge-tree")?.shadowRoot?.querySelector(".tree-new-entry-input")).toBeNull();
  });

  it("dispatches create-row-edit when entering and escaping the inline input", async () => {
    // The repo item tells the Explorer panel when a create row enters/leaves
    // inline-edit mode so the panel can drop the arrow cursor while typing
    // (editing=true) and restore it on Escape (editing=false).
    const events: Array<{ nodeId: string; editing: boolean }> = [];
    const onEdit = (e: Event) => {
      const d = (e as CustomEvent).detail as { nodeId: string; editing: boolean };
      events.push(d);
    };
    document.addEventListener("create-row-edit", onEdit as EventListener);
    const item = await makeItem(
      [{ branch: "main", path: "/repo/main", exists: true }],
      [],
    );

    // Entering edit mode dispatches editing=true.
    const row = rowByLabel(item, "add file");
    row!.click();
    await (item as unknown as { updateComplete: Promise<unknown> }).updateComplete;
    expect(events.length).toBe(1);
    expect(events[0].editing).toBe(true);
    expect(events[0].nodeId).toContain("new:main");

    // Escape dispatches editing=false (for the panel to restore the cursor).
    const input = item
      .querySelector("openp41ge-tree")
      ?.shadowRoot?.querySelector<HTMLInputElement>(".tree-new-entry-input");
    input!.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true, composed: true }),
    );
    await (item as unknown as { updateComplete: Promise<unknown> }).updateComplete;
    expect(events.length).toBe(2);
    expect(events[1].editing).toBe(false);
    expect(events[1].nodeId).toBe(events[0].nodeId);
  });

  it("confirm button creates the file", async () => {
    const item = await makeItem(
      [{ branch: "main", path: "/repo/main", exists: true }],
      [],
    );

    const row = rowByLabel(item, "add file");
    row!.click();
    await (item as unknown as { updateComplete: Promise<unknown> }).updateComplete;
    const tree = item.querySelector("openp41ge-tree");
    const input = tree?.shadowRoot?.querySelector<HTMLInputElement>(".tree-new-entry-input");
    expect(input).not.toBeNull();

    input!.value = "notes.md";
    input!.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    await (item as unknown as { updateComplete: Promise<unknown> }).updateComplete;

    const confirm = tree?.shadowRoot?.querySelector<HTMLButtonElement>(".tree-new-entry-confirm");
    expect(confirm).not.toBeNull();
    confirm!.click();
    await flush(item);

    expect(writeFile).toHaveBeenCalledWith("/repo/main/notes.md", "");
  });

  it("cancel button discards the entry without creating anything", async () => {
    const item = await makeItem(
      [{ branch: "main", path: "/repo/main", exists: true }],
      [],
    );

    const row = rowByLabel(item, "add file");
    row!.click();
    await (item as unknown as { updateComplete: Promise<unknown> }).updateComplete;
    const tree = item.querySelector("openp41ge-tree");
    const input = tree?.shadowRoot?.querySelector<HTMLInputElement>(".tree-new-entry-input");
    expect(input).not.toBeNull();

    input!.value = "should-not-exist.md";
    input!.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    await (item as unknown as { updateComplete: Promise<unknown> }).updateComplete;

    const cancel = tree?.shadowRoot?.querySelector<HTMLButtonElement>(".tree-new-entry-cancel");
    expect(cancel).not.toBeNull();
    cancel!.click();
    await (item as unknown as { updateComplete: Promise<unknown> }).updateComplete;

    expect(writeFile).not.toHaveBeenCalled();
    expect(tree?.shadowRoot?.querySelector(".tree-new-entry-input")).toBeNull();
  });

  it("splits create rows into an action (+) cell and a description (file-type) icon cell", async () => {
    const item = await makeItem(
      [{ branch: "main", path: "/repo/main", exists: true }],
      [],
    );

    const row = rowByLabel(item, "add file");
    row!.click();
    await (item as unknown as { updateComplete: Promise<unknown> }).updateComplete;
    const tree = item.querySelector("openp41ge-tree");
    const input = tree?.shadowRoot?.querySelector<HTMLInputElement>(".tree-new-entry-input");
    expect(input).not.toBeNull();

    // Idle/unknown: the action cell holds the + glyph, the description cell
    // holds the default (unknown) file icon — never the same cell.
    expect(tree?.shadowRoot?.querySelector<Element>('file-extension-svg[filename="file"]')).not.toBeNull();
    const actionCell = tree?.shadowRoot?.querySelector(".tree-node .tree-chevron-cell svg");
    expect(actionCell).not.toBeNull();

    // Type an exact extension match → the DESCRIPTION icon becomes the
    // file-type glyph, while the action cell keeps its + glyph.
    input!.value = "app.ts";
    input!.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    await (item as unknown as { updateComplete: Promise<unknown> }).updateComplete;
    expect(tree?.shadowRoot?.querySelector<Element>('file-extension-svg[filename="app.ts"]')).not.toBeNull();
    expect(tree?.shadowRoot?.querySelector<Element>('file-extension-svg[filename="file"]')).toBeNull();
    expect(tree?.shadowRoot?.querySelector(".tree-node .tree-chevron-cell svg")).not.toBeNull();

    // A partial/unknown name falls back to the default file icon (no type icon).
    input!.value = "app";
    input!.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    await (item as unknown as { updateComplete: Promise<unknown> }).updateComplete;
    expect(tree?.shadowRoot?.querySelector<Element>('file-extension-svg[filename="app"]')).toBeNull();
    expect(tree?.shadowRoot?.querySelector<Element>('file-extension-svg[filename="file"]')).not.toBeNull();
  });

  it("creates a file without an extension (no extension requirement)", async () => {
    const item = await makeItem(
      [{ branch: "main", path: "/repo/main", exists: true }],
      [],
    );
    const row = rowByLabel(item, "add file");
    row!.click();
    await (item as unknown as { updateComplete: Promise<unknown> }).updateComplete;
    const input = item
      .querySelector("openp41ge-tree")
      ?.shadowRoot?.querySelector<HTMLInputElement>(".tree-new-entry-input");

    // A dotless name is a valid file name — it must create without error.
    input!.value = "NOTES";
    input!.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    input!.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true, composed: true }),
    );
    await flush(item);

    expect(writeFile).toHaveBeenCalledWith("/repo/main/NOTES", "");
  });

  it("blocks creating a folder whose name already exists", async () => {
    const doc = { name: "docs", path: "/repo/main/docs", isDirectory: true, size: 0, modifiedAt: 0 };
    // The worktree loader refreshes from readdir when cached data exists, so
    // make readdir return the same entry the duplicate check must see.
    readdir.mockResolvedValue([doc]);
    const item = await makeItem(
      [{ branch: "main", path: "/repo/main", exists: true }],
      [doc],
    );
    const row = rowByLabel(item, "add folder");
    row!.click();
    await (item as unknown as { updateComplete: Promise<unknown> }).updateComplete;
    const tree = item.querySelector("openp41ge-tree");
    const input = tree?.shadowRoot?.querySelector<HTMLInputElement>(".tree-new-entry-input");

    input!.value = "docs";
    input!.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    await (item as unknown as { updateComplete: Promise<unknown> }).updateComplete;

    // The confirm button is disabled and the row is flagged as a duplicate.
    const confirm = tree?.shadowRoot?.querySelector<HTMLButtonElement>(".tree-new-entry-confirm");
    expect(confirm?.disabled).toBe(true);
    expect(tree?.shadowRoot?.querySelector(".tree-new-entry-row.duplicate")).not.toBeNull();

    // The invalid name is flagged by the row's + icon rotating into a red cross
    // (not by recolouring the input text).
    const cross = [...(tree?.shadowRoot?.querySelectorAll("span") ?? [])].find((s) =>
      (s.getAttribute("style") ?? "").includes("rotate(45deg)"),
    );
    const inputEl = tree?.shadowRoot?.querySelector(".tree-new-entry-input");
    expect(cross).not.toBeNull();
    expect((cross?.getAttribute("style") ?? "")).toContain("#e81123");
    // Input text keeps its normal colour (no inline red override).
    expect((inputEl as HTMLElement | null)?.getAttribute("style") ?? "").not.toContain("#e81123");

    // Even forcing Enter must not create the folder.
    input!.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true, composed: true }),
    );
    await flush(item);
    expect(mkdir).not.toHaveBeenCalled();
  });

  it("blocks creating a file whose name already exists (case-insensitive)", async () => {
    const exist = { name: "Notes.md", path: "/repo/main/Notes.md", isDirectory: false, size: 0, modifiedAt: 0 };
    readdir.mockResolvedValue([exist]);
    const item = await makeItem(
      [{ branch: "main", path: "/repo/main", exists: true }],
      [exist],
    );
    const row = rowByLabel(item, "add file");
    row!.click();
    await (item as unknown as { updateComplete: Promise<unknown> }).updateComplete;
    const tree = item.querySelector("openp41ge-tree");
    const input = tree?.shadowRoot?.querySelector<HTMLInputElement>(".tree-new-entry-input");

    input!.value = "notes.md";
    input!.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    await (item as unknown as { updateComplete: Promise<unknown> }).updateComplete;
    const confirm = tree?.shadowRoot?.querySelector<HTMLButtonElement>(".tree-new-entry-confirm");
    expect(confirm?.disabled).toBe(true);
    expect(tree?.shadowRoot?.querySelector(".tree-new-entry-row.duplicate")).not.toBeNull();

    // The + icon rotates into a red cross for the duplicate file name too.
    const cross = [...(tree?.shadowRoot?.querySelectorAll("span") ?? [])].find((s) =>
      (s.getAttribute("style") ?? "").includes("rotate(45deg)"),
    );
    expect(cross).not.toBeNull();
    expect((cross?.getAttribute("style") ?? "")).toContain("#e81123");

    input!.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true, composed: true }),
    );
    await flush(item);
    expect(writeFile).not.toHaveBeenCalled();
  });
});
