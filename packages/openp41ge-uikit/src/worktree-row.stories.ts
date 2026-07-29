import { html } from "lit";
import type { Meta, StoryObj } from "@storybook/web-components";
import "openp41ge-uikit";

const meta: Meta = {
  title: "Components/WorktreeRow",
  component: "worktree-row",
  argTypes: {
    branch: { control: "text" },
    active: { control: "boolean" },
  },
  args: {
    branch: "master",
    active: false,
  },
};

export default meta;
type Story = StoryObj;

export const Default: Story = {
  render: (args) => html`
    <div style="width:280px;background:#161616;font-family:monospace;">
      <worktree-row branch=${args.branch} ?active=${args.active}></worktree-row>
    </div>
  `,
};

export const LongBranchName: Story = {
  render: () => html`
    <div style="width:280px;background:#161616;font-family:monospace;">
      <worktree-row branch="feature/very-long-branch-name-that-gets-truncated"></worktree-row>
    </div>
  `,
};

export const MultipleWorktrees: Story = {
  render: () => html`
    <div style="width:280px;background:#161616;font-family:monospace;">
      <worktree-row branch="master"></worktree-row>
      <worktree-row branch="develop"></worktree-row>
      <worktree-row branch="feature/new-ui"></worktree-row>
    </div>
  `,
};
