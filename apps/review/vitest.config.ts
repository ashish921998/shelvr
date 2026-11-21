import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@convex": fileURLToPath(new URL("./convex", import.meta.url)),
    },
  },
  test: {
    include: ["src/**/*.test.ts", "convex/**/*.test.ts"],
    environment: "node",
    server: { deps: { inline: ["convex-test"] } },
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
