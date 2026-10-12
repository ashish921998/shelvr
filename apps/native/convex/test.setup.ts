import { convexTest } from "convex-test";
import { register as registerRateLimiter } from "@convex-dev/rate-limiter/test";
import schema from "./schema";
import { vi } from "vitest";

export function revenuecatSnapshot({
  entitlement = "Shelvr Pro",
  productId,
  expiresAt = Date.now() + 60_000,
  graceUntil,
  periodType = "normal",
}: {
  entitlement?: string;
  productId?: string;
  expiresAt?: number;
  graceUntil?: number;
  periodType?: string;
} = {}) {
  return {
    request_date_ms: Date.now(),
    subscriber: {
      entitlements: productId
        ? {
            [entitlement]: {
              product_identifier: productId,
              expires_date: new Date(expiresAt).toISOString(),
              ...(graceUntil === undefined
                ? {}
                : {
                    grace_period_expires_date: new Date(
                      graceUntil,
                    ).toISOString(),
                  }),
            },
          }
        : {},
      subscriptions: productId
        ? { [productId]: { period_type: periodType } }
        : {},
    },
  };
}

export function stubRevenueCatFetch(body: unknown) {
  const fetchMock = vi.fn().mockImplementation(async () => Response.json(body));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

// The module map lets convex-test discover and load function files.
const modules = import.meta.glob("./**/*.ts");

/**
 * Build a convex-test instance with the rate-limiter component registered.
 * Every test must go through this — mutations that call `rateLimiter.limit`
 * fail with "Component not registered" against a bare `convexTest(schema, ...)`.
 */
export function newConvexTest() {
  const t = convexTest(schema, modules);
  registerRateLimiter(t);
  return t;
}
