const { defineConfig } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");
const checkFile = require("eslint-plugin-check-file");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*", "convex/_generated/**"],
  },
  {
    files: ["**/*.{ts,tsx}"],
    ignores: ["convex/_generated/**", "modules/**"],
    plugins: { "check-file": checkFile },
    rules: {
      "check-file/filename-naming-convention": [
        "error",
        {
          "convex/**/*.{ts,tsx}": "CAMEL_CASE",
          "src/!(app)/**/*.{ts,tsx}": "KEBAB_CASE",
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
      "@typescript-eslint/no-empty-object-type": [
        "error",
        { allowInterfaces: "with-single-extends" },
      ],
      complexity: ["error", 30],
      "max-statements": ["error", 50],
      "max-depth": ["error", 4],
      "max-nested-callbacks": ["error", 4],
      "no-console": "error",
    },
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    rules: { "no-console": ["error", { allow: ["warn"] }] },
  },
  {
    files: [
      "convex/model/log.ts",
      "src/lib/analytics.ts",
      "**/*.test.{ts,tsx}",
    ],
    rules: { "no-console": "off" },
  },
]);
