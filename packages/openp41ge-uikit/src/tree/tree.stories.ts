import { html } from "lit";
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

// ─── Mock Data ──────────────────────────────────────────────────────

const basicNodes: TreeNode[] = [
  {
    id: "src",
    label: "src",
    icon: "folder-closed",
    expanded: true,
    children: [
      { id: "main.ts", label: "main.ts", icon: "doc", draggable: true },
      { id: "utils.ts", label: "utils.ts", icon: "doc", draggable: true },
      {
        id: "components",
        label: "components",
        icon: "folder-closed",
        expanded: false,
        children: [
          { id: "app.tsx", label: "app.tsx", icon: "doc", draggable: true },
          { id: "header.tsx", label: "header.tsx", icon: "doc", draggable: true },
        ],
      },
    ],
  },
  {
    id: "package.json",
    label: "package.json",
    icon: "doc",
    draggable: true,
  },
  {
    id: "tsconfig.json",
    label: "tsconfig.json",
    icon: "doc",
    draggable: true,
  },
];

const repoNodes: TreeNode[] = [
  {
    id: "repo-app",
    label: "app",
    icon: "git-branch",
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
          { id: "file-readme", label: "README.md", icon: "doc" },
          {
            id: "dir-src",
            label: "src",
            icon: "folder-closed",
            expanded: false,
            children: [
              { id: "file-index", label: "index.ts", icon: "doc" },
              { id: "file-app", label: "app.ts", icon: "doc" },
            ],
          },
        ],
      },
      {
        id: "wt-feature-x",
        label: "feature-x",
        icon: "git-branch",
        expanded: false,
        actions: [
          { id: "pull", icon: "refresh", label: "Pull" },
        ],
        children: [
          { id: "file-feature-readme", label: "README.md", icon: "doc" },
        ],
      },
    ],
  },
  {
    id: "repo-toolkit",
    label: "toolkit",
    icon: "git-branch",
    actions: [
      { id: "add-worktree", icon: "plus", label: "Add worktree" },
    ],
    children: [],
  },
];

// ─── Stories ─────────────────────────────────────────────────────────

export const Basic: Story = {
  render: () => html`
    <div style="width:280px;background:#1e1e1e;padding:8px 0;font-family:monospace;">
      <openp41ge-tree .nodes=${basicNodes}></openp41ge-tree>
    </div>
  `,
};

export const Expanded: Story = {
  render: () => html`
    <div style="width:280px;background:#1e1e1e;padding:8px 0;font-family:monospace;">
      <openp41ge-tree .nodes=${basicNodes} selectedId="main.ts"></openp41ge-tree>
    </div>
  `,
};

export const WithRepoStructure: Story = {
  render: () => html`
    <div style="width:280px;background:#1e1e1e;padding:8px 0;font-family:monospace;">
      <openp41ge-tree .nodes=${repoNodes}></openp41ge-tree>
    </div>
  `,
};

export const WithActions: Story = {
  render: () => html`
    <div style="width:280px;background:#1e1e1e;padding:8px 0;font-family:monospace;">
      <openp41ge-tree .nodes=${repoNodes}></openp41ge-tree>
    </div>
  `,
};

export const NestedDeep: Story = {
  render: () => html`
    <div style="width:280px;background:#1e1e1e;padding:8px 0;font-family:monospace;">
      <openp41ge-tree .nodes=${_buildDeepTree(5)}></openp41ge-tree>
    </div>
  `,
};

export const Empty: Story = {
  render: () => html`
    <div style="width:280px;background:#1e1e1e;padding:8px 0;font-family:monospace;">
      <openp41ge-tree .nodes=${[]}></openp41ge-tree>
    </div>
  `,
};

export const DraggableNodes: Story = {
  render: () => html`
    <div style="width:280px;background:#1e1e1e;padding:8px 0;font-family:monospace;">
      <openp41ge-tree .nodes=${basicNodes}></openp41ge-tree>
    </div>
  `,
};

// ─── Helpers ─────────────────────────────────────────────────────────

function _buildDeepTree(levels: number): TreeNode[] {
  if (levels <= 0) return [];
  const root: TreeNode = {
    id: `level-${levels}`,
    label: `folder-${levels}`,
    icon: "folder-closed",
    expanded: levels <= 2,
    children: levels > 1 ? _buildDeepTree(levels - 1) : [
      { id: `file-${levels}-a`, label: "index.ts", icon: "doc" },
      { id: `file-${levels}-b`, label: "styles.css", icon: "doc" },
    ],
  };
  return [root];
}
