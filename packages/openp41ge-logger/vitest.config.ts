/**
 * Vitest configuration for the openp41ge-logger package.
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
      "@openp41ge-logger": path.resolve(__dirname, "./src"),
    },
  },
});
