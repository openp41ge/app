import { defineConfig } from "vite";
import path from "path";

export default defineConfig({
  build: {
    lib: {
      entry: path.resolve(__dirname, "src/index.ts"),
      formats: ["es"],
      fileName: "index",
    },
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: true,
    // Don't extract CSS — components inline it from generated/tailwind.ts
    cssCodeSplit: false,
  },
});
