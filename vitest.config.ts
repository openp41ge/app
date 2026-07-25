/**
 * Root vitest configuration — discovers all tests under packages/{name}/test/.
 */

import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    include: ["packages/*/test/**/*.test.ts"],

    // jsdom for DOM APIs (components depend on customElements, ShadowRoot, etc.)
    environment: "jsdom",

    // Provide jest-compatible globals (describe, it, expect, vi)
    globals: true,

    // Suppress Pact anonymous tracking notice
    env: {
      PACT_DO_NOT_TRACK: "true",
    },

    // Never watch — AI-run tests must exit cleanly
    watch: false,

    // Timeout
    testTimeout: 10000,

    // Shared setup file
    setupFiles: [path.resolve(__dirname, "./packages/openp41ge/test/unit/setup.ts")],

    // Suppress known noisy patterns from test output
    onConsoleLog(log: string, type: "stdout" | "stderr"): false | void {
      const suppressed = [
        "Lit is in dev mode",
        "Multiple versions of Lit",
        "no state handler found for state",
        "Note: Existing pact is an older specification",
        "DeprecationWarning",
        "The `util._extend` API is deprecated",
        "HTMLCanvasElement's getContext()",
        "[operation-dispatcher]",
        "[real-drag-handler]",
        "[config-service]",
        "[ConfigService]",
        "Error unmounting controller:",
        "Unhandled Rejection:",
      ];
      for (const pattern of suppressed) {
        if (log.includes(pattern)) return false;
      }
    },

    // Reporters — console output stays concise, detailed reports go to test-results/
    reporters: ["dot", "junit", "json"],
    outputFile: {
      junit: "./test-results/junit.xml",
      json: "./test-results/results.json",
    },

    // Coverage — include all packages' src directories
    coverage: {
      provider: "istanbul",
      include: [
        "./packages/openp41ge/src/**/*.ts",
        "./packages/openp41ge-file-editor/src/**/*.ts",
        "./packages/openp41ge-logger/src/**/*.ts",
        "./packages/openp41ge-terminal/src/**/*.ts",
        "./packages/openp41ge-agent-chat/src/**/*.ts",
        "./packages/openp41ge-git-repository/src/**/*.ts",
        "./packages/openp41ge-syntax-highlighting/src/**/*.ts",
        "./packages/openp41ge-themes/src/**/*.ts",
      ],
      exclude: [
        "**/node_modules/**",
        "**/dist/**",
        "**/*.test.ts",
        "**/__tests__/**",
        // Index files and barrel exports
        "**/index.ts",
        "**/global.d.ts",
        // Per-package exclusions
        "./packages/openp41ge/src/renderer/**",
        "./packages/openp41ge/src/main/**",
        "./packages/openp41ge-file-editor/src/interfaces/**",
        "./packages/openp41ge-logger/src/viewer.ts",
        "./packages/openp41ge-terminal/src/shell/index.ts",
        "./packages/openp41ge-terminal/src/shell/shell-connector.ts",
      ],
      reporter: ["text-summary", "lcov", "html"],
      reportsDirectory: "./test-results/coverage",
      // Thresholds will be re-enabled after migration is stable
      // thresholds: { statements: 95, branches: 95, functions: 95, lines: 95 },
    },
  },

  // Path aliases matching packages/src directories
  resolve: {
    alias: {
      "@openp41ge": path.resolve(__dirname, "./packages/openp41ge/src"),
      "@openp41ge-file-editor": path.resolve(__dirname, "./packages/openp41ge-file-editor/src"),
      "@openp41ge-logger": path.resolve(__dirname, "./packages/openp41ge-logger/src"),
      "@openp41ge-terminal": path.resolve(__dirname, "./packages/openp41ge-terminal/src"),
      "@openp41ge-agent-chat": path.resolve(__dirname, "./packages/openp41ge-agent-chat/src"),
      "@openp41ge-git-repository": path.resolve(
        __dirname,
        "./packages/openp41ge-git-repository/src",
      ),
    },
  },
});
