import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  mapPaywallResult,
  restoreFoundAccess,
  shouldOpenPaywallFallback,
} from "./paywall-result";

const sdkResult = fc.oneof(
  fc.constantFrom(
    "NOT_PRESENTED",
    "ERROR",
    "CANCELLED",
    "PURCHASED",
    "RESTORED",
    null,
    undefined,
  ),
  fc.string(),
);

describe("mapPaywallResult", () => {
  it("only counts a purchase or restore as success, whatever else the SDK returns", () => {
    fc.assert(
      fc.property(sdkResult, (result) => {
        const outcome = mapPaywallResult(result);
        expect(outcome === "success").toBe(
          result === "PURCHASED" || result === "RESTORED",
        );
        expect(outcome === "cancelled").toBe(result === "CANCELLED");
        // Closing the paywall goes back; only a failure opens the fallback.
        expect(shouldOpenPaywallFallback(outcome)).toBe(
          outcome === "unavailable",
        );
      }),
    );
  });
});

describe("restoreFoundAccess", () => {
  it("counts a restore only when it found at least one entitlement", () => {
    fc.assert(
      fc.property(
        fc.option(fc.dictionary(fc.string(), fc.constant({})), { nil: null }),
        (active) => {
          const info = active === null ? null : { entitlements: { active } };
          expect(restoreFoundAccess(info)).toBe(
            active !== null && Object.keys(active).length > 0,
          );
        },
      ),
    );
  });
});
