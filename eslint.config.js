import tsParser from "@typescript-eslint/parser";
import tseslintPlugin from "@typescript-eslint/eslint-plugin";

export default [
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/coverage/**",
      "**/*.js",
      "**/*.cjs",
      "**/*.mjs",
      "**/__tests__/**",
      "**/*.d.ts",
      "**/test/",
    ],
  },
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parser: tsParser,
    },
    plugins: {
      "@typescript-eslint": tseslintPlugin,
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none" },
      ],
      "@typescript-eslint/consistent-type-imports": ["error", { prefer: "type-imports" }],
      "no-var": "error",
      "no-console": "error",
      "max-classes-per-file": ["error", 1],
    },
  },
  // ── Demo packages: lenient rules for quick prototyping ──
  {
    files: ["demos/*-demo/**/*.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "no-console": "off",
    },
  },
  // ── Electron main process: console is the primary logging mechanism ──
  {
    files: ["packages/openp41ge/electron/**/*.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "no-console": "off",
    },
  },
  // ── openp41ge-logger: intentionally uses console as output backend ──
  {
    files: ["packages/openp41ge-logger/**/*.ts"],
    rules: {
      "no-console": "off",
    },
  },
];
