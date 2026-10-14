// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");
const checkFile = require("eslint-plugin-check-file");

module.exports = defineConfig([
  expoConfig,
  {
    // Globally ignored: build output and generated Convex code (the generated
    // files carry their own eslint-disable headers, which only produce
    // unused-directive warnings when linted).
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
          // Backend modules and co-located tests are lowerCamelCase.
          "convex/**/*.{ts,tsx}": "CAMEL_CASE",
          // App code is kebab-case. Expo Router owns filenames under
          // src/app (route slugs, _layout, [param], +intent), so that
          // tree is not constrained here.
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
      // max-lines-per-function is unset: long JSX and long tests are common
      // here and lower-risk than branchy logic.
      complexity: ["error", 30],
      "max-statements": ["error", 50],
      "max-depth": ["error", 4],
      "max-nested-callbacks": ["error", 4],
      // All logging flows through the structured loggers (convex/model/log.ts
      // for the backend, analytics.captureError for the app) so events reach
      // Convex log streams and PostHog in a queryable shape. The overrides
      // below mark those two modules, tests, and src/ console.warn as the
      // only allowed console usage.
      "no-console": "error",
    },
  },
  {
    // console.warn stays in app code for transient best-effort notices that
    // are not worth an error-tracking event.
    files: ["src/**/*.{ts,tsx}"],
    rules: { "no-console": ["error", { allow: ["warn"] }] },
  },
  {
    // The loggers are the console boundary; tests spy on console to assert
    // what would have been logged.
    files: [
      "convex/model/log.ts",
      "src/lib/analytics.ts",
      "**/*.test.{ts,tsx}",
    ],
    rules: { "no-console": "off" },
  },
]);
