import { html, unsafeHTML } from "lit";
import type { Meta, StoryObj } from "@storybook/web-components";
import type { TreeNode } from "./types";
import "../components/openp41ge-icon";
import "./tree";

const meta: Meta = {
  title: "Components/Tree",
  component: "openp41ge-tree",
  argTypes: {
    nodes: { control: "object" },
    selectedId: { control: "text" },
  },
};

export default meta;
type Story = StoryObj;

// ─── Icon fallback for stories (no material icons in Storybook) ─────

function storyIcon(name: string, size: number): string {
  // Minimal SVG icons for stories
  const icons: Record<string, string> = {
    "git-branch": `<svg width="${size}" height="${size}" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="5" cy="3.5" r="2"/><circle cx="12" cy="3.5" r="2"/><circle cx="5" cy="12.5" r="2"/><path d="M5 5.5V10.5"/><path d="M12 5.5L5.5 9.5"/></svg>`,
    plus: `<svg width="${size}" height="${size}" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><line x1="8" y1="3" x2="8" y2="13"/><line x1="3" y1="8" x2="13" y2="8"/></svg>`,
    refresh: `<svg width="${size}" height="${size}" viewBox="0 -960 960 960" fill="currentColor"><path d="M480-160q-134 0-227-93t-93-227q0-134 93-227t227-93q69 0 132 28.5T720-690v-110h80v280H520v-80h168q-32-56-87.5-88T480-720q-100 0-170 70t-70 170q0 100 70 170t170 70q77 0 139-44t87-116h84q-28 106-114 173t-196 67Z"/></svg>`,
    "git-info": `<svg width="${size}" height="${size}" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="8" r="6"/><line x1="8" y1="7" x2="8" y2="11"/><circle cx="8" cy="5.2" r="0.8" fill="currentColor" stroke="none"/></svg>`,
    eye: `<svg width="${size}" height="${size}" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M1 8C1 8 3.5 3 8 3C12.5 3 15 8 15 8C15 8 12.5 13 8 13C3.5 13 1 8 1 8Z"/><circle cx="8" cy="8" r="2.5"/></svg>`,
    "eye-off": `<svg width="${size}" height="${size}" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M1 8C1 8 3.5 3 8 3C12.5 3 15 8 15 8C15 8 12.5 13 8 13C3.5 13 1 8 1 8Z"/><circle cx="8" cy="8" r="2.5"/><line x1="2" y1="2" x2="14" y2="14"/></svg>`,
  };
  return icons[name] ?? "";
}

// ─── Mock Data ──────────────────────────────────────────────────────

/** Simple file tree matching the app's explorer look */
const basicNodes: TreeNode[] = [
  {
    id: "src",
    label: "src",
    icon: "folder",
    expanded: true,
    children: [
      {
        id: "components",
        label: "components",
        icon: "folder",
        expanded: true,
        children: [
          { id: "app.ts", label: "app.ts", icon: "file" },
          { id: "header.tsx", label: "header.tsx", icon: "file" },
          { id: "styles.css", label: "styles.css", icon: "file" },
        ],
      },
      { id: "utils.ts", label: "utils.ts", icon: "file" },
      { id: "index.ts", label: "index.ts", icon: "file" },
    ],
  },
  {
    id: "package.json",
    label: "package.json",
    icon: "file",
    draggable: true,
  },
  {
    id: "tsconfig.json",
    label: "tsconfig.json",
    icon: "file",
    draggable: true,
  },
];

/** Repo structure mimicking the app's worktree explorer sidebar */
const repoNodes: TreeNode[] = [
  {
    id: "repo-app",
    label: "app",
    variant: "section",
    expanded: true,
    actions: [
      { id: "add-worktree", icon: "plus", label: "Add worktree" },
      { id: "refresh", icon: "refresh", label: "Refresh" },
    ],
    children: [
      {
        id: "wt-main",
        label: "main",
        icon: "git-branch",
        expanded: true,
        children: [
          {
            id: "dir-readme",
            label: "README.md",
            icon: "file",
          },
          {
            id: "dir-src-wt",
            label: "src",
            icon: "folder",
            expanded: false,
            children: [
              { id: "wt-index", label: "index.ts", icon: "file" },
              { id: "wt-app", label: "app.ts", icon: "file" },
            ],
          },
        ],
      },
      {
        id: "wt-feature",
        label: "feature-x",
        icon: "git-branch",
        expanded: false,
        actions: [{ id: "pull", icon: "refresh", label: "Pull" }],
        children: [
          { id: "wt-feat-readme", label: "README.md", icon: "file" },
        ],
      },
      {
        id: "add-worktree-row",
        label: "add worktree",
        icon: "plus",
        showChevron: false,
        variant: "worktree",
      },
    ],
  },
  {
    id: "repo-toolkit",
    label: "toolkit",
    variant: "section",
    actions: [{ id: "add-worktree", icon: "plus", label: "Add worktree" }],
    children: [],
  },
];

// ─── Stories ─────────────────────────────────────────────────────────

export const Basic: Story = {
  render: () => html`
    <div
      style="width:280px;background:#1e1e1e;font-family:'SF Mono',Monaco,Menlo,Consolas,monospace;"
    >
      <openp41ge-tree
        .nodes=${basicNodes}
        .renderIcon=${(name: string, size: number) => html`${unsafeHTML(storyIcon(name, size))}`}
      ></openp41ge-tree>
    </div>
  `,
};

export const Expanded: Story = {
  render: () => html`
    <div
      style="width:280px;background:#1e1e1e;font-family:'SF Mono',Monaco,Menlo,Consolas,monospace;"
    >
      <openp41ge-tree
        .nodes=${basicNodes}
        selectedId="utils.ts"
        .renderIcon=${(name: string, size: number) => html`${unsafeHTML(storyIcon(name, size))}`}
      ></openp41ge-tree>
    </div>
  `,
};

export const WithRepoStructure: Story = {
  render: () => html`
    <div
      style="width:280px;background:#1e1e1e;font-family:'SF Mono',Monaco,Menlo,Consolas,monospace;"
    >
      <openp41ge-tree
        .nodes=${repoNodes}
        .renderIcon=${(name: string, size: number) => html`${unsafeHTML(storyIcon(name, size))}`}
      ></openp41ge-tree>
    </div>
  `,
};

export const WithActions: Story = {
  render: () => html`
    <div
      style="width:280px;background:#1e1e1e;font-family:'SF Mono',Monaco,Menlo,Consolas,monospace;"
    >
      <openp41ge-tree
        .nodes=${repoNodes}
        .renderIcon=${(name: string, size: number) => html`${unsafeHTML(storyIcon(name, size))}`}
      ></openp41ge-tree>
    </div>
  `,
};

export const NestedDeep: Story = {
  render: () => html`
    <div
      style="width:280px;background:#1e1e1e;font-family:'SF Mono',Monaco,Menlo,Consolas,monospace;"
    >
      <openp41ge-tree
        .nodes=${_buildDeepTree(5)}
        .renderIcon=${(name: string, size: number) => html`${unsafeHTML(storyIcon(name, size))}`}
      ></openp41ge-tree>
    </div>
  `,
};

export const Empty: Story = {
  render: () => html`
    <div style="width:280px;background:#1e1e1e;font-family:'SF Mono',Monaco,Menlo,Consolas,monospace;">
      <openp41ge-tree .nodes=${[]}></openp41ge-tree>
    </div>
  `,
};

export const DraggableNodes: Story = {
  render: () => html`
    <div
      style="width:280px;background:#1e1e1e;font-family:'SF Mono',Monaco,Menlo,Consolas,monospace;"
    >
      <openp41ge-tree
        .nodes=${basicNodes}
        .renderIcon=${(name: string, size: number) => html`${unsafeHTML(storyIcon(name, size))}`}
      ></openp41ge-tree>
    </div>
  `,
};

// ─── Helpers ─────────────────────────────────────────────────────────

function _buildDeepTree(levels: number): TreeNode[] {
  if (levels <= 0) return [];
  const root: TreeNode = {
    id: `level-${levels}`,
    label: `folder-${levels}`,
    icon: "folder",
    expanded: levels <= 2,
    children:
      levels > 1
        ? _buildDeepTree(levels - 1)
        : [
            { id: `file-${levels}-a`, label: "index.ts", icon: "file" },
            { id: `file-${levels}-b`, label: "styles.css", icon: "file" },
          ],
  };
  return [root];
}
