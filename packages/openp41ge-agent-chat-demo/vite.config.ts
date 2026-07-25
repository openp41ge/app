import { defineConfig } from "vite";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "openp41ge-agent-chat": path.resolve(__dirname, "../openp41ge-agent-chat/src"),
    },
  },
});
