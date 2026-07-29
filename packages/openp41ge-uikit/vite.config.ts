import { defineConfig } from "vite";
import path from "path";

export default defineConfig({
  build: {
    lib: {
      entry: {
        index: path.resolve(__dirname, "src/index.ts"),
        theme: path.resolve(__dirname, "src/theme/index.ts"),
        tabs: path.resolve(__dirname, "src/tabs/index.ts"),
        "syntax-highlighting": path.resolve(__dirname, "src/syntax-highlighting/index.ts"),
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
  },
});
