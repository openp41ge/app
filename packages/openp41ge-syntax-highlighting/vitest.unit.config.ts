/**
 * Vitest configuration for the openp41ge-syntax-highlighting package.
 */
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    include: ["test/unit/**/*.test.ts"],
    environment: "jsdom",
    globals: true,
    watch: false,
    setupFiles: [path.resolve(__dirname, "./test/unit/pre-setup.ts"), path.resolve(__dirname, "./test/unit/setup.ts")],
  },
  resolve: {
    alias: {
      "openp41ge-syntax-highlighting": path.resolve(__dirname, "./src/index.ts"),
      "@openp41ge": path.resolve(__dirname, "../openp41ge/src"),
    },
  },
});
