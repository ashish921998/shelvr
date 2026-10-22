import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@convex": fileURLToPath(new URL("./convex", import.meta.url)),
      "progressive-blur": fileURLToPath(
        new URL("./modules/progressive-blur", import.meta.url),
      ),
      "recent-saves-widget": fileURLToPath(
        new URL("./modules/recent-saves-widget", import.meta.url),
      ),
    },
  },
  test: {
    setupFiles: ["./src/test.setup.ts"],
    include: ["src/**/*.test.ts", "src/**/*.test.tsx", "convex/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      reportsDirectory: "./coverage",
      include: ["convex/**/*.ts", "src/lib/**/*.ts", "src/lib/**/*.tsx"],
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
