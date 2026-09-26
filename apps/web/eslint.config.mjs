import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import checkFile from "eslint-plugin-check-file";

export default defineConfig([
  ...nextVitals,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Local design handoffs (gitignored) carry prototype scripts.
    "design_handoff_*/**",
  ]),
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: { "check-file": checkFile },
    rules: {
      "check-file/filename-naming-convention": [
        "error",
        {
          // React components are PascalCase.
          "src/components/**/*.{ts,tsx}": "PASCAL_CASE",
          // Next App Router route files use fixed lowercase names
          // (page.tsx, layout.tsx, route.ts, ...).
          "src/app/**/*.{ts,tsx}": "KEBAB_CASE",
          // Utility modules are lowerCamelCase.
          "src/lib/**/*.{ts,tsx}": "CAMEL_CASE",
        },
        { ignoreMiddleExtensions: true },
      ],
      "@typescript-eslint/naming-convention": [
        "error",
        {
          selector: "variable",
          format: ["camelCase", "UPPER_CASE", "PascalCase"],
          leadingUnderscore: "allow",
        },
        {
          selector: "function",
          format: ["camelCase", "PascalCase"],
          leadingUnderscore: "allow",
        },
        {
          selector: "parameter",
          format: ["camelCase"],
          leadingUnderscore: "allow",
        },
        {
          selector: "method",
          format: ["camelCase"],
          leadingUnderscore: "allow",
        },
        {
          selector: "typeLike",
          format: ["PascalCase"],
          leadingUnderscore: "allow",
        },
      ],
      // max-lines-per-function is unset: long JSX and long tests are common
      // here and lower-risk than branchy logic.
      "complexity": ["error", 30],
      "max-statements": ["error", 50],
      "max-depth": ["error", 4],
      "max-nested-callbacks": ["error", 4],
      // Server logging flows through src/lib/serverLog.ts (one JSON line per
      // event for the log drain); client failures go through
      // captureWebException in src/lib/analytics.ts.
      "no-console": "error",
    },
  },
  {
    // The server logger is the console boundary; tests may spy on console.
    files: ["src/lib/serverLog.ts", "**/*.test.{ts,tsx}"],
    rules: { "no-console": "off" },
  },
]);
