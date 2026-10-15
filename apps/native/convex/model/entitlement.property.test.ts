import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  isEntitled,
  isEntitledStatus,
  type SubscriptionStatus,
} from "./entitlement";

const status = fc.constantFrom<SubscriptionStatus | "none">(
  "trialing",
  "pro",
  "lapsed",
  "lifetime",
  "none",
);
const time = fc.integer({ min: 0, max: 4_102_444_800_000 });
const expiresAt = fc.option(time, { nil: undefined });

describe("isEntitled", () => {
  it("never gives access to a lapsed or missing subscription, and never takes it from a lifetime one", () => {
    fc.assert(
      fc.property(expiresAt, time, (expires, now) => {
        expect(isEntitled("lapsed", expires, now)).toBe(false);
        expect(isEntitled("none", expires, now)).toBe(false);
        expect(isEntitled("lifetime", expires, now)).toBe(true);
      }),
    );
  });

  it("gives a trial or subscription access until it expires and never after", () => {
    fc.assert(
      fc.property(
        fc.constantFrom<SubscriptionStatus>("trialing", "pro"),
        expiresAt,
        time,
        (paid, expires, now) => {
          expect(isEntitled(paid, expires, now)).toBe(
            expires !== undefined && now < expires,
          );
        },
      ),
    );
  });

  it("never gives access back as time passes", () => {
    fc.assert(
      fc.property(status, expiresAt, time, time, (s, expires, a, b) => {
        const [earlier, later] = a <= b ? [a, b] : [b, a];
        if (!isEntitled(s, expires, earlier)) {
          expect(isEntitled(s, expires, later)).toBe(false);
        }
      }),
    );
  });

  it("is never more generous than the clock-free status check", () => {
    fc.assert(
      fc.property(status, expiresAt, time, (s, expires, now) => {
        if (isEntitled(s, expires, now)) {
          expect(isEntitledStatus(s)).toBe(true);
        }
      }),
    );
  });
});
