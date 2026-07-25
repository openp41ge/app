import { defineConfig } from "vite";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "openp41ge-tabs": path.resolve(__dirname, "../openp41ge-tabs/src"),
    },
  },
});
