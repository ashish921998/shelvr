import * as fc from "fast-check";
import { afterAll, describe, expect, it, vi } from "vitest";
import { trialLastDayAt } from "./trial-reminder";

// Local dates follow process.env.TZ, so each case below picks a zone that
// changes its clocks and restores the original zone after.
const originalTz = process.env.TZ;
afterAll(() => {
  process.env.TZ = originalTz;
});

vi.mock("react-native", () => ({ Platform: { OS: "ios" } }));
vi.mock("@/lib/i18n", () => ({ t: (key: string) => key }));
vi.mock("@/lib/analytics", () => ({
  analytics: { capture: vi.fn(), captureError: vi.fn() },
}));
vi.mock("@/lib/current-user", () => ({ useCurrentUser: vi.fn() }));
vi.mock("@convex/_generated/api", () => ({ api: {} }));
vi.mock("@convex-dev/react-query", () => ({ convexQuery: vi.fn() }));
vi.mock("@tanstack/react-query", () => ({ useQuery: vi.fn() }));
vi.mock("@/lib/entitlement", () => ({
  useEntitlement: vi.fn(),
  waitForSheetTransition: vi.fn(),
  whenSheetSettled: vi.fn(),
}));
vi.mock("expo-secure-store", () => ({ getItem: vi.fn(), setItem: vi.fn() }));
vi.mock("expo-notifications", () => ({}));

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const RENEWAL_WINDOW = 25 * HOUR;
const ZONES = [
  "America/New_York",
  "Europe/London",
  "Australia/Sydney",
  "Asia/Kolkata",
];

const lastDay = (expiresAt: number) =>
  trialLastDayAt(expiresAt, expiresAt - 7 * DAY);

describe("last-day reminder across a clock change", () => {
  it("still reminds a trial ending at 11:30 the day clocks spring forward", () => {
    process.env.TZ = "America/New_York";
    // 2 am on 14 March 2027 skips to 3 am.
    const expiresAt = new Date(2027, 2, 14, 11, 30).getTime();
    const fireAt = lastDay(expiresAt);
    expect(fireAt).toBe(expiresAt - RENEWAL_WINDOW);
    expect(new Date(fireAt ?? 0)).toEqual(new Date(2027, 2, 13, 9, 30));
  });

  it.each(ZONES)(
    "in %s, reminds every trial ending from 11 am, never inside the renewal window",
    (zone) => {
      process.env.TZ = zone;
      fc.assert(
        fc.property(
          fc.integer({ min: 2026, max: 2028 }),
          // The months around the clock changes, north and south.
          fc.constantFrom(2, 3, 9, 10),
          fc.integer({ min: 1, max: 28 }),
          fc.integer({ min: 0, max: 23 }),
          fc.integer({ min: 0, max: 59 }),
          (year, month, day, hour, minute) => {
            const expiresAt = new Date(
              year,
              month,
              day,
              hour,
              minute,
            ).getTime();
            const ends = new Date(expiresAt);
            const fireAt = lastDay(expiresAt);
            if (ends.getHours() >= 11) expect(fireAt).not.toBeNull();
            if (fireAt === null) return;
            expect(fireAt).toBeLessThanOrEqual(expiresAt - RENEWAL_WINDOW);
            const fire = new Date(fireAt);
            const dayBefore = new Date(expiresAt);
            dayBefore.setDate(dayBefore.getDate() - 1);
            expect(fire.toDateString()).toBe(dayBefore.toDateString());
            expect(fire.getHours()).toBeGreaterThanOrEqual(9);
            expect(
              fire.getHours() * 60 + fire.getMinutes(),
            ).toBeLessThanOrEqual(19 * 60);
          },
        ),
        { seed: 20261009, numRuns: 10_000 },
      );
    },
  );
});
