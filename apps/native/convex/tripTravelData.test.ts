// @vitest-environment edge-runtime
import { describe, expect, it } from "vitest";
import { api, internal } from "./_generated/api";
import { joiner, listWithOwner, near } from "./sharedLists.test.helpers";
import { newConvexTest, signedInUser, setTestConsent } from "./test.setup";
import { travelLayout } from "./model/tripTravel";

async function listTrip(options: { pro?: boolean } = {}) {
  const { base, owner, token, listId } = await listWithOwner();
  const member = await joiner(base, token, options);
  const seeded = await base.run(async (ctx) => {
    const tripId = await ctx.db.insert("tripPlans", {
      userId: member.userId,
      listId,
      city: "Lisbon",
      dayCount: 1,
      pace: "balanced",
      interests: [],
      stopCount: 2,
      savedCount: 0,
    });
    const ordered = [];
    for (const [order, lat] of [
      [0, 38.7],
      [1, 38.71],
    ]) {
      const _id = await ctx.db.insert("tripStops", {
        userId: member.userId,
        tripId,
        day: 1,
        order,
        source: "list",
        name: "Fixture stop",
        lat,
        lng: -9.1,
      });
      ordered.push({ _id, lat, lng: -9.1 });
    }
    return { tripId, ordered };
  });
  const args = {
    tripId: seeded.tripId,
    day: 1,
    layout: travelLayout(seeded.ordered),
  };
  return { base, owner, token, listId, member, args, ...seeded };
}

async function setup(pro = true) {
  const base = newConvexTest();
  const user = await signedInUser(base, { pro });
  const seeded = await base.run(async (ctx) => {
    const tripId = await ctx.db.insert("tripPlans", {
      userId: user.userId,
      city: "Lisbon",
      dayCount: 2,
      pace: "balanced",
      interests: [],
      stopCount: 3,
      savedCount: 0,
    });
    const stops = [];
    for (const [day, order, lat] of [
      [1, 1, 38.71],
      [1, 0, 38.7],
      [2, 0, 38.72],
      [0, 0, 38.73],
    ]) {
      const _id = await ctx.db.insert("tripStops", {
        userId: user.userId,
        tripId,
        day,
        order,
        source: "added",
        name: "Fixture stop",
        lat,
        lng: -9.1,
      });
      stops.push({ _id, lat, lng: -9.1 });
    }
    return { tripId, ordered: [stops[1], stops[0]], otherDay: [stops[2]] };
  });
  return { base, ...user, ...seeded };
}

describe("travel time claims", () => {
  it("reads just the requested day's stops in itinerary order", async () => {
    const { t, tripId, ordered } = await setup();
    expect(
      await t.mutation(internal.tripTravelData.claimDay, {
        tripId,
        day: 1,
        layout: travelLayout(ordered),
      }),
    ).toEqual(ordered);
  });
  it("refuses stale order or coordinates, unplanned and non-existent days", async () => {
    const { t, tripId, ordered } = await setup();
    for (const stops of [
      [...ordered].reverse(),
      ordered.map((stop) => ({ ...stop, lat: 0 })),
    ]) {
      await expect(
        t.mutation(internal.tripTravelData.claimDay, {
          tripId,
          day: 1,
          layout: travelLayout(stops),
        }),
      ).rejects.toThrow("trip_layout_changed");
    }
    for (const day of [0, 3, 1.5])
      await expect(
        t.mutation(internal.tripTravelData.claimDay, {
          tripId,
          day,
          layout: travelLayout(ordered),
        }),
      ).rejects.toThrow();
  });
  it("has no leg for a single-stop day and refuses opted-out accounts", async () => {
    const { base, t, userId, tripId, ordered, otherDay } = await setup();
    expect(
      await t.mutation(internal.tripTravelData.claimDay, {
        tripId,
        day: 2,
        layout: travelLayout(otherDay),
      }),
    ).toBeNull();
    await base.run((ctx) => setTestConsent(ctx, userId, "declined"));
    expect(
      await t.mutation(internal.tripTravelData.claimDay, {
        tripId,
        day: 1,
        layout: travelLayout(ordered),
      }),
    ).toBeNull();
  });
  it("requires a live authenticated Pro owner", async () => {
    const { base, t, userId, tripId, ordered } = await setup(false);
    const other = await signedInUser(base, { pro: true });
    const args = { tripId, day: 1, layout: travelLayout(ordered) };
    for (const caller of [base, t, other.t])
      await expect(
        caller.mutation(internal.tripTravelData.claimDay, args),
      ).rejects.toThrow();
    await base.run((ctx) => ctx.db.patch(userId, { deleting: true }));
    await expect(
      t.mutation(internal.tripTravelData.claimDay, args),
    ).rejects.toThrow();
  });
});

describe("travel time claims on a trip from a shared list", () => {
  it("covers a free member while the list is covered, and refuses them after they leave", async () => {
    const { member, listId, args, ordered } = await listTrip();
    expect(
      await member.t.mutation(internal.tripTravelData.claimDay, args),
    ).toEqual(ordered);
    await member.t.mutation(api.sharedLists.leaveSharedList, { listId });
    await expect(
      member.t.mutation(internal.tripTravelData.claimDay, args),
    ).rejects.toThrow();
  });
  it("sends nothing when anyone who added a place declined, former members included", async () => {
    const { base, owner, token, listId, member, args, ordered } =
      await listTrip();
    await base.run((ctx) => setTestConsent(ctx, owner.userId, "declined"));
    expect(
      await member.t.mutation(internal.tripTravelData.claimDay, args),
    ).toBeNull();
    await base.run((ctx) => setTestConsent(ctx, owner.userId, "granted"));
    const former = await joiner(base, token, { name: "Cy Lima" });
    await former.t.mutation(api.sharedLists.addSharedListPlace, {
      listId,
      place: { name: "Red Frog", ...near(4), city: "Lisbon" },
    });
    await former.t.mutation(api.sharedLists.leaveSharedList, { listId });
    await base.run((ctx) => setTestConsent(ctx, former.userId, "declined"));
    expect(
      await member.t.mutation(internal.tripTravelData.claimDay, args),
    ).toBeNull();
    await base.run((ctx) => setTestConsent(ctx, former.userId, "granted"));
    expect(
      await member.t.mutation(internal.tripTravelData.claimDay, args),
    ).toEqual(ordered);
  });
  it("sends nothing once the list is gone, since nobody can say who added a stop", async () => {
    const { base, listId, member, args } = await listTrip({ pro: true });
    await base.run((ctx) => ctx.db.delete(listId));
    expect(
      await member.t.mutation(internal.tripTravelData.claimDay, args),
    ).toBeNull();
  });
});
