import { defineConfig } from "vite";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "openp41ge-git": path.resolve(__dirname, "../../packages/openp41ge-git/src"),
    },
  },
});
