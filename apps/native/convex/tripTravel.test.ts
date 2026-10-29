import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { api } from "./_generated/api";
import { newConvexTest, signedInUser, setTestConsent } from "./test.setup";
import { travelLayout, travelLegKey } from "./model/tripTravel";
import { appleTravelEstimate, travelAccessToken } from "./model/appleTravel";

vi.mock("./model/appleTravel", () => ({
  appleTravelEstimate: vi.fn(),
  travelAccessToken: vi.fn(),
}));
beforeEach(() => {
  vi.resetAllMocks();
  for (const key of [
    "APPLE_MAPS_PRIVATE_KEY",
    "APPLE_MAPS_KEY_ID",
    "APPLE_MAPS_TEAM_ID",
  ])
    vi.stubEnv(key, "test");
  vi.mocked(travelAccessToken).mockResolvedValue("test-token");
  vi.mocked(appleTravelEstimate).mockResolvedValue({
    seconds: 120,
    meters: 300,
  });
});
afterEach(() => vi.unstubAllEnvs());
async function setup() {
  const base = newConvexTest();
  const user = await signedInUser(base, { pro: true });
  const seeded = await base.run(async (ctx) => {
    const tripId = await ctx.db.insert("tripPlans", {
      userId: user.userId,
      city: "Lisbon",
      dayCount: 2,
      pace: "balanced",
      interests: [],
      stopCount: 6,
      savedCount: 0,
    });
    const stops = [];
    for (let order = 0; order < 6; order++) {
      const lat = 38.7 + order * 0.001;
      const _id = await ctx.db.insert("tripStops", {
        userId: user.userId,
        tripId,
        day: 1,
        order,
        name: "Fixture stop",
        source: "added",
        lat,
        lng: -9.1,
      });
      stops.push({ _id, lat, lng: -9.1 });
    }
    return { tripId, stops };
  });
  return { base, ...user, ...seeded };
}
it("requests each adjacent pair exactly once, including across request batches", async () => {
  const { t, tripId, stops } = await setup();
  const legs = await t.action(api.tripTravel.estimateDay, {
    tripId,
    day: 1,
    mode: "driving",
    layout: travelLayout(stops),
  });
  expect(travelAccessToken).toHaveBeenCalledTimes(1);
  expect(appleTravelEstimate).toHaveBeenCalledTimes(5);
  for (let i = 1; i < stops.length; i++) {
    expect(appleTravelEstimate).toHaveBeenNthCalledWith(
      i,
      "test-token",
      stops[i - 1],
      stops[i],
      "driving",
    );
    expect(legs?.[i - 1]).toEqual({
      key: travelLegKey(stops[i - 1], stops[i]),
      estimate: { seconds: 120, meters: 300 },
    });
  }
});
it("leaves a missing route null without losing the other estimates", async () => {
  const { t, tripId, stops } = await setup();
  vi.mocked(appleTravelEstimate).mockResolvedValueOnce(null);
  const legs = await t.action(api.tripTravel.estimateDay, {
    tripId,
    day: 1,
    mode: "walking",
    layout: travelLayout(stops),
  });
  expect(legs?.[0].estimate).toBeNull();
  expect(legs?.[1].estimate?.seconds).toBe(120);
});
it("sends nothing to Apple for stale layouts or opted-out users", async () => {
  const { base, t, userId, tripId, stops } = await setup();
  await expect(
    t.action(api.tripTravel.estimateDay, {
      tripId,
      day: 1,
      mode: "walking",
      layout: "stale",
    }),
  ).rejects.toThrow("trip_layout_changed");
  await base.run((ctx) => setTestConsent(ctx, userId, "declined"));
  expect(
    await t.action(api.tripTravel.estimateDay, {
      tripId,
      day: 1,
      mode: "walking",
      layout: travelLayout(stops),
    }),
  ).toBeNull();
  expect(travelAccessToken).not.toHaveBeenCalled();
  expect(appleTravelEstimate).not.toHaveBeenCalled();
});
