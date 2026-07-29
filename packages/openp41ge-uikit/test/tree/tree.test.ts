// @ts-nocheck
/**
 * Unit tests for <openp41ge-tree> component.
 *
 * Tests cover the new features added in the uikit tree upgrade:
 *   - Async expansion (onToggle, loading spinner, collapse on reject)
 *   - Context menu (tree-node-contextmenu event)
 *   - Double-click (tree-node-dblclick event)
 *   - Status CSS classes
 *   - Badge rendering
 *   - onExpandedChange callback
 */

import { vi, describe, test, expect, beforeEach, afterEach } from "vitest";
import "../../src/components/tree/tree";
import type { Openp41geTree } from "../../src/components/tree/tree";
import type { TreeNode } from "../../src/components/tree/types";

// ─── Polyfill CSS.escape (not available in jsdom) ─────────────────

if (typeof CSS === "undefined") {
  (globalThis as any).CSS = { escape: (s: string) => s.replace(/["\\]/g, "\\$&") };
} else if (!CSS.escape) {
  CSS.escape = (s: string) => s.replace(/["\\]/g, "\\$&");
}

// ─── Polyfill DataTransfer (not available in jsdom) ──────────────

if (typeof DataTransfer === "undefined") {
  (globalThis as any).DataTransfer = class DataTransfer {
    _data: Record<string, string> = {};
    setData(type: string, value: string) { this._data[type] = value; }
    getData(type: string) { return this._data[type] || ""; }
    get types() { return Object.keys(this._data); }
    clearData() { this._data = {}; }
    effectAllowed: string = "uninitialized";
    dropEffect: string = "none";
    files: File[] = [];
    items: DataTransferItem[] = [];
  };
}

// ─── Polyfill DragEvent (not available in jsdom) ────────────────

if (typeof DragEvent === "undefined") {
  const OrigMouseEvent = MouseEvent;
  (globalThis as any).DragEvent = class DragEvent extends OrigMouseEvent {
    constructor(type: string, init?: DragEventInit) {
      super(type, init);
      (this as any).dataTransfer = init?.dataTransfer ?? null;
    }
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────

const sampleNodes: TreeNode[] = [
  {
    id: "src",
    label: "src",
    icon: "folder",
    children: [
      { id: "src/app.ts", label: "app.ts", icon: "typescript", draggable: true },
      { id: "src/utils.ts", label: "utils.ts", icon: "typescript", draggable: true },
    ],
  },
  {
    id: "README.md",
    label: "README.md",
    icon: "markdown",
    draggable: true,
  },
  {
    id: "styles",
    label: "styles",
    icon: "folder",
    children: [
      { id: "styles/theme.css", label: "theme.css", icon: "css" },
    ],
  },
];

async function createTree(): Promise<Openp41geTree> {
  const tree = document.createElement("openp41ge-tree") as Openp41geTree;
  tree.nodes = sampleNodes;
  document.body.appendChild(tree);
  await (tree as any).updateComplete;
  return tree;
}

function getShadowRoot(el: HTMLElement): ShadowRoot | null {
  return el.shadowRoot;
}

function queryInTree(tree: Openp41geTree, selector: string): HTMLElement | null {
  const root = getShadowRoot(tree);
  if (!root) return null;
  return root.querySelector(selector);
}

function queryAllInTree(tree: Openp41geTree, selector: string): HTMLElement[] {
  const root = getShadowRoot(tree);
  if (!root) return [];
  const direct = Array.from(root.querySelectorAll(selector));
  // Also search into nested <openp41ge-tree> child elements' shadow roots
  const nestedTrees = root.querySelectorAll("openp41ge-tree");
  for (const nested of nestedTrees) {
    const nestedRoot = getShadowRoot(nested as HTMLElement);
    if (nestedRoot) {
      direct.push(...Array.from(nestedRoot.querySelectorAll(selector)));
    }
  }
  return direct;
}

function getNodeRow(tree: Openp41geTree, nodeId: string): HTMLElement | null {
  // Search in own shadow root first, then in nested trees' shadow roots
  const root = getShadowRoot(tree);
  if (root) {
    const own = root.querySelector(`[data-node-id="${nodeId}"]`);
    if (own) return own as HTMLElement;
    const nestedTrees = root.querySelectorAll("openp41ge-tree");
    for (const nested of nestedTrees) {
      const nestedRoot = getShadowRoot(nested as HTMLElement);
      if (nestedRoot) {
        const found = nestedRoot.querySelector(`[data-node-id="${nodeId}"]`);
        if (found) return found as HTMLElement;
      }
    }
  }
  return null;
}

// ─── Setup / Teardown ────────────────────────────────────────────────

afterEach(() => {
  document.body.innerHTML = "";
});

// ─── Basic Rendering ────────────────────────────────────────────────

describe("basic rendering", () => {
  test("renders all top-level nodes", async () => {
    const tree = await createTree();
    const rows = queryAllInTree(tree, "[data-node-id]");
    expect(rows.length).toBe(3);
    expect(rows[0].getAttribute("data-node-id")).toBe("src");
    expect(rows[1].getAttribute("data-node-id")).toBe("README.md");
    expect(rows[2].getAttribute("data-node-id")).toBe("styles");
  });

  test("renders labels", async () => {
    const tree = await createTree();
    const srcRow = getNodeRow(tree, "src");
    const label = srcRow?.querySelector(".tree-label");
    expect(label?.textContent).toBe("src");
  });

  test("collapsed children are not visible", async () => {
    const tree = await createTree();
    const childRows = queryAllInTree(tree, '[data-node-id="src/app.ts"]');
    expect(childRows.length).toBe(0);
  });

  test("empty tree shows empty message", async () => {
    const tree = document.createElement("openp41ge-tree") as Openp41geTree;
    tree.nodes = [];
    document.body.appendChild(tree);
    await (tree as any).updateComplete;
    const empty = queryInTree(tree, ".tree-empty");
    expect(empty).toBeTruthy();
  });
});

// ─── Expand / Collapse ───────────────────────────────────────────────

describe("expand / collapse", () => {
  test("clicking a collapsible node toggles expanded state", async () => {
    const tree = await createTree();
    const srcRow = getNodeRow(tree, "src");
    expect(srcRow?.getAttribute("aria-expanded")).toBe("false");

    srcRow?.click();
    await (tree as any).updateComplete;
    expect(srcRow?.getAttribute("aria-expanded")).toBe("true");

    srcRow?.click();
    await (tree as any).updateComplete;
    expect(srcRow?.getAttribute("aria-expanded")).toBe("false");
  });

  test("expanding a node reveals its children", async () => {
    const tree = await createTree();
    const srcRow = getNodeRow(tree, "src");

    expect(queryAllInTree(tree, '[data-node-id="src/app.ts"]').length).toBe(0);

    srcRow?.click();
    await (tree as any).updateComplete;

    expect(queryAllInTree(tree, '[data-node-id="src/app.ts"]').length).toBe(1);
  });

  test("dispatches tree-node-toggle event", async () => {
    const tree = await createTree();
    const handler = vi.fn();
    tree.addEventListener("tree-node-toggle", handler);

    const srcRow = getNodeRow(tree, "src");
    srcRow?.click();
    await (tree as any).updateComplete;

    expect(handler).toHaveBeenCalledTimes(1);
    const detail = handler.mock.calls[0][0].detail;
    expect(detail.nodeId).toBe("src");
    expect(detail.expanded).toBe(true);

    srcRow?.click();
    await (tree as any).updateComplete;
    expect(handler).toHaveBeenCalledTimes(2);
    expect(handler.mock.calls[1][0].detail.expanded).toBe(false);
  });

  test("clicking a leaf node dispatches tree-node-click", async () => {
    const tree = await createTree();
    const handler = vi.fn();
    tree.addEventListener("tree-node-click", handler);

    const readmeRow = getNodeRow(tree, "README.md");
    readmeRow?.click();
    await (tree as any).updateComplete;

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0].detail.nodeId).toBe("README.md");
  });
});

// ─── Async Expansion (onToggle) ─────────────────────────────────────

describe("async expansion (onToggle)", () => {
  test("shows loading spinner when onToggle is pending", async () => {
    const tree = await createTree();
    let resolvePromise: () => void = () => {};
    tree.onToggle = () =>
      new Promise<void>((resolve) => {
        resolvePromise = resolve;
      });

    const srcRow = getNodeRow(tree, "src");
    srcRow?.click();
    await (tree as any).updateComplete;

    // Should show spinner instead of chevron
    const spinner = queryInTree(tree, ".tree-spinner");
    expect(spinner).toBeTruthy();

    // Resolve the promise
    resolvePromise();
    await new Promise((r) => setTimeout(r, 10));
    await (tree as any).updateComplete;

    // Spinner should be gone
    const spinnerAfter = queryInTree(tree, ".tree-spinner");
    expect(spinnerAfter).toBeNull();
  });

  test("expands node after onToggle resolves", async () => {
    const tree = await createTree();
    let resolvePromise: () => void = () => {};
    tree.onToggle = () =>
      new Promise<void>((resolve) => {
        resolvePromise = resolve;
      });

    const srcRow = getNodeRow(tree, "src");
    srcRow?.click();
    await (tree as any).updateComplete;

    // Children should not yet be visible (still loading)
    expect(queryAllInTree(tree, '[data-node-id="src/app.ts"]').length).toBe(0);

    // Update nodes to have children (simulating consumer populating children)
    tree.nodes = tree.nodes.map((n) => {
      if (n.id === "src") {
        return {
          ...n,
          children: [
            { id: "src/app.ts", label: "app.ts", icon: "typescript" },
            { id: "src/utils.ts", label: "utils.ts", icon: "typescript" },
          ],
        };
      }
      return n;
    });
    resolvePromise();
    await new Promise((r) => setTimeout(r, 10));
    await (tree as any).updateComplete;

    // Children should now be visible
    expect(queryAllInTree(tree, '[data-node-id="src/app.ts"]').length).toBe(1);
  });

  test("collapses node on onToggle reject", async () => {
    const tree = await createTree();
    let rejectPromise: (err: Error) => void = () => {};
    tree.onToggle = () =>
      new Promise<void>((_resolve, reject) => {
        rejectPromise = reject;
      });

    const srcRow = getNodeRow(tree, "src");

    const errorHandler = vi.fn();
    tree.addEventListener("tree-node-toggle-error", errorHandler);

    srcRow?.click();
    await (tree as any).updateComplete;
    expect(srcRow?.getAttribute("aria-expanded")).toBe("true");

    rejectPromise(new Error("test error"));
    await new Promise((r) => setTimeout(r, 10));
    await (tree as any).updateComplete;

    expect(srcRow?.getAttribute("aria-expanded")).toBe("false");
    expect(errorHandler).toHaveBeenCalledTimes(1);
    expect(errorHandler.mock.calls[0][0].detail.error).toBeInstanceOf(Error);
  });

  test("clicking chevron during loading cancels the operation", async () => {
    const tree = await createTree();
    tree.onToggle = () =>
      new Promise<void>(() => {
        // Never resolves
      });

    const srcRow = getNodeRow(tree, "src");
    srcRow?.click();
    await (tree as any).updateComplete;

    expect(srcRow?.getAttribute("aria-expanded")).toBe("true");
    expect(queryInTree(tree, ".tree-spinner")).toBeTruthy();

    // Click again to collapse
    srcRow?.click();
    await (tree as any).updateComplete;

    expect(srcRow?.getAttribute("aria-expanded")).toBe("false");
    expect(queryInTree(tree, ".tree-spinner")).toBeNull();
  });
});

// ─── Context Menu ───────────────────────────────────────────────────

describe("context menu", () => {
  test("dispatches tree-node-contextmenu on right-click", async () => {
    const tree = await createTree();
    const handler = vi.fn();
    tree.addEventListener("tree-node-contextmenu", handler);

    const readmeRow = getNodeRow(tree, "README.md");
    readmeRow?.dispatchEvent(
      new MouseEvent("contextmenu", {
        bubbles: true,
        clientX: 100,
        clientY: 200,
      }),
    );

    expect(handler).toHaveBeenCalledTimes(1);
    const detail = handler.mock.calls[0][0].detail;
    expect(detail.nodeId).toBe("README.md");
    expect(detail.clientX).toBe(100);
    expect(detail.clientY).toBe(200);
  });

  test("prevents default browser context menu on tree nodes", async () => {
    const tree = await createTree();
    const readmeRow = getNodeRow(tree, "README.md");

    const event = new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
    });
    const prevented = !readmeRow?.dispatchEvent(event);

    expect(prevented).toBe(true);
  });
});

// ─── Double-click ───────────────────────────────────────────────────

describe("double-click", () => {
  test("dispatches tree-node-dblclick on leaf node double-click", async () => {
    const tree = await createTree();
    const handler = vi.fn();
    tree.addEventListener("tree-node-dblclick", handler);

    const readmeRow = getNodeRow(tree, "README.md");
    readmeRow?.dispatchEvent(
      new MouseEvent("dblclick", { bubbles: true }),
    );

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0].detail.nodeId).toBe("README.md");
  });

  test("single-click on leaf does not fire dblclick", async () => {
    const tree = await createTree();
    const dblclickHandler = vi.fn();
    tree.addEventListener("tree-node-dblclick", dblclickHandler);

    const readmeRow = getNodeRow(tree, "README.md");
    readmeRow?.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }));
    await (tree as any).updateComplete;

    expect(dblclickHandler).not.toHaveBeenCalled();
  });
});

// ─── Status ─────────────────────────────────────────────────────────

describe("status", () => {
  test("applies tree-node--status-untracked CSS class", async () => {
    const tree = await createTree();
    tree.nodes = [
      { id: "untracked-file", label: "untracked.ts", status: "untracked" },
    ];
    await (tree as any).updateComplete;

    const row = getNodeRow(tree, "untracked-file");
    expect(row?.classList.contains("tree-node--status-untracked")).toBe(true);
  });

  test("applies tree-node--status-pending CSS class", async () => {
    const tree = await createTree();
    tree.nodes = [
      { id: "pending-file", label: "pending.ts", status: "pending" },
    ];
    await (tree as any).updateComplete;

    const row = getNodeRow(tree, "pending-file");
    expect(row?.classList.contains("tree-node--status-pending")).toBe(true);
  });

  test("applies tree-node--status-error CSS class", async () => {
    const tree = await createTree();
    tree.nodes = [
      { id: "error-file", label: "error.ts", status: "error" },
    ];
    await (tree as any).updateComplete;

    const row = getNodeRow(tree, "error-file");
    expect(row?.classList.contains("tree-node--status-error")).toBe(true);
  });

  test("no status class when status is undefined", async () => {
    const tree = await createTree();
    const readmeRow = getNodeRow(tree, "README.md");
    const hasStatusClass = Array.from(readmeRow?.classList ?? []).some((c) =>
      c.startsWith("tree-node--status-"),
    );
    expect(hasStatusClass).toBe(false);
  });
});

// ─── Badge ──────────────────────────────────────────────────────────

describe("badge", () => {
  test("renders badge text after label", async () => {
    const tree = await createTree();
    tree.nodes = [
      { id: "pending-node", label: "feature-x", badge: "(pending)" },
    ];
    await (tree as any).updateComplete;

    const row = getNodeRow(tree, "pending-node");
    const badge = row?.querySelector(".tree-badge");
    expect(badge).toBeTruthy();
    expect(badge?.textContent).toBe("(pending)");
  });

  test("no badge element when badge is undefined", async () => {
    const tree = await createTree();
    const readmeRow = getNodeRow(tree, "README.md");
    const badge = readmeRow?.querySelector(".tree-badge");
    expect(badge).toBeNull();
  });
});

// ─── onExpandedChange ───────────────────────────────────────────────

describe("onExpandedChange", () => {
  test("fires callback when toggling expand", async () => {
    const tree = await createTree();
    const handler = vi.fn();
    tree.onExpandedChange = handler;

    const srcRow = getNodeRow(tree, "src");
    srcRow?.click();
    await (tree as any).updateComplete;

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0]).toBe("src");
    expect(handler.mock.calls[0][1]).toBe(true);

    srcRow?.click();
    await (tree as any).updateComplete;
    expect(handler).toHaveBeenCalledTimes(2);
    expect(handler.mock.calls[1][0]).toBe("src");
    expect(handler.mock.calls[1][1]).toBe(false);
  });
});

// ─── Drag and Drop ─────────────────────────────────────────────────

describe("drag and drop", () => {
  test("draggable node has draggable attribute", async () => {
    const tree = await createTree();
    const readmeRow = getNodeRow(tree, "README.md");
    expect(readmeRow?.getAttribute("draggable")).toBe("true");
  });

  test("non-draggable node does not have draggable attribute", async () => {
    const tree = await createTree();
    const stylesRow = getNodeRow(tree, "styles");
    expect(stylesRow?.getAttribute("draggable")).toBe("false");
  });

  test("dragstart sets text/plain data", async () => {
    const tree = await createTree();
    const readmeRow = getNodeRow(tree, "README.md");

    const dt = new DataTransfer();
    const event = new DragEvent("dragstart", {
      bubbles: true,
      dataTransfer: dt,
    });
    readmeRow?.dispatchEvent(event);

    expect(dt.getData("text/plain")).toBe("README.md");
  });
});
