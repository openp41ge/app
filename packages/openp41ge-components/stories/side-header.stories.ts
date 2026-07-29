import { html } from "lit";
import type { Meta, StoryObj } from "@storybook/web-components";
import "../src/components/side-header";

const meta: Meta = {
  title: "Components/SideHeader",
  component: "side-header",
  argTypes: {
    title: { control: "text" },
    loading: { control: "boolean" },
  },
  args: {
    title: "REPOSITORIES",
    loading: false,
  },
};

export default meta;
type Story = StoryObj;

export const Default: Story = {
  render: (args) => html`
    <div style="width:280px;background:#161616;font-family:monospace;">
      <side-header title=${args.title} ?loading=${args.loading}></side-header>
    </div>
  `,
};

export const WithRefresh: Story = {
  render: () => html`
    <div style="width:280px;background:#161616;font-family:monospace;">
      <side-header title="COMMITS"></side-header>
    </div>
  `,
};

export const Loading: Story = {
  render: () => html`
    <div style="width:280px;background:#161616;font-family:monospace;">
      <side-header title="BRANCHES" loading></side-header>
    </div>
  `,
};
