import { defineConfig } from "vite";
import path from "path";

export default defineConfig({
  build: {
    lib: {
      entry: {
        // Full library (includes the DOM/Lit web component) for the renderer.
        index: path.resolve(__dirname, "src/index.ts"),
        // Node-safe entry used by the Electron main process (no Lit / DOM).
        search: path.resolve(__dirname, "src/search.ts"),
      },
      formats: ["es"],
      fileName: (_format, entryName) => `${entryName}.js`,
    },
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: true,
  },
});
