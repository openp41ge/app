import { defineConfig } from "vite";
import path from "path";

export default defineConfig({
  server: {
    port: 8452,
    strictPort: true,
  },
  resolve: {
    alias: {
      "openp41ge-git": path.resolve(__dirname, "../../packages/openp41ge-git/src"),
    },
  },
});
