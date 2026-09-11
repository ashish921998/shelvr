import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import checkFile from "eslint-plugin-check-file";

export default defineConfig([
  ...nextVitals,
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),
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
    },
  },
]);
