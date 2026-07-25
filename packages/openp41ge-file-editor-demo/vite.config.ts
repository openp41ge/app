import { defineConfig } from "vite";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "openp41ge-file-editor": path.resolve(__dirname, "../openp41ge-file-editor/src"),
    },
  },
});
