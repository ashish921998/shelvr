import { defineConfig } from "vitest/config";
import base from "./vitest.config";

// Stryker runs only the tests that exercise the modules it mutates
// (see stryker.config.mjs). The full suite is slow per mutant and has
// process-global tests (TZ) that do not belong in a mutation run.
// Spread rather than mergeConfig: mergeConfig concatenates `include`.
export default defineConfig({
  ...base,
  test: {
    ...base.test,
    include: [
      "convex/model/entitlement.property.test.ts",
      "convex/model/revenuecat.test.ts",
      "convex/subscriptions.test.ts",
      "convex/revenuecat*.test.ts",
      "convex/paymentTelemetry.test.ts",
      "src/lib/entitlement.test.ts",
    ],
  },
});
