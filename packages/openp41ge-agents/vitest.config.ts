/**
 * Vitest configuration for the openp41ge-agents package.
 */
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "jsdom",
    globals: true,
    watch: false,
    setupFiles: [
      path.resolve(__dirname, "./test/unit/pre-setup.ts"),
      path.resolve(__dirname, "./test/unit/setup.ts"),
    ],
  },
  resolve: {
    alias: {
      "@openp41ge-agents": path.resolve(__dirname, "./src"),
      "@openp41ge": path.resolve(__dirname, "../openp41ge/src"),
      // Resolve the narrow tooltip subpath to uikit's self-contained source so
      // unit tests don't depend on uikit's prebuilt dist chunk.
      "openp41ge-uikit/tooltip": path.resolve(
        __dirname,
        "../openp41ge-uikit/src/components/tooltip",
      ),
    },
  },
});
