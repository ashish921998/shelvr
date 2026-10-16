// @vitest-environment edge-runtime
// The weekly shelf is booked at Sunday 09:00 in the user's zone, and its
// idempotency key must be that same local week. East of UTC+9 the booked
// instant is still Saturday in UTC, so a UTC week key would file the shelf
// under the week before, find that week's row and drop the shelf.
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TestConvexForDataModel } from "convex-test";
import { api, internal } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import { newConvexTest, signedInUser } from "./test.setup";

type TestCtx = TestConvexForDataModel<DataModel>;

async function seedItems(t: TestCtx, userId: string, count: number) {
  await t.run(async (ctx) => {
    for (let i = 0; i < count; i++) {
      await ctx.db.insert("items", {
        userId,
        type: "note",
        status: "ready",
        title: `note save ${i}`,
        tags: ["note"],
        searchText: `note save ${i}`,
      });
    }
  });
}

afterEach(() => {
  vi.useRealTimers();
});

describe("weekly shelf after a zone change", () => {
  it("still sends next week's shelf when the user's Sunday moves east of UTC+9", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    // Monday 5 Jan 2026, at home in Los Angeles.
    vi.setSystemTime(Date.UTC(2026, 0, 5, 12));
    const backend = newConvexTest();
    const { t, userId } = await signedInUser(backend);
    await seedItems(t, userId, 3);
    await t.mutation(api.notifications.setPreferences, {
      weeklyShelfEnabled: true,
      timezone: "America/Los_Angeles",
    });
    const home = await t.query(api.notifications.getPreferences, {});
    // Sunday 11 Jan 09:00 PST.
    expect(home.nextDigestAt).toBe(Date.UTC(2026, 0, 11, 17));

    const firstRun = home.nextDigestAt! + 5 * 60_000;
    vi.setSystemTime(firstRun);
    await t.mutation(internal.notifications.prepareWeeklyDigest, {
      userId,
      now: firstRun,
    });
    expect(
      await backend.run((ctx) => ctx.db.query("weeklyDigests").collect()),
    ).toHaveLength(1);

    // Tuesday: landed in Sydney, three fresh saves, the app reports the zone.
    vi.setSystemTime(Date.UTC(2026, 0, 13, 12));
    await seedItems(t, userId, 3);
    await t.mutation(api.notifications.setPreferences, {
      weeklyShelfEnabled: true,
      timezone: "Australia/Sydney",
    });
    const away = await t.query(api.notifications.getPreferences, {});
    // Sunday 18 Jan 09:00 AEDT is Saturday 17 Jan 22:00 UTC.
    expect(away.nextDigestAt).toBe(Date.UTC(2026, 0, 17, 22));

    const secondRun = away.nextDigestAt! + 5 * 60_000;
    vi.setSystemTime(secondRun);
    await t.mutation(internal.notifications.prepareWeeklyDigest, {
      userId,
      now: secondRun,
    });

    // One shelf per user-week: the Sydney Sunday is a new week for the user.
    expect(
      await backend.run((ctx) => ctx.db.query("weeklyDigests").collect()),
    ).toHaveLength(2);
  });
});
