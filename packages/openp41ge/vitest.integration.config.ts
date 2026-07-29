/**
 * Vitest config for integration tests.
 *
 * Integration tests verify cross-system interactions — tRPC handlers,
 * command bus operations, and pane controller lifecycle — using
 * in-memory test services instead of Pact mock servers.
 */

import path from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    root: __dirname,
    include: ["test/integration/rpc-*.test.ts"],
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
      "@openp41ge": path.resolve(__dirname, "./src"),
      "openp41ge-file-editor": path.resolve(__dirname, "../openp41ge-uikit/src/file-editor"),
      "openp41ge-git": path.resolve(__dirname, "../openp41ge-git/src"),
      "openp41ge-logger": path.resolve(__dirname, "../openp41ge-logger/src"),
      "@openp41ge-terminal": path.resolve(__dirname, "../openp41ge-terminal/src"),
      "@openp41ge-agent-chat": path.resolve(__dirname, "../openp41ge-agent-chat/src"),
      "openp41ge-uikit": path.resolve(__dirname, "../openp41ge-uikit/src"),
      "openp41ge-syntax-highlighting": path.resolve(
        __dirname,
        "../openp41ge-syntax-highlighting/src/index.ts",
      ),
      "openp41ge-tabs": path.resolve(__dirname, "../openp41ge-tabs/src"),
      "openp41ge-editor-engine": path.resolve(__dirname, "../openp41ge-editor-engine/src"),
      "openp41ge-uikit/theme": path.resolve(__dirname, "../openp41ge-uikit/src/theme/index.ts"),
    },
  },
});
