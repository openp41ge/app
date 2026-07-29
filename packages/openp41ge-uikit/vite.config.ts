import { defineConfig } from "vite";
import path from "path";

export default defineConfig({
  build: {
    lib: {
      entry: {
        index: path.resolve(__dirname, "src/index.ts"),
        theme: path.resolve(__dirname, "src/theme/index.ts"),
        "git-repository": path.resolve(__dirname, "src/git-repository/index.ts"),
        "file-editor": path.resolve(__dirname, "src/file-editor/index.ts"),
      },
      formats: ["es"],
      fileName: (format, entryName) => `${entryName}.js`,
    },
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: true,
    // Don't extract CSS — components inline it from generated/tailwind.ts
    cssCodeSplit: false,
    rollupOptions: {
      external: [
        /^openp41ge-/,
      ],
    },
  },
});
