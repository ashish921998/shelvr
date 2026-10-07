import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig([
  globalIgnores([".e2e/**", "node_modules/**"]),
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.ts"],
    rules: {
      // Same limits as the app packages.
      complexity: ["error", 30],
      "max-statements": ["error", 50],
      "max-depth": ["error", 4],
      "max-nested-callbacks": ["error", 4],
      "no-console": "error",
    },
  },
]);
