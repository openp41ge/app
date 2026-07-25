import { defineConfig } from "vite";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "openp41ge-git-repository": path.resolve(__dirname, "../openp41ge-git-repository/src"),
    },
  },
});
