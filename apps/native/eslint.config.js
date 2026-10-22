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
    files: ["convex/**/*.ts"],
    ignores: ["convex/**/*.test.ts", "convex/test.setup.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "CallExpression[callee.property.name='filter'][arguments.0.type='ArrowFunctionExpression'][arguments.0.params.0.name='q']",
          message:
            "A database .filter((q) => ...) scans the whole table. Add or use an index and read it with .withIndex(name, (q) => ...), or a search index. A filter on an array is fine: name its parameter for the row, not q.",
        },
      ],
    },
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
