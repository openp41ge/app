import { defineConfig } from "vite";
import path from "path";

export default defineConfig({
  resolve: {
    alias: [
      // Bundle the engine from source (its dist has no per-subpath .js files).
      {
        find: "openp41ge-editor-engine",
        replacement: path.resolve(__dirname, "../openp41ge-editor-engine/src"),
      },
    ],
  },
  build: {
    lib: {
      entry: {
        index: path.resolve(__dirname, "src/index.ts"),
        "json-editor": path.resolve(__dirname, "src/json-editor.ts"),
      },
      formats: ["es"],
      fileName: (format, entryName) => `${entryName}.js`,
    },
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: true,
  },
  test: {
    environment: "jsdom",
    include: ["test/**/*.test.ts"],
  },
});
