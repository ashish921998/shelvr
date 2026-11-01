// @vitest-environment edge-runtime
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { newConvexTest, signedInUser } from "./test.setup";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const EVE = Date.parse("2026-09-25T12:30:00Z");
const START = "2026-09-26";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(EVE - 3 * DAY);
  vi.stubEnv("SAVE_REMINDERS_ENABLED", "true");
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const json = (data: unknown) =>
  new Response(JSON.stringify({ data }), { status: 200 });

type StopSpec = [source: Doc<"tripStops">["source"], day: number];

async function setup({
  device = true,
  preferences = {},
  startDate = START,
  stops = [["save", 1]],
  createdAt = EVE - 3 * DAY,
  locale = "en",
  withPreferences = true,
  article = false,
  newerTrip = false,
}: {
  device?: boolean;
  preferences?: Partial<Doc<"notificationPreferences">>;
  startDate?: string | null;
  stops?: StopSpec[];
  createdAt?: number;
  locale?: string;
  withPreferences?: boolean;
  article?: boolean;
  newerTrip?: boolean;
} = {}) {
  const t = newConvexTest();
  vi.setSystemTime(EVE - 10 * DAY);
  const { t: user, userId } = await signedInUser(t);
  if (article)
    await t.run((ctx) =>
      ctx.db.insert("items", {
        userId,
        status: "ready",
        tags: [],
        searchText: "",
        type: "link",
        title: "Why bread rises",
        content: "A long read about yeast.",
      }),
    );
  vi.setSystemTime(createdAt);
  const tripId = await t.run(async (ctx) => {
    const id = await ctx.db.insert("tripPlans", {
      userId,
      city: "Lisbon",
      ...(startDate !== null ? { startDate } : {}),
      dayCount: 2,
      pace: "balanced",
      interests: [],
      stopCount: stops.length,
      savedCount: stops.length,
    });
    for (const [index, [source, day]] of stops.entries())
      await ctx.db.insert("tripStops", {
        tripId: id,
        userId,
        day,
        order: index,
        source,
        name: `Place ${index}`,
        lat: 38.7,
        lng: -9.1,
      });
    return id;
  });
  const newerTripId = !newerTrip
    ? undefined
    : await t.run(async (ctx) => {
        const id = await ctx.db.insert("tripPlans", {
          userId,
          city: "Porto",
          startDate: START,
          dayCount: 2,
          pace: "balanced",
          interests: [],
          stopCount: 1,
          savedCount: 1,
        });
        await ctx.db.insert("tripStops", {
          tripId: id,
          userId,
          day: 1,
          order: 0,
          source: "save",
          name: "Place",
          lat: 38.7,
          lng: -9.1,
        });
        return id;
      });
  vi.setSystemTime(EVE);
  await t.run(async (ctx) => {
    if (withPreferences)
      await ctx.db.insert("notificationPreferences", {
        userId,
        weeklyShelfEnabled: false,
        nextDigestAt: EVE + 7 * DAY,
        timezone: "Asia/Kolkata",
        updatedAt: EVE,
        ...preferences,
      });
    if (device)
      await ctx.db.insert("notificationDevices", {
        userId,
        token: "token-a",
        platform: "ios",
        locale,
        enabled: true,
        lastSeenAt: EVE,
      });
  });
  const prepare = (now = EVE) =>
    t.mutation(internal.notifications.prepareTripEve, { tripId, now });
  const rows = () =>
    t.run((ctx) => ctx.db.query("tripEveReminders").order("asc").collect());
  const jobs = (pattern: RegExp) =>
    t
      .run((ctx) => ctx.db.system.query("_scheduled_functions").collect())
      .then((all) => all.filter((job) => pattern.test(job.name)));
  return { t, user, userId, tripId, newerTripId, prepare, rows, jobs };
}

describe("choosing the trip eve push", () => {
  it("queues at 18:00 local the evening before, and not an hour earlier", async () => {
    const { prepare, rows, tripId, userId } = await setup();
    await prepare(EVE - HOUR);
    expect(await rows()).toEqual([]);
    await prepare();
    expect(await rows()).toMatchObject([
      { userId, tripId, createdAt: EVE, deliveryStatus: "pending" },
    ]);
  });

  it("queues exactly one push however often it is swept", async () => {
    const { prepare, rows, jobs } = await setup();
    await prepare();
    await prepare(EVE + 10 * 60 * 1000);
    await prepare(EVE + HOUR);
    expect(await rows()).toHaveLength(1);
    expect(await jobs(/notificationDelivery:sendTripEve/)).toHaveLength(1);
  });

  it.each([
    ["more than two hours late", { late: true }],
    ["a trip made after its eve", { createdAt: EVE + 1 }],
    ["a trip made that afternoon", { createdAt: EVE - 5 * HOUR }],
    ["an undated trip", { startDate: null }],
    ["no saved stops", { stops: [] }],
    [
      "only suggested stops",
      { stops: [["suggested", 1]] satisfies StopSpec[] },
    ],
    [
      "only added stops and an unplanned save",
      {
        stops: [
          ["added", 1],
          ["save", 0],
        ] satisfies StopSpec[],
      },
    ],
    ["reminders turned off", { preferences: { remindersEnabled: false } }],
    ["no device", { device: false }],
    ["no preferences row", { withPreferences: false }],
  ] as const)("sends nothing for %s", async (_name, options) => {
    const { late, ...rest } = options as { late?: boolean } & Parameters<
      typeof setup
    >[0];
    const { prepare, rows } = await setup(rest);
    await prepare(late ? EVE + 2 * HOUR : EVE);
    expect(await rows()).toEqual([]);
  });

  it("sends nothing while the server switch is off", async () => {
    const { prepare, rows, t } = await setup();
    vi.stubEnv("SAVE_REMINDERS_ENABLED", "false");
    await prepare();
    await t.mutation(internal.notifications.prepareDueTripEves, { now: EVE });
    expect(await rows()).toEqual([]);
  });

  it("counts a list stop as a saved place", async () => {
    const { prepare, rows } = await setup({ stops: [["list", 2]] });
    await prepare();
    expect(await rows()).toHaveLength(1);
  });

  it("sends one push when two trips start the same day, for the newest, whichever runs first", async () => {
    const {
      t,
      newerTripId: newer,
      prepare,
      rows,
    } = await setup({ newerTrip: true });
    await prepare();
    expect(await rows()).toEqual([]);
    await t.mutation(internal.notifications.prepareTripEve, {
      tripId: newer!,
      now: EVE,
    });
    await prepare();
    expect(await rows()).toMatchObject([{ tripId: newer }]);
  });

  it("lets the older trip push when the newer one has no saved stops", async () => {
    const {
      t,
      tripId,
      newerTripId: newer,
      prepare,
      rows,
    } = await setup({ newerTrip: true });
    await t.run(async (ctx) => {
      const stops = await ctx.db
        .query("tripStops")
        .withIndex("by_trip_and_day", (q) => q.eq("tripId", newer!))
        .collect();
      await Promise.all(stops.map((stop) => ctx.db.delete(stop._id)));
    });
    await prepare();
    expect(await rows()).toMatchObject([{ tripId }]);
  });

  it("lets the older trip push when the newer one was made that afternoon", async () => {
    const { t, userId, tripId, prepare, rows } = await setup();
    await t.run(async (ctx) => {
      const id = await ctx.db.insert("tripPlans", {
        userId,
        city: "Porto",
        startDate: START,
        dayCount: 2,
        pace: "balanced",
        interests: [],
        stopCount: 1,
        savedCount: 1,
      });
      await ctx.db.insert("tripStops", {
        tripId: id,
        userId,
        day: 1,
        order: 0,
        source: "save",
        name: "Place",
        lat: 38.7,
        lng: -9.1,
      });
    });
    await prepare();
    expect(await rows()).toMatchObject([{ tripId }]);
  });

  it("does not stack on a save reminder sent earlier that day", async () => {
    const { t, userId, prepare, rows } = await setup({ article: true });
    await t.run(async (ctx) => {
      const item = await ctx.db.query("items").first();
      await ctx.db.insert("saveReminders", {
        userId,
        itemId: item!._id,
        kind: "read",
        createdAt: EVE - HOUR,
        deliveryStatus: "complete",
      });
    });
    await prepare();
    expect(await rows()).toEqual([]);
  });

  it("is not held by a save reminder that failed, or one from the day before", async () => {
    const { t, userId, prepare, rows } = await setup({ article: true });
    await t.run(async (ctx) => {
      const item = await ctx.db.query("items").first();
      await ctx.db.insert("saveReminders", {
        userId,
        itemId: item!._id,
        kind: "read",
        createdAt: EVE - HOUR,
        deliveryStatus: "failed",
      });
      await ctx.db.insert("saveReminders", {
        userId,
        itemId: item!._id,
        kind: "read",
        createdAt: EVE - 21 * HOUR,
        deliveryStatus: "complete",
      });
    });
    await prepare();
    expect(await rows()).toHaveLength(1);
  });

  it("sweeps only trips starting within the days around now", async () => {
    const { t, tripId, userId } = await setup();
    const farId = await t.run((ctx) =>
      ctx.db.insert("tripPlans", {
        userId,
        city: "Porto",
        startDate: "2026-10-30",
        dayCount: 2,
        pace: "balanced",
        interests: [],
        stopCount: 0,
        savedCount: 0,
      }),
    );
    await t.mutation(internal.notifications.prepareDueTripEves, { now: EVE });
    const queued = (
      await t.run((ctx) =>
        ctx.db.system.query("_scheduled_functions").collect(),
      )
    )
      .filter((job) => job.name.includes("prepareTripEve"))
      .map((job) => (job.args[0] as { tripId: Id<"tripPlans"> }).tripId);
    expect(queued).toEqual([tripId]);
    expect(queued).not.toContain(farId);
  });
});

describe("delivering the trip eve push", () => {
  async function queued(options: Parameters<typeof setup>[0] = {}) {
    const context = await setup(options);
    await context.prepare();
    const [reminder] = await context.rows();
    return { ...context, reminder };
  }

  const send = (
    t: Awaited<ReturnType<typeof queued>>["t"],
    reminderId: Id<"tripEveReminders">,
  ) => t.action(internal.notificationDelivery.sendTripEve, { reminderId });

  it("names the city and the saved places, and opens the trip", async () => {
    const { t, reminder, tripId } = await queued({
      stops: [
        ["save", 1],
        ["save", 1],
        ["list", 2],
        ["save", 2],
        ["save", 2],
        ["save", 2],
        ["suggested", 2],
      ],
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValue(json([{ status: "ok", id: "ticket-a" }]));
    vi.stubGlobal("fetch", fetchMock);
    await send(t, reminder._id);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual([
      {
        to: "token-a",
        title: "Your Lisbon trip is tomorrow",
        body: "You saved 6 places to go.",
        data: {
          url: `/trip-plan/${tripId}`,
          kind: "trip_eve",
          notificationId: reminder._id,
        },
        sound: "default",
        channelId: "save-reminders",
      },
    ]);
  });

  it("records one send event once the receipt settles", async () => {
    const { t, reminder, userId } = await queued({
      stops: [
        ["save", 1],
        ["save", 2],
      ],
    });
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(json([{ status: "ok", id: "ticket-a" }]))
        .mockResolvedValue(json({ "ticket-a": { status: "ok" } })),
    );
    await send(t, reminder._id);
    const row = await t.run((ctx) => ctx.db.get(reminder._id));
    vi.setSystemTime(row!.deliveryNextAttemptAt!);
    await send(t, reminder._id);
    await send(t, reminder._id);
    const telemetry = (
      await t.run((ctx) =>
        ctx.db.system.query("_scheduled_functions").collect(),
      )
    ).filter((job) => job.name.includes("captureNotification"));
    expect(telemetry).toHaveLength(1);
    expect(telemetry[0].args[0]).toMatchObject({
      userId,
      notificationId: reminder._id,
      kind: "trip_eve",
      itemCount: 2,
      delivered: true,
    });
  });

  it("uses the singular for one place", async () => {
    const { t, reminder } = await queued();
    const fetchMock = vi
      .fn()
      .mockResolvedValue(json([{ status: "ok", id: "ticket-a" }]));
    vi.stubGlobal("fetch", fetchMock);
    await send(t, reminder._id);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)[0].body).toBe(
      "You saved 1 place to go.",
    );
  });

  it("speaks the device's language", async () => {
    const { t, reminder } = await queued({
      locale: "fr",
      stops: [
        ["save", 1],
        ["save", 1],
      ],
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValue(json([{ status: "ok", id: "ticket-a" }]));
    vi.stubGlobal("fetch", fetchMock);
    await send(t, reminder._id);
    const [message] = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(message).toMatchObject({
      title: "Votre voyage à Lisbon est demain",
      body: "Vous avez enregistré 2 lieux à visiter.",
      data: { kind: "trip_eve" },
    });
  });

  it("closes without a push when the trip was deleted after it was queued", async () => {
    const { t, reminder, tripId } = await queued();
    await t.run(async (ctx) => {
      for (const stop of await ctx.db.query("tripStops").collect())
        await ctx.db.delete(stop._id);
      await ctx.db.delete(tripId);
    });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await send(t, reminder._id);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await t.run((ctx) => ctx.db.get(reminder._id))).toMatchObject({
      deliveryStatus: "failed",
      deliveryError: "no_items",
    });
  });

  it("closes without a push when every saved stop was removed", async () => {
    const { t, reminder } = await queued();
    await t.run(async (ctx) => {
      for (const stop of await ctx.db.query("tripStops").collect())
        await ctx.db.patch(stop._id, { day: 0 });
    });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await send(t, reminder._id);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await t.run((ctx) => ctx.db.get(reminder._id))).toMatchObject({
      deliveryStatus: "failed",
      deliveryError: "no_items",
    });
  });

  it("closes without a push once the user turns reminders off", async () => {
    const { t, reminder, userId } = await queued();
    await t.run(async (ctx) => {
      const row = await ctx.db
        .query("notificationPreferences")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .unique();
      await ctx.db.patch(row!._id, { remindersEnabled: false });
    });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await send(t, reminder._id);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await t.run((ctx) => ctx.db.get(reminder._id))).toMatchObject({
      deliveryStatus: "failed",
      deliveryError: "notifications_disabled",
    });
  });

  it("gives up before the evening is over, so tomorrow never arrives on the day", async () => {
    const { t, reminder, rows } = await queued();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.setSystemTime(reminder.createdAt + 3 * HOUR);
    await send(t, reminder._id);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await rows()).toMatchObject([
      { deliveryStatus: "failed", deliveryError: "expired" },
    ]);
  });

  it("is picked up again by recovery when a send never finished", async () => {
    const { t, reminder } = await queued();
    await t.mutation(internal.notificationDelivery.recover, {});
    const jobs = await t.run((ctx) =>
      ctx.db.system.query("_scheduled_functions").collect(),
    );
    expect(
      jobs.filter((job) => job.name.includes("sendTripEve")).length,
    ).toBeGreaterThanOrEqual(2);
    expect(reminder.deliveryStatus).toBe("pending");
  });
});

describe("sharing the budget with save reminders", () => {
  async function withSaves() {
    const context = await setup({ article: true });
    const remind = async (now: number) => {
      vi.setSystemTime(now);
      await context.t.run(async (ctx) => {
        const row = await ctx.db
          .query("notificationPreferences")
          .withIndex("by_user", (q) => q.eq("userId", context.userId))
          .unique();
        await ctx.db.patch(row!._id, { nextReminderAt: now });
      });
      await context.t.mutation(internal.notifications.prepareSaveReminder, {
        userId: context.userId,
        now,
      });
      return context.t.run((ctx) => ctx.db.query("saveReminders").collect());
    };
    return { ...context, remind };
  }

  it("holds a save reminder due within 20 hours before the eve", async () => {
    const { remind } = await withSaves();
    expect(await remind(EVE - 19 * HOUR)).toEqual([]);
  });

  it("lets a save reminder go earlier than that", async () => {
    const { remind } = await withSaves();
    expect(await remind(EVE - 21 * HOUR)).toHaveLength(1);
  });

  it("holds the evening of the eve, and waits 20 hours after the push", async () => {
    const { remind, prepare } = await withSaves();
    await prepare();
    expect(await remind(EVE + 10 * HOUR)).toEqual([]);
    expect(await remind(EVE + 21 * HOUR)).toHaveLength(1);
  });

  it("is not held by a trip that will never push", async () => {
    const { remind, t, userId } = await withSaves();
    await t.run(async (ctx) => {
      const trips = await ctx.db
        .query("tripPlans")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect();
      for (const trip of trips)
        await ctx.db.patch(trip._id, { startDate: undefined });
    });
    expect(await remind(EVE - 10 * HOUR)).toHaveLength(1);
  });
});

describe("account deletion", () => {
  it("drains the push rows with the account", async () => {
    const { prepare, rows, user } = await setup();
    await prepare();
    expect(await rows()).toHaveLength(1);
    await user.mutation(api.users.deleteCurrentUserAccount, {});
    expect(await rows()).toEqual([]);
  });
});
