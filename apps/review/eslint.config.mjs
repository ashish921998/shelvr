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
    "convex/_generated/**",
  ]),
  {
    files: ["src/**/*.{ts,tsx}", "convex/**/*.ts"],
    plugins: { "check-file": checkFile },
    rules: {
      "check-file/filename-naming-convention": [
        "error",
        {
          "src/components/**/*.{ts,tsx}": "PASCAL_CASE",
          "src/app/**/*.{ts,tsx}": "KEBAB_CASE",
          "src/lib/**/*.{ts,tsx}": "CAMEL_CASE",
          "convex/**/*.ts": "CAMEL_CASE",
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
      complexity: ["error", 30],
      "max-statements": ["error", 50],
      "max-depth": ["error", 4],
      "max-nested-callbacks": ["error", 4],
      "no-console": "error",
    },
  },
  {
    files: ["**/*.test.{ts,tsx}"],
    rules: { "no-console": "off" },
  },
]);
