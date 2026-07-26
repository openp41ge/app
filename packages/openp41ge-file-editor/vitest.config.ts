/**
 * Vitest configuration for the openp41ge-file-editor package.
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
      "@openp41ge": path.resolve(__dirname, "../openp41ge/src"),
      "@openp41ge-file-editor": path.resolve(__dirname, "./src"),
      "@openp41ge-logger": path.resolve(__dirname, "../openp41ge-logger/src"),
      "openp41ge-syntax-highlighting": path.resolve(
        __dirname,
        "../openp41ge-syntax-highlighting/src/index.ts",
      ),
      "openp41ge-themes": path.resolve(__dirname, "../openp41ge-themes/src/index.ts"),
    },
  },
});
