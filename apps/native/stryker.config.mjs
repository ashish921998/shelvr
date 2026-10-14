// Mutation testing pilot. Not part of CI: run `pnpm --filter native-app mutate`.
// Scope is deliberately narrow (pure billing/entitlement modules). To pilot
// another module, add it to `mutate` and its tests to vitest.mutation.config.ts.
export default {
  testRunner: "vitest",
  vitest: { configFile: "vitest.mutation.config.ts", related: false },
  plugins: ["@stryker-mutator/vitest-runner"],
  mutate: ["convex/model/entitlement.ts", "convex/model/revenuecat.ts"],
  coverageAnalysis: "perTest",
  reporters: ["clear-text", "progress", "html"],
  htmlReporter: { fileName: "reports/mutation/index.html" },
  tempDirName: ".stryker-tmp",
  thresholds: { high: 90, low: 75, break: null },
};
