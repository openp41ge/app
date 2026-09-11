import { defineConfig } from "vite";
import path from "path";

export default defineConfig({
  root: "src/renderer",
  base: "./",
  build: {
    outDir: "../../dist",
    emptyOutDir: true,
  },
  resolve: {
    alias: [
      // @openp41ge/layout is internal to the openp41ge package
      { find: "@openp41ge/layout", replacement: path.resolve(__dirname, "src/layout") },

      // Source aliases for dev mode — vite serves directly from lib package source      // so changes are picked up without rebuilds. Build output (dist/) is still
      // used by nx run-many -t build for production builds.
      { find: "openp41ge-git", replacement: path.resolve(__dirname, "../openp41ge-git/src") },
      { find: "openp41ge-logger", replacement: path.resolve(__dirname, "../openp41ge-logger/src") },
      {
        find: "openp41ge-constants",
        replacement: path.resolve(__dirname, "../openp41ge-constants/src"),
      },
      {
        find: "openp41ge-scrollbar",
        replacement: path.resolve(__dirname, "../openp41ge-scrollbar/src"),
      },
      {
        find: "openp41ge-filesystem",
        replacement: path.resolve(__dirname, "../openp41ge-filesystem/src"),
      },
      { find: "openp41ge-uikit", replacement: path.resolve(__dirname, "../openp41ge-uikit/src") },
      {
        find: "openp41ge-uikit/theme",
        replacement: path.resolve(__dirname, "../openp41ge-uikit/src/theme"),
      },
      {
        find: "openp41ge-syntax-highlighting",
        replacement: path.resolve(__dirname, "../openp41ge-syntax-highlighting/src"),
      },
      { find: "openp41ge-tabs", replacement: path.resolve(__dirname, "../openp41ge-tabs/src") },
      {
        find: "openp41ge-editor-engine",
        replacement: path.resolve(__dirname, "../openp41ge-editor-engine/src"),
      },
      {
        find: "openp41ge-file-editor",
        replacement: path.resolve(__dirname, "../openp41ge-uikit/src/file-editor"),
      },
      {
        find: "openp41ge-uikit/git-repository",
        replacement: path.resolve(__dirname, "../openp41ge-uikit/src/git-repository"),
      },
      {
        find: "openp41ge-terminal",
        replacement: path.resolve(__dirname, "../openp41ge-terminal/src"),
      },
      {
        find: "openp41ge-agents",
        replacement: path.resolve(__dirname, "../openp41ge-agents/src"),
      },
    ],
  },

  server: {
    port: 8642,
    strictPort: true,
  },

  // Replace the OPENP41GE_DEBUG env var with a build-time constant so the
  // renderer can check it (agents: OPENP41GE_DEBUG=1 seeds a debug session).
  define: {
    __OPENP41GE_DEBUG__: JSON.stringify(
      process.env.OPENP41GE_DEBUG === "1" || process.env.OPENP41GE_DEBUG === "true",
    ),
  },
});
