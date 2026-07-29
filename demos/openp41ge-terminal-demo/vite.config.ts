import { defineConfig } from "vite";
import path from "path";

export default defineConfig({
  server: {
    port: 4581,
    strictPort: true,
  },
  resolve: {
    alias: {
      "openp41ge-terminal": path.resolve(__dirname, "../../packages/openp41ge-terminal/src"),
      "openp41ge-logger": path.resolve(__dirname, "../../packages/openp41ge-logger/src"),
    },
  },
});
