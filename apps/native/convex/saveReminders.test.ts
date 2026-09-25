// @vitest-environment edge-runtime
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { newConvexTest } from "./test.setup";

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse("2026-09-25T18:00:00Z");
const USER = "user-a";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.stubEnv("SAVE_REMINDERS_ENABLED", "true");
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const article = {
  type: "link" as const,
  title: "Why bread rises",
  content: "A long read about yeast.",
};
const recipe = {
  type: "link" as const,
  title: "The best lasagna recipe you will ever make",
  recipe: { name: "Lasagna", ingredients: ["pasta"], steps: ["bake"] },
};

type Save = [
  daysAgo: number,
  fields: Partial<Doc<"items">> & Pick<Doc<"items">, "type">,
];

/**
 * Seeds the user's saves, then their preferences and device at NOW. Saves go
 * in oldest first: the test database never lets a document's creation time
 * run backwards, so a save back-dated after a newer insert would land at NOW.
 */
async function setup({
  device = true,
  preferences = {},
  saves = [],
}: {
  device?: boolean;
  preferences?: Partial<Doc<"notificationPreferences">>;
  saves?: Save[];
} = {}) {
  const t = newConvexTest();
  const ids: Id<"items">[] = [];
  const order = saves
    .map((save, index) => ({ save, index }))
    .sort((a, b) => b.save[0] - a.save[0]);
  for (const {
    save: [daysAgo, fields],
    index,
  } of order) {
    vi.setSystemTime(NOW - daysAgo * DAY);
    ids[index] = await t.run((ctx) =>
      ctx.db.insert("items", {
        userId: USER,
        status: "ready",
        tags: [],
        searchText: "",
        ...fields,
      }),
    );
  }
  vi.setSystemTime(NOW);
  await t.run(async (ctx) => {
    await ctx.db.insert("notificationPreferences", {
      userId: USER,
      weeklyShelfEnabled: false,
      nextDigestAt: NOW + 7 * DAY,
      timezone: "UTC",
      nextReminderAt: NOW,
      updatedAt: NOW,
      ...preferences,
    });
    if (device)
      await ctx.db.insert("notificationDevices", {
        userId: USER,
        token: "token-a",
        platform: "ios",
        locale: "en",
        enabled: true,
        lastSeenAt: NOW,
      });
  });
  const prepare = (now = NOW) =>
    t.mutation(internal.notifications.prepareSaveReminder, {
      userId: USER,
      now,
    });
  /** Makes the user due again at `now`, as the next day's cron tick would. */
  const due = (now: number) =>
    t.run(async (ctx) => {
      const row = await ctx.db
        .query("notificationPreferences")
        .withIndex("by_user", (q) => q.eq("userId", USER))
        .unique();
      await ctx.db.patch(row!._id, { nextReminderAt: now });
    });
  const reminders = () =>
    t.run((ctx) => ctx.db.query("saveReminders").order("asc").collect());
  const preferencesRow = () =>
    t.run((ctx) =>
      ctx.db
        .query("notificationPreferences")
        .withIndex("by_user", (q) => q.eq("userId", USER))
        .unique(),
    );
  const open = (itemId: Id<"items">, at: number) =>
    t.run((ctx) =>
      ctx.db.insert("itemReads", {
        userId: USER,
        itemId,
        firstOpenedAt: at,
        lastOpenedAt: at,
      }),
    );
  return { t, ids, prepare, due, reminders, preferencesRow, open };
}

const json = (data: unknown) =>
  new Response(JSON.stringify({ data }), { status: 200 });

describe("choosing a save reminder", () => {
  it("names an unread article a day after it was saved, and books tomorrow", async () => {
    const { ids, prepare, reminders, preferencesRow } = await setup({
      saves: [[2, article]],
    });
    const [itemId] = ids;
    await prepare();
    expect(await reminders()).toMatchObject([
      { itemId, kind: "read", deliveryStatus: "pending", createdAt: NOW },
    ]);
    expect((await preferencesRow())?.nextReminderAt).toBe(NOW + DAY);
  });

  it("gives a fresh save a day, and never names an opened article", async () => {
    const { ids, prepare, reminders, open } = await setup({
      saves: [
        [0.5, article],
        [3, article],
      ],
    });
    await open(ids[1], NOW - DAY);
    await prepare();
    expect(await reminders()).toEqual([]);
  });

  it("offers a recipe once an article has had its turn", async () => {
    const { ids, prepare, due, reminders } = await setup({
      saves: [
        [2, article],
        [3, { ...article, title: "Another long read" }],
        [40, recipe],
      ],
    });
    const lasagna = ids[2];
    await prepare();
    await due(NOW + DAY);
    await prepare(NOW + DAY);
    const sent = await reminders();
    expect(sent.map((reminder) => reminder.kind)).toEqual(["read", "cook"]);
    expect(sent[1].itemId).toBe(lasagna);
  });

  it("never reminds about the same save twice", async () => {
    const { prepare, due, reminders } = await setup({ saves: [[2, article]] });
    await prepare();
    await due(NOW + DAY);
    await prepare(NOW + DAY);
    expect(await reminders()).toHaveLength(1);
  });

  it("stays quiet on a day the weekly shelf already went out", async () => {
    const { t, prepare, reminders, preferencesRow } = await setup({
      saves: [[2, article]],
    });
    await t.run((ctx) =>
      ctx.db.insert("weeklyDigests", {
        userId: USER,
        weekStart: NOW,
        itemIds: [],
        createdAt: NOW - 9 * 60 * 60 * 1000,
        deliveryStatus: "complete",
      }),
    );
    await prepare();
    expect(await reminders()).toEqual([]);
    // Still booked for tomorrow: the budget skips a day, not the user.
    expect((await preferencesRow())?.nextReminderAt).toBe(NOW + DAY);
  });

  it("slows down after three ignored reminders and recovers on an open", async () => {
    const { t, ids, prepare, due, reminders, open } = await setup({
      saves: [
        [2, article],
        [12, article],
        [13, article],
        [14, article],
      ],
    });
    const ignored = ids.slice(1);
    await t.run(async (ctx) => {
      for (const [index, itemId] of ignored.entries())
        await ctx.db.insert("saveReminders", {
          userId: USER,
          itemId,
          kind: "read",
          createdAt: NOW - (index + 2) * DAY,
          deliveryStatus: "complete",
        });
    });
    await prepare();
    expect(await reminders()).toHaveLength(3);
    await open(ignored[0], NOW - DAY);
    await due(NOW);
    await prepare();
    expect(await reminders()).toHaveLength(4);
  });

  it("leaves out saves it cannot name an action for", async () => {
    const { prepare, reminders } = await setup({
      saves: [
        [2, { type: "note", title: "Groceries", content: "eggs" }],
        [
          2,
          {
            ...article,
            media: [{ kind: "video", imageUrl: "https://x", aspectRatio: 1 }],
          },
        ],
        [2, { ...article, enrichment: "partial" }],
      ],
    });
    await prepare();
    expect(await reminders()).toEqual([]);
  });
});

describe("reminder preferences", () => {
  it("parks a user who is off or unreachable until a device registers", async () => {
    const off = await setup({ preferences: { remindersEnabled: false } });
    await off.prepare();
    expect((await off.preferencesRow())?.nextReminderAt).toBeUndefined();

    const { t, prepare, preferencesRow, reminders } = await setup({
      device: false,
      saves: [[2, article]],
    });
    await prepare();
    expect((await preferencesRow())?.nextReminderAt).toBeUndefined();
    expect(await reminders()).toEqual([]);

    await t
      .withIdentity({ subject: `${USER}|session-1` })
      .mutation(api.notifications.registerDevice, {
        token: "token-b",
        platform: "android",
      });
    expect((await preferencesRow())?.nextReminderAt).toBe(NOW + DAY);
  });

  it("turns reminders on and off from the client", async () => {
    const t = newConvexTest();
    const user = t.withIdentity({ subject: `${USER}|session-1` });
    const read = () => user.query(api.notifications.getPreferences, {});
    expect((await read()).remindersEnabled).toBe(false);
    await user.mutation(api.notifications.registerDevice, {
      token: "token-a",
      platform: "ios",
      timezone: "Asia/Kolkata",
    });
    expect((await read()).remindersEnabled).toBe(true);
    const row = () =>
      t.run((ctx) => ctx.db.query("notificationPreferences").unique());
    // 18:00 in Kolkata is 12:30 UTC, already past at NOW, so tomorrow's.
    expect((await row())?.nextReminderAt).toBe(
      Date.parse("2026-09-26T12:30:00Z"),
    );

    await user.mutation(api.notifications.setSaveReminders, { enabled: false });
    expect((await read()).remindersEnabled).toBe(false);
    expect((await row())?.nextReminderAt).toBeUndefined();
    // Turning the weekly shelf on leaves reminders as the user set them.
    await user.mutation(api.notifications.setPreferences, {
      weeklyShelfEnabled: true,
    });
    expect((await read()).remindersEnabled).toBe(false);

    await user.mutation(api.notifications.setSaveReminders, { enabled: true });
    expect((await read()).remindersEnabled).toBe(true);
    expect((await row())?.nextReminderAt).toBe(
      Date.parse("2026-09-26T12:30:00Z"),
    );
  });

  it("sweeps only users who are due", async () => {
    const t = newConvexTest();
    await t.run(async (ctx) => {
      for (const [userId, nextReminderAt] of [
        ["due", NOW - 1],
        ["later", NOW + 1],
        ["parked", undefined],
      ] as const)
        await ctx.db.insert("notificationPreferences", {
          userId,
          weeklyShelfEnabled: false,
          nextDigestAt: NOW,
          nextReminderAt,
          updatedAt: NOW,
        });
    });
    await t.mutation(internal.notifications.prepareDueSaveReminders, {});
    const jobs = await t.run((ctx) =>
      ctx.db.system.query("_scheduled_functions").collect(),
    );
    expect(
      jobs
        .filter((job) => job.name.includes("prepareSaveReminder"))
        .map((job) => (job.args[0] as { userId: string }).userId),
    ).toEqual(["due"]);
  });

  it("arms existing users once at deploy, leaving anyone who opted out", async () => {
    const t = newConvexTest();
    await t.run(async (ctx) => {
      for (const [userId, fields] of [
        ["before-reminders", {}],
        ["opted-out", { remindersEnabled: false }],
        ["already-armed", { nextReminderAt: NOW + 5 }],
      ] as const)
        await ctx.db.insert("notificationPreferences", {
          userId,
          weeklyShelfEnabled: true,
          nextDigestAt: NOW,
          timezone: "UTC",
          updatedAt: NOW,
          ...fields,
        });
    });
    await t.mutation(internal.notifications.armSaveReminders, {});
    const rows = await t.run((ctx) =>
      ctx.db.query("notificationPreferences").collect(),
    );
    expect(
      Object.fromEntries(rows.map((row) => [row.userId, row.nextReminderAt])),
    ).toEqual({
      "before-reminders": NOW + DAY,
      "opted-out": undefined,
      "already-armed": NOW + 5,
    });
  });

  it("drains reminders with the account", async () => {
    const { t, prepare, reminders } = await setup({ saves: [[2, article]] });
    await prepare();
    expect(await reminders()).toHaveLength(1);
    await t
      .withIdentity({ subject: `${USER}|session-1` })
      .mutation(api.users.deleteCurrentUserAccount, {});
    expect(await reminders()).toEqual([]);
  });
});

describe("the server switch", () => {
  it.each([undefined, "false", "TRUE"])(
    "sends nothing while SAVE_REMINDERS_ENABLED is %s",
    async (value) => {
      vi.stubEnv("SAVE_REMINDERS_ENABLED", value);
      const { t, prepare, reminders, preferencesRow } = await setup({
        saves: [[2, article]],
      });
      await t.mutation(internal.notifications.prepareDueSaveReminders, {});
      await prepare();
      expect(await reminders()).toEqual([]);
      // Left armed, so turning the switch on picks the user up again.
      expect((await preferencesRow())?.nextReminderAt).toBe(NOW);
      const jobs = await t.run((ctx) =>
        ctx.db.system.query("_scheduled_functions").collect(),
      );
      expect(jobs).toEqual([]);
    },
  );

  it("stops a reminder already queued when it is turned off", async () => {
    const { t, prepare, reminders } = await setup({ saves: [[2, article]] });
    await prepare();
    const [reminder] = await reminders();
    vi.stubEnv("SAVE_REMINDERS_ENABLED", "false");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await t.action(internal.notificationDelivery.sendReminder, {
      reminderId: reminder._id,
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await t.run((ctx) => ctx.db.get(reminder._id))).toMatchObject({
      deliveryStatus: "failed",
      deliveryError: "reminders_paused",
    });
  });

  it("books the next slot instead of sending off-hours after a backlog", async () => {
    // Armed long before the switch turned on: due, but hours past its slot.
    const { prepare, reminders, preferencesRow } = await setup({
      saves: [[2, article]],
      preferences: { nextReminderAt: NOW - 3 * 60 * 60 * 1000 },
    });
    await prepare();
    expect(await reminders()).toEqual([]);
    expect((await preferencesRow())?.nextReminderAt).toBe(NOW + DAY);
  });

  it("still sends a pass that is only as late as the hourly cron", async () => {
    const { prepare, reminders } = await setup({
      saves: [[2, article]],
      preferences: { nextReminderAt: NOW - 59 * 60 * 1000 },
    });
    await prepare();
    expect(await reminders()).toHaveLength(1);
  });
});

describe("delivering a save reminder", () => {
  async function queued(kind: "read" | "cook" = "read") {
    const context = await setup({
      saves: [kind === "read" ? [2, article] : [40, recipe]],
    });
    await context.prepare();
    const [reminder] = await context.reminders();
    return { ...context, reminder };
  }

  it("names the save, links straight to it, and tags the kind", async () => {
    const { t, reminder } = await queued();
    const fetchMock = vi
      .fn()
      .mockResolvedValue(json([{ status: "ok", id: "ticket-a" }]));
    vi.stubGlobal("fetch", fetchMock);
    await t.action(internal.notificationDelivery.sendReminder, {
      reminderId: reminder._id,
    });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual([
      {
        to: "token-a",
        title: "Still on your list",
        body: "You haven’t read “Why bread rises” yet.",
        data: {
          url: `/item/${reminder.itemId}`,
          kind: "read_reminder",
          notificationId: reminder._id,
        },
        sound: "default",
        channelId: "save-reminders",
      },
    ]);
  });

  it("asks about the dish in the device's language", async () => {
    const { t, reminder } = await queued("cook");
    await t.run(async (ctx) => {
      const device = await ctx.db.query("notificationDevices").unique();
      await ctx.db.patch(device!._id, { locale: "ja" });
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValue(json([{ status: "ok", id: "ticket-a" }]));
    vi.stubGlobal("fetch", fetchMock);
    await t.action(internal.notificationDelivery.sendReminder, {
      reminderId: reminder._id,
    });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)[0]).toMatchObject({
      body: "今日は「Lasagna」を作ってみませんか？",
      data: { kind: "cook_reminder" },
    });
  });

  it("records one send event once the receipt settles", async () => {
    const { t, reminder } = await queued();
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(json([{ status: "ok", id: "ticket-a" }]))
        .mockResolvedValue(json({ "ticket-a": { status: "ok" } })),
    );
    const send = () =>
      t.action(internal.notificationDelivery.sendReminder, {
        reminderId: reminder._id,
      });
    const telemetry = async () =>
      (
        await t.run((ctx) =>
          ctx.db.system.query("_scheduled_functions").collect(),
        )
      ).filter((job) => job.name.includes("captureNotification"));
    await send();
    expect(await telemetry()).toHaveLength(0);
    const row = await t.run((ctx) => ctx.db.get(reminder._id));
    vi.setSystemTime(row!.deliveryNextAttemptAt!);
    await send();
    await send();
    const jobs = await telemetry();
    expect(jobs).toHaveLength(1);
    expect(jobs[0].args[0]).toMatchObject({
      userId: USER,
      notificationId: reminder._id,
      kind: "read_reminder",
      itemCount: 1,
      delivered: true,
    });
    expect(await t.run((ctx) => ctx.db.get(reminder._id))).toMatchObject({
      deliveryStatus: "complete",
    });
  });

  it("sends nothing for a save deleted or a switch turned off since", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const deleted = await queued();
    await deleted.t.run((ctx) => ctx.db.delete(deleted.reminder.itemId));
    await deleted.t.action(internal.notificationDelivery.sendReminder, {
      reminderId: deleted.reminder._id,
    });
    expect(
      await deleted.t.run((ctx) => ctx.db.get(deleted.reminder._id)),
    ).toMatchObject({ deliveryStatus: "failed", deliveryError: "no_items" });

    const off = await queued();
    await off.t.run(async (ctx) => {
      const row = await ctx.db.query("notificationPreferences").unique();
      await ctx.db.patch(row!._id, { remindersEnabled: false });
    });
    await off.t.action(internal.notificationDelivery.sendReminder, {
      reminderId: off.reminder._id,
    });
    expect(
      await off.t.run((ctx) => ctx.db.get(off.reminder._id)),
    ).toMatchObject({
      deliveryStatus: "failed",
      deliveryError: "notifications_disabled",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("drops a reminder that could not go out the same day", async () => {
    const { t, reminder } = await queued();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const send = () =>
      t.action(internal.notificationDelivery.sendReminder, {
        reminderId: reminder._id,
      });
    await send();
    vi.setSystemTime(NOW + 6 * 60 * 60 * 1000);
    await send();
    expect(await t.run((ctx) => ctx.db.get(reminder._id))).toMatchObject({
      deliveryStatus: "failed",
      deliveryError: "retry_limit_reached",
    });
  });
});
