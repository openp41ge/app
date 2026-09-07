import { defineConfig } from "vite";
import path from "path";

export default defineConfig({
  server: {
    port: 6183,
    strictPort: true,
  },
  resolve: {
    alias: {
      "openp41ge-agents": path.resolve(__dirname, "../../packages/openp41ge-agents/src"),
    },
  },
});
