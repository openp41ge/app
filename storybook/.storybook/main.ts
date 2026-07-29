import type { StorybookConfig } from "@storybook/web-components-vite";

const config: StorybookConfig = {
  stories: ["../../packages/openp41ge-uikit/src/**/*.stories.ts", "../../packages/openp41ge-uikit/src/**/*.mdx"],
  addons: ["@storybook/addon-essentials", "./extensions/event-log"],
  framework: {
    name: "@storybook/web-components-vite",
    options: {},
  },
  docs: {
    autodocs: true,
  },
  core: {
    disableTelemetry: true,
  },
};

export default config;
