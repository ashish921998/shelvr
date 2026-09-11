import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Node is the default environment so plain-TS tests (and later Node-only
// modules like `undici` in convex/model/safe-fetch.ts) load without an edge
// runtime. Convex-function tests opt into edge-runtime per-file via a
// `// @vitest-environment edge-runtime` pragma, preserving the Convex-runtime
// fidelity the guidelines call for without breaking Node-runtime tests.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@convex": fileURLToPath(new URL("./convex", import.meta.url)),
    },
  },
  test: {
    include: ["src/**/*.test.ts", "convex/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      reportsDirectory: "./coverage",
      include: ["convex/**/*.ts", "src/lib/**/*.ts"],
      exclude: ["**/*.test.ts", "convex/_generated/**", "convex/test.setup.ts"],
      thresholds: {
        statements: 60,
        branches: 55,
        functions: 60,
        lines: 60,
      },
    },
  },
});
