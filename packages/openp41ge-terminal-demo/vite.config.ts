import { defineConfig } from "vite";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "openp41ge-terminal": path.resolve(__dirname, "../openp41ge-terminal/src"),
      "openp41ge-logger": path.resolve(__dirname, "../openp41ge-logger/src"),
    },
  },
});
