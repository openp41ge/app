import { defineConfig } from "vite";
import path from "path";

export default defineConfig({
  server: {
    port: 6728,
    strictPort: true,
  },
  resolve: {
    alias: {
      // uikit is served from source, and it deep-imports these packages by
      // subpath; source-alias them (mirroring file-editor-demo and the main
      // app) so Rollup can resolve the subpaths at build time.
      "openp41ge-uikit": path.resolve(__dirname, "../../packages/openp41ge-uikit/src"),
      "openp41ge-uikit/theme": path.resolve(__dirname, "../../packages/openp41ge-uikit/src/theme"),
      "openp41ge-editor-engine": path.resolve(
        __dirname,
        "../../packages/openp41ge-editor-engine/src",
      ),
      "openp41ge-syntax-highlighting": path.resolve(
        __dirname,
        "../../packages/openp41ge-syntax-highlighting/src",
      ),
      "openp41ge-tabs": path.resolve(__dirname, "../../packages/openp41ge-tabs/src"),
      "openp41ge-piece-tree": path.resolve(__dirname, "../../packages/openp41ge-piece-tree/src"),
      "openp41ge-git": path.resolve(__dirname, "../../packages/openp41ge-git/src"),
    },
  },
});
