import { defineConfig } from "vite";
import path from "path";

export default defineConfig({
  server: {
    port: 5162,
    strictPort: true,
  },
  resolve: {
    alias: {
      "openp41ge-logger": path.resolve(__dirname, "../../packages/openp41ge-logger/src"),
    },
  },
});
