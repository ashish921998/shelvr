import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  EXIT_OFFER_COOLDOWN_MS,
  EXIT_OFFER_WINDOW_MS,
  exitOfferDue,
  exitOfferEndsAt,
  exitOfferReminderAt,
  exitOfferReminderPending,
  exitOfferReminderPlan,
  formatCountdown,
  parseShownAt,
  timeLeft,
} from "./exit-offer";

const HOUR_MS = 60 * 60 * 1000;
const time = fc.integer({ min: 0, max: 4_102_444_800_000 });
const placement = fc.oneof(
  fc.constantFrom("save", "onboarding", "profile", "retry"),
  fc.string(),
);
// From a minute in the past to a year ahead, in milliseconds.
const elapsed = fc.integer({ min: -60_000, max: 365 * 24 * 60 * 60 * 1000 });

describe("exit offer window", () => {
  it("is never shown again while it is open, nor before the cooldown ends", () => {
    fc.assert(
      fc.property(placement, time, elapsed, (where, shownAt, since) => {
        const now = shownAt + since;
        const endsAt = exitOfferEndsAt(shownAt, now);
        const due = exitOfferDue(where, shownAt, now);
        // Open for exactly the window, with a deadline that never moves.
        expect(endsAt).toBe(
          since < EXIT_OFFER_WINDOW_MS ? shownAt + EXIT_OFFER_WINDOW_MS : null,
        );
        // Due again exactly when the cooldown is over, so never while open.
        expect(due).toBe(where !== "retry" && since >= EXIT_OFFER_COOLDOWN_MS);
        expect(endsAt !== null && due).toBe(false);
      }),
    );
  });

  it("is always due the first time someone leaves the paywall, except after a failed load", () => {
    fc.assert(
      fc.property(placement, time, (where, now) => {
        expect(exitOfferDue(where, null, now)).toBe(where !== "retry");
        expect(exitOfferEndsAt(null, now)).toBeNull();
      }),
    );
  });

  it("survives a round trip through storage", () => {
    fc.assert(
      fc.property(time, (shownAt) => {
        expect(parseShownAt(String(shownAt))).toBe(shownAt);
      }),
    );
    fc.assert(
      fc.property(fc.option(fc.string(), { nil: null }), (stored) => {
        const parsed = parseShownAt(stored);
        expect(parsed === null || Number.isFinite(parsed)).toBe(true);
      }),
    );
  });
});

describe("exit offer reminder", () => {
  it("is only ever scheduled in the future and before the offer closes", () => {
    fc.assert(
      fc.property(time, elapsed, (endsAt, until) => {
        const now = endsAt - until;
        const fireAt = exitOfferReminderAt(endsAt, now);
        // Three hours before the close, unless that is under a minute away.
        expect(fireAt).toBe(
          until - 3 * HOUR_MS > 60_000 ? endsAt - 3 * HOUR_MS : null,
        );
        if (fireAt !== null) {
          expect(fireAt).toBeGreaterThan(now);
          expect(fireAt).toBeLessThan(endsAt);
          // A reminder that can still be scheduled can still be cancelled.
          expect(exitOfferReminderPending(endsAt, now)).toBe(true);
        }
      }),
    );
  });

  it("is cancelled once the offer is gone and never scheduled for a closed one", () => {
    fc.assert(
      fc.property(fc.option(time, { nil: null }), elapsed, (endsAt, until) => {
        const now = (endsAt ?? 0) - until;
        const plan = exitOfferReminderPlan(endsAt, now);
        if (endsAt === null || now >= endsAt) {
          expect(plan).toEqual({ kind: "cancel" });
          return;
        }
        // An open offer schedules its reminder while there is still time
        // to, and after that leaves whatever is scheduled alone.
        expect(plan).toEqual(
          endsAt - now - 3 * HOUR_MS > 60_000
            ? { kind: "schedule", fireAt: endsAt - 3 * HOUR_MS }
            : { kind: "keep" },
        );
      }),
    );
  });
});

describe("exit offer countdown", () => {
  const remaining = fc.integer({ min: -1000, max: 2 * EXIT_OFFER_WINDOW_MS });

  it("never shows more time than is left, and loses less than a second", () => {
    fc.assert(
      fc.property(remaining, (ms) => {
        const text = formatCountdown(ms);
        expect(text).toMatch(/^\d{2,}:[0-5]\d:[0-5]\d$/);
        const [hours, minutes, seconds] = text.split(":").map(Number);
        const shown = ((hours * 60 + minutes) * 60 + seconds) * 1000;
        const left = Math.max(0, ms);
        expect(shown).toBeLessThanOrEqual(left);
        expect(left - shown).toBeLessThan(1000);
      }),
    );
  });

  it("rounds the hours and minutes left down, never up", () => {
    fc.assert(
      fc.property(remaining, (ms) => {
        const { hours, minutes } = timeLeft(ms);
        expect(minutes).toBeGreaterThanOrEqual(0);
        expect(minutes).toBeLessThan(60);
        const shown = (hours * 60 + minutes) * 60_000;
        const left = Math.max(0, ms);
        expect(shown).toBeLessThanOrEqual(left);
        expect(left - shown).toBeLessThan(60_000);
      }),
    );
  });
});
