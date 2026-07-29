import { defineConfig } from "vite";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "openp41ge-uikit": path.resolve(__dirname, "../../packages/openp41ge-uikit/src"),
    },
  },
});
