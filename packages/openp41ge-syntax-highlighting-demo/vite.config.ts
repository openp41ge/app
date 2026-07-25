import { defineConfig } from "vite";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "openp41ge-syntax-highlighting": path.resolve(
        __dirname,
        "../openp41ge-syntax-highlighting/src",
      ),
      "openp41ge-themes": path.resolve(__dirname, "../openp41ge-themes/src"),
    },
  },
});
