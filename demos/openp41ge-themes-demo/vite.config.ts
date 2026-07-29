import { defineConfig } from "vite";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "openp41ge-themes": path.resolve(__dirname, "../../packages/openp41ge-themes/src"),
    },
  },
});
