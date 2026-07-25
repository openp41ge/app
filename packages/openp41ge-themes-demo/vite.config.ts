import { defineConfig } from "vite";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "openp41ge-themes": path.resolve(__dirname, "../openp41ge-themes/src"),
    },
  },
});
