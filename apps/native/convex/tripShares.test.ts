// @vitest-environment edge-runtime
import { describe, expect, it } from "vitest";
import { api, internal } from "./_generated/api";
import { newConvexTest, signedInUser } from "./test.setup";

async function setup() {
  const base = newConvexTest();
  const user = await signedInUser(base, { pro: true });
  const tripId = await base.run(async (ctx) => {
    const trip = await ctx.db.insert("tripPlans", {
      userId: user.userId,
      city: "Lisbon",
      name: "Weekend",
      startDate: "2026-11-01",
      dayCount: 2,
      pace: "balanced",
      interests: [],
      stay: { name: "Private home" },
      stopCount: 2,
      savedCount: 0,
    });
    for (const [day, order, name] of [
      [1, 1, "Second"],
      [1, 0, "First"],
      [0, 0, "Maybe"],
    ] as const) {
      await ctx.db.insert("tripStops", {
        tripId: trip,
        userId: user.userId,
        day,
        order,
        name,
        source: "added",
        lat: 38.7,
        lng: -9.1,
        why: "Private note",
      });
    }
    return trip;
  });
  return { base, ...user, tripId };
}

describe("trip sharing", () => {
  it("shares only public itinerary fields, in day order, and reflects later edits", async () => {
    const { base, t, tripId } = await setup();
    const token = await t.mutation(api.tripShares.createShare, { tripId });
    expect(await t.mutation(api.tripShares.createShare, { tripId })).toBe(
      token,
    );
    expect(await t.query(api.tripShares.getShareToken, { tripId })).toBe(token);
    expect(
      await base.query(internal.tripShares.getPublicTrip, { token }),
    ).toEqual({
      name: "Weekend",
      city: "Lisbon",
      startDate: "2026-11-01",
      days: [
        [
          { name: "First", lat: 38.7, lng: -9.1 },
          { name: "Second", lat: 38.7, lng: -9.1 },
        ],
        [],
      ],
      unplanned: [{ name: "Maybe", lat: 38.7, lng: -9.1 }],
    });
    await t.mutation(api.tripPlannerData.renameTripPlan, {
      tripId,
      name: "New name",
    });
    expect(
      await base.query(internal.tripShares.getPublicTrip, { token }),
    ).toMatchObject({ name: "New name" });
  });
  it("revokes old links permanently and ignores an old revocation after resharing", async () => {
    const { base, t, tripId } = await setup();
    const token = await t.mutation(api.tripShares.createShare, { tripId });
    await t.mutation(api.tripShares.revokeShare, { tripId, token });
    expect(
      await base.query(internal.tripShares.getPublicTrip, { token }),
    ).toBeNull();
    const next = await t.mutation(api.tripShares.createShare, { tripId });
    expect(next).not.toBe(token);
    await t.mutation(api.tripShares.revokeShare, { tripId, token });
    expect(
      await base.query(internal.tripShares.getPublicTrip, { token: next }),
    ).not.toBeNull();
    await t.mutation(api.tripPlannerData.deleteTripPlan, { tripId });
    expect(
      await base.query(internal.tripShares.getPublicTrip, { token: next }),
    ).toBeNull();
  });
  it("refuses another owner, signed-out callers and deleting accounts", async () => {
    const { base, t, userId, tripId } = await setup();
    const other = await signedInUser(base, { pro: true });
    await expect(
      other.t.mutation(api.tripShares.createShare, { tripId }),
    ).rejects.toThrow();
    await expect(
      base.mutation(api.tripShares.createShare, { tripId }),
    ).rejects.toThrow();
    const token = await t.mutation(api.tripShares.createShare, { tripId });
    await expect(
      other.t.mutation(api.tripShares.revokeShare, { tripId, token }),
    ).rejects.toThrow();
    await base.run(async (ctx) => {
      await ctx.db.patch(userId, { deleting: true });
    });
    expect(
      await base.query(internal.tripShares.getPublicTrip, { token }),
    ).toBeNull();
    await expect(
      t.mutation(api.tripShares.createShare, { tripId }),
    ).rejects.toThrow();
  });
  it("requires Pro to publish but allows revocation after Pro ends", async () => {
    const { base, t, userId, tripId } = await setup();
    const token = await t.mutation(api.tripShares.createShare, { tripId });
    await base.run(async (ctx) => {
      const rows = await ctx.db
        .query("subscriptions")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect();
      for (const row of rows) await ctx.db.delete(row._id);
    });
    await expect(
      t.mutation(api.tripShares.createShare, { tripId }),
    ).rejects.toThrow();
    await t.mutation(api.tripShares.revokeShare, { tripId, token });
    expect(
      await base.query(internal.tripShares.getPublicTrip, { token }),
    ).toBeNull();
  });
});
