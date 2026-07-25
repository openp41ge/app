/**
 * Vitest configuration for the openp41ge-tabs package.
 */
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "jsdom",
    globals: true,
    watch: false,
  },
  resolve: {
    alias: [
      { find: /^openp41ge-tabs\/(.+)$/, replacement: path.resolve(__dirname, "./src/$1.ts") },
      { find: /^openp41ge-tabs$/, replacement: path.resolve(__dirname, "./src/index.ts") },
    ],
  },
});
