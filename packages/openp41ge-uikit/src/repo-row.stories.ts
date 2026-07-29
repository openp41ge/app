import { html } from "lit";
import type { Meta, StoryObj } from "@storybook/web-components";
import "openp41ge-uikit";

const meta: Meta = {
  title: "Components/RepoRow",
  component: "repo-row",
  argTypes: {
    name: { control: "text" },
    expanded: { control: "boolean" },
    worktreeCount: { control: { type: "number", min: 0 } },
  },
  args: {
    name: "app",
    expanded: false,
    worktreeCount: 3,
  },
};

export default meta;
type Story = StoryObj;

export const Collapsed: Story = {
  render: (args) => html`
    <div style="width:280px;background:#161616;padding:4px 0;font-family:monospace;">
      <repo-row
        name=${args.name}
        ?expanded=${args.expanded}
        worktreeCount=${args.worktreeCount}
      ></repo-row>
    </div>
  `,
};

export const Expanded: Story = {
  render: () => html`
    <div style="width:280px;background:#161616;padding:4px 0;font-family:monospace;">
      <repo-row name="app" expanded worktreeCount="3"></repo-row>
    </div>
  `,
};

export const NoWorktrees: Story = {
  render: () => html`
    <div style="width:280px;background:#161616;padding:4px 0;font-family:monospace;">
      <repo-row name="empty-repo" worktreeCount="0"></repo-row>
    </div>
  `,
};

export const MultipleRepos: Story = {
  render: () => html`
    <div style="width:280px;background:#161616;padding:4px 0;font-family:monospace;">
      <repo-row name="app" expanded worktreeCount="3"></repo-row>
      <repo-row name="toolkit" worktreeCount="1"></repo-row>
      <repo-row name="docs" worktreeCount="0"></repo-row>
    </div>
  `,
};
