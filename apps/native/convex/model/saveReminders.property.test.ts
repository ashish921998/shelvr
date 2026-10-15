import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  IGNORED_STREAK,
  MIN_GAP_MS,
  WEEK_MS,
  WEEKLY_LIMIT,
  preferredReminderHour,
  reminderBlocked,
} from "./saveReminders";

const HOUR_MS = 60 * 60 * 1000;

// What must never happen, whatever order the cron checks arrive in: two
// pushes within the minimum gap, or more than the weekly limit in any week.
describe("reminder budget", () => {
  it("never sends two pushes too close or too many in a week", () => {
    fc.assert(
      fc.property(
        // Gaps between successive cron checks, from a minute to two days.
        fc.array(fc.integer({ min: 60_000, max: 48 * HOUR_MS }), {
          minLength: 1,
          maxLength: 200,
        }),
        fc.boolean(),
        // When in the week the shelf is due; it then repeats weekly.
        fc.integer({ min: 0, max: WEEK_MS - 1 }),
        (gaps, shelfOn, shelfOffset) => {
          const nextShelf = (at: number) =>
            shelfOffset +
            (Math.floor((at - shelfOffset) / WEEK_MS) + 1) * WEEK_MS;
          let now = 0;
          const sent: number[] = [];
          for (const gap of gaps) {
            now += gap;
            const sentAt = sent.filter((at) => now - at < WEEK_MS);
            // Opened reminders keep the ignored-streak pause out of the way,
            // so the gap and weekly limits are what this run exercises.
            const recent = sent
              .slice(-IGNORED_STREAK)
              .reverse()
              .map((createdAt) => ({ createdAt, opened: true }));
            const shelf = shelfOn
              ? { nextAt: nextShelf(now), sentThisWeek: false }
              : undefined;
            if (reminderBlocked(now, sentAt, recent, shelf) === undefined) {
              sent.push(now);
            }
          }
          for (let i = 1; i < sent.length; i++) {
            expect(sent[i] - sent[i - 1]).toBeGreaterThanOrEqual(MIN_GAP_MS);
          }
          // Reminders make room for the shelf: none inside the gap before it.
          if (shelfOn) {
            for (const at of sent) {
              expect(nextShelf(at) - at).toBeGreaterThanOrEqual(MIN_GAP_MS);
            }
          }
          for (const start of sent) {
            const inWeek = sent.filter(
              (at) => at >= start && at - start < WEEK_MS,
            ).length;
            // An unsent shelf keeps one weekly slot for itself.
            expect(inWeek).toBeLessThanOrEqual(
              WEEKLY_LIMIT - (shelfOn ? 1 : 0),
            );
          }
        },
      ),
    );
  });

  it("never sends after three ignored reminders within a week of the last", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: WEEK_MS - 1 }), (sinceLast) => {
        const now = 10 * WEEK_MS;
        const last = now - sinceLast;
        const recent = Array.from({ length: IGNORED_STREAK }, (_, i) => ({
          createdAt: last - i * WEEK_MS,
          opened: false,
        }));
        expect(reminderBlocked(now, [], recent)).not.toBeUndefined();
      }),
    );
  });
});

describe("preferred reminder hour", () => {
  it("is always a daytime hour, whatever hours the user saves at", () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: 0, max: 23 })), (hours) => {
        const hour = preferredReminderHour(hours);
        expect(hour).toBeGreaterThanOrEqual(10);
        expect(hour).toBeLessThanOrEqual(19);
      }),
    );
  });
});
